/**
 * Danh muc dong (v62) — doc, kiem tra va sua `picklist_items`.
 *
 * Doc qua mot ban dem trong bo nho theo tung ket noi CSDL: bang chi co vai tram
 * dong nhung bi hoi o moi lan ghi co hoi / tuong tac / tai lieu. Moi ham ghi o
 * day xoa ban dem; khong co duong ghi nao khac vao bang nay.
 */
import type { Database } from 'better-sqlite3';
import { PICKLISTS, PICKLIST_KEYS, type PicklistItem, type PicklistKey } from '@workflow/contracts';
import { HttpError } from './validate.ts';
import { buildSearchText, fold } from './viSearch.ts';

const cache = new WeakMap<Database, Map<PicklistKey, PicklistItem[]>>();

export function invalidatePicklists(db: Database): void {
  cache.delete(db);
}

function load(db: Database): Map<PicklistKey, PicklistItem[]> {
  let byList = cache.get(db);
  if (byList) return byList;
  const rows = db
    .prepare(
      `SELECT id, list_key, item_key, label, color, position, is_active, is_system
         FROM picklist_items ORDER BY list_key, position, id`
    )
    .all() as PicklistItem[];
  byList = new Map(PICKLIST_KEYS.map((key) => [key, [] as PicklistItem[]]));
  for (const row of rows) byList.get(row.list_key)?.push(row);
  cache.set(db, byList);
  return byList;
}

/** Moi muc cua mot danh muc, ke ca muc dang an, theo thu tu hien thi. */
export function getPicklist(db: Database, list: PicklistKey): PicklistItem[] {
  return load(db).get(list) ?? [];
}

export function getAllPicklists(db: Database): Record<PicklistKey, PicklistItem[]> {
  const byList = load(db);
  return Object.fromEntries(PICKLIST_KEYS.map((key) => [key, byList.get(key) ?? []])) as Record<
    PicklistKey,
    PicklistItem[]
  >;
}

/** Gia tri luu trong cot nghiep vu cua mot muc (khoa hay nhan, tuy danh muc). */
export function storedValue(list: PicklistKey, item: Pick<PicklistItem, 'item_key' | 'label'>) {
  return PICKLISTS[list].storage === 'key' ? item.item_key : item.label;
}

function findByStored(db: Database, list: PicklistKey, value: string): PicklistItem | undefined {
  const items = getPicklist(db, list);
  if (PICKLISTS[list].storage === 'key') return items.find((item) => item.item_key === value);
  const folded = fold(value.trim());
  return items.find((item) => fold(item.label) === folded);
}

/** Nhan hien thi cua mot gia tri da luu; gia tri la thi tra lai nguyen gia tri. */
export function picklistLabel(db: Database, list: PicklistKey, value: string | null | undefined) {
  if (!value) return value ?? null;
  return findByStored(db, list, value)?.label ?? value;
}

/** Danh sach gia tri dang bat — dung cho prompt AI liet ke lua chon hop le. */
export function activeValues(db: Database, list: PicklistKey): string[] {
  return getPicklist(db, list)
    .filter((item) => item.is_active === 1)
    .map((item) => storedValue(list, item));
}

/**
 * Kiem tra (va chuan hoa) gia tri sap ghi vao mot cot dung danh muc.
 *
 * - Rong / null: tra lai nguyen (cot cho phep trong thi route tu quyet).
 * - Muc dang bat: hop le. Voi danh muc luu nhan, tra ve DUNG nhan cua muc (go
 *   "cntt" thanh "CNTT") de du lieu khong tach thanh nhieu bien the.
 * - Muc dang an: chi hop le khi ban ghi da mang san gia tri do (`current`) — sua
 *   mot co hoi cu khong duoc vo chi vi ly do thua cua no vua bi an.
 */
export function assertPicklistValue(
  db: Database,
  list: PicklistKey,
  value: string | null | undefined,
  current?: string | null
): string | null | undefined {
  if (value === null || value === undefined) return value;
  if (value.trim() === '') return PICKLISTS[list].storage === 'label' ? null : value;
  const item = findByStored(db, list, value);
  if (item && (item.is_active === 1 || (current != null && current === storedValue(list, item))))
    return storedValue(list, item);
  if (!item && current != null && current === value) return value;
  throw new HttpError(422, `Giá trị "${value}" không có trong danh mục hoặc đã bị ẩn`, {
    code: 'PICKLIST_VALUE_INVALID',
    list,
    value,
  });
}

