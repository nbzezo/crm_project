import nodemailer, { type Transporter } from 'nodemailer';
import type { Database } from 'better-sqlite3';
import { decryptSecret, encryptSecret } from '../ai/secretStore.ts';
import { HttpError } from '../../lib/validate.ts';

/*
 * Gui email qua SMTP — dung cho thu moi tai khoan va lien ket dat lai mat khau.
 *
 * Sao dung khuon cua services/telegram/telegramService.ts: mot dong cau hinh
 * (`email_settings.id = 1`), bi mat ma hoa bang encryptSecret/decryptSecret, loi
 * ket noi quy ve HttpError(502), va mot cot `last_error` lam nguon duy nhat cho
 * bang canh bao o man Cai dat.
 *
 * KHI CHUA CAU HINH SMTP thi `sendMail` KHONG nem loi ma in noi dung ra console.
 * Ly do: quy trinh moi / dat lai mat khau phai chay duoc tren may local va trong
 * E2E, noi khong ai dung SMTP that. Nem loi o day se bien "quen mat khau" thanh
 * 500 va lam lo cho nguoi goi biet email nao co that — dung thu ma endpoint do
 * dang co gang giau. Ham tra ve `delivered` de nguoi goi ghi log, khong de doi
 * ma phan hoi.
 */

interface EmailSettingsRow {
  id: 1;
  enabled: number;
  host: string;
  port: number;
  secure: number;
  username: string;
  password_ciphertext: string;
  password_iv: string;
  password_tag: string;
  from_name: string;
  from_email: string;
  app_base_url: string;
  last_test_at: string | null;
  last_error: string | null;
  updated_at: string;
}

export interface EmailConfig {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  has_password: boolean;
  from_name: string;
  from_email: string;
  app_base_url: string;
  /** Du dieu kien gui that hay chua — client dung de bat/tat nut gui thu. */
  ready: boolean;
  last_test_at: string | null;
  last_error: string | null;
}

