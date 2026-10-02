import crypto from 'node:crypto';
import { Router, type Request, type RequestHandler } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { db } from '../db/connection.ts';
import { HttpError, intParam, parseBody, required } from '../lib/validate.ts';
import { crmBaseUrl } from '../lib/requestBaseUrl.ts';
import { assertInScope, scopeFragment } from '../lib/scope.ts';
import { accessOf } from '../middleware/currentUser.ts';
import { buildGoogleAuthUrl, exchangeGoogleCode } from '../services/email/googleMail.ts';
import { parseContactFile } from '../services/contacts/contactFile.ts';
import {
  CONTACTS_READONLY_SCOPE,
  CONTACTS_SCOPES,
  contactsClientOf,
  disconnectGoogleContacts,
  googleContactsStatus,
  saveContactsConnection,
  setContactsAutoSync,
  syncGoogleContacts,
} from '../services/contacts/googleContacts.ts';
import {
  buildCrmIndex,
  getOwned,
  importParsed,
  listPersonal,
  matchesFor,
  personalCounts,
  type PersonalContact,
} from '../services/contacts/personalContacts.ts';
import { searchTextOf } from '../services/contacts/contactKeys.ts';

const router = Router();

/*
 * Danh ba CA NHAN cua nhan vien (v50): nap tu file .vcf/.csv hoac dong bo tu Gmail,
 * roi chon dong nao dua vao CRM.
 *
 * KHONG gan requireResource: ai dang nhap cung co danh ba cua rieng minh. Rao
 * rieng tu nam o MOI truy van (`user_id = nguoi dang nhap`), khong o quyen — quan
 * ly cap tren khong doc duoc danh ba dien thoai cua nhan vien. Chi buoc "dua vao
 * CRM" moi can quyen `contacts:create` va khach hang nam trong pham vi nhin.
 */

function userIdOf(req: Request): number {
  const id = accessOf(req).userId;
  if (!id) throw new HttpError(400, 'Cần đăng nhập để dùng danh bạ cá nhân');
  return id;
}

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
});

/* ---------- Doc ---------- */

router.get('/', (req, res) => {
  const userId = userIdOf(req);
  const query = z
    .object({
      q: z.string().optional(),
      filter: z.enum(['all', 'unlinked', 'linked']).optional(),
      source: z.enum(['google', 'file']).optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    })
    .parse(req.query);

  const { items, total } = listPersonal(db, userId, query);

  /* Doi chieu voi danh ba CRM trong dung pham vi nguoi nay duoc nhin. */
  const canRead = accessOf(req).can('contacts', 'read');
  const index = canRead
    ? buildCrmIndex(db, scopeFragment(req, 'customers', 'read', 'c.owner_contact_id'))
    : new Map();
  res.json({
    total,
    counts: personalCounts(db, userId),
    items: items.map((item) => ({ ...item, matches: matchesFor(db, index, item.id) })),
  });
});

router.get('/status', (req, res) => {
  const userId = userIdOf(req);
  res.json({ counts: personalCounts(db, userId), google: googleContactsStatus(db, userId) });
});

/* ---------- Nap tu file ---------- */

/** Loi cua multer (qua dung luong...) thanh 422 co loi nhan doc duoc, khong phai 500. */
const receiveFile: RequestHandler = (req, res, next) => {
  importUpload.single('file')(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      next(new HttpError(422, 'File quá lớn (tối đa 20 MB) hoặc không hợp lệ'));
      return;
    }
    next(error);
  });
};

router.post('/import', receiveFile, (req, res) => {
  const userId = userIdOf(req);
  if (!req.file) throw new HttpError(400, 'Chưa chọn file danh bạ');
  const parsed = parseContactFile(req.file.originalname, req.file.buffer);
  if (parsed.length === 0) throw new HttpError(422, 'Không đọc được liên hệ nào trong file này');
  res.json(importParsed(db, userId, parsed, 'file'));
});

/* ---------- Sua / xoa ---------- */

const editSchema = z.object({
  full_name: z.string().trim().min(1).optional(),
  org_name: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  notes: z.string().optional(),
});

router.patch('/:id', (req, res) => {
  const userId = userIdOf(req);
  const id = intParam(req.params.id);
  const current = required(getOwned(db, userId, id), 'Khong tim thay lien he');
  const body = parseBody(editSchema, req);
  const merged = { ...current, ...body };
  db.prepare(
    `UPDATE personal_contacts
        SET full_name = ?, org_name = ?, title = ?, phone = ?, email = ?, notes = ?,
            search_text = ?, updated_at = datetime('now','localtime')
      WHERE id = ?`
  ).run(
    merged.full_name,
    merged.org_name ?? null,
    merged.title ?? null,
    merged.phone ?? null,
    merged.email ?? null,
    merged.notes ?? '',
    searchTextOf([merged.full_name, merged.org_name, merged.phone, merged.email]),
    id
  );
  res.json(getOwned(db, userId, id));
});

