import type { Database } from 'better-sqlite3';
import { fold } from '../../lib/viSearch.ts';
import type { ParsedContact } from './contactFile.ts';
import {
  keysOf,
  normalizeEmail,
  normalizePhone,
  searchTextOf,
  splitMulti,
  type ContactKey,
} from './contactKeys.ts';

/*
 * Danh ba CA NHAN cua tung nhan vien (v50).
 *
 * Moi ham nhan `userId` ro rang va CHI cham dong cua nguoi do — day la ranh gioi
 * rieng tu: danh ba dien thoai cua mot nguoi khong duoc ai khac nhin, ke ca quan ly
 * cap tren. Khong dung chung pham vi du lieu theo don vi cua `contacts`.
 */

export interface PersonalContact {
  id: number;
  full_name: string;
  org_name: string | null;
  title: string | null;
  phone: string | null;
  email: string | null;
  notes: string;
  source: 'google' | 'file';
  linked_contact_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface ImportResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
}

interface Incoming {
  full_name: string;
  org_name: string | null;
  title: string | null;
  phones: string[];
  emails: string[];
  notes: string;
  source: 'google' | 'file';
  google_resource_name?: string;
  google_etag?: string;
}

function findByKeys(db: Database, userId: number, keys: ContactKey[]): number | null {
  const find = db.prepare(
    `SELECT pc.id FROM personal_contact_keys k
       JOIN personal_contacts pc ON pc.id = k.contact_id
      WHERE pc.user_id = ? AND k.kind = ? AND k.value = ?
      ORDER BY pc.id LIMIT 1`
  );
  for (const key of keys) {
    const hit = find.get(userId, key.kind, key.value) as { id: number } | undefined;
    if (hit) return hit.id;
  }
  return null;
}

function addKeys(db: Database, contactId: number, keys: ContactKey[]): void {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO personal_contact_keys (contact_id, kind, value) VALUES (?, ?, ?)`
  );
  for (const key of keys) insert.run(contactId, key.kind, key.value);
}

function firstOf(values: string[]): string | null {
  return values.find((value) => value.trim()) ?? null;
}

/**
 * Nap mot lien he vao danh ba cua `userId`.
 *
 * - Co `google_resource_name` da ton tai: Google la nguon dung, ghi de toan bo.
 * - Khong thi tim theo khoa so khop (dien thoai/email chuan hoa); trung thi CHI
 *   dien vao o con trong — khong ghi de nhung gi nguoi dung da sua tay.
 */
function upsertOne(db: Database, userId: number, item: Incoming): 'created' | 'updated' {
  const keys = keysOf(item.phones, item.emails);
  const phone = firstOf(item.phones);
  const email = firstOf(item.emails);

  let existingId: number | null = null;
  let authoritative = false;
  if (item.google_resource_name) {
    const hit = db
      .prepare(`SELECT id FROM personal_contacts WHERE user_id = ? AND google_resource_name = ?`)
      .get(userId, item.google_resource_name) as { id: number } | undefined;
    if (hit) {
      existingId = hit.id;
      authoritative = true;
    }
  }
  existingId ??= findByKeys(db, userId, keys);

  if (existingId === null) {
    const info = db
      .prepare(
        `INSERT INTO personal_contacts
           (user_id, full_name, org_name, title, phone, email, notes, source,
            google_resource_name, google_etag, search_text)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        userId,
        item.full_name,
        item.org_name,
        item.title,
        phone,
        email,
        item.notes,
        item.source,
        item.google_resource_name ?? null,
        item.google_etag ?? null,
        searchTextOf([item.full_name, item.org_name, ...item.phones, ...item.emails])
      );
    const id = Number(info.lastInsertRowid);
    addKeys(db, id, keys);
    return 'created';
  }

  const current = db
    .prepare(`SELECT * FROM personal_contacts WHERE id = ?`)
    .get(existingId) as PersonalContact & { google_resource_name: string | null };

  if (authoritative) {
    db.prepare(`DELETE FROM personal_contact_keys WHERE contact_id = ?`).run(existingId);
    db.prepare(
      `UPDATE personal_contacts
          SET full_name = ?, org_name = ?, title = ?, phone = ?, email = ?, notes = ?,
              google_etag = ?, search_text = ?, updated_at = datetime('now','localtime')
        WHERE id = ?`
    ).run(
      item.full_name,
      item.org_name,
      item.title,
      phone,
      email,
      item.notes,
      item.google_etag ?? null,
      searchTextOf([item.full_name, item.org_name, ...item.phones, ...item.emails]),
      existingId
    );
    addKeys(db, existingId, keys);
    return 'updated';
  }

  /* Trung theo khoa: bo sung o con thieu, them khoa moi, va (neu la Google) nhan
     lien he nay ve phia Google de lan dong bo sau cap nhat dung dong. */
  const merged = {
    org_name: current.org_name ?? item.org_name,
    title: current.title ?? item.title,
    phone: current.phone ?? phone,
    email: current.email ?? email,
    notes: current.notes || item.notes,
  };
  db.prepare(
    `UPDATE personal_contacts
        SET org_name = ?, title = ?, phone = ?, email = ?, notes = ?,
            google_resource_name = COALESCE(google_resource_name, ?),
            google_etag = COALESCE(?, google_etag),
            search_text = ?, updated_at = datetime('now','localtime')
      WHERE id = ?`
  ).run(
    merged.org_name,
    merged.title,
    merged.phone,
    merged.email,
    merged.notes,
    item.google_resource_name ?? null,
    item.google_etag ?? null,
    searchTextOf([
      current.full_name,
      merged.org_name,
      merged.phone,
      merged.email,
      ...item.phones,
      ...item.emails,
    ]),
    existingId
  );
  addKeys(db, existingId, keys);
  return 'updated';
}

