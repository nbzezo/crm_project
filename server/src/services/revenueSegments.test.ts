import assert from 'node:assert/strict';
import test from 'node:test';
import {
  baseFromPeriod,
  compareLine,
  groupOf,
  projectYear,
  type LineAnchor,
  type ProjectionInput,
} from './revenueSegments.ts';

const auto = (first: string | null): LineAnchor => ({
  mode: 'auto',
  manual_period: null,
  first_period: first,
});

test('12 thang dau tu thang co doanh thu dau tien la Moi, thang thu 13 la Nen', () => {
  const anchor = auto('2025-08');
  assert.equal(groupOf('2025-08', 'new', anchor), 'new');
  assert.equal(groupOf('2026-07', 'new', anchor), 'new');
  assert.equal(groupOf('2026-08', 'new', anchor), 'base');
  assert.equal(groupOf('2027-01', 'new', anchor), 'base');
  assert.equal(baseFromPeriod(anchor), '2026-08');
});

test('dong Mo rong giu nhom Mo rong trong 12 thang dau', () => {
  const anchor = auto('2026-03');
  assert.equal(groupOf('2026-03', 'expansion', anchor), 'expansion');
  assert.equal(groupOf('2027-03', 'expansion', anchor), 'base');
});

test('dong chua co doanh thu nao duoc xem la Moi', () => {
  assert.equal(groupOf('2026-05', 'new', auto(null)), 'new');
  assert.equal(baseFromPeriod(auto(null)), null);
});

test('moc chon tay thay cho moc tu dong; mode base dua ca dong ve Nen', () => {
  const manual: LineAnchor = { mode: 'manual', manual_period: '2024-01', first_period: '2026-01' };
  assert.equal(groupOf('2026-01', 'new', manual), 'base');
  const base: LineAnchor = { mode: 'base', manual_period: null, first_period: '2026-09' };
  assert.equal(groupOf('2026-09', 'new', base), 'base');
});

function input(over: Partial<ProjectionInput>): ProjectionInput {
  return {
    year: 2026,
    current: '2026-04',
    months: {},
    prevMonths: {},
    status: 'using',
    start_date: null,
    end_date: null,
    ...over,
  };
}

test('du kien: co cung ky thi nhan ty le nam nay / nam truoc cua cac thang truoc do', () => {
  const result = projectYear(
    input({
      months: { '2026-01': 110, '2026-02': 110, '2026-03': 110 },
      prevMonths: { '2025-01': 100, '2025-02': 100, '2025-03': 100, '2025-05': 200 },
    })
  );
  assert.deepEqual(result['2026-01'], { value: 110, source: 'actual' });
  // Thang hien tai chua nhap, khong co cung ky -> TB cac thang truoc do.
  assert.deepEqual(result['2026-04'], { value: 110, source: 'average' });
  // Cung ky 200 x 330/300.
  assert.deepEqual(result['2026-05'], { value: 220, source: 'same_period_ratio' });
});

test('du kien: thang da qua khong co so -> 0, so du kien da nhap duoc giu', () => {
  const result = projectYear(input({ months: { '2026-03': 50, '2026-09': 80 } }));
  assert.deepEqual(result['2026-02'], { value: 0, source: 'none' });
  assert.deepEqual(result['2026-09'], { value: 80, source: 'entered' });
  // Thang 10: TB cua thang 3 va thang 9 (cac thang truoc do co so).
  assert.deepEqual(result['2026-10'], { value: 65, source: 'average' });
});

test('du kien: dong da ngung hoac het han hop dong khong du kien them', () => {
  const stopped = projectYear(input({ months: { '2026-01': 100 }, status: 'stopped' }));
  assert.equal(stopped['2026-06'].value, 0);
  const ended = projectYear(input({ months: { '2026-01': 100 }, end_date: '2026-06-30' }));
  assert.equal(ended['2026-06'].value, 100);
  assert.equal(ended['2026-07'].value, 0);
});

test('so sanh chi tinh tren cac thang cua nhom, thieu cung ky thi lay TB va danh dau', () => {
  const result = compareLine({
    ...input({
      current: '2026-12',
      months: { '2026-08': 120, '2026-09': 120 },
      prevMonths: { '2025-08': 100, '2025-10': 100 },
    }),
    periods: ['2026-08', '2026-09'],
    baselineAvg: null,
  });
  assert.equal(result.prev_avg_vnd, 100);
  assert.equal(result.prev_avg_source, 'computed');
  assert.deepEqual(result.prev_same_period['2026-08'], { value: 100, approx: false });
  assert.deepEqual(result.prev_same_period['2026-09'], { value: 100, approx: true });
  assert.equal(result.prev_total_vnd, 200);
  assert.equal(result.prev_total_approx, true);
  assert.equal(result.ytd_actual_vnd, 240);
  assert.equal(result.projected_total_vnd, 240);
});

test('TB nam truoc nhap tay duoc uu tien hon so tu tinh', () => {
  const result = compareLine({
    ...input({ prevMonths: { '2025-01': 100 } }),
    periods: ['2026-01'],
    baselineAvg: 300,
  });
  assert.equal(result.prev_avg_vnd, 300);
  assert.equal(result.prev_avg_source, 'manual');
});
