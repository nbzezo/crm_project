import nodemailer from 'nodemailer';
import { HttpError } from '../../lib/validate.ts';

/*
 * Gui thu bang tai khoan Google da dang nhap qua trinh duyet (OAuth2 + Gmail API).
 *
 * Vi sao Gmail API ma khong phai SMTP + XOAUTH2: SMTP cua Gmail chi chap nhan
 * token co scope `https://mail.google.com/` — toan quyen doc, xoa thu cua tai
 * khoan. Gmail API cho xin rieng `gmail.send`: CRM gui duoc thu va khong lam
 * duoc gi khac. Mot refresh token bi lo ra ngoai khi do chi la "gui thu thay",
 * khong phai "doc het hop thu".
 *
 * Dung `fetch` toan cuc (khong them thu vien googleapis) de test thay duoc bang
 * mot ham gia, va de may chu khong keo theo vai chuc MB phu thuoc chi cho bon
 * lenh goi HTTP.
 */

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
export const GOOGLE_SCOPES = ['openid', 'email', GMAIL_SEND_SCOPE];

export interface GoogleClient {
  clientId: string;
  clientSecret: string;
}

export function buildGoogleAuthUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  loginHint?: string;
}): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    /* `offline` + `consent`: Google chi tra refresh token o lan dong y DAU TIEN.
       Khong ep `consent` thi lan ket noi lai (sau khi ngat) se khong co refresh
       token va CRM khong gui duoc thu nao sau mot gio. */
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: input.state,
  });
  if (input.loginHint) params.set('login_hint', input.loginHint);
  return `${AUTH_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  let response: Response;
  try {
    response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
    });
  } catch (error) {
    throw new HttpError(
      502,
      `Không kết nối được tới Google: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const data = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok || data.error) {
    throw new HttpError(502, explainGoogleError(data.error, data.error_description));
  }
  return data;
}

function explainGoogleError(code?: string, description?: string): string {
  const detail = [code, description].filter(Boolean).join(': ') || 'lỗi không rõ';
  if (code === 'invalid_grant') {
    return (
      'Google đã thu hồi quyền gửi thư (đổi mật khẩu, gỡ quyền ứng dụng, hoặc ứng dụng ' +
      `OAuth còn ở chế độ Testing quá 7 ngày) — hãy đăng nhập Google lại. (${detail})`
    );
  }
  if (code === 'invalid_client' || code === 'unauthorized_client') {
    return `Client ID hoặc Client Secret không đúng. (${detail})`;
  }
  if (code === 'redirect_uri_mismatch') {
    return `Redirect URI chưa được khai báo trong Google Cloud Console. (${detail})`;
  }
  return `Google từ chối yêu cầu: ${detail}`;
}

/** Doi `code` tu trang dong y lay refresh token, va dia chi Gmail vua dang nhap. */
export async function exchangeGoogleCode(
  client: GoogleClient,
  code: string,
  redirectUri: string
): Promise<{ refreshToken: string; account: string }> {
  const token = await postToken({
    code,
    client_id: client.clientId,
    client_secret: client.clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  /* Man dong y cua Google cho bo tick tung quyen. Thieu `gmail.send` thi ket
     noi "thanh cong" ma khong gui duoc thu nao — bao ngay luc nay thay vi luc
     nguoi dung moi dau tien khong nhan duoc thu moi. */
  if (!token.scope?.split(' ').includes(GMAIL_SEND_SCOPE)) {
    throw new HttpError(
      400,
      'Bạn chưa cho phép quyền "Gửi email thay bạn" — hãy đăng nhập lại và giữ dấu tick đó.'
    );
  }
  if (!token.refresh_token || !token.access_token) {
    throw new HttpError(502, 'Google không trả về refresh token — hãy đăng nhập lại.');
  }

  const response = await fetch(USERINFO_URL, {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  const profile = (await response.json().catch(() => ({}))) as {
    email?: string;
    email_verified?: boolean;
  };
  if (!response.ok || !profile.email) {
    throw new HttpError(502, 'Không đọc được địa chỉ Gmail của tài khoản vừa đăng nhập.');
  }

  rememberAccessToken(token.refresh_token, token.access_token, token.expires_in);
  return { refreshToken: token.refresh_token, account: profile.email };
}

/* Access token song mot gio. Nho lai trong bo nho de mot dot gui nhieu thu moi
   khong goi Google xin token cho tung thu; khoa theo refresh token nen ket noi
   lai bang tai khoan khac la tu bo token cu. */
let cached: { refreshToken: string; accessToken: string; expiresAt: number } | null = null;

function rememberAccessToken(refreshToken: string, accessToken: string, expiresIn = 3600): void {
  cached = { refreshToken, accessToken, expiresAt: Date.now() + (expiresIn - 60) * 1000 };
}

export function forgetGoogleAccessToken(): void {
  cached = null;
}

export async function googleAccessToken(
  client: GoogleClient,
  refreshToken: string
): Promise<string> {
  if (cached && cached.refreshToken === refreshToken && cached.expiresAt > Date.now()) {
    return cached.accessToken;
  }
  const token = await postToken({
    client_id: client.clientId,
    client_secret: client.clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  if (!token.access_token) throw new HttpError(502, 'Google không trả về access token.');
  rememberAccessToken(refreshToken, token.access_token, token.expires_in);
  return token.access_token;
}

export interface GmailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Dung thu RFC 822 bang chinh nodemailer (dau, ma hoa tieu de tieng Viet) roi day qua Gmail API. */
export async function sendViaGmail(accessToken: string, message: GmailMessage): Promise<void> {
  const built = await nodemailer
    .createTransport({ streamTransport: true, buffer: true, newline: 'unix' })
    .sendMail(message);
  const raw = Buffer.from(built.message as Buffer).toString('base64url');

  let response: Response;
  try {
    response = await fetch(SEND_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ raw }),
    });
  } catch (error) {
    throw new HttpError(
      502,
      `Không kết nối được tới Gmail: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; status?: string };
    };
    const detail = data.error?.message ?? `HTTP ${response.status}`;
    if (response.status === 403 && /has not been used|is disabled/i.test(detail)) {
      throw new HttpError(
        502,
        `Gmail API chưa được bật trong Google Cloud project — bật "Gmail API" rồi thử lại. (${detail})`
      );
    }
    throw new HttpError(502, `Gmail từ chối gửi thư: ${detail}`);
  }
}

/** Thu hoi token phia Google khi ngat ket noi. Loi o day khong chan viec ngat. */
export async function revokeGoogleToken(token: string): Promise<void> {
  try {
    await fetch(REVOKE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }).toString(),
    });
  } catch {
    /* Token van con hieu luc phia Google; nguoi dung go duoc o myaccount.google.com. */
  }
}
