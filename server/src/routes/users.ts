import { Router, type Request } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.ts';
import { HttpError, intParam, parseBody } from '../lib/validate.ts';
import { accessOf, requirePermission } from '../middleware/currentUser.ts';
import { setContactOrgUnit, setUserPositions } from '../services/auth/orgService.ts';
import { positionAssignmentsSchema } from './positions.ts';
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

/* v39 thay rao chan tam thoi cua dot truoc (chi tai khoan id nho nhat) bang
   quyen that. `read` de xem danh sach, `update` cho moi thao tac ghi — tao,
   khoa, moi lai, dang xuat ho deu la thao tac tren mot tai khoan khac. */
router.use((req, res, next) => {
  const action = req.method === 'GET' ? 'read' : 'update';
  requirePermission('admin.users', action)(req, res, next);
});

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
  /* Vi tri ngay luc tao. Khong co vi tri thi tai khoan dang nhap vao chi thay 403
     — ma tran quyen mac dinh la CAM (migrate-v39.sql). */
  positions: positionAssignmentsSchema.optional(),
  /* Don vi cua contact `contact_id`. Cho ngoi nam tren contact, khong tren tai
     khoan, nen khong co contact thi khong co cho de ghi. */
  org_unit_id: z.number().int().positive().nullable().optional(),
});

router.post('/', async (req, res, next) => {
  try {
    const body = parseBody(createSchema, req);
    const username = body.username?.trim() || body.email.split('@')[0];
    const access = accessOf(req);

    /* Quan ly tai khoan (`admin.users`) KHONG keo theo quyen phan quyen: neu
       khong, ai tao duoc tai khoan cung tao duoc mot tai khoan quan tri cho minh. */
    if (body.positions?.length && !access.can('admin.positions', 'update')) {
      throw new HttpError(403, 'Bạn không có quyền gán vị trí cho người dùng');
    }
    if (body.org_unit_id != null) {
      if (!access.can('admin.org', 'update')) {
        throw new HttpError(403, 'Bạn không có quyền xếp người vào đơn vị');
      }
      if (body.contact_id == null) {
        throw new HttpError(400, 'Cần gắn với một người trong sổ danh bạ để xếp đơn vị');
      }
    }

    const id = await createUser({
      username,
      email: body.email,
      fullName: body.full_name,
      contactId: body.contact_id ?? null,
      onCreated: (userId) => {
        if (body.positions?.length) setUserPositions(userId, body.positions);
        if (body.org_unit_id != null && body.contact_id != null) {
          setContactOrgUnit(body.contact_id, body.org_unit_id);
        }
      },
    });
    const invite = await sendInvite(req, id);
    /* Canh bao, khong chan: co noi tao tai khoan truoc, phan quyen sau la quy
       trinh binh thuong. Client nhac de nguoi quan tri khong quen. */
    const warnings = body.positions?.length ? [] : ['no_position'];
    res.status(201).json({ ...getPublicUser(id), ...invite, warnings });
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
  if (body.is_active === false && id === req.currentUser?.userId) {
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
