import { Router } from 'express';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { authenticate, requireRole } from '../middleware/auth';
import {
  db, seasons, emailTemplates, wizardProgress,
  players, offers, seSyncLog, activityLog,
} from '../db';
import { getIntegrationStatus } from '../services/IntegrationsService';

const router = Router();
router.use(authenticate, requireRole('admin', 'board'));

// ─── Step 1: Get/save wizard draft ────────────────────────────────────────────

// GET /api/v1/wizard — return in-progress wizard for user, or null
router.get('/', async (req, res, next) => {
  try {
    const [draft] = await db.select().from(wizardProgress)
      .where(eq(wizardProgress.createdBy, req.user!.id))
      .orderBy(desc(wizardProgress.step))
      .limit(1);
    res.json({ draft: draft ?? null });
  } catch (err) { next(err); }
});

// POST /api/v1/wizard/step1 — create/update season draft
const step1Schema = z.object({
  label:             z.string().min(1),
  seTryoutFormNames: z.array(z.string()).default([]),
  seRegistrationUrl: z.string().url().optional(),
  offerExpiresDays:  z.number().int().min(1).default(14),
  tryoutStart:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  tryoutEnd:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  copyFromSeasonId:  z.string().uuid().optional(),
  wizardId:          z.string().uuid().optional(),
});

router.post('/step1', async (req, res, next) => {
  try {
    const body = step1Schema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Invalid request', details: body.error.issues });

    const { wizardId, copyFromSeasonId, ...seasonData } = body.data;

    // Create or update wizard progress
    let draft;
    if (wizardId) {
      [draft] = await db.update(wizardProgress)
        .set({ step: 1, draftData: { ...seasonData, copyFromSeasonId } })
        .where(and(eq(wizardProgress.id, wizardId), eq(wizardProgress.createdBy, req.user!.id)))
        .returning();
    } else {
      [draft] = await db.insert(wizardProgress)
        .values({ createdBy: req.user!.id, step: 1, draftData: { ...seasonData, copyFromSeasonId } })
        .returning();
    }

    // Fetch carry-forward summary from source season
    let carryForward = null;
    if (copyFromSeasonId) {
      const [srcSeason] = await db.select().from(seasons).where(eq(seasons.id, copyFromSeasonId)).limit(1);
      const tmpls = await db.select().from(emailTemplates).where(eq(emailTemplates.seasonId, copyFromSeasonId));
      carryForward = {
        seasonLabel:   srcSeason?.label,
        templateCount: tmpls.length,
      };
    }

    res.json({ ok: true, wizardId: draft.id, carryForward });
  } catch (err) { next(err); }
});

