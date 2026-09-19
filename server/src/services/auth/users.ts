import { db } from '../../db/connection.ts';
import { HttpError } from '../../lib/validate.ts';
import { hashPassword } from './passwords.ts';

/*
 * Tai khoan dang nhap.
 *
 * Tu v37 mot tai khoan gan voi MOT dong `contacts` (`users.contact_id`). Do la
 * cau noi giua "nguoi dang nhap" va "nguoi trong so danh ba" — thu ma truoc day
 * chi ton tai duoi dang co singleton `contacts.is_me`. Nho vay nguoi phu trach
 * cong viec, actor cua nhat ky thay doi va bo loc "Viec cua toi" deu tra loi
 * duoc theo tung nguoi thay vi theo ca he thong.
 *
 * `email` la dinh danh dang nhap. `username` van con de khong khoa cua cac tai
 * khoan tao truoc v37; se bo khi moi tai khoan da co email.
 */

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  password_salt: string;
  email: string | null;
  full_name: string | null;
  contact_id: number | null;
  is_active: number;
  must_change_password: number;
  last_login_at: string | null;
}

/** Dang tra ve client — KHONG bao gio kem hash/salt. */
export interface PublicUser {
  id: number;
  username: string;
  email: string | null;
  full_name: string | null;
  contact_id: number | null;
  contact_name: string | null;
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  /** Chua dat mat khau lan nao (moi duoc moi, chua kich hoat). */
  pending_invite: boolean;
}

const PUBLIC_SELECT = `
  SELECT u.id, u.username, u.email, u.full_name, u.contact_id, u.is_active,
         u.must_change_password, u.last_login_at, c.full_name AS contact_name,
         EXISTS (
           SELECT 1 FROM password_reset_tokens t
            WHERE t.user_id = u.id AND t.kind = 'invite' AND t.used_at IS NULL
              AND t.expires_at > CAST(strftime('%s','now') AS INTEGER) * 1000
         ) AS pending_invite
    FROM users u
    LEFT JOIN contacts c ON c.id = u.contact_id`;

interface PublicRow {
  id: number;
  username: string;
  email: string | null;
  full_name: string | null;
  contact_id: number | null;
  contact_name: string | null;
  is_active: number;
  must_change_password: number;
  last_login_at: string | null;
  pending_invite: number;
}

function toPublic(row: PublicRow): PublicUser {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    full_name: row.full_name,
    contact_id: row.contact_id,
    contact_name: row.contact_name,
    is_active: Boolean(row.is_active),
    must_change_password: Boolean(row.must_change_password),
    last_login_at: row.last_login_at,
    pending_invite: Boolean(row.pending_invite),
  };
}

export function countUsers(): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
}

export function findUserByUsername(username: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;
}

export function findUserByEmail(email: string): UserRow | undefined {
  return db
    .prepare('SELECT * FROM users WHERE email IS NOT NULL AND lower(email) = lower(?)')
    .get(email.trim()) as UserRow | undefined;
}

/**
 * Tim tai khoan tu o "email" cua man dang nhap.
 *
 * Uu tien email; neu khong khop thi thu nhu mot `username`. Nhanh thu hai chi
 * de cac tai khoan tao truoc v37 (chua co email) van vao duoc, va se bo cung
 * luc voi cot `username`.
 */
export function findUserByLogin(login: string): UserRow | undefined {
  return findUserByEmail(login) ?? findUserByUsername(login.trim());
}

export function findUserById(id: number): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

export function listUsers(): PublicUser[] {
  return (db.prepare(`${PUBLIC_SELECT} ORDER BY u.is_active DESC, u.id`).all() as PublicRow[]).map(
    toPublic
  );
}

export function getPublicUser(id: number): PublicUser | undefined {
  const row = db.prepare(`${PUBLIC_SELECT} WHERE u.id = ?`).get(id) as PublicRow | undefined;
  return row ? toPublic(row) : undefined;
}

export interface CreateUserInput {
  username: string;
  email?: string | null;
  fullName?: string | null;
  contactId?: number | null;
  /** Bo trong khi moi qua email — nguoi dung tu dat o lien ket kich hoat. */
  password?: string;
}

