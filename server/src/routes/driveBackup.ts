import crypto from 'node:crypto';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.ts';
import { HttpError, parseBody } from '../lib/validate.ts';
import { crmBaseUrl } from '../lib/requestBaseUrl.ts';
import { requirePermission } from '../middleware/currentUser.ts';
import { getEmailConfig } from '../services/email/emailService.ts';
import { buildGoogleAuthUrl, exchangeGoogleCode } from '../services/email/googleMail.ts';
import { DRIVE_FILE_SCOPE, DRIVE_SCOPES } from '../services/backup/driveApi.ts';
import {
  disconnectDrive,
  driveClientOf,
  getDriveBackupConfig,
  restoreMissingFiles,
  runAndRecordDriveBackup,
  saveDriveConnection,
  setDriveLastError,
  updateDriveBackupConfig,
} from '../services/backup/driveBackup.ts';

const router = Router();

/*
 * Sao luu len Google Drive.
 *
 * Dung chung quyen voi nut "Sao luu ngay" (`data.export`): ai sao luu duoc CSDL ra
 * ngoai thi cung cau hinh duoc noi no se duoc gui di. Dat o router chu khong rai
 * tung route de route them sau nay khong the lot luoi.
 */
router.use(requirePermission('data.export', 'export'));

function redirectUri(req: Request): string {
  return `${crmBaseUrl(db, req)}/api/drive-backup/oauth/callback`;
}

function configResponse(req: Request) {
  return {
    ...getDriveBackupConfig(db),
    google_redirect_uri: redirectUri(req),
    /* Khai bao o muc Email (dung chung cho moi lien ket / redirect URI cua CRM). */
    app_base_url_set: Boolean(getEmailConfig(db).app_base_url),
  };
}

router.get('/config', (req, res) => {
  res.json(configResponse(req));
});

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  interval_hours: z.number().int().min(1).max(720).optional(),
  keep_db_count: z.number().int().min(1).max(365).optional(),
  google_client_id: z.string().trim().max(300).optional(),
  google_client_secret: z.string().max(300).optional(),
  copy_client_from_email: z.boolean().optional(),
});

router.put('/config', (req, res) => {
  const body = parseBody(updateSchema, req);
  updateDriveBackupConfig(db, {
    enabled: body.enabled,
    intervalHours: body.interval_hours,
    keepDbCount: body.keep_db_count,
    googleClientId: body.google_client_id,
    googleClientSecret: body.google_client_secret,
    copyClientFromEmail: body.copy_client_from_email,
  });
  res.json(configResponse(req));
});

/* ---------- Dang nhap Google qua trinh duyet ----------

   Cung khuon voi /api/email/oauth/google: hai GET la DIEU HUONG cua trinh duyet,
   nen loi cung tra ve bang redirect ve man Cai dat chu khong phai JSON. */

function backToSettings(req: Request, params: Record<string, string>): string {
  return `${crmBaseUrl(db, req)}/settings?${new URLSearchParams({ tab: 'data', ...params })}`;
}

router.get('/oauth/start', (req, res, next) => {
  const client = driveClientOf(db);
  if (!client) {
    res.redirect(
      backToSettings(req, { drive_error: 'Hãy nhập và lưu Client ID, Client Secret trước.' })
    );
    return;
  }
  /* `state` gan voi phien, dung mot lan: chan ke tan cong dua `code` cua tai khoan
     Google KHAC vao callback — khi do ban sao luu cua ban se len Drive cua ho. */
  const state = crypto.randomBytes(24).toString('base64url');
  req.session.driveOAuthState = state;
  req.session.save((error) => {
    if (error) {
      next(error);
      return;
    }
    res.redirect(
      buildGoogleAuthUrl({
        clientId: client.clientId,
        redirectUri: redirectUri(req),
        state,
        loginHint: getDriveBackupConfig(db).google_account || undefined,
        scopes: DRIVE_SCOPES,
      })
    );
  });
});

router.get('/oauth/callback', async (req, res) => {
  const expected = req.session.driveOAuthState;
  delete req.session.driveOAuthState;

  const fail = (message: string) =>
    res.redirect(backToSettings(req, { drive_error: message.slice(0, 300) }));

  const { code, state, error } = req.query;
  if (typeof error === 'string') {
    fail(error === 'access_denied' ? 'Bạn đã huỷ đăng nhập Google.' : `Google báo lỗi: ${error}`);
    return;
  }
  if (!expected || typeof state !== 'string' || state !== expected) {
    fail('Phiên đăng nhập Google không hợp lệ hoặc đã hết hạn — hãy bấm đăng nhập lại.');
    return;
  }
  const client = driveClientOf(db);
  if (typeof code !== 'string' || !client) {
    fail('Thiếu mã xác nhận từ Google — hãy bấm đăng nhập lại.');
    return;
  }

  try {
    const connection = await exchangeGoogleCode(client, code, redirectUri(req), {
      scope: DRIVE_FILE_SCOPE,
      missingMessage:
        'Bạn chưa cho phép quyền tạo và sửa tệp trên Google Drive — hãy đăng nhập lại và giữ dấu tick đó.',
    });
    saveDriveConnection(db, connection);
    res.redirect(backToSettings(req, { drive: 'connected' }));
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    setDriveLastError(db, message);
    fail(message);
  }
});

router.post('/disconnect', async (req, res, next) => {
  try {
    if (!getDriveBackupConfig(db).connected) throw new HttpError(400, 'Chưa kết nối Google Drive');
    await disconnectDrive(db);
    res.json(configResponse(req));
  } catch (error) {
    next(error);
  }
});

/* ---------- Chay ----------

   Chay NEN va tra 202: lan dau co the day hang tram tep, lau hon nhieu so voi
   timeout proxy (nginx mac dinh 60 giay). Giao dien hoi lai `running` o /config.
   Ket qua / loi nam trong cau hinh (`last_*`). */

function assertConnected(): void {
  if (!getDriveBackupConfig(db).connected) {
    throw new HttpError(400, 'Chưa đăng nhập tài khoản Google cho sao lưu Drive');
  }
}

router.post('/run', (req, res) => {
  assertConnected();
  if (getDriveBackupConfig(db).running) {
    throw new HttpError(409, 'Đang có một lần sao lưu lên Drive chạy — chờ nó xong.');
  }
  runAndRecordDriveBackup(db).catch((error) =>
    console.error('[drive-backup] Sao luu thu cong that bai:', error)
  );
  res.status(202).json(configResponse(req));
});

router.post('/restore-missing', (req, res) => {
  assertConnected();
  if (getDriveBackupConfig(db).running) {
    throw new HttpError(409, 'Đang có một lần sao lưu lên Drive chạy — chờ nó xong.');
  }
  restoreMissingFiles(db).catch((error) => {
    console.error('[drive-backup] Khoi phuc tep that bai:', error);
    setDriveLastError(db, error instanceof Error ? error.message : 'Lỗi không xác định');
  });
  res.status(202).json(configResponse(req));
});

export default router;
