import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.ts';
import { accessOf } from '../middleware/currentUser.ts';
import { HttpError } from '../lib/validate.ts';
import { buildFocus, canSeeTeam, focusScopeOf } from '../services/focusService.ts';

/**
 * Man hinh "Trong tam" o tab Tong quan — moi thu can lam / can chu y trong mot ky.
 * Logic o services/focusService.ts (dung chung voi AI va ban tin Telegram).
 */
const router = Router();

const querySchema = z.object({
  from: z.string(),
  to: z.string(),
  mode: z.enum(['me', 'team']).default('me'),
});

router.get('/', (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, 'Thiếu khoảng ngày cần xem');
  const query = parsed.data;
  const access = accessOf(req);
  const canTeam = canSeeTeam(access);
  /* Khong nhin duoc ai khac thi "ca nhom" chinh la minh — tra ve che do ca nhan
     thay vi bao loi, de lua chon cu luu tren may khong lam hong man hinh. */
  const mode = query.mode === 'team' && canTeam ? 'team' : 'me';
  const data = buildFocus(db, {
    from: query.from,
    to: query.to,
    scope: focusScopeOf(access, mode),
  });
  res.json({ ...data, can_team: canTeam });
});

export default router;
