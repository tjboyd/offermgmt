/**
 * Admin player routes — new endpoints added with the Players tab feature.
 *
 * Covers:
 *  - GET  /api/v1/players/admin           — role enforcement, returns list with isDuplicate flag
 *  - DELETE /api/v1/players/by-season/:id — admin-only bulk delete, cascades offers
 *  - PATCH /api/v1/players/:id/merge      — admin-only profileId link, fills blank fields only
 */

import request from 'supertest';
import { createApp } from '../../app';

const ADMIN_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001';

// ─── Auth middleware ──────────────────────────────────────────────────────────

jest.mock('../../middleware/auth', () => {
  const original = jest.requireActual('../../middleware/auth');
  return {
    ...original,
    authenticate: jest.fn((req: { user: unknown }, _res: unknown, next: () => void) => {
      req.user = (global as unknown as Record<string, unknown>).__adminPlayerUser ?? {
        id: ADMIN_ID, role: 'admin', tokenVersion: 0, teamIds: undefined,
      };
      next();
    }),
    injectTeamScope: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
    requireRole: original.requireRole,
  };
});

function setUser(role: string, teamIds?: string[]) {
  (global as unknown as Record<string, unknown>).__adminPlayerUser = {
    id: ADMIN_ID, role, tokenVersion: 0, teamIds,
  };
}

// ─── PlayerService mock ───────────────────────────────────────────────────────

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

// ─── DB mock — queue-based so each select() returns the next item ─────────────

let selectQueue: unknown[][] = [];

function makeQB(rows: unknown[]) {
  const self: Record<string, jest.Mock | ((fn: (v: unknown) => unknown) => Promise<unknown>)> = {} as Record<string, jest.Mock | ((fn: (v: unknown) => unknown) => Promise<unknown>)>;
  self['then']    = (fn: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(rows).then(fn, rej);
  self['catch']   = (fn: (e: unknown) => unknown) => Promise.resolve(rows).catch(fn);
  self['from']    = jest.fn(() => self);
  self['where']   = jest.fn(() => self);
  self['limit']   = jest.fn(() => self);
  self['offset']  = jest.fn(() => self);
  self['orderBy'] = jest.fn(() => self);
  return self;
}

const mockInsertValues = jest.fn().mockResolvedValue([]);
const mockUpdateSet    = jest.fn();
const mockUpdateWhere  = jest.fn().mockResolvedValue(undefined);
const mockDeleteWhere  = jest.fn().mockResolvedValue(undefined);

jest.mock('../../db', () => ({
  db: {
    select: jest.fn(() => makeQB(selectQueue.shift() ?? [])),
    insert: jest.fn(() => ({ values: mockInsertValues })),
    update: jest.fn(() => ({ set: mockUpdateSet })),
    delete: jest.fn(() => ({ where: mockDeleteWhere })),
  },
  users: {}, players: {}, activityLog: {}, seasons: {}, offers: {},
}));

mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });

const app = createApp();

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SEASON_ID = '33333333-3333-3333-3333-333333333333';
const PLAYER_ID = '11111111-1111-1111-1111-111111111111';

const mockPlayer = {
  id:           PLAYER_ID,
  seasonId:     SEASON_ID,
  teamId:       null,
  profileId:    null,
  firstName:    'Jake',
  lastName:     'Smith',
  dateOfBirth:  '2014-03-15',
  grade:        '6th',
  parentEmail:  'mike@example.com',
  parentName:   'Mike Smith',
  status:       'draft',
  isReturning:  false,
  importedFromSe: false,
  createdAt:    new Date().toISOString(),
};

beforeEach(() => {
  jest.clearAllMocks();
  selectQueue = [];
  setUser('admin');
  mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
});

// ─── GET /api/v1/players/admin ────────────────────────────────────────────────

describe('GET /api/v1/players/admin — role enforcement', () => {
  for (const role of ['head_coach', 'assistant_coach']) {
    it(`returns 403 for ${role}`, async () => {
      setUser(role, ['t1']);
      selectQueue.push([mockPlayer]);
      const res = await request(app)
        .get('/api/v1/players/admin')
        .set('Authorization', 'Bearer mock');
      expect(res.status).toBe(403);
    });
  }

  for (const role of ['admin', 'board']) {
    it(`returns 200 for ${role}`, async () => {
      setUser(role);
      selectQueue.push([mockPlayer]);
      const res = await request(app)
        .get('/api/v1/players/admin')
        .set('Authorization', 'Bearer mock');
      expect(res.status).toBe(200);
      expect(res.body.players).toBeDefined();
    });
  }
});

