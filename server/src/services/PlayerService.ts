import { eq, and, inArray, or, ilike, sql } from 'drizzle-orm';
import { db, players, teams, seasons, offers, activityLog } from '../db';
import { logStaffEvent } from './ActivityService';
import type { UserRole } from '../middleware/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreatePlayerInput {
  firstName:   string;
  lastName:    string;
  dateOfBirth?: string;
  ageOverride?: number;
  grade?:      string;
  parentName?: string;
  parentEmail: string;
  teamId:      string;
  seasonId:    string;
  notes?:      string;
}

export interface UpdatePlayerInput {
  firstName?:  string;
  lastName?:   string;
  dateOfBirth?: string;
  ageOverride?: number;
  grade?:      string;
  parentName?: string;
  parentEmail?: string;
  teamId?:     string;
  notes?:      string;
}

export interface PlayerListQuery {
  seasonId?:    string;
  teamIds?:     string[];    // undefined = all teams
  status?:      string;
  teamId?:      string;
  search?:      string;
  returning?:   boolean;
  earlyOffer?:  boolean;
  page?:        number;
  perPage?:     number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Check offer expiry on read and update status if needed. */
async function checkAndExpireOffer(playerId: string): Promise<void> {
  const [latestOffer] = await db.select()
    .from(offers)
    .where(and(eq(offers.playerId, playerId)))
    .orderBy(offers.createdAt)
    .limit(1);

  if (!latestOffer) return;
  if (latestOffer.expiresAt && latestOffer.expiresAt < new Date() &&
      !latestOffer.acceptedAt && !latestOffer.declinedAt) {
    await db.update(players).set({ status: 'expired', updatedAt: new Date() }).where(eq(players.id, playerId));
    await logEvent({ playerId, offerId: latestOffer.id, userId: null, actorLabel: 'System', eventType: 'offer_expired' });
  }
}

import { logEvent } from './ActivityService';

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createPlayer(
  input: CreatePlayerInput,
  createdByUserId: string,
  createdByName: string,
  userTeamIds?: string[],
): Promise<string> {
  // Team-scope enforcement
  if (userTeamIds && !userTeamIds.includes(input.teamId)) {
    throw new PlayerError('You can only add players to your assigned team(s).', 403);
  }

  const [player] = await db.insert(players).values({
    ...input,
    dateOfBirth:    input.dateOfBirth ?? null,
    ageOverride:    input.ageOverride ?? null,
    grade:          input.grade       ?? null,
    parentName:     input.parentName  ?? null,
    notes:          input.notes       ?? null,
    status:         'draft',
    importedFromSe: false,
    createdBy:      createdByUserId,
  }).returning({ id: players.id });

  await logStaffEvent(createdByUserId, createdByName, 'player_added', {
    playerId: player.id,
    detail:   { source: 'manual' },
  });

  return player.id;
}

// ─── List (team-scoped, filtered) ─────────────────────────────────────────────

export async function listPlayers(query: PlayerListQuery) {
  // Resolve active season if not specified
  let targetSeasonId = query.seasonId;
  if (!targetSeasonId) {
    const [active] = await db.select({ id: seasons.id }).from(seasons).where(eq(seasons.isActive, true)).limit(1);
    targetSeasonId = active?.id;
  }
  if (!targetSeasonId) return { players: [], total: 0 };

  // Build filter conditions
  const conditions = [eq(players.seasonId, targetSeasonId)];

  // Team scope
  if (query.teamIds?.length) {
    conditions.push(inArray(players.teamId, query.teamIds));
  }
  if (query.teamId) {
    conditions.push(eq(players.teamId, query.teamId));
  }
  if (query.status) {
    conditions.push(eq(players.status, query.status as 'draft'));
  }
  if (query.returning === true) {
    conditions.push(eq(players.isReturning, true));
  }
  if (query.earlyOffer === true) {
    conditions.push(eq(players.earlyOfferEligible, true));
  }
  if (query.search) {
    const q = `%${query.search.toLowerCase()}%`;
    conditions.push(or(
      ilike(players.firstName,   q),
      ilike(players.lastName,    q),
      ilike(players.parentName,  q),
      ilike(players.parentEmail, q),
    )!);
  }

  const where = and(...conditions);
  const page    = query.page    ?? 1;
  const perPage = query.perPage ?? 50;

  const rows = await db.select({
    id:                 players.id,
    seasonId:           players.seasonId,
    teamId:             players.teamId,
    profileId:          players.profileId,
    firstName:          players.firstName,
    lastName:           players.lastName,
    dateOfBirth:        players.dateOfBirth,
    ageOverride:        players.ageOverride,
    grade:              players.grade,
    parentName:         players.parentName,
    parentEmail:        players.parentEmail,
    status:             players.status,
    offerType:          players.offerType,
    isReturning:        players.isReturning,
    returningSource:    players.returningSource,
    earlyOfferEligible: players.earlyOfferEligible,
    notes:              players.notes,
    importedFromSe:     players.importedFromSe,
    createdAt:          players.createdAt,
    updatedAt:          players.updatedAt,
  })
  .from(players)
  .where(where)
  .orderBy(players.createdAt)
  .limit(perPage)
  .offset((page - 1) * perPage);

  // Attach latest offer summary per player
  const playerIds = rows.map((r) => r.id);
  let offerMap: Record<string, typeof latestOffer> = {};

  type OfferSummary = {
    id: string; playerId: string; offerType: string | null; sentMethod: string | null;
    sentAt: Date | null; openedAt: Date | null; acceptedAt: Date | null;
    declinedAt: Date | null; expiresAt: Date | null; createdAt: Date;
  };
  const latestOffer: OfferSummary = {} as OfferSummary;

  if (playerIds.length > 0) {
    const offerRows = await db.select({
      id: offers.id, playerId: offers.playerId, offerType: offers.offerType,
      sentMethod: offers.sentMethod, sentAt: offers.sentAt, openedAt: offers.openedAt,
      acceptedAt: offers.acceptedAt, declinedAt: offers.declinedAt,
      expiresAt: offers.expiresAt, createdAt: offers.createdAt,
    })
    .from(offers)
    .where(inArray(offers.playerId, playerIds))
    .orderBy(offers.createdAt);

    // Keep the most recent offer per player
    for (const o of offerRows) {
      offerMap[o.playerId] = o as unknown as typeof latestOffer;
    }
  }

  return {
    players: rows.map((p) => ({ ...p, latestOffer: offerMap[p.id] ?? null })),
    total: rows.length,
  };
}

// ─── Get one ──────────────────────────────────────────────────────────────────

export async function getPlayer(
  id: string,
  userTeamIds?: string[],
) {
  const [player] = await db.select().from(players).where(eq(players.id, id)).limit(1);
  if (!player) throw new PlayerError('Player not found.', 404);

  // Team-scope check
  if (userTeamIds && player.teamId && !userTeamIds.includes(player.teamId)) {
    throw new PlayerError('Access denied.', 403);
  }

  // Check expiry on read
  if (player.status === 'sent') await checkAndExpireOffer(id);

  // Get all offers (timeline)
  const playerOffers = await db.select().from(offers)
    .where(eq(offers.playerId, id))
    .orderBy(offers.createdAt);

  // Get activity log
  const activity = await db.select().from(activityLog)
    .where(eq(activityLog.playerId, id))
    .orderBy(activityLog.ts);

  return { player, offers: playerOffers, activity };
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updatePlayer(
  id: string,
  patch: UpdatePlayerInput,
  userId: string,
  userName: string,
  userTeamIds?: string[],
): Promise<void> {
  const [existing] = await db.select({ teamId: players.teamId }).from(players).where(eq(players.id, id)).limit(1);
  if (!existing) throw new PlayerError('Player not found.', 404);

  if (userTeamIds && existing.teamId && !userTeamIds.includes(existing.teamId)) {
    throw new PlayerError('Access denied.', 403);
  }

  await db.update(players).set({ ...patch, updatedAt: new Date() }).where(eq(players.id, id));
  await logStaffEvent(userId, userName, 'player_edited', { playerId: id });
}

// ─── Delete (soft) ────────────────────────────────────────────────────────────

export async function deletePlayer(
  id: string,
  userId: string,
  userName: string,
  userTeamIds?: string[],
): Promise<void> {
  const [existing] = await db.select({ teamId: players.teamId }).from(players).where(eq(players.id, id)).limit(1);
  if (!existing) throw new PlayerError('Player not found.', 404);

  if (userTeamIds && existing.teamId && !userTeamIds.includes(existing.teamId)) {
    throw new PlayerError('Access denied.', 403);
  }

  await logStaffEvent(userId, userName, 'player_removed', { playerId: id });
  await db.delete(players).where(eq(players.id, id));
}

// ─── Status ───────────────────────────────────────────────────────────────────

export async function setPlayerStatus(
  id: string,
  status: string,
  userId: string,
  userName: string,
): Promise<void> {
  const [existing] = await db.select({ status: players.status }).from(players).where(eq(players.id, id)).limit(1);
  if (!existing) throw new PlayerError('Player not found.', 404);

  await db.update(players).set({ status: status as 'draft', updatedAt: new Date() }).where(eq(players.id, id));
  await logStaffEvent(userId, userName, 'status_changed', {
    playerId: id,
    detail: { from: existing.status, to: status },
  });
}

// ─── Returning flag ───────────────────────────────────────────────────────────

export async function setReturningFlag(
  id: string,
  value: boolean,
  userId: string,
  userName: string,
  userTeamIds?: string[],
): Promise<void> {
  const [existing] = await db.select({ teamId: players.teamId }).from(players).where(eq(players.id, id)).limit(1);
  if (!existing) throw new PlayerError('Player not found.', 404);
  if (userTeamIds && existing.teamId && !userTeamIds.includes(existing.teamId)) {
    throw new PlayerError('Access denied.', 403);
  }

  await db.update(players).set({
    isReturning:         value,
    returningSource:     value ? 'manual' : null,
    returningFlaggedBy:  value ? userId as unknown as null : null,
    returningFlaggedAt:  value ? new Date() : null,
    updatedAt:           new Date(),
  }).where(eq(players.id, id));

  await logStaffEvent(userId, userName, value ? 'returning_flag_set' : 'returning_flag_cleared', {
    playerId: id, detail: { source: 'manual' },
  });
}

// ─── Early offer eligible ─────────────────────────────────────────────────────

export async function setEarlyOfferEligible(
  id: string,
  value: boolean,
  userId: string,
  userName: string,
  userRole: UserRole,
  userTeamIds?: string[],
): Promise<void> {
  if (userRole === 'assistant_coach') {
    throw new PlayerError('Assistant coaches cannot set early offer eligibility.', 403);
  }

  const [existing] = await db.select({ teamId: players.teamId, isReturning: players.isReturning })
    .from(players).where(eq(players.id, id)).limit(1);
  if (!existing) throw new PlayerError('Player not found.', 404);

  if (userTeamIds && existing.teamId && !userTeamIds.includes(existing.teamId)) {
    throw new PlayerError('Access denied.', 403);
  }

  if (value && !existing.isReturning) {
    throw new PlayerError('Player must be marked as returning before setting early offer eligibility.', 400);
  }

  await db.update(players).set({
    earlyOfferEligible: value,
    earlyOfferSetBy:    value ? userId as unknown as null : null,
    earlyOfferSetAt:    value ? new Date() : null,
    updatedAt:          new Date(),
  }).where(eq(players.id, id));

  await logStaffEvent(userId, userName,
    value ? 'early_offer_eligible_set' : 'early_offer_eligible_cleared',
    { playerId: id },
  );
}

// ─── Notes ────────────────────────────────────────────────────────────────────

export async function updateNotes(
  id: string,
  notes: string,
  userId: string,
  userName: string,
  userTeamIds?: string[],
): Promise<void> {
  const [existing] = await db.select({ teamId: players.teamId, notes: players.notes })
    .from(players).where(eq(players.id, id)).limit(1);
  if (!existing) throw new PlayerError('Player not found.', 404);
  if (userTeamIds && existing.teamId && !userTeamIds.includes(existing.teamId)) {
    throw new PlayerError('Access denied.', 403);
  }

  await db.update(players).set({ notes, updatedAt: new Date() }).where(eq(players.id, id));
  await logStaffEvent(userId, userName,
    existing.notes ? 'note_edited' : 'note_added',
    { playerId: id },
  );
}

export class PlayerError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = 'PlayerError';
  }
}
