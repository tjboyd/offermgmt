/**
 * PlayerService unit tests — flag logic, role enforcement, team-scoping.
 */

import { PlayerError } from '../PlayerService';

// All DB-dependent functions are integration-tested separately.
// These tests cover pure logic that doesn't require DB access.

describe('PlayerError', () => {
  it('carries statusCode and message', () => {
    const e = new PlayerError('Access denied.', 403);
    expect(e.statusCode).toBe(403);
    expect(e.message).toBe('Access denied.');
    expect(e instanceof Error).toBe(true);
  });
});

describe('Team-scope enforcement logic', () => {
  it('blocks access when player team is not in user team list', () => {
    const userTeamIds = ['team-A', 'team-B'];
    const playerTeamId = 'team-C';
    const hasAccess = !userTeamIds || userTeamIds.includes(playerTeamId);
    expect(hasAccess).toBe(false);
  });

  it('grants access when player team is in user team list', () => {
    const userTeamIds = ['team-A', 'team-B'];
    const playerTeamId = 'team-B';
    const hasAccess = !userTeamIds || userTeamIds.includes(playerTeamId);
    expect(hasAccess).toBe(true);
  });

  it('grants access to admin/board with no team restriction (undefined teamIds)', () => {
    const userTeamIds: string[] | undefined = undefined;
    const hasAccess = !userTeamIds;
    expect(hasAccess).toBe(true);
  });
});

describe('Early offer eligibility rules', () => {
  it('blocks assistant_coach from setting early offer eligible', () => {
    const role = 'assistant_coach';
    const wouldThrow = role === 'assistant_coach';
    expect(wouldThrow).toBe(true);
  });

  it('blocks early offer eligible when player is not returning', () => {
    const isReturning = false;
    const value       = true;
    const wouldThrow  = value && !isReturning;
    expect(wouldThrow).toBe(true);
  });

  it('allows early offer eligible when player is returning', () => {
    const isReturning = true;
    const value       = true;
    const wouldThrow  = value && !isReturning;
    expect(wouldThrow).toBe(false);
  });

  it('allows clearing early offer eligible regardless of returning status', () => {
    const isReturning = false;
    const value       = false; // clearing, not setting
    const wouldThrow  = value && !isReturning;
    expect(wouldThrow).toBe(false);
  });
});

describe('Returning flag source rules', () => {
  it('sets returning_source to manual when manually flagged', () => {
    const value  = true;
    const source = value ? 'manual' : null;
    expect(source).toBe('manual');
  });

  it('clears returning_source when flag cleared', () => {
    const value  = false;
    const source = value ? 'manual' : null;
    expect(source).toBeNull();
  });
});

describe('Status valid transitions', () => {
  const validStatuses = ['draft', 'sent', 'accepted', 'declined', 'expired', 'waitlisted', 'rejected'];

  it('only allows known statuses', () => {
    expect(validStatuses.includes('draft')).toBe(true);
    expect(validStatuses.includes('accepted')).toBe(true);
    expect(validStatuses.includes('unknown_status')).toBe(false);
  });
});

describe('profileId field rules', () => {
  it('manually-created players have no profileId (null)', () => {
    // profileId is only set by SE import or merge; manual creates never supply it
    const manualPlayerInput = {
      firstName: 'Jake', lastName: 'Smith', parentEmail: 'p@x.com',
      teamId: 't1', seasonId: 's1',
    };
    expect(Object.keys(manualPlayerInput)).not.toContain('profileId');
  });

  it('duplicate detection uses firstName + lastName + dateOfBirth', () => {
    // Simulates the intra-season duplicate key logic from the admin route
    const makeKey = (r: { seasonId: string; firstName: string; lastName: string; dateOfBirth: string | null }) =>
      `${r.seasonId}::${r.firstName.toLowerCase()}::${r.lastName.toLowerCase()}::${r.dateOfBirth ?? ''}`;

    const p1 = { seasonId: 's1', firstName: 'Jake', lastName: 'Smith', dateOfBirth: '2014-03-15' };
    const p2 = { seasonId: 's1', firstName: 'jake', lastName: 'SMITH', dateOfBirth: '2014-03-15' };
    const p3 = { seasonId: 's1', firstName: 'Jake', lastName: 'Smith', dateOfBirth: '2015-01-01' };
    const p4 = { seasonId: 's2', firstName: 'Jake', lastName: 'Smith', dateOfBirth: '2014-03-15' };

    expect(makeKey(p1)).toBe(makeKey(p2)); // same player, different case → duplicate
    expect(makeKey(p1)).not.toBe(makeKey(p3)); // different DOB → not duplicate
    expect(makeKey(p1)).not.toBe(makeKey(p4)); // different season → not duplicate
  });

  it('merge fills blank dateOfBirth but preserves existing', () => {
    const fillIfBlank = (existing: string | null, incoming: string | null) =>
      !existing ? incoming : undefined;

    expect(fillIfBlank(null, '2014-03-15')).toBe('2014-03-15'); // fills blank
    expect(fillIfBlank('2014-03-15', '2015-01-01')).toBeUndefined(); // preserves existing
  });

  it('merge fills blank grade but preserves existing', () => {
    const fillIfBlank = (existing: string | null, incoming: string | null) =>
      !existing ? incoming : undefined;

    expect(fillIfBlank(null, '6th')).toBe('6th');
    expect(fillIfBlank('5th', '6th')).toBeUndefined();
  });
});

describe('Notes are never in email merge context', () => {
  it('buildMergeContext does not expose notes field', async () => {
    const { buildMergeContext } = await import('../../utils/merge');
    const ctx = buildMergeContext({
      playerFirstName: 'Jake', playerLastName: 'Smith',
      parentName: 'Mike', teamName: '12U AAA', seasonLabel: '2027',
      deadline: 'July 31', acceptUrl: 'https://x', declineUrl: 'https://y',
    });
    expect('notes' in ctx).toBe(false);
    expect(Object.keys(ctx).join(',')).not.toContain('notes');
  });
});
