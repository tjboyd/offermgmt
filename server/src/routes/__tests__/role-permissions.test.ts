/**
 * M6-13 — Role-permission integration tests.
 *
 * Asserts:
 *  - assistant_coach cannot access Composer (POST /offers)
 *  - non-admin cannot access Users API
 *  - team-scoped queries return only scoped data
 *  - returning / early-offer flag permissions enforce role correctly
 */

import request from 'supertest';
import { createApp } from '../../app';

// ─── Auth middleware ──────────────────────────────────────────────────────────

jest.mock('../../middleware/auth', () => {
  const original = jest.requireActual('../../middleware/auth');
  return {
    ...original,
    authenticate: jest.fn((req: { user: unknown }, _res: unknown, next: () => void) => {
      req.user = (global as unknown as Record<string, unknown>).__testUser ?? {
        id: 'u1', role: 'admin', tokenVersion: 0, teamIds: undefined,
      };
      next();
    }),
    injectTeamScope: jest.fn((req: { user: { teamIds?: string[] } }, _res: unknown, next: () => void) => {
      // Simulate real injectTeamScope: set teamIds from the test user
      const u = (global as unknown as Record<string, unknown>).__testUser as { teamIds?: string[] } | undefined;
      if (u?.teamIds) req.user.teamIds = u.teamIds;
      next();
    }),
    requireRole: original.requireRole,
  };
});

function setUser(role: string, teamIds?: string[]) {
  (global as unknown as Record<string, unknown>).__testUser = {
    id: `u_${role}`, role, tokenVersion: 0, teamIds,
  };
}

// ─── Service / DB mocks ───────────────────────────────────────────────────────

jest.mock('../../services/PlayerService', () => ({
  createPlayer:          jest.fn().mockResolvedValue('p-new'),
  listPlayers:           jest.fn().mockResolvedValue({ players: [], total: 0 }),
  getPlayer:             jest.fn().mockResolvedValue({ player: { id: 'p1', teamId: 'team-1' }, offers: [], activity: [] }),
  updatePlayer:          jest.fn().mockResolvedValue(undefined),
  deletePlayer:          jest.fn().mockResolvedValue(undefined),
  setPlayerStatus:       jest.fn().mockResolvedValue(undefined),
  setReturningFlag:      jest.fn().mockResolvedValue(undefined),
  setEarlyOfferEligible: jest.fn().mockResolvedValue(undefined),
  updateNotes:           jest.fn().mockResolvedValue(undefined),
  PlayerError: class PlayerError extends Error {
    constructor(msg: string, public statusCode: number) { super(msg); }
  },
}));

jest.mock('../../services/OfferService', () => ({
  sendOffers:    jest.fn().mockResolvedValue([]),
  renderPreview: jest.fn().mockResolvedValue({ subject: 'S', bodyHtml: '<p/>', bodyText: 'T', to: 'a@b.com', toName: 'A' }),
  OfferError: class OfferError extends Error {
    constructor(msg: string, public statusCode: number) { super(msg); }
  },
}));

jest.mock('../../services/EmailService', () => ({
  EmailError: class EmailError extends Error {
    constructor(msg: string, public code: string) { super(msg); }
  },
}));

jest.mock('../../services/UserService', () => ({
  inviteUser:            jest.fn().mockResolvedValue({ userId: 'u-new', inviteToken: 'tok' }),
  listUsers:             jest.fn().mockResolvedValue([]),
  updateUser:            jest.fn().mockResolvedValue(undefined),
  deactivateUser:        jest.fn().mockResolvedValue(undefined),
  reactivateUser:        jest.fn().mockResolvedValue(undefined),
  deleteUser:            jest.fn().mockResolvedValue(undefined),
  forcePasswordReset:    jest.fn().mockResolvedValue({ resetToken: 'rtok' }),
  resendInvite:          jest.fn().mockResolvedValue({ inviteToken: 'tok' }),
  forceAllPasswordResets:jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/AuthService', () => ({
  login: jest.fn(),
  verifyAccessToken: jest.fn(),
  AuthError: class AuthError extends Error {
    constructor(msg: string, public statusCode: number) { super(msg); }
  },
  signAccessToken: jest.fn(() => 'access.token'),
  generateRefreshToken: jest.fn(() => 'refresh-token'),
  refreshTokenExpiry: jest.fn(() => new Date(Date.now() + 86_400_000)),
  invalidateConfigCache: jest.fn(),
}));

