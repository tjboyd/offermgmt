/**
 * CSV Import API tests
 *
 * Covers:
 *  - GET /template/teams → 200, text/csv with correct headers
 *  - GET /template/players → 200, text/csv with correct headers
 *  - POST /import/teams valid CSV commit=false → preview with created array
 *  - POST /import/teams duplicate name same division → skipped
 *  - POST /import/teams duplicate name different division → updated
 *  - POST /import/teams missing name column → row error
 *  - POST /import/teams empty csv → 400
 *  - POST /import/players valid rows commit=false → preview with valid array
 *  - POST /import/players unknown team_name → valid row with teamFound=false
 *  - POST /import/players missing parent_email → row error
 *  - POST /import/players no active season and no seasonId → 400
 *  - POST /import/teams board role → 200
 *  - POST /import/teams head_coach → 403
 */

import request from 'supertest';
import { createApp } from '../../app';

const ADMIN_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001';

// ─── Auth middleware mock ─────────────────────────────────────────────────────

jest.mock('../../middleware/auth', () => {
  const original = jest.requireActual('../../middleware/auth');
  return {
    ...original,
    authenticate: jest.fn((req: { user: unknown }, _res: unknown, next: () => void) => {
      req.user = (global as unknown as Record<string, unknown>).__csvImportUser ?? {
        id: ADMIN_ID, role: 'admin', tokenVersion: 0,
      };
      next();
    }),
    requireRole: original.requireRole,
  };
});

function setUser(role: string) {
  (global as unknown as Record<string, unknown>).__csvImportUser = {
    id: ADMIN_ID, role, tokenVersion: 0,
  };
}

// ─── DB mock ──────────────────────────────────────────────────────────────────

// We control what each select() call resolves to via a queue.
// Each test pushes results for each expected select call in order.
let selectQueue: unknown[][] = [];

const insertMock = {
  values: jest.fn().mockReturnThis(),
  onConflictDoUpdate: jest.fn().mockResolvedValue(undefined),
};

const updateMock = {
  set: jest.fn().mockReturnThis(),
  where: jest.fn().mockResolvedValue(undefined),
};

