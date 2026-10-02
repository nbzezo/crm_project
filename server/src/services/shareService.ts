import crypto from 'node:crypto';
import type { Database } from 'better-sqlite3';
import type { PermissionResource } from '@workflow/contracts';

/*
 * Chia se cong khai (chi xem) qua duong lien ket.
 *
 * Hai nguyen tac:
 * 1. Token chi hien MOT LAN luc tao; CSDL giu SHA-256 (token 256 bit nen khong
 *    can salt/ham cham — khong the doan, khong the vet can).
 * 2. Trang cong khai CHI nhan cac truong ma `loadEntity` tra ve trong `fields`.
 *    Ghi chu noi bo, lich su tuong tac, ten co hoi, nguoi phu trach... KHONG BAO
 *    GIO nam trong do, du cot tuong ung co trong bang.
 */

export const SHARE_ENTITY_TYPES = ['document', 'quotation', 'contract'] as const;
export type ShareEntityType = (typeof SHARE_ENTITY_TYPES)[number];

export const SHARE_RESOURCE: Record<ShareEntityType, PermissionResource> = {
  document: 'documents',
  quotation: 'quotations',
  contract: 'contracts',
};

export interface ShareLinkRow {
  id: number;
  token_hash: string;
  token_hint: string;
  entity_type: ShareEntityType;
  entity_id: number;
  title: string;
  created_by_user_id: number | null;
  created_by_name: string;
  created_at: string;
  expires_at: string | null;
  password_salt: string | null;
  password_hash: string | null;
  allow_download: number;
  notify_on_view: number;
  snapshot_json: string | null;
  revoked_at: string | null;
  view_count: number;
  last_viewed_at: string | null;
}

export interface SharedFile {
  id: number;
  name: string;
  file_name: string;
  mime: string;
  size: number;
}

type FieldValue = string | number | null;

export interface SharePayload {
  type: ShareEntityType;
  title: string;
  fields: Record<string, FieldValue>;
  files: SharedFile[];
  allow_download: boolean;
  locked_version: boolean;
  expires_at: string | null;
  shared_by: string;
}

/** Thong tin cua mot ban ghi, dung de kiem quyen, dong bang va hien thi. */
export interface EntityInfo {
  title: string;
  ownerContactId: number | null;
  customerId: number | null;
  dealId: number | null;
  /** Ly do khong cho chia se cong khai (vd tai lieu mat). */
  blockedReason?: string;
  fields: Record<string, FieldValue>;
  files: SharedFile[];
}

/* ---------- Token & mat khau ---------- */

export function generateToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function hashPassword(password: string, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password: string, salt: string, expected: string): boolean {
  const actual = Buffer.from(crypto.scryptSync(password, salt, 32).toString('hex'));
  const want = Buffer.from(expected);
  return actual.length === want.length && crypto.timingSafeEqual(actual, want);
}

/* ---------- Ma truy cap ngan han cho link co mat khau ---------- */

/* Khong co WORKFLOW_SESSION_SECRET (test, auth tat) thi dung khoa ngau nhien theo
   tien trinh: ma truy cap mat hieu luc khi khoi dong lai — chap nhan duoc. */
const FALLBACK_SECRET = crypto.randomBytes(32).toString('hex');
const ACCESS_TTL_MS = 60 * 60 * 1000;

function accessSecret(): string {
  return process.env.WORKFLOW_SESSION_SECRET || FALLBACK_SECRET;
}

function accessMac(link: Pick<ShareLinkRow, 'id' | 'password_hash'>, exp: number): string {
  return crypto
    .createHmac('sha256', accessSecret())
    .update(`${link.id}.${exp}.${link.password_hash ?? ''}`)
    .digest('base64url');
}

export function signAccess(link: Pick<ShareLinkRow, 'id' | 'password_hash'>): string {
  const exp = Date.now() + ACCESS_TTL_MS;
  return `${exp}.${accessMac(link, exp)}`;
}

