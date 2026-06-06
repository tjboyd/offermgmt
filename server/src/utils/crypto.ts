import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_HEX = process.env.INTEGRATION_ENCRYPTION_KEY ?? '';

function getKey(): Buffer {
  if (!KEY_HEX || KEY_HEX.length < 64) {
    throw new Error('INTEGRATION_ENCRYPTION_KEY must be a 32-byte (64 hex char) value');
  }
  return Buffer.from(KEY_HEX, 'hex');
}

export interface EncryptedPayload {
  encryptedValue: string;
  iv: string;
  authTag: string;
}

export function encrypt(plaintext: string): EncryptedPayload {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    encryptedValue: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

export function decrypt({ encryptedValue, iv, authTag }: EncryptedPayload): string {
  const key = getKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
