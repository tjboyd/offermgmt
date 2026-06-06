import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { authenticate, requireRole } from '../middleware/auth';
import {
  setIntegration, deleteIntegration, getIntegrationStatus,
  getIntegration, setActiveEmailProvider, setEmailTestMode,
} from '../services/IntegrationsService';
import { seApiClient, SEApiError, SE_ME_URL } from '../services/SEApiClient';
import type { SendGridCredentials, ResendCredentials } from '../services/IntegrationsService';
import { Resend } from 'resend';
import { db, users } from '../db';

const router = Router();
router.use(authenticate);

const seSchema = z.object({
  client_id:     z.string().min(1).optional(),
  client_secret: z.string().min(1).optional(),
  org_id:        z.number().int().positive().optional(),
}).refine(
  (d) => d.client_id || d.client_secret || d.org_id !== undefined,
  { message: 'Provide at least one of: client_id, client_secret, or org_id.' },
);

const sgSchema = z.object({
  api_key:      z.string().min(1).optional(),
  sender_name:  z.string().min(1).optional(),
  sender_email: z.string().email().optional(),
  cc_email:     z.string().email().optional().or(z.literal('')),
  test_email:   z.string().email().optional().or(z.literal('')),
}).refine(d => Object.values(d).some(v => v !== undefined), {
  message: 'Provide at least one field to update.',
});

// GET /api/v1/integrations — masked status only, admin + board
router.get('/', requireRole('admin', 'board'), async (_req, res, next) => {
  try {
    const status = await getIntegrationStatus();
    res.json(status);
  } catch (err) { next(err); }
});

// PUT /api/v1/integrations/sportsengine — admin only
router.put('/sportsengine', requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = seSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Invalid request', details: body.error.issues });

    // Merge with existing — only overwrite fields that were explicitly supplied
    const existing = await getIntegration<{ client_id?: string; client_secret?: string; org_id?: number }>('sportsengine');
    if (!body.data.client_id && !existing?.client_id) {
      return res.status(400).json({ error: 'Client ID is required when no credentials are saved yet.' });
    }
    if (!body.data.client_secret && !existing?.client_secret) {
      return res.status(400).json({ error: 'Client Secret is required when no credentials are saved yet.' });
    }
    await setIntegration('sportsengine', {
      client_id:     body.data.client_id     ?? existing?.client_id     ?? '',
      client_secret: body.data.client_secret ?? existing?.client_secret ?? '',
      org_id:        body.data.org_id        ?? existing?.org_id,
    }, req.user!.id);

    res.json({ ok: true, message: 'SportsEngine credentials saved.' });
  } catch (err) { next(err); }
});

// DELETE /api/v1/integrations/sportsengine — admin only
router.delete('/sportsengine', requireRole('admin'), async (_req, res, next) => {
  try {
    await deleteIntegration('sportsengine');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// PUT /api/v1/integrations/sendgrid — admin only
router.put('/sendgrid', requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = sgSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Invalid request', details: body.error.issues });

    const existing = await getIntegration<SendGridCredentials>('sendgrid');
    const isNew = !existing?.api_key;

    // First-time setup: at minimum an API key is required
    if (isNew && !body.data.api_key) {
      return res.status(400).json({ error: 'API key is required for initial setup.' });
    }

    // Merge — empty string means clear the field; undefined means keep existing
    const merged: SendGridCredentials = {
      api_key:      body.data.api_key      ?? existing?.api_key      ?? '',
      sender_name:  body.data.sender_name  ?? existing?.sender_name  ?? '',
      sender_email: body.data.sender_email ?? existing?.sender_email ?? '',
      cc_email:     body.data.cc_email   !== undefined
        ? (body.data.cc_email   === '' ? undefined : body.data.cc_email)
        : existing?.cc_email,
      test_email:   body.data.test_email !== undefined
        ? (body.data.test_email === '' ? undefined : body.data.test_email)
        : existing?.test_email,
    };

    await setIntegration('sendgrid', merged, req.user!.id);

    res.json({ ok: true, message: 'SendGrid credentials saved.' });
  } catch (err) { next(err); }
});

// DELETE /api/v1/integrations/sendgrid — admin only
router.delete('/sendgrid', requireRole('admin'), async (_req, res, next) => {
  try {
    await deleteIntegration('sendgrid');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/v1/integrations/sportsengine/test — admin + board
router.post('/sportsengine/test', requireRole('admin', 'board'), async (_req, res, next) => {
  try {
    // Use /oauth/me to verify the token is valid (per SE HQ docs)
    const data = await seApiClient.get<{ name?: string; email?: string }>(SE_ME_URL);
    const orgName = data.name ?? 'Connected';
    res.json({ ok: true, orgName });
  } catch (err) {
    if (err instanceof SEApiError) {
      return res.status(err.statusCode).json({ ok: false, error: err.message, code: err.code });
    }
    next(err);
  }
});

// POST /api/v1/integrations/sendgrid/test — admin only
// Sends a test email; recipient priority: req.body.testEmail → sg.test_email → logged-in user
router.post('/sendgrid/test', requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sg = await getIntegration<SendGridCredentials>('sendgrid');
    if (!sg?.api_key) {
      return res.status(503).json({ ok: false, error: 'SendGrid not configured.' });
    }

    let fallbackEmail = '';
    if (!req.body.testEmail && !sg.test_email) {
      const [userRow] = await db.select({ email: users.email }).from(users).where(eq(users.id, req.user!.id)).limit(1);
      fallbackEmail = userRow?.email ?? '';
    }
    const recipientEmail: string = req.body.testEmail ?? sg.test_email ?? fallbackEmail;

    const personalization: { to: { email: string }[]; cc?: { email: string }[] } = {
      to: [{ email: recipientEmail }],
    };
    if (sg.cc_email) {
      personalization.cc = [{ email: sg.cc_email }];
    }

    // Inline fetch to SendGrid API (EmailService used for full sends in M4)
    const sgRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${sg.api_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [personalization],
        from:    { email: sg.sender_email, name: sg.sender_name },
        subject: `${sg.sender_name ?? 'Offer Mgmt'} — SendGrid Test`,
        content: [{ type: 'text/plain', value: 'SendGrid connection is working. You can dismiss this email.' }],
      }),
    });

    if (sgRes.ok || sgRes.status === 202) {
      return res.json({ ok: true, message: 'Test email sent.', isTestMode: true, sentTo: recipientEmail });
    }

    const body = await sgRes.json().catch(() => ({}));
    res.status(400).json({ ok: false, error: 'SendGrid returned an error.', detail: body });
  } catch (err) { next(err); }
});