/* Gan voi password_hash: doi mat khau link se vo hieu hoa cac ma da cap. */
export function verifyAccess(
  link: Pick<ShareLinkRow, 'id' | 'password_hash'>,
  access: unknown
): boolean {
  if (typeof access !== 'string') return false;
  const [expRaw, mac] = access.split('.');
  const exp = Number(expRaw);
  if (!mac || !Number.isFinite(exp) || exp < Date.now()) return false;
  const a = Buffer.from(mac);
  const b = Buffer.from(accessMac(link, exp));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------- Trang thai link ---------- */

export type LinkStatus = 'active' | 'expired' | 'revoked';

export function linkStatus(db: Database, link: ShareLinkRow): LinkStatus {
  if (link.revoked_at) return 'revoked';
  if (!link.expires_at) return 'active';
  const row = db.prepare(`SELECT ? <= datetime('now','localtime') AS expired`).get(link.expires_at) as {
    expired: number;
  };
  return row.expired ? 'expired' : 'active';
}

export function isPublicSharingEnabled(db: Database): boolean {
  const row = db
    .prepare(`SELECT value FROM app_settings WHERE key = 'sharing.public_enabled'`)
    .get() as { value: string } | undefined;
  return row?.value !== '0';
}

/* ---------- Doc ban ghi theo loai ---------- */

const EXTRA_FILE_SELECT = `SELECT dc.id, dc.name, dc.file_name,
         COALESCE(dc.mime, 'application/octet-stream') AS mime, dc.size
    FROM documents dc
   WHERE dc.deleted_at IS NULL AND dc.confidentiality <> 'confidential'`;

export function loadEntity(db: Database, type: ShareEntityType, id: number): EntityInfo | undefined {
  if (type === 'document') {
    const row = db
      .prepare(
        `SELECT dc.*, c.owner_contact_id AS customer_owner
           FROM documents dc LEFT JOIN customers c ON c.id = dc.customer_id
          WHERE dc.id = ? AND dc.deleted_at IS NULL`
      )
      .get(id) as
      | {
          id: number;
          name: string;
          file_name: string;
          mime: string | null;
          size: number;
          doc_type: string;
          description: string;
          confidentiality: string;
          customer_id: number | null;
          deal_id: number | null;
          customer_owner: number | null;
        }
      | undefined;
    if (!row) return undefined;
    return {
      title: row.name,
      ownerContactId: row.customer_owner,
      customerId: row.customer_id,
      dealId: row.deal_id,
      blockedReason:
        row.confidentiality === 'confidential'
          ? 'Tài liệu mức "Mật" không được chia sẻ bằng liên kết công khai'
          : undefined,
      fields: { description: row.description || null, doc_type: row.doc_type },
      files: [
        {
          id: row.id,
          name: row.name,
          file_name: row.file_name,
          mime: row.mime ?? 'application/octet-stream',
          size: row.size,
        },
      ],
    };
  }

  if (type === 'quotation') {
    const row = db
      .prepare(
        `SELECT q.*, c.name AS customer_name,
                COALESCE(d.owner_contact_id, c.owner_contact_id) AS owner
           FROM quotations q
           JOIN customers c ON c.id = q.customer_id
           LEFT JOIN deals d ON d.id = q.deal_id
          WHERE q.id = ?`
      )
      .get(id) as
      | {
          id: number;
          code: string | null;
          version: number;
          quote_date: string | null;
          value_vnd: number;
          valid_until: string | null;
          status: string;
          customer_id: number;
          deal_id: number | null;
          customer_name: string;
          owner: number | null;
        }
      | undefined;
    if (!row) return undefined;
    const files = db
      .prepare(`${EXTRA_FILE_SELECT} AND dc.quotation_id = ? ORDER BY dc.created_at DESC`)
      .all(id) as SharedFile[];
    return {
      title: `Báo giá ${row.code ?? `#${row.id}`} (v${row.version})`,
      ownerContactId: row.owner,
      customerId: row.customer_id,
      dealId: row.deal_id,
      /* `notes` va ten co hoi la thong tin noi bo — co tinh KHONG dua ra. */
      fields: {
        code: row.code,
        version: row.version,
        customer_name: row.customer_name,
        quote_date: row.quote_date,
        value_vnd: row.value_vnd,
        valid_until: row.valid_until,
        status: row.status,
      },
      files,
    };
  }

  const row = db
    .prepare(
      `SELECT k.*, c.name AS customer_name,
              COALESCE(d.owner_contact_id, c.owner_contact_id) AS owner
         FROM contracts k
         JOIN customers c ON c.id = k.customer_id
         LEFT JOIN deals d ON d.id = k.deal_id
        WHERE k.id = ?`
    )
    .get(id) as
    | {
        id: number;
        name: string;
        number: string | null;
        value_vnd: number;
        sign_date: string | null;
        start_date: string | null;
        end_date: string | null;
        status: string;
        payment_terms: string | null;
        customer_id: number;
        deal_id: number | null;
        customer_name: string;
        owner: number | null;
      }
    | undefined;
  if (!row) return undefined;
  const files = db
    .prepare(`${EXTRA_FILE_SELECT} AND dc.contract_id = ? ORDER BY dc.created_at DESC`)
    .all(id) as SharedFile[];
  return {
    title: row.name,
    ownerContactId: row.owner,
    customerId: row.customer_id,
    dealId: row.deal_id,
    fields: {
      name: row.name,
      number: row.number,
      customer_name: row.customer_name,
      value_vnd: row.value_vnd,
      sign_date: row.sign_date,
      start_date: row.start_date,
      end_date: row.end_date,
      status: row.status,
      payment_terms: row.payment_terms,
    },
    files,
  };
}

interface Snapshot {
  fields: Record<string, FieldValue>;
  files: SharedFile[];
}

export function makeSnapshot(info: EntityInfo): string {
  const snapshot: Snapshot = { fields: info.fields, files: info.files };
  return JSON.stringify(snapshot);
}

function fileStillShareable(db: Database, id: number): boolean {
  return Boolean(
    db
      .prepare(
        `SELECT 1 FROM documents WHERE id = ? AND deleted_at IS NULL AND confidentiality <> 'confidential'`
      )
      .get(id)
  );
}

/**
 * Noi dung hien tren trang cong khai. Tra ve undefined khi ban ghi goc da bi xoa
 * (hoac tai lieu da vao thung rac) — link ngung hoat dong ngay, ke ca khi da
 * dong bang snapshot: xoa la ra lenh thu hoi.
 */
export function buildPayload(db: Database, link: ShareLinkRow): SharePayload | undefined {
  const live = loadEntity(db, link.entity_type, link.entity_id);
  if (!live || live.blockedReason) return undefined;
  const locked = link.snapshot_json ? (JSON.parse(link.snapshot_json) as Snapshot) : null;
  const source: Snapshot = locked ?? { fields: live.fields, files: live.files };
  /* Tep da dong bang van phai CON ton tai va con duoc phep chia se. */
  const files = locked ? source.files.filter((f) => fileStillShareable(db, f.id)) : source.files;
  return {
    type: link.entity_type,
    title: locked ? link.title : live.title,
    fields: source.fields,
    files,
    allow_download: link.allow_download === 1,
    locked_version: Boolean(locked),
    expires_at: link.expires_at,
    shared_by: link.created_by_name,
  };
}

/** Loai tep trinh duyet xem duoc ngay — dung khi link o che do "chi xem". */
export function isPreviewableMime(mime: string): boolean {
  return (
    mime === 'application/pdf' ||
    mime === 'image/png' ||
    mime === 'image/jpeg' ||
    mime === 'text/plain' ||
    mime === 'text/csv' ||
    mime.startsWith('audio/')
  );
}
