import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import type { Database } from 'better-sqlite3';
import { BACKUP_DIR } from '../db/connection.ts';

interface BackupFileInfo {
  path: string;
  name: string;
  size: number;
}

/**
 * So ban sao luu giu lai trong thu muc backups (1.24.0). Moi ban la mot ban CSDL day
 * du; truoc day khong ban nao bi xoa nen o dia cua container day dan theo thoi gian.
 * Doi bang bien moi truong WORKFLOW_BACKUP_KEEP.
 */
export function backupKeepCount(): number {
  const value = Number(process.env.WORKFLOW_BACKUP_KEEP ?? 10);
  return Number.isInteger(value) && value >= 1 ? value : 10;
}

function timestamp(): string {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

/** Xoa cac ban sao luu `app-*.db` cu nhat, chi giu `keep` ban moi nhat. Tra ve ten da xoa. */
export function pruneBackups(keep = backupKeepCount()): string[] {
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((name) => /^app-.*\.db$/.test(name))
    .map((name) => ({ name, mtime: fs.statSync(path.join(BACKUP_DIR, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime || b.name.localeCompare(a.name));
  const removed = files.slice(keep).map((file) => file.name);
  for (const name of removed) fs.rmSync(path.join(BACKUP_DIR, name), { force: true });
  return removed;
}

export async function createBackupFile(db: Database): Promise<BackupFileInfo> {
  const file = path.join(BACKUP_DIR, `app-${timestamp()}.db`);
  await db.backup(file);
  const stat = fs.statSync(file);
  pruneBackups();
  return { path: file, name: path.basename(file), size: stat.size };
}

/** Nen gzip mot tep theo luong (khong nap ca tep vao RAM). Tra ve duong dan `.gz`. */
export async function gzipFile(source: string): Promise<string> {
  const target = `${source}.gz`;
  await pipeline(fs.createReadStream(source), zlib.createGzip(), fs.createWriteStream(target));
  return target;
}
