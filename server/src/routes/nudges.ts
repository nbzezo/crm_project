import { Router } from 'express';
import { z } from 'zod';
import { NUDGE_CHANNELS } from '@workflow/contracts';
import { db } from '../db/connection.ts';
import { intParam, parseBody, required } from '../lib/validate.ts';
import { runStructured } from '../services/ai/gateway.ts';

const router = Router();

const nudgeSchema = z.object({
  card_id: z.number().int().positive(),
  channel: z.enum(NUDGE_CHANNELS),
  message: z.string().max(2000).optional(),
  /** Ghi luon phan hoi neu nhac truc tiep (goi dien, gap mat). */
  response: z.string().max(2000).nullable().optional(),
});

const NUDGE_SELECT = `
  SELECT n.*, ct.full_name AS contact_name, k.title AS card_title
    FROM task_nudges n
    LEFT JOIN contacts ct ON ct.id = n.contact_id
    LEFT JOIN cards k ON k.id = n.card_id`;

/** Lich su nhac cua mot cong viec — moi nhat truoc. */
router.get('/', (req, res) => {
  const cardId = req.query.card_id ? Number(req.query.card_id) : null;
  if (cardId === null) {
    res.json(db.prepare(`${NUDGE_SELECT} ORDER BY n.sent_at DESC, n.id DESC LIMIT 100`).all());
    return;
  }
  res.json(
    db.prepare(`${NUDGE_SELECT} WHERE n.card_id = ? ORDER BY n.sent_at DESC, n.id DESC`).all(cardId)
  );
});

/**
 * Ghi mot lan nhac.
 *
 * `contact_id` khong nhan tu client ma lay tu nguoi phu trach HIEN TAI cua the:
 * dong nhat ky phai noi dung ai da duoc nhac, va client khong co ly do gi de
 * quyet dinh dieu do.
 */
router.post('/', (req, res) => {
  const body = parseBody(nudgeSchema, req);
  const card = required(
    db.prepare(`SELECT id, assignee_contact_id FROM cards WHERE id = ?`).get(body.card_id) as
      { id: number; assignee_contact_id: number | null } | undefined,
    'Khong tim thay cong viec'
  );

  const info = db
    .prepare(
      `INSERT INTO task_nudges (card_id, contact_id, channel, message, response, responded_at)
       VALUES (?, ?, ?, ?, ?,
               CASE WHEN ? IS NOT NULL THEN datetime('now','localtime') ELSE NULL END)`
    )
    .run(
      card.id,
      card.assignee_contact_id,
      body.channel,
      body.message ?? '',
      body.response ?? null,
      body.response ?? null
    );

  res
    .status(201)
    .json(db.prepare(`${NUDGE_SELECT} WHERE n.id = ?`).get(Number(info.lastInsertRowid)));
});

/** Bo sung phan hoi sau khi nguoi phu trach tra loi. */
router.patch('/:id', (req, res) => {
  const id = intParam(req.params.id);
  const body = parseBody(
    z.object({
      response: z.string().max(2000).nullable(),
      message: z.string().max(2000).optional(),
    }),
    req
  );
  required(db.prepare(`SELECT id FROM task_nudges WHERE id = ?`).get(id), 'Khong tim thay ban ghi');

  db.prepare(
    `UPDATE task_nudges
        SET response = ?,
            responded_at = CASE WHEN ? IS NULL THEN NULL
                                ELSE COALESCE(responded_at, datetime('now','localtime')) END,
            message = COALESCE(?, message)
      WHERE id = ?`
  ).run(body.response, body.response, body.message ?? null, id);

  res.json(db.prepare(`${NUDGE_SELECT} WHERE n.id = ?`).get(id));
});

router.delete('/:id', (req, res) => {
  db.prepare(`DELETE FROM task_nudges WHERE id = ?`).run(intParam(req.params.id));
  res.json({ ok: true });
});

const draftResponse = z.object({
  message: z.string().min(1),
  subject: z.string().default(''),
});

/**
 * Soan noi dung nhac bang AI.
 *
 * Khong gui di dau ca — tra ve chu de nguoi dung sua roi tu copy / mo Zalo /
 * mo mail. Ung dung chay local va khong co kenh gui ra ngoai; giả vờ có sẽ nguy
 * hiem hon la khong co, vi nguoi dung se tin la loi nhac da toi noi.
 */
router.post('/:cardId/draft', async (req, res, next) => {
  try {
    const cardId = intParam(req.params.cardId, 'cardId');
    const body = parseBody(
      z.object({ tone: z.enum(['friendly', 'neutral', 'firm']).optional() }),
      req
    );

    const card = required(
      db
        .prepare(
          `SELECT k.title, k.description, k.due_date, k.status, k.blocked_reason, k.priority,
                  ac.full_name AS assignee_name, ao.name AS assignee_org_name,
                  ao.org_kind AS assignee_org_kind, c.name AS customer_name, d.title AS deal_title,
                  (SELECT COUNT(*) FROM task_nudges n WHERE n.card_id = k.id) AS nudge_count,
                  (SELECT MAX(n.sent_at) FROM task_nudges n WHERE n.card_id = k.id) AS last_nudged_at
             FROM cards k
             LEFT JOIN contacts ac ON ac.id = k.assignee_contact_id
             LEFT JOIN customers ao ON ao.id = k.assignee_org_id
             LEFT JOIN customers c ON c.id = k.customer_id
             LEFT JOIN deals d ON d.id = k.deal_id
            WHERE k.id = ?`
        )
        .get(cardId),
      'Khong tim thay cong viec'
    ) as Record<string, unknown>;

    const tone = body.tone ?? 'friendly';
    const { data, meta } = await runStructured(
      db,
      {
        task: 'nudge_draft',
        mode: 'fast',
        contextType: 'card',
        contextId: cardId,
        maxOutputTokens: 600,
        system:
          'Bạn soạn tin nhắn nhắc việc bằng tiếng Việt, ngắn gọn và lịch sự. ' +
          'Chỉ dùng dữ kiện có trong ngữ cảnh, tuyệt đối không bịa thêm cam kết, con số hay ngày tháng. ' +
          'Xưng hô trung tính, không dùng biệt ngữ nội bộ khi người nhận thuộc tổ chức khách hàng.',
        prompt:
          `Soạn lời nhắc với giọng ${TONE_LABEL[tone]}. Trả về JSON ` +
          '{"subject":"tiêu đề email ngắn","message":"nội dung 2-4 câu"}.\n' +
          'Nếu công việc đã bị nhắc nhiều lần thì nhắc lại nhẹ nhàng rằng đây không phải lần đầu, ' +
          'và hỏi mốc thời gian cụ thể thay vì hỏi chung chung.\n' +
          `Ngữ cảnh:\n${JSON.stringify(card)}`,
      },
      draftResponse
    );

    res.json({
      ...data,
      meta: { requestId: meta.requestId, provider: meta.provider, model: meta.model },
    });
  } catch (error) {
    next(error);
  }
});

const TONE_LABEL: Record<'friendly' | 'neutral' | 'firm', string> = {
  friendly: 'thân thiện',
  neutral: 'trung tính, chuyên nghiệp',
  firm: 'dứt khoát nhưng vẫn lịch sự',
};

export default router;