/**
 * Tao tai khoan. Khong co mat khau thi tai khoan ton tai nhung CHUA dang nhap
 * duoc: `password_hash` rong khong khop voi bat cu mat khau nao (verifyPassword
 * doi dung 64 byte), nen duong vao duy nhat la lien ket kich hoat.
 */
export async function createUser(input: CreateUserInput): Promise<number> {
  const email = input.email?.trim() || null;
  if (email && findUserByEmail(email)) {
    throw new HttpError(409, 'Email này đã được dùng cho một tài khoản khác');
  }
  if (findUserByUsername(input.username.trim())) {
    throw new HttpError(409, 'Tên đăng nhập này đã tồn tại');
  }
  if (input.contactId != null) assertContactFree(input.contactId, null);

  const { hash, salt } = input.password
    ? await hashPassword(input.password)
    : { hash: '', salt: '' };

  const info = db
    .prepare(
      `INSERT INTO users (username, password_hash, password_salt, email, full_name, contact_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.username.trim(),
      hash,
      salt,
      email,
      input.fullName?.trim() || null,
      input.contactId ?? null
    );
  return Number(info.lastInsertRowid);
}

export interface UpdateUserInput {
  email?: string | null;
  fullName?: string | null;
  contactId?: number | null;
  isActive?: boolean;
}

export function updateUser(id: number, patch: UpdateUserInput): void {
  const current = findUserById(id);
  if (!current) throw new HttpError(404, 'Không tìm thấy tài khoản');

  if (patch.email !== undefined && patch.email) {
    const clash = findUserByEmail(patch.email);
    if (clash && clash.id !== id) {
      throw new HttpError(409, 'Email này đã được dùng cho một tài khoản khác');
    }
  }
  if (patch.contactId !== undefined && patch.contactId != null) {
    assertContactFree(patch.contactId, id);
  }

  db.prepare(
    `UPDATE users
        SET email = ?, full_name = ?, contact_id = ?, is_active = ?,
            updated_at = datetime('now','localtime')
      WHERE id = ?`
  ).run(
    patch.email === undefined ? current.email : patch.email?.trim() || null,
    patch.fullName === undefined ? current.full_name : patch.fullName?.trim() || null,
    patch.contactId === undefined ? current.contact_id : patch.contactId,
    patch.isActive === undefined ? current.is_active : patch.isActive ? 1 : 0,
    id
  );

  // Khoa tai khoan phai cat luon phien dang mo, neu khong no chi co hieu luc o
  // lan dang nhap sau — toi 30 ngay nua.
  if (patch.isActive === false) deleteUserSessions(id);
}

/**
 * Mot contact chi gan duoc voi mot tai khoan.
 *
 * Index duy nhat o CSDL da chan, nhung no nem loi SQLITE_CONSTRAINT kho hieu;
 * kiem tra o day de tra ve 409 co noi dung doc duoc.
 */
function assertContactFree(contactId: number, exceptUserId: number | null): void {
  const contact = db.prepare('SELECT id FROM contacts WHERE id = ?').get(contactId);
  if (!contact) throw new HttpError(404, 'Không tìm thấy người trong sổ danh bạ');

  const holder = db.prepare('SELECT id FROM users WHERE contact_id = ?').get(contactId) as
    { id: number } | undefined;
  if (holder && holder.id !== exceptUserId) {
    throw new HttpError(409, 'Người này đã gắn với một tài khoản khác');
  }
}

export async function setPassword(userId: number, password: string): Promise<void> {
  const { hash, salt } = await hashPassword(password);
  db.prepare(
    `UPDATE users
        SET password_hash = ?, password_salt = ?, must_change_password = 0,
            updated_at = datetime('now','localtime')
      WHERE id = ?`
  ).run(hash, salt, userId);
}

export function touchLastLogin(userId: number): void {
  db.prepare(`UPDATE users SET last_login_at = datetime('now','localtime') WHERE id = ?`).run(
    userId
  );
}

/** Dang xuat moi thiet bi cua mot nguoi. Dung khi khoa tai khoan hoac doi mat khau. */
export function deleteUserSessions(userId: number): void {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

/** Contact cua nguoi dang dang nhap — thay cho `contacts.is_me` tu v37. */
export function contactIdOfUser(userId: number): number | null {
  const row = db.prepare('SELECT contact_id FROM users WHERE id = ?').get(userId) as
    { contact_id: number | null } | undefined;
  return row?.contact_id ?? null;
}
