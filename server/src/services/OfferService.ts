import crypto from 'crypto';
import { eq, and, inArray } from 'drizzle-orm';
import { db, offers, players, seasons } from '../db';
import { renderTemplate, sendViaActiveProvider, type TemplateKey } from './EmailService';
import { logStaffEvent, logParentEvent } from './ActivityService';

export type OfferMode = 'early' | 'post_tryout' | 'rejection';

export interface SendOffersInput {
  playerIds:    string[];
  seasonId:     string;
  mode:         OfferMode;
  expiresAt:    Date;
  sentByUserId: string;
  sentByName:   string;
  sendMethod:   'sendgrid' | 'manual_copy';
  resend?:      boolean;   // bypass status check when explicitly resending
}

export interface RenderPreviewInput {
  playerId:  string;
  seasonId:  string;
  mode:      OfferMode;
  expiresAt: Date;
}

export class OfferError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = 'OfferError';
  }
}

// ─── Map mode → template key ──────────────────────────────────────────────────

function templateKey(mode: OfferMode): TemplateKey {
  if (mode === 'early')     return 'early_offer';
  if (mode === 'rejection') return 'rejection_letter';
  return 'offer_letter';
}

// ─── Validate player is eligible for this mode ────────────────────────────────

async function assertEligible(
  playerId: string,
  mode: OfferMode,
  resend = false,
): Promise<typeof players.$inferSelect> {
  const [player] = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
  if (!player) throw new OfferError(`Player ${playerId} not found.`, 404);

  // Resend bypasses status checks — the caller explicitly chose to resend
  if (!resend) {
    if (mode === 'rejection') {
      if (!['draft', 'waitlisted'].includes(player.status)) {
        throw new OfferError(`Player ${player.firstName} ${player.lastName} is not in draft or waitlisted status.`, 400);
      }
    } else {
      if (!['draft', 'waitlisted', 'expired'].includes(player.status)) {
        throw new OfferError(`Player ${player.firstName} ${player.lastName} already has a ${player.status} offer.`, 400);
      }
    }
  }

  if (mode === 'early' && !player.earlyOfferEligible && !resend) {
    throw new OfferError(`Player ${player.firstName} ${player.lastName} is not marked early offer eligible.`, 400);
  }

  return player;
}

// ─── Render preview (no side effects) ────────────────────────────────────────

export async function renderPreview(input: RenderPreviewInput) {
  const key = templateKey(input.mode);
  // Generate placeholder tokens for preview (not stored)
  const previewAcceptToken  = input.mode !== 'rejection' ? crypto.randomUUID() : undefined;
  const previewDeclineToken = input.mode !== 'rejection' ? crypto.randomUUID() : undefined;

  const rendered = await renderTemplate(
    key, input.seasonId, input.playerId,
    input.expiresAt, previewAcceptToken, previewDeclineToken,
  );

  return rendered;
}

// ─── Send offers (bulk) ───────────────────────────────────────────────────────

export async function sendOffers(input: SendOffersInput) {
  const { playerIds, seasonId, mode, expiresAt, sentByUserId, sentByName, sendMethod, resend } = input;

  const key = templateKey(mode);
  const results: { playerId: string; success: boolean; error?: string }[] = [];

  // Validate and render all before sending any
  const rendered: { playerId: string; email: ReturnType<typeof renderTemplate> extends Promise<infer T> ? T : never; player: typeof players.$inferSelect }[] = [];

  for (const playerId of playerIds) {
    const player = await assertEligible(playerId, mode, resend);

    const acceptToken  = mode !== 'rejection' ? crypto.randomUUID() : undefined;
    const declineToken = mode !== 'rejection' ? crypto.randomUUID() : undefined;

    const email = await renderTemplate(key, seasonId, playerId, expiresAt, acceptToken, declineToken);

    // Create offer row immediately (tokens stored here)
    const [offer] = await db.insert(offers).values({
      playerId,
      seasonId,
      sentBy:     sentByUserId,
      offerType:  mode === 'early' ? 'early' : mode === 'rejection' ? 'rejection' : 'post_tryout',
      sentMethod: sendMethod,
      acceptToken:  acceptToken  ?? null,
      declineToken: declineToken ?? null,
      expiresAt:  mode !== 'rejection' ? expiresAt : null,
      sentAt:     new Date(),
    }).returning();

    rendered.push({ playerId, email, player } as unknown as typeof rendered[0]);

    // Update player status immediately
    const newStatus = mode === 'rejection' ? 'rejected' : 'sent';
    await db.update(players).set({
      status:    newStatus,
      offerType: mode === 'rejection' ? undefined : (mode as 'early' | 'post_tryout'),
      updatedAt: new Date(),
    }).where(eq(players.id, playerId));
  }

  // Bulk send via the active email provider
  if (sendMethod === 'sendgrid') {
    const emails = rendered.map((r) => r.email);
    try {
      const { messageIds } = await sendViaActiveProvider(emails);

      // Update sendgrid_message_id on each offer row (column name kept for backward compat)
      for (let i = 0; i < rendered.length; i++) {
        const offerId = (await db.select({ id: offers.id })
          .from(offers)
          .where(eq(offers.playerId, rendered[i].playerId))
          .orderBy(offers.createdAt)
          .limit(1))[0]?.id;

        if (offerId && messageIds[i]) {
          await db.update(offers).set({ sendgridMessageId: messageIds[i] }).where(eq(offers.id, offerId));
        }
      }
    } catch (err) {
      // Roll back status changes if send failed
      for (const r of rendered) {
        await db.update(players).set({ status: 'draft', updatedAt: new Date() }).where(eq(players.id, r.playerId));
        await db.delete(offers).where(eq(offers.playerId, r.playerId));
      }
      throw err;
    }
  }

  // Log activity for each
  const eventType = mode === 'rejection' ? 'rejection_sent' : mode === 'early' ? 'offer_sent' : 'offer_sent';
  for (const r of rendered) {
    await logStaffEvent(sentByUserId, sentByName, eventType, {
      playerId: r.playerId,
      detail: { method: sendMethod, mode },
    });
  }

  return rendered.map((r) => ({ playerId: r.playerId, success: true }));
}
