import type { Database } from 'better-sqlite3';
import { createBackupFile } from '../../lib/backup.ts';
import { HttpError } from '../../lib/validate.ts';
import { getTelegramConfig, sendTelegramDocument } from './telegramService.ts';

export async function sendBackupToTelegram(db: Database): Promise<{ name: string; size: number }> {
  const config = getTelegramConfig(db);
  if (!config.has_token || !config.chat_id) {
    throw new HttpError(400, 'Chưa cấu hình Bot Token hoặc Chat ID cho Telegram');
  }
  const file = await createBackupFile(db);
  await sendTelegramDocument(db, file.path, `📦 Bản sao lưu CSDL WorkFlow — ${file.name}`);
  db.prepare(
    `UPDATE telegram_settings
        SET last_backup_sent_at = datetime('now','localtime'), updated_at = datetime('now','localtime')
      WHERE id = 1`
  ).run();
  return { name: file.name, size: file.size };
}

/** Kiem tra va gui sao luu dinh ky neu da den han; luon doi lich ke ca khi loi
 *  (giong runDueAutomations) de tranh vong lap thu lai lien tuc khi loi dai han. */
export async function runDueBackupCheck(db: Database): Promise<void> {
  const config = getTelegramConfig(db);
  if (!config.enabled || !config.has_token || !config.chat_id || !config.backup_enabled) return;

  const due = db
    .prepare(
      `SELECT 1 FROM telegram_settings
        WHERE id = 1 AND (next_backup_at IS NULL OR next_backup_at <= datetime('now','localtime'))`
    )
    .get();
  if (!due) return;

  try {
    await sendBackupToTelegram(db);
    db.prepare(
      `UPDATE telegram_settings SET last_error = NULL, updated_at = datetime('now','localtime') WHERE id = 1`
    ).run();
  } catch (error) {
    console.error('[telegram] Gui sao luu dinh ky that bai:', error);
    const message = error instanceof Error ? error.message : 'Loi khong xac dinh';
    db.prepare(
      `UPDATE telegram_settings SET last_error = ?, updated_at = datetime('now','localtime') WHERE id = 1`
    ).run(message.slice(0, 500));
  } finally {
    db.prepare(
      `UPDATE telegram_settings
          SET next_backup_at = datetime('now','localtime', '+' || backup_interval_hours || ' hours')
        WHERE id = 1`
    ).run();
  }
}

let scheduler: ReturnType<typeof setInterval> | null = null;

export function startBackupTelegramScheduler(db: Database) {
  if (scheduler) return scheduler;
  scheduler = setInterval(() => {
    runDueBackupCheck(db).catch((error) =>
      console.error('[telegram] Quet sao luu dinh ky loi:', error)
    );
  }, 5 * 60_000);
  scheduler.unref();
  setTimeout(() => {
    runDueBackupCheck(db).catch((error) =>
      console.error('[telegram] Quet sao luu dinh ky loi:', error)
    );
  }, 5_000).unref();
  return scheduler;
}