const idsSchema = z.object({ ids: z.array(z.number().int().positive()).min(1).max(2000) });

router.post('/delete', (req, res) => {
  const userId = userIdOf(req);
  const { ids } = parseBody(idsSchema, req);
  const remove = db.prepare(`DELETE FROM personal_contacts WHERE id = ? AND user_id = ?`);
  let deleted = 0;
  db.transaction(() => {
    for (const id of ids) deleted += remove.run(id, userId).changes;
  })();
  res.json({ deleted });
});

/* ---------- Dua vao CRM ---------- */

const promoteSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(500),
  customer_id: z.number().int().positive(),
  /** Mac dinh: bo qua lien he da co mat o CRM (trung dien thoai/email) thay vi tao ban sao. */
  allow_duplicates: z.boolean().optional(),
});

router.post('/promote', (req, res) => {
  const userId = userIdOf(req);
  const access = accessOf(req);
  if (!access.can('contacts', 'create')) {
    throw new HttpError(403, 'Bạn không có quyền thêm người liên hệ vào CRM');
  }
  const body = parseBody(promoteSchema, req);
  const customer = required(
    db.prepare(`SELECT id, owner_contact_id FROM customers WHERE id = ?`).get(body.customer_id),
    'Khong tim thay khach hang'
  ) as { id: number; owner_contact_id: number | null };
  assertInScope(req, 'customers', 'read', customer.owner_contact_id, 'Khong tim thay khach hang');

  const index = buildCrmIndex(db, scopeFragment(req, 'customers', 'read', 'c.owner_contact_id'));
  const insert = db.prepare(
    `INSERT INTO contacts (customer_id, full_name, title, phone, email, notes)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const link = db.prepare(`UPDATE personal_contacts SET linked_contact_id = ? WHERE id = ?`);

  const created: number[] = [];
  const skipped: { id: number; reason: 'linked' | 'duplicate' }[] = [];
  db.transaction(() => {
    for (const id of body.ids) {
      const personal = getOwned(db, userId, id);
      if (!personal) continue;
      if (personal.linked_contact_id) {
        skipped.push({ id, reason: 'linked' });
        continue;
      }
      if (!body.allow_duplicates && matchesFor(db, index, id).length > 0) {
        skipped.push({ id, reason: 'duplicate' });
        continue;
      }
      const info = insert.run(
        customer.id,
        personal.full_name,
        personal.title,
        personal.phone,
        personal.email,
        personal.notes
      );
      link.run(Number(info.lastInsertRowid), id);
      created.push(Number(info.lastInsertRowid));
    }
  })();
  res.status(201).json({ created: created.length, skipped });
});

const linkSchema = z.object({
  contact_id: z.number().int().positive(),
  /** Dien vao o con trong cua lien he CRM bang du lieu tu danh ba ca nhan. */
  fill_empty: z.boolean().optional(),
});

router.post('/:id/link', (req, res) => {
  const userId = userIdOf(req);
  const id = intParam(req.params.id);
  const personal = required(getOwned(db, userId, id), 'Khong tim thay lien he');
  const body = parseBody(linkSchema, req);

  const crm = required(
    db
      .prepare(
        `SELECT ct.id, ct.title, ct.phone, ct.email, c.owner_contact_id
           FROM contacts ct JOIN customers c ON c.id = ct.customer_id WHERE ct.id = ?`
      )
      .get(body.contact_id),
    'Khong tim thay nguoi lien he'
  ) as {
    id: number;
    title: string | null;
    phone: string | null;
    email: string | null;
    owner_contact_id: number | null;
  };
  assertInScope(req, 'contacts', 'read', crm.owner_contact_id, 'Khong tim thay nguoi lien he');

  db.transaction(() => {
    if (body.fill_empty) {
      assertInScope(
        req,
        'contacts',
        'update',
        crm.owner_contact_id,
        'Khong tim thay nguoi lien he'
      );
      db.prepare(`UPDATE contacts SET title = ?, phone = ?, email = ? WHERE id = ?`).run(
        crm.title || personal.title,
        crm.phone || personal.phone,
        crm.email || personal.email,
        crm.id
      );
    }
    db.prepare(`UPDATE personal_contacts SET linked_contact_id = ? WHERE id = ?`).run(crm.id, id);
  })();
  res.json(getOwned(db, userId, id) as PersonalContact);
});

router.post('/:id/unlink', (req, res) => {
  const userId = userIdOf(req);
  const id = intParam(req.params.id);
  required(getOwned(db, userId, id), 'Khong tim thay lien he');
  db.prepare(`UPDATE personal_contacts SET linked_contact_id = NULL WHERE id = ?`).run(id);
  res.json({ ok: true });
});

/* ---------- Ket noi Gmail ----------

   Cung khuon voi /api/drive-backup/oauth: hai GET la DIEU HUONG cua trinh duyet,
   nen loi tra ve bang redirect ve man danh ba chu khong phai JSON. */

function redirectUri(req: Request): string {
  return `${crmBaseUrl(db, req)}/api/my-contacts/google/callback`;
}

function backToContacts(req: Request, params: Record<string, string>): string {
  return `${crmBaseUrl(db, req)}/my-contacts?${new URLSearchParams(params)}`;
}

router.get('/google/redirect-uri', (req, res) => {
  res.json({ redirect_uri: redirectUri(req) });
});

router.get('/google/start', (req, res, next) => {
  userIdOf(req);
  const client = contactsClientOf(db);
  if (!client) {
    res.redirect(
      backToContacts(req, {
        google_error: 'Quản trị viên chưa khai báo Google Client ID/Secret (Cài đặt → Email).',
      })
    );
    return;
  }
  /* `state` gan voi phien, dung mot lan: chan ke tan cong dua `code` cua tai khoan
     Google KHAC vao callback — khi do danh ba cua ho se chay vao danh ba cua ban. */
  const state = crypto.randomBytes(24).toString('base64url');
  req.session.contactsOAuthState = state;
  req.session.save((error) => {
    if (error) {
      next(error);
      return;
    }
    res.redirect(
      buildGoogleAuthUrl({
        clientId: client.clientId,
        redirectUri: redirectUri(req),
        state,
        scopes: CONTACTS_SCOPES,
      })
    );
  });
});

router.get('/google/callback', async (req, res) => {
  const expected = req.session.contactsOAuthState;
  delete req.session.contactsOAuthState;
  const fail = (message: string) =>
    res.redirect(backToContacts(req, { google_error: message.slice(0, 300) }));

  const userId = accessOf(req).userId;
  const { code, state, error } = req.query;
  if (typeof error === 'string') {
    fail(error === 'access_denied' ? 'Bạn đã huỷ đăng nhập Google.' : `Google báo lỗi: ${error}`);
    return;
  }
  if (!userId || !expected || typeof state !== 'string' || state !== expected) {
    fail('Phiên đăng nhập Google không hợp lệ hoặc đã hết hạn — hãy bấm kết nối lại.');
    return;
  }
  const client = contactsClientOf(db);
  if (typeof code !== 'string' || !client) {
    fail('Thiếu mã xác nhận từ Google — hãy bấm kết nối lại.');
    return;
  }

  try {
    const connection = await exchangeGoogleCode(client, code, redirectUri(req), {
      scope: CONTACTS_READONLY_SCOPE,
      missingMessage:
        'Bạn chưa cho phép quyền xem danh bạ Google — hãy kết nối lại và giữ dấu tick đó.',
    });
    saveContactsConnection(db, userId, connection);
    /* Keo lan dau ngay trong luc con o man nay; loi o day khong lam hong ket noi. */
    syncGoogleContacts(db, userId).catch((caught) =>
      console.error('[google-contacts] Dong bo dau tien that bai:', caught)
    );
    res.redirect(backToContacts(req, { google: 'connected' }));
  } catch (caught) {
    fail(caught instanceof Error ? caught.message : String(caught));
  }
});

router.post('/google/sync', async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const result = await syncGoogleContacts(db, userId);
    res.json({ ...result, status: googleContactsStatus(db, userId) });
  } catch (error) {
    next(error);
  }
});

router.put('/google/settings', (req, res) => {
  const userId = userIdOf(req);
  const body = parseBody(z.object({ auto_sync: z.boolean() }), req);
  if (!googleContactsStatus(db, userId).connected) {
    throw new HttpError(400, 'Chưa kết nối Gmail');
  }
  setContactsAutoSync(db, userId, body.auto_sync);
  res.json(googleContactsStatus(db, userId));
});

router.post('/google/disconnect', async (req, res, next) => {
  try {
    const userId = userIdOf(req);
    const body = parseBody(z.object({ remove_contacts: z.boolean().optional() }), req);
    await disconnectGoogleContacts(db, userId, Boolean(body.remove_contacts));
    res.json({ counts: personalCounts(db, userId), google: googleContactsStatus(db, userId) });
  } catch (error) {
    next(error);
  }
});

export default router;
