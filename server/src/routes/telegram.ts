import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.ts';
import { parseBody } from '../lib/validate.ts';
import { sendBackupToTelegram } from '../services/telegram/telegramBackup.ts';
import {
  DIGEST_KINDS,
  digestSettingsSchema,
  getDigestSettings,
  saveDigestSettings,
  sendFocusDigest,
} from '../services/telegram/focusDigest.ts';
import { recipientContactId } from '../services/telegram/telegramNotifier.ts';
import {
  getTelegramConfig,
  setTelegramLastError,
  testTelegramConnection,
  updateTelegramConfig,
} from '../services/telegram/telegramService.ts';

const router = Router();

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  chat_id: z.string().trim().max(64).optional(),
  bot_token: z.string().trim().max(200).optional(),
  clear_bot_token: z.boolean().optional(),
  notify_due_dates: z.boolean().optional(),
  notify_reminders: z.boolean().optional(),
  notify_assignee: z.boolean().optional(),
  backup_enabled: z.boolean().optional(),
  // Toi thieu 1 gio, toi da 30 ngay.
  backup_interval_hours: z.number().int().min(1).max(720).optional(),
});

router.get('/config', (_req, res) => {
  res.json(getTelegramConfig(db));
});

router.put('/config', (req, res) => {
  const body = parseBody(updateSchema, req);
  updateTelegramConfig(db, {
    enabled: body.enabled,
    chatId: body.chat_id,
    botToken: body.bot_token,
    clearBotToken: body.clear_bot_token,
    notifyDueDates: body.notify_due_dates,
    notifyReminders: body.notify_reminders,
    notifyAssignee: body.notify_assignee,
    backupEnabled: body.backup_enabled,
    backupIntervalHours: body.backup_interval_hours,
  });
  res.json(getTelegramConfig(db));
});

router.post('/test', async (_req, res, next) => {
  try {
    await testTelegramConnection(db);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post('/send-backup', async (_req, res, next) => {
  try {
    const result = await sendBackupToTelegram(db);
    // Cung dong bo last_error voi 2 luong con lai (kiem tra ket noi, sao luu dinh
    // ky) — banner canh bao tren trang Cai dat chi doc mot cot nay.
    setTelegramLastError(db, null);
    res.json({ ok: true, ...result });
  } catch (error) {
    setTelegramLastError(db, error instanceof Error ? error.message : 'Loi khong xac dinh');
    next(error);
  }
});

/* ---------- Ban tin Trong tam (ngay / tuan / thang) ---------- */

router.get('/focus-digest', (_req, res) => {
  res.json(getDigestSettings(db));
});

router.put('/focus-digest', (req, res) => {
  res.json(saveDigestSettings(db, parseBody(digestSettingsSchema.partial(), req)));
});

/** Gui ngay mot ban tin de xem truoc — khong ghi dau "da gui" cua bo hen gio. */
router.post('/focus-digest/test', async (req, res, next) => {
  try {
    const body = parseBody(z.object({ kind: z.enum(DIGEST_KINDS).default('daily') }), req);
    const text = await sendFocusDigest(db, body.kind, recipientContactId(db), {
      ai: getDigestSettings(db).ai,
    });
    res.json({ ok: true, text });
  } catch (error) {
    next(error);
  }
});

export default router;
