import { Router } from 'express';
import { eq, and, inArray, gte } from 'drizzle-orm';
import { authenticate, injectTeamScope } from '../middleware/auth';
import { db, players, seasons, activityLog, users } from '../db';

const router = Router();
router.use(authenticate, injectTeamScope);

// GET /api/v1/dashboard/stats
router.get('/stats', async (req, res, next) => {
  try {
    const [active] = await db.select({ id: seasons.id, label: seasons.label })
      .from(seasons).where(eq(seasons.isActive, true)).limit(1);
    if (!active) return res.json({ counts: { total: 0, draft: 0, sent: 0, accepted: 0, declined: 0, expired: 0, waitlisted: 0, rejected: 0 }, season: null });

    const conditions = [eq(players.seasonId, active.id)];
    if (req.user!.teamIds?.length) {
      conditions.push(inArray(players.teamId, req.user!.teamIds));
    }

    const rows = await db.select({ status: players.status })
      .from(players).where(and(...conditions));

    const counts = { total: rows.length, draft: 0, sent: 0, accepted: 0, declined: 0, expired: 0, waitlisted: 0, rejected: 0 } as Record<string, number>;
    for (const r of rows) { counts[r.status] = (counts[r.status] ?? 0) + 1; }

    res.json({ counts, season: active });
  } catch (err) { next(err); }
});

// GET /api/v1/dashboard/activity
router.get('/activity', async (req, res, next) => {
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    let query = db.select({
      id:         activityLog.id,
      playerId:   activityLog.playerId,
      offerId:    activityLog.offerId,
      actorLabel: activityLog.actorLabel,
      eventType:  activityLog.eventType,
      detail:     activityLog.detail,
      ts:         activityLog.ts,
    })
    .from(activityLog)
    .where(gte(activityLog.ts, since))
    .orderBy(activityLog.ts)
    .limit(50);

    const items = await query;

    // Filter to team scope for coaches
    if (req.user!.teamIds) {
      const teamPlayerIds = (await db.select({ id: players.id })
        .from(players)
        .where(inArray(players.teamId, req.user!.teamIds)))
        .map((p) => p.id);
      const filtered = items.filter((a) => !a.playerId || teamPlayerIds.includes(a.playerId));
      return res.json({ activity: filtered });
    }

    res.json({ activity: items });
  } catch (err) { next(err); }
});

export default router;
