import type { Request } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.ts';
import { accessOf } from '../middleware/currentUser.ts';
import { crmBaseUrl } from '../lib/requestBaseUrl.ts';
import { assertInScope } from '../lib/scope.ts';
import { HttpError, intParam, parseBody, required } from '../lib/validate.ts';
import {
  SHARE_ENTITY_TYPES,
  SHARE_RESOURCE,
  generateToken,
  hashPassword,
  hashToken,
  isPublicSharingEnabled,
  linkStatus,
  loadEntity,
  makeSnapshot,
  type ShareEntityType,
  type ShareLinkRow,
} from '../services/shareService.ts';

/*
 * Quan ly lien ket chia se (can dang nhap). Phan phuc vu cong khai nam o
 * routes/publicShare.ts va duoc mount TRUOC requireAuth.
 *
 * Quyen tao link: phai co quyen SUA tren loai ban ghi (documents/quotations/
 * contracts:update) VA ban ghi nam trong pham vi du lieu cua nguoi do — tuc
 * nguoi phu trach hoac cap tren cua ho. Link cong khai la cach DUY NHAT dua du
 * lieu ra ngoai ma khong qua tai khoan, nen khong de bat ky ai co quyen xem la
 * tao duoc.
 */

const router = Router();

/** So ngay giu nhat ky luot mo (IP, trinh duyet cua nguoi nhan). */
const VIEW_RETENTION_DAYS = 180;

const createSchema = z.object({
  entity_type: z.enum(SHARE_ENTITY_TYPES),
  entity_id: z.number().int().positive(),
  /** null = khong het han. */
  expires_in_days: z.union([z.literal(1), z.literal(7), z.literal(30), z.null()]).default(7),
  password: z.string().min(4).max(100).optional(),
  allow_download: z.boolean().default(true),
  lock_version: z.boolean().optional(),
  notify_on_view: z.boolean().default(false),
});

function userName(req: Request): string {
  const userId = req.session?.userId;
  if (!userId) return 'Hệ thống';
  const row = db.prepare(`SELECT full_name, username FROM users WHERE id = ?`).get(userId) as
    | { full_name: string | null; username: string }
    | undefined;
  return row?.full_name || row?.username || 'Hệ thống';
}

function serialize(link: ShareLinkRow) {
  return {
    id: link.id,
    entity_type: link.entity_type,
    entity_id: link.entity_id,
    title: link.title,
    token_hint: link.token_hint,
    created_by_name: link.created_by_name,
    created_at: link.created_at,
    expires_at: link.expires_at,
    has_password: Boolean(link.password_hash),
    allow_download: link.allow_download === 1,
    locked_version: Boolean(link.snapshot_json),
    notify_on_view: link.notify_on_view === 1,
    status: linkStatus(db, link),
    view_count: link.view_count,
    last_viewed_at: link.last_viewed_at,
  };
}

/** Kiem quyen tren ban ghi duoc chia se; tra ve thong tin cua no. */
function assertEntityAccess(
  req: Request,
  type: ShareEntityType,
  id: number,
  action: 'read' | 'update'
) {
  const resource = SHARE_RESOURCE[type];
  if (!accessOf(req).can(resource, action)) {
    throw new HttpError(403, 'Bạn không có quyền dùng chức năng này');
  }
  const info = required(loadEntity(db, type, id), 'Không tìm thấy bản ghi cần chia sẻ');
  /* Tai lieu va Trang tai lieu khong nam trong pham vi du lieu (cac route cua chung
     cung chi chan theo tinh nang) nen o day cung chi kiem quyen tinh nang; bao gia
     va hop dong thi kiem ca pham vi. */
  if (type !== 'document' && type !== 'page') {
    assertInScope(req, resource, action, info.ownerContactId, 'Không tìm thấy bản ghi cần chia sẻ');
  }
  return info;
}

function canManageAll(req: Request): boolean {
  return accessOf(req).can('settings.app', 'update');
}

/* ---------- Cau hinh chung ---------- */

router.get('/settings', (_req, res) => {
  res.json({ public_enabled: isPublicSharingEnabled(db) });
});

router.put('/settings', (req, res) => {
  if (!canManageAll(req)) throw new HttpError(403, 'Bạn không có quyền dùng chức năng này');
  const body = parseBody(z.object({ public_enabled: z.boolean() }), req);
  db.prepare(
    `INSERT INTO app_settings (key, value) VALUES ('sharing.public_enabled', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now','localtime')`
  ).run(body.public_enabled ? '1' : '0');
  res.json({ public_enabled: body.public_enabled });
});

/* ---------- Danh sach ---------- */

router.get('/', (req, res) => {
  const type = req.query.entity_type ? String(req.query.entity_type) : '';
  if (type) {
    if (!(SHARE_ENTITY_TYPES as readonly string[]).includes(type)) {
      throw new HttpError(400, 'Loại bản ghi không hợp lệ');
    }
    const id = intParam(String(req.query.entity_id ?? ''), 'entity_id');
    assertEntityAccess(req, type as ShareEntityType, id, 'read');
    const rows = db
      .prepare(
        `SELECT * FROM share_links WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC, id DESC`
      )
      .all(type, id) as ShareLinkRow[];
    res.json(rows.map(serialize));
    return;
  }

  const userId = req.session?.userId ?? null;
  const all = req.query.all === '1' && canManageAll(req);
  const rows = (
    all
      ? db.prepare(`SELECT * FROM share_links ORDER BY created_at DESC, id DESC LIMIT 500`).all()
      : db
          .prepare(
            `SELECT * FROM share_links WHERE created_by_user_id IS ? ORDER BY created_at DESC, id DESC LIMIT 500`
          )
          .all(userId)
  ) as ShareLinkRow[];
  res.json(rows.map(serialize));
});