// ─── Active email provider ────────────────────────────────────────────────────

// PUT /api/v1/integrations/test-mode — admin only
router.put('/test-mode', requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({ enabled: z.boolean() }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'enabled must be a boolean.' });
    await setEmailTestMode(body.data.enabled, req.user!.id);
    res.json({ ok: true, testMode: body.data.enabled });
  } catch (err) { next(err); }
});

// PUT /api/v1/integrations/email-provider — admin only
router.put('/email-provider', requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({ provider: z.enum(['sendgrid', 'resend']) }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'provider must be "sendgrid" or "resend".' });
    await setActiveEmailProvider(body.data.provider, req.user!.id);
    res.json({ ok: true, message: `Active email provider set to ${body.data.provider}.` });
  } catch (err) { next(err); }
});

// ─── Resend ───────────────────────────────────────────────────────────────────

const rsSchema = z.object({
  api_key:      z.string().min(1).optional(),
  sender_name:  z.string().min(1).optional(),
  sender_email: z.string().email().optional(),
  cc_email:     z.string().email().optional().or(z.literal('')),
  test_email:   z.string().email().optional().or(z.literal('')),
}).refine(d => Object.values(d).some(v => v !== undefined), {
  message: 'Provide at least one field to update.',
});

// PUT /api/v1/integrations/resend — admin only
router.put('/resend', requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = rsSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Invalid request', details: body.error.issues });

    const existing = await getIntegration<ResendCredentials>('resend');
    const isNew = !existing?.api_key;

    if (isNew && !body.data.api_key) {
      return res.status(400).json({ error: 'API key is required for initial setup.' });
    }

    const merged: ResendCredentials = {
      api_key:      body.data.api_key      ?? existing?.api_key      ?? '',
      sender_name:  body.data.sender_name  ?? existing?.sender_name  ?? '',
      sender_email: body.data.sender_email ?? existing?.sender_email ?? '',
      cc_email:  body.data.cc_email  !== undefined ? (body.data.cc_email  === '' ? undefined : body.data.cc_email)  : existing?.cc_email,
      test_email: body.data.test_email !== undefined ? (body.data.test_email === '' ? undefined : body.data.test_email) : existing?.test_email,
    };

    await setIntegration('resend', merged, req.user!.id);
    res.json({ ok: true, message: 'Resend credentials saved.' });
  } catch (err) { next(err); }
});

// DELETE /api/v1/integrations/resend — admin only
router.delete('/resend', requireRole('admin'), async (_req, res, next) => {
  try {
    await deleteIntegration('resend');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/v1/integrations/resend/test — admin only
router.post('/resend/test', requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rs = await getIntegration<ResendCredentials>('resend');
    if (!rs?.api_key) {
      return res.status(503).json({ ok: false, error: 'Resend not configured.' });
    }

    let fallbackEmail = '';
    if (!req.body.testEmail && !rs.test_email) {
      const [userRow] = await db.select({ email: users.email }).from(users).where(eq(users.id, req.user!.id)).limit(1);
      fallbackEmail = userRow?.email ?? '';
    }
    const recipientEmail: string = req.body.testEmail ?? rs.test_email ?? fallbackEmail;
    if (!recipientEmail) {
      return res.status(400).json({ ok: false, error: 'No recipient email available for test.' });
    }

    const client = new Resend(rs.api_key);
    const { error } = await client.emails.send({
      from:    `${rs.sender_name} <${rs.sender_email}>`,
      to:      [recipientEmail],
      subject: `${rs.sender_name ?? 'Offer Mgmt'} — Resend Test`,
      text:    'Resend connection is working. You can dismiss this email.',
    });

    if (error) {
      return res.status(400).json({ ok: false, error: 'Resend returned an error.', detail: error });
    }

    res.json({ ok: true, message: 'Test email sent.', sentTo: recipientEmail });
  } catch (err) { next(err); }
});

export default router;
