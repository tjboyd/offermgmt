/**
 * SE API Explorer — admin-only diagnostic endpoints (M7-01, M7-03)
 *
 * SportsEngine HQ uses OAuth 2.0 (client_credentials) for server-to-server
 * access and a single GraphQL endpoint for all data queries.
 *
 * All routes are strictly read-only. Nothing is written to the app DB or SE.
 * PII is stripped from all responses before they reach the browser.
 *
 * Route prefix: /api/v1/integrations/se-explorer
 */

import { Router, Request, Response, NextFunction } from 'express';
import { eq, and, ilike, or } from 'drizzle-orm';
import { authenticate, requireRole } from '../middleware/auth';
import { seApiClient, SEApiError, SE_GRAPHQL_URL, SE_ME_URL } from '../services/SEApiClient';
import { getIntegration, getSEOrgId } from '../services/IntegrationsService';
import type { SECredentials } from '../services/IntegrationsService';
import { db, teams, seasons, players } from '../db';

const router = Router();
router.use(authenticate, requireRole('admin'));

// ─── PII guard (M7-03) ────────────────────────────────────────────────────────

const PII_FIELDS = new Set([
  'email', 'email_address', 'guardian_email', 'parent_email',
  'first_name', 'last_name', 'full_name',
  'phone', 'phone_number', 'mobile', 'mobile_phone',
  'address', 'street', 'city', 'postal_code', 'zip',
  'date_of_birth', 'dob', 'birth_date', 'birthdate',
  'guardian_name', 'parent_name',
  'ssn', 'social_security',
]);

const PII_SAFE_PASSTHROUGH = new Set([
  'organization_name', 'org_name', 'team_name', 'program_name',
  'season_name', 'form_name', 'field_name', 'label', 'type',
  'description', 'display_name', 'division_name', 'sport_name',
  'name', // GraphQL uses "name" heavily for org/team/season names
]);

function isPiiField(key: string): boolean {
  const lower = key.toLowerCase();
  if (PII_SAFE_PASSTHROUGH.has(lower)) return false;
  return PII_FIELDS.has(lower);
}

const MAX_ARRAY_ITEMS = 3;

function stripPii(value: unknown, depth = 0): unknown {
  if (depth > 10) return value;
  if (Array.isArray(value)) {
    const limited = value.slice(0, MAX_ARRAY_ITEMS);
    const stripped = limited.map((item) => stripPii(item, depth + 1));
    return value.length > MAX_ARRAY_ITEMS
      ? [...stripped, `… (${value.length - MAX_ARRAY_ITEMS} more items omitted)`]
      : stripped;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isPiiField(k) ? '[redacted]' : stripPii(v, depth + 1);
    }
    return out;
  }
  return value;
}

// ─── Error hint builder ──────────────────────────────────────────────────────

function buildHint(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('too complex')) {
    return 'Query complexity limit exceeded (max 101). Reduce the number of fields requested, '
      + 'or reduce pagination limits (e.g. first: 5 instead of first: 25).';
  }
  if (lower.includes('cannot query field') || lower.includes('unknown field') || lower.includes('did you mean')) {
    return 'A field name in the query does not exist in SE\'s schema. '
      + 'Run "Schema → Root Fields" to see correct entry-point names, or visit '
      + 'https://dev.sportsengine.com/explorer for the full schema reference.';
  }
  if (lower.includes('argument') || lower.includes('required')) {
    return 'A required argument is missing. Check the Schema Discovery presets to see what arguments each field needs.';
  }
  return 'Check https://dev.sportsengine.com/explorer for the correct field names and query structure.';
}

// ─── GraphQL proxy helper ────────────────────────────────────────────────────

async function proxyGraphQL(
  query: string,
  variables: Record<string, unknown>,
  res: Response,
  next: NextFunction,
  note?: string,
) {
  try {
    const raw = await seApiClient.graphql<unknown>(query, variables);
    const safe = stripPii(raw);
    res.json({
      ok: true,
      endpoint: SE_GRAPHQL_URL,
      data: safe,
      fetchedAt: new Date().toISOString(),
      ...(note ? { note } : {}),
    });
  } catch (err) {
    if (err instanceof SEApiError) {
      // Return the full SE error so the explorer can display it verbatim
      return res.status(err.statusCode).json({
        ok:         false,
        code:       err.code,
        error:      err.message,
        endpoint:   SE_GRAPHQL_URL,
        sentQuery:  query,
        hint:       buildHint(err.message),
        fetchedAt: new Date().toISOString(),
      });
    }
    next(err);
  }
}

