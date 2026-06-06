/**
 * SE API Explorer tests — M7-04 (updated for SE HQ GraphQL API)
 *
 * SE HQ uses:
 *  - POST https://user.sportsengine.com/oauth/token  (client_credentials, JSON body)
 *  - GET  https://user.sportsengine.com/oauth/me     (token introspection)
 *  - POST https://api.sportsengine.com/graphql       (all data queries)
 *
 * Covers:
 *  - All endpoints return 403 for non-admin roles
 *  - Admin can access all explorer endpoints
 *  - /status returns correct shape when SE is unconfigured vs connected
 *  - Preset endpoints proxy to GraphQL and return ok:true
 *  - POST /graphql validates query, blocks mutations, proxies queries
 *  - PII guard strips personal fields from responses
 *  - No DB writes triggered by any explorer endpoint
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
      req.user = (global as unknown as Record<string, unknown>).__explorerUser ?? {
        id: ADMIN_ID, role: 'admin', tokenVersion: 0,
      };
      next();
    }),
    injectTeamScope: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
    requireRole: original.requireRole,
  };
});

function setUser(role: string) {
  (global as unknown as Record<string, unknown>).__explorerUser = {
    id: ADMIN_ID, role, tokenVersion: 0,
  };
}

// ─── Service mocks ────────────────────────────────────────────────────────────

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
const mockSeGet     = SEApiClientModule.seApiClient.get;
const mockSeGraphql = SEApiClientModule.seApiClient.graphql;

jest.mock('../../services/IntegrationsService', () => ({
  getIntegration:       jest.fn().mockResolvedValue({ client_id: 'test-cid-1234', client_secret: 'sec' }),
  getIntegrationStatus: jest.fn().mockResolvedValue({
    sportsengine: { configured: true, maskedClientId: '••••1234' },
    sendgrid:     { configured: false, maskedSenderEmail: null },
  }),
  getSEOrgId:        jest.fn().mockResolvedValue(28131),
  setIntegration:    jest.fn(),
  deleteIntegration: jest.fn(),
  getCachedSEToken:  jest.fn().mockResolvedValue(null),
  cacheSEToken:      jest.fn(),
}));

jest.mock('../../db', () => ({
  db: {
    select: jest.fn(() => ({ from: jest.fn(() => ({ where: jest.fn(() => ({ limit: jest.fn(() => Promise.resolve([])) })) })) })),
    update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn(() => Promise.resolve()) })) })),
    insert: jest.fn(() => ({ values: jest.fn(() => ({ onConflictDoUpdate: jest.fn(() => Promise.resolve()) })) })),
  },
  integrations: {}, users: {}, seasons: {}, players: {}, config: {},
}));

const app = createApp();

// ─── Role enforcement ─────────────────────────────────────────────────────────

describe('SE Explorer — role enforcement (SE-20)', () => {
  const endpoints = [
    ['GET',  '/api/v1/integrations/se-explorer/status'],
    ['GET',  '/api/v1/integrations/se-explorer/seasons'],
    ['POST', '/api/v1/integrations/se-explorer/graphql'],
  ] as const;

  for (const role of ['board', 'head_coach', 'assistant_coach']) {
    describe(`role: ${role}`, () => {
      beforeEach(() => setUser(role));
      for (const [method, path] of endpoints) {
        it(`${method} ${path} → 403`, async () => {
          const res = await (request(app) as unknown as Record<string, (p: string) => request.Test>)[method.toLowerCase()](path);
          expect(res.status).toBe(403);
        });
      }
    });
  }

  it('admin can reach the status endpoint', async () => {
    setUser('admin');
    mockSeGet.mockResolvedValueOnce({ sub: 'u-1', name: 'Test Admin' });
    const res = await request(app).get('/api/v1/integrations/se-explorer/status');
    expect(res.status).toBe(200);
  });
});

// ─── /status (token introspection via /oauth/me) ──────────────────────────────

describe('GET /se-explorer/status (SE-15)', () => {
  beforeEach(() => { setUser('admin'); jest.clearAllMocks(); });

  it('returns configured:false when no credentials saved', async () => {
    const { getIntegration } = require('../../services/IntegrationsService');
    getIntegration.mockResolvedValueOnce(null);
    const res = await request(app).get('/api/v1/integrations/se-explorer/status');
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(false);
  });

  it('calls /oauth/me and returns ok:true with masked client ID', async () => {
    const { getIntegration } = require('../../services/IntegrationsService');
    getIntegration.mockResolvedValueOnce({ client_id: 'cid-5678', client_secret: 'sec' });
    mockSeGet.mockResolvedValueOnce({ sub: 'u-1', name: 'Coach Admin' });

    const res = await request(app).get('/api/v1/integrations/se-explorer/status');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.configured).toBe(true);
    expect(res.body.maskedClientId).toBe('••••5678');
    expect(res.body.tokenEndpoint).toContain('user.sportsengine.com');
    expect(res.body.graphqlEndpoint).toContain('sportsengine.com/graphql');
  });

  it('returns SE error details when token exchange fails', async () => {
    const { getIntegration } = require('../../services/IntegrationsService');
    getIntegration.mockResolvedValueOnce({ client_id: 'bad', client_secret: 'bad' });
    const { SEApiError } = require('../../services/SEApiClient');
    mockSeGet.mockRejectedValueOnce(new SEApiError('Auth failed', 'SE_AUTH_FAILED', 502));

    const res = await request(app).get('/api/v1/integrations/se-explorer/status');
    expect(res.status).toBe(502);
    expect(res.body.code).toBe('SE_AUTH_FAILED');
  });
});

// ─── Preset GraphQL endpoints ─────────────────────────────────────────────────

describe('Preset GraphQL explorer endpoints (SE-16, SE-17, SE-18)', () => {
  beforeEach(() => { setUser('admin'); jest.clearAllMocks(); });

  it('GET /organization returns ok:true', async () => {
    mockSeGraphql.mockResolvedValueOnce({ organization: { id: 'org-1', name: 'Hamilton JRC' } });
    const res = await request(app).get('/api/v1/integrations/se-explorer/organization');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.endpoint).toContain('sportsengine.com/graphql');
  });

  it('GET /seasons returns ok:true with teams data (seasons = program on teams)', async () => {
    mockSeGraphql.mockResolvedValueOnce({
      teams: { pageInformation: { count: 1, pages: 1, page: 1, perPage: 100 }, results: [{ id: 't1', name: '12U Gold', program: { primaryName: '2027 Jr Chargers', secondaryName: 'AAA' } }] },
    });
    const res = await request(app).get('/api/v1/integrations/se-explorer/seasons');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('GET /seasons/:id/teams returns team list', async () => {
    mockSeGraphql.mockResolvedValueOnce({
      teams: { pageInformation: { count: 1, pages: 1, page: 1, perPage: 100 }, results: [{ id: 't1', name: '12U Gold' }] },
    });
    const res = await request(app).get('/api/v1/integrations/se-explorer/seasons/s-123/teams');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('GET /registrations/:id/schema returns registration info (numeric id)', async () => {
    mockSeGraphql.mockResolvedValueOnce({ registration: { id: '46575456', name: 'Tryout Form', status: 2, resultsCompleted: 42 } });
    const res = await request(app).get('/api/v1/integrations/se-explorer/registrations/46575456/schema');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.note).toBeDefined();
  });

  it('GET /registrations/:id/schema returns 400 for non-numeric id', async () => {
    const res = await request(app).get('/api/v1/integrations/se-explorer/registrations/f-456/schema');
    expect(res.status).toBe(400);
  });

  it('propagates SE GraphQL error status codes', async () => {
    const { SEApiError } = require('../../services/SEApiClient');
    mockSeGraphql.mockRejectedValueOnce(new SEApiError('Not found', 'SE_NOT_FOUND', 404));
    const res = await request(app).get('/api/v1/integrations/se-explorer/seasons/s-123/teams');
    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
  });
});

// ─── POST /graphql freeform ───────────────────────────────────────────────────

describe('POST /se-explorer/graphql (freeform GraphQL)', () => {
  beforeEach(() => { setUser('admin'); jest.clearAllMocks(); });

  it('returns 400 when query is missing', async () => {
    const res = await request(app).post('/api/v1/integrations/se-explorer/graphql').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/query/i);
  });

  it('blocks mutations — read-only guard', async () => {
    const res = await request(app)
      .post('/api/v1/integrations/se-explorer/graphql')
      .send({ query: 'mutation { createTeam(name: "x") { id } }' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/mutations/i);
  });

  it('proxies a valid query to SE GraphQL', async () => {
    mockSeGraphql.mockResolvedValueOnce({ organization: { id: 'org-1' } });
    const res = await request(app)
      .post('/api/v1/integrations/se-explorer/graphql')
      .send({ query: 'query { organization { id } }' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ─── PII guard (M7-03) ────────────────────────────────────────────────────────

describe('PII guard — personal fields stripped (M7-03, SE-20)', () => {
  beforeEach(() => { setUser('admin'); jest.clearAllMocks(); });

  it('redacts email and first_name, passes through team_name', async () => {
    mockSeGraphql.mockResolvedValueOnce({
      registrations: { nodes: [{ id: 'r1', email: 'parent@example.com', first_name: 'Alex', team_name: '12U Gold' }] },
    });
    const res = await request(app)
      .post('/api/v1/integrations/se-explorer/graphql')
      .send({ query: 'query { registrations { nodes { id email first_name team_name } } }' });

    expect(res.status).toBe(200);
    const record = ((res.body.data as { registrations: { nodes: unknown[] } })?.registrations?.nodes?.[0]) as Record<string, unknown>;
    expect(record?.email).toBe('[redacted]');
    expect(record?.first_name).toBe('[redacted]');
    expect(record?.team_name).toBe('12U Gold');
  });

  it('redacts nested PII fields', async () => {
    mockSeGraphql.mockResolvedValueOnce({
      person: { guardian: { guardian_email: 'mom@test.com', phone: '555-1234' }, player_id: 'p99' },
    });
    const res = await request(app)
      .post('/api/v1/integrations/se-explorer/graphql')
      .send({ query: 'query { person { guardian { guardian_email phone } player_id } }' });

    const guardian = ((res.body.data as { person: { guardian: Record<string, unknown> } })?.person?.guardian);
    expect(guardian?.guardian_email).toBe('[redacted]');
    expect(guardian?.phone).toBe('[redacted]');
  });

  it('limits arrays to 3 items with omission notice', async () => {
    const manyRecords = Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, team_name: `Team ${i}` }));
    mockSeGraphql.mockResolvedValueOnce({ nodes: manyRecords });
    const res = await request(app)
      .post('/api/v1/integrations/se-explorer/graphql')
      .send({ query: 'query { nodes { id team_name } }' });

    const nodes = (res.body.data as { nodes: unknown[] })?.nodes;
    expect(nodes?.length).toBe(4); // 3 items + omission string
    expect(typeof nodes?.[3]).toBe('string');
    expect(String(nodes?.[3])).toMatch(/omitted/);
  });

  it('does not trigger any DB writes', async () => {
    const { db } = require('../../db');
    mockSeGraphql.mockResolvedValueOnce({ ok: true });
    await request(app)
      .post('/api/v1/integrations/se-explorer/graphql')
      .send({ query: 'query { organization { id } }' });
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });
});
