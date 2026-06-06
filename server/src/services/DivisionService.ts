import { eq } from 'drizzle-orm';
import { db, divisions, players, seasons, config as configTable } from '../db';

export type DivisionRow = typeof divisions.$inferSelect;

export interface EligibilityResult {
  eligible: boolean;
  reasons: string[];
}

export const DivisionService = {
  async listBySeasonId(seasonId: string): Promise<DivisionRow[]> {
    return db.select().from(divisions).where(eq(divisions.seasonId, seasonId));
  },

  async create(
    seasonId: string,
    data: {
      name: string;
      minAgeYears?: number | null;
      maxAgeYears?: number | null;
      allowedGrades?: string[] | null;
      isActive?: boolean;
    }
  ): Promise<DivisionRow> {
    const [row] = await db
      .insert(divisions)
      .values({ ...data, seasonId })
      .returning();
    return row;
  },

  async update(
    id: string,
    data: {
      name?: string;
      minAgeYears?: number | null;
      maxAgeYears?: number | null;
      allowedGrades?: string[] | null;
      isActive?: boolean;
    }
  ): Promise<DivisionRow> {
    const [row] = await db
      .update(divisions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(divisions.id, id))
      .returning();
    if (!row) throw Object.assign(new Error('Division not found'), { status: 404 });
    return row;
  },

  async delete(id: string): Promise<void> {
    await db.delete(divisions).where(eq(divisions.id, id));
  },

  async checkPlayerEligibility(
    playerId: string,
    divisionId: string,
    seasonStartDate: string
  ): Promise<EligibilityResult> {
    const [player] = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
    if (!player) throw Object.assign(new Error('Player not found'), { status: 404 });

    const [division] = await db.select().from(divisions).where(eq(divisions.id, divisionId)).limit(1);
    if (!division) throw Object.assign(new Error('Division not found'), { status: 404 });

    const mode = division.eligibilityMode ?? 'none';
    // No eligibility rules configured — always eligible
    if (mode === 'none') return { eligible: true, reasons: [] };

    const ageConstraint   = division.ageConstraint   ?? 'max_only';
    const gradeConstraint = division.gradeConstraint ?? 'exact';

    // ── Age eligibility check ──────────────────────────────────────────────
    const ageReasons: string[] = [];
    const hasAgeRule = division.minAgeYears != null || division.maxAgeYears != null;

    if (hasAgeRule) {
      const seasonStart = new Date(seasonStartDate);
      let age: number | null = null;

      if (player.ageOverride != null) {
        age = player.ageOverride;
      } else if (player.dateOfBirth) {
        const dob = new Date(player.dateOfBirth);
        let calc = seasonStart.getFullYear() - dob.getFullYear();
        const monthDiff = seasonStart.getMonth() - dob.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && seasonStart.getDate() < dob.getDate())) calc -= 1;
        age = calc;
      }

      if (age === null) {
        ageReasons.push('Birth date required for age eligibility check');
      } else {
        // 'range': enforce both min and max (strict age window)
        // 'max_only': only enforce max — younger players are always eligible
        if (ageConstraint === 'range' && division.minAgeYears != null && age < division.minAgeYears) {
          ageReasons.push(`Player age (${age}) is below the minimum ${division.minAgeYears} — younger players cannot play up in this division`);
        }
        if (division.maxAgeYears != null && age > division.maxAgeYears) {
          ageReasons.push(
            ageConstraint === 'max_only'
              ? `Player cannot turn ${division.maxAgeYears + 1} before ${seasonStartDate} (currently ${age})`
              : `Player age (${age}) exceeds the maximum ${division.maxAgeYears} for this division`
          );
        }
      }
    }

    // ── Grade eligibility check ────────────────────────────────────────────
    // For 'not_exceed', we need the configured grade list to determine ordering.
    // Fetch it from config; fall back to exact match if not available.
    const gradeReasons: string[] = [];
    const hasGradeRule = division.allowedGrades != null && division.allowedGrades.length > 0;

    if (hasGradeRule) {
      const playerGrade = player.grade ?? null;
      const allowed = division.allowedGrades!;

      if (gradeConstraint === 'not_exceed') {
        // Fetch the org-configured grade order from config table
        const [gradeValuesRow] = await db
          .select()
          .from(configTable)
          .where(eq(configTable.key, 'gradeValues'))
          .limit(1);

        let orderedGrades: string[] = [];
        if (gradeValuesRow) {
          try { orderedGrades = JSON.parse(gradeValuesRow.value); } catch { /* ignore */ }
        }

        if (orderedGrades.length > 0 && playerGrade) {
          const maxAllowedIdx = Math.max(...allowed.map((g) => orderedGrades.indexOf(g)));
          const playerIdx = orderedGrades.indexOf(playerGrade);
          if (playerIdx === -1) {
            gradeReasons.push(`Player grade "${playerGrade}" is not recognised in the configured grade list`);
          } else if (maxAllowedIdx === -1) {
            // allowed grades not in ordered list — fall back to exact
            if (!allowed.includes(playerGrade)) {
              gradeReasons.push(`Player grade "${playerGrade}" is not in allowed grades: ${allowed.join(', ')}`);
            }
          } else if (playerIdx > maxAllowedIdx) {
            gradeReasons.push(
              `Player grade "${playerGrade}" exceeds the highest allowed grade (${orderedGrades[maxAllowedIdx]}) — player cannot play up in this division`
            );
          }
          // playerIdx <= maxAllowedIdx → eligible (younger grade playing up is allowed)
        } else {
          // No ordered grade list available — fall back to exact match
          if (!playerGrade || !allowed.includes(playerGrade)) {
            gradeReasons.push(`Player grade "${playerGrade ?? 'not set'}" is not in allowed grades: ${allowed.join(', ')}`);
          }
        }
      } else {
        // 'exact' — must be in exactly one of the allowed grades
        if (!playerGrade || !allowed.includes(playerGrade)) {
          gradeReasons.push(
            `Player grade "${playerGrade ?? 'not set'}" is not in allowed grades: ${allowed.join(', ')} — playing up is not permitted in this division`
          );
        }
      }
    }

    // ── Apply eligibility mode ─────────────────────────────────────────────
    // 'age'    — age must pass (grade ignored)
    // 'grade'  — grade must pass (age ignored)
    // 'either' — eligible if age passes OR grade passes (WSYBL-style OR logic)
    let eligible: boolean;
    let reasons: string[];

    if (mode === 'age') {
      eligible = ageReasons.length === 0;
      reasons  = ageReasons;
    } else if (mode === 'grade') {
      eligible = gradeReasons.length === 0;
      reasons  = gradeReasons;
    } else {
      // 'either' — passes if EITHER check passes
      const agePasses   = hasAgeRule   ? ageReasons.length === 0   : true;
      const gradePasses = hasGradeRule ? gradeReasons.length === 0 : true;
      eligible = agePasses || gradePasses;
      // Only surface reasons when BOTH fail
      reasons = eligible ? [] : [
        ...ageReasons.map((r) => `Age: ${r}`),
        ...gradeReasons.map((r) => `Grade: ${r}`),
      ];
    }

    return { eligible, reasons };
  },
};
