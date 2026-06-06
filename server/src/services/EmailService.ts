/**
 * EmailService — transactional email via SendGrid + manual-copy render path.
 * All sends go through this service so send method is always tracked.
 */
import { eq, and } from 'drizzle-orm';
import { db, emailTemplates, seasons, teams, players as playersTable } from '../db';
import { getIntegration, getActiveEmailProvider, getEmailTestMode } from './IntegrationsService';
import type { SendGridCredentials, ResendCredentials } from './IntegrationsService';
import { Resend } from 'resend';
import { mergeFields, buildMergeContext } from '../utils/merge';
import { logEvent } from './ActivityService';

const SENDGRID_API = 'https://api.sendgrid.com/v3/mail/send';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TemplateKey = 'early_offer' | 'offer_letter' | 'rejection_letter';

export interface RenderedEmail {
  to:       string;
  toName:   string;
  subject:  string;
  bodyHtml: string;
  bodyText: string;  // plain-text version stripped from HTML for copy path
}

export interface SendResult {
  messageId: string | null;
  method:    'sendgrid' | 'resend' | 'manual_copy';
}

export class EmailError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'EmailError';
  }
}

// ─── Template fetch + render ──────────────────────────────────────────────────

export async function renderTemplate(
  templateKey: TemplateKey,
  seasonId: string,
  playerId: string,
  deadlineDate: Date,
  acceptToken?: string,
  declineToken?: string,
): Promise<RenderedEmail> {
  // Load template
  const [tmpl] = await db.select()
    .from(emailTemplates)
    .where(and(eq(emailTemplates.seasonId, seasonId), eq(emailTemplates.templateKey, templateKey)))
    .limit(1);

  if (!tmpl) throw new EmailError(`Template '${templateKey}' not found for season ${seasonId}`, 'TEMPLATE_NOT_FOUND');

  // Load player + team + season
  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, playerId)).limit(1);
  if (!player) throw new EmailError('Player not found', 'PLAYER_NOT_FOUND');

  const [season] = await db.select().from(seasons).where(eq(seasons.id, seasonId)).limit(1);
  const [team]   = player.teamId
    ? await db.select().from(teams).where(eq(teams.id, player.teamId)).limit(1)
    : [undefined];

  const baseUrl      = process.env.OFFERS_BASE_URL ?? 'http://localhost:3001';
  const acceptUrl    = acceptToken  ? `${baseUrl}/accept/${acceptToken}`  : '';
  const declineUrl   = declineToken ? `${baseUrl}/decline/${declineToken}` : '';
  const deadlineStr  = deadlineDate.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const ctx = buildMergeContext({
    playerFirstName: player.firstName,
    playerLastName:  player.lastName,
    parentName:      player.parentName ?? 'Parent / Guardian',
    teamName:        team?.name ?? 'Jr Chargers',
    seasonLabel:     season?.label ?? '',
    deadline:        deadlineStr,
    acceptUrl,
    declineUrl,
    registrationUrl: season?.registrationUrl ?? '',
  });

  const subject  = mergeFields(tmpl.subject,  ctx);
  const bodyHtml = mergeFields(tmpl.bodyHtml, ctx);

  // Inject branded button HTML for offer templates
  const finalHtml = injectButtons(bodyHtml, templateKey, acceptUrl, declineUrl);
  const bodyText  = htmlToText(finalHtml);

  return {
    to:       player.parentEmail,
    toName:   player.parentName ?? 'Parent / Guardian',
    subject,
    bodyHtml: finalHtml,
    bodyText,
  };
}

// ─── SendGrid send ────────────────────────────────────────────────────────────

