import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { LATEST_VERSION, migrate } from '../db/migrate.ts';

for (const sourceVersion of [1, 4, 7, 9, 10]) {
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
      assert.deepEqual(db.pragma('foreign_key_check'), []);
      assert.equal((db.pragma('integrity_check', { simple: true }) as string).toLowerCase(), 'ok');
    } finally {
      db.close();
    }
  });
}
