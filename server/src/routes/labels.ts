import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.ts';
import { fold } from '../lib/viSearch.ts';
import { HttpError, intParam, parseBody, required } from '../lib/validate.ts';

const router = Router();

/* ---------- Hang so nghiep vu (BRD muc D1/D2) ---------- */

/** Loai doi tuong gan nhan duoc -> bang tuong ung, dung de kiem tra ban ghi co that. */
const ENTITY_TABLES = {
  card: 'cards',
  customer: 'customers',
  deal: 'deals',
  contact: 'contacts',
  contract: 'contracts',
} as const;

type EntityType = keyof typeof ENTITY_TABLES;
const ENTITY_TYPES = Object.keys(ENTITY_TABLES) as EntityType[];

/** FR-TAG-34: gioi han de badge khong vo giao dien va de nhan khong tran lan. */
const MAX_NAME_LENGTH = 30;
const MAX_LABELS_PER_RECORD = 10;

/**
 * FR-TAG-39: tu dien ten dang duoc truong nghiep vu phu trach.
 * Dung de CANH BAO MEM khi dat ten nhan — khong chan, vi co ngoai le hop le.
 * Danh sach dich vu doc truc tiep tu bang services (chi doc, khong sua gi cua module do).
 */
const BUSINESS_TERMS: { field: string; values: string[] }[] = [
  { field: 'Trạng thái khách hàng', values: ['Tiềm năng', 'Khách hàng', 'Ngừng hợp tác'] },
  {
    field: 'Giai đoạn cơ hội',
    values: [
      'Tiềm năng',
      'Đang tiếp cận',
      'Đang trao đổi',
      'Gửi báo giá',
      'Đàm phán',
      'Thành công',
      'Thất bại',
    ],
  },
  { field: 'Mức ưu tiên công việc', values: ['Thấp', 'Trung bình', 'Cao', 'Khẩn cấp'] },
];

interface LabelRow {
  id: number;
  name: string;
  color: string;
  parent_id: number | null;
  description: string;
  status: 'active' | 'inactive';
  scope: string;
  is_starred: number;
  position: number;
  name_norm: string;
  is_system: number;
}

/* ---------- Ham dung chung ---------- */

/** BR-TAG-14: so trung ten theo dang da bo dau, chu thuong, gop khoang trang. */
function normName(name: string): string {
  return fold(name).replace(/\s+/g, ' ').trim();
}

function allLabels(): LabelRow[] {
  return db.prepare(`SELECT * FROM labels ORDER BY position, id`).all() as LabelRow[];
}

function getLabel(id: number): LabelRow {
  return required(
    db.prepare(`SELECT * FROM labels WHERE id = ?`).get(id) as LabelRow | undefined,
    'Khong tim thay nhan'
  );
}

function parseScope(raw: string): EntityType[] {
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is EntityType => ENTITY_TYPES.includes(v as EntityType));
  } catch {
    return [];
  }
}

/** C10: nhan con ke thua pham vi cua nhan cha khi ban than khong khai bao rieng. */
function effectiveScope(label: LabelRow, byId: Map<number, LabelRow>): EntityType[] {
  const own = parseScope(label.scope);
  if (own.length > 0) return own;
  const parent = label.parent_id === null ? null : byId.get(label.parent_id);
  return parent ? parseScope(parent.scope) : [];
}

/** So ban ghi dang dung tung nhan, tach theo loai doi tuong — 1 truy van (FR-TAG-38). */
function usageByLabel(): Map<number, { total: number; by_type: Record<string, number> }> {
  const rows = db
    .prepare(
      `SELECT label_id, entity_type, COUNT(*) AS n FROM label_links GROUP BY label_id, entity_type`
    )
    .all() as { label_id: number; entity_type: string; n: number }[];
  const map = new Map<number, { total: number; by_type: Record<string, number> }>();
  for (const row of rows) {
    const entry = map.get(row.label_id) ?? { total: 0, by_type: {} };
    entry.total += row.n;
    entry.by_type[row.entity_type] = row.n;
    map.set(row.label_id, entry);
  }
  return map;
}