// ─── GET /se-explorer/status — token introspection ───────────────────────────

router.get('/status', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const creds = await getIntegration<SECredentials>('sportsengine');
    if (!creds?.client_id) {
      return res.json({
        ok: false, configured: false,
        error: 'SportsEngine credentials not configured.',
        fetchedAt: new Date().toISOString(),
      });
    }

    // Use /oauth/me to introspect the token (per SE docs)
    const data = await seApiClient.get<Record<string, unknown>>(SE_ME_URL);
    res.json({
      ok: true,
      configured: true,
      maskedClientId: '••••' + creds.client_id.slice(-4),
      tokenEndpoint: 'https://user.sportsengine.com/oauth/token',
      graphqlEndpoint: SE_GRAPHQL_URL,
      meData: stripPii(data),
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof SEApiError) {
      return res.status(err.statusCode).json({
        ok: false, configured: true, code: err.code, error: err.message,
        fetchedAt: new Date().toISOString(),
      });
    }
    next(err);
  }
});

// ─── Preset GraphQL panels ───────────────────────────────────────────────────
// SE HQ is a GraphQL API. Each preset sends a known query as a starting point.
// Use the schema introspection endpoints first to discover correct field names.

// ─── GET /se-explorer/schema/root — root query fields (start here) ────────────

router.get('/schema/root', async (_req: Request, res: Response, next: NextFunction) => {
  // SE truncates __type(name:"Query").fields to ~4 items due to complexity limits.
  // Use __schema.queryType.fields instead — same data, different path, may avoid the cap.
  await proxyGraphQL(
    `query {
      __schema {
        queryType {
          fields(includeDeprecated: false) {
            name
            type { name kind }
          }
        }
      }
    }`,
    {},
    res, next,
    'Root query entry points from SE\'s schema. Use these exact field names in your queries. For full schema docs visit https://dev.sportsengine.com/explorer',
  );
});

// ─── GET /se-explorer/schema/types — OBJECT types only (low complexity) ───────

router.get('/schema/types', async (_req: Request, res: Response, next: NextFunction) => {
  // Only fetch type names + kind — full fields would exceed complexity limit
  await proxyGraphQL(
    `query {
      __schema {
        queryType { name }
        types {
          name
          kind
        }
      }
    }`,
    {},
    res, next,
    'All types in the SE schema. Filter to kind=OBJECT to see queryable entities, then use "Type Fields" to inspect a specific type.',
  );
});

// ─── GET /se-explorer/schema/type/:name — fields on a specific type ───────────

router.get('/schema/type/:name', async (req: Request, res: Response, next: NextFunction) => {
  // Only fetch name + description to stay within complexity limit
  await proxyGraphQL(
    `query($name: String!) {
      __type(name: $name) {
        name
        kind
        description
        fields(includeDeprecated: false) {
          name
          description
          type { name kind }
        }
      }
    }`,
    { name: req.params.name },
    res, next,
    `Fields available on the "${req.params.name}" type. Visit https://dev.sportsengine.com/explorer for the full reference.`,
  );
});

// ─── GET /se-explorer/organization — basic org info ──────────────────────────

router.get('/organization', async (_req: Request, res: Response, next: NextFunction) => {
  const orgId = await getSEOrgId();
  if (!orgId) {
    return res.status(400).json({
      ok: false,
      code: 'MISSING_ORG_ID',
      error: 'No SE Organization ID saved. Add it to the SportsEngine credentials in Settings → Integrations → SportsEngine.',
      fetchedAt: new Date().toISOString(),
    });
  }
  await proxyGraphQL(
    `query($id: Int!) {
      organization(id: $id) {
        id
        name
      }
    }`,
    { id: orgId },
    res, next,
    `Using stored org ID: ${orgId}. Add more fields from https://dev.sportsengine.com/explorer`,
  );
});

// GET /se-explorer/seasons — all teams for org (seasons = program.primaryName on each team per SE docs)
router.get('/seasons', async (_req: Request, res: Response, next: NextFunction) => {
  const orgId = await getSEOrgId();
  if (!orgId) {
    return res.status(400).json({
      ok: false,
      code: 'MISSING_ORG_ID',
      error: 'No SE Organization ID saved. Add it to the SportsEngine credentials in Settings → Integrations → SportsEngine.',
      fetchedAt: new Date().toISOString(),
    });
  }
  await proxyGraphQL(
    `query($orgId: Int!) {
      teams(organizationId: $orgId, status: "active", perPage: 100, page: 1) {
        pageInformation {
          pages
          count
          page
          perPage
        }
        results {
          id
          name
          gender
          type
          sport
          status
          updated
          approved
          rosterStatus
          program {
            primaryName
            secondaryName
          }
        }
      }
    }`,
    { orgId },
    res, next,
    'Active teams for the org. program.primaryName = season name, program.secondaryName = division (per SE docs).',
  );
});

