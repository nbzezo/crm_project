import fs from 'node:fs';
import path from 'node:path';
import type { Database } from 'better-sqlite3';
import { BACKUP_DIR } from '../db/connection.ts';

export interface BackupFileInfo {
  path: string;
  name: string;
  size: number;
}

function timestamp(): string {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

export async function createBackupFile(db: Database): Promise<BackupFileInfo> {
  const file = path.join(BACKUP_DIR, `app-${timestamp()}.db`);
  await db.backup(file);
  const stat = fs.statSync(file);
  return { path: file, name: path.basename(file), size: stat.size };
}
