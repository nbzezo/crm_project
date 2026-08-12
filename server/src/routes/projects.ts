import { Router } from 'express';
import { z } from 'zod';
import { PROJECT_STATUSES } from '@workflow/contracts';
import { db } from '../db/connection.ts';
import { intParam, parseBody, required } from '../lib/validate.ts';
import { buildSearchText, fold } from '../lib/viSearch.ts';
import { resolveAssignee } from '../lib/entityRelations.ts';
import { listTasksByProject } from '../services/cardService.ts';
import { decorateProject, PROJECT_SELECT } from '../services/projectService.ts';

const router = Router();

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngay phai dang YYYY-MM-DD')
  .nullable();

const projectSchema = z.object({
  name: z.string().trim().min(1, 'Ten du an khong duoc de trong').max(200),
  code: z.string().max(50).nullable().optional(),
  customer_id: z.number().int().positive().nullable().optional(),
  owner_contact_id: z.number().int().positive().nullable().optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  plan_start: dateOnly.optional(),
  plan_end: dateOnly.optional(),
  actual_start: dateOnly.optional(),
  actual_end: dateOnly.optional(),
  budget_vnd: z.number().int().min(0).optional(),
  notes: z.string().max(5000).optional(),
  is_archived: z.boolean().optional(),
});

router.get('/', (req, res) => {
  const where = ['1 = 1'];
  const params: unknown[] = [];
  if (req.query.archived !== '1') where.push('p.is_archived = 0');
  if (req.query.status) {
    where.push('p.status = ?');
    params.push(String(req.query.status));
  }
  if (req.query.customer_id) {
    where.push('p.customer_id = ?');
    params.push(Number(req.query.customer_id));
  }
  const q = fold(String(req.query.q ?? '').trim());
  if (q) {
    where.push(`p.search_text LIKE '%' || ? || '%'`);
    params.push(q);
  }

  const rows = db
    .prepare(
      `${PROJECT_SELECT} WHERE ${where.join(' AND ')}
        ORDER BY p.status = 'done', p.status = 'cancelled',
                 p.plan_end IS NULL, p.plan_end, p.id DESC`
    )
    .all(...params) as Record<string, unknown>[];
  res.json(rows.map(decorateProject));
});

router.get('/:id', (req, res) => {
  const id = intParam(req.params.id);
  const project = decorateProject(
    required(
      db.prepare(`${PROJECT_SELECT} WHERE p.id = ?`).get(id),
      'Khong tim thay du an'
    ) as Record<string, unknown>
  );

  const boards = db
    .prepare(
      `SELECT b.id, b.name, b.background, b.is_archived,
              (SELECT COUNT(*) FROM cards k JOIN lists l ON l.id = k.list_id
                WHERE l.board_id = b.id AND k.is_archived = 0) AS card_count
         FROM boards b WHERE b.project_id = ? ORDER BY b.is_archived, b.id`
    )
    .all(id);
  const contracts = db
    .prepare(
      `SELECT ct.id, ct.name, ct.number, ct.value_vnd, ct.status, ct.end_date,
              c.name AS customer_name
         FROM contracts ct LEFT JOIN customers c ON c.id = ct.customer_id
        WHERE ct.project_id = ? ORDER BY ct.end_date IS NULL, ct.end_date`
    )
    .all(id);
  const deals = db
    .prepare(
      `SELECT d.id, d.title, d.stage, d.value_vnd FROM deals d
        WHERE d.project_id = ? ORDER BY d.id DESC`
    )
    .all(id);

  /*
   * Nhan su cua du an — suy ra tu nguoi phu trach cac cong viec, khong phai mot
   * bang thanh vien rieng. Danh sach thanh vien khai bao tay luon lech voi thuc
   * te: nguoi roi du an van con trong danh sach, nguoi moi vao thi chua co.
   */
  const people = db
    .prepare(
      `SELECT k.assignee_contact_id AS contact_id, ac.full_name, ac.phone, ac.email, ac.zalo,
              ao.id AS org_id, ao.name AS org_name, ao.org_kind,
              COUNT(*) AS task_total,
              SUM(CASE WHEN k.is_done = 0 THEN 1 ELSE 0 END) AS open_count,
              SUM(CASE WHEN k.is_done = 0 AND k.due_date IS NOT NULL
                        AND k.due_date < date('now','localtime') THEN 1 ELSE 0 END) AS overdue_count
         FROM cards k
         JOIN lists l ON l.id = k.list_id
         JOIN boards b ON b.id = l.board_id
         JOIN contacts ac ON ac.id = k.assignee_contact_id
         LEFT JOIN customers ao ON ao.id = k.assignee_org_id
        WHERE b.project_id = ? AND k.is_archived = 0
        GROUP BY k.assignee_contact_id
        ORDER BY overdue_count DESC, open_count DESC`
    )
    .all(id);

  res.json({
    ...project,
    boards,
    contracts,
    deals,
    people,
    tasks: listTasksByProject(id),
  });
});

