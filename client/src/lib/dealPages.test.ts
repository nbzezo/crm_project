import { describe, expect, it } from 'vitest';
import { appendStagePage } from './dealPages';
import { refreshDealTotals } from './dnd/deals';
import type { Deal, DealsPagedResponse } from '../types';

const deal = (id: number, stage: 'lead' | 'quoted'): Deal =>
  ({ id, stage, title: `Cơ hội ${id}` }) as Deal;

const data = (): DealsPagedResponse => ({
  stages: { lead: [deal(1, 'lead')], quoted: [] },
  totals: {
    lead: { count: 3, sum_vnd: 600, weighted_vnd: 300 },
    quoted: { count: 0, sum_vnd: 0, weighted_vnd: 0 },
  },
  more: { lead: 2, quoted: 0 },
});

describe('appendStagePage', () => {
  it('nối đúng cột, giữ thứ tự và không đổi dữ liệu đầu vào', () => {
    const before = data();
    const result = appendStagePage(before, 'lead', [deal(2, 'lead'), deal(3, 'lead')]);
    expect(result.stages.lead.map((item) => item.id)).toEqual([1, 2, 3]);
    expect(result.more.lead).toBe(0);
    expect(before.stages.lead.map((item) => item.id)).toEqual([1]);
    expect(before.more.lead).toBe(2);
  });

  it('bỏ id trùng và chỉ giảm more theo số cơ hội mới', () => {
    const result = appendStagePage(data(), 'lead', [deal(1, 'lead'), deal(2, 'lead')]);
    expect(result.stages.lead.map((item) => item.id)).toEqual([1, 2]);
    expect(result.more.lead).toBe(1);
  });

  it('không giảm more xuống dưới 0', () => {
    const input = data();
    input.more.lead = 0;
    expect(appendStagePage(input, 'lead', [deal(2, 'lead')]).more.lead).toBe(0);
  });
});

describe('refreshDealTotals khi du lieu theo trang', () => {
  it('chuyen so / tien cua co hoi vua keo, tru theo xac suat cu va cong theo xac suat moi', () => {
    const data = {
      stages: { lead: [], quoted: [] },
      totals: {
        lead: { count: 10, sum_vnd: 1000, weighted_vnd: 100 },
        quoted: { count: 2, sum_vnd: 500, weighted_vnd: 250 },
      },
      more: { lead: 5, quoted: 0 },
    } as unknown as DealsPagedResponse;
    refreshDealTotals(data, {
      fromStage: 'lead',
      toStage: 'quoted',
      value_vnd: 200,
      fromProbability: 10,
      toProbability: 50,
    });
    expect(data.totals.lead).toEqual({ count: 9, sum_vnd: 800, weighted_vnd: 80 });
    expect(data.totals.quoted).toEqual({ count: 3, sum_vnd: 700, weighted_vnd: 350 });
  });
});
