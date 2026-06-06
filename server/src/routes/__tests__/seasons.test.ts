/**
 * Seasons API route tests.
 *
 * Covers:
 *  - seRegistrationId accepted on POST /seasons and PATCH /seasons/:id
 *  - Role enforcement: board can create/update; assistant_coach cannot
 *  - GET /seasons returns all seasons including seRegistrationId
 *  - PATCH /seasons/:id/activate, archive work
 */

import request from 'supertest';
import { createApp } from '../../app';

const ADMIN_ID  = 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001';
const SEASON_ID = '33333333-3333-3333-3333-333333333333';

// ─── Auth middleware ──────────────────────────────────────────────────────────

jest.mock('../../middleware/auth', () => {
  const original = jest.requireActual('../../middleware/auth');
  return {
    ...original,
    authenticate: jest.fn((req: { user: unknown }, _res: unknown, next: () => void) => {
      req.user = (global as unknown as Record<string, unknown>).__seasonsTestUser ?? {
        id: ADMIN_ID, role: 'admin', tokenVersion: 0,
      };
      next();
    }),
    injectTeamScope: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
    requireRole: original.requireRole,
  };
});

function setUser(role: string) {
  (global as unknown as Record<string, unknown>).__seasonsTestUser = {
    id: ADMIN_ID, role, tokenVersion: 0,
  };
}

// ─── DB mock ──────────────────────────────────────────────────────────────────

let selectQueue: unknown[][] = [];

function makeQB(rows: unknown[]) {
  const self: Record<string, unknown> = {};
  self['then']    = (fn: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(rows).then(fn, rej);
  self['catch']   = (fn: (e: unknown) => unknown) => Promise.resolve(rows).catch(fn);
  self['from']    = jest.fn(() => self);
  self['where']   = jest.fn(() => self);
  self['limit']   = jest.fn(() => self);
  self['offset']  = jest.fn(() => self);
  self['orderBy'] = jest.fn(() => self);
  return self;
}

const mockInsertValues       = jest.fn();
const mockInsertReturning    = jest.fn();
const mockUpdateSet          = jest.fn();
const mockUpdateWhere        = jest.fn().mockResolvedValue(undefined);

jest.mock('../../db', () => ({
  db: {
    select: jest.fn(() => makeQB(selectQueue.shift() ?? [])),
    insert: jest.fn(() => ({ values: mockInsertValues })),
    update: jest.fn(() => ({ set: mockUpdateSet })),
    delete: jest.fn(() => ({ where: jest.fn().mockResolvedValue(undefined) })),
  },
  seasons: {}, players: {}, teams: {}, emailTemplates: {}, seSyncLog: {}, users: {},
}));

// Setup insert chain: insert().values().returning() for season creation
mockInsertValues.mockReturnValue({ returning: mockInsertReturning, onConflictDoNothing: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([]) }) });
mockInsertReturning.mockResolvedValue([{
  id: SEASON_ID, label: '2027 Season', seRegistrationId: null,
  seTryoutFormNames: [], offerExpiresDays: 14, isActive: false, isArchived: false,
  createdAt: new Date().toISOString(),
}]);
mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });

const app = createApp();

const mockSeasonRow = {
  id:               SEASON_ID,
  label:            '2027 Season',
  seRegistrationId: '46575456',
  seTryoutFormNames: [],
  seRegistrationUrl: null,
  offerExpiresDays:  14,
  isActive:          false,
  isArchived:        false,
  createdAt:         new Date().toISOString(),
};

beforeEach(() => {
  jest.clearAllMocks();
  selectQueue = [];
  setUser('admin');
  mockInsertValues.mockReturnValue({ returning: mockInsertReturning, onConflictDoNothing: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([]) }) });
  mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
});

// ─── GET /api/v1/seasons ──────────────────────────────────────────────────────

describe('GET /api/v1/seasons', () => {
  it('returns 200 with seasons array', async () => {
    selectQueue.push([mockSeasonRow]);
    const res = await request(app).get('/api/v1/seasons');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.seasons)).toBe(true);
  });

  it('includes seRegistrationId in season rows', async () => {
    selectQueue.push([mockSeasonRow]);
    const res = await request(app).get('/api/v1/seasons');
    expect(res.status).toBe(200);
    expect(res.body.seasons[0].seRegistrationId).toBe('46575456');
  });
});

// ─── POST /api/v1/seasons — role enforcement ─────────────────────────────────

