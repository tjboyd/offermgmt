/**
 * Offers route tests — role enforcement (assistant_coach blocked).
 */
import request from 'supertest';
import { createApp } from '../../app';

jest.mock('../../middleware/auth', () => {
  const original = jest.requireActual('../../middleware/auth');
  return {
    ...original,
    authenticate: jest.fn((req: { user: unknown }, _res: unknown, next: () => void) => {
      req.user = (global as unknown as Record<string,unknown>).__testUser ?? { id: 'u1', role: 'admin', tokenVersion: 0 };
      next();
    }),
    injectTeamScope: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
    requireRole: original.requireRole,
  };
});

jest.mock('../../services/OfferService', () => ({
  sendOffers:    jest.fn().mockResolvedValue([{ playerId: 'p1', success: true }]),
  renderPreview: jest.fn().mockResolvedValue({ subject: 'Test', bodyHtml: '<p>Test</p>', bodyText: 'Test', to: 'p@x.com', toName: 'Parent' }),
  OfferError: class OfferError extends Error {
    constructor(msg: string, public statusCode: number) { super(msg); }
  },
}));

jest.mock('../../services/EmailService', () => ({
  EmailError: class EmailError extends Error {
    constructor(msg: string, public code: string) { super(msg); }
  },
}));

jest.mock('../../db', () => ({
  db: {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({ limit: jest.fn(() => Promise.resolve([{ fullName: 'Test User', offerExpiresDays: 14 }]) ) })),
      })),
    })),
  },
  users: {}, seasons: {}, offers: {},
}));

function setUser(role: string) {
  (global as unknown as Record<string,unknown>).__testUser = { id: 'u1', role, tokenVersion: 0 };
}

const app = createApp();

describe('POST /api/v1/offers — role enforcement', () => {
  it('returns 403 for assistant_coach', async () => {
    setUser('assistant_coach');
    const res = await request(app).post('/api/v1/offers')
      .set('Authorization', 'Bearer mock')
      .send({ playerIds: ['00000000-0000-0000-0000-000000000001'], mode: 'post_tryout' });
    expect(res.status).toBe(403);
  });

  it('does not return 403 for head_coach', async () => {
    setUser('head_coach');
    const res = await request(app).post('/api/v1/offers')
      .set('Authorization', 'Bearer mock')
      .send({ playerIds: ['00000000-0000-0000-0000-000000000001'], mode: 'post_tryout' });
    expect(res.status).not.toBe(403);
  });

  it('does not return 403 for admin', async () => {
    setUser('admin');
    const res = await request(app).post('/api/v1/offers')
      .set('Authorization', 'Bearer mock')
      .send({ playerIds: ['00000000-0000-0000-0000-000000000001'], mode: 'post_tryout' });
    expect(res.status).not.toBe(403);
  });

  it('returns 400 for empty playerIds', async () => {
    setUser('admin');
    const res = await request(app).post('/api/v1/offers')
      .set('Authorization', 'Bearer mock')
      .send({ playerIds: [], mode: 'post_tryout' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/offers/render — role enforcement', () => {
  it('returns 403 for assistant_coach', async () => {
    setUser('assistant_coach');
    const res = await request(app).post('/api/v1/offers/render')
      .set('Authorization', 'Bearer mock')
      .send({ playerId: '00000000-0000-0000-0000-000000000001', mode: 'offer_letter' });
    expect(res.status).toBe(403);
  });
});