/**
 * Nhan hien tai cua mot muc he thong — dung khi ma nguon tu ghi gia tri vao mot
 * danh muc luu nhan (vd nguon "Gia hạn hợp đồng"). Quan tri vien doi ten thi ma
 * nguon ghi theo ten moi.
 */
export function systemLabel(db: Database, list: PicklistKey, key: string, fallback: string) {
  return getPicklist(db, list).find((item) => item.item_key === key)?.label ?? fallback;
}

/**
 * Ban "de dai" cua assertPicklistValue cho cac luong tu dong (AI, tai hop dong len):
 * khop duoc thi tra ve nhan chuan, khong khop thi THEM muc moi thay vi tu choi —
 * khong de mot hop dong tai len that bai chi vi AI doc ra mot nganh la. Muc moi
 * hien ngay o Cai dat -> Danh muc de quan tri vien gop neu can.
 */
export function ensurePicklistValue(
  db: Database,
  list: PicklistKey,
  value: string | null | undefined
): string | null {
  const text = value?.trim().replace(/\s+/g, ' ');
  if (!text) return null;
  const item = findByStored(db, list, text);
  if (item) return storedValue(list, item);
  return storedValue(list, createPicklistItem(db, list, { label: text }));
}

/* ---------- Ghi ---------- */

function makeKey(db: Database, list: PicklistKey, label: string): string {
  const base =
    fold(label)
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'muc';
  const taken = new Set(getPicklist(db, list).map((item) => item.item_key));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) if (!taken.has(`${base}_${n}`)) return `${base}_${n}`;
}

function getItem(db: Database, list: PicklistKey, id: number): PicklistItem {
  const item = getPicklist(db, list).find((row) => row.id === id);
  if (!item) throw new HttpError(404, 'Không tìm thấy mục trong danh mục');
  return item;
}

function assertLabelFree(db: Database, list: PicklistKey, label: string, exceptId?: number) {
  const folded = fold(label.trim());
  const clash = getPicklist(db, list).find(
    (item) => item.id !== exceptId && fold(item.label) === folded
  );
  if (clash) {
    throw new HttpError(409, `Danh mục đã có mục "${clash.label}"`, {
      code: 'PICKLIST_LABEL_TAKEN',
      id: clash.id,
    });
  }
}

/** So ban ghi dang dung mot muc, theo tung cot trong `usages`. */
export function usageCount(db: Database, list: PicklistKey, item: PicklistItem): number {
  const value = storedValue(list, item);
  let total = 0;
  for (const [table, column] of PICKLISTS[list].usages) {
    total += (
      db.prepare(`SELECT COUNT(*) AS n FROM "${table}" WHERE "${column}" = ?`).get(value) as {
        n: number;
      }
    ).n;
  }
  return total;
}

export function usageCounts(db: Database, list: PicklistKey): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const item of getPicklist(db, list)) counts[item.id] = usageCount(db, list, item);
  return counts;
}

function replaceUsages(db: Database, list: PicklistKey, from: string, to: string): number {
  let changed = 0;
  for (const [table, column] of PICKLISTS[list].usages) {
    /* Nganh nam trong `customers.search_text` (routes/customers.ts) — doi nganh ma
       khong dung lai chuoi tim kiem thi go ten nganh moi se khong ra khach hang. */
    const reindex =
      table === 'customers' && column === 'industry'
        ? (db.prepare(`SELECT id FROM customers WHERE industry = ?`).all(from) as { id: number }[])
        : [];
    changed += db
      .prepare(`UPDATE "${table}" SET "${column}" = ? WHERE "${column}" = ?`)
      .run(to, from).changes;
    for (const { id } of reindex) reindexCustomer(db, id);
  }
  return changed;
}

function reindexCustomer(db: Database, id: number): void {
  const row = db
    .prepare(
      `SELECT name, short_name, industry, notes, phone, email, tax_code FROM customers WHERE id = ?`
    )
    .get(id) as Record<string, string | null>;
  db.prepare(`UPDATE customers SET search_text = ? WHERE id = ?`).run(
    buildSearchText(
      row.name,
      row.short_name,
      row.industry,
      row.notes,
      row.phone,
      row.email,
      row.tax_code
    ),
    id
  );
}

export function createPicklistItem(
  db: Database,
  list: PicklistKey,
  input: { label: string; color?: string | null }
): PicklistItem {
  const label = input.label.trim();
  assertLabelFree(db, list, label);
  const key = makeKey(db, list, label);
  const last = getPicklist(db, list).reduce((max, item) => Math.max(max, item.position), 0);
  const info = db
    .prepare(
      `INSERT INTO picklist_items (list_key, item_key, label, color, position) VALUES (?, ?, ?, ?, ?)`
    )
    .run(list, key, label, input.color ?? null, last + 1);
  invalidatePicklists(db);
  return getItem(db, list, Number(info.lastInsertRowid));
}

