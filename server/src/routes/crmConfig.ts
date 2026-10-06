/**
 * Cau hinh nghiep vu CRM: danh muc dong (v62) va pipeline co hoi (v64, sua tu 1.26.0).
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
import {
  archiveStage,
  createStage,
  deleteStage,
  getPipelines,
  reorderStages,
  restoreStage,
  stageDealCounts,
  updateStage,
} from '../lib/pipeline.ts';

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
  res.json({ picklists: getAllPicklists(db), pipelines: getPipelines(db) });
});

/* ---------- Pipeline (1.26.0) ---------- */

const stageFields = {
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Màu phải có dạng #RRGGBB')
    .nullable()
    .optional(),
  probability: z.number().int().min(0).max(100).optional(),
  gate_bant_min: z.number().int().min(0).max(12).nullable().optional(),
  require_economic_buyer: z.boolean().optional(),
  track_poc: z.boolean().optional(),
  max_days_in_stage: z.number().int().min(1).max(3650).nullable().optional(),
};
const stageCreateSchema = z.object({
  label: z.string().trim().min(1).max(60),
  after_stage_id: z.number().int().positive().nullable().optional(),
  ...stageFields,
});
const stagePatchSchema = z.object({
  label: z.string().trim().min(1).max(60).optional(),
  ...stageFields,
});
const archiveSchema = z.object({
  move_to_stage_id: z.number().int().positive().nullable().optional(),
});

router.get('/pipelines/stage-counts', canEdit, (_req, res) => {
  res.json(stageDealCounts(db));
});

router.post('/pipelines/:pid/stages', canEdit, (req, res) => {
  const body = parseBody(stageCreateSchema, req);
  res.status(201).json(createStage(db, intParam(String(req.params.pid)), body));
});

router.put('/pipelines/:pid/stages/order', canEdit, (req, res) => {
  const pid = intParam(String(req.params.pid));
  reorderStages(db, pid, parseBody(orderSchema, req).ids);
  res.json(getPipelines(db).find((pipeline) => pipeline.id === pid));
});

router.patch('/pipelines/:pid/stages/:sid', canEdit, (req, res) => {
  const body = parseBody(stagePatchSchema, req);
  res.json(
    updateStage(db, intParam(String(req.params.pid)), intParam(String(req.params.sid)), body)
  );
});

router.post('/pipelines/:pid/stages/:sid/archive', canEdit, (req, res) => {
  const { move_to_stage_id } = parseBody(archiveSchema, req);
  const audit = auditFromRequest(req);
  const pid = intParam(String(req.params.pid));
  const sid = intParam(String(req.params.sid));
  const label = getPipelines(db)
    .find((pipeline) => pipeline.id === pid)
    ?.stages.find((stage) => stage.id === sid)?.label;
  const note = `Cấu hình pipeline: ẩn giai đoạn "${label ?? ''}"`;
  res.json(
    archiveStage(db, pid, sid, move_to_stage_id ?? null, (dealId, from, to) =>
      recordChanges(db, 'deal', dealId, { stage: from }, { stage: to }, { ...audit, note })
    )
  );
});

router.post('/pipelines/:pid/stages/:sid/restore', canEdit, (req, res) => {
  res.json(restoreStage(db, intParam(String(req.params.pid)), intParam(String(req.params.sid))));
});

router.delete('/pipelines/:pid/stages/:sid', canEdit, (req, res) => {
  deleteStage(db, intParam(String(req.params.pid)), intParam(String(req.params.sid)));
  res.status(204).end();
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
