import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { authenticate, requireRole } from '../middleware/auth';
import { db, config } from '../db';
import { invalidateConfigCache } from '../services/AuthService';

const router = Router();
router.use(authenticate);

// GET /api/v1/config — admin + board
router.get('/', requireRole('admin', 'board'), async (_req, res, next) => {
  try {
    const rows = await db.select().from(config);
    const result = Object.fromEntries(rows.map((r) => {
      try { return [r.key, JSON.parse(r.value)]; }
      catch { return [r.key, r.value]; }   // raw string fallback — never crash
    }));
    res.json({ config: result });
  } catch (err) { next(err); }
});

// PATCH /api/v1/config — admin only
router.patch('/', requireRole('admin'), async (req, res, next) => {
  try {
    const schema = z.record(z.string(), z.unknown());
    const body = schema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Invalid request' });

    for (const [key, value] of Object.entries(body.data)) {
      await db.insert(config)
        .values({ key, value: JSON.stringify(value), updatedBy: req.user!.id })
        .onConflictDoUpdate({
          target: config.key,
          set: { value: JSON.stringify(value), updatedBy: req.user!.id, updatedAt: new Date() },
        });
    }

    invalidateConfigCache();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
