/**
 * Ngay lich, lap viec theo thang va duong dan tep (ban ra soat 1.37.0).
 *
 * Chay: npm run test -w server
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-dates-'));
process.env.WORKFLOW_DATA_DIR = fixtureRoot;
process.env.WORKFLOW_DB_PATH = ':memory:';

const { isRealDate, todayLocal } = await import('./dates.ts');
const { shiftDate } = await import('../services/cardService.ts');
const { storedFilePath } = await import('./storedFile.ts');
const { FILES_DIR, closeDatabase } = await import('../db/connection.ts');

test('isRealDate: chi nhan ngay co that tren lich', () => {
  assert.equal(isRealDate('2026-02-28'), true);
  assert.equal(isRealDate('2028-02-29'), true, 'nam nhuan');
  assert.equal(isRealDate('2026-02-29'), false);
  assert.equal(isRealDate('2026-02-30'), false);
  assert.equal(isRealDate('2026-13-01'), false);
  assert.equal(isRealDate('2026-1-01'), false);
  assert.equal(isRealDate(''), false);
});

test('todayLocal: ngay theo gio Viet Nam, khong phai UTC', () => {
  /* 18:30 UTC ngay 11/10 = 01:30 sang 12/10 o Viet Nam. */
  assert.equal(todayLocal(new Date('2026-10-11T18:30:00Z')), '2026-10-12');
  assert.equal(todayLocal(new Date('2026-10-12T10:00:00Z')), '2026-10-12');
});

test('viec lap theo thang roi vao ngay cuoi thang khi thang dich ngan hon', () => {
  const monthly = { unit: 'month' as const, interval: 1 };
  assert.equal(shiftDate('2026-01-31', monthly), '2026-02-28');
  assert.equal(shiftDate('2028-01-31', monthly), '2028-02-29');
  assert.equal(shiftDate('2026-03-31', monthly), '2026-04-30');
  assert.equal(shiftDate('2026-01-15', monthly), '2026-02-15');
  assert.equal(shiftDate('2026-11-30', { unit: 'month', interval: 3 }), '2027-02-28');
  assert.equal(shiftDate('2026-12-31', monthly), '2027-01-31');
  assert.equal(shiftDate('2026-01-31', { unit: 'week', interval: 1 }), '2026-02-07');
});

test('storedFilePath: ten tep thoat khoi kho thi coi nhu khong ton tai', () => {
  assert.equal(storedFilePath('abc.pdf'), path.join(path.resolve(FILES_DIR), 'abc.pdf'));
  assert.throws(() => storedFilePath('../../.env'), /Không tìm thấy tệp/);
  assert.throws(() => storedFilePath(path.resolve(os.tmpdir(), 'x.txt')), /Không tìm thấy tệp/);
  assert.throws(() => storedFilePath(''), /Không tìm thấy tệp/);
  closeDatabase();
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});
