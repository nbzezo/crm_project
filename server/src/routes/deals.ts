import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.ts';
import { HttpError, intParam, parseBody, required } from '../lib/validate.ts';
import { computeMovePosition, nextPosition } from '../lib/position.ts';
import { buildSearchText } from '../lib/viSearch.ts';
import { LOST_REASONS, STAGES, STAGE_PROBABILITY, isClosed } from '../lib/crm.ts';
import { assertEntityLinks } from '../lib/entityRelations.ts';
import { applyDealScoreTransition, evaluateStageGate } from '../services/dealService.ts';

const router = Router();

export { STAGES };

const stageEnum = z.enum(STAGES);
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();

const dealSchema = z.object({
  customer_id: z.number().int(),
  contact_id: z.number().int().nullable().optional(),
  title: z.string().trim().min(1, 'Ten co hoi khong duoc de trong'),
  product: z.string().nullable().optional(),
  stage: stageEnum.optional(),
  probability: z.number().int().min(0).max(100).optional(),
  value_vnd: z.number().int().min(0).optional(),
  won_value_vnd: z.number().int().min(0).nullable().optional(),
  expected_close_date: dateOnly.optional(),
  source: z.string().nullable().optional(),
  need: z.string().nullable().optional(),
  competitor: z.string().nullable().optional(),
  next_action: z.string().nullable().optional(),
  next_action_date: dateOnly.optional(),
  lost_reason: z.enum(LOST_REASONS).nullable().optional(),
  lost_note: z.string().nullable().optional(),
  is_renewal: z.boolean().optional(),
  notes: z.string().optional(),
});

/**
 * Cot phu tinh san cho moi co hoi:
 *  - days_idle: so ngay ke tu tuong tac gan nhat (FR-PIP-04)
 *  - is_stale / next_action_overdue / close_overdue: co canh bao (BR-06, BR-07)
 */
const DEAL_SELECT = `
  SELECT d.*, c.name AS customer_name, ct.full_name AS contact_name,
         (SELECT MAX(i.occurred_at) FROM interactions i WHERE i.deal_id = d.id) AS last_activity_at,
         CAST(julianday('now','localtime') -
              julianday(COALESCE((SELECT MAX(substr(i.occurred_at,1,10)) FROM interactions i WHERE i.deal_id = d.id),
                                 substr(d.created_at,1,10))) AS INTEGER) AS days_idle,
         (SELECT COUNT(*) FROM quotations q WHERE q.deal_id = d.id) AS quotation_count,
         (SELECT COUNT(*) FROM contracts k WHERE k.deal_id = d.id) AS contract_count,
         s.quadrant, s.score_age_days, s.v1_no_event, s.v2_no_economic, s.v3_shaped
    FROM deals d
    JOIN customers c ON c.id = d.customer_id
    LEFT JOIN contacts ct ON ct.id = d.contact_id
    JOIN deal_scorecard s ON s.deal_id = d.id`;

function reload(id: number) {
  return db.prepare(`${DEAL_SELECT} WHERE d.id = ?`).get(id);
}

router.get('/', (req, res) => {
  const customerId = req.query.customer_id ? Number(req.query.customer_id) : null;
  const rows = db
    .prepare(`${DEAL_SELECT} WHERE (? IS NULL OR d.customer_id = ?) ORDER BY d.position, d.id`)
    .all(customerId, customerId) as {
    stage: string;
    value_vnd: number;
    probability: number;
  }[];

  const byStage: Record<string, unknown[]> = {};
  const totals: Record<string, { count: number; sum_vnd: number; weighted_vnd: number }> = {};
  for (const stage of STAGES) {
    byStage[stage] = [];
    totals[stage] = { count: 0, sum_vnd: 0, weighted_vnd: 0 };
  }
  for (const row of rows) {
    byStage[row.stage].push(row);
    totals[row.stage].count += 1;
    totals[row.stage].sum_vnd += row.value_vnd;
    totals[row.stage].weighted_vnd += Math.round((row.value_vnd * row.probability) / 100);
  }
  res.json({ stages: byStage, totals });
});