describe('GET /api/v1/players/admin — response shape', () => {
  it('returns players array with isDuplicate flag', async () => {
    selectQueue.push([mockPlayer]);
    const res = await request(app)
      .get('/api/v1/players/admin')
      .set('Authorization', 'Bearer mock');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.players)).toBe(true);
    expect(res.body.players[0]).toHaveProperty('isDuplicate');
    expect(res.body.players[0].isDuplicate).toBe(false);
  });

  it('flags two players in the same season with same name+DOB as duplicates', async () => {
    const dup = { ...mockPlayer, id: '22222222-2222-2222-2222-222222222222' };
    selectQueue.push([mockPlayer, dup]);
    const res = await request(app)
      .get('/api/v1/players/admin')
      .set('Authorization', 'Bearer mock');
    expect(res.status).toBe(200);
    expect(res.body.players.every((p: { isDuplicate: boolean }) => p.isDuplicate)).toBe(true);
  });

  it('does not flag same name+DOB across different seasons as duplicate', async () => {
    const otherSeason = { ...mockPlayer, id: '22222222-2222-2222-2222-222222222222', seasonId: 'other-season' };
    selectQueue.push([mockPlayer, otherSeason]);
    const res = await request(app)
      .get('/api/v1/players/admin')
      .set('Authorization', 'Bearer mock');
    expect(res.status).toBe(200);
    expect(res.body.players.every((p: { isDuplicate: boolean }) => p.isDuplicate)).toBe(false);
  });

  it('returns empty array when no players found', async () => {
    selectQueue.push([]);
    const res = await request(app)
      .get('/api/v1/players/admin')
      .set('Authorization', 'Bearer mock');
    expect(res.status).toBe(200);
    expect(res.body.players).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('filters by seasonId when provided and returns 200', async () => {
    selectQueue.push([mockPlayer]);
    const res = await request(app)
      .get(`/api/v1/players/admin?seasonId=${SEASON_ID}`)
      .set('Authorization', 'Bearer mock');
    expect(res.status).toBe(200);
    expect(res.body.players).toHaveLength(1);
    expect(res.body.players[0].seasonId).toBe(SEASON_ID);
  });
});

// ─── DELETE /api/v1/players/by-season/:seasonId ───────────────────────────────

describe('DELETE /api/v1/players/by-season/:seasonId — role enforcement', () => {
  for (const role of ['board', 'head_coach', 'assistant_coach']) {
    it(`returns 403 for ${role}`, async () => {
      setUser(role);
      const res = await request(app)
        .delete(`/api/v1/players/by-season/${SEASON_ID}`)
        .set('Authorization', 'Bearer mock');
      expect(res.status).toBe(403);
    });
  }
});

describe('DELETE /api/v1/players/by-season/:seasonId — logic', () => {
  it('returns 404 when season does not exist', async () => {
    selectQueue.push([]); // season not found
    const res = await request(app)
      .delete(`/api/v1/players/by-season/${SEASON_ID}`)
      .set('Authorization', 'Bearer mock');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/season not found/i);
  });

  it('returns 200 with deleted count when season has players', async () => {
    selectQueue.push([{ id: SEASON_ID }]);                            // season found
    selectQueue.push([{ id: PLAYER_ID }, { id: '22222222-2222-2222-2222-222222222222' }]); // 2 players
    const res = await request(app)
      .delete(`/api/v1/players/by-season/${SEASON_ID}`)
      .set('Authorization', 'Bearer mock');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.deleted).toBe(2);
  });

  it('returns 200 with deleted:0 when season is empty', async () => {
    selectQueue.push([{ id: SEASON_ID }]); // season found
    selectQueue.push([]);                   // no players
    const res = await request(app)
      .delete(`/api/v1/players/by-season/${SEASON_ID}`)
      .set('Authorization', 'Bearer mock');
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(0);
  });

  it('cascades to delete offers before deleting players', async () => {
    selectQueue.push([{ id: SEASON_ID }]);
    selectQueue.push([{ id: PLAYER_ID }]);
    await request(app)
      .delete(`/api/v1/players/by-season/${SEASON_ID}`)
      .set('Authorization', 'Bearer mock');
    const { db } = require('../../db');
    // delete should be called twice: offers, then players
    expect(db.delete).toHaveBeenCalledTimes(2);
  });
});

// ─── PATCH /api/v1/players/:id/merge ─────────────────────────────────────────

