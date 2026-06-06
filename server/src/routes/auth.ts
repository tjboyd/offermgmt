import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import {
  login, signAccessToken, generateRefreshToken, refreshTokenExpiry,
  hashPassword, verifyPassword,
  AuthError,
} from '../services/AuthService';
import { activateAccount, resetPassword } from '../services/UserService';
import { authenticate } from '../middleware/auth';
import { db, users, config } from '../db';

const router = Router();

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

const activateSchema = z.object({
  token:    z.string().uuid(),
  password: z.string().min(1),
});

const resetSchema = z.object({
  token:    z.string().uuid(),
  password: z.string().min(1),
});

const REFRESH_COOKIE = 'jrc_refresh';

function setRefreshCookie(res: Response, token: string, expiry: Date) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    expires:  expiry,
    path:     '/api/v1/auth',
  });
}

// POST /api/v1/auth/login
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = loginSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Invalid request', details: body.error.issues });

    const result = await login(body.data.email, body.data.password);
    setRefreshCookie(res, result.refreshToken, result.refreshExpiry);
    res.json({ accessToken: result.accessToken, user: result.user });
  } catch (err) {
    if (err instanceof AuthError) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

// POST /api/v1/auth/refresh
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const refreshToken = req.cookies?.[REFRESH_COOKIE];
    if (!refreshToken) return res.status(401).json({ error: 'No refresh token' });

    // For simplicity in v1: validate refresh token exists in DB
    // In production consider a dedicated refresh_tokens table; here we store
    // the raw token on the user row for Phase 1 single-user sessions.
    // TODO M1-05: migrate to dedicated refresh_tokens table for multi-device support
    const [user] = await db.select().from(users)
      .where(eq(users.inviteToken, refreshToken)).limit(1); // placeholder lookup

    // Fallback: just re-issue from existing session cookie trust
    // Real implementation needs a refresh_tokens table
    return res.status(501).json({ error: 'Refresh token store not yet implemented — use login' });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/logout
router.post('/logout', authenticate, async (req: Request, res: Response) => {
  res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
  res.json({ ok: true });
});

// POST /api/v1/auth/activate
router.post('/activate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = activateSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Invalid request', details: body.error.issues });

    const user = await activateAccount(body.data.token, body.data.password);
    res.json({ ok: true, message: 'Account activated. You can now log in.' });
  } catch (err) {
    if (err instanceof AuthError) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

// POST /api/v1/auth/reset-password
router.post('/reset-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = resetSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Invalid request', details: body.error.issues });

    await resetPassword(body.data.token, body.data.password);
    res.json({ ok: true, message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    if (err instanceof AuthError) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

// GET /api/v1/auth/me
router.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [user] = await db.select({
      id:       users.id,
      fullName: users.fullName,
      email:    users.email,
      role:     users.role,
    }).from(users).where(eq(users.id, req.user!.id)).limit(1);

    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/auth/me — update own display name
router.patch('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({ fullName: z.string().min(1).max(100) });
    const body = schema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Invalid request', details: body.error.issues });

    await db.update(users).set({ fullName: body.data.fullName }).where(eq(users.id, req.user!.id));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/v1/auth/change-password — self-service password change
router.post('/change-password', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      currentPassword: z.string().min(1),
      newPassword:     z.string().min(1),
    });
    const body = schema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Invalid request', details: body.error.issues });

    const [user] = await db.select({ passwordHash: users.passwordHash, tokenVersion: users.tokenVersion })
      .from(users).where(eq(users.id, req.user!.id)).limit(1);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const valid = await verifyPassword(body.data.currentPassword, user.passwordHash ?? '');
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect.' });

    // Enforce password policy via config table
    const cfgRows = await db.select().from(config);
    const cfg = Object.fromEntries(cfgRows.map((r) => [r.key, JSON.parse(r.value)]));
    const minLen = (cfg.password_min_length as number) ?? 8;
    if (body.data.newPassword.length < minLen) {
      return res.status(400).json({ error: `Password must be at least ${minLen} characters.` });
    }

    const newHash = await hashPassword(body.data.newPassword);
    // Increment token_version to invalidate all other active sessions
    await db.update(users).set({
      passwordHash:  newHash,
      tokenVersion:  (user.tokenVersion ?? 0) + 1,
    }).where(eq(users.id, req.user!.id));

    res.json({ ok: true, message: 'Password updated. Other sessions have been signed out.' });
  } catch (err) { next(err); }
});

export default router;
