/**
 * SE Explorer — player import endpoints (POST /import/players, GET /profile/:id)
 *
 * Covers:
 *  - Role enforcement: all new endpoints require admin
 *  - POST /import/players (preview): validation, SE fetch, duplicate detection
 *  - POST /import/players (commit): new player creation, duplicate merge, skip unselected
 *  - GET  /profile/:profileId: profile detail fetch, non-numeric id rejected
 */

import request from 'supertest';
import { createApp } from '../../app';

const ADMIN_ID  = 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001';
const SEASON_ID = '33333333-3333-3333-3333-333333333333';
const REG_ID    = '46575456';

// ─── Auth middleware ──────────────────────────────────────────────────────────

jest.mock('../../middleware/auth', () => {
  const original = jest.requireActual('../../middleware/auth');
  return {
    ...original,
    authenticate: jest.fn((req: { user: unknown }, _res: unknown, next: () => void) => {
      req.user = (global as unknown as Record<string, unknown>).__sePlayerUser ?? {
        id: ADMIN_ID, role: 'admin', tokenVersion: 0,
      };
      next();
    }),
    injectTeamScope: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
    requireRole: original.requireRole,
  };
});

function setUser(role: string) {
  (global as unknown as Record<string, unknown>).__sePlayerUser = {
    id: ADMIN_ID, role, tokenVersion: 0,
  };
}

// ─── SE API Client mock ───────────────────────────────────────────────────────

jest.mock('../../services/SEApiClient', () => ({
  seApiClient:     { get: jest.fn(), graphql: jest.fn() },
  SEApiError: class SEApiError extends Error {
    constructor(msg: string, public code: string, public statusCode: number) { super(msg); }
  },
  SE_GRAPHQL_URL: 'https://api.sportsengine.com/graphql',
  SE_ME_URL:      'https://user.sportsengine.com/oauth/me',
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const SEApiClientModule = require('../../services/SEApiClient') as {
  seApiClient: { get: jest.Mock; graphql: jest.Mock };
  SEApiError:  new (msg: string, code: string, statusCode: number) => Error & { code: string; statusCode: number };
};
const mockSeGraphql = SEApiClientModule.seApiClient.graphql;

jest.mock('../../services/IntegrationsService', () => ({
  getIntegration:       jest.fn().mockResolvedValue({ client_id: 'cid', client_secret: 'sec' }),
  getIntegrationStatus: jest.fn().mockResolvedValue({}),
  getSEOrgId:           jest.fn().mockResolvedValue(28131),
  setIntegration:       jest.fn(),
  deleteIntegration:    jest.fn(),
  getCachedSEToken:     jest.fn().mockResolvedValue('mock-token'),
  cacheSEToken:         jest.fn(),
}));

// ─── DB mock — queue-based ────────────────────────────────────────────────────

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

const mockInsertValues = jest.fn().mockResolvedValue([]);
const mockUpdateSet    = jest.fn();
const mockUpdateWhere  = jest.fn().mockResolvedValue(undefined);

jest.mock('../../db', () => ({
  db: {
    select: jest.fn(() => makeQB(selectQueue.shift() ?? [])),
    update: jest.fn(() => ({ set: mockUpdateSet })),
    insert: jest.fn(() => ({ values: mockInsertValues })),
    delete: jest.fn(() => ({ where: jest.fn().mockResolvedValue(undefined) })),
  },
  integrations: {}, users: {}, seasons: {}, players: {}, config: {}, teams: {}, offers: {},
}));

mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });

const app = createApp();

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockSeason = { id: SEASON_ID, label: '2027 Season', seRegistrationId: null };

const mockSEProfilesPage = {
  profiles: {
    pageInformation: { count: 2, page: 1, pages: 1, perPage: 50 },
    results: [
      { id: '1001', firstName: 'Jake',  lastName: 'Smith' },
      { id: '1002', firstName: 'Riley', lastName: 'Jones' },
    ],
  },
};

const mockSEProfileDetail1 = {
  profile: {
    id: '1001', firstName: 'Jake', lastName: 'Smith',
    dateOfBirth: '2014-03-15', grade: '6th', email: null,
    guardians: [{ firstName: 'Mike', lastName: 'Smith', email: 'mike@example.com' }],
  },
};

const mockSEProfileDetail2 = {
  profile: {
    id: '1002', firstName: 'Riley', lastName: 'Jones',
    dateOfBirth: '2015-06-20', grade: '5th', email: 'rjones@example.com',
    guardians: [],
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  selectQueue = [];
  setUser('admin');
  mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
});

// ─── Role enforcement ─────────────────────────────────────────────────────────

describe('Player import endpoints — role enforcement', () => {
  const endpoints = [
    ['POST', '/api/v1/integrations/se-explorer/import/players'],
    ['GET',  '/api/v1/integrations/se-explorer/profile/1001'],
  ] as const;

  for (const role of ['board', 'head_coach', 'assistant_coach']) {
    describe(`role: ${role}`, () => {
      beforeEach(() => setUser(role));
      for (const [method, path] of endpoints) {
        it(`${method} ${path} → 403`, async () => {
          const res = await (
            request(app) as unknown as Record<string, (p: string) => request.Test>
          )[method.toLowerCase()](path).send({ registrationId: REG_ID, seasonId: SEASON_ID });
          expect(res.status).toBe(403);
        });
      }
    });
  }
});

// ─── POST /import/players — validation ───────────────────────────────────────

describe('POST /import/players — request validation', () => {
  it('returns 400 when registrationId is missing', async () => {
    const res = await request(app)
      .post('/api/v1/integrations/se-explorer/import/players')
      .send({ seasonId: SEASON_ID });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/registrationId/i);
  });

  it('returns 400 when seasonId is missing', async () => {
    const res = await request(app)
      .post('/api/v1/integrations/se-explorer/import/players')
      .send({ registrationId: REG_ID });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/seasonId/i);
  });

  it('returns 400 when registrationId is not numeric', async () => {
    const res = await request(app)
      .post('/api/v1/integrations/se-explorer/import/players')
      .send({ registrationId: 'not-a-number', seasonId: SEASON_ID });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/numeric/i);
  });

  it('returns 404 when season does not exist', async () => {
    selectQueue.push([]); // season not found
    const res = await request(app)
      .post('/api/v1/integrations/se-explorer/import/players')
      .send({ registrationId: REG_ID, seasonId: SEASON_ID });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/season not found/i);
  });

  it('returns 400 when org ID is not configured', async () => {
    const { getSEOrgId } = require('../../services/IntegrationsService');
    getSEOrgId.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/v1/integrations/se-explorer/import/players')
      .send({ registrationId: REG_ID, seasonId: SEASON_ID });
    expect(res.status).toBe(400);
  });
});