router.post('/', (req, res) => {
  const body = parseBody(dealSchema, req);
  assertEntityLinks(db, body);
  const stage = body.stage ?? 'lead';
  if (stage === 'lost' && !body.lost_reason)
    throw new HttpError(400, 'Phai chon ly do khi chuyen sang Thua'); // BR-03

  const position = nextPosition({ table: 'deals', scopeCol: 'stage', scopeVal: stage });
  const probability = body.probability ?? STAGE_PROBABILITY[stage];
  const info = db
    .prepare(
      `INSERT INTO deals (customer_id, contact_id, title, product, stage, probability, value_vnd,
                          position, expected_close_date, source, need, competitor,
                          next_action, next_action_date, lost_reason, lost_note, is_renewal, notes,
                          search_text, closed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               ${isClosed(stage) ? `datetime('now','localtime')` : 'NULL'})`
    )
    .run(
      body.customer_id,
      body.contact_id ?? null,
      body.title,
      body.product ?? null,
      stage,
      probability,
      body.value_vnd ?? 0,
      position,
      body.expected_close_date ?? null,
      body.source ?? null,
      body.need ?? null,
      body.competitor ?? null,
      body.next_action ?? null,
      body.next_action_date ?? null,
      body.lost_reason ?? null,
      body.lost_note ?? null,
      body.is_renewal ? 1 : 0,
      body.notes ?? '',
      buildSearchText(body.title, body.product, body.need, body.notes)
    );
  res.status(201).json(reload(Number(info.lastInsertRowid)));
});

router.get('/:id', (req, res) => {
  const id = intParam(req.params.id);
  const deal = required(reload(id), 'Khong tim thay co hoi') as Record<string, unknown>;
  const quotations = db
    .prepare(`SELECT * FROM quotations WHERE deal_id = ? ORDER BY version DESC, id DESC`)
    .all(id);
  const contracts = db.prepare(`SELECT * FROM contracts WHERE deal_id = ?`).all(id);
  const documents = db
    .prepare(`SELECT * FROM documents WHERE deal_id = ? ORDER BY created_at DESC`)
    .all(id);
  const activities = db
    .prepare(
      `SELECT i.*, ct.full_name AS contact_name FROM interactions i
         LEFT JOIN contacts ct ON ct.id = i.contact_id
        WHERE i.deal_id = ? ORDER BY i.occurred_at DESC`
    )
    .all(id);
  const tasks = db
    .prepare(
      `SELECT k.id, k.title, k.due_date, k.priority, k.is_done, l.name AS list_name, b.name AS board_name
         FROM cards k JOIN lists l ON l.id = k.list_id JOIN boards b ON b.id = l.board_id
        WHERE k.deal_id = ? AND k.is_archived = 0 ORDER BY k.is_done, k.due_date`
    )
    .all(id);
  res.json({ ...deal, quotations, contracts, documents, activities, tasks });
});

/** Cap nhat co hoi — ap dung BR-03/04/05 ve ly do Lost va xac suat. */
function applyStageRules(
  fields: string[],
  values: unknown[],
  stage: string,
  body: { probability?: number; lost_reason?: string | null; lost_note?: string | null }
) {
  fields.push('stage = ?');
  values.push(stage);
  fields.push('probability = ?');
  values.push(
    stage === 'won'
      ? 100
      : stage === 'lost'
        ? 0
        : (body.probability ?? STAGE_PROBABILITY[stage as never])
  );
  fields.push(
    isClosed(stage as never) ? `closed_at = datetime('now','localtime')` : `closed_at = NULL`
  );
  if (stage === 'lost') {
    fields.push('lost_reason = ?', 'lost_note = ?');
    values.push(body.lost_reason ?? null, body.lost_note ?? null);
  } else {
    fields.push('lost_reason = NULL', 'lost_note = NULL');
  }
}

/**
 * F-04 cong giai doan: chan chuyen giai doan khi diem BANT chua du.
 *
 * Ba rang buoc bat buoc theo muc C15/C16/C17 cua ban ra soat:
 * - keo sang 'lost' KHONG BAO GIO bi chan (neu khong se khong dong duoc deal xau);
 * - bi chan thi tra 409 kem danh sach viec dang thieu de giao dien chi dung cho;
 * - ghi de duoc, nhung ly do la bat buoc va duoc ghi vao deal_score_history.
 */
