import { describe, expect, it } from 'vitest';
import { pickDealSignal } from './DealCard';
import type { Deal } from '../../types';

function deal(patch: Partial<Deal> = {}): Deal {
  return {
    id: 1,
    title: 'Co hoi test',
    stage: 'qualified',
    value_vnd: 100,
    probability: 50,
    customer_name: null,
    contact_name: null,
    expected_close_date: null,
    next_action: null,
    next_action_date: null,
    on_hold: 0,
    days_idle: 0,
    days_in_stage: 0,
    handover_ready: 1,
    v1_no_event: 0,
    v2_no_economic: 0,
    lost_reason: null,
    ...patch,
  } as Deal;
}

describe('pickDealSignal', () => {
  it('uu tien veto truoc tam dung va viec ke tiep', () => {
    const signal = pickDealSignal(
      deal({ v1_no_event: 1, on_hold: 1, next_action: 'Goi lai', next_action_date: '2000-01-01' })
    );
    expect(signal?.kind).toBe('veto');
    expect(signal?.others).toContain('Tạm dừng');
  });

  it('uu tien viec ke tiep qua han truoc im lang va tuoi giai doan', () => {
    const signal = pickDealSignal(
      deal({
        next_action: 'Goi lai',
        next_action_date: '2000-01-01',
        days_idle: 30,
        days_in_stage: 30,
      })
    );
    expect(signal?.kind).toBe('next-overdue');
    expect(signal?.others).toEqual(
      expect.arrayContaining(['Không có tương tác 30 ngày', 'Ở giai đoạn này 30 ngày'])
    );
  });
});
