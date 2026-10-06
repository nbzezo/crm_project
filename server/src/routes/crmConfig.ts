/**
 * Cau hinh nghiep vu CRM (v62): danh muc dong.
 *
 * GET / la diem doc DUY NHAT cua client: mot request luc mo ung dung, ai dang nhap
 * cung doc duoc (moi o chon deu can no). Ghi thi can quyen `settings.app`.
 */
import { Router } from 'express';
import { z } from 'zod';
import { isPicklistKey, type PicklistKey } from '@workflow/contracts';
import { db } from '../db/connection.ts';
import { requirePermission } from '../middleware/currentUser.ts';
import { auditFromRequest, recordChanges } from '../lib/changeLog.ts';
import { HttpError, intParam, parseBody } from '../lib/validate.ts';
import {
  createPicklistItem,
  deletePicklistItem,
  getAllPicklists,
  mergePicklistItem,
  reorderPicklist,
  updatePicklistItem,
  usageCounts,
} from '../lib/picklists.ts';

const router = Router();
const canEdit = requirePermission('settings.app', 'update');

function listParam(value: string | undefined): PicklistKey {
  if (!value || !isPicklistKey(value)) throw new HttpError(404, 'Không có danh mục này');
  return value;
}

const color = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Màu phải có dạng #RRGGBB')
  .nullable()
  .optional();
const createSchema = z.object({ label: z.string().trim().min(1).max(100), color });
const patchSchema = z.object({
  label: z.string().trim().min(1).max(100).optional(),
  color,
  is_active: z.boolean().optional(),
});
const orderSchema = z.object({ ids: z.array(z.number().int().positive()).min(1) });
const mergeSchema = z.object({ into_id: z.number().int().positive() });

router.get('/', (_req, res) => {
  res.json({ picklists: getAllPicklists(db) });
});

router.get('/picklists/:list/usage', canEdit, (req, res) => {
  res.json(usageCounts(db, listParam(String(req.params.list))));
});

router.post('/picklists/:list', canEdit, (req, res) => {
  const body = parseBody(createSchema, req);
  res.status(201).json(createPicklistItem(db, listParam(String(req.params.list)), body));
});

router.put('/picklists/:list/order', canEdit, (req, res) => {
  const list = listParam(String(req.params.list));
  reorderPicklist(db, list, parseBody(orderSchema, req).ids);
  res.json(getAllPicklists(db)[list]);
});

router.patch('/picklists/:list/:id', canEdit, (req, res) => {
  const body = parseBody(patchSchema, req);
  res.json(
    updatePicklistItem(
      db,
      listParam(String(req.params.list)),
      intParam(String(req.params.id)),
      body
    )
  );
});

router.post('/picklists/:list/:id/merge', canEdit, (req, res) => {
  const list = listParam(String(req.params.list));
  const { into_id } = parseBody(mergeSchema, req);
  const audit = { ...auditFromRequest(req), note: 'Gộp mục danh mục' };
  const result = mergePicklistItem(
    db,
    list,
    intParam(String(req.params.id)),
    into_id,
    (id, field, a, b) => recordChanges(db, 'deal', id, { [field]: a }, { [field]: b }, audit)
  );
  res.json(result);
});

router.delete('/picklists/:list/:id', canEdit, (req, res) => {
  deletePicklistItem(db, listParam(String(req.params.list)), intParam(String(req.params.id)));
  res.status(204).end();
});

export default router;