/** C14: nhan cha dem so ban ghi PHAN BIET cua cac nhan con (khong cong trung). */
function usageByGroup(): Map<number, number> {
  const rows = db
    .prepare(
      `SELECT parent_id AS id, COUNT(*) AS n FROM (
         SELECT DISTINCT l.parent_id, ll.entity_type, ll.entity_id
           FROM label_links ll JOIN labels l ON l.id = ll.label_id
          WHERE l.parent_id IS NOT NULL
       ) GROUP BY parent_id`
    )
    .all() as { id: number; n: number }[];
  return new Map(rows.map((r) => [r.id, r.n]));
}

function labelCount(id: number): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM label_links WHERE label_id = ?`).get(id) as {
    n: number;
  };
  return row.n;
}

/** Nem loi doc duoc thay vi loi rang buoc SQLite khi trung ten trong cung nhom. */
function assertNameFree(nameNorm: string, parentId: number | null, exceptId?: number): void {
  const row = db
    .prepare(
      `SELECT id FROM labels
        WHERE name_norm = ? AND IFNULL(parent_id, 0) = ? AND id <> IFNULL(?, 0)`
    )
    .get(nameNorm, parentId ?? 0, exceptId ?? null) as { id: number } | undefined;
  if (row) {
    throw new HttpError(
      409,
      parentId === null
        ? 'Da co nhom nhan cung ten (khong phan biet dau va chu hoa/thuong)'
        : 'Trong nhom nay da co nhan cung ten (khong phan biet dau va chu hoa/thuong)'
    );
  }
}

/** BR-TAG-13 + FR-TAG-04: chi 2 cap, nhan cha phai la nhom that su. */
function assertValidParent(parentId: number, selfId?: number): LabelRow {
  const parent = getLabel(parentId);
  if (selfId !== undefined && parent.id === selfId)
    throw new HttpError(400, 'Nhan khong the la nhan cha cua chinh no');
  if (parent.parent_id !== null)
    throw new HttpError(400, 'Chi ho tro 2 cap nhan — khong tao duoc nhan con ben duoi nhan con');
  return parent;
}

function hasChildren(id: number): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM labels WHERE parent_id = ?`).get(id) as {
    n: number;
  };
  return row.n;
}

function entityTypeParam(value: string | undefined): EntityType {
  if (!ENTITY_TYPES.includes(value as EntityType))
    throw new HttpError(400, `Loai doi tuong khong hop le: ${value}`);
  return value as EntityType;
}

function assertEntityExists(type: EntityType, id: number): void {
  required(
    db.prepare(`SELECT id FROM ${ENTITY_TABLES[type]} WHERE id = ?`).get(id),
    'Khong tim thay ban ghi de gan nhan'
  );
}

/** Danh sach nhan cua mot ban ghi, kem ten nhom de badge phan biet duoc khi trung ten (C6). */
function labelsOfEntity(type: EntityType, id: number): LabelRow[] {
  return db
    .prepare(
      `SELECT l.*, p.name AS group_name
         FROM label_links ll
         JOIN labels l ON l.id = ll.label_id
    LEFT JOIN labels p ON p.id = l.parent_id
        WHERE ll.entity_type = ? AND ll.entity_id = ?
        ORDER BY p.position, l.position, l.id`
    )
    .all(type, id) as LabelRow[];
}

/* ---------- Doc ---------- */

/**
 * Mac dinh tra ve NHAN GAN DUOC (nhan cap 2, dang Active) — dung thu ma
 * menu gan nhan va bo loc can, nen cac man hinh cu khong phai sua gi.
 *
 *   ?tree=1   : tra ve cay nhom -> nhan con kem so ban ghi (man Quan ly nhan)
 *   ?scope=   : chi nhan ap dung cho loai doi tuong do (FR-TAG-30)
 *   ?all=1    : gom ca nhan Inactive
 */
