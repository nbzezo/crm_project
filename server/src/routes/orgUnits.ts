import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.ts';
import { HttpError, intParam, parseBody, required } from '../lib/validate.ts';
import { actorContactId, requirePermission } from '../middleware/currentUser.ts';
import { assertNoCycle, assertUnitEmpty } from '../services/auth/orgService.ts';

const router = Router();

/* Mot guard duy nhat cho ca router thay vi gan len tung route: mot route
   them sau nay khong the lot luoi. GET can `read`, moi thao tac ghi can
   `update` — them/sua/xoa deu la mot thay doi cau hinh phan quyen. */
router.use((req, res, next) => {
  const action = req.method === 'GET' ? 'read' : 'update';
  requirePermission('admin.org', action)(req, res, next);
});

/*
 * So do to chuc: cay don vi + danh sach loai don vi.
 *
 * Do sau tuy y. "Them mot cap quan ly" la them mot node, khong phai sua code —
 * do la ca diem cua mo hinh nay (xem dau tep migrate-v39.sql).
 */

router.get('/kinds', (_req, res) => {
  res.json(db.prepare('SELECT * FROM org_unit_kinds ORDER BY level_order, id').all());
});

const kindSchema = z.object({
  name: z.string().trim().min(1).max(60),
  level_order: z.number().int().min(0).max(99).optional(),
});

router.post('/kinds', (req, res) => {
  const body = parseBody(kindSchema, req);
  const info = db
    .prepare('INSERT INTO org_unit_kinds (name, level_order) VALUES (?, ?)')
    .run(body.name, body.level_order ?? 0);
  res
    .status(201)
    .json(
      db.prepare('SELECT * FROM org_unit_kinds WHERE id = ?').get(Number(info.lastInsertRowid))
    );
});

router.patch('/kinds/:id', (req, res) => {
  const id = intParam(req.params.id);
  const body = parseBody(kindSchema.partial(), req);
  const current = required(
    db.prepare('SELECT * FROM org_unit_kinds WHERE id = ?').get(id),
    'Khong tim thay loai don vi'
  ) as { name: string; level_order: number };
  db.prepare('UPDATE org_unit_kinds SET name = ?, level_order = ? WHERE id = ?').run(
    body.name ?? current.name,
    body.level_order ?? current.level_order,
    id
  );
  res.json(db.prepare('SELECT * FROM org_unit_kinds WHERE id = ?').get(id));
});

router.delete('/kinds/:id', (req, res) => {
  const id = intParam(req.params.id);
  const used = db.prepare('SELECT COUNT(*) AS n FROM org_units WHERE kind_id = ?').get(id) as {
    n: number;
  };
  if (used.n > 0) throw new HttpError(409, 'Loại đơn vị này đang được dùng');
  db.prepare('DELETE FROM org_unit_kinds WHERE id = ?').run(id);
  res.status(204).end();
});

/* ---------- Cay don vi ---------- */

const UNIT_SELECT = `
  SELECT o.*, k.name AS kind_name, k.level_order,
         h.full_name AS head_name,
         (SELECT COUNT(*) FROM contacts c WHERE c.org_unit_id = o.id AND c.is_active = 1)
           AS member_count
    FROM org_units o
    LEFT JOIN org_unit_kinds k ON k.id = o.kind_id
    LEFT JOIN contacts h ON h.id = o.head_contact_id`;

router.get('/', (_req, res) => {
  /* Tra ve danh sach phang kem parent_id — client tu dung cay. Tra ve cay long
     nhau se buoc client phai duyet de tim mot node, va moi man hinh se tu viet
     mot ham duyet khac nhau. */
  res.json(db.prepare(`${UNIT_SELECT} ORDER BY o.position, o.id`).all());
});

const unitSchema = z.object({
  name: z.string().trim().min(1).max(120),
  parent_id: z.number().int().positive().nullable().optional(),
  kind_id: z.number().int().positive().nullable().optional(),
  code: z.string().trim().max(40).nullable().optional(),
  head_contact_id: z.number().int().positive().nullable().optional(),
  is_active: z.boolean().optional(),
});

