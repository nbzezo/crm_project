import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.ts';
import { HttpError, intParam, parseBody, required } from '../lib/validate.ts';
import { nextPosition } from '../lib/position.ts';
import { buildSearchText } from '../lib/viSearch.ts';
import { assertEntityLinks, assertParentListCompatible } from '../lib/entityRelations.ts';
import { moveCard } from '../services/cardService.ts';

const router = Router();

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngay phai dang YYYY-MM-DD')
  .nullable();

const priorityEnum = z.enum(['low', 'medium', 'high', 'urgent']);

type CardRow = {
  id: number;
  list_id: number;
  title: string;
  description: string;
  is_done: number;
};

function reloadCard(id: number) {
  return db
    .prepare(
      `SELECT k.*, c.name AS customer_name, d.title AS deal_title,
              (SELECT COUNT(*) FROM checklist_items ci WHERE ci.card_id = k.id) AS checklist_total,
              (SELECT COUNT(*) FROM checklist_items ci WHERE ci.card_id = k.id AND ci.is_done = 1) AS checklist_done,
              (SELECT COUNT(*) FROM cards sc WHERE sc.parent_id = k.id AND sc.is_archived = 0) AS subtask_total,
              (SELECT COUNT(*) FROM cards sc WHERE sc.parent_id = k.id AND sc.is_archived = 0 AND sc.is_done = 1) AS subtask_done,
              (SELECT COUNT(*) FROM documents dc WHERE dc.card_id = k.id AND dc.deleted_at IS NULL) AS attachment_total
         FROM cards k
         LEFT JOIN customers c ON c.id = k.customer_id
         LEFT JOIN deals d ON d.id = k.deal_id
        WHERE k.id = ?`
    )
    .get(id);
}

