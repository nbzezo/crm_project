/*
 * Gioi han toc do trong bo nho, cho cac route CONG KHAI (khong dang nhap).
 *
 * Trong bo nho la du: CRM chay mot tien trinh duy nhat (SQLite), nen khong co
 * "nhieu may chu" de dong bo. Khoi dong lai thi bo dem ve 0 — chap nhan duoc.
 */
export interface Limiter {
  /** Tra ve true neu con luot va dem them mot luot. */
  hit(key: string): boolean;
  /** Ghi nhan mot lan that bai (vi du sai mat khau). */
  fail(key: string): void;
  blocked(key: string): boolean;
  reset(key: string): void;
}

export function createLimiter(max: number, windowMs: number): Limiter {
  const buckets = new Map<string, number[]>();
  function recent(key: string, now: number): number[] {
    const list = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
    if (list.length === 0) buckets.delete(key);
    else buckets.set(key, list);
    return list;
  }
  return {
    hit(key) {
      const now = Date.now();
      const list = recent(key, now);
      if (list.length >= max) return false;
      list.push(now);
      buckets.set(key, list);
      return true;
    },
    fail(key) {
      const now = Date.now();
      const list = recent(key, now);
      list.push(now);
      buckets.set(key, list);
    },
    blocked(key) {
      return recent(key, Date.now()).length >= max;
    },
    reset(key) {
      buckets.delete(key);
    },
  };
}