describe('PATCH /api/v1/players/:id/merge — role enforcement', () => {
  for (const role of ['board', 'head_coach', 'assistant_coach']) {
    it(`returns 403 for ${role}`, async () => {
      setUser(role);
      const res = await request(app)
        .patch(`/api/v1/players/${PLAYER_ID}/merge`)
        .set('Authorization', 'Bearer mock')
        .send({ profileId: 'se-123' });
      expect(res.status).toBe(403);
    });
  }
});

describe('PATCH /api/v1/players/:id/merge — validation', () => {
  it('returns 400 when profileId is missing', async () => {
    const res = await request(app)
      .patch(`/api/v1/players/${PLAYER_ID}/merge`)
      .set('Authorization', 'Bearer mock')
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when profileId is empty string', async () => {
    const res = await request(app)
      .patch(`/api/v1/players/${PLAYER_ID}/merge`)
      .set('Authorization', 'Bearer mock')
      .send({ profileId: '' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when player does not exist', async () => {
    selectQueue.push([]); // player not found (route returns early — getUserName never called)
    const res = await request(app)
      .patch(`/api/v1/players/${PLAYER_ID}/merge`)
      .set('Authorization', 'Bearer mock')
      .send({ profileId: 'se-999' });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/player not found/i);
  });
});

describe('PATCH /api/v1/players/:id/merge — merge logic', () => {
  it('returns 200 and sets profileId on the player', async () => {
    selectQueue.push([{ ...mockPlayer }]);        // existing player (first select)
    selectQueue.push([{ fullName: 'Admin' }]);   // getUserName (after update)
    const res = await request(app)
      .patch(`/api/v1/players/${PLAYER_ID}/merge`)
      .set('Authorization', 'Bearer mock')
      .send({ profileId: 'se-555' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: 'se-555', importedFromSe: true }),
    );
  });

  it('fills blank dateOfBirth from SE data', async () => {
    const playerNoDob = { ...mockPlayer, dateOfBirth: null };
    selectQueue.push([playerNoDob]);             // existing player (first select)
    selectQueue.push([{ fullName: 'Admin' }]);   // getUserName (after update)
    await request(app)
      .patch(`/api/v1/players/${PLAYER_ID}/merge`)
      .set('Authorization', 'Bearer mock')
      .send({ profileId: 'se-555', dateOfBirth: '2014-03-15' });
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ dateOfBirth: '2014-03-15' }),
    );
  });

  it('does NOT overwrite existing dateOfBirth', async () => {
    selectQueue.push([{ ...mockPlayer, dateOfBirth: '2014-03-15' }]); // existing player has DOB
    selectQueue.push([{ fullName: 'Admin' }]);                         // getUserName
    await request(app)
      .patch(`/api/v1/players/${PLAYER_ID}/merge`)
      .set('Authorization', 'Bearer mock')
      .send({ profileId: 'se-555', dateOfBirth: '2015-01-01' });
    const setArg = mockUpdateSet.mock.calls[0][0] as Record<string, unknown>;
    expect(setArg.dateOfBirth).toBeUndefined();
  });

  it('fills blank grade from SE data', async () => {
    const playerNoGrade = { ...mockPlayer, grade: null };
    selectQueue.push([playerNoGrade]);           // existing player (first select)
    selectQueue.push([{ fullName: 'Admin' }]);   // getUserName
    await request(app)
      .patch(`/api/v1/players/${PLAYER_ID}/merge`)
      .set('Authorization', 'Bearer mock')
      .send({ profileId: 'se-555', grade: '6th' });
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ grade: '6th' }),
    );
  });

  it('does NOT overwrite existing grade', async () => {
    selectQueue.push([{ ...mockPlayer, grade: '5th' }]); // existing player has grade
    selectQueue.push([{ fullName: 'Admin' }]);            // getUserName
    await request(app)
      .patch(`/api/v1/players/${PLAYER_ID}/merge`)
      .set('Authorization', 'Bearer mock')
      .send({ profileId: 'se-555', grade: '6th' });
    const setArg = mockUpdateSet.mock.calls[0][0] as Record<string, unknown>;
    expect(setArg.grade).toBeUndefined();
  });

  it('logs the merge as a player_edited activity event', async () => {
    selectQueue.push([{ ...mockPlayer }]);       // existing player
    selectQueue.push([{ fullName: 'Admin' }]);   // getUserName
    await request(app)
      .patch(`/api/v1/players/${PLAYER_ID}/merge`)
      .set('Authorization', 'Bearer mock')
      .send({ profileId: 'se-777' });
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        playerId:  PLAYER_ID,
        eventType: 'player_edited',
        detail:    expect.objectContaining({ action: 'merged_profile', profileId: 'se-777' }),
      }),
    );
  });
});
