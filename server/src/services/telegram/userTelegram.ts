import crypto from 'node:crypto';
import type { Database } from 'better-sqlite3';
import { HttpError } from '../../lib/validate.ts';
import { getBotToken, getTelegramConfig, sendTelegramTo } from './telegramService.ts';

/*
 * Telegram rieng cua tung tai khoan (v70).
 *
 * Bot va Bot Token van la MOT, do quan tri cau hinh o Cai dat -> Telegram. Moi
 * nguoi tu noi tai khoan Telegram cua minh voi bot: bam lien ket
 * t.me/<bot>?start=<ma> -> Telegram mo bot va gui "/start <ma>" -> may chu doc
 * lenh qua getUpdates va gan chat cua ho vao tai khoan. Khong can dia chi cong
 * khai cho webhook — chay duoc ca khi WorkFlow nam sau NAT.
 *
 * Ma dung mot lan, het han sau 15 phut, va chi lam MOT viec: gan chat gui lenh
 * vao tai khoan da tao ma. Ai do doc trom ma chi co the noi Telegram CUA HO vao
 * tai khoan nay (nhan thong bao cua nguoi khac) — vi vay ma ngan han, chi hien
 * cho chinh chu tai khoan, va tai khoan thay ngay ten Telegram da noi de go ra.
 */

export type PersonalKind = 'tasks' | 'reminders' | 'assignee' | 'feed';

export interface UserTelegramRow {
  user_id: number;
  chat_id: string | null;
  tg_name: string | null;
  linked_at: string | null;
  link_code: string | null;
  link_code_expires_at: string | null;
  enabled: number;
  notify_tasks: number;
  notify_reminders: number;
  notify_assignee: number;
  notify_feed: number;
}

const CODE_MINUTES = 15;

export function userTelegramRow(db: Database, userId: number): UserTelegramRow | undefined {
  return db.prepare(`SELECT * FROM user_telegram WHERE user_id = ?`).get(userId) as
    UserTelegramRow | undefined;
}

let botNameCache: { token: string; username: string } | null = null;

/** Ten bot (getMe) — cache theo token, doi token thi hoi lai. */
export async function botUsername(db: Database): Promise<string | null> {
  const token = getBotToken(db);
  if (!token) return null;
  if (botNameCache?.token === token) return botNameCache.username;
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await response.json()) as { ok?: boolean; result?: { username?: string } };
    if (!body.ok || !body.result?.username) return null;
    botNameCache = { token, username: body.result.username };
    return body.result.username;
  } catch {
    return null;
  }
}

export function createLinkCode(db: Database, userId: number): string {
  const code = crypto.randomBytes(9).toString('base64url');
  db.prepare(
    `INSERT INTO user_telegram (user_id, link_code, link_code_expires_at)
     VALUES (?, ?, datetime('now','localtime','+${CODE_MINUTES} minutes'))
     ON CONFLICT(user_id) DO UPDATE SET
       link_code = excluded.link_code,
       link_code_expires_at = excluded.link_code_expires_at,
       updated_at = datetime('now','localtime')`
  ).run(userId, code);
  return code;
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    text?: string;
    chat?: { id: number; type?: string };
    from?: { username?: string; first_name?: string; last_name?: string };
  };
}

/**
 * Gan chat cho ma lien ket. Tach rieng khoi viec goi Telegram de test duoc ma
 * khong can mang. Tra ve user_id da gan, hoac null neu ma sai / het han.
 */
export function applyStartCommand(
  db: Database,
  text: string,
  chatId: string,
  displayName: string
): number | null {
  const match = /^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{6,40})\s*$/.exec(text.trim());
  if (!match) return null;
  const row = db
    .prepare(
      `SELECT user_id FROM user_telegram
        WHERE link_code = ? AND link_code_expires_at >= datetime('now','localtime')`
    )
    .get(match[1]) as { user_id: number } | undefined;
  if (!row) return null;
  db.prepare(
    `UPDATE user_telegram
        SET chat_id = ?, tg_name = ?, linked_at = datetime('now','localtime'), enabled = 1,
            link_code = NULL, link_code_expires_at = NULL, updated_at = datetime('now','localtime')
      WHERE user_id = ?`
  ).run(chatId, displayName.slice(0, 120), row.user_id);
  return row.user_id;
}

let polling: Promise<void> | null = null;
let lastPoll = 0;

/**
 * Doc lenh moi gui toi bot (getUpdates) va xu ly "/start <ma>". Chi chay khi co
 * ma lien ket dang cho — bot khong co viec gi khac can nghe. Goi dong thoi nhieu
 * lan thi dung chung mot lan doc.
 */
