import { Router } from 'express';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { authenticate, requireRole } from '../middleware/auth';
import { db, emailTemplates } from '../db';

const router = Router();
router.use(authenticate);

const updateSchema = z.object({
  subject:  z.string().min(1),
  bodyHtml: z.string().min(1),
});

// GET /api/v1/email-templates/:seasonId
router.get('/:seasonId', requireRole('admin', 'board'), async (req, res, next) => {
  try {
    const templates = await db.select().from(emailTemplates)
      .where(eq(emailTemplates.seasonId, req.params.seasonId));
    res.json({ templates });
  } catch (err) { next(err); }
});

// PUT /api/v1/email-templates/:seasonId/:key
router.put('/:seasonId/:key', requireRole('admin', 'board'), async (req, res, next) => {
  try {
    const validKeys = ['early_offer', 'offer_letter', 'rejection_letter'];
    if (!validKeys.includes(req.params.key)) {
      return res.status(400).json({ error: 'Invalid template key.' });
    }

    const body = updateSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Invalid request', details: body.error.issues });

    await db.insert(emailTemplates)
      .values({
        seasonId:    req.params.seasonId,
        templateKey: req.params.key as 'early_offer',
        subject:     body.data.subject,
        bodyHtml:    body.data.bodyHtml,
        updatedBy:   req.user!.id,
        updatedAt:   new Date(),
      })
      .onConflictDoUpdate({
        target: [emailTemplates.seasonId, emailTemplates.templateKey],
        set: {
          subject:   body.data.subject,
          bodyHtml:  body.data.bodyHtml,
          updatedBy: req.user!.id,
          updatedAt: new Date(),
        },
      });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
