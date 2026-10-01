import { Router, type Request } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.ts';
import crypto from 'node:crypto';
import { HttpError, intParam, parseBody } from '../lib/validate.ts';
import { accessOf, requirePermission } from '../middleware/currentUser.ts';
import type { Access } from '../services/auth/access.ts';
import { setContactOrgUnit, setUserPositions } from '../services/auth/orgService.ts';
import { positionAssignmentsSchema } from './positions.ts';
import {
  createUser,
  deleteUserSessions,
  findUserById,
  getPublicUser,
  listUsers,
  setPasswordByAdmin,
  uniqueUsername,
  updateUser,
} from '../services/auth/users.ts';
import { issueToken } from '../services/auth/tokens.ts';
import { appBaseUrl, sendMail } from '../services/email/emailService.ts';
import { inviteEmail } from '../services/email/templates.ts';

const router = Router();

/*
 * Quan tri tai khoan dang nhap.
 *
 * Duong mac dinh KHONG co mat khau: nguoi quan tri tao tai khoan roi he thong gui
 * mot lien ket kich hoat, va khong ai doc duoc mat khau cua ai. Tai khoan vua tao
 * ton tai nhung chua dang nhap duoc cho toi khi chu nhan mo lien ket do.
 *
 * Ngoai le duy nhat la POST /:id/password — quan tri he thong dat mat khau tam,
 * nguoi do bi bat doi lai o lan dang nhap dau (xem middleware/currentUser.ts).
 */

/* v39 thay rao chan tam thoi cua dot truoc (chi tai khoan id nho nhat) bang
   quyen that. `read` de xem danh sach, `update` cho moi thao tac ghi — tao,
   khoa, moi lai, dang xuat ho deu la thao tac tren mot tai khoan khac. */
router.use((req, res, next) => {
  const action = req.method === 'GET' ? 'read' : 'update';
  requirePermission('admin.users', action)(req, res, next);
});

/**
 * Gui thu moi va tra ve lien ket khi khong gui duoc thu, de con kich hoat tay.
 *
 * Loi SMTP KHONG duoc nem ra ngoai: luc goi tu POST /, tai khoan da duoc ghi
 * xong. Nem o day thi nguoi quan tri thay bao loi, bam tao lai va nhan 409 "email
 * da dung" cho mot tai khoan ho tuong chua ton tai.
 */
async function sendInvite(
  req: Request,
  userId: number
): Promise<{ invite_link: string | null; invite_error: string | null }> {
  const user = findUserById(userId);
  if (!user?.email) {
    throw new HttpError(400, 'Tài khoản chưa có email nên không gửi được thư mời');
  }

  const { token } = issueToken(userId, 'invite');
  const host = req.get('host');
  const link = `${appBaseUrl(db, host ? `${req.protocol}://${host}` : undefined)}/reset-password?token=${token}`;
  let delivered = false;
  let inviteError: string | null = null;
  try {
    ({ delivered } = await sendMail(db, inviteEmail(user.email, user.full_name ?? '', link)));
  } catch (error) {
    inviteError = error instanceof Error ? error.message : String(error);
  }

  /* Gui duoc thi KHONG tra lien ket ve client: no la mot chia khoa vao tai khoan
     nguoi khac, va da den dung hop thu roi. Chi khi khong gui duoc (chua cau hinh
     SMTP hoac SMTP loi) moi dua ra — luc do khong con duong nao khac de kich hoat. */
  return { invite_link: delivered ? null : link, invite_error: inviteError };
}

interface LinkedContact {
  org_unit_id: number | null;
  org_kind: string;
}

function linkedContact(contactId: number | null): LinkedContact | null {
  if (contactId == null) return null;
  const row = db
    .prepare(
      `SELECT ct.org_unit_id, c.org_kind
         FROM contacts ct JOIN customers c ON c.id = ct.customer_id
        WHERE ct.id = ?`
    )
    .get(contactId) as LinkedContact | undefined;
  if (!row) throw new HttpError(404, 'Không tìm thấy người trong sổ danh bạ');
  return row;
}