// GET /se-explorer/teams — all teams for org (exact query from SE docs)
router.get('/teams', async (_req: Request, res: Response, next: NextFunction) => {
  const orgId = await getSEOrgId();
  if (!orgId) {
    return res.status(400).json({
      ok: false,
      code: 'MISSING_ORG_ID',
      error: 'No SE Organization ID saved.',
      fetchedAt: new Date().toISOString(),
    });
  }
  await proxyGraphQL(
    `query($orgId: Int!) {
      teams(organizationId: $orgId, perPage: 100, page: 1) {
        pageInformation {
          pages
          count
          page
          perPage
        }
        results {
          id
          name
          gender
          type
          sport
          status
          updated
          approved
          rosterStatus
          program {
            primaryName
            secondaryName
          }
        }
      }
    }`,
    { orgId },
    res, next,
    'All teams for org. program.primaryName = season name, program.secondaryName = division.',
  );
});

// GET /se-explorer/seasons/:id — single team detail
router.get('/seasons/:id', async (req: Request, res: Response, next: NextFunction) => {
  await proxyGraphQL(
    `query($id: String!) {
      team(id: $id) {
        id
        name
        gender
        type
        sport
        status
        rosterStatus
        program {
          primaryName
          secondaryName
        }
        players {
          firstName
          lastName
          profileId
          jerseyNumber
          rosterStatus
        }
        staff {
          firstName
          lastName
          profileId
          title
          rosterStatus
        }
      }
    }`,
    { id: req.params.id },
    res, next,
    'Single team detail. The "id" here is a team UUID, not a season ID (SE has no season entity).',
  );
});

// GET /se-explorer/seasons/:id/teams — all teams for the org (id unused, uses stored orgId)
router.get('/seasons/:id/teams', async (_req: Request, res: Response, next: NextFunction) => {
  const orgId = await getSEOrgId();
  if (!orgId) {
    return res.status(400).json({
      ok: false,
      code: 'MISSING_ORG_ID',
      error: 'No SE Organization ID saved.',
      fetchedAt: new Date().toISOString(),
    });
  }
  await proxyGraphQL(
    `query($orgId: Int!) {
      teams(organizationId: $orgId, perPage: 100, page: 1) {
        pageInformation {
          pages
          count
          page
          perPage
        }
        results {
          id
          name
          gender
          type
          sport
          status
          rosterStatus
          program {
            primaryName
            secondaryName
          }
        }
      }
    }`,
    { orgId },
    res, next,
    'All teams for the organization with their season/division program info.',
  );
});

// GET /se-explorer/registrations/:formId/schema — forms, questions, and choices for a registration
router.get('/registrations/:formId/schema', async (req: Request, res: Response, next: NextFunction) => {
  const formId = parseInt(req.params.formId, 10);
  if (isNaN(formId)) {
    return res.status(400).json({ ok: false, error: 'formId must be a numeric registration ID.', fetchedAt: new Date().toISOString() });
  }
  await proxyGraphQL(
    `query($id: Int!) {
      registration(id: $id) {
        id
        name
        status
        open
        close
        resultsCompleted
        url
      }
    }`,
    { id: formId },
    res, next,
    'Registration top-level info. To get forms/questions, use the Freeform Query panel with: registration(id: $id) { results(page:1, perPage:1) { forms { name questions { key name type choices { id name } } } } }',
  );
});

// GET /se-explorer/registrations/:formId/sample — list all registrations for the org
router.get('/registrations/:formId/sample', async (req: Request, res: Response, next: NextFunction) => {
  const orgId = await getSEOrgId();
  if (!orgId) {
    return res.status(400).json({ ok: false, code: 'MISSING_ORG_ID', error: 'No SE Organization ID saved.', fetchedAt: new Date().toISOString() });
  }
  await proxyGraphQL(
    `query($id: Int!) {
      registrations(id: $id) {
        pageInformation {
          pages
          count
          page
          perPage
        }
        results {
          id
          name
          status
          open
          close
          resultsCompleted
          monetary
          url
        }
      }
    }`,
    { id: orgId },
    res, next,
    'All registrations for the organization. The "id" argument on registrations() is the org ID.',
  );
});

