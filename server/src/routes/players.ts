import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { eq, and, ilike, or, inArray } from 'drizzle-orm';
import { authenticate, requireRole, injectTeamScope } from '../middleware/auth';
import {
  createPlayer, listPlayers, getPlayer, updatePlayer, deletePlayer,
  setPlayerStatus, setReturningFlag, setEarlyOfferEligible, updateNotes,
  PlayerError,
} from '../services/PlayerService';
import { db, users, activityLog, players, seasons, offers } from '../db';

const router = Router();
router.use(authenticate, injectTeamScope);

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createSchema = z.object({
  firstName:   z.string().min(1),
  lastName:    z.string().min(1),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ageOverride: z.number().int().min(5).max(20).optional(),
  grade:       z.string().optional(),
  parentName:  z.string().optional(),
  parentEmail: z.string().email(),
  teamId:      z.string().uuid(),
  seasonId:    z.string().uuid().optional(),
  notes:       z.string().optional(),
});

const updateSchema = createSchema.partial().omit({ seasonId: true });

const statusSchema = z.object({
  status: z.enum(['draft', 'sent', 'accepted', 'declined', 'expired', 'waitlisted', 'rejected']),
});

const flagSchema = z.object({ value: z.boolean() });

const notesSchema = z.object({ notes: z.string() });

// ─── Helper: get current user's full name ─────────────────────────────────────

async function getUserName(userId: string): Promise<string> {
  const [u] = await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, userId)).limit(1);
  return u?.fullName ?? 'Unknown';
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/v1/players
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = req.query;
    const result = await listPlayers({
      seasonId:   q.seasonId  as string | undefined,
      teamIds:    req.user!.teamIds,           // undefined = all (admin/board)
      teamId:     q.teamId    as string | undefined,
      status:     q.status    as string | undefined,
      search:     q.search    as string | undefined,
      returning:  q.returning === 'true' ? true : undefined,
      earlyOffer: q.earlyOffer === 'true' ? true : undefined,
      page:       q.page     ? parseInt(q.page as string, 10)     : 1,
      perPage:    q.perPage  ? parseInt(q.perPage as string, 10)  : 50,
    });
    res.json(result);
  } catch (err) { next(err); }
});

