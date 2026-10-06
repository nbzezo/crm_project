import fs from 'node:fs';
import type { Database } from 'better-sqlite3';
import { createBackupFile, gzipFile } from '../../lib/backup.ts';
import { HttpError } from '../../lib/validate.ts';
import {
  getTelegramConfig,
  sendTelegramDocument,
  setTelegramLastError,
} from './telegramService.ts';

/** Bot API chi nhan tep toi 50 MB; chua le mot chut cho phan dau multipart. */
const TELEGRAM_MAX_UPLOAD_BYTES = 49 * 1024 * 1024;

export async function sendBackupToTelegram(db: Database): Promise<{ name: string; size: number }> {
  const config = getTelegramConfig(db);
  if (!config.has_token || !config.chat_id) {
    throw new HttpError(400, 'Chưa cấu hình Bot Token hoặc Chat ID cho Telegram');
  }
  const file = await createBackupFile(db);
  /* Nen truoc khi gui (SQLite nen duoc 3-5 lan), va xoa ca ban chup lan ban nen sau
     khi gui — giong sao luu Drive. Truoc day gui nguyen tep .db: qua 50 MB la Telegram
     tu choi, va moi lan gui de lai mot ban day du trong thu muc backups. */
  let compressed: string | null = null;
  let sentSize = 0;
  try {
    compressed = await gzipFile(file.path);
    sentSize = fs.statSync(compressed).size;
    if (sentSize > TELEGRAM_MAX_UPLOAD_BYTES) {
      throw new HttpError(
        413,
        `Bản sao lưu nén còn ${(sentSize / 1024 / 1024).toFixed(1)} MB, vượt giới hạn 50 MB của bot Telegram. Hãy dùng sao lưu Google Drive (Cài đặt → Sao lưu).`
      );
    }
    await sendTelegramDocument(
      db,
      compressed,
      `📦 Bản sao lưu CSDL WorkFlow — ${file.name}.gz (giải nén rồi đổi tên thành app.db)`
    );
  } finally {
    fs.rmSync(file.path, { force: true });
    if (compressed) fs.rmSync(compressed, { force: true });
  }
  db.prepare(
    `UPDATE telegram_settings
        SET last_backup_sent_at = datetime('now','localtime'), updated_at = datetime('now','localtime')
      WHERE id = 1`
  ).run();
  return { name: `${file.name}.gz`, size: sentSize };
}

/** Kiem tra va gui sao luu dinh ky neu da den han; luon doi lich ke ca khi loi
 *  (giong runDueAutomations) de tranh vong lap thu lai lien tuc khi loi dai han. */
async function runDueBackupCheck(db: Database): Promise<void> {
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
    setTelegramLastError(db, null);
  } catch (error) {
    console.error('[telegram] Gui sao luu dinh ky that bai:', error);
    setTelegramLastError(db, error instanceof Error ? error.message : 'Loi khong xac dinh');
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
