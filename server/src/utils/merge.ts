/**
 * Merge {{field}} placeholders in a template string.
 * HTML-escapes all substituted values to prevent injection.
 */
export function mergeFields(template: string, ctx: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = ctx[key];
    if (val === undefined) return `{{${key}}}`;
    return escapeHtml(val);
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Build the merge context object for a player offer email. */
export function buildMergeContext(opts: {
  playerFirstName: string;
  playerLastName: string;
  parentName: string;
  teamName: string;
  seasonLabel: string;
  deadline: string;
  acceptUrl: string;
  declineUrl: string;
  registrationUrl?: string | null;
  orgName?: string;
}): Record<string, string> {
  return {
    playerFirstName: opts.playerFirstName,
    playerLastName:  opts.playerLastName,
    parentName:      opts.parentName,
    team:            opts.teamName,
    season:          opts.seasonLabel,
    deadline:        opts.deadline,
    acceptUrl:       opts.acceptUrl,
    declineUrl:      opts.declineUrl,
    registrationUrl: opts.registrationUrl ?? '',
    orgName:         opts.orgName ?? 'Hamilton Jr Chargers',
  };
}
