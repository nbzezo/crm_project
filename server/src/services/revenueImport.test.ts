import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAmount, parseAnchor, parseDate, validateRow } from './revenueImport.ts';

test('so tien: so, chu co dau cham/phay, tu choi so am va chu la', () => {
  assert.equal(parseAmount(1500000), 1500000);
  assert.equal(parseAmount(12.6), 13);
  assert.equal(parseAmount('1.234.567'), 1234567);
  assert.equal(parseAmount('1,234,567 đ'), 1234567);
  assert.equal(parseAmount('0'), 0);
  assert.equal(parseAmount(-5), null);
  assert.equal(parseAmount('12.34'), null);
  assert.equal(parseAmount('abc'), null);
});

test('ngay: o Date, dd/mm/yyyy, yyyy-mm-dd; ngay khong ton tai bi tu choi', () => {
  assert.equal(parseDate(new Date(Date.UTC(2026, 0, 31))), '2026-01-31');
  assert.equal(parseDate('5/3/2026'), '2026-03-05');
  assert.equal(parseDate('2026-03-05'), '2026-03-05');
  assert.equal(parseDate('31/02/2026'), null);
});

test('moc phan nhom: tu dong, toan bo la Nen, MM/YYYY', () => {
  assert.deepEqual(parseAnchor('Tự động'), { mode: 'auto', period: null });
  assert.deepEqual(parseAnchor('toan bo la nen'), { mode: 'base', period: null });
  assert.deepEqual(parseAnchor('8/2025'), { mode: 'manual', period: '2025-08' });
  assert.equal(parseAnchor('13/2025'), null);
});

test('dong Excel: nhan nhan tieng Viet, gom loi tung o thay vi dung o loi dau', () => {
  const ok = validateRow({
    row: 2,
    customer: 'Alpha',
    kind: 'Mở rộng',
    status: 'Tạm dừng',
    stage: 'Đã thanh toán',
    m1: 100,
    m3: '2.000',
  });
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.contract_kind, 'expansion');
  assert.equal(ok.status, 'paused');
  assert.equal(ok.stage, 'paid');
  assert.deepEqual(
    [...ok.months],
    [
      [1, 100],
      [3, 2000],
    ]
  );

  const bad = validateRow({
    row: 3,
    kind: 'Cũ',
    m2: 'x',
    start_date: '02/02/2026',
    end_date: '01/01/2026',
  });
  assert.equal(bad.errors.length, 4);
});
