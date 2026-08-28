import crypto from 'node:crypto';

/*
 * Bam mat khau bang scrypt cua node:crypto — khong them bcrypt/argon2 de tranh
 * mot native module thu hai ben canh better-sqlite3. Tham so N=16384,r=8,p=1 la
 * muc OWASP khuyen nghi cho scrypt; du cho mot tai khoan admin duy nhat dang sau
 * gioi han so lan thu dang nhap.
 *
 * Luu "<salt-base64>:<hash-base64>" trong mot cot TEXT. So sanh bang
 * timingSafeEqual de khong ro ri do dai khop qua thoi gian phan hoi.
 */

const KEYLEN = 64;
const SCRYPT_OPTS: crypto.ScryptOptions = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEYLEN, SCRYPT_OPTS, (err, derived) => {
      if (err) reject(err);
      else resolve(derived);
    });
  });
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt);
  return { hash: derived.toString('base64'), salt: salt.toString('base64') };
}

export async function verifyPassword(
  password: string,
  storedHash: string,
  storedSalt: string
): Promise<boolean> {
  let expected: Buffer;
  try {
    expected = Buffer.from(storedHash, 'base64');
  } catch {
    return false;
  }
  if (expected.length !== KEYLEN) return false;
  const derived = await scrypt(password, Buffer.from(storedSalt, 'base64'));
  return crypto.timingSafeEqual(derived, expected);
}