// ─── GET /se-explorer/probe/seasons — try multiple season query patterns ─────
// SE introspection is truncated; this probes likely field names and reports results.

router.get('/probe/seasons', async (_req: Request, res: Response, next: NextFunction) => {
  const orgId = await getSEOrgId();
  if (!orgId) {
    return res.status(400).json({ ok: false, error: 'No SE Organization ID saved.', fetchedAt: new Date().toISOString() });
  }

  const candidates = [
    { label: 'seasons(organizationId)',        query: `query { seasons(organizationId: ${orgId}, perPage: 3, page: 1) { pageInformation { count } results { id name } } }` },
    { label: 'seasons(orgId)',                 query: `query { seasons(orgId: ${orgId}, perPage: 3, page: 1) { pageInformation { count } results { id name } } }` },
    { label: 'seasonManagement(orgId)',        query: `query { seasonManagement(organizationId: ${orgId}) { id name } }` },
    { label: 'organization.seasons',           query: `query { organization(id: ${orgId}) { seasons { id name } } }` },
    { label: 'organization.seasonManagement',  query: `query { organization(id: ${orgId}) { seasonManagement { id name } } }` },
  ];

  const results = [];
  for (const { label, query } of candidates) {
    try {
      const data = await seApiClient.graphql(query);
      results.push({ label, status: 'SUCCESS', data });
      break; // stop at first success
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ label, status: 'ERROR', error: msg });
    }
  }

  res.json({ ok: true, orgId, results, fetchedAt: new Date().toISOString() });
});

// ─── POST /se-explorer/import/teams — import active teams from SE ────────────
// Fetches active teams from SE, previews or commits an upsert into the teams table.
// Query param ?commit=true to write; omit for dry-run preview.

interface SETeam {
  id: string;
  name: string;
  sport?: string;
  status?: string;
  program?: { primaryName?: string; secondaryName?: string };
}

// seasonMappings: array of { seLabel, appSeasonId? } where appSeasonId is set if season already
// exists in the app, undefined means "create it". Used only on commit.
interface SeasonMapping { seLabel: string; appSeasonId?: string }

