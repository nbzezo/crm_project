import crypto from 'node:crypto';
import { db } from '../../db/connection.ts';

/*
 * Lien ket dung mot lan cho thu moi tai khoan va cho "quen mat khau".
 *
 * CSDL chi giu sha256(token). Token goc ton tai dung mot lan, trong noi dung thu
 * — cung ly do `sessions.id` duoc bam tu v35: mot ban sao luu bi lo khong duoc
 * phep bien thanh quyen chiem tai khoan. He qua co y: khong the "xem lai" lien
 * ket da gui, chi co the gui lai cai moi.
 *
 * Moi lan cap token moi cho mot nguoi se VO HIEU cac token cu chua dung cua
 * chinh nguoi do. Neu khong, bam "gui lai" ba lan se de lai ba lien ket con
 * song song — moi cai la mot duong vao tai khoan van con hieu luc.
 */

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

export type TokenKind = 'invite' | 'reset';

export interface IssuedToken {
  /** Token goc — chi dat vao lien ket trong thu, khong bao gio ghi xuong dia. */
  token: string;
  expiresAt: number;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function issueToken(userId: number, kind: TokenKind): IssuedToken {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + (kind === 'invite' ? INVITE_TTL_MS : RESET_TTL_MS);

  db.transaction(() => {
    db.prepare(
      `UPDATE password_reset_tokens
          SET used_at = datetime('now','localtime')
        WHERE user_id = ? AND used_at IS NULL`
    ).run(userId);
    db.prepare(
      `INSERT INTO password_reset_tokens (user_id, token_hash, kind, expires_at)
       VALUES (?, ?, ?, ?)`
    ).run(userId, hashToken(token), kind, expiresAt);
  })();

  return { token, expiresAt };
}

export interface ResolvedToken {
  userId: number;
  kind: TokenKind;
}

/**
 * Doc token con hieu luc. Tra ve `null` cho MOI ly do that bai (khong ton tai,
 * het han, da dung, tai khoan bi khoa) — phan biet chung o phan hoi chi giup
 * nguoi do doan duoc email nao co that.
 */
export function resolveToken(token: string): ResolvedToken | null {
  const rowData = db
    .prepare(
      `SELECT t.user_id, t.kind, t.expires_at, t.used_at, u.is_active
         FROM password_reset_tokens t
         JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = ?`
    )
    .get(hashToken(token)) as
    | { user_id: number; kind: TokenKind; expires_at: number; used_at: string | null; is_active: number }
    | undefined;

  if (!rowData) return null;
  if (rowData.used_at) return null;
  if (rowData.expires_at < Date.now()) return null;
  if (!rowData.is_active) return null;
  return { userId: rowData.user_id, kind: rowData.kind };
}

export function consumeToken(token: string): void {
  db.prepare(
    `UPDATE password_reset_tokens
        SET used_at = datetime('now','localtime')
      WHERE token_hash = ? AND used_at IS NULL`
  ).run(hashToken(token));
}

/** Don token het han. Goi theo kieu goi luoi giong SqliteSessionStore.set(). */
export function purgeExpiredTokens(): void {
  db.prepare(`DELETE FROM password_reset_tokens WHERE expires_at < ?`).run(Date.now());
}
