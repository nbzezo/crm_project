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
 *
 * `user_id` (v37) duoc rut ra khoi blob JSON de "khoa tai khoan" cat duoc phien
 * dang mo — khong co cot nay thi phai quet va parse toan bo bang moi biet phien
 * nao cua ai.
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

/**
 * Phien "rolling" 30 ngay: express-session goi `touch()` o MOI request de day han.
 * Ghi xuong SQLite moi lan la mot UPDATE + WAL cho tung request cua tung nguoi —
 * day han som hon vai phut so voi 30 ngay khong doi gi, nen chi ghi khi lan truoc da
 * cach it nhat TOUCH_INTERVAL_MS (1.37.1). Cookie phia trinh duyet van duoc gia han.
 */
const TOUCH_INTERVAL_MS = 10 * 60_000;
/** Don phien het han toi da moi khoang nay, thay vi truoc MOI lan ghi phien. */
const PURGE_INTERVAL_MS = 10 * 60_000;

export class SqliteSessionStore extends Store {
  private readonly lastTouch = new Map<string, number>();
  private lastPurge = 0;

  private readonly getStmt = db.prepare<[string], { data: string; expires_at: number }>(
    'SELECT data, expires_at FROM sessions WHERE id = ?'
  );
  private readonly upsertStmt = db.prepare<[string, string, number, number | null]>(
    `INSERT INTO sessions (id, data, expires_at, user_id) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at,
                                     user_id = excluded.user_id`
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
      const now = Date.now();
      if (now - this.lastPurge >= PURGE_INTERVAL_MS) {
        this.purgeStmt.run(now);
        this.lastPurge = now;
      }
      this.lastTouch.set(hashSid(sid), now);
      this.upsertStmt.run(
        hashSid(sid),
        JSON.stringify(session),
        expiryMs(session),
        session.userId ?? null
      );
      done();
    } catch (err) {
      done(err);
    }
  }

  touch(sid: string, session: SessionData, done: DoneErr): void {
    try {
      const key = hashSid(sid);
      const now = Date.now();
      if (now - (this.lastTouch.get(key) ?? 0) >= TOUCH_INTERVAL_MS) {
        this.touchStmt.run(expiryMs(session), key);
        /* Map chi giu phien dang hoat dong; qua lon thi xoa het (lan touch sau ghi lai). */
        if (this.lastTouch.size > 50_000) this.lastTouch.clear();
        this.lastTouch.set(key, now);
      }
      done();
    } catch (err) {
      done(err);
    }
  }

  destroy(sid: string, done: DoneErr): void {
    try {
      this.deleteStmt.run(hashSid(sid));
      this.lastTouch.delete(hashSid(sid));
      done();
    } catch (err) {
      done(err);
    }
  }
}
