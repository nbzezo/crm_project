import { Router } from 'express';
import { z } from 'zod';
import { CARD_STATUSES, type CardStatus } from '@workflow/contracts';
import { createTaskInputSchema, TASK_LINK_KEYS } from '@workflow/contracts/schemas';
import { db } from '../db/connection.ts';
import { HttpError, intParam, parseBody, required } from '../lib/validate.ts';
import { nextPosition } from '../lib/position.ts';
import { buildSearchText } from '../lib/viSearch.ts';
import {
  assertParentListCompatible,
  deriveTaskLinks,
  resolveAssignee,
  type EntityLinks,
} from '../lib/entityRelations.ts';
import {
  addDependency,
  createCard,
  listDependencies,
  moveCard,
  reloadCard,
  resolveDefaultList,
  setCardStatus,
} from '../services/cardService.ts';

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
  status: CardStatus;
};

router.post('/', (req, res) => {
  res.status(201).json(createCard(parseBody(createTaskInputSchema, req)));
});

/**
 * Ngu canh de mo form tao cong viec tu bat ky module nao.
 *
 * Nhan mot khoa bat ky (co hoi, hop dong, bao gia, nguoi lien he...) roi tra ve day
 * du lien ket da suy ra, ten hien thi va cac lua chon con lai. Mot lan goi thay cho
 * bon nam truy van roi rac ma cac form CRM hien dang tu ghep.
 *
 * Phai dang ky TRUOC `/:id` — neu khong Express se coi 'context' la id va tra 400.
 */
router.get('/context', (req, res) => {
  const numeric = (value: unknown) => {
    if (value === undefined || value === '') return null;
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Lien ket khong hop le');
    return n;
  };
  const requested: EntityLinks = {
    customer_id: numeric(req.query.customer_id),
    contact_id: numeric(req.query.contact_id),
    deal_id: numeric(req.query.deal_id),
    contract_id: numeric(req.query.contract_id),
    quotation_id: numeric(req.query.quotation_id),
  };
  const links = deriveTaskLinks(db, requested);
  const customerId = links.customer_id ?? null;
  /*
   * `project_id` khong phai lien ket cua the (v19) — no chi thu hep noi tha viec.
   * Mo form tu trang mot du an thi chi nhung bang cua du an do moi la lua chon
   * hop ly; bay ca bang khac ra la moi nguoi dung tha viec ra ngoai du an.
   */
  const projectId = numeric(req.query.project_id);

  const boards = db
    .prepare(
      `SELECT b.id, b.name, b.customer_id, b.project_id FROM boards b
        WHERE b.is_archived = 0 AND (? IS NULL OR b.project_id = ?)
        ORDER BY (? IS NOT NULL AND b.customer_id = ?) DESC, b.is_starred DESC, b.id`
    )
    .all(projectId, projectId, customerId, customerId) as {
    id: number;
    name: string;
    customer_id: number | null;
    project_id: number | null;
  }[];
  const lists = db
    .prepare(
      `SELECT l.id, l.name, l.board_id, l.status_mapping
         FROM lists l JOIN boards b ON b.id = l.board_id
        WHERE b.is_archived = 0 AND (? IS NULL OR b.project_id = ?)
        ORDER BY l.board_id, l.position, l.id`
    )
    .all(projectId, projectId);

  // Chi liet ke ung vien thuoc dung khach hang — chon nham khach hang khac se bi 422.
  const scoped = <T>(sql: string): T[] =>
    customerId === null ? [] : (db.prepare(sql).all(customerId) as T[]);

  res.json({
    links,
    display: {
      customer_name: pick(`SELECT name FROM customers WHERE id = ?`, links.customer_id, 'name'),
      contact_name: pick(
        `SELECT full_name FROM contacts WHERE id = ?`,
        links.contact_id,
        'full_name'
      ),
      deal_title: pick(`SELECT title FROM deals WHERE id = ?`, links.deal_id, 'title'),
      contract_name: pick(`SELECT name FROM contracts WHERE id = ?`, links.contract_id, 'name'),
      quotation_code: pick(`SELECT code FROM quotations WHERE id = ?`, links.quotation_id, 'code'),
    },
    suggested_list_id: resolveDefaultList(links, projectId),
    boards,
    lists,
    contacts: scoped(
      `SELECT id, full_name, title FROM contacts WHERE customer_id = ? ORDER BY is_primary DESC, full_name`
    ),
    deals: scoped(
      `SELECT id, title, stage FROM deals WHERE customer_id = ? ORDER BY stage = 'won', stage = 'lost', id DESC`
    ),
    contracts: scoped(
      `SELECT id, name, number, status FROM contracts WHERE customer_id = ? ORDER BY id DESC`
    ),
    quotations: scoped(
      `SELECT id, code, version, status FROM quotations WHERE customer_id = ? ORDER BY id DESC`
    ),
  });
});