// POST /api/v1/wizard/step2 — save template overrides in draft
router.post('/step2', async (req, res, next) => {
  try {
    const schema = z.object({
      wizardId:  z.string().uuid(),
      templates: z.array(z.object({
        key:     z.string(),
        subject: z.string().min(1),
        bodyHtml:z.string().min(1),
      })).optional(),
    });
    const body = schema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Invalid request' });

    const [existing] = await db.select().from(wizardProgress)
      .where(and(eq(wizardProgress.id, body.data.wizardId), eq(wizardProgress.createdBy, req.user!.id)))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Wizard draft not found.' });

    const draftData = (existing.draftData as Record<string, unknown>) ?? {};
    draftData.templates = body.data.templates ?? draftData.templates ?? [];

    await db.update(wizardProgress)
      .set({ step: 2, draftData })
      .where(eq(wizardProgress.id, body.data.wizardId));

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/v1/wizard/step3-check — run integration health checks
router.post('/step3-check', async (req, res, next) => {
  try {
    const integStatus = await getIntegrationStatus();

    const checks = [
      {
        name:   'SportsEngine',
        status: integStatus.sportsengine.configured ? 'ok' : 'missing',
        detail: integStatus.sportsengine.configured ? 'Credentials configured' : 'No SE credentials saved — sync will not run.',
      },
      {
        name:   'SendGrid',
        status: integStatus.sendgrid.configured ? 'ok' : 'missing',
        detail: integStatus.sendgrid.configured ? 'Credentials configured' : 'No SendGrid API key — email sending will not work.',
      },
    ];

    res.json({ checks });
  } catch (err) { next(err); }
});

// POST /api/v1/wizard/commit — finalize wizard: create season + copy templates + activate
router.post('/commit', async (req, res, next) => {
  try {
    const schema = z.object({ wizardId: z.string().uuid() });
    const body = schema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Invalid request' });

    const [draft] = await db.select().from(wizardProgress)
      .where(and(eq(wizardProgress.id, body.data.wizardId), eq(wizardProgress.createdBy, req.user!.id)))
      .limit(1);
    if (!draft) return res.status(404).json({ error: 'Wizard draft not found.' });

    const data = draft.draftData as {
      label: string;
      seTryoutFormNames?: string[];
      seRegistrationUrl?: string;
      offerExpiresDays?: number;
      tryoutStart?: string;
      tryoutEnd?: string;
      copyFromSeasonId?: string;
      templates?: Array<{ key: string; subject: string; bodyHtml: string }>;
    };

    // 1. Create the season
    const [newSeason] = await db.insert(seasons).values({
      label:             data.label,
      seTryoutFormNames: data.seTryoutFormNames ?? [],
      seRegistrationUrl: data.seRegistrationUrl,
      offerExpiresDays:  data.offerExpiresDays ?? 14,
      tryoutStart:       data.tryoutStart,
      tryoutEnd:         data.tryoutEnd,
    }).returning();

    // 2. Copy templates from source or use wizard overrides
    if (data.copyFromSeasonId) {
      const srcTemplates = await db.select().from(emailTemplates)
        .where(eq(emailTemplates.seasonId, data.copyFromSeasonId));

      for (const t of srcTemplates) {
        const override = data.templates?.find((x) => x.key === t.templateKey);
        await db.insert(emailTemplates).values({
          seasonId:    newSeason.id,
          templateKey: t.templateKey,
          subject:     override?.subject  ?? t.subject,
          bodyHtml:    override?.bodyHtml ?? t.bodyHtml,
          updatedBy:   req.user!.id,
        }).onConflictDoNothing();
      }
    } else if (data.templates?.length) {
      for (const t of data.templates) {
        await db.insert(emailTemplates).values({
          seasonId:    newSeason.id,
          templateKey: t.key as 'early_offer' | 'offer_letter' | 'rejection_letter',
          subject:     t.subject,
          bodyHtml:    t.bodyHtml,
          updatedBy:   req.user!.id,
        }).onConflictDoNothing();
      }
    }

    // 3. Activate the new season
    await db.update(seasons).set({ isActive: false });
    await db.update(seasons).set({ isActive: true }).where(eq(seasons.id, newSeason.id));

    // 4. Remove wizard draft
    await db.delete(wizardProgress).where(eq(wizardProgress.id, draft.id));

    res.json({ ok: true, season: newSeason });
  } catch (err) { next(err); }
});

// DELETE /api/v1/wizard/:id — discard wizard draft
router.delete('/:id', async (req, res, next) => {
  try {
    await db.delete(wizardProgress)
      .where(and(eq(wizardProgress.id, req.params.id), eq(wizardProgress.createdBy, req.user!.id)));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── Reset Data (dev + staging only) ─────────────────────────────────────────

router.post('/reset-data', requireRole('admin'), async (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Reset is not available in production.' });
  }
  const { phrase } = req.body;
  if (phrase !== 'RESET ALL DATA') {
    return res.status(400).json({ error: 'Confirmation phrase required.' });
  }

  try {
    // Clear offer-related data (cascade order)
    await db.delete(activityLog);
    await db.delete(offers);
    await db.delete(players);
    await db.delete(seSyncLog);
    await db.delete(wizardProgress);

    res.json({ ok: true, message: 'All player, offer, and activity data cleared.' });
  } catch (err) { next(err); }
});

export default router;
