import { eq } from 'drizzle-orm';
import { db, offers, players, seasons, teams } from '../db';

export type TokenState =
  | 'valid'
  | 'already_accepted'
  | 'already_declined'
  | 'expired'
  | 'invalid';

export interface TokenValidation {
  state:              TokenState;
  player?:            { firstName: string; lastName: string };
  team?:              { name: string };
  season?:            { label: string };
  expiresAt?:         Date;
  registrationUrl?:   string | null;
  seRegistrationUrl?: string | null;
  offerId?:           string;
}

export async function validateAcceptToken(token: string): Promise<TokenValidation> {
  const [offer] = await db.select({
    id:            offers.id,
    acceptedAt:    offers.acceptedAt,
    declinedAt:    offers.declinedAt,
    expiresAt:     offers.expiresAt,
    playerId:      offers.playerId,
    seasonId:      offers.seasonId,
  }).from(offers).where(eq(offers.acceptToken, token)).limit(1);

  if (!offer) return { state: 'invalid' };
  if (offer.acceptedAt) {
    const urls = await getSeUrl(offer.seasonId);
    return { state: 'already_accepted', ...urls, offerId: offer.id };
  }
  if (offer.declinedAt) return { state: 'already_declined', offerId: offer.id };
  if (offer.expiresAt && new Date() > offer.expiresAt) return { state: 'expired', expiresAt: offer.expiresAt, offerId: offer.id };

  const [player] = await db.select({ firstName: players.firstName, lastName: players.lastName, teamId: players.teamId })
    .from(players).where(eq(players.id, offer.playerId)).limit(1);

  const [season] = await db.select({ label: seasons.label })
    .from(seasons).where(eq(seasons.id, offer.seasonId)).limit(1);

  const team = player?.teamId
    ? (await db.select({ name: teams.name }).from(teams).where(eq(teams.id, player.teamId)).limit(1))[0]
    : undefined;

  const urls = await getSeUrl(offer.seasonId);

  return {
    state:    'valid',
    player:   player ? { firstName: player.firstName, lastName: player.lastName } : undefined,
    team:     team   ? { name: team.name } : undefined,
    season:   season ? { label: season.label } : undefined,
    expiresAt: offer.expiresAt ?? undefined,
    ...urls,
    offerId:  offer.id,
  };
}

export async function validateDeclineToken(token: string): Promise<TokenValidation> {
  const [offer] = await db.select({
    id:         offers.id,
    acceptedAt: offers.acceptedAt,
    declinedAt: offers.declinedAt,
    expiresAt:  offers.expiresAt,
    playerId:   offers.playerId,
    seasonId:   offers.seasonId,
  }).from(offers).where(eq(offers.declineToken, token)).limit(1);

  if (!offer) return { state: 'invalid' };
  if (offer.acceptedAt) return { state: 'already_accepted', offerId: offer.id };
  if (offer.declinedAt) return { state: 'already_declined', offerId: offer.id };
  if (offer.expiresAt && new Date() > offer.expiresAt) return { state: 'expired', expiresAt: offer.expiresAt, offerId: offer.id };

  const [player] = await db.select({ firstName: players.firstName, lastName: players.lastName, teamId: players.teamId })
    .from(players).where(eq(players.id, offer.playerId)).limit(1);

  const [season] = await db.select({ label: seasons.label })
    .from(seasons).where(eq(seasons.id, offer.seasonId)).limit(1);

  const team = player?.teamId
    ? (await db.select({ name: teams.name }).from(teams).where(eq(teams.id, player.teamId)).limit(1))[0]
    : undefined;

  return {
    state:    'valid',
    player:   player ? { firstName: player.firstName, lastName: player.lastName } : undefined,
    team:     team   ? { name: team.name } : undefined,
    season:   season ? { label: season.label } : undefined,
    expiresAt: offer.expiresAt ?? undefined,
    offerId:  offer.id,
  };
}

async function getSeUrl(seasonId: string): Promise<{ registrationUrl: string | null; seRegistrationUrl: string | null }> {
  const [season] = await db.select({ registrationUrl: seasons.registrationUrl, seRegistrationUrl: seasons.seRegistrationUrl })
    .from(seasons).where(eq(seasons.id, seasonId)).limit(1);
  return {
    registrationUrl:   season?.registrationUrl   ?? null,
    seRegistrationUrl: season?.seRegistrationUrl ?? null,
  };
}
