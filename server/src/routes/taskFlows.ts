/**
 * Quy trinh theo trang thai cua cong viec (v66).
 *
 * Mount tai `/api/task-flows` voi quyen `tasks`: ai lam viec voi cong viec cung
 * doc duoc cau hinh (giao dien can biet tinh nang bat chua va mau tung trang
 * thai). Rieng sua cau hinh doi `settings.app`.
 */
import { Router } from 'express';
import { z } from 'zod';
import {
  CARD_STATUSES,
  FLOW_ASK_MODES,
  FLOW_STATUSES,
  type CardStatus,
  type FlowStatus,
} from '@workflow/contracts';
import { db } from '../db/connection.ts';
import { computeMovePosition, nextPosition } from '../lib/position.ts';
import { HttpError, intParam, parseBody, required } from '../lib/validate.ts';
import { actorContactId, requirePermission } from '../middleware/currentUser.ts';
import { reloadCard, setCardStatus } from '../services/cardService.ts';
import { logTaskActivity } from '../services/taskActivity.ts';
import {
  createFlow,
  flowPromptFor,
  getFlow,
  getTaskFlowSettings,
  isFlowStatus,
  isTaskFlowEnabled,
  nextStatusAfter,
} from '../services/taskFlowService.ts';
import { saveTaskFlowSettings } from '../lib/taskFlowSettings.ts';

const router = Router();

const stepText = z.string().trim().min(1, 'Bước không được để trống').max(500);
const flowStatus = z.enum(FLOW_STATUSES as [FlowStatus, ...FlowStatus[]]);

/* ---------- Cau hinh ---------- */

router.get('/settings', (_req, res) => {
  res.json(getTaskFlowSettings());
});

const templateSchema = z.object({
  steps: z.array(stepText).max(50),
  next_status: z.enum(CARD_STATUSES),
  ask: z.enum(FLOW_ASK_MODES),
});

router.put('/settings', requirePermission('settings.app', 'update'), (req, res) => {
  const body = parseBody(
    z.object({
      enabled: z.boolean().optional(),
      /* partialRecord: zod v4 bat record khoa enum phai du moi khoa, con day cho
         sua tung trang thai. */
      templates: z.partialRecord(flowStatus, templateSchema).optional(),
    }),
    req
  );
  if (body.templates) {
    for (const [status, template] of Object.entries(body.templates)) {
      if (template.next_status === status) {
        throw new HttpError(422, 'Trạng thái tự chuyển tới phải khác trạng thái hiện tại', {
          code: 'FLOW_NEXT_SAME',
          status,
        });
      }
    }
  }
  saveTaskFlowSettings(db, body);
  res.json(getTaskFlowSettings());
});

/* ---------- Quy trinh cua mot cong viec ---------- */

function assertEnabled(): void {
  if (!isTaskFlowEnabled()) {
    throw new HttpError(409, 'Tính năng Quy trình đang tắt', { code: 'FLOW_DISABLED' });
  }
}

interface FlowRow {
  id: number;
  card_id: number;
  status: FlowStatus;
  completed_at: string | null;
}

function loadFlow(flowId: number): FlowRow {
  return required(
    db.prepare(`SELECT * FROM card_flows WHERE id = ?`).get(flowId),
    'Không tìm thấy quy trình'
  ) as FlowRow;
}

interface StepRow {
  id: number;
  flow_id: number;
  content: string;
  done_at: string | null;
}

function loadStep(stepId: number): StepRow {
  return required(
    db.prepare(`SELECT * FROM card_flow_steps WHERE id = ?`).get(stepId),
    'Không tìm thấy bước'
  ) as StepRow;
}

/** Them hoac sua buoc lam quy trinh da xong "chua xong" lai — tru khi moi buoc deu xong. */
function refreshCompletion(flowId: number): void {
  db.prepare(
    `UPDATE card_flows
        SET completed_at = CASE
              WHEN NOT EXISTS (SELECT 1 FROM card_flow_steps WHERE flow_id = ? AND done_at IS NULL)
               AND EXISTS (SELECT 1 FROM card_flow_steps WHERE flow_id = ?)
              THEN COALESCE(completed_at, datetime('now','localtime'))
              ELSE NULL END
      WHERE id = ?`
  ).run(flowId, flowId, flowId);
}