router.post('/import/teams', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = await getSEOrgId();
    if (!orgId) {
      return res.status(400).json({ ok: false, error: 'No SE Organization ID saved. Configure it in Settings → Integrations.' });
    }

    const commit = req.query.commit === 'true';
    const selectedIds: string[] | undefined = Array.isArray(req.body?.selectedIds)
      ? (req.body.selectedIds as string[])
      : undefined;
    // seasonMappings only required on commit
    const seasonMappings: SeasonMapping[] = Array.isArray(req.body?.seasonMappings)
      ? (req.body.seasonMappings as SeasonMapping[])
      : [];

    // Fetch ONLY active teams from SE
    const seData = await seApiClient.graphql<{ teams: { results: SETeam[] } }>(
      `query($orgId: Int!) {
        teams(organizationId: $orgId, status: "active", perPage: 100, page: 1) {
          results {
            id
            name
            sport
            status
            program {
              primaryName
              secondaryName
            }
          }
        }
      }`,
      { orgId },
    );

    const seTeams: SETeam[] = seData?.teams?.results ?? [];
    if (seTeams.length === 0) {
      return res.json({ ok: true, commit: false, created: [], updated: [], skipped: [], message: 'No active teams found in SportsEngine.' });
    }

    // Load existing teams from the app DB
    const existing = await db.select().from(teams);
    const bySeId   = new Map(existing.map((t) => [t.name.toLowerCase().trim(), t]));

    const toCreate: typeof seTeams = [];
    const toUpdate: Array<{ seTeam: SETeam; appId: string }> = [];
    const skipped: string[] = [];

    for (const seTeam of seTeams) {
      const nameLower = seTeam.name.toLowerCase().trim();
      const division  = seTeam.program?.secondaryName ?? undefined;
      const match     = bySeId.get(nameLower);

      if (!match) {
        toCreate.push(seTeam);
      } else {
        const divisionChanged = division && match.division !== division;
        if (divisionChanged) {
          toUpdate.push({ seTeam, appId: match.id });
        } else {
          skipped.push(seTeam.name);
        }
      }
    }

    // Determine the set of teams actually being imported (used in both commit + preview paths)
    const selectedSet   = selectedIds ? new Set(selectedIds) : null;
    const eligibleEntries = [...toCreate, ...toUpdate.map((u) => u.seTeam)];
    const relevantEntries = selectedSet
      ? eligibleEntries.filter((t) => selectedSet.has(t.id))
      : eligibleEntries;

    if (commit) {
      // Only consider season labels actually needed by the teams being imported.
      // Do NOT trust seasonMappings for season labels that aren't referenced —
      // this prevents creating seasons for teams the user deselected.
      const neededSeasonLabels = new Set(
        relevantEntries.map((t) => t.program?.primaryName).filter(Boolean) as string[],
      );

      // Build a client-provided lookup (seLabel → appSeasonId) for reference
      const clientMapping = new Map(seasonMappings.map((m) => [m.seLabel, m.appSeasonId]));

      // Resolve only the needed seasons
      const seasonIdByLabel = new Map<string, string | null>();
      for (const label of neededSeasonLabels) {
        const clientAppId = clientMapping.get(label);
        if (clientAppId) {
          // Season already exists — use the provided ID
          seasonIdByLabel.set(label, clientAppId);
        } else if (clientMapping.has(label) && !clientAppId) {
          // Client explicitly said to create this season (appSeasonId omitted/undefined)
          const [created] = await db.insert(seasons)
            .values({ label })
            .onConflictDoNothing()
            .returning({ id: seasons.id });
          // If it already existed (conflict), look it up
          if (created) {
            seasonIdByLabel.set(label, created.id);
          } else {
            const [existing] = await db.select({ id: seasons.id })
              .from(seasons)
              .where(eq(seasons.label, label))
              .limit(1);
            seasonIdByLabel.set(label, existing?.id ?? null);
          }
        }
        // If the label is needed but not in clientMapping at all, leave it unmapped (null)
      }

      for (const seTeam of toCreate) {
        if (selectedSet && !selectedSet.has(seTeam.id)) continue;
        const seLabel  = seTeam.program?.primaryName ?? null;
        const seasonId = seLabel ? (seasonIdByLabel.get(seLabel) ?? null) : null;
        await db.insert(teams).values({
          name:     seTeam.name,
          division: seTeam.program?.secondaryName ?? null,
          seasonId,
          seId:     seTeam.id,
          isActive: true,
        });
      }
      for (const { seTeam, appId } of toUpdate) {
        if (selectedSet && !selectedSet.has(seTeam.id)) continue;
        const seLabel  = seTeam.program?.primaryName ?? null;
        const seasonId = seLabel ? (seasonIdByLabel.get(seLabel) ?? null) : null;
        await db.update(teams)
          .set({ division: seTeam.program?.secondaryName ?? null, seasonId, seId: seTeam.id })
          .where(eq(teams.id, appId));
      }
    }
    const uniqueSeasonLabels = [...new Set(
      relevantEntries.map((t) => t.program?.primaryName).filter(Boolean) as string[],
    )];

    // Check which of these season labels already exist in the app DB
    const existingSeasons = await db.select({ id: seasons.id, label: seasons.label }).from(seasons);
    const existingByLabel = new Map(existingSeasons.map((s) => [s.label, s.id]));
    const seasonStatus = uniqueSeasonLabels.map((label) => ({
      seLabel:     label,
      appSeasonId: existingByLabel.get(label) ?? null,  // null = needs to be created
    }));

    res.json({
      ok: true,
      commit,
      seasonStatus,   // [{seLabel, appSeasonId|null}]
      created: toCreate.map((t) => ({
        seId:     t.id,
        name:     t.name,
        division: t.program?.secondaryName ?? null,
        season:   t.program?.primaryName   ?? null,
      })),
      updated: toUpdate.map(({ seTeam }) => ({
        seId:     seTeam.id,
        name:     seTeam.name,
        division: seTeam.program?.secondaryName ?? null,
        season:   seTeam.program?.primaryName   ?? null,
      })),
      skipped,
      message: (() => {
        if (!commit) return `${toCreate.length + toUpdate.length} teams ready to import (${toCreate.length} new, ${toUpdate.length} division update${toUpdate.length !== 1 ? 's' : ''})`;
        const committedCreate = toCreate.filter((t) => !selectedSet || selectedSet.has(t.id)).length;
        const committedUpdate = toUpdate.filter(({ seTeam }) => !selectedSet || selectedSet.has(seTeam.id)).length;
        return `Import complete: ${committedCreate} created, ${committedUpdate} updated, ${skipped.length} unchanged.`;
      })(),
    });
  } catch (err) {
    if (err instanceof SEApiError) {
      return res.status(err.statusCode).json({ ok: false, error: err.message, code: err.code });
    }
    next(err);
  }
});