router.patch('/:id', (req, res) => {
  const id = intParam(req.params.id);
  const body = parseBody(dealSchema.partial(), req);
  const current = required(
    db.prepare(`SELECT * FROM deals WHERE id = ?`).get(id),
    'Khong tim thay co hoi'
  ) as Record<string, unknown>;
  const merged = { ...current, ...body };
  assertEntityLinks(db, {
    customer_id: merged.customer_id as number,
    contact_id: merged.contact_id as number | null,
  });

  const nextStage = body.stage ?? (current.stage as string);
  if (nextStage === 'lost' && !(body.lost_reason ?? current.lost_reason))
    throw new HttpError(400, 'Phai chon lý do khi chuyển cơ hội sang Thua');

  const fields: string[] = [];
  const values: unknown[] = [];
  const set = (sql: string, value: unknown) => {
    fields.push(sql);
    values.push(value);
  };

  const simple: [keyof typeof body, string][] = [
    ['customer_id', 'customer_id'],
    ['contact_id', 'contact_id'],
    ['title', 'title'],
    ['product', 'product'],
    ['value_vnd', 'value_vnd'],
    ['won_value_vnd', 'won_value_vnd'],
    ['expected_close_date', 'expected_close_date'],
    ['source', 'source'],
    ['need', 'need'],
    ['competitor', 'competitor'],
    ['next_action', 'next_action'],
    ['next_action_date', 'next_action_date'],
    ['notes', 'notes'],
  ];
  for (const [key, column] of simple) if (body[key] !== undefined) set(`${column} = ?`, body[key]);
  if (body.is_renewal !== undefined) set('is_renewal = ?', body.is_renewal ? 1 : 0);

  let overrideHistory: string | null = null;
  if (body.stage !== undefined && body.stage !== current.stage) {
    overrideHistory = evaluateStageGate(id, body.stage, current.stage as string, req.query);
    applyStageRules(fields, values, body.stage, body);
    set('position = ?', nextPosition({ table: 'deals', scopeCol: 'stage', scopeVal: body.stage }));
  } else if (body.probability !== undefined) {
    set('probability = ?', body.probability);
  } else if (body.lost_reason !== undefined || body.lost_note !== undefined) {
    if (body.lost_reason !== undefined) set('lost_reason = ?', body.lost_reason);
    if (body.lost_note !== undefined) set('lost_note = ?', body.lost_note);
  }

  if (body.title !== undefined || body.need !== undefined || body.notes !== undefined)
    set(
      'search_text = ?',
      buildSearchText(
        (body.title ?? current.title) as string,
        (body.product ?? current.product) as string,
        (body.need ?? current.need) as string,
        (body.notes ?? current.notes) as string
      )
    );

  db.transaction(() => {
    if (fields.length > 0) {
      fields.push(`updated_at = datetime('now','localtime')`);
      db.prepare(`UPDATE deals SET ${fields.join(', ')} WHERE id = ?`).run(...values, id);
    }
    if (body.stage !== undefined && body.stage !== current.stage)
      applyDealScoreTransition(id, body.stage, current.stage as string, overrideHistory);
  })();
  res.json(reload(id));
});

router.patch('/:id/move', (req, res) => {
  const id = intParam(req.params.id);
  const body = parseBody(
    z.object({
      stage: stageEnum,
      beforeId: z.number().int().nullable().optional(),
      afterId: z.number().int().nullable().optional(),
      lost_reason: z.enum(LOST_REASONS).nullable().optional(),
      lost_note: z.string().nullable().optional(),
    }),
    req
  );
  const current = required(
    db.prepare(`SELECT * FROM deals WHERE id = ?`).get(id),
    'Khong tim thay co hoi'
  ) as Record<string, unknown>;

  // BR-03: khong cho chuyen sang Thua neu chua co ly do
  if (body.stage === 'lost' && !(body.lost_reason ?? current.lost_reason))
    throw new HttpError(409, 'NEED_LOST_REASON');

  // F-04: kiem tra truoc khi mo giao dich de khong ghi nua chung
  const overrideHistory = evaluateStageGate(id, body.stage, current.stage as string, req.query);

  db.transaction(() => {
    if (body.stage !== current.stage) {
      const fields: string[] = [];
      const values: unknown[] = [];
      applyStageRules(fields, values, body.stage, body);
      fields.push(`updated_at = datetime('now','localtime')`);
      db.prepare(`UPDATE deals SET ${fields.join(', ')} WHERE id = ?`).run(...values, id);
    }
    const pos = computeMovePosition(
      { table: 'deals', scopeCol: 'stage', scopeVal: body.stage },
      body.beforeId,
      body.afterId,
      id
    );
    db.prepare(`UPDATE deals SET position = ? WHERE id = ?`).run(pos, id);
    applyDealScoreTransition(id, body.stage, current.stage as string, overrideHistory);
  })();
  res.json(reload(id));
});

router.delete('/:id', (req, res) => {
  const id = intParam(req.params.id);
  db.prepare(`DELETE FROM deals WHERE id = ?`).run(id);
  res.json({ ok: true });
});

export default router;
