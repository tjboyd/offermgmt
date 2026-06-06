/**
 * Auth route integration tests (uses mocked DB + services)
 * Full DB integration tests require a running PostgreSQL instance
 * and live in __integration__/ (run separately in CI with a real DB).
 */

import request from 'supertest';
import { createApp } from '../../app';

// Mock the DB and service layer
jest.mock('../../services/AuthService', () => ({
  login: jest.fn(),
  verifyAccessToken: jest.fn(),
  AuthError: class AuthError extends Error {
    constructor(msg: string, public statusCode: number) { super(msg); }
  },
  signAccessToken: jest.fn(() => 'mock.access.token'),
  generateRefreshToken: jest.fn(() => 'mock-refresh-token'),
  refreshTokenExpiry: jest.fn(() => new Date(Date.now() + 86_400_000)),
}));

jest.mock('../../db', () => ({
  db: { select: jest.fn(() => ({ from: jest.fn(() => ({ where: jest.fn(() => ({ limit: jest.fn(() => Promise.resolve([])) })) })) })) },
  users: {},
}));

const { login, AuthError } = require('../../services/AuthService');

const app = createApp();

describe('POST /api/v1/auth/login', () => {
  it('returns 400 for missing email', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ password: 'pass' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid email format', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'not-an-email', password: 'pass' });
    expect(res.status).toBe(400);
  });

  it('returns 401 for wrong credentials', async () => {
    login.mockRejectedValueOnce(new AuthError('Invalid credentials', 401));
    const res = await request(app).post('/api/v1/auth/login')
      .send({ email: 'coach@jrchargersbaseball.com', password: 'WrongPass1!' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('returns 403 for deactivated account', async () => {
    login.mockRejectedValueOnce(new AuthError('Account deactivated', 403));
    const res = await request(app).post('/api/v1/auth/login')
      .send({ email: 'coach@jrchargersbaseball.com', password: 'AnyPass1!' });
    expect(res.status).toBe(403);
  });

  it('returns 200 + accessToken + sets refresh cookie on success', async () => {
    login.mockResolvedValueOnce({
      accessToken:    'access.token.here',
      refreshToken:   'refresh-token-here',
      refreshExpiry:  new Date(Date.now() + 86_400_000),
      user:           { id: 'u1', fullName: 'Mike Reilly', email: 'coach@jrchargersbaseball.com', role: 'head_coach' },
    });
    const res = await request(app).post('/api/v1/auth/login')
      .send({ email: 'coach@jrchargersbaseball.com', password: 'SecurePass1!' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.role).toBe('head_coach');
    expect(res.headers['set-cookie']).toBeDefined();
  });
});

describe('POST /api/v1/auth/activate', () => {
  it('returns 400 for non-UUID token', async () => {
    const res = await request(app).post('/api/v1/auth/activate')
      .send({ token: 'not-a-uuid', password: 'SecurePass1!' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing password', async () => {
    const res = await request(app).post('/api/v1/auth/activate')
      .send({ token: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('returns 401 without a JWT', async () => {
    const res = await request(app).post('/api/v1/auth/logout');
    expect(res.status).toBe(401);
  });
});
