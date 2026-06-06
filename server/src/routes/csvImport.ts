import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { authenticate, requireRole } from '../middleware/auth';
import { db, teams, players, config, seasons, users } from '../db';
import { inviteUser } from '../services/UserService';
import { AuthError } from '../services/AuthService';

const router = Router();

// ─── CSV parser ───────────────────────────────────────────────────────────────

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith('#'));
  if (lines.length === 0) return { headers: [], rows: [] };

  function parseRow(line: string): string[] {
    const fields: string[] = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; continue; }
      if (c === ',' && !inQ) { fields.push(cur.trim()); cur = ''; continue; }
      cur += c;
    }
    fields.push(cur.trim());
    return fields;
  }

  const headers = parseRow(lines[0]).map(h => h.toLowerCase().trim());
  const rows = lines.slice(1).map(line => {
    const vals = parseRow(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
    return obj;
  });
  return { headers, rows };
}

// ─── GET /template/teams ──────────────────────────────────────────────────────

router.get('/template/teams', authenticate, requireRole('admin', 'board'), (_req, res) => {
  const csv = [
    '# Jr Chargers Offer Management — Teams Import Template',
    '# Column guide:',
    '#   name     (REQUIRED) Team name exactly as it should appear in the app',
    '#   division (optional) Division or age group label, e.g. AAA, AA, Major',
    '# ',
    '# Rules:',
    '#   - Existing teams matched by name (case-insensitive) will have their division updated',
    '#   - New teams will be created',
    '#   - Do not remove or rename the header row',
    '#',
    'name,division',
    '12U Gold,AAA',
    '10U Red,AA',
  ].join('\n') + '\n';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="teams-template.csv"');
  res.send(csv);
});

// ─── GET /template/players ────────────────────────────────────────────────────

router.get('/template/players', authenticate, requireRole('admin', 'board'), (_req, res) => {
  const csv = [
    '# Jr Chargers Offer Management — Players Import Template',
    '# Column guide:',
    '#   first_name    (REQUIRED) Player\'s first name',
    '#   last_name     (REQUIRED) Player\'s last name',
    '#   parent_email  (REQUIRED) Parent/guardian email address — used for offer delivery',
    '#   team_name     (optional) Must match an existing team name exactly (case-insensitive)',
    '#   grade         (optional) Player\'s current grade, e.g. 7th, 8th',
    '#   date_of_birth (optional) Format: YYYY-MM-DD, e.g. 2013-04-22',
    '#   parent_name   (optional) Parent/guardian full name',
    '#   notes         (optional) Internal coaching notes, not sent to parents',
    '#',
    '# Rules:',
    '#   - Players are imported into the season selected in Settings → Players',
    '#     (falls back to the active season if no season is specified)',
    '#   - Players with unknown team_name are imported as unassigned (no team)',
    '#   - Duplicate detection is not performed — re-importing will create duplicates',
    '#   - Do not remove or rename the header row',
    '#   - Comment lines starting with # are ignored',
    '#',
    'first_name,last_name,team_name,grade,date_of_birth,parent_name,parent_email,notes',
    'John,Smith,12U Gold,7th,2013-04-22,Jane Smith,jsmith@example.com,Strong arm pitcher',
    'Emma,Johnson,10U Red,5th,2015-09-10,Robert Johnson,rjohnson@example.com,Switch hitter',
  ].join('\n') + '\n';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="players-template.csv"');
  res.send(csv);
});

// ─── POST /import/teams ───────────────────────────────────────────────────────

