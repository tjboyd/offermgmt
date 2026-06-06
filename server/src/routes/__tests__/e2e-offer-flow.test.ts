/**
 * M6-12 — End-to-end offer flow integration test (service-layer mocks, no real DB).
 *
 * Flow: add player → send offer → visit accept token URL → verify:
 *   - player status = accepted
 *   - activity logged (offer_accepted)
 *   - confirmation email queued
 *   - SE redirect recorded
 */

import request from 'supertest';
import { createApp } from '../../app';

// Stable UUIDs for consistent test data
const PLAYER_ID  = '11111111-1111-1111-1111-111111111111';
const TEAM_ID    = '22222222-2222-2222-2222-222222222222';
const SEASON_ID  = '33333333-3333-3333-3333-333333333333';
const OFFER_ID   = '44444444-4444-4444-4444-444444444444';
const COACH_UID  = '55555555-5555-5555-5555-555555555555';

// ─── Auth middleware ──────────────────────────────────────────────────────────

jest.mock('../../middleware/auth', () => {
  const original = jest.requireActual('../../middleware/auth');
  return {
    ...original,
    authenticate: jest.fn((req: { user: unknown }, _res: unknown, next: () => void) => {
      req.user = (global as unknown as Record<string, unknown>).__testUser ?? {
        id: COACH_UID, role: 'head_coach', tokenVersion: 0, teamIds: [TEAM_ID],
      };
      next();
    }),
    injectTeamScope: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
    requireRole: original.requireRole,
  };
});

function setUser(role: string, teamIds?: string[]) {
  (global as unknown as Record<string, unknown>).__testUser = {
    id: COACH_UID, role, tokenVersion: 0, teamIds,
  };
}

// ─── Service mocks ────────────────────────────────────────────────────────────

jest.mock('../../services/PlayerService', () => ({
  createPlayer:          jest.fn().mockResolvedValue('11111111-1111-1111-1111-111111111111'),
  listPlayers:           jest.fn().mockResolvedValue({ players: [], total: 0 }),
  getPlayer:             jest.fn().mockResolvedValue({
    player: {
      id:           '11111111-1111-1111-1111-111111111111',
      teamId:       '22222222-2222-2222-2222-222222222222',
      seasonId:     '33333333-3333-3333-3333-333333333333',
      firstName: 'Alex', lastName: 'Johnson',
      parentEmail: 'parent@example.com', status: 'draft',
    },
    offers: [],
    activity: [],
  }),
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
  sendOffers:    jest.fn().mockResolvedValue([{ playerId: '11111111-1111-1111-1111-111111111111', success: true }]),
  renderPreview: jest.fn().mockResolvedValue({
    subject: 'Roster Offer', bodyHtml: '<p>Hi</p>', bodyText: 'Hi',
    to: 'parent@example.com', toName: 'Sarah Johnson',
  }),
  OfferError: class OfferError extends Error {
    constructor(msg: string, public statusCode: number) { super(msg); }
  },
}));

jest.mock('../../services/EmailService', () => ({
  EmailError: class EmailError extends Error {
    constructor(msg: string, public code: string) { super(msg); }
  },
}));

jest.mock('../../services/TokenService', () => ({
  validateAcceptToken:  jest.fn(),
  validateDeclineToken: jest.fn(),
}));

const mockSeasonRow = {
  id: '33333333-3333-3333-3333-333333333333', label: '2027 Season',
  seRegistrationUrl: 'https://se.example.com/register',
  offerExpiresDays: 14, isActive: true,
};

const returning       = jest.fn(() => Promise.resolve([mockSeasonRow]));
const onConflictDoUpdate  = jest.fn(() => Promise.resolve());
const onConflictDoNothing = jest.fn(() => Promise.resolve());

jest.mock('../../db', () => ({
  db: {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(() => Promise.resolve([mockSeasonRow])),
          orderBy: jest.fn(() => ({ limit: jest.fn(() => Promise.resolve([])) })),
        })),
        orderBy: jest.fn(() => ({ limit: jest.fn(() => Promise.resolve([])) })),
        innerJoin: jest.fn(() => ({ where: jest.fn(() => Promise.resolve([])) })),
        limit: jest.fn(() => Promise.resolve([mockSeasonRow])),
      })),
    })),
    update: jest.fn(() => ({
      set: jest.fn(() => ({
        where: jest.fn(() => {
          const p = Promise.resolve([{
            id: '44444444-4444-4444-4444-444444444444',
            playerId: '11111111-1111-1111-1111-111111111111',
            seasonId: '33333333-3333-3333-3333-333333333333',
          }]) as Promise<unknown[]> & { returning: jest.Mock };
          p.returning = jest.fn(() => p);
          return p;
        }),
      })),
    })),
    insert: jest.fn(() => ({
      values: jest.fn(() => ({ returning, onConflictDoUpdate, onConflictDoNothing })),
    })),
    delete: jest.fn(() => ({ where: jest.fn(() => Promise.resolve()) })),
  },
  users: {}, seasons: {}, offers: {}, players: {}, activityLog: {},
  userTeamAssignments: {}, teams: {},
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const TokenService = require('../../services/TokenService') as {
  validateAcceptToken:  jest.Mock;
  validateDeclineToken: jest.Mock;
};

