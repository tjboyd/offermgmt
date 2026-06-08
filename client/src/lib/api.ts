/** Typed API client — wraps fetch with auth headers and error handling. */

let accessToken: string | null = null;

export function setAccessToken(token: string | null) { accessToken = token; }
export function getAccessToken() { return accessToken; }

interface ApiOptions extends RequestInit {
  skipAuth?: boolean;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const { skipAuth, ...fetchOpts } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> ?? {}),
  };

  if (!skipAuth && accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const res = await fetch(`/api/v1${path}`, { ...fetchOpts, headers });

  if (!res.ok) {
    let message = res.statusText;
    try { const b = await res.json(); message = b.error ?? message; } catch {}
    throw new ApiError(res.status, message);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
  login:          (email: string, password: string) =>
    apiFetch<{ accessToken: string; user: AuthUser }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }), skipAuth: true }),
  logout:         () => apiFetch('/auth/logout', { method: 'POST' }),
  me:             () => apiFetch<{ user: AuthUser }>('/auth/me'),
  updateMe:       (fullName: string) =>
    apiFetch('/auth/me', { method: 'PATCH', body: JSON.stringify({ fullName }) }),
  changePassword: (currentPassword: string, newPassword: string) =>
    apiFetch('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
  activate:       (token: string, password: string) =>
    apiFetch('/auth/activate', { method: 'POST', body: JSON.stringify({ token, password }), skipAuth: true }),
  resetPassword:  (token: string, password: string) =>
    apiFetch('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }), skipAuth: true }),
};

// ─── Users ────────────────────────────────────────────────────────────────────

export const usersApi = {
  list:        () => apiFetch<{ users: UserRow[] }>('/users'),
  invite:      (data: InviteInput) => apiFetch('/users/invite', { method: 'POST', body: JSON.stringify(data) }),
  update:      (id: string, data: Partial<InviteInput>) => apiFetch(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  forceReset:  (id: string) => apiFetch(`/users/${id}/force-reset`, { method: 'POST' }),
  deactivate:  (id: string) => apiFetch(`/users/${id}/deactivate`, { method: 'PATCH' }),
  reactivate:  (id: string) => apiFetch(`/users/${id}/reactivate`, { method: 'PATCH' }),
  delete:      (id: string) => apiFetch(`/users/${id}`, { method: 'DELETE' }),
  resendInvite:(id: string) => apiFetch(`/users/${id}/resend-invite`, { method: 'POST' }),
};

// ─── Integrations ─────────────────────────────────────────────────────────────

export const integrationsApi = {
  status:      () => apiFetch<IntegrationStatus>('/integrations'),
  saveSE:      (data: { client_id: string; client_secret: string; org_id?: number }) =>
    apiFetch('/integrations/sportsengine', { method: 'PUT', body: JSON.stringify(data) }),
  deleteSE:    () => apiFetch('/integrations/sportsengine', { method: 'DELETE' }),
  testSE:      () => apiFetch<{ ok: boolean; orgName?: string; error?: string; code?: string }>('/integrations/sportsengine/test', { method: 'POST' }),
  saveSG:      (data: { api_key?: string; sender_name?: string; sender_email?: string; cc_email?: string; test_email?: string }) =>
    apiFetch('/integrations/sendgrid', { method: 'PUT', body: JSON.stringify(data) }),
  deleteSG:    () => apiFetch('/integrations/sendgrid', { method: 'DELETE' }),
  testSG:      (testEmail: string) => apiFetch<{ ok: boolean; message?: string; error?: string }>('/integrations/sendgrid/test', { method: 'POST', body: JSON.stringify({ testEmail }) }),
  saveRS:      (data: { api_key?: string; sender_name?: string; sender_email?: string; cc_email?: string; test_email?: string }) =>
    apiFetch('/integrations/resend', { method: 'PUT', body: JSON.stringify(data) }),
  deleteRS:    () => apiFetch('/integrations/resend', { method: 'DELETE' }),
  testRS:      (testEmail: string) => apiFetch<{ ok: boolean; message?: string; error?: string }>('/integrations/resend/test', { method: 'POST', body: JSON.stringify({ testEmail }) }),
  setEmailProvider: (provider: EmailProvider) =>
    apiFetch('/integrations/email-provider', { method: 'PUT', body: JSON.stringify({ provider }) }),
  setTestMode: (enabled: boolean) =>
    apiFetch<{ ok: boolean; testMode: boolean }>('/integrations/test-mode', { method: 'PUT', body: JSON.stringify({ enabled }) }),
};

// ─── Sync ─────────────────────────────────────────────────────────────────────

export const syncApi = {
  tryouts:   (seasonId?: string) =>
    apiFetch<{ ok: boolean; result: SyncResult }>('/sync/tryouts', { method: 'POST', body: JSON.stringify({ seasonId }) }),
  returning: (seasonId?: string) =>
    apiFetch<{ ok: boolean; result: ReturningResult }>('/sync/returning', { method: 'POST', body: JSON.stringify({ seasonId }) }),
  log:       (seasonId?: string) =>
    apiFetch<{ logs: SyncLogRow[] }>(`/sync/log${seasonId ? `?seasonId=${seasonId}` : ''}`),
};

// ─── SE Explorer ─────────────────────────────────────────────────────────────

export interface SEExplorerResult {
  ok: boolean;
  path?: string;
  endpoint?: string;
  data?: unknown;
  fetchedAt: string;
  error?: string;
  code?: string;
  note?: string;
  hint?: string;
  sentQuery?: string;
  // status endpoint extras
  configured?: boolean;
  maskedClientId?: string;
  tokenEndpoint?: string;
  graphqlEndpoint?: string;
  meData?: unknown;
  orgData?: unknown;
}

export const seExplorerApi = {
  status:           () => apiFetch<SEExplorerResult>('/integrations/se-explorer/status'),
  schemaRootFields: () => apiFetch<SEExplorerResult>('/integrations/se-explorer/schema/root'),
  schemaTypes:      () => apiFetch<SEExplorerResult>('/integrations/se-explorer/schema/types'),
  schemaType:       (name: string) => apiFetch<SEExplorerResult>(`/integrations/se-explorer/schema/type/${encodeURIComponent(name)}`),
  organization:     () => apiFetch<SEExplorerResult>('/integrations/se-explorer/organization'),
  probeSeasons:     () => apiFetch<SEExplorerResult>('/integrations/se-explorer/probe/seasons'),
  allTeams:         () => apiFetch<SEExplorerResult>('/integrations/se-explorer/teams'),
  seasons:          () => apiFetch<SEExplorerResult>('/integrations/se-explorer/seasons'),
  season:           (id: string) => apiFetch<SEExplorerResult>(`/integrations/se-explorer/seasons/${id}`),
  seasonTeams:      (id: string) => apiFetch<SEExplorerResult>(`/integrations/se-explorer/seasons/${id}/teams`),
  formSchema:       (id: string) => apiFetch<SEExplorerResult>(`/integrations/se-explorer/registrations/${id}/schema`),
  formSample:       (id: string) => apiFetch<SEExplorerResult>(`/integrations/se-explorer/registrations/${id}/sample`),
  graphql:          (query: string, variables?: Record<string, unknown>) =>
    apiFetch<SEExplorerResult>('/integrations/se-explorer/graphql', {
      method: 'POST',
      body: JSON.stringify({ query, variables }),
    }),
  importTeamsPreview: () => apiFetch<SEImportTeamsResult>('/integrations/se-explorer/import/teams', { method: 'POST' }),
  importTeamsCommit:  (selectedIds: string[], seasonMappings: { seLabel: string; appSeasonId?: string }[]) =>
    apiFetch<SEImportTeamsResult>('/integrations/se-explorer/import/teams?commit=true', { method: 'POST', body: JSON.stringify({ selectedIds, seasonMappings }) }),
  importPlayersPreview: (registrationId: string, seasonId: string) =>
    apiFetch<SEImportPlayersPreviewResult>('/integrations/se-explorer/import/players', {
      method: 'POST',
      body: JSON.stringify({ registrationId, seasonId, commit: false }),
    }),
  importPlayersCommit: (registrationId: string, seasonId: string, selectedProfileIds: string[]) =>
    apiFetch<SEImportPlayersCommitResult>('/integrations/se-explorer/import/players', {
      method: 'POST',
      body: JSON.stringify({ registrationId, seasonId, selectedProfileIds, commit: true }),
    }),
  // Explorer diagnostic views (PII intact — for the SE API Explorer panel)
  registrationProfiles: (registrationId: string) =>
    apiFetch<SEExplorerResult>(`/integrations/se-explorer/registrations/${encodeURIComponent(registrationId)}/profiles`),
  profileDetail: (profileId: string) =>
    apiFetch<SEExplorerResult>(`/integrations/se-explorer/profile/${encodeURIComponent(profileId)}`),
};

export interface SEImportTeamEntry {
  seId:     string;
  name:     string;
  division: string | null;
  season:   string | null;
}

export interface SESeasonStatus {
  seLabel:     string;
  appSeasonId: string | null;  // null = does not exist yet in the app
}

export interface SEImportTeamsResult {
  ok:            boolean;
  commit:        boolean;
  seasonStatus:  SESeasonStatus[];
  created:       SEImportTeamEntry[];
  updated:       SEImportTeamEntry[];
  skipped:       string[];
  message:       string;
  error?:        string;
}

// ─── SE Player Import ─────────────────────────────────────────────────────────

export interface SEImportPlayerEntry {
  profileId:   string;
  firstName:   string;
  lastName:    string;
  dateOfBirth: string | null;
  grade:       string | null;
  parentEmail: string | null;
  parentName:  string | null;
}

export interface SEImportPlayerDuplicate extends SEImportPlayerEntry {
  existingPlayerId: string;
  existingStatus:   string;
}

export interface SEImportPlayersPreviewResult {
  ok:           boolean;
  commit:       false;
  seasonLabel:  string;
  toCreate:     SEImportPlayerEntry[];
  duplicates:   SEImportPlayerDuplicate[];
  message:      string;
  error?:       string;
}

export interface SEImportPlayersCommitResult {
  ok:      boolean;
  commit:  true;
  created: number;
  merged:  number;
  skipped: number;
  message: string;
  error?:  string;
}

export interface CsvImportPreview {
  ok: boolean;
  commit: boolean;
  created?: { name: string; division: string | null }[];
  updated?: { name: string; division: string | null }[];
  skipped?: string[];
  valid?:   { firstName: string; lastName: string; teamName: string; teamFound: boolean }[];
  errors:   { row: number; message: string }[];
  message:  string;
}

export interface CsvImportUsersPreview {
  ok:      boolean;
  commit:  boolean;
  invited: { email: string; fullName: string; role: string; teamsAssigned: string[] }[];
  skipped: { email: string; reason: string }[];
  errors:  { row: number; message: string }[];
  message: string;
}

export const csvImportApi = {
  templateTeams:   () => fetch('/api/v1/import/template/teams', {
    headers: { Authorization: `Bearer ${getAccessToken() ?? ''}` }
  }),
  templatePlayers: () => fetch('/api/v1/import/template/players', {
    headers: { Authorization: `Bearer ${getAccessToken() ?? ''}` }
  }),
  previewTeams:  (csv: string) =>
    apiFetch<CsvImportPreview>('/import/teams',   { method: 'POST', body: JSON.stringify({ csv, commit: false }) }),
  commitTeams:   (csv: string) =>
    apiFetch<CsvImportPreview>('/import/teams',   { method: 'POST', body: JSON.stringify({ csv, commit: true  }) }),
  previewPlayers: (csv: string, seasonId?: string) =>
    apiFetch<CsvImportPreview>('/import/players', { method: 'POST', body: JSON.stringify({ csv, seasonId, commit: false }) }),
  commitPlayers:  (csv: string, seasonId?: string) =>
    apiFetch<CsvImportPreview>('/import/players', { method: 'POST', body: JSON.stringify({ csv, seasonId, commit: true  }) }),
  templateUsers:  () => fetch('/api/v1/import/template/users', {
    headers: { Authorization: `Bearer ${getAccessToken() ?? ''}` }
  }),
  previewUsers:  (csv: string) =>
    apiFetch<CsvImportUsersPreview>('/import/users', { method: 'POST', body: JSON.stringify({ csv, commit: false }) }),
  commitUsers:   (csv: string) =>
    apiFetch<CsvImportUsersPreview>('/import/users', { method: 'POST', body: JSON.stringify({ csv, commit: true }) }),
};

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string; fullName: string; email: string;
  role: 'admin' | 'board' | 'head_coach' | 'assistant_coach';
}

export interface UserRow extends AuthUser {
  emailVerified: boolean; isActive: boolean;
  teamIds: string[]; createdAt: string; lastLoginAt: string | null;
}

export interface InviteInput {
  email: string; fullName: string;
  role: 'admin' | 'board' | 'head_coach' | 'assistant_coach';
  teamIds?: string[];
}

export type EmailProvider = 'sendgrid' | 'resend';

export interface IntegrationStatus {
  sportsengine:  { configured: boolean; maskedClientId: string | null; orgId: number | null };
  sendgrid:      { configured: boolean; maskedSenderEmail: string | null; ccEmail: string | null; testEmail: string | null } | undefined;
  resend:        { configured: boolean; maskedSenderEmail: string | null; ccEmail: string | null; testEmail: string | null } | undefined;
  emailProvider: EmailProvider;
  testMode:      boolean;
}

export interface SyncResult {
  seasonId: string; formNamesQueried: string[];
  recordsFetched: number; recordsNew: number;
  recordsUpdated: number; recordsSkipped: number;
  errorMessage: string | null;
}

export interface ReturningResult {
  checked: number; matched: number; errors: string[];
}

// ─── Teams ────────────────────────────────────────────────────────────────────

export const teamsApi = {
  list:        () => apiFetch<{ teams: TeamRow[] }>('/teams'),
  create:      (data: { name: string; division?: string; divisionId?: string | null; seasonId?: string | null }) =>
    apiFetch<{ ok: boolean; team: TeamRow }>('/teams', { method: 'POST', body: JSON.stringify(data) }),
  update:      (id: string, data: { name?: string; division?: string; divisionId?: string | null; seasonId?: string | null }) =>
    apiFetch(`/teams/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deactivate:  (id: string) => apiFetch(`/teams/${id}/deactivate`, { method: 'PATCH' }),
  activate:    (id: string) => apiFetch(`/teams/${id}/activate`,   { method: 'PATCH' }),
  delete:      (id: string) => apiFetch(`/teams/${id}`,            { method: 'DELETE' }),
  bulkDelete:  (ids: string[]) =>
    apiFetch('/teams/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) }),
  deleteAll:   () => apiFetch('/teams', { method: 'DELETE' }),
  coaches:     (id: string) => apiFetch<{ coaches: TeamCoach[] }>(`/teams/${id}/coaches`),
  setCoaches:  (id: string, coaches: TeamCoach[]) =>
    apiFetch(`/teams/${id}/coaches`, { method: 'PATCH', body: JSON.stringify({ coaches }) }),
};

// ─── Seasons ──────────────────────────────────────────────────────────────────

export const seasonsApi = {
  list:     () => apiFetch<{ seasons: SeasonRow[] }>('/seasons'),
  create:   (data: Partial<SeasonRow>) =>
    apiFetch<{ ok: boolean; season: SeasonRow }>('/seasons', { method: 'POST', body: JSON.stringify(data) }),
  get:      (id: string) => apiFetch<{ season: SeasonRow }>(`/seasons/${id}`),
  update:   (id: string, data: Partial<SeasonRow>) =>
    apiFetch(`/seasons/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  activate: (id: string) => apiFetch(`/seasons/${id}/activate`, { method: 'POST' }),
  archive:  (id: string) => apiFetch(`/seasons/${id}/archive`, { method: 'POST' }),
  delete:   (id: string) => apiFetch(`/seasons/${id}`, { method: 'DELETE' }),
  syncLog:  (id: string) => apiFetch<{ logs: SyncLogRow[] }>(`/seasons/${id}/sync-log`),
};

// ─── Players ──────────────────────────────────────────────────────────────────

export const playersAdminApi = {
  list:             (q?: { seasonId?: string; search?: string; page?: string; perPage?: string }) => {
    const params = Object.fromEntries(
      Object.entries(q ?? {}).filter(([, v]) => v !== undefined && v !== null),
    ) as Record<string, string>;
    return apiFetch<{ players: PlayerRow[]; total: number }>(`/players/admin?${new URLSearchParams(params).toString()}`);
  },
  deleteBySeason:   (seasonId: string) =>
    apiFetch<{ ok: boolean; deleted: number }>(`/players/by-season/${seasonId}`, { method: 'DELETE' }),
  merge:            (playerId: string, data: { profileId: string; dateOfBirth?: string; grade?: string; parentName?: string; parentEmail?: string }) =>
    apiFetch(`/players/${playerId}/merge`, { method: 'PATCH', body: JSON.stringify(data) }),
};

export const playersApi = {
  list:             (q?: PlayerListQuery) => {
    const params = Object.fromEntries(
      Object.entries(q ?? {}).filter(([, v]) => v !== undefined && v !== null),
    ) as Record<string, string>;
    return apiFetch<PlayerListResult>(`/players?${new URLSearchParams(params).toString()}`);
  },
  create:           (data: CreatePlayerInput) =>
    apiFetch<{ ok: boolean; id: string }>('/players', { method: 'POST', body: JSON.stringify(data) }),
  get:              (id: string) => apiFetch<PlayerDetailResult>(`/players/${id}`),
  update:           (id: string, data: Partial<CreatePlayerInput>) =>
    apiFetch(`/players/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete:           (id: string) => apiFetch(`/players/${id}`, { method: 'DELETE' }),
  setStatus:        (id: string, status: string) =>
    apiFetch(`/players/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  setReturning:     (id: string, value: boolean) =>
    apiFetch(`/players/${id}/returning-flag`, { method: 'PATCH', body: JSON.stringify({ value }) }),
  setEarlyOffer:    (id: string, value: boolean) =>
    apiFetch(`/players/${id}/early-offer-eligible`, { method: 'PATCH', body: JSON.stringify({ value }) }),
  updateNotes:      (id: string, notes: string) =>
    apiFetch(`/players/${id}/notes`, { method: 'PATCH', body: JSON.stringify({ notes }) }),
  activity:         (id: string) => apiFetch<{ activity: ActivityItem[] }>(`/players/${id}/activity`),
};

// ─── Dashboard ────────────────────────────────────────────────────────────────

export const dashboardApi = {
  stats:    () => apiFetch<{ counts: StatusCounts; season: { id: string; label: string } | null }>('/dashboard/stats'),
  activity: () => apiFetch<{ activity: ActivityItem[] }>('/dashboard/activity'),
};

// ─── Offers ───────────────────────────────────────────────────────────────────

export const offersApi = {
  send: (data: {
    playerIds: string[];
    mode: 'early' | 'post_tryout' | 'rejection';
    seasonId?: string;
    expiresAt?: string;
    sendMethod: 'sendgrid' | 'manual_copy';
    resend?: boolean;
  }) => apiFetch<{ ok: boolean; results: { playerId: string; success: boolean }[] }>(
    '/offers', { method: 'POST', body: JSON.stringify(data) }
  ),
  render: (data: {
    playerId: string;
    mode: 'early' | 'post_tryout' | 'rejection';
    seasonId?: string;
    expiresAt?: string;
  }) => apiFetch<{ rendered: RenderedEmail }>('/offers/render', { method: 'POST', body: JSON.stringify(data) }),
};

// ─── Email templates ──────────────────────────────────────────────────────────

export const emailTemplatesApi = {
  list: (seasonId: string) =>
    apiFetch<{ templates: EmailTemplate[] }>(`/email-templates/${seasonId}`),
  update: (seasonId: string, key: string, data: { subject: string; bodyHtml: string }) =>
    apiFetch(`/email-templates/${seasonId}/${key}`, { method: 'PUT', body: JSON.stringify(data) }),
};

// ─── Config ───────────────────────────────────────────────────────────────────

export const configApi = {
  get:    () => apiFetch<{ config: Record<string, unknown> }>('/config'),
  update: (data: Record<string, unknown>) => apiFetch('/config', { method: 'PATCH', body: JSON.stringify(data) }),
};

// ─── Wizard ───────────────────────────────────────────────────────────────────

export interface WizardDraft {
  id: string; step: number;
  draftData: Record<string, unknown> | null;
}

export const wizardApi = {
  get:         () => apiFetch<{ draft: WizardDraft | null }>('/wizard'),
  step1:       (data: Record<string, unknown>) =>
    apiFetch<{ ok: boolean; wizardId: string; carryForward: unknown }>('/wizard/step1', { method: 'POST', body: JSON.stringify(data) }),
  step2:       (data: { wizardId: string; templates?: unknown[] }) =>
    apiFetch('/wizard/step2', { method: 'POST', body: JSON.stringify(data) }),
  step3Check:  () => apiFetch<{ checks: Array<{ name: string; status: string; detail: string }> }>('/wizard/step3-check', { method: 'POST' }),
  commit:      (wizardId: string) =>
    apiFetch<{ ok: boolean; season: SeasonRow }>('/wizard/commit', { method: 'POST', body: JSON.stringify({ wizardId }) }),
  discard:     (wizardId: string) => apiFetch(`/wizard/${wizardId}`, { method: 'DELETE' }),
  resetData:   (phrase: string) =>
    apiFetch('/wizard/reset-data', { method: 'POST', body: JSON.stringify({ phrase }) }),
};

// ─── Additional types ─────────────────────────────────────────────────────────

export interface TeamRow {
  id: string; name: string; division?: string | null; seasonId?: string | null; seId?: string | null; isActive: boolean; createdAt: string;
  divisionId?: string | null;
}

export interface TeamCoach {
  userId: string; roleAtTeam: 'head_coach' | 'assistant_coach';
  fullName?: string; email?: string;
}

export interface SeasonRow {
  id: string; label: string; seTryoutFormNames: string[];
  seRegistrationUrl?: string | null;
  seRegistrationId?: string | null;
  registrationUrl?: string | null;
  offerExpiresDays: number;
  tryoutStart?: string | null; tryoutEnd?: string | null;
  seasonStartDate?: string | null;
  isActive: boolean; isArchived: boolean; createdAt: string;
}

export interface PlayerRow {
  id: string; seasonId: string; teamId: string | null;
  profileId?: string | null;
  firstName: string; lastName: string; dateOfBirth?: string | null;
  ageOverride?: number | null; grade?: string | null;
  parentName?: string | null; parentEmail: string;
  status: 'draft' | 'sent' | 'accepted' | 'declined' | 'expired' | 'waitlisted' | 'rejected';
  offerType?: 'early' | 'post_tryout' | null;
  isReturning: boolean; returningSource?: string | null;
  earlyOfferEligible: boolean; notes?: string | null;
  importedFromSe: boolean; createdAt: string; updatedAt: string;
  latestOffer?: OfferRow | null;
  isDuplicate?: boolean;
}

export interface OfferRow {
  id: string; playerId: string; seasonId: string;
  offerType: 'early' | 'post_tryout' | 'rejection';
  sentMethod?: 'sendgrid' | 'manual_copy' | null;
  sentAt?: string | null; openedAt?: string | null;
  landingViewedAt?: string | null; acceptedAt?: string | null;
  declinedAt?: string | null; seRedirectedAt?: string | null;
  expiresAt?: string | null; createdAt: string;
}

export interface ActivityItem {
  id: string; playerId?: string | null; offerId?: string | null;
  actorLabel: string; eventType: string;
  detail?: Record<string, unknown> | null; ts: string;
}

export interface StatusCounts {
  total: number; draft: number; sent: number; accepted: number;
  declined: number; expired: number; waitlisted: number; rejected: number;
}

export interface CreatePlayerInput {
  firstName: string; lastName: string; dateOfBirth?: string;
  ageOverride?: number; grade?: string; parentName?: string;
  parentEmail: string; teamId: string; seasonId?: string; notes?: string;
}

export interface PlayerListQuery {
  seasonId?: string; teamId?: string; status?: string;
  search?: string; returning?: string; earlyOffer?: string;
  page?: string; perPage?: string;
}

export interface PlayerListResult {
  players: PlayerRow[]; total: number;
}

export interface PlayerDetailResult {
  player: PlayerRow; offers: OfferRow[]; activity: ActivityItem[];
}

export interface RenderedEmail {
  to: string; toName: string;
  subject: string; bodyHtml: string; bodyText: string;
}

export interface EmailTemplate {
  id: string; seasonId: string; templateKey: string;
  subject: string; bodyHtml: string; updatedAt: string;
}

export interface SyncLogRow {
  id: string; triggeredAt: string;
  formNamesQueried: string[] | null;
  recordsFetched: number | null; recordsNew: number | null;
  recordsUpdated: number | null; recordsSkipped: number | null;
  errorMessage: string | null; completedAt: string | null;
}

// ─── Divisions ────────────────────────────────────────────────────────────────

export type EligibilityMode  = 'none' | 'age' | 'grade' | 'either';
export type AgeConstraint    = 'max_only' | 'range';
export type GradeConstraint  = 'exact' | 'not_exceed';

export interface DivisionRow {
  id: string;
  seasonId: string;
  name: string;
  eligibilityMode: EligibilityMode;
  ageConstraint:   AgeConstraint;
  minAgeYears?: number | null;
  maxAgeYears?: number | null;
  gradeConstraint: GradeConstraint;
  allowedGrades?: string[] | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EligibilityResult {
  eligible: boolean;
  reasons: string[];
}

export const divisionsApi = {
  listBySeason: (seasonId: string) =>
    apiFetch<{ divisions: DivisionRow[] }>(`/divisions?seasonId=${seasonId}`),
  create: (data: { seasonId: string; name: string; minAgeYears?: number | null; maxAgeYears?: number | null; allowedGrades?: string[] | null }) =>
    apiFetch<{ ok: boolean; division: DivisionRow }>('/divisions', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Pick<DivisionRow, 'name' | 'eligibilityMode' | 'ageConstraint' | 'minAgeYears' | 'maxAgeYears' | 'gradeConstraint' | 'allowedGrades' | 'isActive'>>) =>
    apiFetch<{ ok: boolean; division: DivisionRow }>(`/divisions/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) =>
    apiFetch<{ ok: boolean }>(`/divisions/${id}`, { method: 'DELETE' }),
  checkEligibility: (divisionId: string, playerId: string) =>
    apiFetch<EligibilityResult>(`/divisions/${divisionId}/eligibility/${playerId}`),
};

// ─── Org Branding ─────────────────────────────────────────────────────────────

export interface OrgBranding {
  orgName:                string | null;
  logoUrl:                string | null;
  brandPrimary:           string | null;
  brandSecondary:         string | null;
  orgLocation:            string | null;
  orgWebsite:             string | null;
  orgContactEmail:        string | null;
  acceptPageInstructions: string | null;
  acceptConfirmationText: string | null;
}

export const brandingApi = {
  get:           () => apiFetch<OrgBranding>('/org/branding'),
  patch:         (data: Partial<OrgBranding>) =>
    apiFetch<OrgBranding>('/org/branding', { method: 'PATCH', body: JSON.stringify(data) }),
  acceptPreview: (page: 'accept' | 'expired' | 'confirmed' = 'accept') =>
    fetch(`/api/v1/org/branding/accept-preview?page=${page}`, {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    }).then((r) => r.text()),
};