router.post('/', (req, res) => {
  const body = parseBody(
    z.object({
      list_id: z.number().int().optional(),
      parent_id: z.number().int().nullable().optional(),
      title: z.string().trim().min(1, 'Tieu de khong duoc de trong'),
      priority: priorityEnum.optional(),
      start_date: dateOnly.optional(),
      due_date: dateOnly.optional(),
      customer_id: z.number().int().nullable().optional(),
      deal_id: z.number().int().nullable().optional(),
    }),
    req
  );

  // Viec con nam cung danh sach voi viec cha va chi cho 1 cap
  let listId = body.list_id ?? null;
  let customerId = body.customer_id ?? null;
  let dealId = body.deal_id ?? null;
  if (body.parent_id) {
    const parent = required(
      db.prepare(`SELECT * FROM cards WHERE id = ?`).get(body.parent_id),
      'Khong tim thay viec cha'
    ) as Record<string, unknown>;
    if (parent.parent_id) throw new HttpError(400, 'Chỉ hỗ trợ một cấp việc con');
    listId = parent.list_id as number;
    customerId = customerId ?? (parent.customer_id as number | null);
    dealId = dealId ?? (parent.deal_id as number | null);
  }
  if (!listId) throw new HttpError(400, 'Thiếu danh sách để thêm công việc');
  required(db.prepare(`SELECT id FROM lists WHERE id = ?`).get(listId), 'Khong tim thay danh sach');
  assertEntityLinks(db, { customer_id: customerId, deal_id: dealId });

  const position = nextPosition({ table: 'cards', scopeCol: 'list_id', scopeVal: listId });
  const info = db
    .prepare(
      `INSERT INTO cards (list_id, parent_id, title, position, priority, start_date, due_date,
                          customer_id, deal_id, search_text)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      listId,
      body.parent_id ?? null,
      body.title,
      position,
      body.priority ?? 'medium',
      body.start_date ?? null,
      body.due_date ?? null,
      customerId,
      dealId,
      buildSearchText(body.title)
    );
  res.status(201).json(reloadCard(Number(info.lastInsertRowid)));
});

router.get('/:id', (req, res) => {
  const id = intParam(req.params.id);
  const card = required(reloadCard(id), 'Khong tim thay the') as Record<string, unknown>;

  const labels = db
    .prepare(
      `SELECT l.* FROM labels l JOIN card_labels cl ON cl.label_id = l.id WHERE cl.card_id = ? ORDER BY l.id`
    )
    .all(id);
  const checklist = db
    .prepare(`SELECT * FROM checklist_items WHERE card_id = ? ORDER BY position, id`)
    .all(id);
  const reminders = db.prepare(`SELECT * FROM reminders WHERE card_id = ? ORDER BY due_at`).all(id);
  const comments = db
    .prepare(`SELECT * FROM card_comments WHERE card_id = ? ORDER BY created_at DESC, id DESC`)
    .all(id);
  const board = db
    .prepare(
      `SELECT b.id, b.name, l.id AS list_id, l.name AS list_name
         FROM lists l JOIN boards b ON b.id = l.board_id WHERE l.id = ?`
    )
    .get(card.list_id as number);

  const subtasks = db
    .prepare(
      `SELECT k.id, k.title, k.priority, k.start_date, k.due_date, k.is_done, k.customer_id,
              c.name AS customer_name
         FROM cards k LEFT JOIN customers c ON c.id = k.customer_id
        WHERE k.parent_id = ? AND k.is_archived = 0
        ORDER BY k.is_done, k.position, k.id`
    )
    .all(id);
  const parent = card.parent_id
    ? db.prepare(`SELECT id, title FROM cards WHERE id = ?`).get(card.parent_id as number)
    : null;

  const attachments = db
    .prepare(
      `SELECT * FROM documents WHERE card_id = ? AND deleted_at IS NULL ORDER BY created_at DESC, id DESC`
    )
    .all(id);

  // Truong thong tin cua bang chua the (kem truong dung chung) + gia tri da nhap
  const boardId = (board as { id: number } | undefined)?.id ?? null;
  const fields = (
    db
      .prepare(
        `SELECT f.*, COALESCE(v.value, '') AS value
           FROM card_fields f
           LEFT JOIN card_field_values v ON v.field_id = f.id AND v.card_id = ?
          WHERE f.board_id IS NULL OR (? IS NOT NULL AND f.board_id = ?)
          ORDER BY f.board_id IS NULL DESC, f.position, f.id`
      )
      .all(id, boardId, boardId) as Record<string, unknown>[]
  ).map((row) => ({ ...row, options: parseOptions(row.options) }));

  res.json({
    ...card,
    labels,
    checklist,
    reminders,
    comments,
    board,
    subtasks,
    parent,
    attachments,
    fields,
  });
});

/** options luu duoi dang chuoi JSON — luon tra ve mang cho client. */
function parseOptions(raw: unknown): string[] {
  try {
    const parsed = JSON.parse(String(raw ?? '[]')) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/** Dat (hoac xoa) gia tri mot truong thong tin cho the. */
router.put('/:id/fields/:fieldId', (req, res) => {
  const id = intParam(req.params.id);
  const fieldId = intParam(req.params.fieldId, 'fieldId');
  const body = parseBody(z.object({ value: z.string() }), req);

  required(db.prepare(`SELECT id FROM cards WHERE id = ?`).get(id), 'Khong tim thay the');
  required(
    db.prepare(`SELECT id FROM card_fields WHERE id = ?`).get(fieldId),
    'Khong tim thay truong thong tin'
  );

  if (body.value === '') {
    db.prepare(`DELETE FROM card_field_values WHERE card_id = ? AND field_id = ?`).run(id, fieldId);
  } else {
    db.prepare(
      `INSERT INTO card_field_values (card_id, field_id, value) VALUES (?, ?, ?)
       ON CONFLICT(card_id, field_id) DO UPDATE SET value = excluded.value`
    ).run(id, fieldId, body.value);
  }

  res.json({ ok: true });
});

router.patch('/:id', (req, res) => {
  const id = intParam(req.params.id);
  const body = parseBody(
    z.object({
      title: z.string().trim().min(1).optional(),
      description: z.string().optional(),
      start_date: dateOnly.optional(),
      due_date: dateOnly.optional(),
      priority: priorityEnum.optional(),
      customer_id: z.number().int().nullable().optional(),
      deal_id: z.number().int().nullable().optional(),
      is_done: z.boolean().optional(),
      is_archived: z.boolean().optional(),
      list_id: z.number().int().optional(),
      parent_id: z.number().int().nullable().optional(),
      cover_color: z.string().nullable().optional(),
    }),
    req
  );
  const card = required(
    db.prepare(`SELECT * FROM cards WHERE id = ?`).get(id),
    'Khong tim thay the'
  ) as CardRow;
  const currentLinks = card as CardRow & { customer_id?: number | null; deal_id?: number | null };
  const nextCustomerId =
    body.customer_id !== undefined ? body.customer_id : currentLinks.customer_id;
  const nextDealId =
    body.deal_id !== undefined
      ? body.deal_id
      : body.customer_id !== undefined
        ? null
        : currentLinks.deal_id;
  assertEntityLinks(db, { customer_id: nextCustomerId, deal_id: nextDealId });

  const fields: string[] = [];
  const values: unknown[] = [];
  const set = (sql: string, value: unknown) => {
    fields.push(sql);
    values.push(value);
  };

  if (body.title !== undefined) set('title = ?', body.title);
  if (body.description !== undefined) set('description = ?', body.description);
  if (body.start_date !== undefined) set('start_date = ?', body.start_date);
  if (body.due_date !== undefined) set('due_date = ?', body.due_date);
  if (body.priority !== undefined) set('priority = ?', body.priority);
  if (body.cover_color !== undefined) set('cover_color = ?', body.cover_color);
  if (body.is_archived !== undefined) set('is_archived = ?', body.is_archived ? 1 : 0);
  if (body.parent_id !== undefined) {
    if (body.parent_id === id)
      throw new HttpError(400, 'Một công việc không thể là cha của chính nó');
    if (body.parent_id) {
      const parent = required(
        db.prepare(`SELECT parent_id FROM cards WHERE id = ?`).get(body.parent_id),
        'Khong tim thay viec cha'
      ) as { parent_id: number | null };
      if (parent.parent_id) throw new HttpError(400, 'Chỉ hỗ trợ một cấp việc con');
      const hasChildren = db
        .prepare(`SELECT COUNT(*) AS n FROM cards WHERE parent_id = ?`)
        .get(id) as { n: number };
      if (hasChildren.n > 0)
        throw new HttpError(400, 'Công việc đang có việc con nên không thể trở thành việc con');
    }
    set('parent_id = ?', body.parent_id);
  }
  if (body.customer_id !== undefined) {
    set('customer_id = ?', body.customer_id);
    // Doi khach hang thi bo lien ket deal cu de tranh lech du lieu.
    if (body.deal_id === undefined) set('deal_id = ?', null);
  }
  if (body.deal_id !== undefined) set('deal_id = ?', body.deal_id);
  if (body.list_id !== undefined) {
    required(
      db.prepare(`SELECT id FROM lists WHERE id = ?`).get(body.list_id),
      'Khong tim thay danh sach'
    );
    assertParentListCompatible(db, id, body.list_id);
    set('list_id = ?', body.list_id);
  }
  if (body.is_done !== undefined) {
    set('is_done = ?', body.is_done ? 1 : 0);
    fields.push(
      body.is_done ? `completed_at = datetime('now','localtime')` : `completed_at = NULL`
    );
  }
  if (body.title !== undefined || body.description !== undefined) {
    set(
      'search_text = ?',
      buildSearchText(body.title ?? card.title, body.description ?? card.description)
    );
  }

  if (fields.length > 0) {
    fields.push(`updated_at = datetime('now','localtime')`);
    db.prepare(`UPDATE cards SET ${fields.join(', ')} WHERE id = ?`).run(...values, id);
  }
  res.json(reloadCard(id));
});

router.patch('/:id/move', (req, res) => {
  const id = intParam(req.params.id);
  const body = parseBody(
    z.object({
      list_id: z.number().int(),
      beforeId: z.number().int().nullable().optional(),
      afterId: z.number().int().nullable().optional(),
    }),
    req
  );
  res.json(moveCard(id, body));
});

router.delete('/:id', (req, res) => {
  const id = intParam(req.params.id);
  db.prepare(`DELETE FROM cards WHERE id = ?`).run(id);
  res.json({ ok: true });
});

/* ---- Nhan xet tren the (ghi chu ca nhan theo dong thoi gian) ---- */
router.get('/:id/comments', (req, res) => {
  const id = intParam(req.params.id);
  res.json(
    db
      .prepare(`SELECT * FROM card_comments WHERE card_id = ? ORDER BY created_at DESC, id DESC`)
      .all(id)
  );
});

router.post('/:id/comments', (req, res) => {
  const cardId = intParam(req.params.id);
  const body = parseBody(z.object({ body: z.string().trim().min(1, 'Noi dung trong') }), req);
  required(db.prepare(`SELECT id FROM cards WHERE id = ?`).get(cardId), 'Khong tim thay the');
  const info = db
    .prepare(`INSERT INTO card_comments (card_id, body) VALUES (?, ?)`)
    .run(cardId, body.body);
  res
    .status(201)
    .json(db.prepare(`SELECT * FROM card_comments WHERE id = ?`).get(info.lastInsertRowid));
});

/** Nhan ban the (giong "Copy card"). */
router.post('/:id/copy', (req, res) => {
  const id = intParam(req.params.id);
  const body = parseBody(
    z.object({ title: z.string().trim().min(1).optional(), list_id: z.number().int().optional() }),
    req
  );
  const source = required(
    db.prepare(`SELECT * FROM cards WHERE id = ?`).get(id),
    'Khong tim thay the'
  ) as Record<string, unknown>;

  const newId = db.transaction(() => {
    const listId = body.list_id ?? (source.list_id as number);
    const position = nextPosition({ table: 'cards', scopeCol: 'list_id', scopeVal: listId });
    const title = body.title ?? `${source.title} (sao chép)`;
    const info = db
      .prepare(
        `INSERT INTO cards (list_id, title, description, position, start_date, due_date, priority,
                            customer_id, deal_id, cover_color, search_text)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        listId,
        title,
        source.description,
        position,
        source.start_date,
        source.due_date,
        source.priority,
        source.customer_id,
        source.deal_id,
        source.cover_color,
        buildSearchText(title, source.description as string)
      );
    const cardId = Number(info.lastInsertRowid);

    const labels = db.prepare(`SELECT label_id FROM card_labels WHERE card_id = ?`).all(id) as {
      label_id: number;
    }[];
    const insertLabel = db.prepare(
      `INSERT OR IGNORE INTO card_labels (card_id, label_id) VALUES (?, ?)`
    );
    for (const l of labels) insertLabel.run(cardId, l.label_id);

    const items = db
      .prepare(`SELECT * FROM checklist_items WHERE card_id = ? ORDER BY position`)
      .all(id) as Record<string, unknown>[];
    const insertItem = db.prepare(
      `INSERT INTO checklist_items (card_id, content, is_done, position) VALUES (?, ?, ?, ?)`
    );
    for (const item of items) insertItem.run(cardId, item.content, item.is_done, item.position);

    return cardId;
  })();

  res.status(201).json(reloadCard(newId));
});

