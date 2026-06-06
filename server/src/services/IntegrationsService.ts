import { eq } from 'drizzle-orm';
import { db, integrations, config } from '../db';
import { encrypt, decrypt } from '../utils/crypto';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SECredentials {
  client_id: string;
  client_secret: string;
  org_id?: number;           // SE integer organization ID — required for org-scoped queries
  cached_token?: string;
  cached_token_exp?: string; // ISO string
}

export interface SendGridCredentials {
  api_key:      string;
  sender_name:  string;
  sender_email: string;
  cc_email?:    string;   // copied on all outgoing emails
  test_email?:  string;   // override recipient for test sends
}

export interface ResendCredentials {
  api_key:      string;
  sender_name:  string;
  sender_email: string;
  cc_email?:    string;
  test_email?:  string;
}

export type EmailProvider = 'sendgrid' | 'resend';

type IntegrationKey = 'sportsengine' | 'sendgrid' | 'resend';

// ─── Read (decrypt) ───────────────────────────────────────────────────────────

export async function getIntegration<T>(key: IntegrationKey): Promise<T | null> {
  const [row] = await db.select().from(integrations).where(eq(integrations.key, key)).limit(1);
  if (!row) return null;
  try {
    return JSON.parse(decrypt({ encryptedValue: row.encryptedValue, iv: row.iv, authTag: row.authTag })) as T;
  } catch {
    return null;
  }
}

// ─── Write (encrypt) ──────────────────────────────────────────────────────────

export async function setIntegration<T>(key: IntegrationKey, value: T, updatedBy?: string): Promise<void> {
  const plaintext = JSON.stringify(value);
  const { encryptedValue, iv, authTag } = encrypt(plaintext);

  await db.insert(integrations)
    .values({ key, encryptedValue, iv, authTag, updatedBy: updatedBy ?? null })
    .onConflictDoUpdate({
      target: integrations.key,
      set:    { encryptedValue, iv, authTag, updatedBy: updatedBy ?? null, updatedAt: new Date() },
    });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteIntegration(key: IntegrationKey): Promise<void> {
  await db.delete(integrations).where(eq(integrations.key, key));
}

// ─── Masked status (safe to return to browser) ────────────────────────────────

export async function getActiveEmailProvider(): Promise<EmailProvider> {
  const [row] = await db.select().from(config).where(eq(config.key, 'email_provider')).limit(1);
  if (!row) return 'sendgrid';
  try { return JSON.parse(row.value) as EmailProvider; } catch { return 'sendgrid'; }
}

export async function setActiveEmailProvider(provider: EmailProvider, updatedBy?: string): Promise<void> {
  await db.insert(config)
    .values({ key: 'email_provider', value: JSON.stringify(provider), updatedBy: updatedBy ?? null })
    .onConflictDoUpdate({
      target: config.key,
      set: { value: JSON.stringify(provider), updatedBy: updatedBy ?? null, updatedAt: new Date() },
    });
}

export async function getEmailTestMode(): Promise<boolean> {
  const [row] = await db.select().from(config).where(eq(config.key, 'email_test_mode')).limit(1);
  if (!row) return false;
  try { return JSON.parse(row.value) === true; } catch { return false; }
}

export async function setEmailTestMode(enabled: boolean, updatedBy?: string): Promise<void> {
  await db.insert(config)
    .values({ key: 'email_test_mode', value: JSON.stringify(enabled), updatedBy: updatedBy ?? null })
    .onConflictDoUpdate({
      target: config.key,
      set: { value: JSON.stringify(enabled), updatedBy: updatedBy ?? null, updatedAt: new Date() },
    });
}

export async function getIntegrationStatus(): Promise<{
  sportsengine:  { configured: boolean; maskedClientId: string | null; orgId: number | null };
  sendgrid:      { configured: boolean; maskedSenderEmail: string | null; ccEmail: string | null; testEmail: string | null };
  resend:        { configured: boolean; maskedSenderEmail: string | null; ccEmail: string | null; testEmail: string | null };
  emailProvider: EmailProvider;
  testMode:      boolean;
}> {
  const [se, sg, rs, providerRow, testModeRow] = await Promise.all([
    getIntegration<SECredentials>('sportsengine'),
    getIntegration<SendGridCredentials>('sendgrid'),
    getIntegration<ResendCredentials>('resend'),
    db.select().from(config).where(eq(config.key, 'email_provider')).limit(1),
    db.select().from(config).where(eq(config.key, 'email_test_mode')).limit(1),
  ]);

  let emailProvider: EmailProvider = 'sendgrid';
  if (providerRow[0]) {
    try { emailProvider = JSON.parse(providerRow[0].value) as EmailProvider; } catch {}
  }

  let testMode = false;
  if (testModeRow[0]) {
    try { testMode = JSON.parse(testModeRow[0].value) === true; } catch {}
  }

  return {
    sportsengine: {
      configured:    !!se?.client_id,
      maskedClientId: se?.client_id ? maskString(se.client_id) : null,
      orgId:          se?.org_id ?? null,
    },
    sendgrid: {
      configured:        !!sg?.api_key,
      maskedSenderEmail: sg?.sender_email ? maskEmail(sg.sender_email) : null,
      ccEmail:           sg?.cc_email   ?? null,
      testEmail:         sg?.test_email ?? null,
    },
    resend: {
      configured:        !!rs?.api_key,
      maskedSenderEmail: rs?.sender_email ? maskEmail(rs.sender_email) : null,
      ccEmail:           rs?.cc_email   ?? null,
      testEmail:         rs?.test_email ?? null,
    },
    emailProvider,
    testMode,
  };
}

// ─── Token cache helpers ──────────────────────────────────────────────────────

export async function getCachedSEToken(): Promise<string | null> {
  const creds = await getIntegration<SECredentials>('sportsengine');
  if (!creds?.cached_token || !creds.cached_token_exp) return null;
  // Consider token expired 60 seconds before actual expiry
  const exp = new Date(creds.cached_token_exp).getTime() - 60_000;
  if (Date.now() > exp) return null;
  return creds.cached_token;
}

export async function cacheSEToken(token: string, expiresInSeconds: number): Promise<void> {
  const creds = await getIntegration<SECredentials>('sportsengine');
  if (!creds) return;
  const exp = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
  await setIntegration<SECredentials>('sportsengine', { ...creds, cached_token: token, cached_token_exp: exp });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the stored SE org ID, or null if not configured. */
export async function getSEOrgId(): Promise<number | null> {
  const creds = await getIntegration<SECredentials>('sportsengine');
  return creds?.org_id ?? null;
}

function maskString(s: string): string {
  if (s.length <= 4) return '••••';
  return '••••' + s.slice(-4);
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '••••';
  return local[0] + '•••@' + domain;
}
