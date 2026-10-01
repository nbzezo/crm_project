import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import type { Database } from 'better-sqlite3';
import { FILES_DIR } from '../../db/connection.ts';
import { createBackupFile } from '../../lib/backup.ts';
import { HttpError } from '../../lib/validate.ts';
import { decryptSecret, encryptSecret } from '../ai/secretStore.ts';
import {
  forgetGoogleAccessToken,
  googleAccessToken,
  revokeGoogleToken,
  type GoogleClient,
} from '../email/googleMail.ts';
import {
  createFolder,
  deleteFile,
  downloadFile,
  folderUsable,
  listFolder,
  uploadFile,
} from './driveApi.ts';

/*
 * Sao luu CSDL va tep tai len ra Google Drive.
 *
 * Moi lan chay: (1) chup CSDL bang db.backup(), nen gzip, day len thu muc
 * `database/` va xoa ban cu vuot so luong giu lai; (2) day cac tep MOI trong
 * `files/` len thu muc `files/`. Tep tai len dat ten khong bao gio ghi de nen
 * chi can biet "ten nay da len chua" (bang drive_backup_files) — khong can so
 * sanh noi dung.
 *
 * KHONG BAO GIO xoa tep tren Drive vi tep da bi xoa khoi CRM: day la ban sao luu,
 * xoa nham o CRM khong duoc lan sang ban sao. Chi ban sao CSDL cu moi bi don.
 */

interface DriveSettingsRow {
  id: 1;
  enabled: number;
  google_client_id: string;
  google_client_secret_ciphertext: string;
  google_client_secret_iv: string;
  google_client_secret_tag: string;
  google_refresh_token_ciphertext: string;
  google_refresh_token_iv: string;
  google_refresh_token_tag: string;
  google_account: string;
  root_folder_id: string;
  db_folder_id: string;
  files_folder_id: string;
  interval_hours: number;
  keep_db_count: number;
  next_run_at: string | null;
  last_run_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  last_db_name: string | null;
  last_db_size: number | null;
  last_files_uploaded: number | null;
  last_files_failed: number | null;
}

export interface DriveBackupConfig {
  enabled: boolean;
  interval_hours: number;
  keep_db_count: number;
  google_client_id: string;
  has_google_client_secret: boolean;
  google_account: string;
  connected: boolean;
  /** Bat va da dang nhap — du dieu kien tu chay theo lich. */
  ready: boolean;
  folder_url: string | null;
  next_run_at: string | null;
  last_run_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  last_db_name: string | null;
  last_db_size: number | null;
  last_files_uploaded: number | null;
  last_files_failed: number | null;
  running: boolean;
  /** Ket qua lan khoi phuc gan nhat — chi nam trong bo nho, mat khi khoi dong lai. */
  last_restore: (RestoreResult & { at: string }) | null;
  /** Tep da len Drive / tep tren dia chua len / tep CRM can ma khong con tren dia. */
  tracked_files: number;
  pending_files: number;
  missing_on_disk: number;
  missing_restorable: number;
  /** Muc Email da co Client ID + Secret — dung lai duoc bang mot cu bam. */
  email_client_available: boolean;
}

export interface DriveBackupUpdate {
  enabled?: boolean;
  intervalHours?: number;
  keepDbCount?: number;
  googleClientId?: string;
  googleClientSecret?: string;
  copyClientFromEmail?: boolean;
}

function row(db: Database): DriveSettingsRow {
  return db.prepare('SELECT * FROM drive_backup_settings WHERE id = 1').get() as DriveSettingsRow;
}

function clientOf(config: DriveSettingsRow): GoogleClient {
  return {
    clientId: config.google_client_id,
    clientSecret: decryptSecret({
      ciphertext: config.google_client_secret_ciphertext,
      iv: config.google_client_secret_iv,
      tag: config.google_client_secret_tag,
    }),
  };
}

