import { Router, type Request } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.ts';
import { HttpError, parseBody } from '../lib/validate.ts';
import { accessOf } from '../middleware/currentUser.ts';
import { sendTelegramTo } from '../services/telegram/telegramService.ts';
import {
  assertBotReady,
  botActive,
  botUsername,
  createLinkCode,
  pollLinkUpdates,
  userTelegramRow,
} from '../services/telegram/userTelegram.ts';

/*
 * "Telegram cua toi" (v70): moi tai khoan tu noi Telegram rieng va chon thong bao
 * muon nhan. Ai dang nhap cung dung duoc; chi dung toi dong cua CHINH MINH.
 */

const router = Router();

function userIdOf(req: Request): number {
  const userId = accessOf(req).userId;
  if (!userId) throw new HttpError(403, 'Cần đăng nhập bằng tài khoản người dùng');
  return userId;
}

async function status(req: Request, poll = true) {
  const userId = userIdOf(req);
  let row = userTelegramRow(db, userId);
  /* Dang cho nguoi dung bam Start trong Telegram: doc lenh moi ngay luc hoi. */
  if (poll && row?.link_code) {
    await pollLinkUpdates(db);
    row = userTelegramRow(db, userId);
  }
  const ready = botActive(db);
  const pending =
    row?.link_code && row.link_code_expires_at
      ? (
          db
            .prepare(`SELECT ? >= datetime('now','localtime') AS live`)
            .get(row.link_code_expires_at) as { live: number }
        ).live === 1
      : false;
  const username = ready ? await botUsername(db) : null;
  return {
    bot_ready: ready,
    bot_username: username,
    has_contact: accessOf(req).contactId != null,
    linked: Boolean(row?.chat_id),
    tg_name: row?.tg_name ?? null,
    linked_at: row?.linked_at ?? null,
    enabled: row ? Boolean(row.enabled) : true,
    notify_tasks: row ? Boolean(row.notify_tasks) : true,
    notify_reminders: row ? Boolean(row.notify_reminders) : true,
    notify_assignee: row ? Boolean(row.notify_assignee) : true,
    notify_feed: row ? Boolean(row.notify_feed) : true,
    pending_link:
      pending && username && row?.link_code
        ? {
            url: `https://t.me/${username}?start=${row.link_code}`,
            expires_at: row.link_code_expires_at,
          }
        : null,
  };
}

router.get('/', async (req, res, next) => {
  try {
    res.json(await status(req));
  } catch (error) {
    next(error);
  }
});

/** Tao ma va lien ket t.me/<bot>?start=<ma>. */
router.post('/link', async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    assertBotReady(db);
    const username = await botUsername(db);
    if (!username) {
      throw new HttpError(
        502,
        'Không đọc được tên bot từ Telegram — kiểm tra Bot Token với quản trị'
      );
    }
    createLinkCode(db, userId);
    /* Chua doc lenh ngay: nguoi dung con chua kip bam Start. */
    res.json(await status(req, false));
  } catch (error) {
    next(error);
  }
});

router.put('/', async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const body = parseBody(
      z.object({
        enabled: z.boolean().optional(),
        notify_tasks: z.boolean().optional(),
        notify_reminders: z.boolean().optional(),
        notify_assignee: z.boolean().optional(),
        notify_feed: z.boolean().optional(),
      }),
      req
    );
    db.prepare(`INSERT OR IGNORE INTO user_telegram (user_id) VALUES (?)`).run(userId);
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [key, value] of Object.entries(body)) {
      if (value === undefined) continue;
      sets.push(`${key} = ?`);
      params.push(value ? 1 : 0);
    }
    if (sets.length) {
      db.prepare(
        `UPDATE user_telegram SET ${sets.join(', ')}, updated_at = datetime('now','localtime') WHERE user_id = ?`
      ).run(...params, userId);
    }
    res.json(await status(req));
  } catch (error) {
    next(error);
  }
});

/** Nhap Chat ID thu cong (vd. nhom Telegram rieng) — gui thu truoc, dung moi luu. */
router.post('/manual', async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    assertBotReady(db);
    const body = parseBody(
      z.object({
        chat_id: z
          .string()
          .trim()
          .regex(/^-?\d{3,20}$/, 'Chat ID chỉ gồm số'),
      }),
      req
    );
    await sendTelegramTo(db, body.chat_id, '✅ WorkFlow: kết nối Telegram cá nhân thành công.');
    db.prepare(
      `INSERT INTO user_telegram (user_id, chat_id, tg_name, linked_at)
       VALUES (?, ?, 'Chat ID ' || ?, datetime('now','localtime'))
       ON CONFLICT(user_id) DO UPDATE SET chat_id = excluded.chat_id, tg_name = excluded.tg_name,
         linked_at = excluded.linked_at, link_code = NULL, link_code_expires_at = NULL, enabled = 1,
         updated_at = datetime('now','localtime')`
    ).run(userId, body.chat_id, body.chat_id);
    res.json(await status(req));
  } catch (error) {
    next(error);
  }
});

router.post('/test', async (req, res, next) => {
  try {
    const row = userTelegramRow(db, userIdOf(req));
    if (!row?.chat_id) throw new HttpError(409, 'Bạn chưa kết nối Telegram');
    await sendTelegramTo(
      db,
      row.chat_id,
      '🔔 WorkFlow: đây là tin nhắn thử. Thông báo của bạn sẽ đến đây.'
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.delete('/', async (req, res, next) => {
  try {
    db.prepare(
      `UPDATE user_telegram SET chat_id = NULL, tg_name = NULL, linked_at = NULL, link_code = NULL,
              link_code_expires_at = NULL, updated_at = datetime('now','localtime') WHERE user_id = ?`
    ).run(userIdOf(req));
    res.json(await status(req));
  } catch (error) {
    next(error);
  }
});

export default router;
