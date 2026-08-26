import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrate } from '../db/migrate.ts';

/*
 * v29: entity_change_log la bang da hinh (entity_type + entity_id), khong dat
 * duoc khoa ngoai that len entity_id nen khong tu ON DELETE CASCADE duoc. Truoc
 * v29, xoa mot deal/project/contract de lai nhat ky mo coi — va vi cac bang nay
 * dung INTEGER PRIMARY KEY thuong (khong AUTOINCREMENT), SQLite se tai su dung
 * id vua giai phong cho ban ghi ke tiep, khien nhat ky cu "hien nham" thanh cua
 * ban ghi moi. Ba trigger trg_entity_change_log_* (v29) don nhat ky ngay khi ban
 * ghi goc bi xoa, giong het mau trg_label_links_* (v9) cho label_links.
 */
function setup() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  const customerId = Number(
    db
      .prepare(`INSERT INTO customers (name, search_text) VALUES (?, ?)`)
      .run('Khach hang v29', 'khach hang v29').lastInsertRowid
  );
  return { db, customerId };
}

function logEntry(
  db: Database.Database,
  entityType: 'deal' | 'project' | 'contract',
  entityId: number
) {
  db.prepare(
    `INSERT INTO entity_change_log (entity_type, entity_id, field, old_value, new_value)
     VALUES (?, ?, 'stage', 'lead', 'won')`
  ).run(entityType, entityId);
}

function countLog(db: Database.Database, entityType: string, entityId: number): number {
  return (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM entity_change_log WHERE entity_type = ? AND entity_id = ?`
      )
      .get(entityType, entityId) as { n: number }
  ).n;
}

test('xoa deal don sach nhat ky thay doi cua no', () => {
  const { db, customerId } = setup();
  const dealId = Number(
    db
      .prepare(
        `INSERT INTO deals (customer_id, title, stage, position, search_text) VALUES (?, ?, 'lead', 1024, ?)`
      )
      .run(customerId, 'Co hoi v29', 'co hoi v29').lastInsertRowid
  );
  logEntry(db, 'deal', dealId);
  assert.equal(countLog(db, 'deal', dealId), 1);

  db.prepare(`DELETE FROM deals WHERE id = ?`).run(dealId);
  assert.equal(countLog(db, 'deal', dealId), 0);
  db.close();
});

test('xoa du an don sach nhat ky thay doi cua no', () => {
  const { db } = setup();
  const projectId = Number(
    db.prepare(`INSERT INTO projects (name) VALUES (?)`).run('Du an v29').lastInsertRowid
  );
  logEntry(db, 'project', projectId);
  assert.equal(countLog(db, 'project', projectId), 1);

  db.prepare(`DELETE FROM projects WHERE id = ?`).run(projectId);
  assert.equal(countLog(db, 'project', projectId), 0);
  db.close();
});

test('xoa hop dong don sach nhat ky thay doi cua no', () => {
  const { db, customerId } = setup();
  const contractId = Number(
    db
      .prepare(`INSERT INTO contracts (customer_id, name, search_text) VALUES (?, ?, ?)`)
      .run(customerId, 'Hop dong v29', 'hop dong v29').lastInsertRowid
  );
  logEntry(db, 'contract', contractId);
  assert.equal(countLog(db, 'contract', contractId), 1);

  db.prepare(`DELETE FROM contracts WHERE id = ?`).run(contractId);
  assert.equal(countLog(db, 'contract', contractId), 0);
  db.close();
});

test('id tai su dung sau khi xoa deal khong ke thua nham nhat ky cu', () => {
  const { db, customerId } = setup();
  const insertDeal = () =>
    Number(
      db
        .prepare(
          `INSERT INTO deals (customer_id, title, stage, position, search_text) VALUES (?, ?, 'lead', 1024, ?)`
        )
        .run(customerId, 'Co hoi A', 'co hoi a').lastInsertRowid
    );

  const firstId = insertDeal();
  logEntry(db, 'deal', firstId);
  db.prepare(`DELETE FROM deals WHERE id = ?`).run(firstId);

  const secondId = insertDeal();
  // Khong ep buoc SQLite tai su dung id (hanh vi rowid noi bo), chi kiem tra bat
  // bien nghiep vu: du id co trung hay khong, ban ghi moi khong bao gio mang theo
  // nhat ky cua ban ghi cu.
  assert.equal(countLog(db, 'deal', secondId), 0);
  db.close();
});