function refreshTokenOf(config: DriveSettingsRow): string {
  return decryptSecret({
    ciphertext: config.google_refresh_token_ciphertext,
    iv: config.google_refresh_token_iv,
    tag: config.google_refresh_token_tag,
  });
}

/** Client ID + Secret da khai bao — du de mo trang dang nhap Google. */
export function driveClientOf(db: Database): GoogleClient | null {
  const client = clientOf(row(db));
  return client.clientId && client.clientSecret ? client : null;
}

/* ---------- Trang thai tren dia ---------- */

function diskFiles(): string[] {
  if (!fs.existsSync(FILES_DIR)) return [];
  return fs
    .readdirSync(FILES_DIR, { withFileTypes: true })
    .filter(
      (entry) => entry.isFile() && !entry.name.startsWith('.') && !entry.name.endsWith('.part')
    )
    .map((entry) => entry.name)
    .sort();
}

/** Ten tep ma CSDL tham chieu nhung khong con tren dia. */
function missingStoredNames(db: Database): string[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT stored_name FROM documents WHERE stored_name IS NOT NULL AND stored_name <> ''`
    )
    .all() as { stored_name: string }[];
  return rows
    .map((r) => r.stored_name)
    .filter((name) => !fs.existsSync(path.join(FILES_DIR, name)));
}

export function getDriveBackupConfig(db: Database): DriveBackupConfig {
  const config = row(db);
  const tracked = new Set(
    (
      db.prepare('SELECT stored_name FROM drive_backup_files').all() as { stored_name: string }[]
    ).map((r) => r.stored_name)
  );
  const missing = missingStoredNames(db);
  const connected = Boolean(config.google_account && refreshTokenOf(config));
  const emailClient = db
    .prepare(
      `SELECT google_client_id AS id, google_client_secret_ciphertext AS secret
         FROM email_settings WHERE id = 1`
    )
    .get() as { id: string; secret: string } | undefined;

  return {
    enabled: Boolean(config.enabled),
    interval_hours: config.interval_hours,
    keep_db_count: config.keep_db_count,
    google_client_id: config.google_client_id,
    has_google_client_secret: Boolean(config.google_client_secret_ciphertext),
    google_account: config.google_account,
    connected,
    ready: Boolean(config.enabled) && connected,
    folder_url: config.root_folder_id
      ? `https://drive.google.com/drive/folders/${config.root_folder_id}`
      : null,
    next_run_at: config.next_run_at,
    last_run_at: config.last_run_at,
    last_success_at: config.last_success_at,
    last_error: config.last_error,
    last_db_name: config.last_db_name,
    last_db_size: config.last_db_size,
    last_files_uploaded: config.last_files_uploaded,
    last_files_failed: config.last_files_failed,
    running,
    last_restore: lastRestore,
    tracked_files: tracked.size,
    pending_files: diskFiles().filter((name) => !tracked.has(name)).length,
    missing_on_disk: missing.length,
    missing_restorable: missing.filter((name) => tracked.has(name)).length,
    email_client_available: Boolean(emailClient?.id && emailClient.secret),
  };
}

/* ---------- Cau hinh va ket noi ---------- */