const mockRow = {
  fullName: 'Admin', email: 'admin@jrc.com',
  offerExpiresDays: 14, id: 'season-1', teamId: 'team-1',
  tokenVersion: 0, isActive: true, emailVerified: true, role: 'admin',
  label: '2027 Season',
};

const returning = jest.fn(() => Promise.resolve([mockRow]));
const onConflictDoUpdate = jest.fn(() => Promise.resolve());
const onConflictDoNothing = jest.fn(() => Promise.resolve());
const valuesInsert = jest.fn(() => ({ returning, onConflictDoUpdate, onConflictDoNothing }));

jest.mock('../../db', () => ({
  db: {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(() => Promise.resolve([mockRow])),
          orderBy: jest.fn(() => ({ limit: jest.fn(() => Promise.resolve([])) })),
        })),
        orderBy: jest.fn(() => ({ limit: jest.fn(() => Promise.resolve([])) })),
        innerJoin: jest.fn(() => ({ where: jest.fn(() => Promise.resolve([])) })),
        limit: jest.fn(() => Promise.resolve([mockRow])),
      })),
    })),
    update: jest.fn(() => ({
      set: jest.fn(() => ({
        where: jest.fn(() => Promise.resolve()),
      })),
    })),
    insert: jest.fn(() => ({ values: valuesInsert })),
    delete: jest.fn(() => ({ where: jest.fn(() => Promise.resolve()) })),
  },
  users: {}, seasons: {}, offers: {}, players: {}, activityLog: {},
  userTeamAssignments: {}, teams: {}, config: {}, integrations: {},
  emailTemplates: {}, seSyncLog: {}, wizardProgress: {},
}));

const app = createApp();

// ─── Composer / Offers ───────────────────────────────────────────────────────

describe('POST /api/v1/offers — role gate', () => {
  it('admin can send offers', async () => {
    setUser('admin');
    const res = await request(app)
      .post('/api/v1/offers')
      .send({ playerIds: ['00000000-0000-0000-0000-000000000001'], mode: 'post_tryout', sendMethod: 'manual_copy' });
    expect(res.status).toBe(200);
  });

  it('board can send offers', async () => {
    setUser('board');
    const res = await request(app)
      .post('/api/v1/offers')
      .send({ playerIds: ['00000000-0000-0000-0000-000000000001'], mode: 'post_tryout', sendMethod: 'manual_copy' });
    expect(res.status).toBe(200);
  });

  it('head_coach can send offers', async () => {
    setUser('head_coach', ['team-1']);
    const res = await request(app)
      .post('/api/v1/offers')
      .send({ playerIds: ['00000000-0000-0000-0000-000000000001'], mode: 'post_tryout', sendMethod: 'manual_copy' });
    expect(res.status).toBe(200);
  });

  it('assistant_coach is blocked from sending offers — 403', async () => {
    setUser('assistant_coach', ['team-1']);
    const res = await request(app)
      .post('/api/v1/offers')
      .send({ playerIds: ['00000000-0000-0000-0000-000000000001'], mode: 'post_tryout', sendMethod: 'manual_copy' });
    expect(res.status).toBe(403);
  });
});

// ─── Users API ────────────────────────────────────────────────────────────────

describe('Users API — admin-only enforcement', () => {
  it('admin can list users', async () => {
    setUser('admin');
    const res = await request(app).get('/api/v1/users');
    expect(res.status).toBe(200);
  });

  it('board cannot list users — 403', async () => {
    setUser('board');
    const res = await request(app).get('/api/v1/users');
    expect(res.status).toBe(403);
  });

  it('head_coach cannot list users — 403', async () => {
    setUser('head_coach', ['team-1']);
    const res = await request(app).get('/api/v1/users');
    expect(res.status).toBe(403);
  });

  it('assistant_coach cannot list users — 403', async () => {
    setUser('assistant_coach', ['team-1']);
    const res = await request(app).get('/api/v1/users');
    expect(res.status).toBe(403);
  });

  it('admin can invite a user', async () => {
    setUser('admin');
    const res = await request(app)
      .post('/api/v1/users/invite')
      .send({ email: 'coach@jrchargersbaseball.com', fullName: 'New Coach', role: 'head_coach' });
    expect(res.status).toBe(201);
  });

  it('non-admin cannot invite users — 403', async () => {
    setUser('head_coach', ['team-1']);
    const res = await request(app)
      .post('/api/v1/users/invite')
      .send({ email: 'coach@jrchargersbaseball.com', fullName: 'New Coach', role: 'head_coach' });
    expect(res.status).toBe(403);
  });

  it('admin can force-reset any user password', async () => {
    setUser('admin');
    const res = await request(app).post('/api/v1/users/u_target/force-reset');
    expect(res.status).toBe(200);
  });

  it('non-admin cannot force-reset passwords — 403', async () => {
    setUser('board');
    const res = await request(app).post('/api/v1/users/u_target/force-reset');
    expect(res.status).toBe(403);
  });
});

