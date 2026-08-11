import type { Request } from 'express';
import type { ZodType } from 'zod';

export class HttpError extends Error {
  status: number;
  /**
   * Du lieu kem theo loi, duoc gop thang vao body tra ve.
   * Dung cho truong hop giao dien can biet CHINH XAC viec phai lam:
   * cong giai doan tra ve yeu to nao dang thieu, rang buoc rubric tra ve
   * diem toi da va viec can lam de nang len.
   */
  details?: Record<string, unknown>;
  constructor(status: number, message: string, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.details = details;
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