export function updateDriveBackupConfig(db: Database, update: DriveBackupUpdate): void {
  const current = row(db);

  let clientId = current.google_client_id;
  let secret = {
    ciphertext: current.google_client_secret_ciphertext,
    iv: current.google_client_secret_iv,
    tag: current.google_client_secret_tag,
  };
  if (update.copyClientFromEmail) {
    const email = db
      .prepare(
        `SELECT google_client_id, google_client_secret_ciphertext AS c,
                google_client_secret_iv AS i, google_client_secret_tag AS t
           FROM email_settings WHERE id = 1`
      )
      .get() as { google_client_id: string; c: string; i: string; t: string };
    if (!email.google_client_id || !email.c) {
      throw new HttpError(400, 'Mục Email chưa có Client ID / Client Secret để dùng lại');
    }
    /* Sao chep nguyen khoi da ma hoa: cung khoa cai dat nen giai ma duoc, va gia
       tri ro khong di qua bo nho cua route. */
    clientId = email.google_client_id;
    secret = { ciphertext: email.c, iv: email.i, tag: email.t };
  }
  if (update.googleClientId !== undefined) clientId = update.googleClientId.trim();
  if (update.googleClientSecret) secret = encryptSecret(update.googleClientSecret.trim());

  /* Token gan voi OAuth client da cap no, va voi Drive thi con nghiem trong hon:
     `drive.file` chi cho thay tep do CHINH client do tao. Doi client la mat quyen
     voi moi tep cu — bo thu muc / theo doi cu, de lan sau tao lai tu dau thay vi
     tin rang chung con do. */
  const clientChanged =
    clientId !== current.google_client_id ||
    secret.ciphertext !== current.google_client_secret_ciphertext;

  db.prepare(
    `UPDATE drive_backup_settings
        SET enabled = ?, interval_hours = ?, keep_db_count = ?,
            google_client_id = ?, google_client_secret_ciphertext = ?,
            google_client_secret_iv = ?, google_client_secret_tag = ?,
            updated_at = datetime('now','localtime')
      WHERE id = 1`
  ).run(
    update.enabled === undefined ? current.enabled : update.enabled ? 1 : 0,
    update.intervalHours ?? current.interval_hours,
    update.keepDbCount ?? current.keep_db_count,
    clientId,
    secret.ciphertext,
    secret.iv,
    secret.tag
  );

  if (clientChanged && current.google_account) clearConnection(db, { forgetFolders: true });
}

/** Luu ket qua dang nhap Google. Tu bat sao luu; ban dau tien chay o lan quet ke tiep. */
export function saveDriveConnection(
  db: Database,
  connection: { refreshToken: string; account: string }
): void {
  const current = row(db);
  const token = encryptSecret(connection.refreshToken);
  /* Doi sang tai khoan Google khac: thu muc va tep cu nam o Drive cua nguoi kia. */
  if (current.google_account && current.google_account !== connection.account) {
    clearConnection(db, { forgetFolders: true });
  }
  db.prepare(
    `UPDATE drive_backup_settings
        SET enabled = 1, google_account = ?, last_error = NULL, next_run_at = NULL,
            google_refresh_token_ciphertext = ?, google_refresh_token_iv = ?,
            google_refresh_token_tag = ?, updated_at = datetime('now','localtime')
      WHERE id = 1`
  ).run(connection.account, token.ciphertext, token.iv, token.tag);
}

function clearConnection(db: Database, options: { forgetFolders: boolean }): void {
  const token = refreshTokenOf(row(db));
  db.prepare(
    `UPDATE drive_backup_settings
        SET enabled = 0, google_account = '', google_refresh_token_ciphertext = '',
            google_refresh_token_iv = '', google_refresh_token_tag = '',
            updated_at = datetime('now','localtime')
      WHERE id = 1`
  ).run();
  if (options.forgetFolders) forgetFolders(db);
  forgetGoogleAccessToken(token || undefined);
}

function forgetFolders(db: Database): void {
  db.prepare(
    `UPDATE drive_backup_settings
        SET root_folder_id = '', db_folder_id = '', files_folder_id = ''
      WHERE id = 1`
  ).run();
  db.prepare('DELETE FROM drive_backup_files').run();
}

/** Ngat ket noi: xoa token o day va thu hoi no phia Google. Tep tren Drive van nguyen. */
export async function disconnectDrive(db: Database): Promise<void> {
  const token = refreshTokenOf(row(db));
  clearConnection(db, { forgetFolders: false });
  if (token) await revokeGoogleToken(token);
}

export function setDriveLastError(db: Database, message: string | null): void {
  db.prepare('UPDATE drive_backup_settings SET last_error = ? WHERE id = 1').run(message);
}

/* ---------- Chay sao luu ---------- */