// ─── POST /import/players — preview (commit:false) ───────────────────────────

describe('POST /import/players — preview mode', () => {
  function setupPreviewMocks() {
    // season found
    selectQueue.push([mockSeason]);
    // existing players in season (empty — no duplicates)
    selectQueue.push([]);
    // SE profiles query
    mockSeGraphql
      .mockResolvedValueOnce(mockSEProfilesPage)
      .mockResolvedValueOnce(mockSEProfileDetail1)
      .mockResolvedValueOnce(mockSEProfileDetail2);
  }

  it('returns 200 with toCreate and duplicates arrays', async () => {
    setupPreviewMocks();
    const res = await request(app)
      .post('/api/v1/integrations/se-explorer/import/players')
      .send({ registrationId: REG_ID, seasonId: SEASON_ID, commit: false });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.commit).toBe(false);
    expect(Array.isArray(res.body.toCreate)).toBe(true);
    expect(Array.isArray(res.body.duplicates)).toBe(true);
  });

  it('classifies profiles with no match as toCreate', async () => {
    setupPreviewMocks();
    const res = await request(app)
      .post('/api/v1/integrations/se-explorer/import/players')
      .send({ registrationId: REG_ID, seasonId: SEASON_ID, commit: false });
    expect(res.body.toCreate).toHaveLength(2);
    expect(res.body.duplicates).toHaveLength(0);
  });

  it('classifies profiles matching existing player as duplicates (plain date match)', async () => {
    selectQueue.push([mockSeason]);
    // DB stores YYYY-MM-DD; SE profile also returns plain date in this mock
    selectQueue.push([{
      id: 'existing-p-1', profileId: null,
      firstName: 'Jake', lastName: 'Smith', dateOfBirth: '2014-03-15',
      parentEmail: 'old@example.com', status: 'draft',
    }]);
    mockSeGraphql
      .mockResolvedValueOnce(mockSEProfilesPage)
      .mockResolvedValueOnce(mockSEProfileDetail1)
      .mockResolvedValueOnce(mockSEProfileDetail2);

    const res = await request(app)
      .post('/api/v1/integrations/se-explorer/import/players')
      .send({ registrationId: REG_ID, seasonId: SEASON_ID, commit: false });
    expect(res.body.toCreate).toHaveLength(1);
    expect(res.body.duplicates).toHaveLength(1);
    expect(res.body.duplicates[0].existingPlayerId).toBe('existing-p-1');
    expect(res.body.duplicates[0].existingStatus).toBe('draft');
  });

  it('detects duplicate when SE returns ISO timestamp DOB and DB has date-only string', async () => {
    // SE returns "2014-03-15T00:00:00.000Z", DB stores "2014-03-15" — must still match
    const seProfileWithTimestamp = { ...mockSEProfileDetail1, profile: { ...mockSEProfileDetail1.profile, dateOfBirth: '2014-03-15T00:00:00.000Z' } };
    selectQueue.push([mockSeason]);
    selectQueue.push([{
      id: 'existing-p-1', profileId: null,
      firstName: 'Jake', lastName: 'Smith', dateOfBirth: '2014-03-15', // DB format
      parentEmail: 'old@example.com', status: 'draft',
    }]);
    mockSeGraphql
      .mockResolvedValueOnce(mockSEProfilesPage)
      .mockResolvedValueOnce(seProfileWithTimestamp)
      .mockResolvedValueOnce(mockSEProfileDetail2);

    const res = await request(app)
      .post('/api/v1/integrations/se-explorer/import/players')
      .send({ registrationId: REG_ID, seasonId: SEASON_ID, commit: false });
    expect(res.body.duplicates).toHaveLength(1);
    expect(res.body.duplicates[0].existingPlayerId).toBe('existing-p-1');
    expect(res.body.toCreate).toHaveLength(1); // only Riley is new
  });

  it('matches duplicate by profileId even when name differs', async () => {
    selectQueue.push([mockSeason]);
    selectQueue.push([{
      id: 'existing-linked', profileId: '1001', // already linked
      firstName: 'Jacob', lastName: 'Smith', dateOfBirth: '2014-03-15',
      parentEmail: 'old@example.com', status: 'sent',
    }]);
    mockSeGraphql
      .mockResolvedValueOnce(mockSEProfilesPage)
      .mockResolvedValueOnce(mockSEProfileDetail1)
      .mockResolvedValueOnce(mockSEProfileDetail2);

    const res = await request(app)
      .post('/api/v1/integrations/se-explorer/import/players')
      .send({ registrationId: REG_ID, seasonId: SEASON_ID, commit: false });
    expect(res.body.duplicates).toHaveLength(1);
    expect(res.body.duplicates[0].existingStatus).toBe('sent');
  });

  it('persists registrationId onto season when it differs', async () => {
    const seasonWithoutRegId = { ...mockSeason, seRegistrationId: null };
    selectQueue.push([seasonWithoutRegId]);
    selectQueue.push([]);
    mockSeGraphql
      .mockResolvedValueOnce({ profiles: { pageInformation: { count: 0, page: 1, pages: 1, perPage: 50 }, results: [] } });

    await request(app)
      .post('/api/v1/integrations/se-explorer/import/players')
      .send({ registrationId: REG_ID, seasonId: SEASON_ID, commit: false });

    expect(mockUpdateSet).toHaveBeenCalledWith({ seRegistrationId: REG_ID });
  });

  it('does NOT update season when registrationId already matches', async () => {
    const seasonAlreadySet = { ...mockSeason, seRegistrationId: REG_ID };
    selectQueue.push([seasonAlreadySet]);
    selectQueue.push([]);
    mockSeGraphql.mockResolvedValueOnce({
      profiles: { pageInformation: { count: 0, page: 1, pages: 1, perPage: 50 }, results: [] },
    });

    await request(app)
      .post('/api/v1/integrations/se-explorer/import/players')
      .send({ registrationId: REG_ID, seasonId: SEASON_ID, commit: false });

    expect(mockUpdateSet).not.toHaveBeenCalled();
  });

  it('returns friendly message when registration has no profiles', async () => {
    selectQueue.push([mockSeason]);
    mockSeGraphql.mockResolvedValueOnce({
      profiles: { pageInformation: { count: 0, page: 1, pages: 1, perPage: 50 }, results: [] },
    });

    const res = await request(app)
      .post('/api/v1/integrations/se-explorer/import/players')
      .send({ registrationId: REG_ID, seasonId: SEASON_ID });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/no profiles found/i);
  });

  it('propagates SE API errors as non-200 with code', async () => {
    const { SEApiError } = require('../../services/SEApiClient');
    selectQueue.push([mockSeason]);
    selectQueue.push([]);
    mockSeGraphql.mockRejectedValueOnce(new SEApiError('Rate limit', 'SE_RATE_LIMITED', 429));

    const res = await request(app)
      .post('/api/v1/integrations/se-explorer/import/players')
      .send({ registrationId: REG_ID, seasonId: SEASON_ID, commit: false });
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('SE_RATE_LIMITED');
  });
});

