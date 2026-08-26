import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.ts';
import { intParam, parseBody, required } from '../lib/validate.ts';
import { computeMovePosition, nextPosition } from '../lib/position.ts';
import { CARD_STATUSES } from '@workflow/contracts';
import { setCardStatus } from '../services/cardService.ts';
import { softDeleteDocumentsForCards } from '../services/documentService.ts';

const router = Router();

/**
 * Cot nay NGHIA LA trang thai nao (v19); null = cot khong mang nghia vong doi.
 *
 * Cot khong anh xa van dung binh thuong de xep the (vi du "Kho y tuong", "Theo
 * khach") — keo the vao do khong dung den `cards.status`. Do la thu giu duoc tu
 * do bo cuc kieu Trello ma van co mot nguon su that duy nhat cho vong doi.
 */
const statusMapping = z.enum(CARD_STATUSES).nullable().optional();

router.post('/', (req, res) => {
  const body = parseBody(
    z.object({
      board_id: z.number().int(),
      name: z.string().trim().min(1),
      status_mapping: statusMapping,
    }),
    req
  );
  required(
    db.prepare(`SELECT id FROM boards WHERE id = ?`).get(body.board_id),
    'Khong tim thay bang'
  );
  const position = nextPosition({ table: 'lists', scopeCol: 'board_id', scopeVal: body.board_id });
  const info = db
    .prepare(`INSERT INTO lists (board_id, name, position, status_mapping) VALUES (?, ?, ?, ?)`)
    .run(body.board_id, body.name, position, body.status_mapping ?? null);
  res.status(201).json(db.prepare(`SELECT * FROM lists WHERE id = ?`).get(info.lastInsertRowid));
});

router.patch('/:id', (req, res) => {
  const id = intParam(req.params.id);
  const body = parseBody(
    z.object({
      name: z.string().trim().min(1).optional(),
      is_collapsed: z.boolean().optional(),
      status_mapping: statusMapping,
    }),
    req
  );
  required(db.prepare(`SELECT id FROM lists WHERE id = ?`).get(id), 'Khong tim thay danh sach');
  if (body.name !== undefined)
    db.prepare(`UPDATE lists SET name = ? WHERE id = ?`).run(body.name, id);
  if (body.is_collapsed !== undefined)
    db.prepare(`UPDATE lists SET is_collapsed = ? WHERE id = ?`).run(body.is_collapsed ? 1 : 0, id);

  /*
   * Gan anh xa cho mot cot DA CO the: keo tat ca the trong cot ve dung trang thai
   * do ngay. Neu khong, cot vua khai bao "day la Hoan thanh" ma the ben trong van
   * mang 'todo' — dung cai lech ma v19 sinh ra de xoa bo.
   *
   * Bo qua the DA XONG khi anh xa khac 'done': keo mot viec da dong ve 'doing'
   * chi vi no nam trong cot dang duoc gan nhan la mo lai viec da hoan thanh.
   */
  if (body.status_mapping !== undefined) {
    db.prepare(`UPDATE lists SET status_mapping = ? WHERE id = ?`).run(body.status_mapping, id);
    if (body.status_mapping) {
      const cards = db
        .prepare(
          `SELECT id FROM cards
            WHERE list_id = ? AND is_archived = 0 AND (is_done = 0 OR ? = 'done')`
        )
        .all(id, body.status_mapping) as { id: number }[];
      for (const card of cards) {
        setCardStatus(card.id, body.status_mapping, { moveToMappedList: false });
      }
    }
  }

  res.json(db.prepare(`SELECT * FROM lists WHERE id = ?`).get(id));
});

/** Sap xep lai the trong danh sach (giong "Sort by…" cua Trello). */
router.patch('/:id/sort', (req, res) => {
  const id = intParam(req.params.id);
  const { by } = parseBody(
    z.object({ by: z.enum(['created_desc', 'created_asc', 'due', 'title', 'priority']) }),
    req
  );
  required(db.prepare(`SELECT id FROM lists WHERE id = ?`).get(id), 'Khong tim thay danh sach');

  const ORDER: Record<string, string> = {
    created_desc: 'created_at DESC, id DESC',
    created_asc: 'created_at ASC, id ASC',
    due: 'due_date IS NULL, due_date ASC, id ASC',
    title: 'title COLLATE NOCASE ASC',
    priority: `CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, id ASC`,
  };

  db.transaction(() => {
    const rows = db
      .prepare(`SELECT id FROM cards WHERE list_id = ? ORDER BY ${ORDER[by]}`)
      .all(id) as { id: number }[];
    const update = db.prepare(`UPDATE cards SET position = ? WHERE id = ?`);
    rows.forEach((row, i) => update.run((i + 1) * 1024, row.id));
  })();

  res.json({ ok: true });
});