let running = false;
let lastRestore: (RestoreResult & { at: string }) | null = null;

const ROOT_FOLDER_NAME = 'WorkFlow CRM — Sao lưu';

async function accessToken(config: DriveSettingsRow): Promise<string> {
  const refreshToken = refreshTokenOf(config);
  const client = clientOf(config);
  if (!config.google_account || !refreshToken || !client.clientSecret) {
    throw new HttpError(400, 'Chưa đăng nhập tài khoản Google cho sao lưu Drive');
  }
  return googleAccessToken(client, refreshToken);
}

/** Dam bao ba thu muc con ton tai; tao lai cai nao bi xoa tren Drive. */
async function ensureFolders(
  db: Database,
  token: string
): Promise<{ dbFolder: string; filesFolder: string }> {
  const config = row(db);
  let { root_folder_id: root, db_folder_id: dbFolder, files_folder_id: filesFolder } = config;

  if (root && !(await folderUsable(token, root))) {
    /* Thu muc goc bi xoa: moi thu ben trong cung mat — theo doi cu khong con dung. */
    root = dbFolder = filesFolder = '';
    db.prepare('DELETE FROM drive_backup_files').run();
  }
  if (!root) root = await createFolder(token, ROOT_FOLDER_NAME);
  if (dbFolder && !(await folderUsable(token, dbFolder))) dbFolder = '';
  if (!dbFolder) dbFolder = await createFolder(token, 'database', root);
  if (filesFolder && !(await folderUsable(token, filesFolder))) {
    filesFolder = '';
    db.prepare('DELETE FROM drive_backup_files').run();
  }
  if (!filesFolder) filesFolder = await createFolder(token, 'files', root);

  db.prepare(
    `UPDATE drive_backup_settings
        SET root_folder_id = ?, db_folder_id = ?, files_folder_id = ? WHERE id = 1`
  ).run(root, dbFolder, filesFolder);
  return { dbFolder, filesFolder };
}

export interface DriveBackupResult {
  dbName: string;
  dbSize: number;
  filesUploaded: number;
  filesFailed: number;
  errors: string[];
}

/** Sau ngan nay lien tiep loi thi dung: gan nhu chac chan la loi he thong (het dung luong, mat quyen). */
const MAX_CONSECUTIVE_FILE_FAILURES = 3;

async function backupDatabase(
  db: Database,
  token: string,
  dbFolder: string
): Promise<{ name: string; size: number }> {
  const snapshot = await createBackupFile(db);
  const compressed = `${snapshot.path}.gz`;
  try {
    await pipeline(
      fs.createReadStream(snapshot.path),
      zlib.createGzip(),
      fs.createWriteStream(compressed)
    );
    const name = `${snapshot.name}.gz`;
    await uploadFile(token, {
      filePath: compressed,
      name,
      parentId: dbFolder,
      mime: 'application/gzip',
      description:
        'Bản sao lưu CSDL WorkFlow (SQLite, nén gzip). Giải nén rồi đổi tên thành app.db.',
    });
    return { name, size: fs.statSync(compressed).size };
  } finally {
    /* Ban chup tam chi sinh ra de day len Drive — de lai thi moi dem sao luu
       them mot tep vao danh sach "Sao luu" o Cai dat va an dung luong o. */
    fs.rmSync(snapshot.path, { force: true });
    fs.rmSync(compressed, { force: true });
  }
}

async function pruneDatabaseBackups(token: string, dbFolder: string, keep: number): Promise<void> {
  const backups = (await listFolder(token, dbFolder)).filter((f) =>
    /^app-.*\.db\.gz$/.test(f.name)
  );
  for (const old of backups.slice(keep)) await deleteFile(token, old.id);
}

