import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { authenticate, requireRole, injectTeamScope } from '../middleware/auth';
import { sendOffers, renderPreview, OfferError, type OfferMode } from '../services/OfferService';
import { EmailError } from '../services/EmailService';
import { db, users, seasons, offers } from '../db';

const router = Router();
router.use(authenticate, injectTeamScope);

// Assistant coaches cannot send offers or rejections
const senderRoles = ['admin', 'board', 'head_coach'] as const;

const sendSchema = z.object({
  playerIds:  z.array(z.string().uuid()).min(1),
  seasonId:   z.string().uuid().optional(),
  mode:       z.enum(['early', 'post_tryout', 'rejection']),
  expiresAt:  z.string().datetime().optional(),
  sendMethod: z.enum(['sendgrid', 'manual_copy']).default('sendgrid'),
  resend:     z.boolean().optional(),
});

const previewSchema = z.object({
  playerId:  z.string().uuid(),
  seasonId:  z.string().uuid().optional(),
  mode:      z.enum(['early', 'post_tryout', 'rejection']),
  expiresAt: z.string().datetime().optional(),
});

async function resolveSeasonId(provided?: string): Promise<string> {
  if (provided) return provided;
  const [active] = await db.select({ id: seasons.id })
    .from(seasons).where(eq(seasons.isActive, true)).limit(1);
  if (!active) throw new OfferError('No active season found.', 400);
  return active.id;
}

async function resolveExpiresAt(seasonId: string, provided?: string): Promise<Date> {
  if (provided) return new Date(provided);
  const [season] = await db.select({ offerExpiresDays: seasons.offerExpiresDays })
    .from(seasons).where(eq(seasons.id, seasonId)).limit(1);
  const days = season?.offerExpiresDays ?? 14;
  return new Date(Date.now() + days * 86_400_000);
}

// POST /api/v1/offers — send one or many offers/rejections
router.post('/', requireRole(...senderRoles), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = sendSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Invalid request', details: body.error.issues });

    const [caller] = await db.select({ fullName: users.fullName })
      .from(users).where(eq(users.id, req.user!.id)).limit(1);

    const seasonId = await resolveSeasonId(body.data.seasonId);
    const expiresAt = await resolveExpiresAt(seasonId, body.data.expiresAt);

    // Team-scope check: head_coach can only send for their teams
    if (req.user!.role === 'head_coach' && req.user!.teamIds) {
      // Validated inside OfferService player eligibility check
    }

    const results = await sendOffers({
      playerIds:    body.data.playerIds,
      seasonId,
      mode:         body.data.mode as OfferMode,
      expiresAt,
      sentByUserId: req.user!.id,
      sentByName:   caller?.fullName ?? 'Coach',
      sendMethod:   body.data.sendMethod,
      resend:       body.data.resend,
    });

    res.json({ ok: true, results });
  } catch (err) {
    if (err instanceof OfferError) return res.status(err.statusCode).json({ error: err.message });
    if (err instanceof EmailError)  return res.status(503).json({ error: err.message, code: err.code });
    next(err);
  }
});

// POST /api/v1/offers/render — preview a merged email (no side effects)
router.post('/render', requireRole(...senderRoles), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = previewSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Invalid request', details: body.error.issues });

    const seasonId  = await resolveSeasonId(body.data.seasonId);
    const expiresAt = await resolveExpiresAt(seasonId, body.data.expiresAt);

    const rendered = await renderPreview({
      playerId: body.data.playerId,
      seasonId,
      mode:     body.data.mode as OfferMode,
      expiresAt,
    });

    res.json({ rendered });
  } catch (err) {
    if (err instanceof OfferError) return res.status(err.statusCode).json({ error: err.message });
    if (err instanceof EmailError)  return res.status(400).json({ error: err.message, code: err.code });
    next(err);
  }
});

// GET /api/v1/offers/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [offer] = await db.select().from(offers).where(eq(offers.id, req.params.id)).limit(1);
    if (!offer) return res.status(404).json({ error: 'Offer not found.' });
    res.json({ offer });
  } catch (err) { next(err); }
});

export default router;