describe('POST /api/v1/seasons — role enforcement', () => {
  it('returns 403 for head_coach', async () => {
    setUser('head_coach');
    const res = await request(app)
      .post('/api/v1/seasons')
      .send({ label: '2027 Season' });
    expect(res.status).toBe(403);
  });

  it('returns 403 for assistant_coach', async () => {
    setUser('assistant_coach');
    const res = await request(app)
      .post('/api/v1/seasons')
      .send({ label: '2027 Season' });
    expect(res.status).toBe(403);
  });

  it('does not return 403 for board', async () => {
    setUser('board');
    // We just verify the role gate passes (DB issues may cause other errors)
    const res = await request(app)
      .post('/api/v1/seasons')
      .send({ label: '2027 Season' });
    expect(res.status).not.toBe(403);
  });
});

// ─── POST /api/v1/seasons — validation ───────────────────────────────────────

describe('POST /api/v1/seasons — validation', () => {
  it('returns 400 when label is missing', async () => {
    const res = await request(app)
      .post('/api/v1/seasons')
      .send({});
    expect(res.status).toBe(400);
  });

  it('accepts a valid season with seRegistrationId', async () => {
    // Season insert + email template queries
    selectQueue.push([]); // no existing templates to copy
    const res = await request(app)
      .post('/api/v1/seasons')
      .send({ label: '2027 Season', seRegistrationId: '46575456' });
    // Not 400 or 403 — validation passes
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(403);
  });

  it('accepts a season without seRegistrationId (optional field)', async () => {
    selectQueue.push([]);
    const res = await request(app)
      .post('/api/v1/seasons')
      .send({ label: '2027 Season' });
    expect(res.status).not.toBe(400);
  });

  it('accepts seRegistrationUrl as valid URL', async () => {
    selectQueue.push([]);
    const res = await request(app)
      .post('/api/v1/seasons')
      .send({ label: '2027 Season', seRegistrationUrl: 'https://www.sportngin.com/register/form/46575456' });
    expect(res.status).not.toBe(400);
  });

  it('rejects seRegistrationUrl that is not a URL', async () => {
    const res = await request(app)
      .post('/api/v1/seasons')
      .send({ label: '2027 Season', seRegistrationUrl: 'not-a-url' });
    expect(res.status).toBe(400);
  });
});

// ─── PATCH /api/v1/seasons/:id — accepts seRegistrationId ────────────────────

describe('PATCH /api/v1/seasons/:id', () => {
  it('returns 403 for head_coach', async () => {
    setUser('head_coach');
    const res = await request(app)
      .patch(`/api/v1/seasons/${SEASON_ID}`)
      .send({ seRegistrationId: '46575456' });
    expect(res.status).toBe(403);
  });

  it('accepts seRegistrationId update for admin', async () => {
    const res = await request(app)
      .patch(`/api/v1/seasons/${SEASON_ID}`)
      .send({ seRegistrationId: '46575456' });
    // update is called — not 400 or 403
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(403);
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ seRegistrationId: '46575456' }),
    );
  });

  it('accepts clearing seRegistrationId (undefined/null)', async () => {
    const res = await request(app)
      .patch(`/api/v1/seasons/${SEASON_ID}`)
      .send({ label: '2027 Season' }); // no seRegistrationId
    expect(res.status).not.toBe(400);
  });
});

// ─── POST /api/v1/seasons/:id/activate ───────────────────────────────────────

describe('POST /api/v1/seasons/:id/activate', () => {
  it('returns 403 for head_coach', async () => {
    setUser('head_coach');
    const res = await request(app).post(`/api/v1/seasons/${SEASON_ID}/activate`);
    expect(res.status).toBe(403);
  });

  it('returns 200 for admin', async () => {
    const res = await request(app).post(`/api/v1/seasons/${SEASON_ID}/activate`);
    expect(res.status).toBe(200);
    expect(mockUpdateSet).toHaveBeenCalled();
  });
});

// ─── POST /api/v1/seasons/:id/archive ────────────────────────────────────────

describe('POST /api/v1/seasons/:id/archive', () => {
  it('returns 403 for assistant_coach', async () => {
    setUser('assistant_coach');
    const res = await request(app).post(`/api/v1/seasons/${SEASON_ID}/archive`);
    expect(res.status).toBe(403);
  });

  it('returns 200 for admin', async () => {
    const res = await request(app).post(`/api/v1/seasons/${SEASON_ID}/archive`);
    expect(res.status).toBe(200);
  });
});