router.post('/', (req, res) => {
  const body = parseBody(unitSchema, req);
  if (body.parent_id != null) {
    required(
      db.prepare('SELECT id FROM org_units WHERE id = ?').get(body.parent_id),
      'Khong tim thay don vi cap tren'
    );
  }
  /* Khong dung nextPosition(): no so sanh bang `= ?`, ma `parent_id = NULL` khong
     bao gio khop trong SQL — moi don vi goc se nhan cung mot vi tri. `IS ?` la
     phep so sanh an toan voi NULL cua SQLite. */
  const maxPos = db
    .prepare('SELECT MAX(position) AS maxPos FROM org_units WHERE parent_id IS ?')
    .get(body.parent_id ?? null) as { maxPos: number | null };
  const position = (maxPos.maxPos ?? 0) + 1024;
  const info = db
    .prepare(
      `INSERT INTO org_units (name, parent_id, kind_id, code, head_contact_id, position)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      body.name,
      body.parent_id ?? null,
      body.kind_id ?? null,
      body.code ?? null,
      body.head_contact_id ?? null,
      position
    );
  res
    .status(201)
    .json(db.prepare(`${UNIT_SELECT} WHERE o.id = ?`).get(Number(info.lastInsertRowid)));
});

router.patch('/:id', (req, res) => {
  const id = intParam(req.params.id);
  const body = parseBody(unitSchema.partial(), req);
  const current = required(
    db.prepare('SELECT * FROM org_units WHERE id = ?').get(id),
    'Khong tim thay don vi'
  ) as Record<string, unknown>;

  const parentId =
    body.parent_id === undefined ? (current.parent_id as number | null) : body.parent_id;
  assertNoCycle(id, parentId ?? null);

  db.prepare(
    `UPDATE org_units
        SET name = ?, parent_id = ?, kind_id = ?, code = ?, head_contact_id = ?, is_active = ?
      WHERE id = ?`
  ).run(
    body.name ?? (current.name as string),
    parentId ?? null,
    body.kind_id === undefined ? (current.kind_id as number | null) : body.kind_id,
    body.code === undefined ? (current.code as string | null) : body.code,
    body.head_contact_id === undefined
      ? (current.head_contact_id as number | null)
      : body.head_contact_id,
    body.is_active === undefined ? (current.is_active as number) : body.is_active ? 1 : 0,
    id
  );
  res.json(db.prepare(`${UNIT_SELECT} WHERE o.id = ?`).get(id));
});

router.delete('/:id', (req, res) => {
  const id = intParam(req.params.id);
  required(db.prepare('SELECT id FROM org_units WHERE id = ?').get(id), 'Khong tim thay don vi');
  assertUnitEmpty(id);
  db.prepare('DELETE FROM org_units WHERE id = ?').run(id);
  res.status(204).end();
});

/* ---------- Xep nguoi vao don vi ---------- */

const memberSchema = z.object({
  contact_ids: z.array(z.number().int().positive()).min(1).max(500),
  org_unit_id: z.number().int().positive().nullable(),
});

/**
 * Chuyen nguoi giua cac don vi.
 *
 * Doi `contacts.org_unit_id` la doi PHAM VI cua chinh nguoi do va cua moi quan ly
 * cap tren ho — day la mot thao tac phan quyen, khong phai mot thao tac danh ba,
 * nen no nam o day chu khong o /api/contacts.
 */
router.post('/members', (req, res) => {
  const body = parseBody(memberSchema, req);
  if (body.org_unit_id != null) {
    required(
      db.prepare('SELECT id FROM org_units WHERE id = ?').get(body.org_unit_id),
      'Khong tim thay don vi'
    );
  }
  const update = db.prepare('UPDATE contacts SET org_unit_id = ? WHERE id = ?');
  db.transaction(() => {
    for (const contactId of body.contact_ids) update.run(body.org_unit_id, contactId);
  })();
  res.json({ ok: true, moved: body.contact_ids.length, actor: actorContactId(req) });
});

export default router;