function respond(
  flowId: number | null,
  cardId: number,
  advanced: { from: CardStatus; to: CardStatus } | null = null
) {
  return {
    flow: flowId === null ? null : getFlow(flowId),
    card: reloadCard(cardId),
    advanced_to: advanced?.to ?? null,
    // Tu chuyen sang trang thai moi thi hoi quy trinh cho no, nhu moi lan doi tay.
    flow_prompt: advanced ? flowPromptFor(cardId, advanced.from) : null,
  };
}

/**
 * Tao quy trinh cho mot trang thai cua cong viec.
 *
 * `steps` bo trong nghia la dung mau cua trang thai do. Thuong la trang thai hien
 * tai (hop thoai "Them quy trinh cho Dang lam?"), nhung cho phep ca trang thai
 * khac de nguoi dung chuan bi truoc.
 */
router.post('/cards/:cardId', (req, res) => {
  assertEnabled();
  const cardId = intParam(req.params.cardId, 'cardId');
  const body = parseBody(
    z.object({ status: flowStatus, steps: z.array(stepText).max(50).optional() }),
    req
  );
  required(db.prepare(`SELECT id FROM cards WHERE id = ?`).get(cardId), 'Không tìm thấy công việc');
  const fromTemplate = body.steps === undefined;
  const steps = body.steps ?? getTaskFlowSettings().templates[body.status].steps;
  if (steps.length === 0) {
    throw new HttpError(400, 'Mẫu của trạng thái này chưa có bước nào', {
      code: 'FLOW_TEMPLATE_EMPTY',
    });
  }
  const flow = createFlow(cardId, body.status, steps, {
    fromTemplate,
    actorContactId: actorContactId(req),
  });
  res.status(201).json(respond(flow.id, cardId));
});

/** "Bo quy trinh": xoa han, khong de lai dau bo qua. */
router.delete('/:flowId', (req, res) => {
  const flow = loadFlow(intParam(req.params.flowId, 'flowId'));
  db.prepare(`DELETE FROM card_flows WHERE id = ?`).run(flow.id);
  res.json(respond(null, flow.card_id));
});

router.post('/:flowId/steps', (req, res) => {
  assertEnabled();
  const flow = loadFlow(intParam(req.params.flowId, 'flowId'));
  const body = parseBody(z.object({ content: stepText }), req);
  db.transaction(() => {
    db.prepare(`INSERT INTO card_flow_steps (flow_id, content, position) VALUES (?, ?, ?)`).run(
      flow.id,
      body.content,
      nextPosition({ table: 'card_flow_steps', scopeCol: 'flow_id', scopeVal: flow.id })
    );
    refreshCompletion(flow.id);
  })();
  res.status(201).json(respond(flow.id, flow.card_id));
});

/**
 * Sua mot buoc: noi dung, thu tu, hoac danh dau xong.
 *
 * Lam LAN LUOT: chi danh dau xong duoc buoc dau tien chua xong, va chi bo danh
 * dau duoc buoc xong sau cung. Xong buoc cuoi cua quy trinh dang chay thi cong
 * viec tu chuyen sang trang thai ke tiep trong cung transaction.
 */