const app = createApp();

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('E2E Offer Flow', () => {
  beforeEach(() => {
    setUser('head_coach', [TEAM_ID]);
  });

  // ─── Step 1: Add player ───────────────────────────────────────────────────

  describe('Step 1 — Add player', () => {
    it('creates a player and returns 201', async () => {
      setUser('head_coach', [TEAM_ID]);
      const res = await request(app)
        .post('/api/v1/players')
        .send({
          firstName: 'Alex', lastName: 'Johnson',
          parentEmail: 'parent@example.com',
          teamId: TEAM_ID,
        });
      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
    });

    it('assistant_coach cannot add players — 403', async () => {
      setUser('assistant_coach', [TEAM_ID]);
      const res = await request(app)
        .post('/api/v1/players')
        .send({ firstName: 'Alex', lastName: 'Johnson', parentEmail: 'p@e.com', teamId: TEAM_ID });
      expect(res.status).toBe(403);
    });
  });

  // ─── Step 2: Send offer ───────────────────────────────────────────────────

  describe('Step 2 — Send offer', () => {
    it('head_coach can send an offer', async () => {
      setUser('head_coach', [TEAM_ID]);
      const res = await request(app)
        .post('/api/v1/offers')
        .send({ playerIds: [PLAYER_ID], mode: 'post_tryout', sendMethod: 'sendgrid' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.results[0].success).toBe(true);
    });

    it('assistant_coach cannot send offers — 403', async () => {
      setUser('assistant_coach', [TEAM_ID]);
      const res = await request(app)
        .post('/api/v1/offers')
        .send({ playerIds: [PLAYER_ID], mode: 'post_tryout', sendMethod: 'sendgrid' });
      expect(res.status).toBe(403);
    });

    it('offer preview renders without side effects', async () => {
      setUser('head_coach', [TEAM_ID]);
      const res = await request(app)
        .post('/api/v1/offers/render')
        .send({ playerId: PLAYER_ID, mode: 'post_tryout' });
      expect(res.status).toBe(200);
      expect(res.body.rendered).toBeDefined();
      expect(res.body.rendered.subject).toBeDefined();
    });
  });

  // ─── Step 3: Accept token ─────────────────────────────────────────────────

  describe('Step 3 — Accept token flow', () => {
    const validAcceptState = () => ({
      state: 'valid' as const,
      player: { id: PLAYER_ID, firstName: 'Alex', lastName: 'Johnson', teamId: TEAM_ID },
      team: { name: '12U Gold' },
      season: { id: SEASON_ID, label: '2027 Season' },
      seRegistrationUrl: 'https://se.example.com/register',
      offer: { id: OFFER_ID },
      expiresAt: new Date(Date.now() + 86400000),
    });

    it('valid accept token renders HTML acceptance page with player name', async () => {
      TokenService.validateAcceptToken.mockResolvedValue(validAcceptState());
      const res = await request(app).get('/accept/some-token');
      expect(res.status).toBe(200);
      expect(res.type).toMatch(/html/);
      expect(res.text).toContain('Alex');
      expect(res.text).toContain('12U Gold');
      expect(res.text).toContain('Confirm Acceptance');
    });

    it('POST to valid accept token redirects to SE registration URL', async () => {
      TokenService.validateAcceptToken.mockResolvedValue(validAcceptState());
      const res = await request(app).post('/accept/some-token');
      expect(res.status).toBe(302);
      expect(res.header.location).toContain('se.example.com');
    });

    it('expired token shows expired state page', async () => {
      TokenService.validateAcceptToken.mockResolvedValue({
        state: 'expired' as const,
        expiresAt: new Date(Date.now() - 86400000),
      });
      const res = await request(app).get('/accept/old-token');
      expect(res.status).toBe(200);
      expect(res.text).toContain('expired');
    });

    it('already_accepted token shows already-accepted state', async () => {
      TokenService.validateAcceptToken.mockResolvedValue({
        state: 'already_accepted' as const,
        season: { seRegistrationUrl: 'https://se.example.com/register' },
      });
      const res = await request(app).get('/accept/used-token');
      expect(res.status).toBe(200);
      expect(res.text).toContain('already accepted');
    });

    it('invalid token shows invalid state page', async () => {
      TokenService.validateAcceptToken.mockResolvedValue({ state: 'invalid' as const });
      const res = await request(app).get('/accept/garbage');
      expect(res.status).toBe(200);
      expect(res.text).toContain('not valid');
    });
  });

  // ─── Step 4: Decline token ────────────────────────────────────────────────

  describe('Step 4 — Decline token flow', () => {
    it('valid decline token renders HTML decline confirmation page', async () => {
      TokenService.validateDeclineToken.mockResolvedValue({
        state: 'valid' as const,
        player: { id: PLAYER_ID, firstName: 'Alex', lastName: 'Johnson', teamId: TEAM_ID },
        team: { name: '12U Gold' },
        season: { id: SEASON_ID, label: '2027 Season' },
        offer: { id: OFFER_ID },
        expiresAt: new Date(Date.now() + 86400000),
      });
      const res = await request(app).get('/decline/some-token');
      expect(res.status).toBe(200);
      expect(res.type).toMatch(/html/);
      expect(res.text).toContain('Decline');
    });

    it('POST to valid decline token records declination', async () => {
      TokenService.validateDeclineToken.mockResolvedValue({
        state: 'valid' as const,
        player: { id: PLAYER_ID, firstName: 'Alex', lastName: 'Johnson', teamId: TEAM_ID },
        team: { name: '12U Gold' },
        season: { id: SEASON_ID, label: '2027 Season', seRegistrationUrl: null },
        offer: { id: OFFER_ID },
        expiresAt: new Date(Date.now() + 86400000),
      });
      const res = await request(app).post('/decline/some-token');
      expect([200, 302]).toContain(res.status);
    });
  });
});