// POST /api/v1/players — admin, board, head_coach
router.post('/', requireRole('admin', 'board', 'head_coach'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Invalid request', details: body.error.issues });

    // Resolve active season if not supplied
    let seasonId = body.data.seasonId;
    if (!seasonId) {
      const [active] = await db.select({ id: seasons.id }).from(seasons).where(eq(seasons.isActive, true)).limit(1);
      if (!active) return res.status(400).json({ error: 'No active season. Activate a season first.' });
      seasonId = active.id;
    }

    const name = await getUserName(req.user!.id);
    const id = await createPlayer(
      { ...body.data, seasonId },
      req.user!.id, name, req.user!.teamIds,
    );
    res.status(201).json({ ok: true, id });
  } catch (err) {
    if (err instanceof PlayerError) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

// GET /api/v1/players/admin — admin list across all seasons with duplicate detection
// Must be defined BEFORE /:id to avoid being swallowed by the param route
router.get('/admin', requireRole('admin', 'board'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = req.query;
    const seasonId = q.seasonId as string | undefined;
    const search   = q.search   as string | undefined;
    const page     = q.page     ? parseInt(q.page as string, 10) : 1;
    const perPage  = q.perPage  ? parseInt(q.perPage as string, 10) : 100;

    const conditions = [];
    if (seasonId) conditions.push(eq(players.seasonId, seasonId));
    if (search) {
      const s = `%${search}%`;
      conditions.push(or(
        ilike(players.firstName,   s),
        ilike(players.lastName,    s),
        ilike(players.parentEmail, s),
      )!);
    }

    const rows = await db.select({
      id:           players.id,
      seasonId:     players.seasonId,
      teamId:       players.teamId,
      profileId:    players.profileId,
      firstName:    players.firstName,
      lastName:     players.lastName,
      dateOfBirth:  players.dateOfBirth,
      grade:        players.grade,
      parentName:   players.parentName,
      parentEmail:  players.parentEmail,
      status:       players.status,
      isReturning:  players.isReturning,
      importedFromSe: players.importedFromSe,
      createdAt:    players.createdAt,
    })
    .from(players)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(players.lastName, players.firstName, players.createdAt)
    .limit(perPage)
    .offset((page - 1) * perPage);

    const dupKey = (r: typeof rows[number]) =>
      `${r.seasonId}::${r.firstName.toLowerCase()}::${r.lastName.toLowerCase()}::${r.dateOfBirth ?? ''}`;
    const keyCounts = new Map<string, number>();
    for (const r of rows) {
      const k = dupKey(r);
      keyCounts.set(k, (keyCounts.get(k) ?? 0) + 1);
    }

    const enriched = rows.map((r) => ({
      ...r,
      isDuplicate: (keyCounts.get(dupKey(r)) ?? 1) > 1,
    }));

    res.json({ players: enriched, total: enriched.length });
  } catch (err) { next(err); }
});

// GET /api/v1/players/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await getPlayer(req.params.id, req.user!.teamIds);
    res.json(result);
  } catch (err) {
    if (err instanceof PlayerError) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

// PATCH /api/v1/players/:id — admin, board, head_coach
router.patch('/:id', requireRole('admin', 'board', 'head_coach'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = updateSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Invalid request', details: body.error.issues });
    const name = await getUserName(req.user!.id);
    await updatePlayer(req.params.id, body.data, req.user!.id, name, req.user!.teamIds);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof PlayerError) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

// DELETE /api/v1/players/:id — admin, board, head_coach
router.delete('/:id', requireRole('admin', 'board', 'head_coach'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const name = await getUserName(req.user!.id);
    await deletePlayer(req.params.id, req.user!.id, name, req.user!.teamIds);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof PlayerError) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

// PATCH /api/v1/players/:id/status — admin, board, head_coach
router.patch('/:id/status', requireRole('admin', 'board', 'head_coach'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = statusSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Invalid status' });
    const name = await getUserName(req.user!.id);
    await setPlayerStatus(req.params.id, body.data.status, req.user!.id, name);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof PlayerError) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

// PATCH /api/v1/players/:id/returning-flag — all roles
router.patch('/:id/returning-flag', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = flagSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Invalid request' });
    const name = await getUserName(req.user!.id);
    await setReturningFlag(req.params.id, body.data.value, req.user!.id, name, req.user!.teamIds);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof PlayerError) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

// PATCH /api/v1/players/:id/early-offer-eligible — admin, board, head_coach
router.patch('/:id/early-offer-eligible', requireRole('admin', 'board', 'head_coach'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = flagSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Invalid request' });
    const name = await getUserName(req.user!.id);
    await setEarlyOfferEligible(req.params.id, body.data.value, req.user!.id, name, req.user!.role, req.user!.teamIds);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof PlayerError) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

// PATCH /api/v1/players/:id/notes — admin, board, head_coach, assistant_coach
router.patch('/:id/notes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = notesSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Invalid request' });
    const name = await getUserName(req.user!.id);
    await updateNotes(req.params.id, body.data.notes, req.user!.id, name, req.user!.teamIds);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof PlayerError) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

// GET /api/v1/players/:id/activity
router.get('/:id/activity', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [player] = await db.select({ teamId: players.teamId }).from(players).where(eq(players.id, req.params.id)).limit(1);
    if (!player) return res.status(404).json({ error: 'Player not found.' });
    if (req.user!.teamIds && player.teamId && !req.user!.teamIds.includes(player.teamId)) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    const log = await db.select().from(activityLog)
      .where(eq(activityLog.playerId, req.params.id))
      .orderBy(activityLog.ts);
    res.json({ activity: log });
  } catch (err) { next(err); }
});

// ─── Admin-only bulk operations ───────────────────────────────────────────────

// DELETE /api/v1/players/by-season/:seasonId — hard-delete ALL players in a season (admin only)
router.delete('/by-season/:seasonId', requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { seasonId } = req.params;
    const [season] = await db.select({ id: seasons.id }).from(seasons).where(eq(seasons.id, seasonId)).limit(1);
    if (!season) return res.status(404).json({ error: 'Season not found.' });

    // Get player IDs first so we can cascade delete their offers + activity
    const seasonPlayers = await db.select({ id: players.id }).from(players).where(eq(players.seasonId, seasonId));
    const playerIds = seasonPlayers.map((p) => p.id);

    if (playerIds.length > 0) {
      await db.delete(offers).where(inArray(offers.playerId, playerIds));
      await db.delete(players).where(eq(players.seasonId, seasonId));
    }

    res.json({ ok: true, deleted: playerIds.length });
  } catch (err) { next(err); }
});

// PATCH /api/v1/players/:id/merge — set profileId on an existing player (merge with platform profile)
router.patch('/:id/merge', requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const mergeSchema = z.object({
      profileId:   z.string().min(1),
      dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      grade:       z.string().optional(),
      parentName:  z.string().optional(),
      parentEmail: z.string().email().optional(),
    });
    const body = mergeSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Invalid request', details: body.error.issues });

    const [existing] = await db.select().from(players).where(eq(players.id, req.params.id)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Player not found.' });

    // Build update: set profileId and fill any blank fields from SE profile
    const patch: Record<string, unknown> = {
      profileId:      body.data.profileId,
      importedFromSe: true,
      updatedAt:      new Date(),
    };
    if (body.data.dateOfBirth && !existing.dateOfBirth) patch.dateOfBirth = body.data.dateOfBirth;
    if (body.data.grade       && !existing.grade)       patch.grade       = body.data.grade;
    if (body.data.parentName  && !existing.parentName)  patch.parentName  = body.data.parentName;
    if (body.data.parentEmail && existing.parentEmail?.includes('@unknown.placeholder')) {
      patch.parentEmail = body.data.parentEmail;
    }

    await db.update(players).set(patch).where(eq(players.id, req.params.id));
    const name = await getUserName(req.user!.id);
    await db.insert(activityLog).values({
      playerId:   req.params.id,
      userId:     req.user!.id,
      actorLabel: name,
      eventType:  'player_edited',
      detail:     { action: 'merged_profile', profileId: body.data.profileId },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
