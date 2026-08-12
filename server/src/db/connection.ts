import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { migrate } from './migrate.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

export const DATA_DIR = path.resolve(here, '..', '..', 'data');
const configuredDataDir = process.env.WORKFLOW_DATA_DIR;
export const RUNTIME_DATA_DIR = configuredDataDir ? path.resolve(configuredDataDir) : DATA_DIR;

export const BACKUP_DIR = path.join(RUNTIME_DATA_DIR, 'backups');
export const FILES_DIR = path.join(RUNTIME_DATA_DIR, 'files');
const configuredDbPath = process.env.WORKFLOW_DB_PATH;
export const DB_PATH = configuredDbPath
  ? configuredDbPath === ':memory:'
    ? configuredDbPath
    : path.resolve(configuredDbPath)
  : path.join(RUNTIME_DATA_DIR, 'app.db');

fs.mkdirSync(BACKUP_DIR, { recursive: true });
fs.mkdirSync(FILES_DIR, { recursive: true });

export function openDatabase(dbPath = DB_PATH): Database.Database {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const database = new Database(dbPath);
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
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
