import fs from 'node:fs';
import { Readable } from 'node:stream';
import { HttpError } from '../../lib/validate.ts';

/*
 * Lop mong quanh Google Drive REST v3 — chi nhung lenh sao luu can.
 *
 * Dung `fetch` toan cuc (khong them `googleapis`, vai chuc MB phu thuoc cho bay
 * lenh HTTP) de test thay duoc bang mot Drive gia.
 *
 * Voi quyen `drive.file`, `files.list` chi tra ve tep/thu muc CRM tu tao ra, nen
 * viec liet ke trong thu muc sao luu khong bao gio lo ra phan con lai cua Drive.
 */

const FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const DRIVE_SCOPES = ['openid', 'email', DRIVE_FILE_SCOPE];

const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** Doi giua cac lan thu lai khi Google tra 429/5xx. Test dat ve 0 de khong cho. */
export const driveRetry = { attempts: 3, baseDelayMs: 1000 };

export interface DriveFile {
  id: string;
  name: string;
  size?: string;
  createdTime?: string;
}

interface GoogleErrorBody {
  error?: { message?: string; errors?: { reason?: string }[]; status?: string };
}

/** Doi loi Drive thanh cau tieng Viet noi ro viec can lam. */
export async function driveError(response: Response, action: string): Promise<HttpError> {
  const body = (await response.json().catch(() => ({}))) as GoogleErrorBody;
  const message = body.error?.message ?? `HTTP ${response.status}`;
  const reason = body.error?.errors?.[0]?.reason ?? '';

  if (response.status === 401) {
    return new HttpError(
      502,
      `Google từ chối quyền truy cập Drive — hãy đăng nhập Google lại. (${message})`
    );
  }
  if (response.status === 403 && /storageQuotaExceeded/i.test(reason)) {
    return new HttpError(
      502,
      `Google Drive đã đầy dung lượng — dọn bớt hoặc mua thêm dung lượng. (${message})`
    );
  }
  if (
    response.status === 403 &&
    /has not been used|is disabled|accessNotConfigured/i.test(message)
  ) {
    return new HttpError(
      502,
      `Google Drive API chưa được bật trong Google Cloud project — bật "Google Drive API" rồi thử lại. (${message})`
    );
  }
  if (response.status === 403 && /rateLimit|userRateLimit/i.test(reason)) {
    return new HttpError(502, `Google giới hạn tốc độ — sẽ thử lại ở lần sau. (${message})`);
  }
  return new HttpError(502, `Google Drive từ chối ${action}: ${message}`);
}

function transient(status: number): boolean {
  return status === 429 || status >= 500;
}

async function sleep(ms: number): Promise<void> {
  if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));
}

