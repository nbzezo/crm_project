import nodemailer, { type Transporter } from 'nodemailer';
import type { Database } from 'better-sqlite3';
import { decryptSecret, encryptSecret } from '../ai/secretStore.ts';
import { HttpError } from '../../lib/validate.ts';
import {
  forgetGoogleAccessToken,
  googleAccessToken,
  revokeGoogleToken,
  sendViaGmail,
  type GoogleClient,
} from './googleMail.ts';

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
  auth_type: EmailAuthType;
  google_client_id: string;
  google_client_secret_ciphertext: string;
  google_client_secret_iv: string;
  google_client_secret_tag: string;
  google_refresh_token_ciphertext: string;
  google_refresh_token_iv: string;
  google_refresh_token_tag: string;
  google_account: string;
}

/** `password` = SMTP (moi nha cung cap); `google` = Gmail API qua dang nhap Google (v48). */
export type EmailAuthType = 'password' | 'google';

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
  auth_type: EmailAuthType;
  google_client_id: string;
  has_google_client_secret: boolean;
  /** Dia chi Gmail da dang nhap; rong = chua ket noi. */
  google_account: string;
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
  authType?: EmailAuthType;
  googleClientId?: string;
  googleClientSecret?: string;
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

function googleClient(config: EmailSettingsRow): GoogleClient {
  return {
    clientId: config.google_client_id,
    clientSecret: decryptSecret({
      ciphertext: config.google_client_secret_ciphertext,
      iv: config.google_client_secret_iv,
      tag: config.google_client_secret_tag,
    }),
  };
}

function googleRefreshToken(config: EmailSettingsRow): string {
  return decryptSecret({
    ciphertext: config.google_refresh_token_ciphertext,
    iv: config.google_refresh_token_iv,
    tag: config.google_refresh_token_tag,
  });
}

/** Client ID + Secret da khai bao — du de mo trang dang nhap Google. */
export function googleClientOf(db: Database): GoogleClient | null {
  const client = googleClient(row(db));
  return client.clientId && client.clientSecret ? client : null;
}

/**
 * Cau hinh du de gui that.
 *
 * SMTP: `username`/`password` co the trong voi relay noi bo. Google: phai co
 * client va refresh token — dia chi gui di chinh la tai khoan da dang nhap.
 */
