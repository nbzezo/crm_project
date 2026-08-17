/**
 * Checklist ban giao Sales -> Delivery (v24).
 *
 * Cot `deals.handover_ready` (v23) van la nguon duy nhat ma moi truy van loc
 * theo. Cho nay chiu trach nhiem giu no DUNG: khi mot co hoi co checklist, gia
 * tri cua no duoc tinh lai tu cac muc bat buoc moi lan co gi thay doi; khi khong
 * co checklist (du lieu cu, viec nho khong can quy trinh) thi no van sua tay
 * duoc nhu truoc.
 */
import type { Database } from 'better-sqlite3';
import { HttpError, required } from '../lib/validate.ts';

export interface HandoverTemplateItem {
  content: string;
  required: boolean;
}

export type HandoverTemplates = Record<string, HandoverTemplateItem[]>;

export interface HandoverSettings {
  templates: HandoverTemplates;
  slaDays: number;
}

/** Dung khi cau hinh bi xoa hoac hong — khong bao gio de he thong khong co mau nao. */
const FALLBACK: HandoverSettings = { templates: { default: [] }, slaDays: 7 };

function parseTemplates(raw: string | undefined): HandoverTemplates {
  if (!raw) return FALLBACK.templates;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object') return FALLBACK.templates;

    /* Loc tung muc thay vi tin ca khoi JSON: cau hinh nay nguoi dung sua duoc,
       va mot muc thieu `content` se tao ra dong checklist rong khong ai xoa noi. */
    const out: HandoverTemplates = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(value)) continue;
      const items = value
        .filter(
          (item): item is Record<string, unknown> => item !== null && typeof item === 'object'
        )
        .map((item) => ({
          content: String(item.content ?? '').trim(),
          required: item.required !== false,
        }))
        .filter((item) => item.content.length > 0);
      if (items.length > 0) out[key] = items;
    }
    return Object.keys(out).length > 0 ? out : FALLBACK.templates;
  } catch {
    return FALLBACK.templates;
  }
}

export function getHandoverSettings(db: Database): HandoverSettings {
  const rows = db
    .prepare(`SELECT key, value FROM app_settings WHERE key LIKE 'handover.%'`)
    .all() as { key: string; value: string }[];
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const sla = Number(map.get('handover.sla_days'));
  return {
    templates: parseTemplates(map.get('handover.templates')),
    slaDays: Number.isFinite(sla) && sla > 0 ? sla : FALLBACK.slaDays,
  };
}

export function saveHandoverSettings(db: Database, patch: Record<string, unknown>): void {
  const upsert = db.prepare(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, datetime('now','localtime'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  );
  db.transaction(() => {
    for (const [key, value] of Object.entries(patch)) {
      upsert.run(`handover.${key}`, typeof value === 'string' ? value : JSON.stringify(value));
    }
  })();
}

export interface HandoverItem {
  id: number;
  deal_id: number;
  content: string;
  is_required: number;
  is_done: number;
  done_at: string | null;
  note: string | null;
  position: number;
}

export function listHandoverItems(db: Database, dealId: number): HandoverItem[] {
  return db
    .prepare(`SELECT * FROM deal_handover_items WHERE deal_id = ? ORDER BY position, id`)
    .all(dealId) as HandoverItem[];
}

/**
 * Tinh lai `deals.handover_ready` tu checklist.
 *
 * KHONG cham vao co khi co hoi chua co muc nao: luc do checklist khong phai la
 * nguon su that, va ghi de len se xoa mat lua chon tay cua nguoi dung.
 */
export function syncHandoverReady(db: Database, dealId: number): number | null {
  const stat = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN is_required = 1 AND is_done = 0 THEN 1 ELSE 0 END) AS pending
         FROM deal_handover_items WHERE deal_id = ?`
    )
    .get(dealId) as { total: number; pending: number | null };

  if (stat.total === 0) return null;
  const ready = (stat.pending ?? 0) === 0 ? 1 : 0;
  db.prepare(`UPDATE deals SET handover_ready = ? WHERE id = ?`).run(ready, dealId);
  return ready;
}

/**
 * Do bo mau vao mot co hoi.
 *
 * `content` duoc sao chep chu khong tham chieu toi mau — doi mau nam sau khong
 * duoc phep viet lai lich su ban giao cua mot co hoi da chot.
 *
 * Tu choi khi da co muc: goi lai lan hai (bam nham, mang chap chon gui hai lan)
 * ma them mot bo nua se tao checklist nhan doi ma khong ai nhan ra ngay.
 */
export function applyHandoverTemplate(
  db: Database,
  dealId: number,
  key = 'default'
): HandoverItem[] {
  required(db.prepare(`SELECT id FROM deals WHERE id = ?`).get(dealId), 'Khong tim thay co hoi');

  const existing = db
    .prepare(`SELECT COUNT(*) AS n FROM deal_handover_items WHERE deal_id = ?`)
    .get(dealId) as { n: number };
  if (existing.n > 0) {
    throw new HttpError(409, 'Cơ hội này đã có checklist bàn giao', {
      code: 'HANDOVER_ALREADY_EXISTS',
    });
  }

  const { templates } = getHandoverSettings(db);
  const items = templates[key] ?? templates.default;
  if (!items || items.length === 0) {
    throw new HttpError(422, `Không tìm thấy mẫu bàn giao "${key}"`, {
      code: 'HANDOVER_TEMPLATE_EMPTY',
    });
  }

  const insert = db.prepare(
    `INSERT INTO deal_handover_items (deal_id, content, is_required, position)
     VALUES (?, ?, ?, ?)`
  );
  db.transaction(() => {
    items.forEach((item, index) => {
      insert.run(dealId, item.content, item.required ? 1 : 0, (index + 1) * 1024);
    });
    syncHandoverReady(db, dealId);
  })();

  return listHandoverItems(db, dealId);
}

/**
 * Co hoi da Won nhung qua han SLA ma ho so ban giao chua du (dac ta muc 10).
 *
 * Moc tinh tu `closed_at` — thoi diem chot thuong mai, chu khong phai
 * `updated_at`: sua mot dong ghi chu khong lam dong ho ban giao chay lai tu dau.
 */
export interface OverdueHandover {
  id: number;
  title: string;
  customer_name: string;
  closed_at: string;
  days_waiting: number;
  pending_required: number;
}

export function listOverdueHandovers(db: Database, slaDays: number): OverdueHandover[] {
  return db
    .prepare(
      `SELECT d.id, d.title, c.name AS customer_name, d.closed_at,
              CAST(julianday('now','localtime') - julianday(d.closed_at) AS INTEGER) AS days_waiting,
              (SELECT COUNT(*) FROM deal_handover_items h
                WHERE h.deal_id = d.id AND h.is_required = 1 AND h.is_done = 0) AS pending_required
         FROM deals d
         JOIN customers c ON c.id = d.customer_id AND c.org_kind = 'customer'
        WHERE d.stage = 'won'
          AND d.handover_ready = 0
          AND d.closed_at IS NOT NULL
          AND julianday('now','localtime') - julianday(d.closed_at) >= ?
        ORDER BY d.closed_at
        LIMIT 50`
    )
    .all(slaDays) as OverdueHandover[];
}
