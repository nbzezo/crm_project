import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.ts';
import { HttpError, intParam, parseBody, required } from '../lib/validate.ts';
import { computeMovePosition, nextPosition } from '../lib/position.ts';
import { buildSearchText } from '../lib/viSearch.ts';
import { LOST_REASONS, STAGES, STAGE_PROBABILITY, isClosed } from '../lib/crm.ts';
import { assertCrmCustomer, assertEntityLinks } from '../lib/entityRelations.ts';
import {
  auditFromQuery,
  listChanges,
  recordChanges,
  type RecordOptions,
} from '../lib/changeLog.ts';
import {
  applyHandoverTemplate,
  getHandoverSettings,
  listHandoverItems,
  syncHandoverReady,
} from '../services/handoverService.ts';
import {
  applyDealScoreTransition,
  assertProjectLink,
  evaluateStageGate,
} from '../services/dealService.ts';
import { listTasksByLink } from '../services/cardService.ts';
import { decorateProject, PROJECT_SELECT } from '../services/projectService.ts';

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
  /**
   * Du an trien khai sinh ra tu co hoi nay (v23).
   *
   * Nhan ca luc TAO chu khong chi luc sua: khi bat tinh nang nay len, viec dau
   * tien nguoi dung lam la ghi nhan lai cac cap co hoi/du an DA co san ngoai doi
   * thuc — cam o buoc tao se bat ho luu hai lan cho moi ban ghi lich su.
   */
  project_id: z.number().int().positive().nullable().optional(),
  /** Ho so ban giao da du de Delivery tiep nhan (dac ta 6.1). */
  handover_ready: z.boolean().optional(),
});

/**
 * Cac truong CHI sua duoc sau khi co hoi da ton tai (v27).
 *
 * Du lieu PoC chi phat sinh khi khach hang bat dau thu nghiem, va trang thai tam
 * dung thi khong the co ngay o lan tao dau tien. De chung ngoai `dealSchema`
 * giup buoc TAO khong phai mang theo tam cot ma khong ai dien.
 */
