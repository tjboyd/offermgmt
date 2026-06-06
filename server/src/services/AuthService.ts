import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { db, users, config } from '../db';

const BCRYPT_ROUNDS = 12;
// 8h matches the default session_timeout_hours config value.
// In production, switch back to '15m' and implement a proper refresh-token table.
const ACCESS_TOKEN_TTL = '8h';
const REFRESH_TOKEN_TTL_DAYS = 7;

// In-memory cache for config values (short TTL)
let configCache: Record<string, string> | null = null;
let configCacheAt = 0;
const CONFIG_CACHE_TTL_MS = 60_000;

async function getConfig(): Promise<Record<string, string>> {
  if (configCache && Date.now() - configCacheAt < CONFIG_CACHE_TTL_MS) {
    return configCache;
  }
  const rows = await db.select().from(config);
  configCache = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  configCacheAt = Date.now();
  return configCache;
}

export function invalidateConfigCache() {
  configCache = null;
}

// ─── Password utilities ───────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function validatePassword(password: string): Promise<{ valid: boolean; message?: string }> {
  const cfg = await getConfig();
  const minLen = parseInt(cfg['password_min_length'] ?? '12', 10);
  const requireMixed = cfg['password_require_mixed_case'] === 'true';
  const requireNum = cfg['password_require_number'] === 'true';

  if (password.length < minLen) {
    return { valid: false, message: `Password must be at least ${minLen} characters.` };
  }
  if (requireMixed && (!/[a-z]/.test(password) || !/[A-Z]/.test(password))) {
    return { valid: false, message: 'Password must contain both uppercase and lowercase letters.' };
  }
  if (requireNum && !/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number.' };
  }
  return { valid: true };
}

// ─── Domain allowlist ─────────────────────────────────────────────────────────

export async function validateEmailDomain(email: string): Promise<boolean> {
  const cfg = await getConfig();
  const allowed: string[] = JSON.parse(cfg['allowed_domains'] ?? '["jrchargersbaseball.com"]');
  const domain = email.split('@')[1]?.toLowerCase();
  return allowed.map((d) => d.toLowerCase()).includes(domain ?? '');
}

// ─── JWT ──────────────────────────────────────────────────────────────────────

export interface JwtPayload {
  sub: string;
  role: string;
  tokenVersion: number;
}

function signingKey(): string {
  const key = process.env.JWT_SIGNING_KEY;
  if (!key) throw new Error('JWT_SIGNING_KEY is not set');
  return key;
}

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, signingKey(), { expiresIn: ACCESS_TOKEN_TTL });
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, signingKey()) as JwtPayload;
}

// ─── Refresh tokens ───────────────────────────────────────────────────────────

export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function refreshTokenExpiry(): Date {
  const d = new Date();
  d.setDate(d.getDate() + REFRESH_TOKEN_TTL_DAYS);
  return d;
}

// ─── Invite / reset tokens ────────────────────────────────────────────────────

export function generateInviteToken(): { raw: string; exp: Date } {
  const raw = crypto.randomUUID();
  const exp = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  return { raw, exp };
}

export function generateResetToken(): { raw: string; exp: Date } {
  const raw = crypto.randomUUID();
  const exp = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  return { raw, exp };
}

// ─── Login ────────────────────────────────────────────────────────────────────

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  refreshExpiry: Date;
  user: { id: string; fullName: string; email: string; role: string };
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);

  if (!user) throw new AuthError('Invalid credentials', 401);
  if (!user.isActive) throw new AuthError('Account deactivated', 403);
  if (!user.emailVerified) throw new AuthError('Email not verified. Check your inbox.', 403);
  if (!user.passwordHash) throw new AuthError('Account not yet activated', 403);

  const match = await verifyPassword(password, user.passwordHash);
  if (!match) throw new AuthError('Invalid credentials', 401);

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

  const payload: JwtPayload = { sub: user.id, role: user.role, tokenVersion: user.tokenVersion };
  const accessToken = signAccessToken(payload);
  const refreshToken = generateRefreshToken();
  const refreshExpiry = refreshTokenExpiry();

  return {
    accessToken,
    refreshToken,
    refreshExpiry,
    user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role },
  };
}

export class AuthError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = 'AuthError';
  }
}