router.patch('/steps/:stepId', (req, res) => {
  assertEnabled();
  const step = loadStep(intParam(req.params.stepId, 'stepId'));
  const flow = loadFlow(step.flow_id);
  const body = parseBody(
    z.object({
      content: stepText.optional(),
      done: z.boolean().optional(),
      beforeId: z.number().int().nullable().optional(),
      afterId: z.number().int().nullable().optional(),
    }),
    req
  );
  const actor = actorContactId(req);

  const advancedTo = db.transaction((): CardStatus | null => {
    if (body.content !== undefined) {
      db.prepare(`UPDATE card_flow_steps SET content = ? WHERE id = ?`).run(body.content, step.id);
    }
    if (body.beforeId !== undefined || body.afterId !== undefined) {
      if (step.done_at) throw new HttpError(400, 'Không đổi thứ tự bước đã xong');
      const position = computeMovePosition(
        { table: 'card_flow_steps', scopeCol: 'flow_id', scopeVal: flow.id },
        body.beforeId,
        body.afterId,
        step.id
      );
      db.prepare(`UPDATE card_flow_steps SET position = ? WHERE id = ?`).run(position, step.id);
      /* Cac buoc da xong phai luon dung dau: keo mot buoc chua xong len tren buoc
         da xong la noi rang no da duoc lam truoc — sai su that. */
      const order = db
        .prepare(`SELECT done_at FROM card_flow_steps WHERE flow_id = ? ORDER BY position, id`)
        .all(flow.id) as { done_at: string | null }[];
      const firstOpen = order.findIndex((s) => !s.done_at);
      if (firstOpen >= 0 && order.slice(firstOpen).some((s) => s.done_at)) {
        throw new HttpError(400, 'Không đặt bước chưa xong lên trên bước đã xong');
      }
    }
    if (body.done === undefined || body.done === Boolean(step.done_at)) return null;

    const steps = db
      .prepare(`SELECT id, done_at FROM card_flow_steps WHERE flow_id = ? ORDER BY position, id`)
      .all(flow.id) as { id: number; done_at: string | null }[];
    if (body.done) {
      const firstOpen = steps.find((s) => !s.done_at);
      if (firstOpen?.id !== step.id) {
        throw new HttpError(409, 'Phải xong bước trước mới làm được bước này', {
          code: 'FLOW_STEP_ORDER',
        });
      }
      db.prepare(
        `UPDATE card_flow_steps SET done_at = datetime('now','localtime'), done_by_contact_id = ?
          WHERE id = ?`
      ).run(actor, step.id);
    } else {
      const lastDone = [...steps].reverse().find((s) => s.done_at);
      if (lastDone?.id !== step.id) {
        throw new HttpError(409, 'Chỉ bỏ đánh dấu được bước xong sau cùng', {
          code: 'FLOW_STEP_ORDER',
        });
      }
      db.prepare(
        `UPDATE card_flow_steps SET done_at = NULL, done_by_contact_id = NULL WHERE id = ?`
      ).run(step.id);
    }
    logTaskActivity({
      cardId: flow.card_id,
      actorContactId: actor,
      action: 'updated',
      field: body.done ? 'flow_step_done' : 'flow_step_undone',
      oldValue: flow.status,
      newValue: step.content,
    });

    const wasComplete = flow.completed_at !== null;
    refreshCompletion(flow.id);
    const nowComplete = body.done && steps.every((s) => s.id === step.id || s.done_at);
    if (!nowComplete || wasComplete) return null;

    logTaskActivity({
      cardId: flow.card_id,
      actorContactId: actor,
      action: 'updated',
      field: 'flow_completed',
      newValue: flow.status,
    });
    /* Chi tu chuyen khi day la quy trinh cua trang thai HIEN TAI: xong mot quy
       trinh chuan bi truoc cho trang thai khac khong duoc keo cong viec di dau. */
    const card = db.prepare(`SELECT status FROM cards WHERE id = ?`).get(flow.card_id) as {
      status: CardStatus;
    };
    if (card.status !== flow.status || !isFlowStatus(card.status)) return null;
    const next = nextStatusAfter(flow.card_id, flow.status);
    setCardStatus(flow.card_id, next, { actorContactId: actor });
    logTaskActivity({
      cardId: flow.card_id,
      actorContactId: actor,
      action: next === 'done' ? 'completed' : 'updated',
      field: 'status',
      oldValue: flow.status,
      newValue: next,
    });
    return next;
  })();

  res.json(
    respond(flow.id, flow.card_id, advancedTo ? { from: flow.status, to: advancedTo } : null)
  );
});

router.delete('/steps/:stepId', (req, res) => {
  const step = loadStep(intParam(req.params.stepId, 'stepId'));
  const flow = loadFlow(step.flow_id);
  db.transaction(() => {
    db.prepare(`DELETE FROM card_flow_steps WHERE id = ?`).run(step.id);
    refreshCompletion(flow.id);
  })();
  res.json(respond(flow.id, flow.card_id));
});

export default router;