export function importParsed(
  db: Database,
  userId: number,
  items: ParsedContact[],
  source: 'google' | 'file' = 'file'
): ImportResult {
  const result: ImportResult = { total: items.length, created: 0, updated: 0, skipped: 0 };
  db.transaction(() => {
    for (const item of items) {
      if (!item.full_name.trim()) {
        result.skipped += 1;
        continue;
      }
      result[upsertOne(db, userId, { ...item, source })] += 1;
    }
  })();
  return result;
}

/** Dung cho dong bo Google: tung lien he mang resource_name + etag. */
export function importGoogle(
  db: Database,
  userId: number,
  items: (ParsedContact & { resource_name: string; etag?: string })[]
): ImportResult {
  const result: ImportResult = { total: items.length, created: 0, updated: 0, skipped: 0 };
  db.transaction(() => {
    for (const item of items) {
      result[
        upsertOne(db, userId, {
          ...item,
          source: 'google',
          google_resource_name: item.resource_name,
          google_etag: item.etag,
        })
      ] += 1;
    }
  })();
  return result;
}

/** Xoa lien he Google da bi go ben Google; tra ve so dong da xoa. */
export function removeGoogleContacts(
  db: Database,
  userId: number,
  resourceNames: string[]
): number {
  const remove = db.prepare(
    `DELETE FROM personal_contacts WHERE user_id = ? AND google_resource_name = ?`
  );
  let removed = 0;
  db.transaction(() => {
    for (const name of resourceNames) removed += remove.run(userId, name).changes;
  })();
  return removed;
}

/** Sau mot lan dong bo DAY DU: xoa nhung lien he Google khong con xuat hien. */
export function pruneGoogleContactsNotIn(
  db: Database,
  userId: number,
  keepResourceNames: Set<string>
): number {
  const rows = db
    .prepare(
      `SELECT id, google_resource_name FROM personal_contacts
        WHERE user_id = ? AND google_resource_name IS NOT NULL`
    )
    .all(userId) as { id: number; google_resource_name: string }[];
  const remove = db.prepare(`DELETE FROM personal_contacts WHERE id = ?`);
  let removed = 0;
  db.transaction(() => {
    for (const row of rows) {
      if (!keepResourceNames.has(row.google_resource_name)) removed += remove.run(row.id).changes;
    }
  })();
  return removed;
}

/* ---------- Doc ---------- */

export type LinkFilter = 'all' | 'unlinked' | 'linked';

export interface ListQuery {
  q?: string;
  filter?: LinkFilter;
  source?: 'google' | 'file';
  limit: number;
  offset: number;
}

