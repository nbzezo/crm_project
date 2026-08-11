import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { migrate } from './migrate.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

export const DATA_DIR = path.resolve(here, '..', '..', 'data');
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');
export const FILES_DIR = path.join(DATA_DIR, 'files');
const DB_PATH = path.join(DATA_DIR, 'app.db');

fs.mkdirSync(BACKUP_DIR, { recursive: true });
fs.mkdirSync(FILES_DIR, { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

migrate(db);

process.on('exit', () => db.close());
