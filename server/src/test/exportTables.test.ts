import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrate } from '../db/migrate.ts';
import { EXPORT_TABLES } from '../routes/system.ts';

/*
 * EXPORT_TABLES (routes/system.ts) la mang viet tay dung cho GET /api/export — no
 * tung dung lai o schema v10/v11 va bo sot 21 bang them tu v13-v26 ma khong ai
 * canh bao. Test nay khong the ngan lan dau tien, nhung ngan lan TAI DIEN: bat ky
 * bang du lieu that nao ton tai o schema moi nhat ma khong nam trong EXPORT_TABLES
 * se lam test fail, buoc nguoi them migration moi phai cap nhat danh sach xuat.
 */
test('EXPORT_TABLES phu het moi bang du lieu that o schema moi nhat', () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);

  const tables = db
    .prepare(
      `SELECT name FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
          -- Bang bong cua chi muc FTS5 (vd ai_document_chunks_fts, _data/_idx/_docsize/_config)
          -- la du lieu suy ra duoc tu bang goc, khong phai nguon that can sao luu.
          AND name NOT LIKE '%\\_fts' ESCAPE '\\'
          AND name NOT LIKE '%\\_fts\\_%' ESCAPE '\\'`
    )
    .all() as { name: string }[];

  /* `users` va `sessions` (v35) la du lieu dang nhap / phien, KHONG phai du lieu
     nghiep vu — co y khong nam trong ban xuat JSON. */
  const NON_BUSINESS = new Set(['users', 'sessions']);
  const exportSet = new Set<string>(EXPORT_TABLES);
  const missing = tables
    .map((row) => row.name)
    .filter((name) => !exportSet.has(name) && !NON_BUSINESS.has(name));

  assert.deepEqual(missing, [], `Bang chua co trong EXPORT_TABLES: ${missing.join(', ')}`);
});
