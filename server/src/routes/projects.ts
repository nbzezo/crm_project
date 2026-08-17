import { Router } from 'express';
import { z } from 'zod';
import { PROJECT_STATUSES, RISK_KINDS, RISK_SEVERITIES, RISK_STATUSES } from '@workflow/contracts';
import { db } from '../db/connection.ts';
import { HttpError, intParam, parseBody, required } from '../lib/validate.ts';
import { auditFromQuery, listChanges, recordChanges } from '../lib/changeLog.ts';
import { buildSearchText, fold } from '../lib/viSearch.ts';
import { assertProjectCustomerChange, resolveAssignee } from '../lib/entityRelations.ts';
import { listTasksByProject } from '../services/cardService.ts';
import { decorateProject, PROJECT_SELECT } from '../services/projectService.ts';
import {
  chooseDeliveryModel,
  classifyProject,
  getRisk,
  listPhases,
  listRisks,
} from '../services/deliveryService.ts';

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
  /* R-13: tieu chi nghiem thu va ho so nghiem thu (dac ta 6.6). */
  acceptance_criteria: z.string().max(5000).optional(),
  accepted_at: dateOnly.optional(),
  accepted_note: z.string().max(2000).nullable().optional(),
});

function assertDateOrder(
  value: Record<string, unknown>,
  startKey: 'plan_start' | 'actual_start',
  endKey: 'plan_end' | 'actual_end',
  label: string
): void {
  const start = value[startKey] as string | null | undefined;
  const end = value[endKey] as string | null | undefined;
  if (start && end && end < start) {
    throw new HttpError(422, `${label} kết thúc không được trước ngày bắt đầu`, {
      code: 'INVALID_DATE_RANGE',
      start_field: startKey,
      end_field: endKey,
    });
  }
}

function assertProjectDates(value: Record<string, unknown>): void {
  assertDateOrder(value, 'plan_start', 'plan_end', 'Kế hoạch');
  assertDateOrder(value, 'actual_start', 'actual_end', 'Thực tế');
}

function assertProjectCanComplete(projectId: number, value: Record<string, unknown>): void {
  if (value.status !== 'done') return;
  const blockers: string[] = [];
  if (!value.actual_end) blockers.push('Chưa có ngày kết thúc thực tế');
  if (!value.accepted_at) blockers.push('Chưa ghi nhận nghiệm thu');
  if (projectId > 0) {
    const openTasks = db
      .prepare(
        `SELECT COUNT(*) AS n FROM cards k
          JOIN lists l ON l.id = k.list_id JOIN boards b ON b.id = l.board_id
         WHERE b.project_id = ? AND k.is_archived = 0 AND k.is_done = 0`
      )
      .get(projectId) as { n: number };
    const openRisks = db
      .prepare(
        `SELECT COUNT(*) AS n FROM project_risks WHERE project_id = ? AND status <> 'closed'`
      )
      .get(projectId) as { n: number };
    if (openTasks.n > 0) blockers.push(`Còn ${openTasks.n} công việc chưa hoàn thành`);
    if (openRisks.n > 0) blockers.push(`Còn ${openRisks.n} rủi ro/vấn đề chưa đóng`);
  }
  if (blockers.length > 0) {
    throw new HttpError(422, 'Dự án chưa đủ điều kiện hoàn thành', {
      code: 'PROJECT_COMPLETION_BLOCKED',
      blockers,
    });
  }
}

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
  /*
   * Co hoi nguon — tu v23 cot `deals.project_id` moi thuc su co du lieu, nen day
   * la duong truy nguoc Delivery -> Sales ma dac ta 3.1 doi hoi. Rang buoc duy
   * nhat cua v23 dam bao danh sach nay co toi da mot dong.
   */
  const deals = db
    .prepare(
      `SELECT d.id, d.title, d.stage, d.value_vnd, d.won_value_vnd, d.handover_ready,
              d.closed_at, c.name AS customer_name
         FROM deals d
         LEFT JOIN customers c ON c.id = d.customer_id
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
    changes: listChanges(db, 'project', id),
    /* Moi Bang cua du an la mot giai doan; trang thai moc tinh khi doc (v26). */
    phases: listPhases(db, id),
    classification: classifyProject(db, id),
    risks: listRisks(db, id),
  });
});

router.post('/', (req, res) => {
  const body = parseBody(projectSchema, req);
  assertProjectDates(body);
  assertProjectCanComplete(0, body);
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
                             plan_end, actual_start, actual_end, budget_vnd, notes,
                             acceptance_criteria, accepted_at, accepted_note, search_text)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      body.acceptance_criteria ?? '',
      body.accepted_at ?? null,
      body.accepted_note ?? null,
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
  assertProjectDates(merged);
  assertProjectCanComplete(id, merged);
  if (body.customer_id !== undefined) {
    assertProjectCustomerChange(db, id, body.customer_id);
  }
  /*
   * Baseline cua du an doi thi phai co dau vet (dac ta 7.4): ngay ke hoach va
   * ngan sach la nhung con so ma sau nay se co nguoi hoi "bao gio no thanh ra
   * the nay". Ghi cung transaction voi ban cap nhat.
   */
  const audit = auditFromQuery(db, req.query);

  db.transaction(() => {
    db.prepare(
      `UPDATE projects SET name = ?, code = ?, customer_id = ?, owner_contact_id = ?, status = ?,
              plan_start = ?, plan_end = ?, actual_start = ?, actual_end = ?, budget_vnd = ?,
              notes = ?, is_archived = ?, acceptance_criteria = ?, accepted_at = ?,
              accepted_note = ?, search_text = ?, updated_at = datetime('now','localtime')
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
      merged.acceptance_criteria ?? '',
      merged.accepted_at ?? null,
      merged.accepted_note ?? null,
      buildSearchText(
        merged.name as string,
        merged.code as string | null,
        merged.notes as string | null
      ),
      id
    );
    if (body.customer_id !== undefined) {
      /* Board la lop chua cua du an: khi doi tai khoan du an, dong bo ban sao
         phuc vu loc nhanh tren Board trong cung transaction. */
      db.prepare(`UPDATE boards SET customer_id = ? WHERE project_id = ?`).run(
        body.customer_id,
        id
      );
    }
    recordChanges(db, 'project', id, current, body, audit);
  })();

  res.json(
    decorateProject(
      db.prepare(`${PROJECT_SELECT} WHERE p.id = ?`).get(id) as Record<string, unknown>
    )
  );
});