export function updatePicklistItem(
  db: Database,
  list: PicklistKey,
  id: number,
  patch: { label?: string; color?: string | null; is_active?: boolean }
): PicklistItem {
  const item = getItem(db, list, id);
  if (patch.is_active === false && item.is_system === 1) {
    throw new HttpError(422, 'Mục hệ thống không ẩn được, chỉ đổi tên được', {
      code: 'PICKLIST_SYSTEM_ITEM',
    });
  }
  const label = patch.label?.trim();
  if (label !== undefined) assertLabelFree(db, list, label, id);

  db.transaction(() => {
    if (label !== undefined && label !== item.label) {
      db.prepare(
        `UPDATE picklist_items SET label = ?, updated_at = datetime('now','localtime') WHERE id = ?`
      ).run(label, id);
      /* Danh muc luu nhan: doi ten la doi luon gia tri trong du lieu. */
      if (PICKLISTS[list].storage === 'label') replaceUsages(db, list, item.label, label);
    }
    if (patch.color !== undefined)
      db.prepare(`UPDATE picklist_items SET color = ? WHERE id = ?`).run(patch.color, id);
    if (patch.is_active !== undefined)
      db.prepare(`UPDATE picklist_items SET is_active = ? WHERE id = ?`).run(
        patch.is_active ? 1 : 0,
        id
      );
  })();
  invalidatePicklists(db);
  return getItem(db, list, id);
}

export function reorderPicklist(db: Database, list: PicklistKey, ids: number[]): void {
  const known = new Set(getPicklist(db, list).map((item) => item.id));
  if (ids.length !== known.size || ids.some((id) => !known.has(id))) {
    throw new HttpError(422, 'Danh sách sắp xếp phải gồm đúng mọi mục của danh mục');
  }
  const update = db.prepare(`UPDATE picklist_items SET position = ? WHERE id = ?`);
  db.transaction(() => ids.forEach((id, index) => update.run(index + 1, id)))();
  invalidatePicklists(db);
}

/**
 * Gop mot muc vao muc khac: moi ban ghi dang mang `from` chuyen sang `into`, roi
 * xoa `from`. Mot giao dich — gop nua chung thi danh muc va du lieu lech nhau.
 *
 * `onDealChange` de route ghi nhat ky thay doi cho tung co hoi bi doi ly do thua
 * (bang `entity_change_log` chi theo doi co hoi / du an / hop dong).
 */
export function mergePicklistItem(
  db: Database,
  list: PicklistKey,
  fromId: number,
  intoId: number,
  onDealChange?: (dealId: number, field: string, before: string, after: string) => void
): { moved: number } {
  if (fromId === intoId) throw new HttpError(422, 'Không gộp một mục vào chính nó');
  const from = getItem(db, list, fromId);
  const into = getItem(db, list, intoId);
  if (from.is_system === 1) {
    throw new HttpError(422, 'Mục hệ thống không gộp đi được', { code: 'PICKLIST_SYSTEM_ITEM' });
  }
  const before = storedValue(list, from);
  const after = storedValue(list, into);

  let moved = 0;
  db.transaction(() => {
    if (onDealChange) {
      for (const [table, column] of PICKLISTS[list].usages) {
        if (table !== 'deals') continue;
        const ids = db.prepare(`SELECT id FROM deals WHERE "${column}" = ?`).all(before) as {
          id: number;
        }[];
        for (const { id } of ids) onDealChange(id, column, before, after);
      }
    }
    moved = replaceUsages(db, list, before, after);
    db.prepare(`DELETE FROM picklist_items WHERE id = ?`).run(fromId);
  })();
  invalidatePicklists(db);
  return { moved };
}

/** Xoa han mot muc — chi khi chua ban ghi nao dung no. Con dung thi phai gop. */
export function deletePicklistItem(db: Database, list: PicklistKey, id: number): void {
  const item = getItem(db, list, id);
  if (item.is_system === 1) {
    throw new HttpError(422, 'Mục hệ thống không xoá được', { code: 'PICKLIST_SYSTEM_ITEM' });
  }
  const used = usageCount(db, list, item);
  if (used > 0) {
    throw new HttpError(409, `Còn ${used} bản ghi đang dùng mục này — hãy gộp vào mục khác`, {
      code: 'PICKLIST_ITEM_IN_USE',
      used,
    });
  }
  db.prepare(`DELETE FROM picklist_items WHERE id = ?`).run(id);
  invalidatePicklists(db);
}
