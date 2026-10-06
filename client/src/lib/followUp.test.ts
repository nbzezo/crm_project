import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NUDGE_HORIZON_DAYS, selectNeedsNudge } from './followUp';
import type { TaskRow } from '../types';

function makeTask(overrides: Partial<Pick<TaskRow, 'due_date' | 'status' | 'parent_id'>> = {}) {
  return {
    id: 1,
    due_date: null,
    status: 'open',
    parent_id: null,
    ...overrides,
  } as TaskRow;
}

describe('selectNeedsNudge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 6, 12, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('chon viec qua han va viec den han dung trong bien nhac', () => {
    const overdue = makeTask({ due_date: '2026-10-05' });
    const onHorizon = makeTask({ due_date: '2026-10-09' });

    expect(selectNeedsNudge([overdue, onHorizon])).toEqual([overdue, onHorizon]);
  });

  it('bo viec qua bien, khong co han va trang thai binh thuong', () => {
    const beyondHorizon = makeTask({ due_date: '2026-10-10' });
    const withoutDueDate = makeTask();
    const normal = makeTask({ due_date: '2026-12-31' });

    expect(selectNeedsNudge([beyondHorizon, withoutDueDate, normal])).toEqual([]);
    expect(NUDGE_HORIZON_DAYS).toBe(3);
  });

  it('chon viec bi chan hoac cho khach du han con xa', () => {
    const blocked = makeTask({ due_date: '2026-12-31', status: 'blocked' });
    const waitingCustomer = makeTask({
      due_date: '2026-12-31',
      status: 'waiting_customer',
    });

    expect(selectNeedsNudge([blocked, waitingCustomer])).toEqual([blocked, waitingCustomer]);
  });

  it('loai viec con du qua han', () => {
    const child = makeTask({ due_date: '2026-10-01', parent_id: 42 });

    expect(selectNeedsNudge([child])).toEqual([]);
  });
});
