import path from 'node:path';
import fs from 'node:fs';
import type { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { db, FILES_DIR } from '../db/connection.ts';
import { createLimiter } from '../lib/rateLimit.ts';
import { HttpError, intParam, parseBody } from '../lib/validate.ts';
import {
  buildPayload,
  hashToken,
  isPreviewableMime,
  isPublicSharingEnabled,
  linkStatus,
  signAccess,
  verifyAccess,
  verifyPassword,
  type ShareLinkRow,
} from '../services/shareService.ts';

/*
 * Phuc vu lien ket chia se CONG KHAI — khong dang nhap.
 *
 * Mount TRUOC requireAuth (xem app.ts). Moi duong o day tu bao ve:
 * - token 256 bit khong doan duoc, tra 404/410 nhu nhau cho moi truong hop sai;
 * - gioi han toc do theo IP, va rieng cho viec thu mat khau;
 * - chi tra ra cac truong trong `buildPayload`, khong bao gio ban ghi tho;
 * - khong cho cache/chi muc/ro ri Referer (token nam trong URL).
 */

const router = Router();

const pageLimiter = createLimiter(120, 60_000);
const unlockLimiter = createLimiter(8, 15 * 60_000);
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const DEDUPE_MINUTES = 10;

router.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (!pageLimiter.hit(req.ip ?? 'unknown')) {
    res.status(429).json({ error: 'Quá nhiều yêu cầu, vui lòng thử lại sau ít phút' });
    return;
  }
  next();
});

function loadLink(req: Request): ShareLinkRow {
  const token = String(req.params.token ?? '');
  if (!TOKEN_RE.test(token)) throw new HttpError(404, 'Liên kết không tồn tại');
  const link = db
    .prepare(`SELECT * FROM share_links WHERE token_hash = ?`)
    .get(hashToken(token)) as ShareLinkRow | undefined;
  if (!link) throw new HttpError(404, 'Liên kết không tồn tại');
  if (!isPublicSharingEnabled(db)) {
    throw new HttpError(410, 'Quản trị viên đã tạm tắt chia sẻ bằng liên kết', {
      code: 'disabled',
    });
  }
  const status = linkStatus(db, link);
  if (status === 'revoked') {
    throw new HttpError(410, 'Liên kết này đã bị thu hồi', { code: 'revoked' });
  }
  if (status === 'expired') {
    throw new HttpError(410, 'Liên kết này đã hết hạn', { code: 'expired' });
  }
  return link;
}

function accessCode(req: Request): unknown {
  return req.get('x-share-access') ?? req.query.a;
}

/** Link co mat khau ma chua mo khoa: nem 401 de client hien o nhap mat khau. */
function assertUnlocked(link: ShareLinkRow, req: Request): void {
  if (link.password_hash && !verifyAccess(link, accessCode(req))) {
    throw new HttpError(401, 'Cần nhập mật khẩu', { code: 'password_required' });
  }
}

function recordView(link: ShareLinkRow, req: Request, action: 'view' | 'download'): void {
  const ip = req.ip ?? '';
  if (action === 'view') {
    const recent = db
      .prepare(
        `SELECT 1 FROM share_link_views
          WHERE link_id = ? AND ip = ? AND action = 'view'
            AND viewed_at > datetime('now','localtime', ?)`
      )
      .get(link.id, ip, `-${DEDUPE_MINUTES} minutes`);
    if (recent) return;
  }
  db.transaction(() => {
    db.prepare(`INSERT INTO share_link_views (link_id, ip, user_agent, action) VALUES (?, ?, ?, ?)`).run(
      link.id,
      ip.slice(0, 64),
      String(req.get('user-agent') ?? '').slice(0, 300),
      action
    );
    if (action === 'view') {
      db.prepare(
        `UPDATE share_links SET view_count = view_count + 1, last_viewed_at = datetime('now','localtime') WHERE id = ?`
      ).run(link.id);
    }
  })();
  /* Lan mo DAU TIEN: tao nhac viec theo doi gan voi khach hang / co hoi (neu duoc yeu cau). */
  if (action === 'view' && link.notify_on_view === 1 && link.view_count === 0) {
    const entity = db
      .prepare(
        link.entity_type === 'document'
          ? `SELECT customer_id, deal_id FROM documents WHERE id = ?`
          : link.entity_type === 'quotation'
            ? `SELECT customer_id, deal_id FROM quotations WHERE id = ?`
            : `SELECT customer_id, deal_id FROM contracts WHERE id = ?`
      )
      .get(link.entity_id) as { customer_id: number | null; deal_id: number | null } | undefined;
    db.prepare(
      `INSERT INTO reminders (title, note, due_at, customer_id, deal_id)
       VALUES (?, ?, strftime('%Y-%m-%dT%H:%M','now','localtime'), ?, ?)`
    ).run(
      `Khách vừa mở liên kết: ${link.title}`.slice(0, 200),
      `Liên kết do ${link.created_by_name} chia sẻ vừa được mở lần đầu. Đây là lúc nên theo dõi.`,
      entity?.customer_id ?? null,
      entity?.deal_id ?? null
    );
  }
}

