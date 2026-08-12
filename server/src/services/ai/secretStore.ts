import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { RUNTIME_DATA_DIR } from '../../db/connection.ts';

const INSTALLATION_KEY_FILE = path.join(RUNTIME_DATA_DIR, '.ai-master.key');

function decodeConfiguredKey(value: string): Buffer {
  const trimmed = value.trim();
  if (/^[0-9a-f]{64}$/i.test(trimmed)) return Buffer.from(trimmed, 'hex');
  try {
    const decoded = Buffer.from(trimmed, 'base64');
    if (decoded.length === 32) return decoded;
  } catch {
    // Chuoi thuong se duoc bam o nhanh cuoi.
  }
  return crypto.createHash('sha256').update(trimmed).digest();
}

function installationKey(): Buffer {
  const configured = process.env.WORKFLOW_AI_MASTER_KEY;
  if (configured) return decodeConfiguredKey(configured);

  fs.mkdirSync(RUNTIME_DATA_DIR, { recursive: true });
  if (!fs.existsSync(INSTALLATION_KEY_FILE)) {
    fs.writeFileSync(INSTALLATION_KEY_FILE, crypto.randomBytes(32), { mode: 0o600, flag: 'wx' });
  }
  const key = fs.readFileSync(INSTALLATION_KEY_FILE);
  if (key.length !== 32) throw new Error('Khoa ma hoa AI cua he thong khong hop le');
  return key;
}

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  tag: string;
}

export function encryptSecret(value: string): EncryptedSecret {
  if (!value) return { ciphertext: '', iv: '', tag: '' };
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', installationKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}

export function decryptSecret(secret: EncryptedSecret): string {
  if (!secret.ciphertext) return '';
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    installationKey(),
    Buffer.from(secret.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(secret.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(secret.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
