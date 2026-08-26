import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { LATEST_VERSION, migrate } from '../db/migrate.ts';

for (const sourceVersion of [1, 4, 7, 9, 10, 14, 18]) {
  test(`nang cap fixture v${sourceVersion} len v${LATEST_VERSION} khong mat du lieu`, () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    try {
      migrate(db, sourceVersion);
      db.prepare(`INSERT INTO customers (name, search_text) VALUES (?, ?)`).run(
        `Khach hang fixture v${sourceVersion}`,
        `fixture v${sourceVersion}`
      );
      const customerId = Number(
        (db.prepare(`SELECT id FROM customers ORDER BY id DESC LIMIT 1`).get() as { id: number }).id
      );
      const boardId = Number(
        db
          .prepare(`INSERT INTO boards (name, customer_id) VALUES (?, ?)`)
          .run('Bang cu', customerId).lastInsertRowid
      );
      const listId = Number(
        db
          .prepare(`INSERT INTO lists (board_id, name, position) VALUES (?, ?, ?)`)
          .run(boardId, 'Danh sach cu', 1024).lastInsertRowid
      );
      /* Hai cot de kiem chung backfill cua v19: mot cot mang ten quy trinh quen
         thuoc (phai doan ra 'done') va mot cot ten tu do (phai de NULL). */
      const doneListId = Number(
        db
          .prepare(`INSERT INTO lists (board_id, name, position) VALUES (?, ?, ?)`)
          .run(boardId, 'Hoàn thành', 2048).lastInsertRowid
      );
      db.prepare(
        `INSERT INTO cards (list_id, title, position, customer_id, search_text) VALUES (?, ?, ?, ?, ?)`
      ).run(listId, 'Cong viec cu', 1024, customerId, 'cong viec cu');

      migrate(db);

      assert.equal(db.pragma('user_version', { simple: true }), LATEST_VERSION);
      assert.equal(
        (db.prepare(`SELECT name FROM customers WHERE id = ?`).get(customerId) as { name: string })
          .name,
        `Khach hang fixture v${sourceVersion}`
      );
      assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM cards`).get() as { n: number }).n, 1);

      /* v15: du lieu cu phai roi vao dung mac dinh — moi khach hang san co la
         'customer' (khong lot khoi pipeline) va moi nguoi lien he van giao viec
         duoc (is_active = 1). Sai mac dinh o day la mat du lieu am tham. */
      assert.equal(
        (
          db.prepare(`SELECT org_kind FROM customers WHERE id = ?`).get(customerId) as {
            org_kind: string;
          }
        ).org_kind,
        'customer'
      );
      assert.equal(
        (
          db
            .prepare(`SELECT COUNT(*) AS n FROM cards WHERE assignee_contact_id IS NOT NULL`)
            .get() as { n: number }
        ).n,
        0
      );

      /* v19: cot doan duoc nghia thi mang anh xa, cot ten tu do de NULL — doan
         bua se lam keo the vao do am tham doi trang thai khong dung y nguoi dung. */
      const mappings = db.prepare(`SELECT id, status_mapping FROM lists`).all() as {
        id: number;
        status_mapping: string | null;
      }[];
      assert.equal(mappings.find((l) => l.id === doneListId)?.status_mapping, 'done');
      assert.equal(mappings.find((l) => l.id === listId)?.status_mapping, null);

      // `cards.project_id` phai bien mat cung voi chi muc cua no.
      const cardColumns = db.prepare(`PRAGMA table_info(cards)`).all() as { name: string }[];
      assert.ok(!cardColumns.some((c) => c.name === 'project_id'));
      const indexes = db.prepare(`PRAGMA index_list(cards)`).all() as { name: string }[];
      assert.ok(!indexes.some((i) => i.name === 'idx_cards_project'));

      /* v20: trang thai doc/snooze nam o lop tong hop, khong chen cot vao bon
         bang nghiep vu nguon. */
      const notificationColumns = db.prepare(`PRAGMA table_info(notification_states)`).all() as {
        name: string;
      }[];
      assert.deepEqual(
        notificationColumns.map((column) => column.name),
        ['notification_key', 'is_read', 'read_at', 'snoozed_until', 'updated_at']
      );

      // v32: Ghi chu nhanh la bang moc doc lap, khong dung lai bang nao cu.
      const quickNoteColumns = db.prepare(`PRAGMA table_info(quick_notes)`).all() as {
        name: string;
      }[];
      assert.ok(quickNoteColumns.some((c) => c.name === 'is_pinned'));
      const documentColumns = db.prepare(`PRAGMA table_info(documents)`).all() as {
        name: string;
      }[];
      assert.ok(documentColumns.some((c) => c.name === 'quick_note_id'));

      assert.deepEqual(db.pragma('foreign_key_check'), []);
      assert.equal((db.pragma('integrity_check', { simple: true }) as string).toLowerCase(), 'ok');
    } finally {
      db.close();
    }
  });
}
