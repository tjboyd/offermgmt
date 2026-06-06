/**
 * SportsEngine API client — READ-ONLY.
 * This class intentionally exposes only get(). There is no post(), put(),
 * patch(), or delete(). This is a structural constraint, not just policy.
 */
import { getIntegration, getCachedSEToken, cacheSEToken } from './IntegrationsService';
import type { SECredentials } from './IntegrationsService';

// SportsEngine HQ OAuth endpoints (from SE documentation, November 2025)
// All auth flows go through user.sportsengine.com.
// The data API is GraphQL — there is no REST base URL.
const SE_USER_BASE  = process.env.SE_USER_BASE_URL  ?? 'https://user.sportsengine.com';
const SE_TOKEN_URL  = process.env.SE_TOKEN_URL      ?? `${SE_USER_BASE}/oauth/token`;
const SE_ME_URL     = process.env.SE_ME_URL         ?? `${SE_USER_BASE}/oauth/me`;

// GraphQL API endpoint — SE HQ uses a single GraphQL endpoint for all data queries.
// Override via SE_GRAPHQL_URL if SE changes this or if you are on a different environment.
export const SE_GRAPHQL_URL = process.env.SE_GRAPHQL_URL ?? 'https://api.sportsengine.com/graphql';

export class SEApiError extends Error {
  constructor(
    message: string,
    public code: 'SE_CREDENTIALS_MISSING' | 'SE_AUTH_FAILED' | 'SE_RATE_LIMITED' | 'SE_API_ERROR' | 'SE_NOT_FOUND',
    public statusCode: number,
  ) {
    super(message);
    this.name = 'SEApiError';
  }
}

// ─── Token exchange ───────────────────────────────────────────────────────────

async function getToken(): Promise<string> {
  // Check cached token first
  const cached = await getCachedSEToken();
  if (cached) return cached;

  const creds = await getIntegration<SECredentials>('sportsengine');
  if (!creds?.client_id || !creds?.client_secret) {
    throw new SEApiError(
      'SportsEngine credentials not configured. Go to Settings → Integrations to add them.',
      'SE_CREDENTIALS_MISSING',
      503,
    );
  }

  // SE HQ requires JSON body with application/json (not URL-encoded form)
  const res = await fetchWithRetry(SE_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type:    'client_credentials',
      client_id:     creds.client_id,
      client_secret: creds.client_secret,
    }),
  });

  if (res.status === 401 || res.status === 400) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new SEApiError(
      `SportsEngine authentication failed (${res.status}): ${body.error ?? 'invalid credentials'}. Token URL: ${SE_TOKEN_URL}`,
      'SE_AUTH_FAILED', 502,
    );
  }
  if (!res.ok) {
    throw new SEApiError(
      `SportsEngine token endpoint returned ${res.status}. Token URL tried: ${SE_TOKEN_URL}`,
      'SE_API_ERROR', 502,
    );
  }

  const data = await res.json() as { access_token: string; expires_in: number };

  // SE returns expires_in in milliseconds (e.g. 3,600,000 = 1 hour).
  // Convert to seconds for our cache helper which expects seconds.
  const expiresInSeconds = data.expires_in > 100_000
    ? Math.floor(data.expires_in / 1000)   // ms → seconds
    : data.expires_in ?? 3600;             // already seconds (fallback)

  await cacheSEToken(data.access_token, expiresInSeconds);
  return data.access_token;
}

// ─── Retry with exponential backoff ──────────────────────────────────────────

async function fetchWithRetry(url: string, options: RequestInit, attempt = 0): Promise<Response> {
  const res = await fetch(url, options);

  if (res.status === 429 && attempt < 2) {
    const delay = Math.pow(4, attempt) * 1000; // 1s, 4s, 16s
    await sleep(delay);
    return fetchWithRetry(url, options, attempt + 1);
  }

  if (res.status >= 500 && attempt < 1) {
    await sleep(2000);
    return fetchWithRetry(url, options, attempt + 1);
  }

  return res;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// ─── SE HQ API client (GraphQL + token introspection) ────────────────────────

export interface SEApiClientType {
  /** GET request — used for token introspection (/oauth/me) */
  get<T>(url: string, params?: Record<string, string>): Promise<T>;
  /** GraphQL query against the SE HQ GraphQL API */
  graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T>;
}

class SEApiClientImpl implements SEApiClientType {
  /** Used for token introspection endpoint (full URL required). */
  async get<T>(url: string, params: Record<string, string> = {}): Promise<T> {
    const token = await getToken();
    const fullUrl = new URL(url);
    Object.entries(params).forEach(([k, v]) => fullUrl.searchParams.set(k, v));

    const res = await fetchWithRetry(fullUrl.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 404) throw new SEApiError(`SE resource not found: ${url}`, 'SE_NOT_FOUND', 404);
    if (res.status === 429) throw new SEApiError('SportsEngine rate limit exceeded.', 'SE_RATE_LIMITED', 429);
    if (!res.ok) throw new SEApiError(`SportsEngine API error: ${res.status} at ${url}`, 'SE_API_ERROR', 502);
    return res.json() as Promise<T>;
  }

  /** Send a GraphQL query to the SE HQ API. */
  async graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const token = await getToken();

    const res = await fetchWithRetry(SE_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });

    if (res.status === 429) throw new SEApiError('SportsEngine rate limit exceeded.', 'SE_RATE_LIMITED', 429);

    // Always parse the body — SE returns error details as JSON even on 4xx
    const json = await res.json().catch(() => null) as {
      data?: T;
      errors?: { message: string; locations?: unknown[]; path?: unknown[]; extensions?: unknown }[];
    } | null;

    if (!res.ok) {
      const detail = json?.errors?.map((e) => e.message).join('; ')
        ?? `HTTP ${res.status}`;
      throw new SEApiError(
        `SportsEngine GraphQL error: ${detail}`,
        'SE_API_ERROR',
        res.status,
      );
    }

    // GraphQL 200 with errors in the payload (partial data + errors)
    if (json?.errors?.length) {
      const detail = json.errors.map((e) => e.message).join('; ');
      throw new SEApiError(`GraphQL error: ${detail}`, 'SE_API_ERROR', 400);
    }

    return json?.data as T;
  }
}

// Export the me URL so the explorer can use it
export { SE_ME_URL };

export const seApiClient: SEApiClientType = new SEApiClientImpl();

// ─── Types matching assumed SE API response shape ─────────────────────────────

export interface SERegistrant {
  id:              string;
  first_name:      string;
  last_name:       string;
  date_of_birth:   string | null; // ISO date "2014-03-15"
  grade:           string | null;
  guardian_name:   string | null;
  guardian_email:  string | null;
  registered_at:   string;
}

export interface SERegistrantsResponse {
  data: SERegistrant[];
  meta: { total: number; page: number; per_page: number };
}

export interface SETokenCheckResponse {
  organization?: { name: string };
  name?: string;
}
