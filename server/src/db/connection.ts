import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { migrate } from './migrate.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

const DATA_DIR = path.resolve(here, '..', '..', 'data');
const configuredDataDir = process.env.WORKFLOW_DATA_DIR;
export const RUNTIME_DATA_DIR = configuredDataDir ? path.resolve(configuredDataDir) : DATA_DIR;

export const BACKUP_DIR = path.join(RUNTIME_DATA_DIR, 'backups');
export const FILES_DIR = path.join(RUNTIME_DATA_DIR, 'files');
const configuredDbPath = process.env.WORKFLOW_DB_PATH;
const DB_PATH = configuredDbPath
  ? configuredDbPath === ':memory:'
    ? configuredDbPath
    : path.resolve(configuredDbPath)
  : path.join(RUNTIME_DATA_DIR, 'app.db');

fs.mkdirSync(BACKUP_DIR, { recursive: true });
fs.mkdirSync(FILES_DIR, { recursive: true });

function openDatabase(dbPath = DB_PATH): Database.Database {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const database = new Database(dbPath);
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  /*
   * Hieu nang (1.37.1). Do o 120.000 viec / 15.000 co hoi: lan goi dau nhanh hon 30–80%
   * (Bao cao 1.136 → 510 ms, Doanh thu tong 1.540 → 661 ms).
   *  - synchronous=NORMAL: an toan voi WAL (mat dien chi mat giao dich cuoi chua checkpoint,
   *    CSDL khong hong); FULL mac dinh fsync moi lan commit.
   *  - cache_size: mac dinh chi ~2 MB trang dem — moi truy van tong hop doc lai tu dia.
   *  - mmap / temp_store: doc trang va sap xep tam trong bo nho thay vi tep tam.
   *  - busy_timeout: script sao luu / quay lui mo ket noi thu hai thi cho, khong loi ngay.
   */
  database.pragma('synchronous = NORMAL');
  database.pragma(`cache_size = -${Number(process.env.WORKFLOW_SQLITE_CACHE_MB ?? 64) * 1024}`);
  database.pragma('temp_store = MEMORY');
  database.pragma(`mmap_size = ${256 * 1024 * 1024}`);
  database.pragma('busy_timeout = 5000');
  migrate(database);
  return database;
}

export const db = openDatabase();
let closed = false;

export function closeDatabase(): void {
  if (closed || !db.open) return;
  closed = true;
  db.close();
}

process.on('exit', closeDatabase);