// Helper: build a fully-chainable thenable that resolves to `rows`
function makeQueryBuilder(rows: unknown[]) {
  const thenable = {
    then: (fn: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(fn, rej),
    catch: (fn: (e: unknown) => unknown) => Promise.resolve(rows).catch(fn),
  };
  const self: Record<string, unknown> = {
    ...thenable,
    where:  jest.fn(() => self),
    limit:  jest.fn(() => self),
    offset: jest.fn(() => self),
    orderBy: jest.fn(() => self),
    from:   jest.fn(() => self),
  };
  return self;
}

// ─── UserService mock ─────────────────────────────────────────────────────────

const mockInviteUser = jest.fn();
jest.mock('../../services/UserService', () => ({
  inviteUser: (...args: unknown[]) => mockInviteUser(...args),
}));

jest.mock('../../db', () => {
  // Mock drizzle column objects — just need to be non-null objects so eq() won't throw
  const col = (name: string) => ({ name, table: {}, getSQL: () => ({ sql: name, params: [] }) });

  return {
    db: {
      select: jest.fn((_fields?: unknown) => {
        const rows = selectQueue.shift() ?? [];
        return makeQueryBuilder(rows);
      }),
      insert: jest.fn(() => insertMock),
      update: jest.fn(() => updateMock),
    },
    config:  { key: col('key'), value: col('value') },
    teams:   { id: col('id'), name: col('name'), division: col('division') },
    players: { seasonId: col('season_id'), teamId: col('team_id'), firstName: col('first_name'),
               lastName: col('last_name'), dateOfBirth: col('date_of_birth'), grade: col('grade'),
               parentName: col('parent_name'), parentEmail: col('parent_email'), notes: col('notes') },
    seasons: { id: col('id') },
    users:   { email: col('email') },
    integrations: {},
  };
});

// ─── App ──────────────────────────────────────────────────────────────────────

const app = createApp();


// ─── Helpers ──────────────────────────────────────────────────────────────────

// Import the mocked db so we can re-wire select after clearAllMocks
import { db as mockDb } from '../../db';

function resetMocks() {
  setUser('admin');
  selectQueue = [];
  // Only clear call counts, not implementations, to avoid wiping jest.fn() impls
  jest.clearAllMocks();
  // Re-wire implementations that clearAllMocks wiped
  (mockDb.select as jest.Mock).mockImplementation((_fields?: unknown) => {
    const rows = selectQueue.shift() ?? [];
    return makeQueryBuilder(rows);
  });
  insertMock.values.mockReturnThis();
  insertMock.onConflictDoUpdate.mockResolvedValue(undefined);
  updateMock.set.mockReturnThis();
  updateMock.where.mockResolvedValue(undefined);
  mockInviteUser.mockResolvedValue({ userId: 'new-user-uuid', inviteToken: 'tok' });
}

// ─── GET /template/teams ─────────────────────────────────────────────────────

describe('GET /api/v1/import/template/teams', () => {
  beforeEach(resetMocks);

  it('returns 200 with text/csv content type', async () => {
    const res = await request(app).get('/api/v1/import/template/teams');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
  });

  it('CSV has correct headers: name,division', async () => {
    const res = await request(app).get('/api/v1/import/template/teams');
    const headerLine = res.text.split('\n').find(l => !l.trim().startsWith('#') && l.trim());
    expect(headerLine?.trim()).toBe('name,division');
  });
});

// ─── GET /template/players ────────────────────────────────────────────────────

describe('GET /api/v1/import/template/players', () => {
  beforeEach(resetMocks);

  it('returns 200 with text/csv content type', async () => {
    const res = await request(app).get('/api/v1/import/template/players');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
  });

  it('CSV has correct headers including first_name and parent_email', async () => {
    const res = await request(app).get('/api/v1/import/template/players');
    const headerLine = res.text.split('\n').find(l => !l.trim().startsWith('#') && l.trim());
    expect(headerLine).toContain('first_name');
    expect(headerLine).toContain('parent_email');
  });
});

// ─── POST /import/teams ───────────────────────────────────────────────────────

describe('POST /api/v1/import/teams', () => {
  beforeEach(resetMocks);

  it('valid CSV commit=false → preview with created array', async () => {
    // select() for existing teams → empty (no existing teams)
    selectQueue = [[]];

    const csv = 'name,division\n12U Gold,AAA\n10U Red,AA';
    const res = await request(app)
      .post('/api/v1/import/teams')
      .send({ csv, commit: false });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.commit).toBe(false);
    expect(res.body.created).toHaveLength(2);
    expect(res.body.created[0].name).toBe('12U Gold');
    expect(res.body.created[0].division).toBe('AAA');
    expect(res.body.errors).toHaveLength(0);
  });

  it('duplicate name with same division → skipped', async () => {
    selectQueue = [[{ id: 'uuid-1', name: '12U Gold', division: 'AAA' }]];

    const csv = 'name,division\n12U Gold,AAA';
    const res = await request(app)
      .post('/api/v1/import/teams')
      .send({ csv, commit: false });

    expect(res.status).toBe(200);
    expect(res.body.skipped).toContain('12U Gold');
    expect(res.body.created).toHaveLength(0);
    expect(res.body.updated).toHaveLength(0);
  });

  it('duplicate name with different division → updated', async () => {
    selectQueue = [[{ id: 'uuid-1', name: '12U Gold', division: 'AA' }]];

    const csv = 'name,division\n12U Gold,AAA';
    const res = await request(app)
      .post('/api/v1/import/teams')
      .send({ csv, commit: false });

    expect(res.status).toBe(200);
    expect(res.body.updated).toHaveLength(1);
    expect(res.body.updated[0].name).toBe('12U Gold');
    expect(res.body.updated[0].division).toBe('AAA');
  });

  it('row missing name value → row error', async () => {
    selectQueue = [[]];

    const csv = 'name,division\n,AAA\n10U Red,AA';
    const res = await request(app)
      .post('/api/v1/import/teams')
      .send({ csv, commit: false });

    expect(res.status).toBe(200);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].row).toBe(2);
    expect(res.body.errors[0].message).toMatch(/name is required/i);
  });

  it('empty csv → 400', async () => {
    const res = await request(app)
      .post('/api/v1/import/teams')
      .send({ csv: '' });

    expect(res.status).toBe(400);
  });

  it('no csv field → 400', async () => {
    const res = await request(app)
      .post('/api/v1/import/teams')
      .send({});

    expect(res.status).toBe(400);
  });
});

// ─── POST /import/players ─────────────────────────────────────────────────────

describe('POST /api/v1/import/players', () => {
  beforeEach(resetMocks);

  it('valid rows commit=false → preview with valid array', async () => {
    // select 1: config (active_season_id)
    // select 2: season verify
    // select 3: teams lookup
    selectQueue = [
      [{ key: 'active_season_id', value: 'season-uuid-1' }],
      [{ id: 'season-uuid-1' }],
      [{ id: 'team-uuid-1', name: '12U Gold' }],
    ];

    const csv = 'first_name,last_name,team_name,grade,date_of_birth,parent_name,parent_email,notes\nJohn,Smith,12U Gold,7th,2012-03-15,Jane Smith,jsmith@example.com,Pitcher';
    const res = await request(app)
      .post('/api/v1/import/players')
      .send({ csv, commit: false });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.valid).toHaveLength(1);
    expect(res.body.valid[0].firstName).toBe('John');
    expect(res.body.valid[0].teamFound).toBe(true);
    expect(res.body.errors).toHaveLength(0);
  });

  it('unknown team_name → valid row with teamFound=false', async () => {
    selectQueue = [
      [{ key: 'active_season_id', value: 'season-uuid-1' }],
      [{ id: 'season-uuid-1' }],
      [], // no teams
    ];

    const csv = 'first_name,last_name,team_name,parent_email\nJohn,Smith,Unknown Team,jsmith@example.com';
    const res = await request(app)
      .post('/api/v1/import/players')
      .send({ csv, commit: false });

    expect(res.status).toBe(200);
    expect(res.body.valid).toHaveLength(1);
    expect(res.body.valid[0].teamFound).toBe(false);
    expect(res.body.errors).toHaveLength(0);
  });

  it('missing parent_email value → row error', async () => {
    selectQueue = [
      [{ key: 'active_season_id', value: 'season-uuid-1' }],
      [{ id: 'season-uuid-1' }],
      [],
    ];

    const csv = 'first_name,last_name,parent_email\nJohn,Smith,';
    const res = await request(app)
      .post('/api/v1/import/players')
      .send({ csv, commit: false });

    expect(res.status).toBe(200);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].message).toMatch(/parent_email is required/i);
  });

  it('no active season and no seasonId → 400', async () => {
    selectQueue = [
      [], // config returns empty → no active_season_id
    ];

    const csv = 'first_name,last_name,parent_email\nJohn,Smith,jsmith@example.com';
    const res = await request(app)
      .post('/api/v1/import/players')
      .send({ csv, commit: false });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no active season/i);
  });
});

