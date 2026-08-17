import fs from 'node:fs';
import path from 'node:path';
import type { Database } from 'better-sqlite3';
import { decryptSecret, encryptSecret } from '../ai/secretStore.ts';
import { HttpError } from '../../lib/validate.ts';

interface TelegramSettingsRow {
  id: 1;
  enabled: number;
  chat_id: string;
  bot_token_ciphertext: string;
  bot_token_iv: string;
  bot_token_tag: string;
  notify_due_dates: number;
  notify_reminders: number;
  notify_assignee: number;
  backup_enabled: number;
  backup_interval_hours: number;
  last_backup_sent_at: string | null;
  next_backup_at: string | null;
  last_test_at: string | null;
  last_error: string | null;
  updated_at: string;
}

export interface TelegramConfig {
  enabled: boolean;
  chat_id: string;
  has_token: boolean;
  token_hint: string | null;
  notify_due_dates: boolean;
  notify_reminders: boolean;
  notify_assignee: boolean;
  backup_enabled: boolean;
  backup_interval_hours: number;
  last_backup_sent_at: string | null;
  next_backup_at: string | null;
  last_test_at: string | null;
  last_error: string | null;
}

export interface TelegramConfigUpdate {
  enabled?: boolean;
  chatId?: string;
  botToken?: string;
  clearBotToken?: boolean;
  notifyDueDates?: boolean;
  notifyReminders?: boolean;
  notifyAssignee?: boolean;
  backupEnabled?: boolean;
  backupIntervalHours?: number;
}

function row(db: Database): TelegramSettingsRow {
  return db.prepare(`SELECT * FROM telegram_settings WHERE id = 1`).get() as TelegramSettingsRow;
}

function redactToken(token: string): string | null {
  if (!token) return null;
  return `••••${token.slice(-4)}`;
}

function decryptToken(config: TelegramSettingsRow): string {
  return decryptSecret({
    ciphertext: config.bot_token_ciphertext,
    iv: config.bot_token_iv,
    tag: config.bot_token_tag,
  });
}

export function getTelegramConfig(db: Database): TelegramConfig {
  const config = row(db);
  const token = decryptToken(config);
  return {
    enabled: Boolean(config.enabled),
    chat_id: config.chat_id,
    has_token: Boolean(token),
    token_hint: redactToken(token),
    notify_due_dates: Boolean(config.notify_due_dates),
    notify_reminders: Boolean(config.notify_reminders),
    notify_assignee: Boolean(config.notify_assignee),
    backup_enabled: Boolean(config.backup_enabled),
    backup_interval_hours: config.backup_interval_hours,
    last_backup_sent_at: config.last_backup_sent_at,
    next_backup_at: config.next_backup_at,
    last_test_at: config.last_test_at,
    last_error: config.last_error,
  };
}

export function updateTelegramConfig(db: Database, update: TelegramConfigUpdate): void {
  const current = row(db);
  let encrypted = {
    ciphertext: current.bot_token_ciphertext,
    iv: current.bot_token_iv,
    tag: current.bot_token_tag,
  };
  if (update.clearBotToken) encrypted = encryptSecret('');
  else if (update.botToken?.trim()) encrypted = encryptSecret(update.botToken.trim());

  const backupEnabled =
    update.backupEnabled === undefined ? current.backup_enabled : update.backupEnabled ? 1 : 0;
  const backupIntervalHours =
    update.backupIntervalHours === undefined
      ? current.backup_interval_hours
      : update.backupIntervalHours;
  // Doi lich khi vua bat sao luu dinh ky hoac doi chu ky, de gui lan dau cach
  // thoi diem luu dung backupIntervalHours gio thay vi giu lich cu (co the da qua han).
  const resetSchedule =
    backupEnabled === 1 &&
    (current.backup_enabled === 0 ||
      backupIntervalHours !== current.backup_interval_hours ||
      !current.next_backup_at)
      ? 1
      : 0;

  db.prepare(
    `UPDATE telegram_settings
        SET enabled = ?, chat_id = ?, bot_token_ciphertext = ?, bot_token_iv = ?, bot_token_tag = ?,
            notify_due_dates = ?, notify_reminders = ?, notify_assignee = ?,
            backup_enabled = ?, backup_interval_hours = ?,
            next_backup_at = CASE WHEN ? = 1
              THEN datetime('now','localtime','+' || ? || ' hours')
              ELSE next_backup_at END,
            updated_at = datetime('now','localtime')
      WHERE id = 1`
  ).run(
    update.enabled === undefined ? current.enabled : update.enabled ? 1 : 0,
    update.chatId === undefined ? current.chat_id : update.chatId.trim(),
    encrypted.ciphertext,
    encrypted.iv,
    encrypted.tag,
    update.notifyDueDates === undefined ? current.notify_due_dates : update.notifyDueDates ? 1 : 0,
    update.notifyReminders === undefined
      ? current.notify_reminders
      : update.notifyReminders
        ? 1
        : 0,
    update.notifyAssignee === undefined ? current.notify_assignee : update.notifyAssignee ? 1 : 0,
    backupEnabled,
    backupIntervalHours,
    resetSchedule,
    backupIntervalHours
  );
}

export async function sendTelegramMessage(db: Database, text: string): Promise<void> {
  const config = row(db);
  const token = decryptToken(config);
  if (!token || !config.chat_id) {
    throw new HttpError(400, 'Chưa cấu hình Bot Token hoặc Chat ID cho Telegram');
  }

  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: config.chat_id, text }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    const timeout = error instanceof Error && error.name === 'TimeoutError';
    throw new HttpError(
      502,
      timeout ? 'Telegram phản hồi quá thời gian' : 'Không thể kết nối tới Telegram'
    );
  }

  const body = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    description?: string;
  };
  if (!response.ok || !body.ok) {
    throw new HttpError(502, body.description || `Telegram trả về lỗi ${response.status}`);
  }
}

export async function sendTelegramDocument(
  db: Database,
  filePath: string,
  caption?: string
): Promise<void> {
  const config = row(db);
  const token = decryptToken(config);
  if (!token || !config.chat_id) {
    throw new HttpError(400, 'Chưa cấu hình Bot Token hoặc Chat ID cho Telegram');
  }

  const form = new FormData();
  form.append('chat_id', config.chat_id);
  if (caption) form.append('caption', caption);
  form.append('document', new Blob([fs.readFileSync(filePath)]), path.basename(filePath));

  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: 'POST',
      body: form,
      // File sao luu co the vai chuc MB nen can nhieu thoi gian hon tin nhan van ban.
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    const timeout = error instanceof Error && error.name === 'TimeoutError';
    throw new HttpError(
      502,
      timeout ? 'Telegram phản hồi quá thời gian' : 'Không thể kết nối tới Telegram'
    );
  }

  const body = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    description?: string;
  };
  if (!response.ok || !body.ok) {
    throw new HttpError(502, body.description || `Telegram trả về lỗi ${response.status}`);
  }
}

export async function testTelegramConnection(db: Database): Promise<void> {
  try {
    await sendTelegramMessage(db, 'WorkFlow: kết nối Telegram thành công.');
    db.prepare(
      `UPDATE telegram_settings
          SET last_test_at = datetime('now','localtime'), last_error = NULL,
              updated_at = datetime('now','localtime')
        WHERE id = 1`
    ).run();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Lỗi không xác định';
    db.prepare(
      `UPDATE telegram_settings
          SET last_test_at = datetime('now','localtime'), last_error = ?,
              updated_at = datetime('now','localtime')
        WHERE id = 1`
    ).run(message.slice(0, 500));
    throw error;
  }
}