router.get('/', (req, res) => {
  const rows = allLabels();
  const byId = new Map(rows.map((r) => [r.id, r]));
  const usage = usageByLabel();

  if (req.query.tree === '1') {
    const groups = rows.filter((r) => r.parent_id === null);
    const groupUsage = usageByGroup();
    res.json(
      groups.map((group) => ({
        ...group,
        scope_list: parseScope(group.scope),
        used_count: groupUsage.get(group.id) ?? 0,
        children: rows
          .filter((r) => r.parent_id === group.id)
          .map((child) => ({
            ...child,
            group_name: group.name,
            scope_list: effectiveScope(child, byId),
            used_count: usage.get(child.id)?.total ?? 0,
            used_by_type: usage.get(child.id)?.by_type ?? {},
          })),
      }))
    );
    return;
  }

  const scope = req.query.scope === undefined ? null : entityTypeParam(String(req.query.scope));
  const includeInactive = req.query.all === '1';

  const list = rows
    .filter((r) => r.parent_id !== null)
    .filter((r) => {
      if (includeInactive) return true;
      // BR-TAG-15: nhom Inactive thi an ca nhan con
      const parent = byId.get(r.parent_id as number);
      return r.status === 'active' && parent?.status === 'active';
    })
    .filter((r) => {
      if (scope === null) return true;
      const allowed = effectiveScope(r, byId);
      return allowed.length === 0 || allowed.includes(scope);
    })
    .map((r) => ({
      ...r,
      group_name: byId.get(r.parent_id as number)?.name ?? null,
      used_count: usage.get(r.id)?.total ?? 0,
    }));

  list.sort(
    (a, b) =>
      Number(b.is_starred) - Number(a.is_starred) ||
      (byId.get(a.parent_id as number)?.position ?? 0) -
        (byId.get(b.parent_id as number)?.position ?? 0) ||
      a.position - b.position ||
      a.id - b.id
  );
  res.json(list);
});

/**
 * FR-TAG-39: canh bao truoc khi dat ten nhan.
 * - duplicate : trung ten trong cung nhom (chan that su khi luu)
 * - conflict  : trung vai tro voi truong nghiep vu da co (chi canh bao)
 */
router.get('/check-name', (req, res) => {
  const name = String(req.query.name ?? '').trim();
  if (!name) {
    res.json({ duplicate: false, conflict: null });
    return;
  }
  const norm = normName(name);
  const parentId = req.query.parent_id ? Number(req.query.parent_id) : null;
  const exceptId = req.query.id ? Number(req.query.id) : null;

  const duplicate = db
    .prepare(
      `SELECT id FROM labels
        WHERE name_norm = ? AND IFNULL(parent_id, 0) = ? AND id <> IFNULL(?, 0)`
    )
    .get(norm, parentId ?? 0, exceptId) as { id: number } | undefined;

  const service = db.prepare(`SELECT name FROM services WHERE is_active = 1`).all() as {
    name: string;
  }[];
  const hitService = service.find((s) => normName(s.name) === norm);

  let conflict: { field: string; value: string } | null = hitService
    ? { field: 'Danh mục dịch vụ', value: hitService.name }
    : null;
  if (!conflict) {
    for (const term of BUSINESS_TERMS) {
      const hit = term.values.find((v) => normName(v) === norm);
      if (hit) {
        conflict = { field: term.field, value: hit };
        break;
      }
    }
  }

  res.json({ duplicate: Boolean(duplicate), conflict });
});

