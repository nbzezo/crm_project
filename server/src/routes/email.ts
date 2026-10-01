import crypto from 'node:crypto';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.ts';
import { HttpError, parseBody } from '../lib/validate.ts';
import { requirePermission } from '../middleware/currentUser.ts';
import { buildGoogleAuthUrl, exchangeGoogleCode } from '../services/email/googleMail.ts';
import {
  appBaseUrl,
  disconnectGoogle,
  getEmailConfig,
  googleClientOf,
  saveGoogleConnection,
  sendMail,
  setEmailLastError,
  testEmailConnection,
  updateEmailConfig,
} from '../services/email/emailService.ts';

const router = Router();

/* Cung khuon voi routes/telegram.ts: GET/PUT /config, POST /test. Mat khau SMTP
   di vao mot chieu — doc ra chi con co `has_password`. */

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  host: z.string().trim().max(200).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  secure: z.boolean().optional(),
  username: z.string().trim().max(200).optional(),
  password: z.string().max(400).optional(),
  clear_password: z.boolean().optional(),
  from_name: z.string().trim().max(120).optional(),
  from_email: z.string().trim().max(200).optional(),
  app_base_url: z.string().trim().max(300).optional(),
  auth_type: z.enum(['password', 'google']).optional(),
  google_client_id: z.string().trim().max(300).optional(),
  google_client_secret: z.string().max(300).optional(),
});

/*
 * Goc URL cua CRM va redirect URI cho Google.
 *
 * Phai trung TUNG KY TU voi dong da khai bao o Google Cloud Console, nen may chu
 * tu tinh va tra ve cho man Cai dat hien ra de sao chep — khong de nguoi dung
 * tu go. Dung `app_base_url` neu co (dung sau proxy), khong thi suy tu request.
 */
function crmBaseUrl(req: Request): string {
  const host = req.get('host');
  return appBaseUrl(db, host ? `${req.protocol}://${host}` : undefined);
}

function googleRedirectUri(req: Request): string {
  return `${crmBaseUrl(req)}/api/email/oauth/google/callback`;
}

function configResponse(req: Request) {
  return { ...getEmailConfig(db), google_redirect_uri: googleRedirectUri(req) };
}

router.get('/config', (req, res) => {
  res.json(configResponse(req));
});

/*
 * `app_base_url` la dia chi web cua CRM — goc cua lien ket trong thu moi va cua
 * redirect URI Google. Nham no voi dia chi hop thu (mail.google.com, ...) lam
 * moi lien ket kich hoat tro vao trang cua Google va khong ai vao duoc. Chan
 * dung truong hop da gap that thay vi doan moi URL "sai".
 */
const MAILBOX_HOSTS =
  /(^|\.)(mail\.google\.com|gmail\.com|outlook\.(com|live\.com|office\.com|office365\.com)|hotmail\.com|live\.com)$/i;

function assertCrmBaseUrl(value: string | undefined): void {
  if (!value) return;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new HttpError(
      400,
      'Địa chỉ web của CRM phải là một URL đầy đủ, ví dụ https://crm.congty.vn'
    );
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new HttpError(400, 'Địa chỉ web của CRM phải bắt đầu bằng http:// hoặc https://');
  }
  if (MAILBOX_HOSTS.test(url.hostname)) {
    throw new HttpError(
      400,
      `${url.hostname} là địa chỉ hộp thư, không phải địa chỉ CRM. Nhập địa chỉ bạn đang mở CRM (ví dụ https://crm.congty.vn) hoặc để trống.`
    );
  }
}

router.put('/config', (req, res) => {
  const body = parseBody(updateSchema, req);
  assertCrmBaseUrl(body.app_base_url);
  updateEmailConfig(db, {
    enabled: body.enabled,
    host: body.host,
    port: body.port,
    secure: body.secure,
    username: body.username,
    password: body.password,
    clearPassword: body.clear_password,
    fromName: body.from_name,
    fromEmail: body.from_email,
    appBaseUrl: body.app_base_url,
    authType: body.auth_type,
    googleClientId: body.google_client_id,
    googleClientSecret: body.google_client_secret,
  });
  res.json(configResponse(req));
});

