/**
 * Account self-service tests — N-07, N-08 (PRD §8.9)
 *
 * Covers:
 *  - PATCH /auth/me        — update own display name
 *  - POST  /auth/change-password — verify current password, enforce policy, update hash + invalidate sessions
 *
 * Auth middleware is mocked so we can inject any user context without a real JWT.
 */

import request from 'supertest';
import { createApp } from '../../app';

const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// ─── Auth middleware ──────────────────────────────────────────────────────────

jest.mock('../../middleware/auth', () => {
  const original = jest.requireActual('../../middleware/auth');
  return {
    ...original,
    authenticate: jest.fn((req: { user: unknown }, _res: unknown, next: () => void) => {
      req.user = (global as unknown as Record<string, unknown>).__accountTestUser ?? {
        id: USER_ID, role: 'head_coach', tokenVersion: 0,
      };
      next();
    }),
    injectTeamScope: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
    requireRole: original.requireRole,
  };
});

function setUser(role: string) {
  (global as unknown as Record<string, unknown>).__accountTestUser = {
    id: USER_ID, role, tokenVersion: 0,
  };
}

// ─── Service mocks ────────────────────────────────────────────────────────────

jest.mock('../../services/AuthService', () => ({
  login:             jest.fn(),
  verifyPassword:    jest.fn().mockResolvedValue(true),
  hashPassword:      jest.fn().mockResolvedValue('$2b$10$newhashvalue'),
  verifyAccessToken: jest.fn(),
  AuthError: class AuthError extends Error {
    constructor(msg: string, public statusCode: number) { super(msg); }
  },
  signAccessToken:      jest.fn(() => 'mock.access.token'),
  generateRefreshToken: jest.fn(() => 'mock-refresh-token'),
  refreshTokenExpiry:   jest.fn(() => new Date(Date.now() + 86_400_000)),
  invalidateConfigCache: jest.fn(),
}));

jest.mock('../../services/UserService', () => ({
  activateAccount:       jest.fn(),
  resetPassword:         jest.fn(),
  forceAllPasswordResets: jest.fn(),
}));

// DB mock — returns a sensible user row and config rows by default
// Access mocked AuthService functions via require (avoids hoisting issues)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const AuthService = require('../../services/AuthService') as {
  verifyPassword: jest.Mock;
  hashPassword:   jest.Mock;
};

const USER_ROW = {
  id: USER_ID, fullName: 'Coach Smith', email: 'coach@jrc.com',
  passwordHash: '$2b$10$existinghashvalue',
  tokenVersion: 0, isActive: true, role: 'head_coach',
};

// Default config rows — empty means route uses default min length (8)
const CONFIG_ROWS: unknown[] = [];

/**
 * Returns a thenable that resolves to `immediateRows` when awaited directly
 * (e.g. db.select().from(config)), AND has a .where() → { limit() } chain
 * for queries that do db.select().from(table).where().limit().
 */
function makeFrom(immediateRows: unknown[], whereRows: unknown[]) {
  const p = Promise.resolve(immediateRows) as Promise<unknown[]> & {
    where: jest.Mock;
    orderBy: jest.Mock;
  };
  p.where = jest.fn(() => ({
    limit: jest.fn(() => Promise.resolve(whereRows)),
    orderBy: jest.fn(() => ({ limit: jest.fn(() => Promise.resolve(whereRows)) })),
  }));
  p.orderBy = jest.fn(() => ({ limit: jest.fn(() => Promise.resolve(immediateRows)) }));
  return p;
}

const mockDbSet = jest.fn(() => ({ where: jest.fn(() => Promise.resolve()) }));

// selectFrom is called by the mock's from(); default: user row for .where() queries,
// config rows for direct-await queries.
const mockSelectFrom = jest.fn(() => makeFrom(CONFIG_ROWS, [USER_ROW]));

jest.mock('../../db', () => ({
  db: {
    select: jest.fn(() => ({ from: jest.fn(() => mockSelectFrom()) })),
    update: jest.fn(() => ({ set: mockDbSet })),
    insert: jest.fn(() => ({ values: jest.fn(() => ({ returning: jest.fn(() => Promise.resolve([{ id: 'new' }])) })) })),
  },
  users:  {},
  config: {},
  seasons: {}, offers: {}, players: {}, activityLog: {},
  userTeamAssignments: {}, teams: {}, emailTemplates: {}, seSyncLog: {}, wizardProgress: {},
  integrations: {},
}));

const app = createApp();

// ─── PATCH /auth/me — update display name ─────────────────────────────────────