export interface EmailConfigUpdate {
  enabled?: boolean;
  host?: string;
  port?: number;
  secure?: boolean;
  username?: string;
  password?: string;
  clearPassword?: boolean;
  fromName?: string;
  fromEmail?: string;
  appBaseUrl?: string;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

function row(db: Database): EmailSettingsRow {
  return db.prepare(`SELECT * FROM email_settings WHERE id = 1`).get() as EmailSettingsRow;
}

function decryptPassword(config: EmailSettingsRow): string {
  return decryptSecret({
    ciphertext: config.password_ciphertext,
    iv: config.password_iv,
    tag: config.password_tag,
  });
}

/** Cau hinh du de mo mot ket noi SMTP. `username`/`password` co the trong voi relay noi bo. */
function isReady(config: EmailSettingsRow): boolean {
  return Boolean(config.enabled && config.host.trim() && config.from_email.trim());
}

export function getEmailConfig(db: Database): EmailConfig {
  const config = row(db);
  return {
    enabled: Boolean(config.enabled),
    host: config.host,
    port: config.port,
    secure: Boolean(config.secure),
    username: config.username,
    has_password: Boolean(decryptPassword(config)),
    from_name: config.from_name,
    from_email: config.from_email,
    app_base_url: config.app_base_url,
    ready: isReady(config),
    last_test_at: config.last_test_at,
    last_error: config.last_error,
  };
}

export function updateEmailConfig(db: Database, update: EmailConfigUpdate): void {
  const current = row(db);
  let encrypted = {
    ciphertext: current.password_ciphertext,
    iv: current.password_iv,
    tag: current.password_tag,
  };
  if (update.clearPassword) encrypted = encryptSecret('');
  else if (update.password) encrypted = encryptSecret(update.password);

  db.prepare(
    `UPDATE email_settings
        SET enabled = ?, host = ?, port = ?, secure = ?, username = ?,
            password_ciphertext = ?, password_iv = ?, password_tag = ?,
            from_name = ?, from_email = ?, app_base_url = ?,
            updated_at = datetime('now','localtime')
      WHERE id = 1`
  ).run(
    update.enabled === undefined ? current.enabled : update.enabled ? 1 : 0,
    update.host === undefined ? current.host : update.host.trim(),
    update.port === undefined ? current.port : update.port,
    update.secure === undefined ? current.secure : update.secure ? 1 : 0,
    update.username === undefined ? current.username : update.username.trim(),
    encrypted.ciphertext,
    encrypted.iv,
    encrypted.tag,
    update.fromName === undefined ? current.from_name : update.fromName.trim(),
    update.fromEmail === undefined ? current.from_email : update.fromEmail.trim(),
    update.appBaseUrl === undefined
      ? current.app_base_url
      : update.appBaseUrl.trim().replace(/\/+$/, '')
  );
}

export function setEmailLastError(db: Database, message: string | null): void {
  db.prepare(`UPDATE email_settings SET last_error = ? WHERE id = 1`).run(message);
}

/**
 * Goc URL dat vao lien ket trong thu.
 *
 * Uu tien gia tri khai bao tuong minh. Suy tu header cua request chi la phuong
 * an du phong: sau nginx/Docker, `req.headers.host` co the la ten container chu
 * khong phai ten mien that, va mot lien ket dat lai mat khau tro sai dia chi thi
 * nguoi nhan khong con duong nao khac de vao.
 */
export function appBaseUrl(db: Database, fallback?: string): string {
  const configured = row(db).app_base_url.trim();
  if (configured) return configured.replace(/\/+$/, '');
  return (fallback ?? 'http://localhost:5173').replace(/\/+$/, '');
}

function createTransport(config: EmailSettingsRow): Transporter {
  const auth = config.username
    ? { user: config.username, pass: decryptPassword(config) }
    : undefined;
  return nodemailer.createTransport({
    host: config.host.trim(),
    port: config.port,
    secure: Boolean(config.secure),
    auth,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

function fromAddress(config: EmailSettingsRow): string {
  return config.from_name ? `"${config.from_name}" <${config.from_email}>` : config.from_email;
}

/**
 * Gui mot thu. Tra ve `delivered = false` khi chua cau hinh SMTP (da in ra console).
 *
 * Loi SMTP that su duoc ghi vao `last_error` roi nem tiep — nguoi goi quyet dinh
 * nuot hay tra loi. `/forgot-password` nuot; nut "gui thu thu" thi khong.
 */
export async function sendMail(db: Database, message: MailMessage): Promise<{ delivered: boolean }> {
  const config = row(db);
  if (!isReady(config)) {
    console.log(
      `[email] Chua cau hinh SMTP — khong gui that.\n` +
        `        To: ${message.to}\n` +
        `        Subject: ${message.subject}\n` +
        `${message.text}`
    );
    return { delivered: false };
  }

  try {
    await createTransport(config).sendMail({
      from: fromAddress(config),
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    setEmailLastError(db, detail);
    throw new HttpError(502, `Không gửi được email: ${detail}`);
  }

  setEmailLastError(db, null);
  return { delivered: true };
}

/** Kiem tra ket noi SMTP ma khong gui thu — dung cho nut "Kiem tra" o Cai dat. */
export async function testEmailConnection(db: Database): Promise<void> {
  const config = row(db);
  if (!config.host.trim()) throw new HttpError(400, 'Chưa khai báo máy chủ SMTP');
  if (!config.from_email.trim()) throw new HttpError(400, 'Chưa khai báo địa chỉ email gửi đi');

  try {
    await createTransport(config).verify();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    setEmailLastError(db, detail);
    throw new HttpError(502, `Không kết nối được tới máy chủ SMTP: ${detail}`);
  }

  db.prepare(
    `UPDATE email_settings SET last_test_at = datetime('now','localtime'), last_error = NULL WHERE id = 1`
  ).run();
}
