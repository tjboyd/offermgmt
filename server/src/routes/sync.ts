import { Router, Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import { syncSeason, lookupReturningPlayers } from '../services/SyncService';
import { seApiClient, SEApiError, SETokenCheckResponse } from '../services/SEApiClient';
import { db, seasons, seSyncLog } from '../db';

const router = Router();
router.use(authenticate);

const syncBodySchema = z.object({ seasonId: z.string().uuid().optional() });

// POST /api/v1/sync/tryouts — admin + board only
router.post('/tryouts', requireRole('admin', 'board'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = syncBodySchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Invalid request' });

    // Default to active season if not specified
    let seasonId = body.data.seasonId;
    if (!seasonId) {
      const [active] = await db.select({ id: seasons.id }).from(seasons)
        .where(eq(seasons.isActive, true)).limit(1);
      if (!active) return res.status(400).json({ error: 'No active season found. Create and activate a season first.' });
      seasonId = active.id;
    }

    const result = await syncSeason(seasonId, req.user!.id);
    res.json({ ok: !result.errorMessage, result });
  } catch (err) {
    if (err instanceof SEApiError) {
      return res.status(err.statusCode).json({ error: err.message, code: err.code });
    }
    next(err);
  }
});

// POST /api/v1/sync/returning — admin + board only
router.post('/returning', requireRole('admin', 'board'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = syncBodySchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Invalid request' });

    let seasonId = body.data.seasonId;
    if (!seasonId) {
      const [active] = await db.select({ id: seasons.id }).from(seasons)
        .where(eq(seasons.isActive, true)).limit(1);
      if (!active) return res.status(400).json({ error: 'No active season found.' });
      seasonId = active.id;
    }

    const result = await lookupReturningPlayers(seasonId, req.user!.id);
    res.json({ ok: true, result });
  } catch (err) {
    if (err instanceof SEApiError) {
      return res.status(err.statusCode).json({ error: err.message, code: err.code });
    }
    next(err);
  }
});

// POST /api/v1/sync/test-se — test SE credentials
router.post('/test-se', requireRole('admin', 'board'), async (_req, res, next) => {
  try {
    const data = await seApiClient.get<SETokenCheckResponse>('/v3/organizations/me');
    const orgName = data.organization?.name ?? data.name ?? 'Connected';
    res.json({ ok: true, orgName });
  } catch (err) {
    if (err instanceof SEApiError) {
      return res.status(err.statusCode).json({ ok: false, error: err.message, code: err.code });
    }
    next(err);
  }
});

// GET /api/v1/sync/log — sync log for active (or specified) season
router.get('/log', requireRole('admin', 'board'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const seasonId = req.query.seasonId as string | undefined;

    let targetSeasonId = seasonId;
    if (!targetSeasonId) {
      const [active] = await db.select({ id: seasons.id }).from(seasons)
        .where(eq(seasons.isActive, true)).limit(1);
      targetSeasonId = active?.id;
    }

    if (!targetSeasonId) return res.json({ logs: [] });

    const logs = await db.select({
      id:               seSyncLog.id,
      triggeredAt:      seSyncLog.triggeredAt,
      formNamesQueried: seSyncLog.formNamesQueried,
      recordsFetched:   seSyncLog.recordsFetched,
      recordsNew:       seSyncLog.recordsNew,
      recordsUpdated:   seSyncLog.recordsUpdated,
      recordsSkipped:   seSyncLog.recordsSkipped,
      errorMessage:     seSyncLog.errorMessage,
      completedAt:      seSyncLog.completedAt,
    })
    .from(seSyncLog)
    .where(eq(seSyncLog.seasonId, targetSeasonId))
    .orderBy(seSyncLog.triggeredAt);

    res.json({ logs });
  } catch (err) { next(err); }
});

export default router;