const dealPatchSchema = dealSchema.partial().extend({
  poc_scope: z.string().max(2000).nullable().optional(),
  poc_start_date: dateOnly.optional(),
  poc_end_date: dateOnly.optional(),
  poc_criteria: z.string().max(2000).nullable().optional(),
  poc_result: z.string().max(2000).nullable().optional(),
  on_hold: z.boolean().optional(),
  on_hold_reason: z.string().max(1000).nullable().optional(),
  on_hold_review_date: dateOnly.optional(),
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
         s.quadrant, s.score_age_days, s.v1_no_event, s.v2_no_economic, s.v3_shaped,
         pj.name AS project_name, pj.status AS project_status,
         (SELECT COUNT(*) FROM deal_handover_items h WHERE h.deal_id = d.id) AS handover_count,
         /* R-08: thoi gian luu tai giai doan hien tai (dac ta 5.5). Tinh khi doc
            tu moc doi giai doan gan nhat; co hoi cu chua co moc thi roi ve ngay tao. */
         CAST(julianday('now','localtime')
              - julianday(COALESCE(d.stage_entered_at, d.created_at)) AS INTEGER) AS days_in_stage
    FROM deals d
    JOIN customers c ON c.id = d.customer_id AND c.org_kind = 'customer'
    LEFT JOIN contacts ct ON ct.id = d.contact_id
    JOIN deal_scorecard s ON s.deal_id = d.id
    LEFT JOIN projects pj ON pj.id = d.project_id`;

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
  assertCrmCustomer(db, body.customer_id);
  assertProjectLink(0, body.project_id, body.customer_id);
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
                          project_id, handover_ready, search_text, closed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
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
      body.project_id ?? null,
      body.handover_ready ? 1 : 0,
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
    .prepare(
      `SELECT * FROM documents WHERE deal_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`
    )
    .all(id);
  const activities = db
    .prepare(
      `SELECT i.*, ct.full_name AS contact_name FROM interactions i
         LEFT JOIN contacts ct ON ct.id = i.contact_id
        WHERE i.deal_id = ? ORDER BY i.occurred_at DESC`
    )
    .all(id);
  const tasks = listTasksByLink('deal_id', id);

  /*
   * Du an trien khai — dac ta 7.4: tren Opportunity CHI dong bo thong tin tong
   * quan, khong sao chep noi dung. `decorateProject` tra ve dung nhung thu do
   * (trang thai, % tien do, suc khoe, so viec qua han) va chung deu duoc tinh
   * khi doc, nen khong co ban sao nao de lech voi ban goc.
   */
  const projectRow = deal.project_id
    ? (db.prepare(`${PROJECT_SELECT} WHERE p.id = ?`).get(deal.project_id) as
        Record<string, unknown> | undefined)
    : undefined;
  const project = projectRow ? decorateProject(projectRow) : null;
  const changes = listChanges(db, 'deal', id);

  res.json({
    ...deal,
    project,
    quotations,
    contracts,
    documents,
    activities,
    tasks,
    changes,
    handover: listHandoverItems(db, id),
  });
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
  /* R-08: moc dem tuoi giai doan. Chi ham nay duoc ghi cot do — no la NOI DUY
     NHAT trong ma nguon lam co hoi doi giai doan, nen dat o day thi khong co
     duong nao doi stage ma quen cap nhat moc. */
  fields.push(`stage_entered_at = datetime('now','localtime')`);
  /* Chuyen giai doan la mot dong thai co y — co hoi khong con "tam dung" nua. */
  fields.push('on_hold = 0', 'on_hold_reason = NULL', 'on_hold_review_date = NULL');
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
  const body = parseBody(dealPatchSchema, req);
  const current = required(
    db.prepare(`SELECT * FROM deals WHERE id = ?`).get(id),
    'Khong tim thay co hoi'
  ) as Record<string, unknown>;

  /* S08: tam dung phai co ly do va ngay xem xet lai (dac ta 5.2), neu khong no
     chi la mot co hoi bi bo quen mang mot cai nhan de chiu hon. */
  if (body.on_hold === true) {
    const reason = (body.on_hold_reason ?? current.on_hold_reason) as string | null;
    const review = (body.on_hold_review_date ?? current.on_hold_review_date) as string | null;
    if (!reason?.trim() || !review) {
      throw new HttpError(422, 'Tạm dừng phải kèm lý do và ngày xem xét lại', {
        code: 'ON_HOLD_NEEDS_REASON',
      });
    }
  }
  const merged = { ...current, ...body };
  assertEntityLinks(db, {
    customer_id: merged.customer_id as number,
    contact_id: merged.contact_id as number | null,
  });
  assertCrmCustomer(db, merged.customer_id as number);
  /*
   * Kiem lai ca khi chi doi khach hang: co hoi doi sang khach khac trong khi van
   * giu du an cu la dung kieu lech ma rang buoc nay sinh ra de chan.
   */
  if (body.project_id !== undefined || body.customer_id !== undefined)
    assertProjectLink(id, merged.project_id as number | null, merged.customer_id as number | null);

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
    // null la gia tri hop le: nguoi dung go lien ket du an khoi co hoi.
    ['project_id', 'project_id'],
    ['poc_scope', 'poc_scope'],
    ['poc_start_date', 'poc_start_date'],
    ['poc_end_date', 'poc_end_date'],
    ['poc_criteria', 'poc_criteria'],
    ['poc_result', 'poc_result'],
  ];
  for (const [key, column] of simple) if (body[key] !== undefined) set(`${column} = ?`, body[key]);
  if (body.is_renewal !== undefined) set('is_renewal = ?', body.is_renewal ? 1 : 0);
  if (body.handover_ready !== undefined) {
    const checklist = db
      .prepare(`SELECT COUNT(*) AS n FROM deal_handover_items WHERE deal_id = ?`)
      .get(id) as { n: number };
    if (checklist.n > 0) {
      throw new HttpError(409, 'Trạng thái bàn giao được tính tự động từ checklist', {
        code: 'HANDOVER_MANAGED_BY_CHECKLIST',
      });
    }
    set('handover_ready = ?', body.handover_ready ? 1 : 0);
  }

  /*
   * Tam dung va hai truong di kem duoc xu ly CHUNG mot cho, khong roi vao vong
   * `simple` o tren: bo tam dung thi phai don luon ly do va ngay xem xet, va neu
   * hai duong ghi cung dat vao mot cot thi cau UPDATE se mang hai menh de gan
   * cho cung mot ten.
   *
   * Bo qua han khi giai doan dang doi: `applyStageRules` da xoa tam dung roi (doi
   * giai doan nghia la co hoi chay tiep), va viet them lan nua o day se sinh dung
   * cai cau UPDATE gan trung cot noi tren.
   */
  /* Giu gia tri thay vi mot co boolean: TypeScript can chinh no de thu hep
     `body.stage` xuong Stage o nhanh ben duoi. */
  const changedStage = body.stage !== undefined && body.stage !== current.stage ? body.stage : null;
  if (changedStage !== null) {
    /* Khong lam gi — cho applyStageRules quyet dinh. */
  } else if (body.on_hold === false) {
    set('on_hold = ?', 0);
    fields.push('on_hold_reason = NULL', 'on_hold_review_date = NULL');
  } else {
    if (body.on_hold === true) set('on_hold = ?', 1);
    if (body.on_hold_reason !== undefined) set('on_hold_reason = ?', body.on_hold_reason);
    if (body.on_hold_review_date !== undefined)
      set('on_hold_review_date = ?', body.on_hold_review_date);
  }

  let overrideHistory: string | null = null;
  if (changedStage !== null) {
    overrideHistory = evaluateStageGate(id, changedStage, current.stage as string, req.query);
    applyStageRules(fields, values, changedStage, body);
    set(
      'position = ?',
      nextPosition({ table: 'deals', scopeCol: 'stage', scopeVal: changedStage })
    );
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

  /*
   * Ly do nguoi dung nhap khi ghi de cong giai doan cung la ly do nen di kem
   * moi dong nhat ky cua lan luu nay — dac ta 7.4 doi thay doi sau baseline phai
   * co dau vet, va day la o nhap ly do DUY NHAT dang co san.
   */
  const audit = auditFromQuery(db, req.query);

  db.transaction(() => {
    if (fields.length > 0) {
      fields.push(`updated_at = datetime('now','localtime')`);
      db.prepare(`UPDATE deals SET ${fields.join(', ')} WHERE id = ?`).run(...values, id);
    }
    if (changedStage !== null)
      applyDealScoreTransition(id, changedStage, current.stage as string, overrideHistory);
    // Trong CUNG transaction: nhat ky mo ta mot thay doi da bi rollback con te hon khong co nhat ky.
    recordChanges(db, 'deal', id, current, body, audit);
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

  const moveAudit = auditFromQuery(db, req.query);

  db.transaction(() => {
    if (body.stage !== current.stage) {
      const fields: string[] = [];
      const values: unknown[] = [];
      applyStageRules(fields, values, body.stage, body);
      fields.push(`updated_at = datetime('now','localtime')`);
      db.prepare(`UPDATE deals SET ${fields.join(', ')} WHERE id = ?`).run(...values, id);

      /* Chi cac khoa NGUOI DUNG thuc su gui — `{ lost_reason: undefined }` van la
         mot khoa co mat, va se bi ghi thanh mot lan doi ve rong khong ai lam. */
      const after: Record<string, unknown> = { stage: body.stage };
      if (body.lost_reason !== undefined) after.lost_reason = body.lost_reason;
      recordChanges(db, 'deal', id, current, after, moveAudit);
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

/* ---------- Checklist ban giao (v24) ---------- */

/**
 * Moi thao tac tren checklist deu ket thuc bang `syncHandoverReady` trong CUNG
 * transaction, roi ghi nhat ky neu co ban thay doi.
 *
 * Gom vao mot ham vi day la cho de sinh loi nhat: bo quen dong bo o mot nhanh
 * thi `handover_ready` lech voi checklist, va vi moi bo loc deu doc cot do chu
 * khong doc checklist, cai lech se khong lo ra o bat ky man hinh nao.
 */
function commitHandover(dealId: number, apply: () => void, audit: RecordOptions) {
  const before = required(
    db.prepare(`SELECT handover_ready FROM deals WHERE id = ?`).get(dealId),
    'Khong tim thay co hoi'
  ) as { handover_ready: number };

  db.transaction(() => {
    apply();
    const ready = syncHandoverReady(db, dealId);
    if (ready !== null && ready !== before.handover_ready) {
      recordChanges(db, 'deal', dealId, before, { handover_ready: ready }, audit);
    }
  })();

  const settings = getHandoverSettings(db);
  return {
    items: listHandoverItems(db, dealId),
    handover_ready: (
      db.prepare(`SELECT handover_ready FROM deals WHERE id = ?`).get(dealId) as {
        handover_ready: number;
      }
    ).handover_ready,
    sla_days: settings.slaDays,
    templates: Object.keys(settings.templates),
  };
}

router.get('/:id/handover', (req, res) => {
  const id = intParam(req.params.id);
  required(db.prepare(`SELECT id FROM deals WHERE id = ?`).get(id), 'Khong tim thay co hoi');
  res.json(commitHandover(id, () => {}, { note: null, actorContactId: null }));
});

/** Do bo mau vao co hoi; tu choi neu da co muc de khong tao checklist nhan doi. */
router.post('/:id/handover/template', (req, res) => {
  const id = intParam(req.params.id);
  const body = parseBody(z.object({ key: z.string().trim().min(1).optional() }), req);
  const audit = auditFromQuery(db, req.query);
  applyHandoverTemplate(db, id, body.key ?? 'default');
  res.status(201).json(commitHandover(id, () => {}, audit));
});

router.post('/:id/handover', (req, res) => {
  const id = intParam(req.params.id);
  const body = parseBody(
    z.object({
      content: z.string().trim().min(1, 'Noi dung khong duoc de trong').max(500),
      is_required: z.boolean().optional(),
    }),
    req
  );
  required(db.prepare(`SELECT id FROM deals WHERE id = ?`).get(id), 'Khong tim thay co hoi');
  const audit = auditFromQuery(db, req.query);

  res.status(201).json(
    commitHandover(
      id,
      () => {
        db.prepare(
          `INSERT INTO deal_handover_items (deal_id, content, is_required, position)
           VALUES (?, ?, ?, ?)`
        ).run(
          id,
          body.content,
          body.is_required === false ? 0 : 1,
          nextPosition({ table: 'deal_handover_items', scopeCol: 'deal_id', scopeVal: id })
        );
      },
      audit
    )
  );
});

router.patch('/:id/handover/:itemId', (req, res) => {
  const id = intParam(req.params.id);
  const itemId = intParam(req.params.itemId, 'itemId');
  const body = parseBody(
    z.object({
      is_done: z.boolean().optional(),
      is_required: z.boolean().optional(),
      content: z.string().trim().min(1).max(500).optional(),
      note: z.string().max(1000).nullable().optional(),
    }),
    req
  );
  const current = required(
    db.prepare(`SELECT * FROM deal_handover_items WHERE id = ? AND deal_id = ?`).get(itemId, id),
    'Khong tim thay muc ban giao'
  ) as Record<string, unknown>;
  const audit = auditFromQuery(db, req.query);

  res.json(
    commitHandover(
      id,
      () => {
        const merged = { ...current, ...body };
        db.prepare(
          `UPDATE deal_handover_items
              SET content = ?, is_required = ?, is_done = ?, note = ?,
                  done_at = CASE WHEN ? = 1 THEN COALESCE(done_at, datetime('now','localtime'))
                                 ELSE NULL END
            WHERE id = ?`
        ).run(
          merged.content,
          merged.is_required ? 1 : 0,
          merged.is_done ? 1 : 0,
          merged.note ?? null,
          merged.is_done ? 1 : 0,
          itemId
        );
      },
      audit
    )
  );
});

router.delete('/:id/handover/:itemId', (req, res) => {
  const id = intParam(req.params.id);
  const itemId = intParam(req.params.itemId, 'itemId');
  const audit = auditFromQuery(db, req.query);
  res.json(
    commitHandover(
      id,
      () => {
        db.prepare(`DELETE FROM deal_handover_items WHERE id = ? AND deal_id = ?`).run(itemId, id);
      },
      audit
    )
  );
});

router.delete('/:id', (req, res) => {
  const id = intParam(req.params.id);
  db.prepare(`DELETE FROM deals WHERE id = ?`).run(id);
  res.json({ ok: true });
});

export default router;