async function backupNewFiles(
  db: Database,
  token: string,
  filesFolder: string
): Promise<{ uploaded: number; failed: number; errors: string[] }> {
  const tracked = new Set(
    (
      db.prepare('SELECT stored_name FROM drive_backup_files').all() as { stored_name: string }[]
    ).map((r) => r.stored_name)
  );
  const original = db.prepare('SELECT file_name FROM documents WHERE stored_name = ? LIMIT 1');
  const record = db.prepare(
    `INSERT OR REPLACE INTO drive_backup_files (stored_name, drive_file_id, size) VALUES (?, ?, ?)`
  );

  let uploaded = 0;
  let failed = 0;
  let consecutive = 0;
  const errors: string[] = [];

  for (const name of diskFiles()) {
    if (tracked.has(name)) continue;
    if (consecutive >= MAX_CONSECUTIVE_FILE_FAILURES) {
      failed += 1;
      continue;
    }
    const filePath = path.join(FILES_DIR, name);
    try {
      const originalName = (original.get(name) as { file_name: string } | undefined)?.file_name;
      const created = await uploadFile(token, {
        filePath,
        name,
        parentId: filesFolder,
        /* Ten tren dia la ten ky thuat (`<thoi gian>-<ngau nhien>.<duoi>`); ten goc
           nam trong mo ta de khoi phuc tay tu Drive van doc duoc. */
        description: originalName ? `Tên gốc: ${originalName}` : undefined,
      });
      record.run(name, created.id, fs.statSync(filePath).size);
      uploaded += 1;
      consecutive = 0;
    } catch (error) {
      /* Tep bi xoa giua chung: khong phai loi sao luu. */
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      failed += 1;
      consecutive += 1;
      const message = error instanceof Error ? error.message : String(error);
      if (errors.length < 3) errors.push(`${name}: ${message}`);
    }
  }
  if (consecutive >= MAX_CONSECUTIVE_FILE_FAILURES) {
    errors.push('Dừng sớm vì nhiều tệp liên tiếp bị lỗi — các tệp còn lại sẽ thử lại ở lần sau.');
  }
  return { uploaded, failed, errors };
}

/**
 * Chay mot lan sao luu. Ban sao CSDL la phan quan trong nhat: loi o do la that bai
 * ca lan chay. Loi tung tep thi gom lai va bao, vi mot tep hong khong duoc chan
 * ban sao CSDL cua ngay hom do.
 */
export async function runDriveBackup(db: Database): Promise<DriveBackupResult> {
  if (running) throw new HttpError(409, 'Đang có một lần sao lưu lên Drive chạy — chờ nó xong.');
  running = true;
  try {
    const config = row(db);
    const token = await accessToken(config);
    const { dbFolder, filesFolder } = await ensureFolders(db, token);

    const database = await backupDatabase(db, token, dbFolder);
    try {
      await pruneDatabaseBackups(token, dbFolder, config.keep_db_count);
    } catch (error) {
      /* Don dep that bai khong lam mat ban sao vua tao. */
      console.warn('[drive-backup] Khong don duoc ban sao CSDL cu:', error);
    }
    const files = await backupNewFiles(db, token, filesFolder);

    db.prepare(
      `UPDATE drive_backup_settings
          SET last_success_at = datetime('now','localtime'), last_db_name = ?, last_db_size = ?,
              last_files_uploaded = ?, last_files_failed = ?
        WHERE id = 1`
    ).run(database.name, database.size, files.uploaded, files.failed);

    return {
      dbName: database.name,
      dbSize: database.size,
      filesUploaded: files.uploaded,
      filesFailed: files.failed,
      errors: files.errors,
    };
  } finally {
    running = false;
  }
}

/**
 * Chay va ghi ket qua vao cau hinh — cho ca nut "Sao luu ngay" lan lich dinh ky.
 * Luon doi lich ke ca khi loi (giong sao luu Telegram) de loi dai han khong thanh
 * vong lap thu lai moi lan quet.
 */