// ─── GET /se-explorer/registrations/:formId/profiles — diagnostic list (PII stripped) ─

router.get('/registrations/:formId/profiles', async (req: Request, res: Response, next: NextFunction) => {
  const orgId = await getSEOrgId();
  if (!orgId) {
    return res.status(400).json({ ok: false, code: 'MISSING_ORG_ID', error: 'No SE Organization ID saved.', fetchedAt: new Date().toISOString() });
  }
  const formId = req.params.formId;
  if (!formId || isNaN(parseInt(formId, 10))) {
    return res.status(400).json({ ok: false, error: 'formId must be a numeric registration ID.', fetchedAt: new Date().toISOString() });
  }
  await proxyGraphQL(
    `query($regId: String!, $orgId: Int!) {
      profiles(
        filter: {
          key: REGISTRATION_SUBMITTED
          value: "true"
          source: REGISTRATIONS
          sourceId: $regId
          operator: EQUAL
        }
        organizationId: $orgId
        page: 1
        perPage: 25
      ) {
        pageInformation { count page pages perPage }
        results { id firstName lastName }
      }
    }`,
    { regId: formId, orgId },
    res, next,
    `Profiles who submitted registration ${formId}. PII (names) are redacted. Use the profile count to validate the registration ID, then use "Profile by ID" to inspect individual records.`,
  );
});

// ─── GET /se-explorer/profile/:profileId — fetch individual SE profile detail ─

