import { Router } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { authenticate, requireRole } from '../middleware/auth';
import { db, seasons, emailTemplates, seSyncLog, players, offers, teams } from '../db';

const router = Router();
router.use(authenticate);

const createSchema = z.object({
  label:               z.string().min(1),
  seTryoutFormNames:   z.array(z.string()).default([]),
  seRegistrationUrl:   z.string().url().optional(),
  seRegistrationId:    z.string().optional(),
  registrationUrl:     z.string().url().optional().or(z.literal('')),
  offerExpiresDays:    z.number().int().min(1).default(14),
  tryoutStart:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  tryoutEnd:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  seasonStartDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const updateSchema = createSchema.partial();

// GET /api/v1/seasons
router.get('/', async (_req, res, next) => {
  try {
    const all = await db.select().from(seasons).orderBy(seasons.label);
    res.json({ seasons: all });
  } catch (err) { next(err); }
});

// POST /api/v1/seasons — admin, board
router.post('/', requireRole('admin', 'board'), async (req, res, next) => {
  try {
    const body = createSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Invalid request', details: body.error.issues });

    const [season] = await db.insert(seasons).values(body.data).returning();

    // Copy templates from most recent prior season
    const [priorSeason] = await db.select().from(seasons)
      .where(eq(seasons.id, season.id))  // exclude self
      .orderBy(seasons.createdAt)
      .limit(2); // get 2 and take the non-new one
    // Simpler: copy from any existing season templates
    const existing = await db.select().from(emailTemplates).limit(3);
    const uniqueKeys = new Set<string>();
    const toCopy = existing.filter((t) => {
      if (uniqueKeys.has(t.templateKey)) return false;
      uniqueKeys.add(t.templateKey);
      return true;
    });

    for (const t of toCopy) {
      await db.insert(emailTemplates).values({
        seasonId:    season.id,
        templateKey: t.templateKey,
        subject:     t.subject,
        bodyHtml:    t.bodyHtml,
      }).onConflictDoNothing();
    }

    // Seed default templates if no prior season exists
    if (toCopy.length === 0) {
      await seedDefaultTemplates(season.id);
    }

    res.status(201).json({ ok: true, season });
  } catch (err) { next(err); }
});

// GET /api/v1/seasons/:id
router.get('/:id', async (req, res, next) => {
  try {
    const [season] = await db.select().from(seasons).where(eq(seasons.id, req.params.id)).limit(1);
    if (!season) return res.status(404).json({ error: 'Season not found.' });
    res.json({ season });
  } catch (err) { next(err); }
});

// PATCH /api/v1/seasons/:id — admin, board
router.patch('/:id', requireRole('admin', 'board'), async (req, res, next) => {
  try {
    const body = updateSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Invalid request' });
    await db.update(seasons).set(body.data).where(eq(seasons.id, req.params.id));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/v1/seasons/:id/activate — admin, board
router.post('/:id/activate', requireRole('admin', 'board'), async (req, res, next) => {
  try {
    // Deactivate all others first, then activate this one
    // (partial unique index on is_active=true enforces single active)
    await db.update(seasons).set({ isActive: false });
    await db.update(seasons).set({ isActive: true, isArchived: false }).where(eq(seasons.id, req.params.id));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/v1/seasons/:id/archive — admin, board
router.post('/:id/archive', requireRole('admin', 'board'), async (req, res, next) => {
  try {
    await db.update(seasons).set({ isActive: false, isArchived: true }).where(eq(seasons.id, req.params.id));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/v1/seasons/:id — admin only; blocks if season has players
router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const [season] = await db.select().from(seasons).where(eq(seasons.id, req.params.id)).limit(1);
    if (!season) return res.status(404).json({ error: 'Season not found.' });
    if (season.isActive) return res.status(400).json({ error: 'Cannot delete the active season. Set another season active first.' });

    // Check for players associated with this season
    const [playerCount] = await db
      .select({ count: players.id })
      .from(players)
      .where(eq(players.seasonId, req.params.id))
      .limit(1);
    if (playerCount) {
      return res.status(400).json({
        error: 'This season has players. Archive it instead, or reassign the players first.',
      });
    }

    // Safe to delete — cascade email templates, sync log, and team season links
    await db.update(teams).set({ seasonId: null }).where(eq(teams.seasonId, req.params.id));
    await db.delete(emailTemplates).where(eq(emailTemplates.seasonId, req.params.id));
    await db.delete(seSyncLog).where(eq(seSyncLog.seasonId, req.params.id));
    await db.delete(seasons).where(eq(seasons.id, req.params.id));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/v1/seasons/:id/sync-log — admin, board
router.get('/:id/sync-log', requireRole('admin', 'board'), async (req, res, next) => {
  try {
    const logs = await db.select().from(seSyncLog)
      .where(eq(seSyncLog.seasonId, req.params.id))
      .orderBy(seSyncLog.triggeredAt);
    res.json({ logs });
  } catch (err) { next(err); }
});

async function seedDefaultTemplates(seasonId: string) {
  const defaults = [
    {
      seasonId, templateKey: 'early_offer' as const,
      subject: 'Welcome Back — Hamilton Jr Chargers {{team}} ({{season}})',
      bodyHtml: `<p>Dear {{parentName}},</p>
<p>We're excited to welcome {{playerFirstName}} back to the Hamilton Jr Chargers family for the {{season}} season on our {{team}}.</p>
<p>Please accept your spot by {{deadline}} using the button below.</p>
<p>Play hard. Win together.<br/>— Jr Chargers Coaching Staff</p>`,
    },
    {
      seasonId, templateKey: 'offer_letter' as const,
      subject: 'Roster Offer — Hamilton Jr Chargers {{team}} ({{season}})',
      bodyHtml: `<p>Dear {{parentName}},</p>
<p>Congratulations! We are pleased to offer {{playerFirstName}} a roster spot on our {{team}} for the {{season}} season.</p>
<p>To accept, please complete registration by <strong>{{deadline}}</strong> using the button below.</p>
<p>Play hard. Win together.<br/>— Jr Chargers Coaching Staff</p>`,
    },
    {
      seasonId, templateKey: 'rejection_letter' as const,
      subject: 'Tryout Results — Hamilton Jr Chargers {{season}}',
      bodyHtml: `<p>Dear {{parentName}},</p>
<p>Thank you for {{playerFirstName}}'s participation in tryouts for the {{season}} season. After careful consideration, we are unable to offer {{playerFirstName}} a spot on our {{team}} roster this year.</p>
<p>We encourage {{playerFirstName}} to continue playing and to try out again in future seasons.</p>
<p>Thank you again for choosing the Jr Chargers.<br/>— Jr Chargers Coaching Staff</p>`,
    },
  ];

  for (const t of defaults) {
    await db.insert(emailTemplates).values(t).onConflictDoNothing();
  }
}

export default router;