/** FR-TAG-24: mo danh sach ban ghi dang dung mot nhan. */
router.get('/:id/records', (req, res) => {
  const id = intParam(req.params.id);
  const label = getLabel(id);

  // Nhan cha: gom ban ghi cua toan bo nhan con (AC-TAG-07)
  const ids =
    label.parent_id === null
      ? (db.prepare(`SELECT id FROM labels WHERE parent_id = ?`).all(id) as { id: number }[]).map(
          (r) => r.id
        )
      : [id];
  if (ids.length === 0) {
    res.json([]);
    return;
  }
  const holes = ids.map(() => '?').join(',');
  const links = db
    .prepare(`SELECT DISTINCT entity_type, entity_id FROM label_links WHERE label_id IN (${holes})`)
    .all(...ids) as { entity_type: EntityType; entity_id: number }[];

  const TITLES: Record<EntityType, string> = {
    card: `SELECT id, title AS title FROM cards WHERE id = ?`,
    customer: `SELECT id, name AS title FROM customers WHERE id = ?`,
    deal: `SELECT id, title AS title FROM deals WHERE id = ?`,
    contact: `SELECT id, full_name AS title FROM contacts WHERE id = ?`,
    contract: `SELECT id, name AS title FROM contracts WHERE id = ?`,
  };

  const records = links
    .map((link) => {
      const row = db.prepare(TITLES[link.entity_type]).get(link.entity_id) as
        { id: number; title: string } | undefined;
      return row ? { entity_type: link.entity_type, id: row.id, title: row.title } : null;
    })
    .filter(Boolean);

  res.json(records);
});

/* ---------- Ghi ---------- */