router.post('/:id/checklist', (req, res) => {
  const cardId = intParam(req.params.id);
  const body = parseBody(z.object({ content: z.string().trim().min(1) }), req);
  required(db.prepare(`SELECT id FROM cards WHERE id = ?`).get(cardId), 'Khong tim thay the');
  const position = nextPosition({
    table: 'checklist_items',
    scopeCol: 'card_id',
    scopeVal: cardId,
  });
  const info = db
    .prepare(`INSERT INTO checklist_items (card_id, content, position) VALUES (?, ?, ?)`)
    .run(cardId, body.content, position);
  res
    .status(201)
    .json(db.prepare(`SELECT * FROM checklist_items WHERE id = ?`).get(info.lastInsertRowid));
});

router.put('/:id/labels', (req, res) => {
  const cardId = intParam(req.params.id);
  const body = parseBody(z.object({ label_ids: z.array(z.number().int()) }), req);
  required(db.prepare(`SELECT id FROM cards WHERE id = ?`).get(cardId), 'Khong tim thay the');

  db.transaction(() => {
    db.prepare(`DELETE FROM card_labels WHERE card_id = ?`).run(cardId);
    const insert = db.prepare(
      `INSERT OR IGNORE INTO card_labels (card_id, label_id) VALUES (?, ?)`
    );
    for (const labelId of body.label_ids) insert.run(cardId, labelId);
  })();

  res.json(
    db
      .prepare(
        `SELECT l.* FROM labels l JOIN card_labels cl ON cl.label_id = l.id WHERE cl.card_id = ? ORDER BY l.id`
      )
      .all(cardId)
  );
});

export default router;