export function pollLinkUpdates(db: Database, force = false): Promise<void> {
  if (polling) return polling;
  if (!force && Date.now() - lastPoll < 2_000) return Promise.resolve();
  const pending = db
    .prepare(
      `SELECT 1 FROM user_telegram WHERE link_code IS NOT NULL
          AND link_code_expires_at >= datetime('now','localtime') LIMIT 1`
    )
    .get();
  const token = getBotToken(db);
  if (!pending || !token) return Promise.resolve();
  lastPoll = Date.now();
  polling = (async () => {
    try {
      const offset = (
        db.prepare(`SELECT updates_offset FROM telegram_settings WHERE id = 1`).get() as {
          updates_offset: number;
        }
      ).updates_offset;
      const response = await fetch(
        `https://api.telegram.org/bot${token}/getUpdates?timeout=0&offset=${offset + 1}&allowed_updates=${encodeURIComponent('["message"]')}`,
        { signal: AbortSignal.timeout(10_000) }
      );
      const body = (await response.json()) as {
        ok?: boolean;
        result?: TelegramUpdate[];
        description?: string;
      };
      if (!body.ok) {
        console.warn('[telegram] getUpdates loi:', body.description);
        return;
      }
      let maxId = offset;
      for (const update of body.result ?? []) {
        maxId = Math.max(maxId, update.update_id);
        const message = update.message;
        if (!message?.text || !message.chat) continue;
        const name =
          (message.from?.username ? `@${message.from.username}` : '') ||
          [message.from?.first_name, message.from?.last_name].filter(Boolean).join(' ') ||
          'Telegram';
        const userId = applyStartCommand(db, message.text, String(message.chat.id), name);
        if (userId != null) {
          const user = db
            .prepare(`SELECT COALESCE(full_name, username) AS name FROM users WHERE id = ?`)
            .get(userId) as { name: string };
          await sendTelegramTo(
            db,
            String(message.chat.id),
            `✅ Đã kết nối Telegram với tài khoản WorkFlow của ${user.name}. Bạn sẽ nhận thông báo của chính mình tại đây.`
          ).catch(() => undefined);
        }
      }
      db.prepare(`UPDATE telegram_settings SET updates_offset = ? WHERE id = 1`).run(maxId);
    } catch (error) {
      console.warn('[telegram] Khong doc duoc lenh /start:', error);
    } finally {
      polling = null;
    }
  })();
  return polling;
}

export interface PersonalTarget {
  user_id: number;
  contact_id: number;
  chat_id: string;
}

/** Bot cong ty dang chay (bat + co token) — dieu kien chung cho moi tin rieng. */
export function botActive(db: Database): boolean {
  const config = getTelegramConfig(db);
  return config.enabled && config.has_token;
}

/** Nhung nguoi da noi Telegram, dang bat, va muon nhan loai thong bao nay. */
export function personalTargets(db: Database, kind: PersonalKind): PersonalTarget[] {
  if (!botActive(db)) return [];
  return db
    .prepare(
      `SELECT t.user_id, u.contact_id, t.chat_id FROM user_telegram t
         JOIN users u ON u.id = t.user_id AND u.is_active = 1 AND u.contact_id IS NOT NULL
        WHERE t.chat_id IS NOT NULL AND t.enabled = 1 AND t.notify_${kind} = 1`
    )
    .all() as PersonalTarget[];
}

export function personalTargetFor(
  db: Database,
  contactId: number,
  kind: PersonalKind
): PersonalTarget | null {
  return personalTargets(db, kind).find((target) => target.contact_id === contactId) ?? null;
}

/** Contact nay da noi Telegram rieng (bat hay tat) — khi do kenh chung khong gui trung cho ho. */
export function hasPersonalLink(db: Database, contactId: number | null): boolean {
  if (contactId == null) return false;
  return Boolean(
    db
      .prepare(
        `SELECT 1 FROM user_telegram t JOIN users u ON u.id = t.user_id
          WHERE u.contact_id = ? AND t.chat_id IS NOT NULL`
      )
      .get(contactId)
  );
}

export function alreadySent(db: Database, key: string): boolean {
  return Boolean(db.prepare(`SELECT 1 FROM telegram_sent_log WHERE dedupe_key = ?`).get(key));
}

export function markSent(db: Database, key: string): void {
  db.prepare(`INSERT OR IGNORE INTO telegram_sent_log (dedupe_key) VALUES (?)`).run(key);
}

/** Gui mot tin rieng, chong trung theo khoa. Loi chi ghi log. */
export async function sendPersonal(
  db: Database,
  target: PersonalTarget,
  key: string,
  text: string
): Promise<void> {
  const fullKey = `u${target.user_id}:${key}`;
  if (alreadySent(db, fullKey)) return;
  try {
    await sendTelegramTo(db, target.chat_id, text);
    markSent(db, fullKey);
  } catch (error) {
    console.error('[telegram] Gui tin rieng that bai:', target.user_id, key, error);
  }
}

export function assertBotReady(db: Database): void {
  if (!botActive(db)) {
    throw new HttpError(
      409,
      'Bot Telegram của công ty chưa được bật. Nhờ quản trị cấu hình ở Cài đặt → Telegram trước.'
    );
  }
}

let poller: ReturnType<typeof setInterval> | null = null;

/** Nghe lenh /start dinh ky (chi khi co ma dang cho) — nguoi dung khong phai bam "Kiem tra". */
export function startUserTelegramPoller(db: Database) {
  if (poller) return poller;
  poller = setInterval(() => void pollLinkUpdates(db), 15_000);
  poller.unref();
  return poller;
}