/** fetch co thu lai cho loi tam thoi cua Google (429 / 5xx) va loi mang. */
async function fetchWithRetry(make: () => Promise<Response>, action: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= driveRetry.attempts; attempt++) {
    try {
      const response = await make();
      if (!transient(response.status) || attempt === driveRetry.attempts) return response;
      await response.body?.cancel();
    } catch (error) {
      lastError = error;
      if (attempt === driveRetry.attempts) break;
    }
    await sleep(driveRetry.baseDelayMs * 2 ** (attempt - 1));
  }
  throw new HttpError(
    502,
    `Không kết nối được tới Google Drive (${action}): ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

const json = (token: string) => ({
  authorization: `Bearer ${token}`,
  'content-type': 'application/json; charset=UTF-8',
});

export async function createFolder(
  token: string,
  name: string,
  parentId?: string
): Promise<string> {
  const response = await fetchWithRetry(
    () =>
      fetch(`${FILES_URL}?fields=id`, {
        method: 'POST',
        headers: json(token),
        body: JSON.stringify({
          name,
          mimeType: FOLDER_MIME,
          ...(parentId ? { parents: [parentId] } : {}),
        }),
      }),
    'tạo thư mục'
  );
  if (!response.ok) throw await driveError(response, 'tạo thư mục');
  return ((await response.json()) as { id: string }).id;
}

/** Thu muc con ton tai va chua vao thung rac? Xoa tay tren Drive la chuyen thuong. */
export async function folderUsable(token: string, folderId: string): Promise<boolean> {
  const response = await fetchWithRetry(
    () =>
      fetch(`${FILES_URL}/${encodeURIComponent(folderId)}?fields=id,trashed`, {
        headers: { authorization: `Bearer ${token}` },
      }),
    'kiểm tra thư mục'
  );
  if (response.status === 404) return false;
  if (!response.ok) throw await driveError(response, 'kiểm tra thư mục');
  return !((await response.json()) as { trashed?: boolean }).trashed;
}

/**
 * Tai len mot tep theo giao thuc "resumable" cua Drive (2 buoc: mo phien, roi PUT
 * noi dung). Doc tu dia theo luong — ban sao CSDL co the lon hon bo nho de dem.
 */
export async function uploadFile(
  token: string,
  input: {
    filePath: string;
    name: string;
    parentId: string;
    mime?: string;
    description?: string;
  }
): Promise<DriveFile> {
  const size = fs.statSync(input.filePath).size;
  const mime = input.mime ?? 'application/octet-stream';
  const metadata = JSON.stringify({
    name: input.name,
    parents: [input.parentId],
    ...(input.description ? { description: input.description } : {}),
  });

  /* Tep rong: giao thuc resumable khong nhan phan than 0 byte. Tao tep chi voi
     metadata la du. */
  if (size === 0) {
    const response = await fetchWithRetry(
      () =>
        fetch(`${FILES_URL}?fields=id,name,size`, {
          method: 'POST',
          headers: json(token),
          body: metadata,
        }),
      'tải tệp lên'
    );
    if (!response.ok) throw await driveError(response, 'tải tệp lên');
    return (await response.json()) as DriveFile;
  }

  /* Ca hai buoc nam trong mot lan thu: URL phien het han cung phai xin lai. */
  const response = await fetchWithRetry(async () => {
    const session = await fetch(`${UPLOAD_URL}?uploadType=resumable&fields=id,name,size`, {
      method: 'POST',
      headers: {
        ...json(token),
        'x-upload-content-type': mime,
        'x-upload-content-length': String(size),
      },
      body: metadata,
    });
    if (!session.ok) return session;
    const location = session.headers.get('location');
    if (!location) throw new Error('Google không trả về địa chỉ tải lên');
    return fetch(location, {
      method: 'PUT',
      headers: { 'content-type': mime, 'content-length': String(size) },
      body: Readable.toWeb(fs.createReadStream(input.filePath)) as unknown as ReadableStream,
      duplex: 'half',
    } as RequestInit);
  }, 'tải tệp lên');
  if (!response.ok) throw await driveError(response, 'tải tệp lên');
  return (await response.json()) as DriveFile;
}

/** Liet ke moi tep trong mot thu muc, moi nhat truoc. */
export async function listFolder(token: string, folderId: string): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      orderBy: 'createdTime desc',
      pageSize: '1000',
      fields: 'nextPageToken,files(id,name,size,createdTime)',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const response = await fetchWithRetry(
      () => fetch(`${FILES_URL}?${params}`, { headers: { authorization: `Bearer ${token}` } }),
      'liệt kê thư mục'
    );
    if (!response.ok) throw await driveError(response, 'liệt kê thư mục');
    const page = (await response.json()) as { files?: DriveFile[]; nextPageToken?: string };
    out.push(...(page.files ?? []));
    pageToken = page.nextPageToken ?? '';
  } while (pageToken);
  return out;
}

export async function deleteFile(token: string, fileId: string): Promise<void> {
  const response = await fetchWithRetry(
    () =>
      fetch(`${FILES_URL}/${encodeURIComponent(fileId)}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      }),
    'xoá tệp'
  );
  /* 404: da bi xoa tay roi — dung muc dich. */
  if (!response.ok && response.status !== 404) throw await driveError(response, 'xoá tệp');
}

/** Tai noi dung mot tep ve dia, ghi ra tep tam roi doi ten (khong de lai tep nua chung). */
export async function downloadFile(
  token: string,
  fileId: string,
  destination: string
): Promise<void> {
  const response = await fetchWithRetry(
    () =>
      fetch(`${FILES_URL}/${encodeURIComponent(fileId)}?alt=media`, {
        headers: { authorization: `Bearer ${token}` },
      }),
    'tải tệp về'
  );
  if (!response.ok) throw await driveError(response, 'tải tệp về');
  const partial = `${destination}.part`;
  try {
    fs.writeFileSync(partial, Buffer.from(await response.arrayBuffer()));
    fs.renameSync(partial, destination);
  } catch (error) {
    fs.rmSync(partial, { force: true });
    throw error;
  }
}
