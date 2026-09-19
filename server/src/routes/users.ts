import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.ts';
import { HttpError, intParam, parseBody } from '../lib/validate.ts';
import {
  createUser,
  deleteUserSessions,
  findUserById,
  getPublicUser,
  listUsers,
  updateUser,
} from '../services/auth/users.ts';
import { issueToken } from '../services/auth/tokens.ts';
import { appBaseUrl, sendMail } from '../services/email/emailService.ts';
import { inviteEmail } from '../services/email/templates.ts';

const router = Router();

/*
 * Quan tri tai khoan dang nhap.
 *
 * KHONG co mat khau o day. Nguoi quan tri tao tai khoan roi he thong gui mot
 * lien ket kich hoat — khong ai dat mat khau ho nguoi khac, va khong ai doc duoc
 * mat khau cua ai. Tai khoan vua tao ton tai nhung chua dang nhap duoc cho toi
 * khi chu nhan mo lien ket do.
 */

/* ---------- Rao chan tam thoi ----------

   Dot nay chua co he phan quyen (no la viec cua buoc ke tiep: cay don vi + vi
   tri + ma tran quyen). Neu de ngo, bat ky ai dang nhap duoc cung tu tao them
   tai khoan — tuc la moi nhan vien deu thanh quan tri.

   Cho toi khi requirePermission('admin.users') thay the, chi tai khoan DAU TIEN
   (id nho nhat, la tai khoan bootstrap tu bien moi truong) duoc dung nhung
   endpoint nay. Tho nhung dung huong: mac dinh la cam. */
function requireBootstrapAdmin(req: Request, _res: Response, next: NextFunction): void {
  const userId = req.session?.userId;
  const first = db.prepare('SELECT MIN(id) AS id FROM users').get() as { id: number | null };
  if (!userId || first.id == null || userId !== first.id) {
    next(new HttpError(403, 'Chỉ tài khoản quản trị mới quản lý được người dùng'));
    return;
  }
  next();
}

router.use(requireBootstrapAdmin);

/** Gui thu moi va tra ve lien ket khi chua cau hinh SMTP, de con kich hoat tay duoc. */
async function sendInvite(req: Request, userId: number): Promise<{ invite_link: string | null }> {
  const user = findUserById(userId);
  if (!user?.email) {
    throw new HttpError(400, 'Tài khoản chưa có email nên không gửi được thư mời');
  }

  const { token } = issueToken(userId, 'invite');
  const host = req.get('host');
  const link = `${appBaseUrl(db, host ? `${req.protocol}://${host}` : undefined)}/reset-password?token=${token}`;
  const { delivered } = await sendMail(db, inviteEmail(user.email, user.full_name ?? '', link));

  /* Gui duoc thi KHONG tra lien ket ve client: no la mot chia khoa vao tai khoan
     nguoi khac, va da den dung hop thu roi. Chi khi chua cau hinh SMTP moi dua
     ra — luc do khong con duong nao khac de kich hoat. */
  return { invite_link: delivered ? null : link };
}

router.get('/', (_req, res) => {
  res.json(listUsers());
});

const createSchema = z.object({
  email: z.string().email().max(200),
  full_name: z.string().min(1).max(200),
  /* `username` la di san tu v35, van bat buoc duy nhat. Khong khai bao thi suy
     tu phan truoc dau @ cua email. */
  username: z.string().min(1).max(120).optional(),
  contact_id: z.number().int().positive().nullable().optional(),
});

router.post('/', async (req, res, next) => {
  try {
    const body = parseBody(createSchema, req);
    const username = body.username?.trim() || body.email.split('@')[0];

    const id = await createUser({
      username,
      email: body.email,
      fullName: body.full_name,
      contactId: body.contact_id ?? null,
    });
    const invite = await sendInvite(req, id);
    res.status(201).json({ ...getPublicUser(id), ...invite });
  } catch (err) {
    next(err);
  }
});

const patchSchema = z.object({
  email: z.string().email().max(200).optional(),
  full_name: z.string().min(1).max(200).optional(),
  contact_id: z.number().int().positive().nullable().optional(),
  is_active: z.boolean().optional(),
});

router.patch('/:id', (req, res) => {
  const id = intParam(req.params.id);
  const body = parseBody(patchSchema, req);

  /* Tu khoa chinh minh la mot cua khong mo lai duoc: khoa xong la mat phien, ma
     mo khoa thi chi tai khoan nay lam duoc. */
  if (body.is_active === false && id === req.session?.userId) {
    throw new HttpError(400, 'Không thể tự khoá tài khoản đang đăng nhập');
  }

  updateUser(id, {
    email: body.email,
    fullName: body.full_name,
    contactId: body.contact_id,
    isActive: body.is_active,
  });
  res.json(getPublicUser(id));
});

router.post('/:id/invite', async (req, res, next) => {
  try {
    const id = intParam(req.params.id);
    if (!findUserById(id)) throw new HttpError(404, 'Không tìm thấy tài khoản');
    res.json(await sendInvite(req, id));
  } catch (err) {
    next(err);
  }
});

/** Dang xuat mot nguoi khoi moi thiet bi ma khong khoa tai khoan ho. */
router.post('/:id/sign-out', (req, res) => {
  const id = intParam(req.params.id);
  if (!findUserById(id)) throw new HttpError(404, 'Không tìm thấy tài khoản');
  deleteUserSessions(id);
  res.status(204).end();
});

export default router;
