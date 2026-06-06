/**
 * Branding API tests — /api/v1/org/branding
 *
 * Covers:
 *  - GET returns defaults when db returns empty array
 *  - GET returns saved values when db has them
 *  - PATCH saves valid values → 200, returns updated object
 *  - PATCH rejects invalid hex for brandPrimary → 400
 *  - PATCH with no recognized fields → 400 "No valid fields"
 *  - PATCH returns 403 for role=board and role=head_coach
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
      req.user = (global as unknown as Record<string, unknown>).__brandingUser ?? {
        id: ADMIN_ID, role: 'admin', tokenVersion: 0,
      };
      next();
    }),
    requireRole: original.requireRole,
  };
});

function setUser(role: string) {
  (global as unknown as Record<string, unknown>).__brandingUser = {
    id: ADMIN_ID, role, tokenVersion: 0,
  };
}

// ─── DB mock ──────────────────────────────────────────────────────────────────

// We'll swap out what selectMock resolves to per test.
let selectRows: { key: string; value: string }[] = [];

const insertMock = {
  values: jest.fn().mockReturnThis(),
  onConflictDoUpdate: jest.fn().mockResolvedValue(undefined),
};

jest.mock('../../db', () => ({
  db: {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        // resolve with whatever selectRows holds at call time
        then: (fn: (v: unknown) => unknown) => Promise.resolve(selectRows).then(fn),
        // also support direct await (thenable)
        [Symbol.for('nodejs.rejection')]: undefined,
      })),
    })),
    insert: jest.fn(() => insertMock),
  },
  config: { key: 'key', value: 'value' },
  users: {},
  integrations: {},
  seasons: {},
  players: {},
}));

// ─── App ──────────────────────────────────────────────────────────────────────

const app = createApp();

// ─── GET — defaults ───────────────────────────────────────────────────────────

describe('GET /api/v1/org/branding', () => {
  beforeEach(() => {
    setUser('admin');
    selectRows = [];
    jest.clearAllMocks();
  });

  it('returns defaults when db returns empty array', async () => {
    selectRows = [];
    const res = await request(app).get('/api/v1/org/branding');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      orgName:        'Jr Chargers',
      logoUrl:        null,
      brandPrimary:   '#AD0303',
      brandSecondary: null,
    });
  });

  it('returns saved values when db has them', async () => {
    selectRows = [
      { key: 'org_name',        value: 'My Org' },
      { key: 'logo_url',        value: 'https://example.com/logo.png' },
      { key: 'brand_primary',   value: '#123456' },
      { key: 'brand_secondary', value: '#ABCDEF' },
    ];
    const res = await request(app).get('/api/v1/org/branding');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      orgName:        'My Org',
      logoUrl:        'https://example.com/logo.png',
      brandPrimary:   '#123456',
      brandSecondary: '#ABCDEF',
    });
  });

  it('uses default for missing keys while using saved keys for present ones', async () => {
    selectRows = [{ key: 'org_name', value: 'Custom Name' }];
    const res = await request(app).get('/api/v1/org/branding');
    expect(res.status).toBe(200);
    expect(res.body.orgName).toBe('Custom Name');
    expect(res.body.brandPrimary).toBe('#AD0303');
    expect(res.body.logoUrl).toBeNull();
  });
});

// ─── PATCH ────────────────────────────────────────────────────────────────────

describe('PATCH /api/v1/org/branding', () => {
  beforeEach(() => {
    setUser('admin');
    selectRows = [];
    jest.clearAllMocks();
    insertMock.values.mockReturnThis();
    insertMock.onConflictDoUpdate.mockResolvedValue(undefined);
  });

  it('saves valid values → 200, returns updated branding object', async () => {
    // After the upserts the GET re-fetch should return updated rows
    selectRows = [
      { key: 'org_name',      value: 'New Name' },
      { key: 'brand_primary', value: '#FF0000' },
    ];

    const res = await request(app)
      .patch('/api/v1/org/branding')
      .send({ orgName: 'New Name', brandPrimary: '#FF0000' });

    expect(res.status).toBe(200);
    expect(res.body.orgName).toBe('New Name');
    expect(res.body.brandPrimary).toBe('#FF0000');
    expect(insertMock.values).toHaveBeenCalled();
  });

  it('rejects invalid hex for brandPrimary → 400', async () => {
    const res = await request(app)
      .patch('/api/v1/org/branding')
      .send({ brandPrimary: 'notacolor' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/brandPrimary must be a valid hex color/i);
  });

  it('rejects invalid hex for brandSecondary → 400', async () => {
    const res = await request(app)
      .patch('/api/v1/org/branding')
      .send({ brandSecondary: '123456' }); // missing #

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/brandSecondary must be a valid hex color/i);
  });

  it('returns 400 "No valid fields" when no recognized fields provided', async () => {
    const res = await request(app)
      .patch('/api/v1/org/branding')
      .send({ unknownField: 'whatever' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no valid fields/i);
  });

  it('accepts 3-char hex colors', async () => {
    selectRows = [{ key: 'brand_primary', value: '#F00' }];

    const res = await request(app)
      .patch('/api/v1/org/branding')
      .send({ brandPrimary: '#F00' });

    expect(res.status).toBe(200);
  });

  it('returns 403 for role=board', async () => {
    setUser('board');
    const res = await request(app)
      .patch('/api/v1/org/branding')
      .send({ orgName: 'Hacked' });
    expect(res.status).toBe(403);
  });

  it('returns 403 for role=head_coach', async () => {
    setUser('head_coach');
    const res = await request(app)
      .patch('/api/v1/org/branding')
      .send({ orgName: 'Hacked' });
    expect(res.status).toBe(403);
  });
});