router.post('/', (req, res) => {
  const body = parseBody(projectSchema, req);
  // Nguoi phu trach du an chiu chung rang buoc "con hoat dong" voi nguoi phu trach viec.
  const owner = resolveAssignee(db, body.owner_contact_id).assignee_contact_id;
  if (body.customer_id != null) {
    required(
      db.prepare(`SELECT id FROM customers WHERE id = ?`).get(body.customer_id),
      'Khong tim thay khach hang'
    );
  }

  const info = db
    .prepare(
      `INSERT INTO projects (name, code, customer_id, owner_contact_id, status, plan_start,
                             plan_end, actual_start, actual_end, budget_vnd, notes, search_text)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      body.name,
      body.code ?? null,
      body.customer_id ?? null,
      owner,
      body.status ?? 'planning',
      body.plan_start ?? null,
      body.plan_end ?? null,
      body.actual_start ?? null,
      body.actual_end ?? null,
      body.budget_vnd ?? 0,
      body.notes ?? '',
      buildSearchText(body.name, body.code, body.notes)
    );

  res
    .status(201)
    .json(
      decorateProject(
        db.prepare(`${PROJECT_SELECT} WHERE p.id = ?`).get(Number(info.lastInsertRowid)) as Record<
          string,
          unknown
        >
      )
    );
});

router.patch('/:id', (req, res) => {
  const id = intParam(req.params.id);
  const body = parseBody(projectSchema.partial(), req);
  const current = required(
    db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id),
    'Khong tim thay du an'
  ) as Record<string, unknown>;

  if (body.owner_contact_id !== undefined) resolveAssignee(db, body.owner_contact_id);
  if (body.customer_id != null) {
    required(
      db.prepare(`SELECT id FROM customers WHERE id = ?`).get(body.customer_id),
      'Khong tim thay khach hang'
    );
  }

  const merged = { ...current, ...body } as Record<string, unknown>;
  db.prepare(
    `UPDATE projects SET name = ?, code = ?, customer_id = ?, owner_contact_id = ?, status = ?,
            plan_start = ?, plan_end = ?, actual_start = ?, actual_end = ?, budget_vnd = ?,
            notes = ?, is_archived = ?, search_text = ?, updated_at = datetime('now','localtime')
      WHERE id = ?`
  ).run(
    merged.name,
    merged.code ?? null,
    merged.customer_id ?? null,
    merged.owner_contact_id ?? null,
    merged.status ?? 'planning',
    merged.plan_start ?? null,
    merged.plan_end ?? null,
    merged.actual_start ?? null,
    merged.actual_end ?? null,
    merged.budget_vnd ?? 0,
    merged.notes ?? '',
    merged.is_archived ? 1 : 0,
    buildSearchText(
      merged.name as string,
      merged.code as string | null,
      merged.notes as string | null
    ),
    id
  );

  res.json(
    decorateProject(
      db.prepare(`${PROJECT_SELECT} WHERE p.id = ?`).get(id) as Record<string, unknown>
    )
  );
});

/**
 * Xoa du an KHONG xoa cong viec hay bang ben trong.
 *
 * Khoa ngoai deu la ON DELETE SET NULL: du an chi la mot lop nhom ben tren, con
 * cong viec la du lieu that. Xoa nham mot du an ma mat theo ba thang cong viec la
 * mat mat khong the hoan tac.
 */
router.delete('/:id', (req, res) => {
  const id = intParam(req.params.id);
  db.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
  res.json({ ok: true });
});

export default router;