const createSchema = z.object({
  name: z.string().trim().min(1, 'Ten nhan khong duoc de trong').max(MAX_NAME_LENGTH),
  color: z.string().trim().min(1),
  parent_id: z.number().int().nullable().optional(),
  description: z.string().trim().max(200).optional(),
  scope: z.array(z.enum(ENTITY_TYPES as [EntityType, ...EntityType[]])).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

router.post('/', (req, res) => {
  const body = parseBody(createSchema, req);
  const parentId = body.parent_id ?? null;
  if (parentId !== null) assertValidParent(parentId);

  const norm = normName(body.name);
  assertNameFree(norm, parentId);

  const maxPos = db
    .prepare(`SELECT IFNULL(MAX(position), 0) AS p FROM labels WHERE IFNULL(parent_id, 0) = ?`)
    .get(parentId ?? 0) as { p: number };

  const info = db
    .prepare(
      `INSERT INTO labels (name, color, parent_id, description, scope, status, name_norm, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      body.name,
      body.color,
      parentId,
      body.description ?? '',
      JSON.stringify(body.scope ?? []),
      body.status ?? 'active',
      norm,
      maxPos.p + 1
    );
  res.status(201).json(getLabel(Number(info.lastInsertRowid)));
});

const updateSchema = createSchema.partial().extend({
  is_starred: z.boolean().optional(),
  position: z.number().optional(),
});

router.patch('/:id', (req, res) => {
  const id = intParam(req.params.id);
  const body = parseBody(updateSchema, req);
  const label = getLabel(id);

  if (label.is_system === 1 && (body.name !== undefined || body.parent_id !== undefined))
    throw new HttpError(400, 'Khong doi ten hoac di chuyen duoc nhom he thong');

  // FR-TAG-13 / C12: chuyen nhan con sang nhom khac
  let parentId = label.parent_id;
  if (body.parent_id !== undefined) {
    if (body.parent_id === null) {
      if (label.parent_id !== null && labelCount(id) > 0)
        throw new HttpError(400, 'Nhan dang duoc gan cho ban ghi nen khong the chuyen thanh nhom');
      parentId = null;
    } else {
      if (hasChildren(id) > 0)
        throw new HttpError(400, 'Nhom dang co nhan con nen khong the tro thanh nhan con');
      parentId = assertValidParent(body.parent_id, id).id;
    }
  }

  const name = body.name ?? label.name;
  const norm = normName(name);
  if (body.name !== undefined || body.parent_id !== undefined) assertNameFree(norm, parentId, id);

  db.prepare(
    `UPDATE labels
        SET name = ?, name_norm = ?, color = ?, parent_id = ?, description = ?,
            scope = ?, status = ?, is_starred = ?, position = ?
      WHERE id = ?`
  ).run(
    name,
    norm,
    body.color ?? label.color,
    parentId,
    body.description ?? label.description,
    body.scope ? JSON.stringify(body.scope) : label.scope,
    body.status ?? label.status,
    body.is_starred === undefined ? label.is_starred : Number(body.is_starred),
    body.position ?? label.position,
    id
  );
  res.json(getLabel(id));
});

/**
 * BR-TAG-16: nhan dang duoc dung thi khong xoa thang.
 * - Con nhan con        -> 409, phai xu ly nhan con truoc (FR-TAG-15)
 * - Dang gan ban ghi    -> 409 kem so luong; muon xoa that phai goi lai voi ?force=1
 */
router.delete('/:id', (req, res) => {
  const id = intParam(req.params.id);
  const label = getLabel(id);
  if (label.is_system === 1) throw new HttpError(400, 'Khong xoa duoc nhom he thong');

  const children = hasChildren(id);
  if (children > 0)
    throw new HttpError(
      409,
      `Nhom nay con ${children} nhan con. Hay chuyen hoac xoa nhan con truoc.`
    );

  const used = labelCount(id);
  if (used > 0 && req.query.force !== '1') {
    res.status(409).json({
      error: `Nhan "${label.name}" dang duoc dung o ${used} ban ghi`,
      used_count: used,
    });
    return;
  }

  db.prepare(`DELETE FROM labels WHERE id = ?`).run(id);
  res.json({ ok: true, detached: used });
});

/** FR-TAG-31: gop nhan A vao nhan B, giu lai moi lien ket (khong dem trung). */
router.post('/:id/merge', (req, res) => {
  const id = intParam(req.params.id);
  const body = parseBody(z.object({ target_id: z.number().int() }), req);
  const source = getLabel(id);
  const target = getLabel(body.target_id);

  if (source.id === target.id) throw new HttpError(400, 'Khong gop nhan vao chinh no');
  if (source.is_system === 1) throw new HttpError(400, 'Khong gop duoc nhom he thong');
  if ((source.parent_id === null) !== (target.parent_id === null))
    throw new HttpError(400, 'Chi gop duoc hai nhan cung cap');
  if (source.parent_id === null) throw new HttpError(400, 'Chua ho tro gop hai nhom nhan');

  const result = db.transaction(() => {
    const moved = db
      .prepare(
        `INSERT OR IGNORE INTO label_links (label_id, entity_type, entity_id)
         SELECT ?, entity_type, entity_id FROM label_links WHERE label_id = ?`
      )
      .run(target.id, source.id);
    db.prepare(`DELETE FROM labels WHERE id = ?`).run(source.id);
    return moved.changes;
  })();

  res.json({ ok: true, moved: result, used_count: labelCount(target.id) });
});

/* ---------- Gan nhan cho ban ghi (moi loai doi tuong) ---------- */

/**
 * Nhan cua MOI ban ghi thuoc mot loai doi tuong, dang { entity_id: Label[] }.
 *
 * Nho endpoint nay ma danh sach Khach hang / Co hoi hien duoc nhan bang mot
 * truy van duy nhat — khong phai them cot nhan vao API cua cac module do.
 */
router.get('/links/:entityType', (req, res) => {
  const type = entityTypeParam(req.params.entityType);
  const rows = db
    .prepare(
      `SELECT ll.entity_id, l.*, p.name AS group_name
         FROM label_links ll
         JOIN labels l ON l.id = ll.label_id
    LEFT JOIN labels p ON p.id = l.parent_id
        WHERE ll.entity_type = ?
        ORDER BY p.position, l.position, l.id`
    )
    .all(type) as (LabelRow & { entity_id: number; group_name: string | null })[];

  const map: Record<number, unknown[]> = {};
  for (const row of rows) {
    const { entity_id: entityId, ...label } = row;
    (map[entityId] ??= []).push(label);
  }
  res.json(map);
});

router.get('/links/:entityType/:entityId', (req, res) => {
  const type = entityTypeParam(req.params.entityType);
  const id = intParam(req.params.entityId, 'entityId');
  res.json(labelsOfEntity(type, id));
});

/** Ghi de ca tap nhan cua mot ban ghi — cung kieu voi PUT /api/cards/:id/labels. */
router.put('/links/:entityType/:entityId', (req, res) => {
  const type = entityTypeParam(req.params.entityType);
  const id = intParam(req.params.entityId, 'entityId');
  const body = parseBody(z.object({ label_ids: z.array(z.number().int()) }), req);
  assertEntityExists(type, id);

  const ids = [...new Set(body.label_ids)];
  if (ids.length > MAX_LABELS_PER_RECORD)
    throw new HttpError(400, `Moi ban ghi chi gan toi da ${MAX_LABELS_PER_RECORD} nhan`);

  for (const labelId of ids) {
    const label = getLabel(labelId);
    if (label.parent_id === null)
      throw new HttpError(400, `"${label.name}" la nhom nhan nen khong gan truc tiep duoc`);
  }

  db.transaction(() => {
    db.prepare(`DELETE FROM label_links WHERE entity_type = ? AND entity_id = ?`).run(type, id);
    const insert = db.prepare(
      `INSERT OR IGNORE INTO label_links (label_id, entity_type, entity_id) VALUES (?, ?, ?)`
    );
    for (const labelId of ids) insert.run(labelId, type, id);
  })();

  res.json(labelsOfEntity(type, id));
});

/** FR-TAG-10 / FR-TAG-11: gan hoac go mot nhom nhan cho nhieu ban ghi cung luc. */
router.post('/bulk', (req, res) => {
  const body = parseBody(
    z.object({
      action: z.enum(['add', 'remove']),
      label_ids: z.array(z.number().int()).min(1),
      entity_type: z.enum(ENTITY_TYPES as [EntityType, ...EntityType[]]),
      entity_ids: z.array(z.number().int()).min(1),
    }),
    req
  );

  for (const labelId of body.label_ids) {
    const label = getLabel(labelId);
    if (label.parent_id === null)
      throw new HttpError(400, `"${label.name}" la nhom nhan nen khong gan truc tiep duoc`);
  }

  const changed = db.transaction(() => {
    let count = 0;
    if (body.action === 'add') {
      const countLabels = db.prepare(
        `SELECT COUNT(*) AS n FROM label_links WHERE entity_type = ? AND entity_id = ?`
      );
      const insert = db.prepare(
        `INSERT OR IGNORE INTO label_links (label_id, entity_type, entity_id) VALUES (?, ?, ?)`
      );
      for (const entityId of body.entity_ids) {
        const current = (countLabels.get(body.entity_type, entityId) as { n: number }).n;
        if (current + body.label_ids.length > MAX_LABELS_PER_RECORD)
          throw new HttpError(
            400,
            `Co ban ghi se vuot qua ${MAX_LABELS_PER_RECORD} nhan — hay bo bot nhan truoc`
          );
        for (const labelId of body.label_ids)
          count += insert.run(labelId, body.entity_type, entityId).changes;
      }
    } else {
      const remove = db.prepare(
        `DELETE FROM label_links WHERE label_id = ? AND entity_type = ? AND entity_id = ?`
      );
      for (const entityId of body.entity_ids)
        for (const labelId of body.label_ids)
          count += remove.run(labelId, body.entity_type, entityId).changes;
    }
    return count;
  })();

  res.json({ ok: true, changed });
});

export default router;
