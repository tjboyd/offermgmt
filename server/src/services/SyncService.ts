import { eq, and, inArray } from 'drizzle-orm';
import { db, players, seasons, seSyncLog } from '../db';
import { seApiClient, SERegistrant, SERegistrantsResponse } from './SEApiClient';
import type { ActivityEventType } from '../db/schema';

// ─── Tryout Registration Sync ─────────────────────────────────────────────────

export interface SyncResult {
  seasonId:        string;
  formNamesQueried: string[];
  recordsFetched:  number;
  recordsNew:      number;
  recordsUpdated:  number;
  recordsSkipped:  number;
  errorMessage:    string | null;
}

export async function syncSeason(seasonId: string, triggeredByUserId: string): Promise<SyncResult> {
  const [season] = await db.select().from(seasons).where(eq(seasons.id, seasonId)).limit(1);
  if (!season) throw new Error(`Season ${seasonId} not found`);

  const formNames: string[] = season.seTryoutFormNames ?? [];
  if (formNames.length === 0) {
    return {
      seasonId, formNamesQueried: [],
      recordsFetched: 0, recordsNew: 0, recordsUpdated: 0, recordsSkipped: 0,
      errorMessage: 'No SE tryout form names configured for this season.',
    };
  }

  let totalFetched = 0, totalNew = 0, totalUpdated = 0, totalSkipped = 0;
  let errorMessage: string | null = null;

  const logId = (await db.insert(seSyncLog).values({
    seasonId,
    triggeredByUserId,
    formNamesQueried: formNames,
  }).returning({ id: seSyncLog.id }))[0]!.id;

  try {
    for (const formName of formNames) {
      const registrants = await fetchAllRegistrants(formName);
      totalFetched += registrants.length;

      for (const reg of registrants) {
        const outcome = await upsertPlayer(reg, seasonId);
        if (outcome === 'new')     totalNew++;
        if (outcome === 'updated') totalUpdated++;
        if (outcome === 'skipped') totalSkipped++;
      }
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  await db.update(seSyncLog).set({
    recordsFetched: totalFetched,
    recordsNew:     totalNew,
    recordsUpdated: totalUpdated,
    recordsSkipped: totalSkipped,
    errorMessage,
    completedAt:    new Date(),
  }).where(eq(seSyncLog.id, logId));

  return {
    seasonId, formNamesQueried: formNames,
    recordsFetched: totalFetched, recordsNew: totalNew,
    recordsUpdated: totalUpdated, recordsSkipped: totalSkipped,
    errorMessage,
  };
}

// ─── Paginated fetch ──────────────────────────────────────────────────────────

async function fetchAllRegistrants(formName: string): Promise<SERegistrant[]> {
  const all: SERegistrant[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const res = await seApiClient.get<SERegistrantsResponse>('/v3/registrations', {
      form_name: formName,
      page:      String(page),
      per_page:  String(perPage),
    });

    all.push(...res.data);
    if (all.length >= res.meta.total || res.data.length < perPage) break;
    page++;
  }

  return all;
}

// ─── Upsert logic ─────────────────────────────────────────────────────────────

type UpsertOutcome = 'new' | 'updated' | 'skipped';

async function upsertPlayer(reg: SERegistrant, seasonId: string): Promise<UpsertOutcome> {
  // Try to match by SE member ID first
  let [existing] = reg.id
    ? await db.select().from(players)
        .where(and(eq(players.seasonId, seasonId), eq(players.profileId, reg.id)))
        .limit(1)
    : [undefined];

  // Fallback: match by name + DOB
  if (!existing && reg.first_name && reg.last_name && reg.date_of_birth) {
    const matches = await db.select().from(players)
      .where(and(
        eq(players.seasonId, seasonId),
        eq(players.firstName, reg.first_name),
        eq(players.lastName,  reg.last_name),
        eq(players.dateOfBirth, reg.date_of_birth),
      ))
      .limit(1);
    existing = matches[0];
  }

  if (!existing) {
    // INSERT new player in draft status
    await db.insert(players).values({
      seasonId,
      profileId:     reg.id,
      firstName:     reg.first_name,
      lastName:      reg.last_name,
      dateOfBirth:   reg.date_of_birth ?? undefined,
      grade:         reg.grade ?? undefined,
      parentName:    reg.guardian_name ?? undefined,
      parentEmail:   reg.guardian_email ?? reg.first_name.toLowerCase() + '@unknown.placeholder',
      status:        'draft',
      importedFromSe: true,
    });
    return 'new';
  }

  // UPDATE only SE-sourced fields; never touch status, notes, team, flags, offers
  const updateFields: Partial<typeof existing> = {};
  let changed = false;

  if (reg.id && existing.profileId !== reg.id)               { updateFields.profileId   = reg.id;                    changed = true; }
  if (reg.first_name !== existing.firstName)                  { updateFields.firstName   = reg.first_name;            changed = true; }
  if (reg.last_name  !== existing.lastName)                   { updateFields.lastName    = reg.last_name;             changed = true; }
  if (reg.date_of_birth && reg.date_of_birth !== existing.dateOfBirth) { updateFields.dateOfBirth = reg.date_of_birth; changed = true; }
  if (reg.grade && reg.grade !== existing.grade)              { updateFields.grade       = reg.grade;                 changed = true; }
  if (reg.guardian_name && reg.guardian_name !== existing.parentName) { updateFields.parentName  = reg.guardian_name; changed = true; }
  if (reg.guardian_email && reg.guardian_email !== existing.parentEmail) { updateFields.parentEmail = reg.guardian_email; changed = true; }

  if (!changed) return 'skipped';

  await db.update(players)
    .set({ ...updateFields, updatedAt: new Date() })
    .where(eq(players.id, existing.id));

  return 'updated';
}

// ─── Returning Player Lookup ──────────────────────────────────────────────────

export interface ReturningLookupResult {
  checked:  number;
  matched:  number;
  errors:   string[];
}

export async function lookupReturningPlayers(
  currentSeasonId: string,
  triggeredByUserId: string,
): Promise<ReturningLookupResult> {
  // Get all prior seasons (archived or not the current one)
  const allSeasons = await db.select().from(seasons);
  const priorSeasons = allSeasons.filter(
    (s) => s.id !== currentSeasonId && (s.isArchived || !s.isActive)
  );

  const currentPlayers = await db.select().from(players).where(eq(players.seasonId, currentSeasonId));
  if (currentPlayers.length === 0) return { checked: 0, matched: 0, errors: [] };

  let matched = 0;
  const errors: string[] = [];

  for (const priorSeason of priorSeasons) {
    for (const formName of (priorSeason.seTryoutFormNames ?? [])) {
      try {
        const registrants = await fetchAllRegistrants(formName);

        for (const reg of registrants) {
          // Try to match a current-season player
          const currentPlayer = currentPlayers.find((p) =>
            // Match by SE member ID
            (reg.id && p.profileId === reg.id) ||
            // Match by name + DOB (no parent email matching)
            (
              reg.date_of_birth &&
              p.firstName.toLowerCase() === reg.first_name.toLowerCase() &&
              p.lastName.toLowerCase()  === reg.last_name.toLowerCase()  &&
              p.dateOfBirth === reg.date_of_birth
            )
          );

          if (!currentPlayer) continue;

          // Don't overwrite a manually-set returning flag
          if (currentPlayer.returningSource === 'manual') continue;

          if (!currentPlayer.isReturning) {
            await db.update(players).set({
              isReturning:         true,
              returningSource:     'se_match',
              returningFlaggedBy:  triggeredByUserId as unknown as null,
              returningFlaggedAt:  new Date(),
              updatedAt:           new Date(),
            }).where(eq(players.id, currentPlayer.id));

            // Update local cache to prevent duplicate matches
            currentPlayer.isReturning    = true;
            currentPlayer.returningSource = 'se_match';
            matched++;
          }
        }
      } catch (err) {
        errors.push(`${priorSeason.label}/${formName}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return { checked: currentPlayers.length, matched, errors };
}