// ─── GET /template/users ─────────────────────────────────────────────────────

describe('GET /api/v1/import/template/users', () => {
  beforeEach(resetMocks);

  it('returns 200 with text/csv content type', async () => {
    const res = await request(app).get('/api/v1/import/template/users');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
  });

  it('CSV has correct column headers: email,full_name,role,team_names', async () => {
    const res = await request(app).get('/api/v1/import/template/users');
    const headerLine = res.text.split('\n').find(l => !l.trim().startsWith('#') && l.trim());
    expect(headerLine?.trim()).toBe('email,full_name,role,team_names');
  });
});

// ─── POST /import/users ───────────────────────────────────────────────────────

describe('POST /api/v1/import/users', () => {
  beforeEach(resetMocks);

  it('valid CSV commit=false → preview with invited array', async () => {
    // select 1: teams, select 2: existing users
    selectQueue = [
      [{ id: 'team-1', name: '12U Gold' }],
      [], // no existing users
    ];

    const csv = 'email,full_name,role,team_names\ncoach@example.com,John Smith,head_coach,12U Gold';
    const res = await request(app)
      .post('/api/v1/import/users')
      .send({ csv, commit: false });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.commit).toBe(false);
    expect(res.body.invited).toHaveLength(1);
    expect(res.body.invited[0].email).toBe('coach@example.com');
    expect(res.body.invited[0].fullName).toBe('John Smith');
    expect(res.body.invited[0].role).toBe('head_coach');
    expect(mockInviteUser).not.toHaveBeenCalled();
  });

  it('invalid role → row error', async () => {
    selectQueue = [
      [], // teams
      [], // existing users
    ];

    const csv = 'email,full_name,role,team_names\nbad@example.com,Bad User,superuser,';
    const res = await request(app)
      .post('/api/v1/import/users')
      .send({ csv, commit: false });

    expect(res.status).toBe(200);
    expect(res.body.invited).toHaveLength(0);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].row).toBe(2);
    expect(res.body.errors[0].message).toMatch(/invalid role/i);
  });

  it('unknown team_name → warning but row still in invited', async () => {
    selectQueue = [
      [], // no teams in DB
      [], // no existing users
    ];

    const csv = 'email,full_name,role,team_names\ncoach@example.com,Coach Name,head_coach,Nonexistent Team';
    const res = await request(app)
      .post('/api/v1/import/users')
      .send({ csv, commit: false });

    expect(res.status).toBe(200);
    expect(res.body.invited).toHaveLength(1);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].message).toMatch(/unknown team/i);
  });

  it('head_coach → 403 (forbidden)', async () => {
    setUser('head_coach');

    const csv = 'email,full_name,role,team_names\ncoach@example.com,Coach,head_coach,';
    const res = await request(app)
      .post('/api/v1/import/users')
      .send({ csv, commit: false });

    expect(res.status).toBe(403);
  });

  it('board role → 403 (admin only)', async () => {
    setUser('board');

    const csv = 'email,full_name,role,team_names\ncoach@example.com,Coach,head_coach,';
    const res = await request(app)
      .post('/api/v1/import/users')
      .send({ csv, commit: false });

    expect(res.status).toBe(403);
  });
});

// ─── Role authorization ───────────────────────────────────────────────────────

describe('Role authorization for /api/v1/import/teams', () => {
  beforeEach(resetMocks);

  it('board role → 200 (allowed)', async () => {
    setUser('board');
    selectQueue = [[]];

    const csv = 'name,division\n12U Gold,AAA';
    const res = await request(app)
      .post('/api/v1/import/teams')
      .send({ csv, commit: false });

    expect(res.status).toBe(200);
  });

  it('head_coach → 403 (forbidden)', async () => {
    setUser('head_coach');

    const csv = 'name,division\n12U Gold,AAA';
    const res = await request(app)
      .post('/api/v1/import/teams')
      .send({ csv, commit: false });

    expect(res.status).toBe(403);
  });
});
