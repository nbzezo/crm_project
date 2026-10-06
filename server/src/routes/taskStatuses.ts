/**
 * Trang thai cong viec cau hinh duoc (v67).
 *
 * Mount tai `/api/task-statuses` voi quyen `tasks`: ai lam viec voi cong viec cung
 * doc duoc danh sach (moi o chon trang thai can no). Sua danh sach doi `settings.app`.
 */
import { Router } from 'express';
import { z } from 'zod';
import { CARD_STATUSES } from '@workflow/contracts';
import { db } from '../db/connection.ts';
import { HttpError, parseBody, required } from '../lib/validate.ts';
import { fold } from '../lib/viSearch.ts';
import {
  assertStatusInvariants,
  getTaskStatus,
  listTaskStatuses,
  requireActiveStatus,
  STATUS_KEY_SQL,
} from '../lib/taskStatuses.ts';
import { actorContactId, requirePermission } from '../middleware/currentUser.ts';
import { setCardStatus } from '../services/cardService.ts';

const router = Router();
const canEdit = requirePermission('settings.app', 'update');

const hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Màu phải dạng #rrggbb')
  .nullable();

router.get('/', (req, res) => {
  res.json(
    listTaskStatuses(db, {
      includeInactive: req.query.all === '1',
      usage: req.query.usage === '1',
    })
  );
});

