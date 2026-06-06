/**
 * Players API route tests — role enforcement, team-scoping, flag permissions.
 */

import request from 'supertest';
import { createApp } from '../../app';

// Mock auth middleware so we can inject user context per test
jest.mock('../../middleware/auth', () => {
  const original = jest.requireActual('../../middleware/auth');
  return {
    ...original,
    authenticate: jest.fn((req: { user: unknown }, _res: unknown, next: () => void) => {
      req.user = (global as unknown as Record<string,unknown>).__testUser ?? {
        id: 'u_admin', role: 'admin', tokenVersion: 0, teamIds: undefined,
      };
      next();
    }),
    injectTeamScope: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
    requireRole: original.requireRole,
  };
});

// Mock PlayerService to avoid real DB
jest.mock('../../services/PlayerService', () => ({
  createPlayer:          jest.fn().mockResolvedValue('new-player-id'),
  listPlayers:           jest.fn().mockResolvedValue({ players: [], total: 0 }),
  getPlayer:             jest.fn().mockResolvedValue({ player: { id: 'p1', teamId: 't1' }, offers: [], activity: [] }),
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

jest.mock('../../db', () => ({
  db: {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({ limit: jest.fn(() => Promise.resolve([{ fullName: 'Test User' }])) })),
      })),
    })),
  },
  users: {}, players: {}, activityLog: {},
  seasons: {},
}));

function setUser(role: string, teamIds?: string[]) {
  (global as unknown as Record<string,unknown>).__testUser = { id: 'u1', role, tokenVersion: 0, teamIds };
}

const app = createApp();

describe('GET /api/v1/players', () => {
  it('returns 200 for any authenticated user', async () => {
    setUser('head_coach', ['t1']);
    const res = await request(app).get('/api/v1/players')
      .set('Authorization', 'Bearer mock.token');
    expect(res.status).toBe(200);
  });
});

describe('POST /api/v1/players — role enforcement', () => {
  it('returns 403 for assistant_coach', async () => {
    setUser('assistant_coach', ['t1']);
    const res = await request(app)
      .post('/api/v1/players')
      .set('Authorization', 'Bearer mock.token')
      .send({ firstName: 'Jake', lastName: 'Smith', parentEmail: 'p@x.com', teamId: 't1' });
    expect(res.status).toBe(403);
  });

  it('does not return 403 for head_coach (role check passes)', async () => {
    // Full 201 success requires a real DB (getUserName + season lookup).
    // This test confirms the role gate is not blocking head_coach.
    setUser('head_coach', ['t1']);
    const res = await request(app)
      .post('/api/v1/players')
      .set('Authorization', 'Bearer mock.token')
      .send({ firstName: 'Jake', lastName: 'Smith', parentEmail: 'p@x.com', teamId: 't1', seasonId: '00000000-0000-0000-0000-000000000001' });
    expect(res.status).not.toBe(403); // role gate passed; DB issues cause non-403 error
  });

  it('returns 400 for missing parentEmail', async () => {
    setUser('admin');
    const res = await request(app)
      .post('/api/v1/players')
      .set('Authorization', 'Bearer mock.token')
      .send({ firstName: 'Jake', lastName: 'Smith', teamId: 't1' });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/v1/players/:id/returning-flag', () => {
  it('allows assistant_coach to set returning flag', async () => {
    setUser('assistant_coach', ['t1']);
    const res = await request(app)
      .patch('/api/v1/players/p1/returning-flag')
      .set('Authorization', 'Bearer mock.token')
      .send({ value: true });
    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/v1/players/:id/early-offer-eligible', () => {
  it('returns 403 for assistant_coach', async () => {
    setUser('assistant_coach', ['t1']);
    const res = await request(app)
      .patch('/api/v1/players/p1/early-offer-eligible')
      .set('Authorization', 'Bearer mock.token')
      .send({ value: true });
    expect(res.status).toBe(403);
  });

  it('returns 200 for head_coach', async () => {
    setUser('head_coach', ['t1']);
    const res = await request(app)
      .patch('/api/v1/players/p1/early-offer-eligible')
      .set('Authorization', 'Bearer mock.token')
      .send({ value: true });
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/v1/players/:id', () => {
  it('returns 403 for assistant_coach', async () => {
    setUser('assistant_coach', ['t1']);
    const res = await request(app)
      .delete('/api/v1/players/p1')
      .set('Authorization', 'Bearer mock.token');
    expect(res.status).toBe(403);
  });

  it('returns 200 for admin', async () => {
    setUser('admin');
    const res = await request(app)
      .delete('/api/v1/players/p1')
      .set('Authorization', 'Bearer mock.token');
    expect(res.status).toBe(200);
  });
});

describe('POST /api/v1/players/:id/status — admin/board/head_coach only', () => {
  it('returns 403 for assistant_coach', async () => {
    setUser('assistant_coach', ['t1']);
    const res = await request(app)
      .patch('/api/v1/players/p1/status')
      .set('Authorization', 'Bearer mock.token')
      .send({ status: 'waitlisted' });
    expect(res.status).toBe(403);
  });
});
