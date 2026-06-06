import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, injectTeamScope } from '../middleware/auth';
import {
  inviteUser, listUsers, updateUser, deactivateUser,
  reactivateUser, deleteUser, forcePasswordReset, resendInvite,
  forceAllPasswordResets,
} from '../services/UserService';
import { AuthError } from '../services/AuthService';

const router = Router();

// All user management routes require auth
router.use(authenticate);

const inviteSchema = z.object({
  email:    z.string().email(),
  fullName: z.string().min(1),
  role:     z.enum(['admin', 'board', 'head_coach', 'assistant_coach']),
  teamIds:  z.array(z.string().uuid()).optional(),
});

const updateSchema = z.object({
  fullName: z.string().min(1).optional(),
  role:     z.enum(['admin', 'board', 'head_coach', 'assistant_coach']).optional(),
  teamIds:  z.array(z.string().uuid()).optional(),
});

// GET /api/v1/users — admin only
router.get('/', requireRole('admin'), async (req, res, next) => {
  try {
    const result = await listUsers();
    res.json({ users: result });
  } catch (err) { next(err); }
});

// POST /api/v1/users/invite — admin only
router.post('/invite', requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = inviteSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Invalid request', details: body.error.issues });

    const { userId, inviteToken } = await inviteUser({
      ...body.data,
      invitedByRole: req.user!.role,
    });

    // TODO M1-10: send invitation email via EmailService
    // await EmailService.sendInviteEmail(body.data.email, body.data.fullName, inviteToken);

    if (process.env.NODE_ENV !== 'production') {
      const activateUrl = `${process.env.APP_BASE_URL ?? 'http://localhost:5173'}/activate?token=${inviteToken}`;
      console.log(`\n🔗  [DEV] Invite link for ${body.data.email}:\n    ${activateUrl}\n`);
    }

    res.status(201).json({
      ok: true,
      userId,
      message: 'Invitation created. Check server console for the activation link (dev mode).',
      ...(process.env.NODE_ENV !== 'production' ? { devActivateUrl: `${process.env.APP_BASE_URL ?? 'http://localhost:5173'}/activate?token=${inviteToken}` } : {}),
    });
  } catch (err) {
    if (err instanceof AuthError) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

// PATCH /api/v1/users/:id — admin only
router.patch('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const body = updateSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Invalid request', details: body.error.issues });

    await updateUser(req.params.id, body.data, req.user!.role);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

// POST /api/v1/users/:id/force-reset — admin only
router.post('/:id/force-reset', requireRole('admin'), async (req, res, next) => {
  try {
    const { resetToken } = await forcePasswordReset(req.params.id);
    if (process.env.NODE_ENV !== 'production') {
      const resetUrl = `${process.env.APP_BASE_URL ?? 'http://localhost:5173'}/reset-password?token=${resetToken}`;
      console.log(`\n🔗  [DEV] Password reset link:\n    ${resetUrl}\n`);
    }

    res.json({
      ok: true,
      message: 'Password reset triggered. Sessions invalidated. Check server console for reset link (dev).',
      ...(process.env.NODE_ENV !== 'production' ? { devResetUrl: `${process.env.APP_BASE_URL ?? 'http://localhost:5173'}/reset-password?token=${resetToken}` } : {}),
    });
  } catch (err) {
    if (err instanceof AuthError) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

// PATCH /api/v1/users/:id/deactivate — admin only
router.patch('/:id/deactivate', requireRole('admin'), async (req, res, next) => {
  try {
    await deactivateUser(req.params.id, req.user!.id);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

// PATCH /api/v1/users/:id/reactivate — admin only
router.patch('/:id/reactivate', requireRole('admin'), async (req, res, next) => {
  try {
    await reactivateUser(req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/v1/users/:id — admin only
router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    await deleteUser(req.params.id, req.user!.id);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

// POST /api/v1/users/:id/resend-invite — admin only
router.post('/:id/resend-invite', requireRole('admin'), async (req, res, next) => {
  try {
    const { inviteToken } = await resendInvite(req.params.id);
    res.json({
      ok: true,
      message: 'Invitation resent.',
      ...(process.env.NODE_ENV !== 'production' ? { devInviteToken: inviteToken } : {}),
    });
  } catch (err) {
    if (err instanceof AuthError) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

// POST /api/v1/users/force-all-reset — admin only
router.post('/force-all-reset', requireRole('admin'), async (req, res, next) => {
  try {
    await forceAllPasswordResets();
    res.json({ ok: true, message: 'All sessions invalidated. Users must reset passwords on next login.' });
  } catch (err) { next(err); }
});

export default router;