export function listPersonal(
  db: Database,
  userId: number,
  query: ListQuery
): { items: PersonalContact[]; total: number } {
  const where = ['user_id = ?'];
  const params: unknown[] = [userId];
  const text = fold(query.q?.trim());
  if (text) {
    where.push('search_text LIKE ?');
    params.push(`%${text}%`);
  }
  if (query.filter === 'linked') where.push('linked_contact_id IS NOT NULL');
  if (query.filter === 'unlinked') where.push('linked_contact_id IS NULL');
  if (query.source) {
    where.push('source = ?');
    params.push(query.source);
  }
  const clause = where.join(' AND ');
  const total = (
    db.prepare(`SELECT COUNT(*) AS n FROM personal_contacts WHERE ${clause}`).get(...params) as {
      n: number;
    }
  ).n;
  const items = db
    .prepare(
      `SELECT id, full_name, org_name, title, phone, email, notes, source, linked_contact_id,
              created_at, updated_at
         FROM personal_contacts WHERE ${clause}
        ORDER BY full_name COLLATE NOCASE, id LIMIT ? OFFSET ?`
    )
    .all(...params, query.limit, query.offset) as PersonalContact[];
  return { items, total };
}

export function personalCounts(db: Database, userId: number) {
  return db
    .prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(linked_contact_id IS NOT NULL), 0) AS linked,
              COALESCE(SUM(source = 'google'), 0) AS google,
              COALESCE(SUM(source = 'file'), 0) AS file
         FROM personal_contacts WHERE user_id = ?`
    )
    .get(userId) as { total: number; linked: number; google: number; file: number };
}

export function getOwned(db: Database, userId: number, id: number): PersonalContact | undefined {
  return db
    .prepare(`SELECT * FROM personal_contacts WHERE id = ? AND user_id = ?`)
    .get(id, userId) as PersonalContact | undefined;
}

export function keysOfPersonal(db: Database, id: number): ContactKey[] {
  return db
    .prepare(`SELECT kind, value FROM personal_contact_keys WHERE contact_id = ?`)
    .all(id) as ContactKey[];
}

/* ---------- Doi chieu voi danh ba CRM ---------- */

export interface CrmMatch {
  contact_id: number;
  full_name: string;
  customer_id: number;
  customer_name: string;
}

interface CrmRow {
  id: number;
  full_name: string;
  phone: string | null;
  email: string | null;
  customer_id: number;
  customer_name: string;
}

/**
 * Chi muc `contacts` theo khoa chuan hoa. `scopeSql` la manh `AND ...` da gioi han
 * theo pham vi du lieu cua nguoi dang xem — doi chieu khong duoc tiet lo mot lien
 * he CRM ma ho khong co quyen nhin thay.
 */
export function buildCrmIndex(db: Database, scopeSql: string): Map<string, CrmMatch[]> {
  const rows = db
    .prepare(
      `SELECT ct.id, ct.full_name, ct.phone, ct.email, ct.customer_id, c.name AS customer_name
         FROM contacts ct JOIN customers c ON c.id = ct.customer_id
        WHERE ct.is_active = 1${scopeSql}`
    )
    .all() as CrmRow[];
  const index = new Map<string, CrmMatch[]>();
  const put = (key: string, row: CrmRow) => {
    const list = index.get(key) ?? [];
    if (list.some((m) => m.contact_id === row.id)) return;
    list.push({
      contact_id: row.id,
      full_name: row.full_name,
      customer_id: row.customer_id,
      customer_name: row.customer_name,
    });
    index.set(key, list);
  };
  for (const row of rows) {
    for (const part of splitMulti(row.phone)) {
      const phone = normalizePhone(part);
      if (phone) put(`phone:${phone}`, row);
    }
    for (const part of splitMulti(row.email)) {
      const email = normalizeEmail(part);
      if (email) put(`email:${email}`, row);
    }
  }
  return index;
}

export function matchesFor(
  db: Database,
  index: Map<string, CrmMatch[]>,
  personalId: number
): CrmMatch[] {
  const found = new Map<number, CrmMatch>();
  for (const key of keysOfPersonal(db, personalId)) {
    for (const match of index.get(`${key.kind}:${key.value}`) ?? []) {
      found.set(match.contact_id, match);
    }
  }
  return [...found.values()];
}