/**
 * Doi nguoi trong danh ba ma mot tai khoan gan vao.
 *
 * Cho ngoi (`org_unit_id`) nam tren contact, khong tren tai khoan. Doi contact
 * vi vay la doi luon don vi — va pham vi `unit`/`subtree` — cua nguoi do. Khong
 * co rao nay thi nguoi chi co `admin.users` lam duoc dung viec ma `admin.org`
 * danh rieng, ke ca voi chinh tai khoan cua minh. Go contact (`null`) cung vay:
 * nguoi do roi khoi don vi dang ngoi.
 *
 * Chi nhan su cong ty minh (`org_kind = 'own'`) moi gan duoc: nguoi lien he ben
 * khach hang khong dang nhap vao he thong cua ta. Truoc day chi client loc.
 */
function assertContactChange(
  access: Access,
  nextId: number | null,
  currentId: number | null
): void {
  if (nextId === currentId) return;
  const next = linkedContact(nextId);
  if (next && next.org_kind !== 'own') {
    throw new HttpError(400, 'Chỉ gắn được tài khoản với nhân sự của công ty mình');
  }
  const current = linkedContact(currentId);
  const movesUnit = next?.org_unit_id != null || current?.org_unit_id != null;
  if (movesUnit && !access.can('admin.org', 'update')) {
    throw new HttpError(
      403,
      'Đổi người trong sổ danh bạ sẽ đổi đơn vị của tài khoản — bạn cần quyền xếp người vào đơn vị'
    );
  }
}

/**
 * Quan tri he thong = giu CA quyen quan tri nguoi dung lan phan quyen o muc `all`
 * — cung dinh nghia ma assertAdminRemains() dung.
 *
 * Dat mat khau thay la dang nhap duoc duoi ten nguoi do. Chi `admin.users` thi
 * khong du: nguoi do se dat mat khau cho mot quan tri he thong roi vao bang tai
 * khoan ay, tuc la tu nang quyen vuot `admin.positions`.
 */
function isSystemAdmin(access: Access): boolean {
  return (
    access.scopeOf('admin.users', 'update') === 'all' &&
    access.scopeOf('admin.positions', 'update') === 'all'
  );
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
    const access = accessOf(req);
    const username = body.username?.trim() || uniqueUsername(body.email.split('@')[0]);
    assertContactChange(access, body.contact_id ?? null, null);

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
    const warnings = [
      ...(body.positions?.length ? [] : ['no_position']),
      ...(invite.invite_error ? ['invite_failed'] : []),
    ];
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
  const current = findUserById(id);
  if (!current) throw new HttpError(404, 'Không tìm thấy tài khoản');
  if (body.contact_id !== undefined) {
    assertContactChange(accessOf(req), body.contact_id, current.contact_id);
  }

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

const passwordSchema = z.object({
  /* Bo trong = he thong tu sinh va tra ve DUNG MOT LAN trong phan hoi. */
  password: z.string().min(8).max(200).optional(),
  require_change: z.boolean().optional(),
});

/** Mat khau tam du manh, khong co ky tu de nham (0/O, 1/l/I). */
function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  return Array.from(crypto.randomBytes(12), (byte) => alphabet[byte % alphabet.length]).join('');
}

/**
 * Quan tri he thong dat mat khau moi cho mot nguoi.
 *
 * Ngoai le co chu dich voi nguyen tac "khong ai dat mat khau ho nguoi khac" o dau
 * tep: dung khi khong co email/SMTP, hoac nguoi do can vao ngay. Mac dinh bat
 * doi lai o lan dang nhap dau, de mat khau quan tri biet chi song mot lan.
 *
 * Khong dung cho chinh minh: doi mat khau cua minh phai qua /api/auth/password,
 * noi kiem mat khau hien tai — neu khong, mot phien bi bo quen tren may la du de
 * chiem tai khoan quan tri.
 */
router.post('/:id/password', async (req, res, next) => {
  try {
    const id = intParam(req.params.id);
    if (!isSystemAdmin(accessOf(req))) {
      throw new HttpError(403, 'Chỉ quản trị hệ thống mới đặt được mật khẩu cho người khác');
    }
    if (id === req.currentUser?.userId) {
      throw new HttpError(400, 'Đổi mật khẩu của chính bạn ở mục Tài khoản');
    }
    if (!findUserById(id)) throw new HttpError(404, 'Không tìm thấy tài khoản');

    const body = parseBody(passwordSchema, req);
    const password = body.password ?? generatePassword();
    await setPasswordByAdmin(id, password, body.require_change ?? true);
    /* Chi tra lai mat khau khi he thong tu sinh — mat khau quan tri tu go thi ho
       da biet, khong can di qua mang them mot lan. */
    res.json({ ...getPublicUser(id), generated_password: body.password ? null : password });
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