router.post('/teams', authenticate, requireRole('admin', 'board'), async (req, res, next) => {
  try {
    const { csv, commit = false } = req.body as { csv?: string; commit?: boolean };

    if (!csv || !csv.trim()) {
      return res.status(400).json({ error: 'csv is required' });
    }

    const { headers, rows } = parseCsv(csv);

    if (!headers.includes('name')) {
      return res.status(400).json({ error: 'CSV must include a "name" column' });
    }

    // Fetch existing teams
    const existingTeams = await db.select({ id: teams.id, name: teams.name, division: teams.division }).from(teams);
    const existingMap = new Map(existingTeams.map(t => [t.name.toLowerCase().trim(), t]));

    type CreatedRow = { name: string; division: string | null };
    type UpdatedRow = { name: string; division: string | null };
    const created: CreatedRow[] = [];
    const updated: UpdatedRow[] = [];
    const skipped: string[] = [];
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // 1-indexed, row 1 is header
      const name = row['name']?.trim();
      const division = row['division']?.trim() || null;

      if (!name) {
        errors.push({ row: rowNum, message: 'name is required' });
        continue;
      }

      const existing = existingMap.get(name.toLowerCase());
      if (existing) {
        if (existing.division === division) {
          skipped.push(name);
        } else {
          updated.push({ name, division });
          if (commit) {
            await db.update(teams).set({ division }).where(eq(teams.id, existing.id));
          }
        }
      } else {
        created.push({ name, division });
        if (commit) {
          await db.insert(teams).values({ name, division: division ?? undefined });
        }
      }
    }

    const total = created.length + updated.length + skipped.length + errors.length;
    const message = commit
      ? `Imported: ${created.length} created, ${updated.length} updated, ${skipped.length} skipped, ${errors.length} errors (${total} rows processed)`
      : `Preview: ${created.length} would be created, ${updated.length} would be updated, ${skipped.length} skipped, ${errors.length} errors`;

    return res.json({ ok: true, commit, created, updated, skipped, errors, message });
  } catch (err) { next(err); }
});

// ─── POST /import/players ─────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/players', authenticate, requireRole('admin', 'board'), async (req, res, next) => {
  try {
    const { csv, seasonId: bodySeasonId, commit = false } = req.body as {
      csv?: string;
      seasonId?: string;
      commit?: boolean;
    };

    if (!csv || !csv.trim()) {
      return res.status(400).json({ error: 'csv is required' });
    }

    // Resolve seasonId
    let resolvedSeasonId: string | null = bodySeasonId ?? null;
    if (!resolvedSeasonId) {
      const configRows = await db
        .select({ key: config.key, value: config.value })
        .from(config)
        .where(eq(config.key, 'active_season_id'));
      resolvedSeasonId = configRows[0]?.value ?? null;
    }

    if (!resolvedSeasonId) {
      return res.status(400).json({ error: 'No active season. Pass seasonId or activate a season.' });
    }

    // Verify season exists
    const seasonRows = await db
      .select({ id: seasons.id })
      .from(seasons)
      .where(eq(seasons.id, resolvedSeasonId));
    if (seasonRows.length === 0) {
      return res.status(400).json({ error: `Season ${resolvedSeasonId} not found` });
    }

    // Fetch existing teams for name lookup
    const existingTeams = await db.select({ id: teams.id, name: teams.name }).from(teams);
    const teamMap = new Map(existingTeams.map(t => [t.name.toLowerCase().trim(), t.id]));

    const { headers, rows } = parseCsv(csv);

    const requiredCols = ['first_name', 'last_name', 'parent_email'];
    for (const col of requiredCols) {
      if (!headers.includes(col)) {
        return res.status(400).json({ error: `CSV must include a "${col}" column` });
      }
    }

    type ValidRow = {
      firstName: string;
      lastName: string;
      teamName: string | null;
      teamFound: boolean;
    };
    const valid: ValidRow[] = [];
    const errors: { row: number; message: string }[] = [];

    // Collect inserts for commit
    const toInsert: Array<{
      seasonId: string;
      teamId: string | undefined;
      firstName: string;
      lastName: string;
      dateOfBirth: string | undefined;
      grade: string | undefined;
      parentName: string | undefined;
      parentEmail: string;
      notes: string | undefined;
    }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      const firstName = row['first_name']?.trim();
      const lastName = row['last_name']?.trim();
      const parentEmail = row['parent_email']?.trim();
      const teamName = row['team_name']?.trim() || null;
      const grade = row['grade']?.trim() || undefined;
      const dateOfBirth = row['date_of_birth']?.trim() || undefined;
      const parentName = row['parent_name']?.trim() || undefined;
      const notes = row['notes']?.trim() || undefined;

      // Hard validations
      if (!firstName) {
        errors.push({ row: rowNum, message: 'first_name is required' });
        continue;
      }
      if (!lastName) {
        errors.push({ row: rowNum, message: 'last_name is required' });
        continue;
      }
      if (!parentEmail) {
        errors.push({ row: rowNum, message: 'parent_email is required' });
        continue;
      }
      if (!EMAIL_RE.test(parentEmail)) {
        errors.push({ row: rowNum, message: `Invalid parent_email: ${parentEmail}` });
        continue;
      }
      if (dateOfBirth) {
        const d = new Date(dateOfBirth);
        if (isNaN(d.getTime())) {
          errors.push({ row: rowNum, message: `Invalid date_of_birth: ${dateOfBirth} (use YYYY-MM-DD)` });
          continue;
        }
      }

      // Team lookup (warning only, not a hard error)
      let teamId: string | undefined;
      let teamFound = false;
      if (teamName) {
        const found = teamMap.get(teamName.toLowerCase());
        if (found) {
          teamId = found;
          teamFound = true;
        }
        // teamFound stays false → warning captured in valid row
      }

      valid.push({ firstName, lastName, teamName, teamFound });

      toInsert.push({
        seasonId: resolvedSeasonId,
        teamId,
        firstName,
        lastName,
        dateOfBirth,
        grade,
        parentName,
        parentEmail,
        notes,
      });
    }

    if (commit && toInsert.length > 0) {
      for (const row of toInsert) {
        await db.insert(players).values({
          seasonId: row.seasonId,
          teamId: row.teamId,
          firstName: row.firstName,
          lastName: row.lastName,
          dateOfBirth: row.dateOfBirth,
          grade: row.grade,
          parentName: row.parentName,
          parentEmail: row.parentEmail,
          notes: row.notes,
        });
      }
    }

    const message = commit
      ? `Imported: ${toInsert.length} players inserted, ${errors.length} errors`
      : `Preview: ${valid.length} valid rows, ${errors.length} errors`;

    return res.json({ ok: true, commit, valid, errors, message });
  } catch (err) { next(err); }
});