router.post('/test', async (req, res, next) => {
  try {
    await testEmailConnection(db);
    res.json(configResponse(req));
  } catch (error) {
    next(error);
  }
});

const sendTestSchema = z.object({ to: z.string().email().max(200) });

/** Gui mot thu that toi dia chi do nguoi dung chon — `verify()` khong bat duoc loi tu choi nguoi nhan. */
router.post('/send-test', async (req, res, next) => {
  try {
    const { to } = parseBody(sendTestSchema, req);
    await sendMail(db, {
      to,
      subject: 'WorkFlow — thư kiểm tra cấu hình email',
      text:
        'Đây là thư kiểm tra do WorkFlow gửi.\n\n' +
        'Nhận được thư này nghĩa là cấu hình SMTP đã hoạt động: hệ thống gửi được ' +
        'thư mời tài khoản và liên kết đặt lại mật khẩu.\n',
    });
    setEmailLastError(db, null);
    res.json(configResponse(req));
  } catch (error) {
    next(error);
  }
});

/* ---------- Dang nhap Google qua trinh duyet ----------

   Hai route GET la DIEU HUONG cua trinh duyet (bam nut -> Google -> quay ve), khong
   phai fetch — nen chung tra redirect, ke ca khi loi: quay ve man Cai dat kem
   thong bao, khong de nguoi dung dung o mot trang JSON. GET mac dinh chi can
   `read`; o day doi `update` vi ket qua la thay doi cau hinh gui thu. */

const requireEmailUpdate = requirePermission('settings.email', 'update');

function backToSettings(req: Request, params: Record<string, string>): string {
  return `${crmBaseUrl(req)}/settings?${new URLSearchParams({ tab: 'email', ...params })}`;
}

router.get('/oauth/google/start', requireEmailUpdate, (req, res, next) => {
  const client = googleClientOf(db);
  if (!client) {
    res.redirect(
      backToSettings(req, { google_error: 'Hãy nhập và lưu Client ID, Client Secret trước.' })
    );
    return;
  }
  /* `state` gan voi phien: chan ke tan cong dua mot `code` cua tai khoan Google
     KHAC vao callback (CSRF dang nhap) — khi do moi thu moi se gui tu hop thu
     cua ke do. */
  const state = crypto.randomBytes(24).toString('base64url');
  req.session.googleOAuthState = state;
  req.session.save((error) => {
    if (error) {
      next(error);
      return;
    }
    res.redirect(
      buildGoogleAuthUrl({
        clientId: client.clientId,
        redirectUri: googleRedirectUri(req),
        state,
        loginHint: getEmailConfig(db).google_account || undefined,
      })
    );
  });
});

router.get('/oauth/google/callback', requireEmailUpdate, async (req, res) => {
  const expected = req.session.googleOAuthState;
  delete req.session.googleOAuthState;

  const fail = (message: string) =>
    res.redirect(backToSettings(req, { google_error: message.slice(0, 300) }));

  const { code, state, error } = req.query;
  if (typeof error === 'string') {
    fail(error === 'access_denied' ? 'Bạn đã huỷ đăng nhập Google.' : `Google báo lỗi: ${error}`);
    return;
  }
  if (!expected || typeof state !== 'string' || state !== expected) {
    fail('Phiên đăng nhập Google không hợp lệ hoặc đã hết hạn — hãy bấm đăng nhập lại.');
    return;
  }
  const client = googleClientOf(db);
  if (typeof code !== 'string' || !client) {
    fail('Thiếu mã xác nhận từ Google — hãy bấm đăng nhập lại.');
    return;
  }

  try {
    const connection = await exchangeGoogleCode(client, code, googleRedirectUri(req));
    saveGoogleConnection(db, connection);
    res.redirect(backToSettings(req, { google: 'connected' }));
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    setEmailLastError(db, message);
    fail(message);
  }
});

router.post('/oauth/google/disconnect', requireEmailUpdate, async (req, res, next) => {
  try {
    if (!getEmailConfig(db).google_account) throw new HttpError(400, 'Chưa kết nối Google');
    await disconnectGoogle(db);
    res.json(configResponse(req));
  } catch (error) {
    next(error);
  }
});

export default router;
