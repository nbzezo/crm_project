import type { NextFunction, Request, Response } from 'express';

/*
 * Chan moi request chua dang nhap. Mount SAU /api/health va /api/auth trong
 * app.ts — moi route con lai nam sau middleware nay.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.session?.userId) {
    next();
    return;
  }
  res.status(401).json({ error: 'Chua dang nhap' });
}
