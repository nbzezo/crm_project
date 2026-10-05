import { HttpError } from './validate.ts';

/*
 * Phan trang theo CON TRO cho danh sach lon (1.21.0).
 *
 * Khong dung OFFSET: trang thu 50 voi OFFSET van phai di qua 10.000 dong dau, va mot
 * ban ghi moi chen vao giua hai lan cuon se lam lap hoac sot dong. Con tro la cap
 * (khoa sap xep, id) cua dong cuoi trang truoc; trang sau lay cac dong dung SAU no
 * theo dung thu tu `khoa DESC, id DESC`.
 */

export const DEFAULT_PAGE_SIZE = 200;
const MAX_PAGE_SIZE = 500;

export interface PageCursor {
  key: string;
  id: number;
}

export interface Page<T> {
  items: T[];
  /** Null khi da het. Client gui lai nguyen chuoi nay o `cursor` de lay trang ke. */
  next_cursor: string | null;
}

export function pageLimit(raw: unknown): number {
  const value = Number(raw ?? DEFAULT_PAGE_SIZE);
  if (!Number.isInteger(value) || value < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(value, MAX_PAGE_SIZE);
}

export function encodeCursor(cursor: PageCursor): string {
  return Buffer.from(JSON.stringify([cursor.key, cursor.id])).toString('base64url');
}

export function decodeCursor(raw: unknown): PageCursor | null {
  if (raw == null || raw === '') return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(raw), 'base64url').toString('utf8')) as unknown;
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === 'string' &&
      Number.isInteger(parsed[1])
    ) {
      return { key: parsed[0], id: parsed[1] as number };
    }
  } catch {
    /* roi xuong loi ben duoi */
  }
  throw new HttpError(400, 'Con tro phan trang khong hop le');
}

/**
 * Dieu kien "dung sau con tro" cho thu tu `keyExpr DESC, idExpr DESC`.
 * `keyExpr` phai la chinh bieu thuc dung trong ORDER BY va khong bao gio NULL.
 */
export function afterCursor(
  cursor: PageCursor | null,
  keyExpr: string,
  idExpr: string
): { sql: string; params: unknown[] } {
  if (!cursor) return { sql: '', params: [] };
  return {
    sql: `(${keyExpr} < ? OR (${keyExpr} = ? AND ${idExpr} < ?))`,
    params: [cursor.key, cursor.key, cursor.id],
  };
}

/**
 * Cat trang tu cac dong da lay du `limit + 1` dong: dong thua chi de biet con trang sau.
 */
export function toPage<T extends Record<string, unknown>>(
  rows: T[],
  limit: number,
  keyOf: (row: T) => string,
  idOf: (row: T) => number
): Page<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return {
    items,
    next_cursor: hasMore && last ? encodeCursor({ key: keyOf(last), id: idOf(last) }) : null,
  };
}
