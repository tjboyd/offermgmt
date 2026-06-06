import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import { DivisionService } from '../services/DivisionService';

const router = Router();
router.use(authenticate);

const eligibilityModeEnum = z.enum(['none', 'age', 'grade', 'either']);

const createSchema = z.object({
  seasonId:        z.string().uuid(),
  name:            z.string().min(1),
  eligibilityMode: eligibilityModeEnum.optional(),
  ageConstraint:   z.enum(['max_only', 'range']).optional(),
  minAgeYears:     z.number().int().min(0).nullable().optional(),
  maxAgeYears:     z.number().int().min(0).nullable().optional(),
  gradeConstraint: z.enum(['exact', 'not_exceed']).optional(),
  allowedGrades:   z.array(z.string()).nullable().optional(),
  isActive:        z.boolean().optional(),
});

const updateSchema = z.object({
  name:            z.string().min(1).optional(),
  eligibilityMode: eligibilityModeEnum.optional(),
  ageConstraint:   z.enum(['max_only', 'range']).optional(),
  minAgeYears:     z.number().int().min(0).nullable().optional(),
  maxAgeYears:     z.number().int().min(0).nullable().optional(),
  gradeConstraint: z.enum(['exact', 'not_exceed']).optional(),
  allowedGrades:   z.array(z.string()).nullable().optional(),
  isActive:        z.boolean().optional(),
});

// GET /api/v1/divisions?seasonId=
router.get('/', async (req, res, next) => {
  try {
    const { seasonId } = req.query;
    if (!seasonId || typeof seasonId !== 'string') {
      return res.status(400).json({ error: 'seasonId query parameter is required' });
    }
    const divs = await DivisionService.listBySeasonId(seasonId);
    res.json({ divisions: divs });
  } catch (err) { next(err); }
});

// POST /api/v1/divisions — admin, board
router.post('/', requireRole('admin', 'board'), async (req, res, next) => {
  try {
    const body = createSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Invalid request', details: body.error.issues });
    const { seasonId, ...data } = body.data;
    const division = await DivisionService.create(seasonId, data);
    res.status(201).json({ ok: true, division });
  } catch (err) { next(err); }
});

// PATCH /api/v1/divisions/:id — admin, board
router.patch('/:id', requireRole('admin', 'board'), async (req, res, next) => {
  try {
    const body = updateSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Invalid request', details: body.error.issues });
    const division = await DivisionService.update(req.params.id, body.data);
    res.json({ ok: true, division });
  } catch (err: any) {
    if (err?.status === 404) return res.status(404).json({ error: err.message });
    next(err);
  }
});

// DELETE /api/v1/divisions/:id — admin, board
router.delete('/:id', requireRole('admin', 'board'), async (req, res, next) => {
  try {
    await DivisionService.delete(req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/v1/divisions/:id/eligibility/:playerId
router.get('/:id/eligibility/:playerId', async (req, res, next) => {
  try {
    const { seasonStartDate } = req.query;
    if (!seasonStartDate || typeof seasonStartDate !== 'string') {
      return res.status(400).json({ error: 'seasonStartDate query parameter is required' });
    }
    const result = await DivisionService.checkPlayerEligibility(
      req.params.playerId,
      req.params.id,
      seasonStartDate
    );
    res.json(result);
  } catch (err: any) {
    if (err?.status === 404) return res.status(404).json({ error: err.message });
    next(err);
  }
});

export default router;
