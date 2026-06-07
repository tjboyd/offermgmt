/**
 * One-time setup endpoint — creates the first admin account if no users exist.
 * Disabled automatically once any user exists in the database.
 */
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db, users } from '../db';

const router = Router();

const setupSchema = z.object({
  fullName: z.string().min(2),
  email:    z.string().email(),
  password: z.string().min(8),
});

// GET /api/v1/setup — check if setup is needed
router.get('/', async (_req: Request, res: Response) => {
  try {
    const existing = await db.select({ id: users.id }).from(users).limit(1);
    res.json({ setupRequired: existing.length === 0 });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/v1/setup — create first admin (only works if no users exist)
router.post('/', async (req: Request, res: Response) => {
  try {
    const existing = await db.select({ id: users.id }).from(users).limit(1);
    if (existing.length > 0) {
      return res.status(403).json({ error: 'Setup already complete. This endpoint is disabled.' });
    }

    const body = setupSchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ error: 'Invalid input', details: body.error.issues });
    }

    const { fullName, email, password } = body.data;
    const passwordHash = await bcrypt.hash(password, 12);

    const [user] = await db.insert(users).values({
      fullName,
      email,
      role:           'admin',
      passwordHash,
      emailVerified:  true,
      isActive:       true,
    }).returning({ id: users.id, email: users.email, role: users.role });

    res.json({ ok: true, user });
  } catch (err: any) {
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'Email already registered.' });
    }
    res.status(500).json({ error: 'Setup failed', detail: String(err) });
  }
});

export default router;
