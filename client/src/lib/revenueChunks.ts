import type { RevenueLine, RevenueLinesResponse } from '../types';

export interface RevenueLineChunk {
  year: number;
  lines: RevenueLine[];
  /** Chi co o khuc dau. */
  total: number | null;
  next_offset: number | null;
}

/** Khuc dau nho de bang hien ngay; cac khuc sau lon de it lan hoi. */
export const FIRST_REVENUE_CHUNK = 300;
export const NEXT_REVENUE_CHUNK = 2000;

/**
 * Tai bang dong doanh thu theo tung khuc (1.41.0), giu dung thu tu may chu (ten khach,
 * ten dich vu, id) va bo trung theo id — dong co the dich khuc neu ai do them/xoa dong
 * dung luc dang tai. Moi khuc chua cuoi goi `onProgress` voi ban tam co `progress`.
 */
export async function loadRevenueLinesInChunks(
  fetchChunk: (limit: number, offset: number) => Promise<RevenueLineChunk>,
  onProgress: (partial: RevenueLinesResponse) => void,
  signal?: AbortSignal
): Promise<RevenueLinesResponse> {
  const first = await fetchChunk(FIRST_REVENUE_CHUNK, 0);
  const seen = new Set<number>();
  const lines: RevenueLine[] = [];
  const add = (items: RevenueLine[]) => {
    for (const line of items) {
      if (seen.has(line.id)) continue;
      seen.add(line.id);
      lines.push(line);
    }
  };
  add(first.lines);
  const total = first.total ?? first.lines.length;
  let next = first.next_offset;
  while (next !== null) {
    if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    onProgress({ year: first.year, lines: [...lines], progress: { loaded: next, total } });
    const chunk = await fetchChunk(NEXT_REVENUE_CHUNK, next);
    add(chunk.lines);
    next = chunk.next_offset;
  }
  return { year: first.year, lines };
}
