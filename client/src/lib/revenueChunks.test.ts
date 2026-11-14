import { describe, expect, it, vi } from 'vitest';
import type { RevenueLine } from '../types';
import {
  FIRST_REVENUE_CHUNK,
  NEXT_REVENUE_CHUNK,
  loadRevenueLinesInChunks,
  type RevenueLineChunk,
} from './revenueChunks';

const line = (id: number) => ({ id }) as RevenueLine;
const chunk = (
  ids: number[],
  next: number | null,
  total: number | null = null
): RevenueLineChunk => ({ year: 2026, lines: ids.map(line), total, next_offset: next });

describe('loadRevenueLinesInChunks', () => {
  it('nối khúc theo đúng thứ tự, bỏ trùng và báo tiến độ', async () => {
    const calls: [number, number][] = [];
    const pages = [chunk([3, 1], 2, 5), chunk([1, 4], 4), chunk([2], null)];
    const progress: unknown[] = [];
    const result = await loadRevenueLinesInChunks(
      async (limit, offset) => {
        calls.push([limit, offset]);
        const page = pages[calls.length - 1];
        if (!page) throw new Error('het khuc du lieu mau');
        return page;
      },
      (partial) => progress.push([partial.lines.map((l) => l.id), partial.progress])
    );
    expect(calls).toEqual([
      [FIRST_REVENUE_CHUNK, 0],
      [NEXT_REVENUE_CHUNK, 2],
      [NEXT_REVENUE_CHUNK, 4],
    ]);
    expect(result.lines.map((l) => l.id)).toEqual([3, 1, 4, 2]);
    expect(result.progress).toBeUndefined();
    expect(progress).toEqual([
      [[3, 1], { loaded: 2, total: 5 }],
      [[3, 1, 4], { loaded: 4, total: 5 }],
    ]);
  });

  it('một khúc là xong thì không báo tiến độ', async () => {
    const onProgress = vi.fn();
    const result = await loadRevenueLinesInChunks(async () => chunk([1], null, 1), onProgress);
    expect(result.lines).toHaveLength(1);
    expect(onProgress).not.toHaveBeenCalled();
  });

  it('dừng khi bị huỷ', async () => {
    const controller = new AbortController();
    let calls = 0;
    await expect(
      loadRevenueLinesInChunks(
        async () => {
          calls += 1;
          controller.abort();
          return chunk([1], 1, 3);
        },
        () => undefined,
        controller.signal
      )
    ).rejects.toBeDefined();
    expect(calls).toBe(1);
  });
});
