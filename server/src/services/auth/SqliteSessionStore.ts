import crypto from 'node:crypto';
import { Store, type SessionData } from 'express-session';
import { db } from '../../db/connection.ts';

/*
 * Store cho express-session dua thang tren `db` (better-sqlite3) san co — khong
 * keo connect-sqlite3 vi no dung driver `sqlite3` khac, thanh hai driver SQLite
 * trong mot ung dung.
 *
 * `id` cua bang sessions la sha256(session id): neu ban xuat / ro ri CSDL thi
 * ke tan cong van khong dung lai duoc cookie. better-sqlite3 chay dong bo nen
 * moi callback duoc goi ngay trong tick hien tai.
 */

type DoneErr = (err?: unknown) => void;
type DoneGet = (err: unknown, session?: SessionData | null) => void;

const hashSid = (sid: string): string => crypto.createHash('sha256').update(sid).digest('hex');

function expiryMs(session: SessionData): number {
  const expires = session.cookie?.expires;
  if (expires) return new Date(expires).getTime();
  const maxAge = session.cookie?.originalMaxAge;
  return Date.now() + (typeof maxAge === 'number' ? maxAge : 24 * 60 * 60 * 1000);
}

export class SqliteSessionStore extends Store {
  private readonly getStmt = db.prepare<[string], { data: string; expires_at: number }>(
    'SELECT data, expires_at FROM sessions WHERE id = ?'
  );
  private readonly upsertStmt = db.prepare<[string, string, number]>(
    `INSERT INTO sessions (id, data, expires_at) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at`
  );
  private readonly touchStmt = db.prepare<[number, string]>(
    'UPDATE sessions SET expires_at = ? WHERE id = ?'
  );
  private readonly deleteStmt = db.prepare<[string]>('DELETE FROM sessions WHERE id = ?');
  private readonly purgeStmt = db.prepare<[number]>('DELETE FROM sessions WHERE expires_at < ?');

  get(sid: string, done: DoneGet): void {
    try {
      const row = this.getStmt.get(hashSid(sid));
      if (!row) return done(null, null);
      if (row.expires_at < Date.now()) {
        this.deleteStmt.run(hashSid(sid));
        return done(null, null);
      }
      done(null, JSON.parse(row.data) as SessionData);
    } catch (err) {
      done(err);
    }
  }

  set(sid: string, session: SessionData, done: DoneErr): void {
    try {
      this.purgeStmt.run(Date.now());
      this.upsertStmt.run(hashSid(sid), JSON.stringify(session), expiryMs(session));
      done();
    } catch (err) {
      done(err);
    }
  }

  touch(sid: string, session: SessionData, done: DoneErr): void {
    try {
      this.touchStmt.run(expiryMs(session), hashSid(sid));
      done();
    } catch (err) {
      done(err);
    }
  }

  destroy(sid: string, done: DoneErr): void {
    try {
      this.deleteStmt.run(hashSid(sid));
      done();
    } catch (err) {
      done(err);
    }
  }
}
