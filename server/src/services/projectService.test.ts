import test from 'node:test';
import assert from 'node:assert/strict';
import { projectHealth, type ProjectRow } from './projectService.ts';

function project(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: 1,
    status: 'active',
    plan_start: '2026-01-01',
    plan_end: '2026-12-31',
    task_total: 10,
    task_done: 5,
    task_overdue: 0,
    task_waiting: 0,
    days_left: 100,
    ...overrides,
  };
}

const MIDPOINT = new Date('2026-06-01T00:00:00');

test('du an dung ke hoach la xanh', () => {
  assert.equal(projectHealth(project(), MIDPOINT), 'green');
});

test('qua han ke hoach la do, khong phai vang', () => {
  assert.equal(projectHealth(project({ days_left: -3 }), MIDPOINT), 'red');
});

test('co viec bi chan la do ngay ca khi con nhieu thoi gian', () => {
  assert.equal(projectHealth(project({ task_waiting: 1 }), MIDPOINT), 'red');
});

test('co viec qua han nhung khong bi chan la vang', () => {
  assert.equal(projectHealth(project({ task_overdue: 2 }), MIDPOINT), 'amber');
});

/**
 * Nguong bat "truot dan" — kieu that bai am tham nhat, vi tung tuan deu con thoi
 * gian nen khong bao gio co mot ngay nao de bao dong.
 */
test('tieu qua 80% thoi gian ma chua xong 60% cong viec la vang', () => {
  // 2026-11-01 tren khoang 01/01–31/12 la ~83% thoi gian; 30% cong viec da xong.
  const late = new Date('2026-11-01T00:00:00');
  assert.equal(projectHealth(project({ task_done: 3 }), late), 'amber');
  // Cung moc thoi gian nhung da xong 70% thi van xanh.
  assert.equal(projectHealth(project({ task_done: 7 }), late), 'green');
});

test('du an chua co viec nao duoc danh dau chua du du lieu', () => {
  const late = new Date('2026-11-01T00:00:00');
  assert.equal(projectHealth(project({ task_total: 0, task_done: 0 }), late), 'unknown');
});

/** Du an hoan tat co ket qua; du an huy la trang thai trung tinh. */
test('du an da dong la xanh, du an da huy la trung tinh', () => {
  assert.equal(projectHealth(project({ status: 'done', days_left: -50 }), MIDPOINT), 'green');
  assert.equal(
    projectHealth(project({ status: 'cancelled', task_waiting: 3 }), MIDPOINT),
    'unknown'
  );
});

test('du an khong dat ngay ke hoach la chua du du lieu, nhung canh bao that van uu tien', () => {
  const noDates = project({ plan_start: null, plan_end: null, days_left: null });
  assert.equal(projectHealth(noDates, MIDPOINT), 'unknown');
  assert.equal(projectHealth({ ...noDates, task_overdue: 1 }, MIDPOINT), 'amber');
});