export async function runAndRecordDriveBackup(db: Database): Promise<DriveBackupResult> {
  try {
    const result = await runDriveBackup(db);
    setDriveLastError(
      db,
      result.filesFailed > 0
        ? `${result.filesFailed} tệp chưa sao lưu được: ${result.errors.join('; ')}`
        : null
    );
    return result;
  } catch (error) {
    /* 409 "dang chay" khong phai loi cua lan chay nay — dung ghi de len ket qua cua lan dang chay. */
    if (!(error instanceof HttpError && error.status === 409)) {
      setDriveLastError(db, error instanceof Error ? error.message : 'Lỗi không xác định');
    }
    throw error;
  } finally {
    db.prepare(
      `UPDATE drive_backup_settings
          SET last_run_at = datetime('now','localtime'),
              next_run_at = datetime('now','localtime', '+' || interval_hours || ' hours')
        WHERE id = 1`
    ).run();
  }
}

/* ---------- Khoi phuc tep thieu ---------- */

export interface RestoreResult {
  restored: number;
  failed: number;
  /** Tep CSDL can nhung chua tung len Drive — khong co gi de khoi phuc. */
  notBackedUp: number;
}

/**
 * Tai ve cac tep CSDL tham chieu nhung da mat khoi dia (xoa nham, hong o).
 *
 * Chi THEM tep, khong bao gio ghi de tep dang co. Khoi phuc CSDL thi KHONG lam o
 * day: thay `app.db` dang mo bang mot ban cu tu giao dien web de mat du lieu cua
 * moi nguoi ke tu ban sao do. Cach khoi phuc CSDL duoc ghi o README.
 */
export async function restoreMissingFiles(db: Database): Promise<RestoreResult> {
  if (running) throw new HttpError(409, 'Đang có một lần sao lưu lên Drive chạy — chờ nó xong.');
  running = true;
  try {
    const token = await accessToken(row(db));
    const tracked = db.prepare(
      'SELECT drive_file_id FROM drive_backup_files WHERE stored_name = ?'
    );

    const result: RestoreResult = { restored: 0, failed: 0, notBackedUp: 0 };
    lastRestore = null;
    for (const name of missingStoredNames(db)) {
      /* Ten phai la ten tep tran, khong co duong dan — chan viec mot dong CSDL
         bi sua tay tro `../` ra ngoai thu muc tep. */
      if (name !== path.basename(name)) continue;
      const found = tracked.get(name) as { drive_file_id: string } | undefined;
      if (!found) {
        result.notBackedUp += 1;
        continue;
      }
      try {
        await downloadFile(token, found.drive_file_id, path.join(FILES_DIR, name));
        result.restored += 1;
      } catch (error) {
        result.failed += 1;
        console.warn(`[drive-backup] Khong khoi phuc duoc ${name}:`, error);
      }
    }
    lastRestore = { ...result, at: new Date().toISOString() };
    return result;
  } finally {
    running = false;
  }
}

/* ---------- Lich chay ---------- */

export async function runDueDriveBackupCheck(db: Database): Promise<void> {
  if (running) return;
  const config = row(db);
  if (!config.enabled) return;
  const due = db
    .prepare(
      `SELECT 1 FROM drive_backup_settings
        WHERE id = 1 AND (next_run_at IS NULL OR next_run_at <= datetime('now','localtime'))`
    )
    .get();
  if (!due) return;
  if (!config.google_account || !refreshTokenOf(config)) return;

  try {
    await runAndRecordDriveBackup(db);
  } catch (error) {
    console.error('[drive-backup] Sao luu dinh ky len Drive that bai:', error);
  }
}

let scheduler: ReturnType<typeof setInterval> | null = null;

export function startDriveBackupScheduler(db: Database) {
  if (scheduler) return scheduler;
  const tick = () => {
    runDueDriveBackupCheck(db).catch((error) =>
      console.error('[drive-backup] Quet lich loi:', error)
    );
  };
  scheduler = setInterval(tick, 5 * 60_000);
  scheduler.unref();
  setTimeout(tick, 30_000).unref();
  return scheduler;
}
