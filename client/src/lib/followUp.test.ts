import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NUDGE_HORIZON_DAYS, selectNeedsNudge } from './followUp';
import type { TaskRow } from '../types';

function makeTask(
  overrides: Partial<
    Pick<TaskRow, 'due_date' | 'status' | 'parent_id' | 'assignee_contact_id'>
  > = {}
) {
  return {
    id: 1,
    due_date: null,
    status: 'open',
    parent_id: null,
    assignee_contact_id: null,
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

    expect(selectNeedsNudge([overdue, onHorizon], null)).toEqual([overdue, onHorizon]);
  });

  it('bo viec qua bien, khong co han va trang thai binh thuong', () => {
    const beyondHorizon = makeTask({ due_date: '2026-10-10' });
    const withoutDueDate = makeTask();
    const normal = makeTask({ due_date: '2026-12-31' });

    expect(selectNeedsNudge([beyondHorizon, withoutDueDate, normal], null)).toEqual([]);
    expect(NUDGE_HORIZON_DAYS).toBe(3);
  });

  it('bo viec cua toi qua han va bi chan, giu viec cua nguoi khac qua han', () => {
    const mineOverdue = makeTask({ due_date: '2026-10-05', assignee_contact_id: 7 });
    const mineBlocked = makeTask({ status: 'blocked', assignee_contact_id: 7 });
    const othersOverdue = makeTask({ due_date: '2026-10-05', assignee_contact_id: 8 });

    expect(selectNeedsNudge([mineOverdue, mineBlocked, othersOverdue], 7)).toEqual([othersOverdue]);
  });

  it('giu viec chua giao qua han va blocked cua nguoi khac khong han', () => {
    const unassignedOverdue = makeTask({ due_date: '2026-10-05' });
    const blocked = makeTask({ due_date: null, status: 'blocked', assignee_contact_id: 8 });

    expect(selectNeedsNudge([unassignedOverdue, blocked], 7)).toEqual([unassignedOverdue, blocked]);
  });

  it('chi giu waiting_customer khi co han trong ba ngay', () => {
    const waitingCustomer = makeTask({
      due_date: null,
      status: 'waiting_customer',
    });
    const waitingTomorrow = makeTask({
      due_date: '2026-10-07',
      status: 'waiting_customer',
    });

    expect(selectNeedsNudge([waitingCustomer, waitingTomorrow], null)).toEqual([waitingTomorrow]);
  });

  it('khong loai theo nguoi khi meContactId la null', () => {
    const mineOverdue = makeTask({ due_date: '2026-10-05', assignee_contact_id: 7 });

    expect(selectNeedsNudge([mineOverdue], null)).toEqual([mineOverdue]);
  });

  it('loai viec con du qua han', () => {
    const child = makeTask({ due_date: '2026-10-01', parent_id: 42 });

    expect(selectNeedsNudge([child], null)).toEqual([]);
  });
});
