/**
 * DivisionService unit tests — checkPlayerEligibility logic.
 *
 * The DB-fetching checkPlayerEligibility method is integration-tested
 * separately.  These tests exercise the pure eligibility rules extracted
 * verbatim from DivisionService.ts so we can cover every branch without
 * a live database.
 */

// ---------------------------------------------------------------------------
// Pure helper: mirrors the logic inside DivisionService.checkPlayerEligibility
// ---------------------------------------------------------------------------

interface PlayerLike {
  dateOfBirth?: string | null;
  ageOverride?: number | null;
  grade?: string | null;
}

interface DivisionLike {
  minAgeYears?: number | null;
  maxAgeYears?: number | null;
  allowedGrades?: string[] | null;
}

function computeEligibility(
  player: PlayerLike,
  division: DivisionLike,
  seasonStartDate: string
): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const seasonStart = new Date(seasonStartDate);

  // Age check
  if (player.ageOverride != null) {
    const age = player.ageOverride;
    if (division.minAgeYears != null && age < division.minAgeYears) {
      reasons.push(`Player age ${age} is below division minimum ${division.minAgeYears}`);
    }
    if (division.maxAgeYears != null && age > division.maxAgeYears) {
      reasons.push(`Player age ${age} is above division maximum ${division.maxAgeYears}`);
    }
  } else if (player.dateOfBirth) {
    const dob = new Date(player.dateOfBirth);
    let age = seasonStart.getFullYear() - dob.getFullYear();
    const monthDiff = seasonStart.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && seasonStart.getDate() < dob.getDate())) {
      age -= 1;
    }
    if (division.minAgeYears != null && age < division.minAgeYears) {
      reasons.push(`Player age ${age} is below division minimum ${division.minAgeYears}`);
    }
    if (division.maxAgeYears != null && age > division.maxAgeYears) {
      reasons.push(`Player age ${age} is above division maximum ${division.maxAgeYears}`);
    }
  } else if (division.minAgeYears != null || division.maxAgeYears != null) {
    // Age check is required but no birth date or override is available
    reasons.push('Player birth date is required for age eligibility check');
  }

  // Grade check
  if (division.allowedGrades != null && division.allowedGrades.length > 0) {
    if (!player.grade || !division.allowedGrades.includes(player.grade)) {
      reasons.push(
        `Player grade "${player.grade ?? 'unknown'}" is not in allowed grades: ${division.allowedGrades.join(', ')}`
      );
    }
  }

  return { eligible: reasons.length === 0, reasons };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Division eligibility — age checks', () => {
  const division = { minAgeYears: 10, maxAgeYears: 12 };

  it('1. player within age range → eligible', () => {
    // 11 years old on season start
    const player = { dateOfBirth: '2013-04-01' };
    const result = computeEligibility(player, division, '2024-06-01');
    expect(result.eligible).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it('2. player too young → ineligible with reason mentioning minimum', () => {
    // 9 years old on season start
    const player = { dateOfBirth: '2014-07-01' };
    const result = computeEligibility(player, division, '2024-06-01');
    expect(result.eligible).toBe(false);
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toMatch(/below division minimum/);
  });

  it('3. player too old → ineligible with reason mentioning maximum', () => {
    // 13 years old on season start
    const player = { dateOfBirth: '2011-01-15' };
    const result = computeEligibility(player, division, '2024-06-01');
    expect(result.eligible).toBe(false);
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toMatch(/above division maximum/);
  });

  it('4. no age limits set → eligible regardless of age', () => {
    const noAgeDivision = { minAgeYears: null, maxAgeYears: null };
    // 6 years old — would fail almost any league
    const player = { dateOfBirth: '2018-01-01' };
    const result = computeEligibility(player, noAgeDivision, '2024-06-01');
    expect(result.eligible).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });
});