// ─── GET /template/users ─────────────────────────────────────────────────────

router.get('/template/users', authenticate, requireRole('admin'), (_req, res) => {
  const csv = [
    '# Jr Chargers Offer Management — Users Import Template',
    '# Column guide:',
    '#   email       (REQUIRED) Login email address — must match the org\'s allowed domain(s)',
    '#   full_name   (REQUIRED) User\'s display name, e.g. "John Smith"',
    '#   role        (REQUIRED) One of: admin, board, head_coach, assistant_coach',
    '#   team_names  (optional) Comma-separated team names for coaches, e.g. "12U Gold,10U Red"',
    '#                          Only used for head_coach and assistant_coach roles',
    '#                          Names must match existing teams exactly (case-insensitive)',
    '#',
    '# Rules:',
    '#   - Each imported user receives an invite email to set their password',
    '#   - Duplicate emails (already invited or active) are skipped with a warning',
    '#   - Invalid roles are reported as row errors',
    '#   - Domain validation applies — emails outside the allowed domain list will error',
    '#   - Do not remove or rename the header row',
    '#',
    'email,full_name,role,team_names',
    'coach.smith@jrchargersbaseball.com,John Smith,head_coach,12U Gold',
    'assistant.jones@jrchargersbaseball.com,Sarah Jones,assistant_coach,"12U Gold,10U Red"',
    'board.johnson@jrchargersbaseball.com,Mike Johnson,board,',
  ].join('\n') + '\n';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="users-template.csv"');
  res.send(csv);
});

// ─── POST /import/users ───────────────────────────────────────────────────────

const VALID_ROLES = new Set(['admin', 'board', 'head_coach', 'assistant_coach']);

