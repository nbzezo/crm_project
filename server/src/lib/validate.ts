import type { Request } from 'express';
import type { ZodType } from 'zod';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function parseBody<T>(schema: ZodType<T>, req: Request): T {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new HttpError(400, `Du lieu khong hop le: ${first.path.join('.')} — ${first.message}`);
  }
  return result.data;
}

export function intParam(value: string | undefined, name = 'id'): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `${name} khong hop le`);
  return n;
}

/** Tra ve ban ghi hoac nem 404. */
export function required<T>(row: T | undefined, message = 'Khong tim thay ban ghi'): T {
  if (row === undefined || row === null) throw new HttpError(404, message);
  return row;
}