/** Doc mot cot ten de hien thi chip lien ket; tra null khi khong co lien ket. */
function pick(sql: string, id: number | null | undefined, column: string): string | null {
  if (id == null) return null;
  const row = db.prepare(sql).get(id) as Record<string, unknown> | undefined;
  const value = row?.[column];
  return typeof value === 'string' ? value : null;
}

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
              c.name AS customer_name, k.assignee_contact_id, ac.full_name AS assignee_name,
              ao.org_kind AS assignee_org_kind
         FROM cards k
         LEFT JOIN customers c ON c.id = k.customer_id
         LEFT JOIN contacts ac ON ac.id = k.assignee_contact_id
         LEFT JOIN customers ao ON ao.id = k.assignee_org_id
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

  const dueChanges = db
    .prepare(
      `SELECT * FROM card_due_changes WHERE card_id = ? ORDER BY changed_at DESC, id DESC LIMIT 20`
    )
    .all(id);

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
    dependencies: listDependencies(id),
    due_changes: dueChanges,
  });
});

/** Them mot phu thuoc finish-to-start. Chu trinh bi chan o addDependency. */
router.post('/:id/dependencies', (req, res) => {
  const successorId = intParam(req.params.id);
  const body = parseBody(z.object({ predecessor_id: z.number().int().positive() }), req);
  addDependency(body.predecessor_id, successorId);
  res.status(201).json(listDependencies(successorId));
});