router.post('/users', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const { csv, commit = false } = req.body as { csv?: string; commit?: boolean };

    if (!csv || !csv.trim()) {
      return res.status(400).json({ error: 'csv is required' });
    }

    const { headers, rows } = parseCsv(csv);

    for (const col of ['email', 'full_name', 'role']) {
      if (!headers.includes(col)) {
        return res.status(400).json({ error: `CSV must include a "${col}" column` });
      }
    }

    // Load teams once upfront for name→id mapping
    const existingTeams = await db.select({ id: teams.id, name: teams.name }).from(teams);
    const teamMap = new Map(existingTeams.map(t => [t.name.toLowerCase().trim(), t.id]));

    // Load existing user emails for duplicate detection in preview mode
    const existingUsers = await db.select({ email: users.email }).from(users);
    const existingEmails = new Set(existingUsers.map(u => u.email.toLowerCase().trim()));

    type InvitedRow = { email: string; fullName: string; role: string; teamsAssigned: string[] };
    type SkippedRow = { email: string; reason: string };
    type ErrorRow = { row: number; message: string };

    const invited: InvitedRow[] = [];
    const skipped: SkippedRow[] = [];
    const errors: ErrorRow[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      const email = row['email']?.trim().toLowerCase();
      const fullName = row['full_name']?.trim();
      const role = row['role']?.trim();
      const teamNamesRaw = row['team_names']?.trim() || '';

      if (!email) {
        errors.push({ row: rowNum, message: 'email is required' });
        continue;
      }
      if (!fullName) {
        errors.push({ row: rowNum, message: 'full_name is required' });
        continue;
      }
      if (!role) {
        errors.push({ row: rowNum, message: 'role is required' });
        continue;
      }
      if (!VALID_ROLES.has(role)) {
        errors.push({ row: rowNum, message: `Invalid role: "${role}". Must be one of: admin, board, head_coach, assistant_coach` });
        continue;
      }

      // Resolve team names → IDs (warnings only)
      const teamNames = teamNamesRaw ? teamNamesRaw.split(',').map(t => t.trim()).filter(Boolean) : [];
      const teamIds: string[] = [];
      const unknownTeams: string[] = [];
      for (const tn of teamNames) {
        const id = teamMap.get(tn.toLowerCase());
        if (id) {
          teamIds.push(id);
        } else {
          unknownTeams.push(tn);
        }
      }

      // Check for duplicate in preview (or before commit attempt)
      if (existingEmails.has(email)) {
        skipped.push({ email, reason: 'An account with this email already exists.' });
        continue;
      }

      const teamsAssigned = teamNames.filter(tn => teamMap.has(tn.toLowerCase()));

      if (!commit) {
        // Preview mode — just collect
        invited.push({ email, fullName, role, teamsAssigned });
        // Track so duplicate rows in same CSV are caught
        existingEmails.add(email);
      } else {
        try {
          await inviteUser({
            email,
            fullName,
            role: role as 'admin' | 'board' | 'head_coach' | 'assistant_coach',
            teamIds: teamIds.length ? teamIds : undefined,
            invitedByRole: req.user!.role,
          });
          invited.push({ email, fullName, role, teamsAssigned });
          existingEmails.add(email);
        } catch (err) {
          if (err instanceof AuthError && (err.statusCode === 409 || err.statusCode === 403)) {
            if (err.statusCode === 409) {
              skipped.push({ email, reason: err.message });
            } else {
              errors.push({ row: rowNum, message: err.message });
            }
          } else {
            errors.push({ row: rowNum, message: err instanceof Error ? err.message : String(err) });
          }
        }
      }

      if (unknownTeams.length > 0) {
        // These are warnings — row is still processed, but we note it
        errors.push({ row: rowNum, message: `Unknown team name(s): ${unknownTeams.join(', ')} — skipped team assignment` });
      }
    }

    const message = commit
      ? `Imported: ${invited.length} invited, ${skipped.length} skipped, ${errors.length} errors`
      : `Preview: ${invited.length} would be invited, ${skipped.length} skipped, ${errors.length} errors`;

    return res.json({ ok: true, commit, invited, skipped, errors, message });
  } catch (err) { next(err); }
});

export default router;