// ─── POST /import/players — commit mode ──────────────────────────────────────

describe('POST /import/players — commit mode', () => {
  it('creates new players and returns created count', async () => {
    selectQueue.push([mockSeason]);
    selectQueue.push([]); // no existing players
    mockSeGraphql
      .mockResolvedValueOnce(mockSEProfilesPage)
      .mockResolvedValueOnce(mockSEProfileDetail1)
      .mockResolvedValueOnce(mockSEProfileDetail2);

    const res = await request(app)
      .post('/api/v1/integrations/se-explorer/import/players')
      .send({
        registrationId: REG_ID, seasonId: SEASON_ID, commit: true,
        selectedProfileIds: ['1001', '1002'],
      });
    expect(res.status).toBe(200);
    expect(res.body.commit).toBe(true);
    expect(res.body.created).toBe(2);
    expect(res.body.merged).toBe(0);
  });

  it('inserts a player row for each selected new profile', async () => {
    selectQueue.push([mockSeason]);
    selectQueue.push([]);
    mockSeGraphql
      .mockResolvedValueOnce(mockSEProfilesPage)
      .mockResolvedValueOnce(mockSEProfileDetail1)
      .mockResolvedValueOnce(mockSEProfileDetail2);

    await request(app)
      .post('/api/v1/integrations/se-explorer/import/players')
      .send({
        registrationId: REG_ID, seasonId: SEASON_ID, commit: true,
        selectedProfileIds: ['1001', '1002'],
      });

    const { db } = require('../../db');
    expect(db.insert).toHaveBeenCalled();
    // SE Profile type does not expose grade or guardians — these come back null/placeholder
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId:      '1001',
        firstName:      'Jake',
        lastName:       'Smith',
        dateOfBirth:    '2014-03-15',
        grade:          null,    // not available on SE Profile type
        parentName:     null,    // guardian name not available on SE Profile type
        importedFromSe: true,
        status:         'draft',
      }),
    );
  });

  it('skips profiles not in selectedProfileIds', async () => {
    selectQueue.push([mockSeason]);
    selectQueue.push([]);
    mockSeGraphql
      .mockResolvedValueOnce(mockSEProfilesPage)
      .mockResolvedValueOnce(mockSEProfileDetail1)
      .mockResolvedValueOnce(mockSEProfileDetail2);

    const res = await request(app)
      .post('/api/v1/integrations/se-explorer/import/players')
      .send({
        registrationId: REG_ID, seasonId: SEASON_ID, commit: true,
        selectedProfileIds: ['1001'], // only select first profile
      });

    expect(res.body.created).toBe(1);
    expect(res.body.skipped).toBe(1);
  });

  it('merges a duplicate by setting profileId on existing player', async () => {
    const existingPlayer = {
      id: 'existing-p-1', profileId: null,
      firstName: 'Jake', lastName: 'Smith', dateOfBirth: '2014-03-15',
      grade: null, parentName: null,
      parentEmail: 'old@example.com', status: 'draft',
    };
    selectQueue.push([mockSeason]);
    selectQueue.push([existingPlayer]); // Jake is a duplicate
    // For the merge commit, we need to fetch the existing player again
    selectQueue.push([existingPlayer]);
    mockSeGraphql
      .mockResolvedValueOnce(mockSEProfilesPage)
      .mockResolvedValueOnce(mockSEProfileDetail1)  // Jake
      .mockResolvedValueOnce(mockSEProfileDetail2); // Riley (new)

    const res = await request(app)
      .post('/api/v1/integrations/se-explorer/import/players')
      .send({
        registrationId: REG_ID, seasonId: SEASON_ID, commit: true,
        selectedProfileIds: ['1001', '1002'],
      });

    expect(res.body.merged).toBe(1);
    expect(res.body.created).toBe(1);
    // Verify profileId was set on the existing player
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: '1001', importedFromSe: true }),
    );
  });

  it('sets profileId and importedFromSe when merging a duplicate', async () => {
    // grade is not available from SE Profile type — merge only sets profileId + fills DOB/email
    const existingPlayer = {
      id: 'existing-p-1', profileId: null,
      firstName: 'Jake', lastName: 'Smith', dateOfBirth: null,
      grade: '5th', parentName: 'Dad Smith', parentEmail: 'old@example.com', status: 'draft',
    };
    selectQueue.push([mockSeason]);
    selectQueue.push([existingPlayer]);
    selectQueue.push([existingPlayer]);
    mockSeGraphql
      .mockResolvedValueOnce(mockSEProfilesPage)
      .mockResolvedValueOnce(mockSEProfileDetail1)
      .mockResolvedValueOnce(mockSEProfileDetail2);

    await request(app)
      .post('/api/v1/integrations/se-explorer/import/players')
      .send({
        registrationId: REG_ID, seasonId: SEASON_ID, commit: true,
        selectedProfileIds: ['1001'],
      });

    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: '1001', importedFromSe: true }),
    );
  });

  it('uses profile email as parentEmail when available', async () => {
    // SE Profile does not expose guardians — profile.email is used as the contact email
    selectQueue.push([mockSeason]);
    selectQueue.push([]);
    mockSeGraphql
      .mockResolvedValueOnce({
        profiles: { pageInformation: { count: 1, page: 1, pages: 1, perPage: 50 }, results: [{ id: '1002', firstName: 'Riley', lastName: 'Jones' }] },
      })
      .mockResolvedValueOnce(mockSEProfileDetail2); // has email: 'rjones@example.com'

    await request(app)
      .post('/api/v1/integrations/se-explorer/import/players')
      .send({ registrationId: REG_ID, seasonId: SEASON_ID, commit: true, selectedProfileIds: ['1002'] });

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ parentEmail: 'rjones@example.com' }),
    );
  });

  it('returns message summarizing created and merged counts', async () => {
    selectQueue.push([mockSeason]);
    selectQueue.push([]);
    mockSeGraphql
      .mockResolvedValueOnce(mockSEProfilesPage)
      .mockResolvedValueOnce(mockSEProfileDetail1)
      .mockResolvedValueOnce(mockSEProfileDetail2);

    const res = await request(app)
      .post('/api/v1/integrations/se-explorer/import/players')
      .send({ registrationId: REG_ID, seasonId: SEASON_ID, commit: true, selectedProfileIds: ['1001', '1002'] });

    expect(res.body.message).toMatch(/2 new player/i);
  });
});