/** Nhan ban danh sach kem toan bo the (giong "Copy list"). */
router.post('/:id/copy', (req, res) => {
  const id = intParam(req.params.id);
  const body = parseBody(z.object({ name: z.string().trim().min(1).optional() }), req);
  const source = required(
    db.prepare(`SELECT * FROM lists WHERE id = ?`).get(id),
    'Khong tim thay danh sach'
  ) as { board_id: number; name: string; status_mapping: string | null };

  const newId = db.transaction(() => {
    const position = nextPosition({
      table: 'lists',
      scopeCol: 'board_id',
      scopeVal: source.board_id,
    });
    const info = db
      // Ban sao mang cung y nghia vong doi voi ban goc.
      .prepare(`INSERT INTO lists (board_id, name, position, status_mapping) VALUES (?, ?, ?, ?)`)
      .run(
        source.board_id,
        body.name ?? `${source.name} (sao chép)`,
        position,
        source.status_mapping
      );
    const listId = Number(info.lastInsertRowid);

    const cards = db
      .prepare(`SELECT * FROM cards WHERE list_id = ? ORDER BY position, id`)
      .all(id) as Record<string, unknown>[];
    const insertCard = db.prepare(
      `INSERT INTO cards (list_id, title, description, position, start_date, due_date, priority,
                          customer_id, deal_id, cover_color, search_text)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertLabel = db.prepare(
      `INSERT OR IGNORE INTO card_labels (card_id, label_id) VALUES (?, ?)`
    );
    const insertItem = db.prepare(
      `INSERT INTO checklist_items (card_id, content, is_done, position) VALUES (?, ?, ?, ?)`
    );

    for (const card of cards) {
      const info2 = insertCard.run(
        listId,
        card.title,
        card.description,
        card.position,
        card.start_date,
        card.due_date,
        card.priority,
        card.customer_id,
        card.deal_id,
        card.cover_color,
        card.search_text
      );
      const newCardId = Number(info2.lastInsertRowid);
      const labels = db
        .prepare(`SELECT label_id FROM card_labels WHERE card_id = ?`)
        .all(card.id as number) as { label_id: number }[];
      for (const l of labels) insertLabel.run(newCardId, l.label_id);
      const items = db
        .prepare(`SELECT * FROM checklist_items WHERE card_id = ? ORDER BY position`)
        .all(card.id as number) as Record<string, unknown>[];
      for (const item of items)
        insertItem.run(newCardId, item.content, item.is_done, item.position);
    }
    return listId;
  })();

  res.status(201).json(db.prepare(`SELECT * FROM lists WHERE id = ?`).get(newId));
});

router.patch('/:id/move', (req, res) => {
  const id = intParam(req.params.id);
  const body = parseBody(
    z.object({
      beforeId: z.number().int().nullable().optional(),
      afterId: z.number().int().nullable().optional(),
    }),
    req
  );
  const list = required(
    db.prepare(`SELECT * FROM lists WHERE id = ?`).get(id),
    'Khong tim thay danh sach'
  ) as { board_id: number };

  const position = db.transaction(() => {
    const pos = computeMovePosition(
      { table: 'lists', scopeCol: 'board_id', scopeVal: list.board_id },
      body.beforeId,
      body.afterId,
      id
    );
    db.prepare(`UPDATE lists SET position = ? WHERE id = ?`).run(pos, id);
    return pos;
  })();

  res.json({ id, board_id: list.board_id, position });
});

router.delete('/:id', (req, res) => {
  const id = intParam(req.params.id);
  db.transaction(() => {
    const cardIds = (
      db.prepare(`SELECT id FROM cards WHERE list_id = ?`).all(id) as { id: number }[]
    ).map((row) => row.id);
    softDeleteDocumentsForCards(cardIds);
    db.prepare(`DELETE FROM lists WHERE id = ?`).run(id);
  })();
  res.json({ ok: true });
});

export default router;