function isReady(config: EmailSettingsRow): boolean {
  if (!config.enabled) return false;
  if (config.auth_type === 'google') {
    return Boolean(
      config.google_account && googleRefreshToken(config) && googleClient(config).clientSecret
    );
  }
  return Boolean(config.host.trim() && config.from_email.trim());
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
    auth_type: config.auth_type,
    google_client_id: config.google_client_id,
    has_google_client_secret: Boolean(config.google_client_secret_ciphertext),
    google_account: config.google_account,
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

  const clientId =
    update.googleClientId === undefined ? current.google_client_id : update.googleClientId.trim();
  let clientSecret = {
    ciphertext: current.google_client_secret_ciphertext,
    iv: current.google_client_secret_iv,
    tag: current.google_client_secret_tag,
  };
  if (update.googleClientSecret) clientSecret = encryptSecret(update.googleClientSecret.trim());

  /* Refresh token gan voi OAuth client da cap no. Doi client thi token cu chet o
     lan gui ke tiep — ngat ket noi ngay bay gio de man hinh noi that thay vi de
     thu moi dau tien hong. */
  const clientChanged = clientId !== current.google_client_id || Boolean(update.googleClientSecret);

  db.prepare(
    `UPDATE email_settings
        SET enabled = ?, host = ?, port = ?, secure = ?, username = ?,
            password_ciphertext = ?, password_iv = ?, password_tag = ?,
            from_name = ?, from_email = ?, app_base_url = ?,
            auth_type = ?, google_client_id = ?,
            google_client_secret_ciphertext = ?, google_client_secret_iv = ?,
            google_client_secret_tag = ?,
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
      : update.appBaseUrl.trim().replace(/\/+$/, ''),
    update.authType ?? current.auth_type,
    clientId,
    clientSecret.ciphertext,
    clientSecret.iv,
    clientSecret.tag
  );

  if (clientChanged && current.google_account) clearGoogleConnection(db);
}

/** Luu ket qua dang nhap Google. Gmail API luon gui duoi ten tai khoan nay. */
export function saveGoogleConnection(
  db: Database,
  connection: { refreshToken: string; account: string }
): void {
  const token = encryptSecret(connection.refreshToken);
  db.prepare(
    `UPDATE email_settings
        SET auth_type = 'google', enabled = 1, google_account = ?, from_email = ?,
            google_refresh_token_ciphertext = ?, google_refresh_token_iv = ?,
            google_refresh_token_tag = ?, last_error = NULL,
            last_test_at = datetime('now','localtime'),
            updated_at = datetime('now','localtime')
      WHERE id = 1`
  ).run(connection.account, connection.account, token.ciphertext, token.iv, token.tag);
}

function clearGoogleConnection(db: Database): void {
  db.prepare(
    `UPDATE email_settings
        SET google_account = '', google_refresh_token_ciphertext = '',
            google_refresh_token_iv = '', google_refresh_token_tag = '',
            updated_at = datetime('now','localtime')
      WHERE id = 1`
  ).run();
  forgetGoogleAccessToken();
}

/** Ngat ket noi Google: xoa token o day va thu hoi no phia Google. */
export async function disconnectGoogle(db: Database): Promise<void> {
  const token = googleRefreshToken(row(db));
  clearGoogleConnection(db);
  if (token) await revokeGoogleToken(token);
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

/*
 * Loi xac thuc cua Gmail / Microsoft la mot chuoi ma 5.7.x kho doc. Day la ba
 * truong hop chiem gan het cac lan cau hinh hong — dich ra viec can lam, giu
 * nguyen chuoi goc phia sau de con tra cuu duoc.
 */
const SMTP_HINTS: { pattern: RegExp; hint: string }[] = [
  {
    pattern: /5\.7\.139|SmtpClientAuthentication is disabled/i,
    hint: 'Microsoft 365 đang tắt SMTP AUTH cho hộp thư này — quản trị viên cần bật "Authenticated SMTP".',
  },
  {
    pattern: /Application-specific password required|InvalidSecondFactor|5\.7\.9\b/i,
    hint: 'Tài khoản bật xác minh 2 bước — hãy dùng Mật khẩu ứng dụng (App Password), không dùng mật khẩu đăng nhập.',
  },
  {
    pattern: /535|Username and Password not accepted|authentication unsuccessful|Invalid login/i,
    hint: 'Sai tên đăng nhập hoặc mật khẩu. Với Gmail / Outlook cần Mật khẩu ứng dụng (App Password).',
  },
  {
    pattern: /SendAsDenied|5\.7\.60|not allowed to send as/i,
    hint: 'Địa chỉ gửi đi phải trùng với tài khoản đăng nhập SMTP (hoặc được cấp quyền Send As).',
  },
];

export function explainSmtpError(detail: string): string {
  const hint = SMTP_HINTS.find((row) => row.pattern.test(detail))?.hint;
  return hint ? `${hint} (${detail})` : detail;
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
export async function sendMail(
  db: Database,
  message: MailMessage
): Promise<{ delivered: boolean }> {
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
    const mail = {
      from: fromAddress(config),
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    };
    if (config.auth_type === 'google') {
      const token = await googleAccessToken(googleClient(config), googleRefreshToken(config));
      await sendViaGmail(token, mail);
    } else {
      await createTransport(config).sendMail(mail);
    }
  } catch (error) {
    /* Loi Google da la HttpError co noi dung tieng Viet — giu nguyen. */
    if (error instanceof HttpError) {
      setEmailLastError(db, error.message);
      throw error;
    }
    const detail = explainSmtpError(error instanceof Error ? error.message : String(error));
    setEmailLastError(db, detail);
    throw new HttpError(502, `Không gửi được email: ${detail}`);
  }

  setEmailLastError(db, null);
  return { delivered: true };
}

/** Kiem tra ket noi ma khong gui thu — dung cho nut "Kiem tra" o Cai dat. */
export async function testEmailConnection(db: Database): Promise<void> {
  const config = row(db);
  if (config.auth_type === 'google') {
    const refreshToken = googleRefreshToken(config);
    if (!refreshToken) throw new HttpError(400, 'Chưa đăng nhập tài khoản Google');
    /* Xin access token moi bang refresh token: hong client, token bi thu hoi
       hay app OAuth het han Testing deu lo ra o day. */
    forgetGoogleAccessToken();
    try {
      await googleAccessToken(googleClient(config), refreshToken);
    } catch (error) {
      if (error instanceof HttpError) setEmailLastError(db, error.message);
      throw error;
    }
    db.prepare(
      `UPDATE email_settings SET last_test_at = datetime('now','localtime'), last_error = NULL WHERE id = 1`
    ).run();
    return;
  }
  if (!config.host.trim()) throw new HttpError(400, 'Chưa khai báo máy chủ SMTP');
  if (!config.from_email.trim()) throw new HttpError(400, 'Chưa khai báo địa chỉ email gửi đi');

  try {
    await createTransport(config).verify();
  } catch (error) {
    const detail = explainSmtpError(error instanceof Error ? error.message : String(error));
    setEmailLastError(db, detail);
    throw new HttpError(502, `Không kết nối được tới máy chủ SMTP: ${detail}`);
  }

  db.prepare(
    `UPDATE email_settings SET last_test_at = datetime('now','localtime'), last_error = NULL WHERE id = 1`
  ).run();
}
