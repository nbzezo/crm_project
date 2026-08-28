import { db } from '../../db/connection.ts';
import { hashPassword } from './passwords.ts';

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  password_salt: string;
}

export function countUsers(): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
}

export function findUserByUsername(username: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;
}

export function findUserById(id: number): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

export async function createUser(username: string, password: string): Promise<number> {
  const { hash, salt } = await hashPassword(password);
  const info = db
    .prepare('INSERT INTO users (username, password_hash, password_salt) VALUES (?, ?, ?)')
    .run(username, hash, salt);
  return Number(info.lastInsertRowid);
}

export async function setPassword(userId: number, password: string): Promise<void> {
  const { hash, salt } = await hashPassword(password);
  db.prepare(
    `UPDATE users SET password_hash = ?, password_salt = ?, updated_at = datetime('now','localtime')
      WHERE id = ?`
  ).run(hash, salt, userId);
}