/* ---------- Tao ---------- */

router.post('/', (req, res) => {
  if (!isPublicSharingEnabled(db)) {
    throw new HttpError(403, 'Quản trị viên đã tắt chia sẻ bằng liên kết công khai', {
      code: 'SHARING_DISABLED',
    });
  }
  const body = parseBody(createSchema, req);
  const info = assertEntityAccess(req, body.entity_type, body.entity_id, 'update');
  if (info.blockedReason) throw new HttpError(422, info.blockedReason, { code: 'SHARE_BLOCKED' });

  /* Bao gia mac dinh dong bang: khach khong thay con so doi sau khi da gui. */
  const lock = body.lock_version ?? body.entity_type === 'quotation';
  const token = generateToken();
  const pw = body.password ? hashPassword(body.password) : null;
  const expires =
    body.expires_in_days === null
      ? null
      : (
          db
            .prepare(`SELECT datetime('now','localtime', ?) AS at`)
            .get(`+${body.expires_in_days} days`) as { at: string }
        ).at;

  /* Nhat ky luot mo luu IP cua nguoi ngoai: chi giu VIEW_RETENTION_DAYS ngay. Don khi co
     nguoi tao link moi — khong can tac vu nen rieng. */
  db.prepare(`DELETE FROM share_link_views WHERE viewed_at < datetime('now','localtime', ?)`).run(
    `-${VIEW_RETENTION_DAYS} days`
  );

  const result = db
    .prepare(
      `INSERT INTO share_links
         (token_hash, token_hint, entity_type, entity_id, title, created_by_user_id, created_by_name,
          expires_at, password_salt, password_hash, allow_download, notify_on_view, snapshot_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      hashToken(token),
      token.slice(-6),
      body.entity_type,
      body.entity_id,
      info.title,
      req.session?.userId ?? null,
      userName(req),
      expires,
      pw?.salt ?? null,
      pw?.hash ?? null,
      body.allow_download ? 1 : 0,
      body.notify_on_view ? 1 : 0,
      lock ? makeSnapshot(info) : null
    );
  const link = db
    .prepare(`SELECT * FROM share_links WHERE id = ?`)
    .get(Number(result.lastInsertRowid)) as ShareLinkRow;
  /* Token chi tra ve o day, mot lan duy nhat. */
  res.status(201).json({
    ...serialize(link),
    token,
    url: `${crmBaseUrl(db, req)}/s/${token}`,
  });
});

/* ---------- Thu hoi & nhat ky ---------- */

function loadManagedLink(req: Request): ShareLinkRow {
  const id = intParam(req.params.id as string);
  const link = required(
    db.prepare(`SELECT * FROM share_links WHERE id = ?`).get(id) as ShareLinkRow | undefined,
    'Không tìm thấy liên kết chia sẻ'
  );
  const mine = link.created_by_user_id !== null && link.created_by_user_id === req.session?.userId;
  /* Khi tat xac thuc (test) khong co phien: cho phep, giong cac router khac. */
  const noSession = req.session?.userId === undefined;
  if (!mine && !noSession && !canManageAll(req)) {
    throw new HttpError(404, 'Không tìm thấy liên kết chia sẻ');
  }
  return link;
}

router.post('/:id/revoke', (req, res) => {
  const link = loadManagedLink(req);
  db.prepare(
    `UPDATE share_links SET revoked_at = COALESCE(revoked_at, datetime('now','localtime')) WHERE id = ?`
  ).run(link.id);
  res.json(serialize(db.prepare(`SELECT * FROM share_links WHERE id = ?`).get(link.id) as ShareLinkRow));
});

/* Gia han: dat lai han tu BAY GIO (khong cong don vao han cu), ke ca link da het han.
   Link da thu hoi thi khong gia han — thu hoi la quyet dinh co chu y, khong dao nguoc im lang. */
router.post('/:id/extend', (req, res) => {
  const link = loadManagedLink(req);
  const body = parseBody(z.object({ days: z.union([z.literal(1), z.literal(7), z.literal(30)]) }), req);
  if (link.revoked_at) throw new HttpError(409, 'Liên kết đã bị thu hồi, hãy tạo liên kết mới');
  db.prepare(`UPDATE share_links SET expires_at = datetime('now','localtime', ?) WHERE id = ?`).run(
    `+${body.days} days`,
    link.id
  );
  res.json(serialize(db.prepare(`SELECT * FROM share_links WHERE id = ?`).get(link.id) as ShareLinkRow));
});

router.get('/:id/views', (req, res) => {
  const link = loadManagedLink(req);
  res.json(
    db
      .prepare(
        `SELECT id, viewed_at, ip, user_agent, action FROM share_link_views
          WHERE link_id = ? ORDER BY viewed_at DESC, id DESC LIMIT 100`
      )
      .all(link.id)
  );
});

export default router;
