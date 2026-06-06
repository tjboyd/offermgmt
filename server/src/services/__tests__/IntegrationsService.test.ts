/**
 * IntegrationsService unit tests
 * Verifies encrypt-on-write, never-return-raw, masked status shape.
 */

process.env.INTEGRATION_ENCRYPTION_KEY = 'd'.repeat(64);

import { encrypt, decrypt } from '../../utils/crypto';
import { getIntegrationStatus } from '../IntegrationsService';

// Mock DB
jest.mock('../../db', () => ({
  db: {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(() => Promise.resolve([])),
        })),
      })),
    })),
    insert: jest.fn(() => ({
      values: jest.fn(() => ({
        onConflictDoUpdate: jest.fn(() => Promise.resolve()),
      })),
    })),
    delete: jest.fn(() => ({
      where: jest.fn(() => Promise.resolve()),
    })),
  },
  integrations: {},
}));

describe('encrypt / decrypt round-trip (used by IntegrationsService)', () => {
  it('encrypts SE credentials and decrypts to original', () => {
    const creds = { client_id: 'test-id', client_secret: 'test-secret' };
    const payload = encrypt(JSON.stringify(creds));
    const result = JSON.parse(decrypt(payload));
    expect(result.client_id).toBe('test-id');
    expect(result.client_secret).toBe('test-secret');
  });

  it('encrypted value does not contain the secret in plaintext', () => {
    const payload = encrypt(JSON.stringify({ api_key: 'SG.super-secret' }));
    expect(payload.encryptedValue).not.toContain('SG.super-secret');
  });
});

describe('getIntegrationStatus', () => {
  it('returns configured: false when no credentials stored', async () => {
    const status = await getIntegrationStatus();
    expect(status.sportsengine.configured).toBe(false);
    expect(status.sportsengine.maskedClientId).toBeNull();
    expect(status.sendgrid.configured).toBe(false);
  });
});

describe('SEApiClient — structural read-only enforcement', () => {
  it('SEApiClient only exposes get() method', async () => {
    const { seApiClient } = await import('../SEApiClient');
    expect(typeof seApiClient.get).toBe('function');
    expect((seApiClient as unknown as Record<string, unknown>)['post']).toBeUndefined();
    expect((seApiClient as unknown as Record<string, unknown>)['put']).toBeUndefined();
    expect((seApiClient as unknown as Record<string, unknown>)['patch']).toBeUndefined();
    expect((seApiClient as unknown as Record<string, unknown>)['delete']).toBeUndefined();
  });
});