describe('Division eligibility — grade checks', () => {
  it('5. player grade in allowed list → eligible', () => {
    const division = { allowedGrades: ['5th', '6th', '7th'] };
    const player = { grade: '6th', dateOfBirth: '2012-01-01' };
    const result = computeEligibility(player, division, '2024-06-01');
    expect(result.eligible).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it('6. player grade not in allowed list → ineligible with reason', () => {
    const division = { allowedGrades: ['5th', '6th', '7th'] };
    const player = { grade: '8th', dateOfBirth: '2012-01-01' };
    const result = computeEligibility(player, division, '2024-06-01');
    expect(result.eligible).toBe(false);
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toMatch(/not in allowed grades/);
    expect(result.reasons[0]).toContain('8th');
  });

  it('7. no grade restrictions (null) → eligible regardless of grade', () => {
    const division = { allowedGrades: null };
    const player = { grade: '12th', dateOfBirth: '2012-01-01' };
    const result = computeEligibility(player, division, '2024-06-01');
    expect(result.eligible).toBe(true);
  });

  it('7b. no grade restrictions (empty array) → eligible regardless of grade', () => {
    const division = { allowedGrades: [] };
    const player = { grade: '12th', dateOfBirth: '2012-01-01' };
    const result = computeEligibility(player, division, '2024-06-01');
    expect(result.eligible).toBe(true);
  });
});

describe('Division eligibility — combined checks', () => {
  it('8. age ok but grade fails → ineligible (grade reason only)', () => {
    const division = { minAgeYears: 10, maxAgeYears: 12, allowedGrades: ['5th', '6th'] };
    // 11 years old, wrong grade
    const player = { dateOfBirth: '2013-04-01', grade: '8th' };
    const result = computeEligibility(player, division, '2024-06-01');
    expect(result.eligible).toBe(false);
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toMatch(/not in allowed grades/);
  });

  it('9. both age and grade fail → ineligible with two reasons', () => {
    const division = { minAgeYears: 10, maxAgeYears: 12, allowedGrades: ['5th', '6th'] };
    // 8 years old, wrong grade
    const player = { dateOfBirth: '2016-01-01', grade: '3rd' };
    const result = computeEligibility(player, division, '2024-06-01');
    expect(result.eligible).toBe(false);
    expect(result.reasons).toHaveLength(2);
    expect(result.reasons.some(r => /below division minimum/.test(r))).toBe(true);
    expect(result.reasons.some(r => /not in allowed grades/.test(r))).toBe(true);
  });
});

describe('Division eligibility — missing birth date', () => {
  it('10. no dateOfBirth when age check required → ineligible with birth date reason', () => {
    const division = { minAgeYears: 10, maxAgeYears: 12 };
    const player = { dateOfBirth: null };
    const result = computeEligibility(player, division, '2024-06-01');
    expect(result.eligible).toBe(false);
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toMatch(/birth date/i);
  });

  it('10b. no dateOfBirth but no age limits → still eligible', () => {
    const division = { minAgeYears: null, maxAgeYears: null };
    const player = { dateOfBirth: null };
    const result = computeEligibility(player, division, '2024-06-01');
    expect(result.eligible).toBe(true);
  });
});

describe('Division eligibility — birthday edge cases', () => {
  it('11. player turns exactly minAge on season start date → eligible', () => {
    const division = { minAgeYears: 10, maxAgeYears: 12 };
    // Born exactly 10 years before season start
    const player = { dateOfBirth: '2014-06-01' };
    const result = computeEligibility(player, division, '2024-06-01');
    expect(result.eligible).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it('11b. player birthday is one day after season start → still one year younger', () => {
    const division = { minAgeYears: 10, maxAgeYears: 12 };
    // Would be 10 the next day — age calculates as 9
    const player = { dateOfBirth: '2014-06-02' };
    const result = computeEligibility(player, division, '2024-06-01');
    expect(result.eligible).toBe(false);
    expect(result.reasons[0]).toMatch(/below division minimum/);
  });

  it('11c. player turns exactly maxAge on season start → eligible (not over)', () => {
    const division = { minAgeYears: 10, maxAgeYears: 12 };
    // Turns 12 on season start
    const player = { dateOfBirth: '2012-06-01' };
    const result = computeEligibility(player, division, '2024-06-01');
    expect(result.eligible).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });
});

describe('Division eligibility — ageOverride', () => {
  it('ageOverride within range → eligible (ignores dateOfBirth)', () => {
    const division = { minAgeYears: 10, maxAgeYears: 12 };
    // dateOfBirth would make player 15 but override says 11
    const player = { dateOfBirth: '2009-01-01', ageOverride: 11 };
    const result = computeEligibility(player, division, '2024-06-01');
    expect(result.eligible).toBe(true);
  });

  it('ageOverride outside range → ineligible', () => {
    const division = { minAgeYears: 10, maxAgeYears: 12 };
    const player = { dateOfBirth: '2013-01-01', ageOverride: 13 };
    const result = computeEligibility(player, division, '2024-06-01');
    expect(result.eligible).toBe(false);
    expect(result.reasons[0]).toMatch(/above division maximum/);
  });
});
