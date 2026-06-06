import { Router } from 'express';
import { z } from 'zod';
import { eq, inArray } from 'drizzle-orm';
import { authenticate, requireRole, injectTeamScope } from '../middleware/auth';
import { db, teams, players, userTeamAssignments, users } from '../db';

const router = Router();
router.use(authenticate, injectTeamScope);

const createSchema = z.object({
  name:       z.string().min(1),
  division:   z.string().optional(),
  divisionId: z.string().uuid().nullable().optional(),
  seasonId:   z.string().uuid().nullable().optional(),
});
const updateSchema = createSchema.partial();

// GET /api/v1/teams
router.get('/', async (req, res, next) => {
  try {
    const all = await db.select().from(teams).orderBy(teams.name);
    // Non-admin/board: filter to assigned teams only
    const visible = req.user!.teamIds
      ? all.filter((t) => req.user!.teamIds!.includes(t.id))
      : all;
    res.json({ teams: visible });
  } catch (err) { next(err); }
});

// POST /api/v1/teams — admin, board
router.post('/', requireRole('admin', 'board'), async (req, res, next) => {
  try {
    const body = createSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Invalid request', details: body.error.issues });
    const [team] = await db.insert(teams).values(body.data).returning();
    res.status(201).json({ ok: true, team });
  } catch (err) { next(err); }
});

// POST /api/v1/teams/bulk-delete — admin only
router.post('/bulk-delete', requireRole('admin'), async (req, res, next) => {
  try {
    const schema = z.object({ ids: z.array(z.string().uuid()).min(1) });
    const body = schema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Invalid request', details: body.error.issues });
    const { ids } = body.data;
    await db.transaction(async (tx) => {
      await tx.update(players).set({ teamId: null }).where(inArray(players.teamId, ids));
      await tx.delete(userTeamAssignments).where(inArray(userTeamAssignments.teamId, ids));
      await tx.delete(teams).where(inArray(teams.id, ids));
    });
    res.json({ ok: true, deleted: ids.length });
  } catch (err) { next(err); }
});

// DELETE /api/v1/teams — admin only (delete ALL teams)
router.delete('/', requireRole('admin'), async (req, res, next) => {
  try {
    const existing = await db.select({ id: teams.id }).from(teams);
    await db.transaction(async (tx) => {
      await tx.update(players).set({ teamId: null });
      await tx.delete(userTeamAssignments);
      await tx.delete(teams);
    });
    res.json({ ok: true, deleted: existing.length });
  } catch (err) { next(err); }
});

// PATCH /api/v1/teams/:id — admin, board
router.patch('/:id', requireRole('admin', 'board'), async (req, res, next) => {
  try {
    const body = updateSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Invalid request' });
    await db.update(teams).set(body.data).where(eq(teams.id, req.params.id));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// PATCH /api/v1/teams/:id/deactivate — admin, board (archive/deactivate)
router.patch('/:id/deactivate', requireRole('admin', 'board'), async (req, res, next) => {
  try {
    await db.update(teams).set({ isActive: false }).where(eq(teams.id, req.params.id));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// PATCH /api/v1/teams/:id/activate — admin, board (restore from archived)
router.patch('/:id/activate', requireRole('admin', 'board'), async (req, res, next) => {
  try {
    await db.update(teams).set({ isActive: true }).where(eq(teams.id, req.params.id));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/v1/teams/:id/coaches — admin, board
router.get('/:id/coaches', requireRole('admin', 'board'), async (req, res, next) => {
  try {
    const coaches = await db
      .select({
        userId:     userTeamAssignments.userId,
        roleAtTeam: userTeamAssignments.roleAtTeam,
        fullName:   users.fullName,
        email:      users.email,
        role:       users.role,
      })
      .from(userTeamAssignments)
      .innerJoin(users, eq(users.id, userTeamAssignments.userId))
      .where(eq(userTeamAssignments.teamId, req.params.id));
    res.json({ coaches });
  } catch (err) { next(err); }
});

// PATCH /api/v1/teams/:id/coaches — admin, board
router.patch('/:id/coaches', requireRole('admin', 'board'), async (req, res, next) => {
  try {
    const schema = z.object({
      coaches: z.array(z.object({
        userId:     z.string().uuid(),
        roleAtTeam: z.enum(['head_coach', 'assistant_coach']),
      })),
    });
    const body = schema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Invalid request' });

    // Replace all assignments for this team
    await db.delete(userTeamAssignments).where(eq(userTeamAssignments.teamId, req.params.id));
    if (body.data.coaches.length > 0) {
      await db.insert(userTeamAssignments).values(
        body.data.coaches.map((c) => ({ ...c, teamId: req.params.id }))
      );
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/v1/teams/:id — admin only
router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    await db.transaction(async (tx) => {
      await tx.update(players).set({ teamId: null }).where(eq(players.teamId, req.params.id));
      await tx.delete(userTeamAssignments).where(eq(userTeamAssignments.teamId, req.params.id));
      await tx.delete(teams).where(eq(teams.id, req.params.id));
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