router.delete('/:id/dependencies/:predecessorId', (req, res) => {
  const successorId = intParam(req.params.id);
  const predecessorId = intParam(req.params.predecessorId, 'predecessorId');
  db.prepare(`DELETE FROM card_dependencies WHERE predecessor_id = ? AND successor_id = ?`).run(
    predecessorId,
    successorId
  );
  res.json(listDependencies(successorId));
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
      contact_id: z.number().int().nullable().optional(),
      deal_id: z.number().int().nullable().optional(),
      contract_id: z.number().int().nullable().optional(),
      quotation_id: z.number().int().nullable().optional(),
      /* Truc rieng — khong nam trong TASK_LINK_KEYS nen khong bi xoa khi doi khach hang. */
      assignee_contact_id: z.number().int().nullable().optional(),
      approver_contact_id: z.number().int().nullable().optional(),
      /* Vong doi v16 — di qua setCardStatus, khong ghi thang xuong cot. */
      status: z.enum(CARD_STATUSES).optional(),
      blocked_reason: z.string().max(500).nullable().optional(),
      recur_rule: z.string().max(200).nullable().optional(),
      recur_until: dateOnly.optional(),
      project_id: z.number().int().nullable().optional(),
      /* Ly do doi han — ghi kem vao card_due_changes, khong luu tren the. */
      due_reason: z.string().max(300).nullable().optional(),
      estimate_hours: z.number().min(0).max(10_000).nullable().optional(),
      spent_hours: z.number().min(0).max(10_000).nullable().optional(),
      is_milestone: z.boolean().optional(),
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
  const currentLinks = card as CardRow & Record<string, number | null>;

  /*
   * Doi khach hang thi moi lien ket cap duoi deu thuoc ve khach hang cu — giu lai la
   * tao du lieu cheo. Bo het tru khoa duoc gui tuong minh trong cung yeu cau.
   */
  const customerChanged = body.customer_id !== undefined;
  const linksTouched = TASK_LINK_KEYS.some((key) => body[key] !== undefined);
  const nextLinks: EntityLinks = {};
  for (const key of TASK_LINK_KEYS) {
    if (body[key] !== undefined) nextLinks[key] = body[key];
    else if (key === 'customer_id') nextLinks[key] = currentLinks.customer_id;
    else nextLinks[key] = customerChanged ? null : currentLinks[key];
  }
  const derived = deriveTaskLinks(db, nextLinks);

  const fields: string[] = [];
  const values: unknown[] = [];
  const set = (sql: string, value: unknown) => {
    fields.push(sql);
    values.push(value);
  };

  if (body.title !== undefined) set('title = ?', body.title);
  if (body.description !== undefined) set('description = ?', body.description);
  if (body.start_date !== undefined) set('start_date = ?', body.start_date);
  /*
   * Doi han la thao tac phai de lai dau vet.
   *
   * `baseline_due_date` chot o LAN DAT DAU TIEN va khong bao gio ghi de: no la moc
   * so sanh co dinh. Moi lan doi sau do ghi mot dong `card_due_changes` — nho vay
   * "viec nay da bi doi han bon lan" tro thanh con so doc duoc, thay vi bien mat
   * nhu truoc day.
   */
  if (body.due_date !== undefined) {
    set('due_date = ?', body.due_date);
    const currentDue = (card as CardRow & { due_date: string | null }).due_date;
    if (currentDue !== body.due_date) {
      if (currentDue === null) {
        // Lan dat dau tien: dat baseline, khong tinh la mot lan truot.
        set('baseline_due_date = ?', body.due_date);
      } else {
        db.prepare(
          `INSERT INTO card_due_changes (card_id, old_due, new_due, reason) VALUES (?, ?, ?, ?)`
        ).run(id, currentDue, body.due_date, body.due_reason ?? null);
      }
    }
  }
  if (body.estimate_hours !== undefined) set('estimate_hours = ?', body.estimate_hours);
  if (body.spent_hours !== undefined) set('spent_hours = ?', body.spent_hours ?? 0);
  if (body.is_milestone !== undefined) set('is_milestone = ?', body.is_milestone ? 1 : 0);
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
  if (linksTouched) {
    for (const key of TASK_LINK_KEYS) set(`${key} = ?`, derived[key] ?? null);
  }
  /*
   * Nguoi phu trach doi doc lap voi khoi lien ket tren: doi khach hang KHONG lam
   * mat nguoi phu trach, vi viec ve khach hang moi van co the do dung nguoi do lam.
   */
  if (body.assignee_contact_id !== undefined) {
    const assignee = resolveAssignee(db, body.assignee_contact_id);
    set('assignee_contact_id = ?', assignee.assignee_contact_id);
    set('assignee_org_id = ?', assignee.assignee_org_id);
  }
  if (body.approver_contact_id !== undefined) {
    // Nguoi duyet cung dung resolveAssignee de chiu chung rang buoc "con hoat dong".
    set(
      'approver_contact_id = ?',
      resolveAssignee(db, body.approver_contact_id).assignee_contact_id
    );
  }
  if (body.recur_rule !== undefined) set('recur_rule = ?', body.recur_rule);
  if (body.recur_until !== undefined) set('recur_until = ?', body.recur_until);
  if (body.list_id !== undefined) {
    required(
      db.prepare(`SELECT id FROM lists WHERE id = ?`).get(body.list_id),
      'Khong tim thay danh sach'
    );
    assertParentListCompatible(db, id, body.list_id);
    set('list_id = ?', body.list_id);
    /*
     * Doi danh sach co the doi ca du an — nhung khong con gi phai ghi: du an suy
     * thang tu bang chua danh sach moi lan doc (v19).
     *
     * Trang thai thi khac: cot dich co the khai bao mot trang thai, va dieu do
     * duoc xu ly o duoi cung voi cac loi vao trang thai khac.
     */
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

  /*
   * Trang thai di qua setCardStatus, KHONG qua khoi `fields` o tren.
   *
   * `is_done` va `status` phai luon dong bo, va viec lap lai / moc bi chan chi
   * duoc tinh dung khi co mot noi biet ca trang thai cu lan moi. Chay sau UPDATE
   * chinh de ban sao sinh boi viec lap lai mang ngay thang vua sua.
   *
   * `is_done` van nhan duoc de khong pha cac lo goi cu (checkbox tren bang tinh,
   * thao tac hang loat) — no chi la loi tat cua hai trang thai dau va cuoi.
   */
  if (body.status !== undefined) {
    setCardStatus(id, body.status, { blockedReason: body.blocked_reason ?? null });
  } else if (body.is_done !== undefined && body.is_done !== Boolean(card.is_done)) {
    /* Chi doi khi gia tri THUC SU khac: `is_done: false` gui len mot the dang
       'doing' khong duoc lam no tut ve 'todo'. */
    setCardStatus(id, body.is_done ? 'done' : 'todo');
  } else if (body.blocked_reason !== undefined && card.status === 'blocked') {
    setCardStatus(id, 'blocked', { blockedReason: body.blocked_reason });
  } else if (body.list_id !== undefined) {
    /*
     * Doi danh sach ma khong noi ro trang thai: cot dich quyet dinh (v19).
     *
     * `moveToMappedList: false` vi the DA nam o cot dich sau UPDATE o tren —
     * cung ly do voi moveCard.
     */
    const mapped = db.prepare(`SELECT status_mapping FROM lists WHERE id = ?`).get(body.list_id) as
      { status_mapping: CardStatus | null } | undefined;
    if (mapped?.status_mapping) {
      setCardStatus(id, mapped.status_mapping, { moveToMappedList: false });
    }
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
                            customer_id, contact_id, deal_id, contract_id, quotation_id,
                            cover_color, search_text)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        source.contact_id,
        source.deal_id,
        source.contract_id,
        source.quotation_id,
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