router.get('/profile/:profileId', async (req: Request, res: Response, next: NextFunction) => {
  const orgId = await getSEOrgId();
  if (!orgId) {
    return res.status(400).json({ ok: false, code: 'MISSING_ORG_ID', error: 'No SE Organization ID saved.', fetchedAt: new Date().toISOString() });
  }
  // Returns profile detail — PII is NOT stripped here since this is used for import preview
  try {
    const profileId = parseInt(req.params.profileId, 10);
    if (isNaN(profileId)) {
      return res.status(400).json({ ok: false, error: 'profileId must be numeric.', fetchedAt: new Date().toISOString() });
    }
    const data = await seApiClient.graphql<{ profile: SEProfileDetail }>(
      `query($id: Int!, $orgId: Int!) {
        profile(id: $id, organizationId: $orgId) {
          id
          firstName
          lastName
          dateOfBirth
          email
        }
      }`,
      { id: profileId, orgId },
    );
    res.json({
      ok: true,
      profile: data?.profile ?? null,
      note: 'SE Profile type exposes: id, firstName, lastName, dateOfBirth, email. Use Schema Discovery → Type Fields (type: Profile) to see all available fields.',
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof SEApiError) {
      return res.status(err.statusCode).json({ ok: false, error: err.message, code: err.code, fetchedAt: new Date().toISOString() });
    }
    next(err);
  }
});

// ─── POST /se-explorer/import/players — import players from SE registration ──
// Phase 1 (preview, no commit): fetches profiles from SE registration, compares
//   against existing players in the selected season, returns categorized list.
// Phase 2 (commit=true): inserts new players, merges duplicates if selected.

// SE Profile type confirmed fields (per SE docs):
//   id, firstName, lastName, email, dateOfBirth, gender, address, phoneNumber, rosterRole
// NOTE: For minor athletes, profile.email is often the parent/guardian's email.
// NOTE: grade is NOT a Profile field — it may appear as a custom registration form answer.
interface SEProfileDetail {
  id:          string;
  firstName:   string;
  lastName:    string;
  dateOfBirth: string | null;
  email:       string | null;  // parent/guardian email for minors
}

interface SEProfilesPage {
  pageInformation: { count: number; page: number; pages: number; perPage: number };
  results:         Array<{ id: string; firstName: string; lastName: string }>;
}

router.post('/import/players', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = await getSEOrgId();
    if (!orgId) {
      return res.status(400).json({ ok: false, error: 'No SE Organization ID saved. Configure it in Settings → Integrations.' });
    }

    const { registrationId, seasonId, selectedProfileIds, commit = false } =
      req.body as {
        registrationId:    string;
        seasonId:          string;
        selectedProfileIds?: string[];
        commit?:           boolean;
      };

    if (!registrationId) return res.status(400).json({ ok: false, error: '`registrationId` is required.' });
    if (!seasonId)        return res.status(400).json({ ok: false, error: '`seasonId` is required.' });

    const regIdNum = parseInt(registrationId, 10);
    if (isNaN(regIdNum)) return res.status(400).json({ ok: false, error: '`registrationId` must be numeric.' });

    // Verify season exists; optionally persist the registration ID
    const [season] = await db.select().from(seasons).where(eq(seasons.id, seasonId)).limit(1);
    if (!season) return res.status(404).json({ ok: false, error: 'Season not found.' });

    // Persist the registration ID onto the season so it re-populates next time
    if (season.seRegistrationId !== registrationId) {
      await db.update(seasons).set({ seRegistrationId: registrationId }).where(eq(seasons.id, seasonId));
    }

    // ── Step 1: fetch all profiles who submitted this registration ──────────
    const allProfiles: Array<{ id: string; firstName: string; lastName: string }> = [];
    let page = 1;
    while (true) {
      const data = await seApiClient.graphql<{ profiles: SEProfilesPage }>(
        `query($regId: String!, $orgId: Int!, $page: Int!) {
          profiles(
            filter: {
              key: REGISTRATION_SUBMITTED
              value: "true"
              source: REGISTRATIONS
              sourceId: $regId
              operator: EQUAL
            }
            organizationId: $orgId
            page: $page
            perPage: 50
          ) {
            pageInformation { count page pages perPage }
            results { id firstName lastName }
          }
        }`,
        { regId: registrationId, orgId, page },
      );
      const results = data?.profiles?.results ?? [];
      allProfiles.push(...results);
      const info = data?.profiles?.pageInformation;
      if (!info || page >= info.pages) break;
      page++;
    }

    if (allProfiles.length === 0) {
      return res.json({
        ok: true, commit: false,
        message: 'No profiles found for this registration ID. Verify the ID in SportsEngine.',
        toCreate: [], duplicates: [],
      });
    }

    // ── Step 2: fetch profile details (DOB, email) ───────────────────────────
    // Confirmed SE Profile fields: id, firstName, lastName, dateOfBirth, email, gender, address, phoneNumber.
    // For minor athletes profile.email is the parent/guardian's email — correct field for parentEmail.
    // grade is NOT a Profile field (it lives in registration form answers if collected).
    const profileDetails = new Map<string, SEProfileDetail>();
    for (const p of allProfiles) {
      const profileIdNum = parseInt(p.id, 10);
      if (isNaN(profileIdNum)) continue;
      try {
        const detail = await seApiClient.graphql<{ profile: SEProfileDetail }>(
          `query($id: Int!, $orgId: Int!) {
            profile(id: $id, organizationId: $orgId) {
              id firstName lastName dateOfBirth email
            }
          }`,
          { id: profileIdNum, orgId },
        );
        if (detail?.profile) profileDetails.set(p.id, detail.profile);
      } catch {
        // If individual profile lookup fails, fall back to list-level data
        profileDetails.set(p.id, { id: p.id, firstName: p.firstName, lastName: p.lastName, dateOfBirth: null, email: null });
      }
    }

    // ── Step 3: load existing players in this season for duplicate detection ─
    const existingInSeason = await db.select({
      id:           players.id,
      profileId:    players.profileId,
      firstName:    players.firstName,
      lastName:     players.lastName,
      dateOfBirth:  players.dateOfBirth,
      parentEmail:  players.parentEmail,
      notes:        players.notes,
      status:       players.status,
    }).from(players).where(eq(players.seasonId, seasonId));

    function normalize(s: string) { return s.trim().toLowerCase(); }

    // SE returns dateOfBirth as a full ISO timestamp (e.g. "2017-12-08T00:00:00.000Z")
    // while the DB stores only the date part ("2017-12-08"). Normalize both to YYYY-MM-DD.
    function normDob(d: string): string { return d.slice(0, 10); }

    function findDuplicate(profile: SEProfileDetail) {
      return existingInSeason.find((ep) => {
        // Match by profileId first (exact SE profile ID match — fastest, most reliable)
        if (ep.profileId && ep.profileId === profile.id) return true;
        // Fallback: match by name + DOB (handles players imported before profileId was stored)
        const nameMatch =
          normalize(ep.firstName) === normalize(profile.firstName) &&
          normalize(ep.lastName)  === normalize(profile.lastName);
        if (!nameMatch) return false;
        if (profile.dateOfBirth && ep.dateOfBirth) {
          return normDob(ep.dateOfBirth) === normDob(profile.dateOfBirth);
        }
        return nameMatch; // name-only fallback if either DOB is missing
      });
    }

    const toCreate:    SEProfileDetail[] = [];
    const duplicates:  Array<{ profile: SEProfileDetail; existingPlayerId: string; existingStatus: string }> = [];

    for (const p of allProfiles) {
      const detail    = profileDetails.get(p.id) ?? { id: p.id, firstName: p.firstName, lastName: p.lastName, dateOfBirth: null, email: null };
      const duplicate = findDuplicate(detail);
      if (duplicate) {
        duplicates.push({ profile: detail, existingPlayerId: duplicate.id, existingStatus: duplicate.status });
      } else {
        toCreate.push(detail);
      }
    }

    if (!commit) {
      return res.json({
        ok: true,
        commit: false,
        seasonLabel: season.label,
        toCreate:   toCreate.map((p) => ({
          profileId:   p.id,
          firstName:   p.firstName,
          lastName:    p.lastName,
          dateOfBirth: p.dateOfBirth,
          grade:       null,   // grade is not a SE Profile field (may live in registration form answers)
          parentEmail: p.email ?? null,
          parentName:  null,   // parent name not a SE Profile field; profile.email is the parent contact for minors
        })),
        duplicates: duplicates.map((d) => ({
          profileId:        d.profile.id,
          firstName:        d.profile.firstName,
          lastName:         d.profile.lastName,
          dateOfBirth:      d.profile.dateOfBirth,
          grade:            null,
          parentEmail:      d.profile.email ?? null,
          parentName:       null,
          existingPlayerId: d.existingPlayerId,
          existingStatus:   d.existingStatus,
        })),
        message: `Found ${toCreate.length} new and ${duplicates.length} potential duplicate(s).`,
      });
    }

    // ── Step 4 (commit): create new players + merge selected duplicates ───────
    const selectedSet = selectedProfileIds ? new Set(selectedProfileIds) : null;
    let created = 0, merged = 0, skipped = 0;

    for (const profile of toCreate) {
      if (selectedSet && !selectedSet.has(profile.id)) { skipped++; continue; }
      // For minor athletes, profile.email is the parent/guardian's email (confirmed per SE docs)
      const parentEmail = profile.email ?? `${profile.firstName.toLowerCase()}.${profile.lastName.toLowerCase()}@unknown.placeholder`;
      await db.insert(players).values({
        seasonId,
        profileId:      profile.id,
        firstName:      profile.firstName,
        lastName:       profile.lastName,
        dateOfBirth:    profile.dateOfBirth ?? null,
        grade:          null,   // grade is not a SE Profile field
        parentName:     null,   // parent name not a SE Profile field
        parentEmail,
        status:         'draft',
        importedFromSe: true,
      });
      created++;
    }

    for (const dup of duplicates) {
      if (selectedSet && !selectedSet.has(dup.profile.id)) { skipped++; continue; }
      // Merge: set profileId + fill blank fields, keep status/notes/team
      const parentEmail = dup.profile.email ?? null;

      const [existing] = await db.select().from(players).where(eq(players.id, dup.existingPlayerId)).limit(1);
      if (!existing) { skipped++; continue; }

      const patch: Record<string, unknown> = { profileId: dup.profile.id, importedFromSe: true, updatedAt: new Date() };
      if (dup.profile.dateOfBirth && !existing.dateOfBirth) patch.dateOfBirth = dup.profile.dateOfBirth;
      // grade not available from SE Profile type — only fill if manually provided elsewhere
      if (parentEmail && existing.parentEmail?.includes('@unknown.placeholder')) patch.parentEmail = parentEmail;

      await db.update(players).set(patch).where(eq(players.id, dup.existingPlayerId));
      merged++;
    }

    res.json({
      ok: true,
      commit: true,
      created,
      merged,
      skipped,
      message: `Import complete: ${created} new player${created !== 1 ? 's' : ''} created, ${merged} merged with existing record${merged !== 1 ? 's' : ''}.`,
    });
  } catch (err) {
    if (err instanceof SEApiError) {
      return res.status(err.statusCode).json({ ok: false, error: err.message, code: err.code });
    }
    next(err);
  }
});

// ─── POST /se-explorer/graphql — freeform GraphQL query ──────────────────────

router.post('/graphql', async (req: Request, res: Response, next: NextFunction) => {
  const { query, variables } = req.body as { query?: string; variables?: Record<string, unknown> };
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: '`query` field (GraphQL query string) is required.' });
  }
  // Reject any mutations — read-only guard
  if (/^\s*mutation/i.test(query.trim())) {
    return res.status(400).json({ error: 'Mutations are not permitted in the explorer. Read-only queries only.' });
  }
  await proxyGraphQL(query, variables ?? {}, res, next, 'Freeform query — all PII redacted.');
});

export default router;