export async function sendViaSendGrid(emails: RenderedEmail[]): Promise<string[]> {
  const sg = await getIntegration<SendGridCredentials>('sendgrid');
  if (!sg?.api_key) {
    throw new EmailError(
      'SendGrid is not configured. Go to Settings → Integrations → Email.',
      'SENDGRID_NOT_CONFIGURED',
    );
  }
  if (!sg.sender_email) {
    throw new EmailError(
      'SendGrid sender email is not set. Go to Settings → Integrations → Email → Sender Identity.',
      'SENDGRID_SENDER_NOT_CONFIGURED',
    );
  }

  const testMode = await getEmailTestMode();
  const messageIds: string[] = [];

  // Send individually so we get per-player message IDs for tracking
  for (const email of emails) {
    // If test mode is on and a test_email is configured, redirect there
    const redirectTo = (testMode && sg.test_email) ? sg.test_email : null;
    const toEmail    = redirectTo ?? email.to;
    const toName     = redirectTo ? 'Test Recipient' : email.toName;
    const subject    = redirectTo
      ? `[TEST - orig: ${email.to}] ${email.subject}`
      : email.subject;

    const personalization: { to: { email: string; name?: string }[]; cc?: { email: string }[] } = {
      to: [{ email: toEmail, name: toName }],
    };
    if (sg.cc_email) {
      personalization.cc = [{ email: sg.cc_email }];
    }

    const payload = {
      personalizations: [personalization],
      from:             { email: sg.sender_email, name: sg.sender_name },
      subject,
      content: [
        { type: 'text/plain', value: email.bodyText },
        { type: 'text/html',  value: email.bodyHtml },
      ],
      tracking_settings: {
        click_tracking: { enable: true,  enable_text: false },
        open_tracking:  { enable: true },
      },
    };

    const res = await fetch(SENDGRID_API, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${sg.api_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok && res.status !== 202) {
      const body = await res.json().catch(() => ({})) as Record<string, unknown>;
      throw new EmailError(
        `SendGrid returned ${res.status}: ${JSON.stringify(body)}`,
        'SENDGRID_SEND_FAILED',
      );
    }

    // SendGrid returns the message ID in the X-Message-Id header
    const msgId = res.headers.get('x-message-id') ?? res.headers.get('X-Message-ID') ?? null;
    messageIds.push(msgId ?? '');
  }

  return messageIds;
}

// ─── Resend send ──────────────────────────────────────────────────────────────

export async function sendViaResend(emails: RenderedEmail[]): Promise<string[]> {
  const rs = await getIntegration<ResendCredentials>('resend');
  if (!rs?.api_key) {
    throw new EmailError(
      'Resend is not configured. Go to Settings → Integrations → Email.',
      'RESEND_NOT_CONFIGURED',
    );
  }
  if (!rs.sender_email) {
    throw new EmailError(
      'Resend sender email is not set. Go to Settings → Integrations → Email → Sender Identity.',
      'RESEND_SENDER_NOT_CONFIGURED',
    );
  }

  // Build "Name <email>" only when name is present; plain email otherwise
  const buildAddr = (name: string | undefined | null, email: string) =>
    name?.trim() ? `${name.trim()} <${email}>` : email;

  const testMode = await getEmailTestMode();
  const client   = new Resend(rs.api_key);
  const from     = buildAddr(rs.sender_name, rs.sender_email);
  const messageIds: string[] = [];

  for (const email of emails) {
    const redirectTo = (testMode && rs.test_email) ? rs.test_email : null;
    const toEmail    = redirectTo ?? email.to;
    const toName     = redirectTo ? 'Test Recipient' : email.toName;
    const subject    = redirectTo
      ? `[TEST - orig: ${email.to}] ${email.subject}`
      : email.subject;

    const cc = rs.cc_email ? [rs.cc_email] : undefined;

    const { data, error } = await client.emails.send({
      from,
      to:      [buildAddr(toName, toEmail)],
      cc,
      subject,
      html:    email.bodyHtml,
      text:    email.bodyText,
    });

    if (error) {
      throw new EmailError(
        `Resend error: ${error.message}`,
        'RESEND_SEND_FAILED',
      );
    }

    messageIds.push(data?.id ?? '');
  }

  return messageIds;
}

// ─── Unified dispatcher — routes to the active provider ──────────────────────

export async function sendViaActiveProvider(emails: RenderedEmail[]): Promise<{ messageIds: string[]; provider: 'sendgrid' | 'resend' }> {
  const provider = await getActiveEmailProvider();
  if (provider === 'resend') {
    const messageIds = await sendViaResend(emails);
    return { messageIds, provider: 'resend' };
  }
  const messageIds = await sendViaSendGrid(emails);
  return { messageIds, provider: 'sendgrid' };
}

// ─── HTML → plain text ────────────────────────────────────────────────────────

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi,      '\n\n')
    .replace(/<\/li>/gi,     '\n')
    .replace(/<[^>]+>/g,     '')
    .replace(/&amp;/g,       '&')
    .replace(/&lt;/g,        '<')
    .replace(/&gt;/g,        '>')
    .replace(/&quot;/g,      '"')
    .replace(/&#039;/g,      "'")
    .replace(/&nbsp;/g,      ' ')
    .replace(/\n{3,}/g,      '\n\n')
    .trim();
}

// ─── Button injection ─────────────────────────────────────────────────────────

function injectButtons(html: string, key: TemplateKey, acceptUrl: string, declineUrl: string): string {
  if (key === 'rejection_letter') return html;

  const buttonHtml = `
<div style="text-align:center;margin:28px 0 12px">
  <a href="${acceptUrl}"
     style="display:inline-block;background:#AD0303;color:#fff;font-family:Arial,sans-serif;
            font-weight:700;font-size:15px;text-decoration:none;
            padding:14px 32px;border-radius:4px;letter-spacing:0.04em">
    Accept Your Spot
  </a>
</div>
<div style="text-align:center;margin-bottom:8px">
  <a href="${declineUrl}"
     style="font-size:12px;color:#888;font-family:Arial,sans-serif">
    Decline this offer
  </a>
</div>
<p style="font-size:11px;color:#888;text-align:center;font-family:Arial,sans-serif">
  Or copy this link: <span style="color:#AD0303">${acceptUrl}</span>
</p>`;

  // Append before closing body or at end
  return html.replace(/<\/body>/i, buttonHtml + '</body>') + (html.includes('</body>') ? '' : buttonHtml);
}