// ─── GET /profile/:profileId ──────────────────────────────────────────────────

describe('GET /se-explorer/profile/:profileId', () => {
  it('returns 400 for non-numeric profileId', async () => {
    const res = await request(app)
      .get('/api/v1/integrations/se-explorer/profile/not-a-number');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/numeric/i);
  });

  it('returns profile detail from SE', async () => {
    mockSeGraphql.mockResolvedValueOnce(mockSEProfileDetail1);
    const res = await request(app)
      .get('/api/v1/integrations/se-explorer/profile/1001');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.profile.id).toBe('1001');
    expect(res.body.profile.firstName).toBe('Jake');
  });

  it('returns ok:true with null profile when SE returns null', async () => {
    mockSeGraphql.mockResolvedValueOnce({ profile: null });
    const res = await request(app)
      .get('/api/v1/integrations/se-explorer/profile/9999');
    expect(res.status).toBe(200);
    expect(res.body.profile).toBeNull();
  });

  it('propagates SE errors with correct status code', async () => {
    const { SEApiError } = require('../../services/SEApiClient');
    mockSeGraphql.mockRejectedValueOnce(new SEApiError('Not found', 'SE_NOT_FOUND', 404));
    const res = await request(app)
      .get('/api/v1/integrations/se-explorer/profile/1001');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('SE_NOT_FOUND');
  });
});
