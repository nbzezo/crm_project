import 'express-session';
import type { CurrentUser } from '../middleware/currentUser.ts';

declare module 'express-session' {
  interface SessionData {
    userId?: number;
    username?: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      /*
       * Gan boi middleware/currentUser.ts, luon co mat o moi route duoi /api.
       * Van khai bao tuy chon vi middleware nam sau mot so route cong khai
       * (/api/health, /api/auth/*) va vi chinh Express khong bao dam duoc thu tu.
       */
      currentUser?: CurrentUser;
    }
  }
}
