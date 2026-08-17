import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.ts';
import { parseBody } from '../lib/validate.ts';
import { sendBackupToTelegram } from '../services/telegram/telegramBackup.ts';
import {
  getTelegramConfig,
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
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

export default router;
