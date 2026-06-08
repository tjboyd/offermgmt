/**
 * Public routes — no JWT required.
 * /accept/:token   — offer acceptance landing page
 * /decline/:token  — offer decline landing page
 * /webhooks/sendgrid — SendGrid event webhooks
 *
 * The acceptance/decline pages are server-rendered plain HTML so they work
 * on any mobile browser without JavaScript.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { eq, and, isNull } from 'drizzle-orm';
import crypto from 'crypto';
import { db, offers, players, seasons, users, userTeamAssignments, config } from '../db';
import { validateAcceptToken, validateDeclineToken } from '../services/TokenService';
import { logParentEvent } from '../services/ActivityService';
import { sendViaActiveProvider } from '../services/EmailService';

const router = Router();

// ─── Acceptance landing page ──────────────────────────────────────────────────

router.get('/accept/:token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = await validateAcceptToken(req.params.token);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(await renderAcceptPage(validation, req.params.token));
  } catch (err) { next(err); }
});

router.post('/accept/:token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = await validateAcceptToken(req.params.token);

    if (validation.state !== 'valid') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(await renderAcceptPage(validation, req.params.token));
    }

    // Accept — use a transaction-style update to prevent races
    const [updated] = await db.update(offers).set({
      acceptedAt:      new Date(),
      landingViewedAt: new Date(),
    })
    .where(and(
      eq(offers.acceptToken, req.params.token),
      isNull(offers.acceptedAt),
      isNull(offers.declinedAt),
    ))
    .returning({ id: offers.id, playerId: offers.playerId, seasonId: offers.seasonId });

    if (!updated) {
      // Race condition — re-validate and show current state
      const revalidated = await validateAcceptToken(req.params.token);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(await renderAcceptPage(revalidated, req.params.token));
    }

    // Update player status
    await db.update(players).set({ status: 'accepted', updatedAt: new Date() })
      .where(eq(players.id, updated.playerId));

    // Log activity
    await logParentEvent('offer_accepted', { playerId: updated.playerId, offerId: updated.id });

    // Send confirmation email (async, don't block redirect)
    sendConfirmationEmail(updated.playerId, updated.seasonId, updated.id).catch(console.error);

    // Notify coaches (async)
    notifyCoaches(updated.playerId, updated.id, 'accepted').catch(console.error);

    // Show confirmation page with registration link
    const regUrl  = validation.registrationUrl ?? validation.seRegistrationUrl;
    const branding = await getBranding();
    const orgName  = branding.orgName ?? 'Jr Chargers';
    const season   = validation.season?.label ?? 'the upcoming season';
    const playerName = validation.player ? `${validation.player.firstName} ${validation.player.lastName}` : 'your player';
    const confirmationText = branding.acceptConfirmationText
      ?? `Thank you — <strong>${playerName}</strong>'s acceptance for the <strong>${orgName} ${season}</strong> has been confirmed. A confirmation email has been sent to you.`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(pageShell(branding, `<div class="success">
      <h1>✓ Offer accepted!</h1>
      <p>${confirmationText}</p>
      ${regUrl ? `<p style="margin-top:16px;font-size:14px;color:#155724">When you're ready, complete your registration using the button below:</p>
      <a href="${regUrl}" class="btn-accept" style="background:#2d6a4f;margin-top:4px">Complete Registration →</a>` : ''}
    </div>`));
  } catch (err) { next(err); }
});

// ─── Decline landing page ─────────────────────────────────────────────────────

router.get('/decline/:token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = await validateDeclineToken(req.params.token);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(await renderDeclinePage(validation, req.params.token));
  } catch (err) { next(err); }
});

router.post('/decline/:token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = await validateDeclineToken(req.params.token);

    if (validation.state !== 'valid') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(await renderDeclinePage(validation, req.params.token));
    }

    const [updated] = await db.update(offers).set({
      declinedAt:      new Date(),
      landingViewedAt: new Date(),
    })
    .where(and(
      eq(offers.declineToken, req.params.token),
      isNull(offers.acceptedAt),
      isNull(offers.declinedAt),
    ))
    .returning({ id: offers.id, playerId: offers.playerId });

    if (updated) {
      await db.update(players).set({ status: 'declined', updatedAt: new Date() })
        .where(eq(players.id, updated.playerId));
      await logParentEvent('offer_declined', { playerId: updated.playerId, offerId: updated.id });
      notifyCoaches(updated.playerId, updated.id, 'declined').catch(console.error);
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(await renderDeclinePage({ ...validation, state: 'already_declined' }, req.params.token));
  } catch (err) { next(err); }
});

// ─── SendGrid webhook ─────────────────────────────────────────────────────────

router.post('/webhooks/sendgrid', async (req: Request, res: Response) => {
  // Always respond 200 quickly to avoid SendGrid retry storms
  res.sendStatus(200);

  try {
    // Verify signature if key is configured
    const sigKey = process.env.SENDGRID_WEBHOOK_SIGNING_KEY;
    if (sigKey && sigKey !== 'dev_placeholder') {
      const sig       = req.headers['x-twilio-email-event-webhook-signature'] as string;
      const timestamp = req.headers['x-twilio-email-event-webhook-timestamp'] as string;
      if (!verifySendGridSignature(sigKey, sig, timestamp, JSON.stringify(req.body))) {
        console.warn('[webhook] Invalid SendGrid signature — ignoring');
        return;
      }
    }

    const events = Array.isArray(req.body) ? req.body : [req.body];

    for (const event of events) {
      if (!event.sg_message_id) continue;
      const msgId = event.sg_message_id.split('.')[0]; // strip batch suffix

      if (event.event === 'open') {
        const [offer] = await db.select({ id: offers.id, playerId: offers.playerId })
          .from(offers)
          .where(eq(offers.sendgridMessageId, msgId))
          .limit(1);

        if (offer && !offer) continue; // type guard
        if (offer) {
          await db.update(offers)
            .set({ openedAt: new Date(event.timestamp * 1000) })
            .where(eq(offers.id, offer.id));
          await logParentEvent('email_opened', { playerId: offer.playerId, offerId: offer.id });
        }
      }
    }
  } catch (err) {
    console.error('[webhook] Error processing SendGrid event:', err);
  }
});

// ─── Async helpers ────────────────────────────────────────────────────────────

async function sendConfirmationEmail(playerId: string, seasonId: string, offerId: string) {
  const [player] = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
  const [season]  = await db.select().from(seasons).where(eq(seasons.id, seasonId)).limit(1);
  if (!player || !season) return;

  const branding  = await getBranding();
  const orgName   = branding.orgName ?? 'Jr Chargers';
  const regUrl    = season.registrationUrl ?? season.seRegistrationUrl;

  const regLine = regUrl
    ? `\n\nPlease complete your registration if you haven't already:\n${regUrl}`
    : '';

  const body = `Dear ${player.parentName ?? 'Parent / Guardian'},\n\nThis confirms that ${player.firstName} ${player.lastName} has accepted their roster offer for the ${orgName} ${season.label} season.${regLine}\n\n— ${orgName} Coaching Staff`;

  try {
    await sendViaActiveProvider([{
      to:       player.parentEmail,
      toName:   player.parentName ?? 'Parent / Guardian',
      subject:  `Offer Accepted — ${orgName} ${season.label}`,
      bodyHtml: `<p>${body.replace(/\n/g, '<br>')}</p>`,
      bodyText: body,
    }]);
    await logParentEvent('confirmation_email_sent', { playerId, offerId });
  } catch (err) {
    console.error('[confirmation email] Failed to send:', err);
  }
}

async function notifyCoaches(playerId: string, offerId: string, event: 'accepted' | 'declined') {
  const [player] = await db.select({ firstName: players.firstName, lastName: players.lastName, teamId: players.teamId })
    .from(players).where(eq(players.id, playerId)).limit(1);
  if (!player?.teamId) return;

  const coaches = await db.select({ email: users.email, fullName: users.fullName })
    .from(userTeamAssignments)
    .innerJoin(users, eq(users.id, userTeamAssignments.userId))
    .where(eq(userTeamAssignments.teamId, player.teamId));

  if (coaches.length === 0) return;

  const action  = event === 'accepted' ? 'accepted their offer' : 'declined their offer';
  const subject = `${player.firstName} ${player.lastName} has ${action}`;
  const body    = `${player.firstName} ${player.lastName} has ${action} for the upcoming season.`;

  try {
    await sendViaActiveProvider(coaches.map((c) => ({
      to: c.email, toName: c.fullName,
      subject, bodyHtml: `<p>${body}</p>`, bodyText: body,
    })));
  } catch (err) {
    console.error('[notify coaches] Failed to send:', err);
  }
}

function verifySendGridSignature(key: string, sig: string, timestamp: string, body: string): boolean {
  try {
    const payload = timestamp + body;
    const hmac    = crypto.createHmac('sha256', key);
    hmac.update(payload);
    const expected = hmac.digest('base64');
    return crypto.timingSafeEqual(Buffer.from(sig, 'base64'), Buffer.from(expected, 'base64'));
  } catch { return false; }
}

// ─── Branding helper ──────────────────────────────────────────────────────────

interface OrgBranding {
  orgName: string | null;
  logoUrl: string | null;
  brandPrimary: string | null;
  orgLocation: string | null;
  orgWebsite: string | null;
  orgContactEmail: string | null;
  acceptPageInstructions: string | null;
  acceptConfirmationText: string | null;
}

async function getBranding(): Promise<OrgBranding> {
  const rows = await db.select({ key: config.key, value: config.value }).from(config);
  const map  = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  function get(key: string): string | null {
    const raw = map[key];
    if (!raw) return null;
    try { const v = JSON.parse(raw); return typeof v === 'string' && v ? v : null; }
    catch { return raw || null; }
  }
  return {
    orgName:                get('org_name'),
    logoUrl:                get('logo_url'),
    brandPrimary:           get('brand_primary'),
    orgLocation:            get('org_location'),
    orgWebsite:             get('org_website'),
    orgContactEmail:        get('org_contact_email'),
    acceptPageInstructions: get('accept_page_instructions'),
    acceptConfirmationText: get('accept_confirmation_text'),
  };
}

// ─── HTML page renderers ──────────────────────────────────────────────────────

function pageStyle(brand: string): string {
  return `
  *,*::before,*::after { box-sizing:border-box; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:#f5f5f5; margin:0; padding:16px; min-height:100vh; }
  .card { max-width:480px; margin:24px auto; background:#fff; border-radius:10px; padding:28px 24px; box-shadow:0 2px 16px rgba(0,0,0,0.09); word-break:break-word; }
  .logo { text-align:center; margin-bottom:20px; }
  .logo-img { max-height:56px; max-width:200px; object-fit:contain; display:block; margin:0 auto 8px; }
  .logo-text { font-size:20px; font-weight:800; font-style:normal; text-transform:uppercase; color:${brand}; letter-spacing:0.02em; }
  .org-name-sub { font-size:22px; font-weight:800; color:${brand}; margin-top:8px; letter-spacing:0.01em; line-height:1.2; }
  h1 { font-size:19px; font-weight:700; margin:0 0 8px; color:#111; line-height:1.3; }
  .player-name { font-size:22px; font-weight:800; color:#111; margin:16px 0 4px; line-height:1.2; }
  .team { font-size:14px; color:#555; margin-bottom:18px; }
  .expires { font-size:13px; color:#888; background:#f9f9f9; border:1px solid #eee; border-radius:4px; padding:10px 14px; margin:14px 0; }
  .instructions { font-size:14px; color:#555; margin:0 0 16px; line-height:1.5; }
  .btn-accept { display:block; background:${brand}; color:#fff; text-align:center; padding:17px 16px; border-radius:6px; font-size:16px; font-weight:700; text-decoration:none; margin:18px 0 10px; border:none; width:100%; cursor:pointer; -webkit-tap-highlight-color:transparent; touch-action:manipulation; }
  .btn-accept:active { opacity:0.85; }
  .btn-decline { display:block; text-align:center; font-size:13px; color:#888; margin-bottom:4px; background:none; border:none; cursor:pointer; text-decoration:underline; width:100%; padding:12px 0; touch-action:manipulation; }
  .success { background:#f0faf3; border:1px solid #c3e6cb; border-radius:6px; padding:18px; color:#155724; }
  .warning { background:#fff3cd; border:1px solid #ffc107; border-radius:6px; padding:18px; color:#856404; }
  .error   { background:#fdf0f0; border:1px solid #f5c6cb; border-radius:6px; padding:18px; color:#721c24; }
  .footer { text-align:center; font-size:11px; color:#bbb; margin-top:20px; }
  @media (max-width:400px) {
    .card { padding:22px 16px; margin:12px auto; border-radius:8px; }
    .player-name { font-size:20px; }
    h1 { font-size:17px; }
    .btn-accept { font-size:15px; padding:16px; }
  }`;
}

function buildFooter(b: OrgBranding): string {
  const name    = b.orgName ?? 'Jr Chargers';
  const parts   = [name];
  if (b.orgLocation) parts.push(b.orgLocation);
  if (b.orgWebsite)  parts.push(`<a href="${b.orgWebsite}" style="color:inherit;text-decoration:none">${b.orgWebsite.replace(/^https?:\/\//, '')}</a>`);
  return parts.join(' · ');
}

function buildLogoHtml(b: OrgBranding): string {
  const name = b.orgName ?? 'Jr Chargers';
  if (b.logoUrl) {
    return `<div class="logo">
      <img src="${b.logoUrl}" class="logo-img" alt="${name}" />
      <div class="org-name-sub">${name}</div>
    </div>`;
  }
  return `<div class="logo"><div class="logo-text">${name}</div></div>`;
}

function pageShell(b: OrgBranding, content: string): string {
  const brand = b.brandPrimary ?? '#AD0303';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${b.orgName ?? 'Jr Chargers'} — Offer Response</title>
  <style>${pageStyle(brand)}</style>
</head>
<body>
  <div class="card">
    ${buildLogoHtml(b)}
    ${content}
    <div class="footer">${buildFooter(b)}</div>
  </div>
</body>
</html>`;
}

async function renderAcceptPage(v: Awaited<ReturnType<typeof validateAcceptToken>>, token: string): Promise<string> {
  const b = await getBranding();
  const contactEmail = b.orgContactEmail ?? '';

  if (v.state === 'invalid') {
    return pageShell(b, `<div class="error"><h1>Link not valid</h1><p>This offer link is not valid. It may have been copied incorrectly. Please contact your coach for assistance.</p></div>`);
  }
  if (v.state === 'already_accepted') {
    const regUrl = v.registrationUrl ?? v.seRegistrationUrl;
    return pageShell(b, `<div class="success">
      <h1>✓ Offer already accepted</h1>
      <p>You've already confirmed this offer. If you haven't completed registration yet, please do so now.</p>
      ${regUrl ? `<a href="${regUrl}" class="btn-accept">Complete Registration</a>` : ''}
    </div>`);
  }
  if (v.state === 'already_declined') {
    return pageShell(b, `<div class="warning"><h1>Offer declined</h1><p>You've indicated you won't be joining us this season. If this was a mistake, please contact your coach directly.</p></div>`);
  }
  if (v.state === 'expired') {
    const contactLine = contactEmail
      ? `Please contact your coach or email <a href="mailto:${contactEmail}">${contactEmail}</a> to discuss your options.`
      : 'Please contact your coach to discuss your options.';
    return pageShell(b, `<div class="error">
      <h1>Offer expired</h1>
      <p>This offer expired on <strong>${v.expiresAt?.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) ?? 'a previous date'}</strong>.</p>
      <p>${contactLine}</p>
    </div>`);
  }

  const expiryStr = v.expiresAt
    ? v.expiresAt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : '';
  const instructions = b.acceptPageInstructions
    ?? 'Click the button below to confirm your acceptance. You\'ll then be directed to complete your registration.';

  return pageShell(b, `
    <h1>You've received a roster offer!</h1>
    <div class="player-name">${v.player?.firstName ?? ''} ${v.player?.lastName ?? ''}</div>
    <div class="team">${v.team?.name ?? ''} · ${v.season?.label ?? ''}</div>
    ${expiryStr ? `<div class="expires">⏳ Accept by <strong>${expiryStr}</strong> to secure your spot.</div>` : ''}
    <p class="instructions">${instructions}</p>
    <form method="POST" action="/accept/${token}">
      <button type="submit" class="btn-accept">✓ Confirm Acceptance</button>
    </form>
    <form method="POST" action="/decline/${token}">
      <button type="submit" class="btn-decline">Decline this offer</button>
    </form>
  `);
}

async function renderDeclinePage(v: Awaited<ReturnType<typeof validateDeclineToken>>, token: string): Promise<string> {
  const b = await getBranding();

  if (v.state === 'invalid') {
    return pageShell(b, `<div class="error"><h1>Link not valid</h1><p>This link is not valid. Please contact your coach for assistance.</p></div>`);
  }
  if (v.state === 'already_accepted') {
    return pageShell(b, `<div class="success"><h1>Offer already accepted</h1><p>This offer has already been accepted. Contact your coach if you have questions.</p></div>`);
  }
  if (v.state === 'already_declined') {
    return pageShell(b, `<div class="warning"><h1>Offer declined</h1><p>You've confirmed that you won't be joining us this season. We wish you all the best and hope to see you try out again in future seasons.</p><p style="font-size:13px;color:#888;margin-top:12px">If this was a mistake, please contact your coach directly.</p></div>`);
  }
  if (v.state === 'expired') {
    return pageShell(b, `<div class="error"><h1>Offer expired</h1><p>This offer has expired. Please contact your coach if you have questions.</p></div>`);
  }

  const brand = b.brandPrimary ?? '#AD0303';
  return pageShell(b, `
    <h1>Decline this offer?</h1>
    <div class="player-name">${v.player?.firstName ?? ''} ${v.player?.lastName ?? ''}</div>
    <div class="team">${v.team?.name ?? ''} · ${v.season?.label ?? ''}</div>
    <p style="font-size:14px;color:#555;margin:16px 0">Are you sure you want to decline this roster offer? This will notify your coach.</p>
    <p style="font-size:13px;color:#888;margin:0 0 20px">If you've changed your mind, close this page and use the <strong>Accept</strong> link in your original email instead.</p>
    <form method="POST" action="/decline/${token}">
      <button type="submit" class="btn-accept" style="background:#666">Confirm — Decline this offer</button>
    </form>
  `);
}

/** Exported for the admin preview endpoint in branding.ts */
export function renderAcceptPreview(b: OrgBranding, page: 'accept' | 'expired' | 'confirmed' = 'accept'): string {
  if (page === 'confirmed') {
    const orgName  = b.orgName ?? 'Jr Chargers';
    const confirmationText = b.acceptConfirmationText
      ?? `Thank you — <strong>Sample Player</strong>'s acceptance for the <strong>${orgName} 2027 Season</strong> has been confirmed. A confirmation email has been sent to you.`;
    return pageShell(b, `
      <div class="success">
        <h1>✓ Offer accepted!</h1>
        <p>${confirmationText}</p>
        <p style="margin-top:16px;font-size:14px;color:#155724">When you're ready, complete your registration using the button below:</p>
        <a href="#" class="btn-accept" style="background:#2d6a4f;margin-top:4px">Complete Registration →</a>
      </div>
      <p style="font-size:11px;color:#ccc;text-align:center;margin-top:16px">Preview only — sample data shown.</p>
    `);
  }

  if (page === 'expired') {
    const expiryDate = 'June 20, 2026';
    const contactLine = b.orgContactEmail
      ? `Please contact your coach or email <a href="mailto:${b.orgContactEmail}" style="color:#721c24">${b.orgContactEmail}</a> to discuss your options.`
      : 'Please contact your coach to discuss your options.';
    return pageShell(b, `
      <div class="error">
        <h1>Offer expired</h1>
        <p>This offer expired on <strong>${expiryDate}</strong>.</p>
        <p>${contactLine}</p>
      </div>
      <p style="font-size:11px;color:#ccc;text-align:center;margin-top:16px">Preview only — sample data shown.</p>
    `);
  }

  const expiryStr    = 'Saturday, June 20, 2026';
  const instructions = b.acceptPageInstructions
    ?? "Click the button below to confirm your acceptance. You'll then be directed to complete your registration.";
  return pageShell(b, `
    <h1>You've received a roster offer!</h1>
    <div class="player-name">Sample Player</div>
    <div class="team">U8 - RED · 2027 Season</div>
    <div class="expires">⏳ Accept by <strong>${expiryStr}</strong> to secure your spot.</div>
    <p class="instructions">${instructions}</p>
    <div style="background:${b.brandPrimary ?? '#AD0303'};color:#fff;text-align:center;padding:17px 16px;border-radius:6px;font-size:16px;font-weight:700;margin:18px 0 10px">✓ Confirm Acceptance</div>
    <div style="text-align:center;font-size:13px;color:#aaa;text-decoration:underline;padding:8px 0">Decline this offer</div>
    <p style="font-size:11px;color:#ccc;text-align:center;margin-top:8px">Preview only — buttons do not function here.</p>
  `);
}

export default router;