router.get('/:token', (req, res) => {
  const link = loadLink(req);
  if (link.password_hash && !verifyAccess(link, accessCode(req))) {
    res.json({
      requires_password: true,
      type: link.entity_type,
      shared_by: link.created_by_name,
    });
    return;
  }
  const payload = buildPayload(db, link);
  if (!payload) throw new HttpError(404, 'Nội dung này không còn tồn tại');
  recordView(link, req, 'view');
  res.json({ requires_password: false, ...payload });
});

router.post('/:token/unlock', (req, res) => {
  const link = loadLink(req);
  if (!link.password_hash || !link.password_salt) {
    res.json({ access: null });
    return;
  }
  const key = `${req.ip}:${link.id}`;
  if (unlockLimiter.blocked(key)) {
    throw new HttpError(429, 'Nhập sai quá nhiều lần, vui lòng thử lại sau 15 phút');
  }
  const body = parseBody(z.object({ password: z.string().max(200) }), req);
  if (!verifyPassword(body.password, link.password_salt, link.password_hash)) {
    unlockLimiter.fail(key);
    throw new HttpError(401, 'Mật khẩu không đúng', { code: 'wrong_password' });
  }
  unlockLimiter.reset(key);
  res.json({ access: signAccess(link) });
});

router.get('/:token/file/:fileId', (req, res) => {
  const link = loadLink(req);
  assertUnlocked(link, req);
  const payload = buildPayload(db, link);
  if (!payload) throw new HttpError(404, 'Nội dung này không còn tồn tại');
  const fileId = intParam(req.params.fileId as string, 'fileId');
  /* Chi tep nam trong danh sach da chia se — khong cho do id tai lieu khac. */
  const shared = payload.files.find((f) => f.id === fileId);
  if (!shared) throw new HttpError(404, 'Không tìm thấy tệp');
  const download = req.query.download === '1';
  if (download && !payload.allow_download) {
    throw new HttpError(403, 'Liên kết này chỉ cho phép xem, không cho tải về');
  }
  if (!payload.allow_download && !isPreviewableMime(shared.mime)) {
    throw new HttpError(403, 'Loại tệp này không xem trực tiếp được; liên kết không cho tải về');
  }
  const row = db
    .prepare(`SELECT stored_name FROM documents WHERE id = ? AND deleted_at IS NULL`)
    .get(fileId) as { stored_name: string } | undefined;
  if (!row) throw new HttpError(404, 'Không tìm thấy tệp');
  const filePath = path.join(FILES_DIR, row.stored_name);
  if (!fs.existsSync(filePath)) throw new HttpError(404, 'Tệp không còn trên ổ đĩa');

  if (download) recordView(link, req, 'download');
  res.type(shared.mime);
  if (!shared.mime.startsWith('application/pdf')) {
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  }
  if (download) {
    res.download(filePath, shared.file_name);
    return;
  }
  res.setHeader(
    'Content-Disposition',
    `inline; filename*=UTF-8''${encodeURIComponent(shared.file_name)}`
  );
  res.sendFile(filePath);
});

export default router;