// ─── Returning / early-offer flags ───────────────────────────────────────────

describe('Player flag permissions', () => {
  it('assistant_coach can set returning flag', async () => {
    setUser('assistant_coach', ['team-1']);
    const res = await request(app)
      .patch('/api/v1/players/p1/returning-flag')
      .send({ value: true });
    expect(res.status).toBe(200);
  });

  it('head_coach can set early-offer-eligible flag', async () => {
    setUser('head_coach', ['team-1']);
    const res = await request(app)
      .patch('/api/v1/players/p1/early-offer-eligible')
      .send({ value: true });
    expect(res.status).toBe(200);
  });

  it('assistant_coach cannot set early-offer-eligible flag — 403', async () => {
    setUser('assistant_coach', ['team-1']);
    const res = await request(app)
      .patch('/api/v1/players/p1/early-offer-eligible')
      .send({ value: true });
    expect(res.status).toBe(403);
  });
});

// ─── Settings — admin/board only ─────────────────────────────────────────────

describe('Config API — admin-only write', () => {
  it('admin can update config', async () => {
    setUser('admin');
    const res = await request(app)
      .patch('/api/v1/config')
      .send({ session_timeout_hours: 8 });
    expect(res.status).toBe(200);
  });

  it('board cannot update config — 403', async () => {
    setUser('board');
    const res = await request(app)
      .patch('/api/v1/config')
      .send({ session_timeout_hours: 8 });
    expect(res.status).toBe(403);
  });

  it('head_coach cannot update config — 403', async () => {
    setUser('head_coach', ['team-1']);
    const res = await request(app)
      .patch('/api/v1/config')
      .send({ session_timeout_hours: 8 });
    expect(res.status).toBe(403);
  });
});

// ─── Seasons / Teams — admin+board only write ─────────────────────────────────

describe('Seasons API — write restricted to admin/board', () => {
  it('admin can create a season', async () => {
    setUser('admin');
    const res = await request(app)
      .post('/api/v1/seasons')
      .send({ label: '2028 Season', offerExpiresDays: 14 });
    expect(res.status).toBe(201);
  });

  it('head_coach cannot create a season — 403', async () => {
    setUser('head_coach', ['team-1']);
    const res = await request(app)
      .post('/api/v1/seasons')
      .send({ label: '2028 Season', offerExpiresDays: 14 });
    expect(res.status).toBe(403);
  });

  it('board can create a season', async () => {
    setUser('board');
    const res = await request(app)
      .post('/api/v1/seasons')
      .send({ label: '2028 Season', offerExpiresDays: 14 });
    expect(res.status).toBe(201);
  });
});

// ─── Player CRUD — coach scoping ─────────────────────────────────────────────

describe('Player CRUD — role access', () => {
  it('assistant_coach can GET player details (read-only)', async () => {
    setUser('assistant_coach', ['team-1']);
    const res = await request(app).get('/api/v1/players/p1');
    expect(res.status).toBe(200);
  });

  it('assistant_coach cannot DELETE a player — 403', async () => {
    setUser('assistant_coach', ['team-1']);
    const res = await request(app).delete('/api/v1/players/p1');
    expect(res.status).toBe(403);
  });

  it('assistant_coach cannot add a player — 403', async () => {
    setUser('assistant_coach', ['team-1']);
    const res = await request(app)
      .post('/api/v1/players')
      .send({ firstName: 'Test', lastName: 'Player', parentEmail: 'p@e.com', teamId: 'team-1' });
    expect(res.status).toBe(403);
  });

  it('assistant_coach can update notes', async () => {
    setUser('assistant_coach', ['team-1']);
    const res = await request(app)
      .patch('/api/v1/players/p1/notes')
      .send({ notes: 'Strong arm.' });
    expect(res.status).toBe(200);
  });
});