function usageOf(key: string): number {
  return (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM cards k WHERE ${STATUS_KEY_SQL} = ? AND k.is_archived = 0`
      )
      .get(key) as { n: number }
  ).n;
}

/** Bao loi luat danh sach nhu the trang thai `key` da bi an. */
function assertStatusInvariantsWithout(key: string): void {
  const kind = getTaskStatus(db, key)?.kind;
  throw new HttpError(
    422,
    kind === 'todo'
      ? 'Cần ít nhất một trạng thái mang ý nghĩa "Chưa bắt đầu"'
      : 'Cần ít nhất một trạng thái mang ý nghĩa "Hoàn thành"',
    { code: kind === 'todo' ? 'STATUS_NEED_START' : 'STATUS_NEED_DONE' }
  );
}

function assertLabelFree(label: string, exceptKey?: string): void {
  const taken = listTaskStatuses(db, { includeInactive: true }).find(
    (status) => status.key !== exceptKey && fold(status.label).trim() === fold(label).trim()
  );
  if (taken) {
    throw new HttpError(409, `Đã có trạng thái “${taken.label}”`, {
      code: 'STATUS_DUPLICATE',
      key: taken.key,
    });
  }
}

/** Khoa sinh tu ten, bo dau; trung thi them hau to so. Khoa khong doi ve sau. */
function keyFromLabel(label: string): string {
  const base =
    fold(label)
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'trang_thai';
  let key = base;
  for (let n = 2; getTaskStatus(db, key); n += 1) key = `${base}_${n}`;
  return key;
}

router.post('/', canEdit, (req, res) => {
  const body = parseBody(
    z.object({
      label: z.string().trim().min(1, 'Tên trạng thái không được để trống').max(60),
      color: hex.optional(),
      kind: z.enum(CARD_STATUSES),
    }),
    req
  );
  assertLabelFree(body.label);
  const key = keyFromLabel(body.label);
  const last = (
    db.prepare(`SELECT COALESCE(MAX(position), 0) AS p FROM task_statuses`).get() as { p: number }
  ).p;
  db.prepare(
    `INSERT INTO task_statuses (key, label, color, kind, position) VALUES (?, ?, ?, ?, ?)`
  ).run(key, body.label, body.color ?? null, body.kind, last + 1024);
  res.status(201).json(getTaskStatus(db, key));
});

/**
 * Sua mot trang thai.
 *
 * - Doi Y NGHIA cua trang thai dang co viec dung bi tu choi: no doi `is_done`, bao
 *   cao va nhac viec cua tung viec mot cach am tham. Tao trang thai moi roi chuyen.
 * - An trang thai dang co viec dung phai kem `move_to`: cac viec (va cot kanban
 *   dang gan no) chuyen sang trang thai do, qua setCardStatus nhu moi lan doi tay.
 */
router.patch('/:key', canEdit, (req, res) => {
  const key = String(req.params.key);
  const current = required(getTaskStatus(db, key), 'Không tìm thấy trạng thái');
  const body = parseBody(
    z.object({
      label: z.string().trim().min(1).max(60).optional(),
      color: hex.optional(),
      kind: z.enum(CARD_STATUSES).optional(),
      is_active: z.boolean().optional(),
      move_to: z.string().trim().min(1).max(60).optional(),
    }),
    req
  );
  if (body.label !== undefined) assertLabelFree(body.label, key);
  const used = usageOf(key);
  if (body.kind !== undefined && body.kind !== current.kind && used > 0) {
    throw new HttpError(
      409,
      `Trạng thái đang có ${used} việc — không đổi được ý nghĩa. Hãy tạo trạng thái mới rồi chuyển việc sang.`,
      { code: 'STATUS_IN_USE', usage: used }
    );
  }
  const hiding = body.is_active === false && current.is_active === 1;
  /* Kiem luat danh sach TRUOC khi hoi noi chuyen: an trang thai Hoan thanh cuoi
     cung thi du chon noi chuyen nao cung khong hop le. */
  const leavingKind = hiding || (body.kind !== undefined && body.kind !== current.kind);
  if (leavingKind && (current.kind === 'todo' || current.kind === 'done')) {
    const others = listTaskStatuses(db).filter(
      (status) => status.key !== key && status.kind === current.kind
    );
    if (others.length === 0) assertStatusInvariantsWithout(key);
  }
  let moveTo: string | null = null;
  if (hiding && used > 0) {
    if (!body.move_to || body.move_to === key) {
      throw new HttpError(409, `Trạng thái đang có ${used} việc — chọn trạng thái để chuyển sang`, {
        code: 'STATUS_NEED_MOVE',
        usage: used,
      });
    }
    moveTo = requireActiveStatus(db, body.move_to).key;
  }

  db.transaction(() => {
    db.prepare(
      `UPDATE task_statuses
          SET label = COALESCE(?, label),
              color = CASE WHEN ? = 1 THEN ? ELSE color END,
              kind = COALESCE(?, kind),
              is_active = COALESCE(?, is_active)
        WHERE key = ?`
    ).run(
      body.label ?? null,
      body.color !== undefined ? 1 : 0,
      body.color ?? null,
      body.kind ?? null,
      body.is_active === undefined ? null : body.is_active ? 1 : 0,
      key
    );
    if (hiding) {
      /* Cot kanban dang gan trang thai bi an thi gan sang trang thai moi, de keo
         the vao cot do khong dua viec ve mot trang thai khong con dung. */
      db.prepare(`UPDATE lists SET status_mapping = ? WHERE status_mapping = ?`).run(moveTo, key);
    }
    if (moveTo) {
      const cards = db.prepare(`SELECT k.id FROM cards k WHERE ${STATUS_KEY_SQL} = ?`).all(key) as {
        id: number;
      }[];
      for (const card of cards) {
        setCardStatus(card.id, moveTo, { actorContactId: actorContactId(req) });
      }
    }
    assertStatusInvariants(db);
  })();
  res.json(getTaskStatus(db, key));
});

router.put('/order', canEdit, (req, res) => {
  const body = parseBody(z.object({ keys: z.array(z.string()).min(1).max(200) }), req);
  const update = db.prepare(`UPDATE task_statuses SET position = ? WHERE key = ?`);
  db.transaction(() => {
    body.keys.forEach((key, index) => update.run((index + 1) * 1024, key));
  })();
  res.json(listTaskStatuses(db, { includeInactive: true, usage: true }));
});

export default router;