/* ---------- R-11: phan loai mo hinh trien khai ---------- */

router.get('/:id/classification', (req, res) => {
  res.json(classifyProject(db, intParam(req.params.id)));
});

router.put('/:id/model', (req, res) => {
  const id = intParam(req.params.id);
  const body = parseBody(
    z.object({
      model: z.enum(['A', 'B']),
      reason: z.string().max(1000).nullable().optional(),
    }),
    req
  );
  const current = required(
    db.prepare(`SELECT delivery_model FROM projects WHERE id = ?`).get(id),
    'Khong tim thay du an'
  ) as Record<string, unknown>;
  const audit = auditFromQuery(db, req.query);

  const result = chooseDeliveryModel(db, id, body.model, body.reason ?? null);
  recordChanges(db, 'project', id, current, { delivery_model: body.model }, audit);
  res.json(result);
});

/* ---------- R-13: so rui ro / van de / Change Request / quyet dinh ---------- */

const riskSchema = z.object({
  kind: z.enum(RISK_KINDS).optional(),
  title: z.string().trim().min(1, 'Tieu de khong duoc de trong').max(300),
  detail: z.string().max(5000).optional(),
  severity: z.enum(RISK_SEVERITIES).optional(),
  status: z.enum(RISK_STATUSES).optional(),
  owner_contact_id: z.number().int().positive().nullable().optional(),
  due_date: dateOnly.optional(),
  resolution: z.string().max(2000).nullable().optional(),
});

router.get('/:id/risks', (req, res) => {
  res.json(listRisks(db, intParam(req.params.id)));
});

router.post('/:id/risks', (req, res) => {
  const id = intParam(req.params.id);
  const body = parseBody(riskSchema, req);
  required(db.prepare(`SELECT id FROM projects WHERE id = ?`).get(id), 'Khong tim thay du an');
  if (body.owner_contact_id != null) resolveAssignee(db, body.owner_contact_id);

  const info = db
    .prepare(
      `INSERT INTO project_risks
         (project_id, kind, title, detail, severity, status, owner_contact_id, due_date, resolution)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      body.kind ?? 'risk',
      body.title,
      body.detail ?? '',
      body.severity ?? 'medium',
      body.status ?? 'open',
      body.owner_contact_id ?? null,
      body.due_date ?? null,
      body.resolution ?? null
    );
  res.status(201).json(getRisk(db, Number(info.lastInsertRowid)));
});

router.patch('/:id/risks/:riskId', (req, res) => {
  const id = intParam(req.params.id);
  const riskId = intParam(req.params.riskId, 'riskId');
  const body = parseBody(riskSchema.partial(), req);
  const current = required(
    db.prepare(`SELECT * FROM project_risks WHERE id = ? AND project_id = ?`).get(riskId, id),
    'Khong tim thay muc trong so rui ro'
  ) as Record<string, unknown>;
  if (body.owner_contact_id != null) resolveAssignee(db, body.owner_contact_id);

  const merged = { ...current, ...body };
  db.prepare(
    `UPDATE project_risks
        SET kind = ?, title = ?, detail = ?, severity = ?, status = ?, owner_contact_id = ?,
            due_date = ?, resolution = ?,
            /* Dong moc thoi gian dong chi dat mot lan, va xoa khi mo lai. */
            closed_at = CASE WHEN ? = 'closed' THEN COALESCE(closed_at, datetime('now','localtime'))
                             ELSE NULL END,
            updated_at = datetime('now','localtime')
      WHERE id = ?`
  ).run(
    merged.kind,
    merged.title,
    merged.detail ?? '',
    merged.severity,
    merged.status,
    merged.owner_contact_id ?? null,
    merged.due_date ?? null,
    merged.resolution ?? null,
    merged.status,
    riskId
  );
  res.json(getRisk(db, riskId));
});

router.delete('/:id/risks/:riskId', (req, res) => {
  const id = intParam(req.params.id);
  const riskId = intParam(req.params.riskId, 'riskId');
  db.prepare(`DELETE FROM project_risks WHERE id = ? AND project_id = ?`).run(riskId, id);
  res.json({ ok: true });
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
