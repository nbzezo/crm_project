/**
 * Nhat ky thay doi cua cac thuc the thuong mai (v23).
 *
 * Tra loi mot cau hoi duy nhat: "truong nay doi tu bao nhieu sang bao nhieu, luc
 * nao, vi ly do gi". Do la cung mot cau hoi cho deal, project va contract nen ca
 * ba dung chung mot bang — xem chu thich trong migrate-v23.sql.
 *
 * CHI ghi cac truong trong `TRACKED`. Ghi tat ca se nhan chim nhat ky bang
 * `search_text`, `updated_at`, `position` — nhung thu doi lien tuc va khong ai
 * bao gio truy nguoc. Danh sach ngan la thu lam nhat ky nay doc duoc.
 */
import type { Database } from 'better-sqlite3';
import { HttpError, required } from './validate.ts';

export type ChangeEntity = 'deal' | 'project' | 'contract';

const TRACKED: Record<ChangeEntity, readonly string[]> = {
  /* Cac truong quyet dinh gia tri thuong mai va diem chuyen giao. */
  deal: [
    'stage',
    'value_vnd',
    'won_value_vnd',
    'expected_close_date',
    'customer_id',
    'project_id',
    'handover_ready',
    'lost_reason',
  ],
  /* Baseline cua du an — dac ta 7.4 doi thay doi sau Won phai co dau vet. */
  project: [
    'status',
    'plan_start',
    'plan_end',
    'budget_vnd',
    'customer_id',
    'owner_contact_id',
    /* v26: mo hinh trien khai da chot va moc nghiem thu — hai quyet dinh ma sau
       nay chac chan co nguoi hoi "ai chot, luc nao, vi sao". */
    'delivery_model',
    'accepted_at',
  ],
  contract: ['status', 'value_vnd', 'start_date', 'end_date', 'project_id'],
};

/**
 * Chuan hoa ve chuoi de so sanh va luu.
 *
 * SQLite tra so nguyen cho cot INTEGER con client gui boolean cho cung cot do
 * (`handover_ready`), nen so sanh thang `!==` se bao "doi" o moi lan luu du
 * khong ai cham vao. Ep ca hai ve mot dang truoc khi so.
 */
function asText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? '1' : '0';
  return String(value);
}

/**
 * Nguoi thuc hien mot thay doi (v24).
 *
 * KHONG phai mot lop nguoi dung: he thong van khong co bang user, session hay
 * dang nhap. Day chi la mot tham chieu toi so danh ba, mac dinh la `contacts.is_me`
 * — cung khai niem "toi" ma cho giao viec dang dung. Nho vay nhat ky tra loi
 * duoc "ai doi" ma khong keo theo mot cuoc di doi kien truc.
 *
 * Tra ve null khi so danh ba chua danh dau ai la "toi": khuyet nguoi thuc hien
 * van tot hon la tu gan bua cho mot nguoi bat ky.
 */
export function resolveActor(db: Database, explicit?: number | null): number | null {
  if (explicit != null) {
    required(
      db.prepare(`SELECT id FROM contacts WHERE id = ?`).get(explicit),
      'Khong tim thay nguoi thuc hien'
    );
    return explicit;
  }
  const me = db.prepare(`SELECT id FROM contacts WHERE is_me = 1 LIMIT 1`).get() as
    { id: number } | undefined;
  return me?.id ?? null;
}

/**
 * Doc ca nguoi thuc hien va ly do tu query string cua mot request.
 *
 * Hai thu nay di cung nhau o moi route ghi nhat ky nen gom lai mot cho — de moi
 * endpoint tu boc tach se sinh ra bay kieu quy uoc ten tham so khac nhau.
 */
export function auditFromQuery(db: Database, query: Record<string, unknown>): RecordOptions {
  const raw = query.actor_contact_id;
  const hasActor = raw !== undefined && raw !== null && raw !== '';
  const explicit = hasActor ? Number(raw) : null;
  if (explicit !== null && (!Number.isInteger(explicit) || explicit <= 0)) {
    throw new HttpError(400, 'actor_contact_id khong hop le');
  }
  return {
    note: typeof query.reason === 'string' ? query.reason.trim() || null : null,
    actorContactId: resolveActor(db, explicit),
  };
}

export interface RecordOptions {
  note?: string | null;
  actorContactId?: number | null;
}

/**
 * Ghi lai chenh lech giua `before` va `after` cho cac truong duoc theo doi.
 *
 * Goi BEN TRONG transaction cap nhat cua route: nhat ky va du lieu phai cung
 * song hoac cung chet, neu khong se co dong nhat ky mo ta mot thay doi da bi
 * rollback.
 */
export function recordChanges(
  db: Database,
  entity: ChangeEntity,
  entityId: number,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  options: RecordOptions = {}
): number {
  const insert = db.prepare(
    `INSERT INTO entity_change_log
       (entity_type, entity_id, field, old_value, new_value, note, actor_contact_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  let written = 0;
  for (const field of TRACKED[entity]) {
    if (!(field in after)) continue;
    const oldValue = asText(before[field]);
    const newValue = asText(after[field]);
    if (oldValue === newValue) continue;
    insert.run(
      entity,
      entityId,
      field,
      oldValue,
      newValue,
      options.note ?? null,
      options.actorContactId ?? null
    );
    written += 1;
  }
  return written;
}

export interface ChangeLogEntry {
  id: number;
  field: string;
  old_value: string | null;
  new_value: string | null;
  note: string | null;
  actor_contact_id: number | null;
  actor_name: string | null;
  changed_at: string;
}

export function listChanges(
  db: Database,
  entity: ChangeEntity,
  entityId: number,
  limit = 50
): ChangeLogEntry[] {
  return db
    .prepare(
      `SELECT l.id, l.field, l.old_value, l.new_value, l.note, l.actor_contact_id,
              ct.full_name AS actor_name, l.changed_at
         FROM entity_change_log l
         LEFT JOIN contacts ct ON ct.id = l.actor_contact_id
        WHERE l.entity_type = ? AND l.entity_id = ?
        ORDER BY l.changed_at DESC, l.id DESC
        LIMIT ?`
    )
    .all(entity, entityId, limit) as ChangeLogEntry[];
}