describe('PATCH /api/v1/auth/me — update display name (N-07)', () => {
  beforeEach(() => { setUser('head_coach'); jest.clearAllMocks(); });

  it('returns 200 and updates name for valid input', async () => {
    const res = await request(app)
      .patch('/api/v1/auth/me')
      .send({ fullName: 'Coach Updated' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('returns 400 for empty fullName', async () => {
    const res = await request(app)
      .patch('/api/v1/auth/me')
      .send({ fullName: '' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing fullName field', async () => {
    const res = await request(app)
      .patch('/api/v1/auth/me')
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 for fullName exceeding 100 characters', async () => {
    const res = await request(app)
      .patch('/api/v1/auth/me')
      .send({ fullName: 'A'.repeat(101) });
    expect(res.status).toBe(400);
  });

  it('accepts exactly 100 characters', async () => {
    const res = await request(app)
      .patch('/api/v1/auth/me')
      .send({ fullName: 'A'.repeat(100) });
    expect(res.status).toBe(200);
  });

  it('is accessible to all roles — head_coach', async () => {
    setUser('head_coach');
    const res = await request(app).patch('/api/v1/auth/me').send({ fullName: 'HC Name' });
    expect(res.status).toBe(200);
  });

  it('is accessible to all roles — assistant_coach', async () => {
    setUser('assistant_coach');
    const res = await request(app).patch('/api/v1/auth/me').send({ fullName: 'AC Name' });
    expect(res.status).toBe(200);
  });

  it('is accessible to all roles — admin', async () => {
    setUser('admin');
    const res = await request(app).patch('/api/v1/auth/me').send({ fullName: 'Admin Name' });
    expect(res.status).toBe(200);
  });

  it('returns 401 without authentication', async () => {
    // Simulate missing auth by having authenticate throw 401
    const { authenticate } = require('../../middleware/auth');
    authenticate.mockImplementationOnce((_req: unknown, res: { status: (c: number) => { json: (b: unknown) => void } }, _next: unknown) => {
      res.status(401).json({ error: 'Missing or malformed Authorization header' });
    });
    const res = await request(app).patch('/api/v1/auth/me').send({ fullName: 'Name' });
    expect(res.status).toBe(401);
  });
});

// ─── POST /auth/change-password ───────────────────────────────────────────────

describe('POST /api/v1/auth/change-password — self-service password change (N-08)', () => {
  beforeEach(() => {
    setUser('head_coach');
    jest.clearAllMocks();
    AuthService.verifyPassword.mockResolvedValue(true);
    AuthService.hashPassword.mockResolvedValue('$2b$10$newhashvalue');
    // Reset mockSelectFrom to default (user row for .where(), empty config for direct await)
    mockSelectFrom.mockReturnValue(makeFrom(CONFIG_ROWS, [USER_ROW]));
    mockDbSet.mockReturnValue({ where: jest.fn(() => Promise.resolve()) });
  });

  it('returns 200 and updates password for valid current + new password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: 'OldPass1!', newPassword: 'NewPass1!' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.message).toMatch(/updated/i);
  });

  it('returns 400 for missing currentPassword', async () => {
    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .send({ newPassword: 'NewPass1!' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing newPassword', async () => {
    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: 'OldPass1!' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when current password is incorrect', async () => {
    AuthService.verifyPassword.mockResolvedValueOnce(false);
    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: 'WrongPass!', newPassword: 'NewPass1!' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/current password/i);
  });

  it('returns 400 when new password is below minimum length', async () => {
    // "short" has 5 chars, default policy min is 8 — no extra mocking needed
    AuthService.verifyPassword.mockResolvedValueOnce(true);

    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: 'OldPass1!', newPassword: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least/i);
  });

  it('increments token_version to invalidate other sessions on success', async () => {
    const { db } = require('../../db');
    const mockSetFn = jest.fn(() => ({ where: jest.fn(() => Promise.resolve()) }));
    db.update.mockReturnValueOnce({ set: mockSetFn });

    await request(app)
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: 'OldPass1!', newPassword: 'NewPass1!' });

    // update() was called — verify tokenVersion was incremented in the set payload
    expect(db.update).toHaveBeenCalled();
    const call = (mockSetFn.mock.calls as unknown[][])[0];
    const setArg = call?.[0] as Record<string, unknown> | undefined;
    expect(setArg).toBeDefined();
    // tokenVersion should be current (0) + 1 = 1
    expect(setArg?.tokenVersion).toBe(1);
  });

  it('is accessible to all roles — board', async () => {
    setUser('board');
    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: 'OldPass1!', newPassword: 'NewPass1!' });
    expect(res.status).toBe(200);
  });

  it('returns 401 without authentication', async () => {
    const { authenticate } = require('../../middleware/auth');
    authenticate.mockImplementationOnce((_req: unknown, res: { status: (c: number) => { json: (b: unknown) => void } }, _next: unknown) => {
      res.status(401).json({ error: 'Missing or malformed Authorization header' });
    });
    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: 'OldPass1!', newPassword: 'NewPass1!' });
    expect(res.status).toBe(401);
  });
});

// ─── GET /auth/me — existing endpoint, extended coverage ─────────────────────

describe('GET /api/v1/auth/me — read own profile (N-07)', () => {
  beforeEach(() => { setUser('admin'); jest.clearAllMocks(); });

  it('returns the current user profile', async () => {
    const { db } = require('../../db');
    db.select.mockReturnValueOnce({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(() => Promise.resolve([{
            id: USER_ID, fullName: 'Admin User', email: 'admin@jrc.com', role: 'admin',
          }])),
        })),
      })),
    });
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBeDefined();
    expect(res.body.user.role).toBeDefined();
  });

  it('returns 401 without authentication', async () => {
    const { authenticate } = require('../../middleware/auth');
    authenticate.mockImplementationOnce((_req: unknown, res: { status: (c: number) => { json: (b: unknown) => void } }, _next: unknown) => {
      res.status(401).json({ error: 'Missing or malformed Authorization header' });
    });
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });
});
