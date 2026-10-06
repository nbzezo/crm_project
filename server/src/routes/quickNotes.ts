import { Router, type Request } from 'express';
import type { PermissionAction } from '@workflow/contracts';
import { z } from 'zod';
import {
  meetingNoteInputSchema,
  quickNoteFieldsSchema,
  quickNoteInputSchema,
  quickNoteMoveSchema,
  quickNoteRelationSchema,
} from '@workflow/contracts/schemas';
import { db } from '../db/connection.ts';
import { accessOf, actorContactId } from '../middleware/currentUser.ts';
import { HttpError, intParam, parseBody } from '../lib/validate.ts';
import { assertInScope } from '../lib/scope.ts';
import { createMeetingNote } from '../services/meetingNoteService.ts';
import {
  createQuickNote,
  discardIfEmptyQuickNote,
  getQuickNote,
  listQuickNotes,
  listQuickNoteTags,
  markConverted,
  moveQuickNote,
  permanentlyDeleteQuickNote,
  restoreQuickNote,
  setArchived,
  setPinned,
  softDeleteQuickNote,
  syncRelations,
  updateQuickNote,
  type QuickNoteFilters,
} from '../services/quickNoteService.ts';

const router = Router();

/**
 * Kiem mot ghi chu CU THE (1.28.2). Danh sach da loc theo nguoi viet tu truoc,
 * nhung moi route theo id thi khong — doan id la doc, sua, xoa duoc ghi chu ca
 * nhan cua nguoi khac. Ghi chu nhanh la du lieu ca nhan: ghi chu chua co chu chi
 * nguoi co pham vi `all` thay, giong danh sach. Ca ghi chu trong Thung rac.
 */
function guard(req: Request, id: number, action: PermissionAction): number {
  const row = db.prepare(`SELECT owner_contact_id FROM quick_notes WHERE id = ?`).get(id) as
    { owner_contact_id: number | null } | undefined;
  if (!row) throw new HttpError(404, 'Khong tim thay ghi chu');
  assertInScope(req, 'notes', action, row.owner_contact_id, 'Khong tim thay ghi chu');
  return id;
}

/** `:id` da kiem pham vi cho hanh dong `action`. */
const noteId = (req: Request, action: PermissionAction) =>
  guard(req, intParam(req.params.id as string), action);

function boolQuery(value: unknown): boolean {
  return value === '1' || value === 'true';
}

router.get('/', (req, res) => {
  const view = req.query.view;
  const visible = accessOf(req).visibleContactIds('notes', 'read');
  const filters: QuickNoteFilters = {
    owner_contact_ids: visible === 'all' ? undefined : visible,
    q: typeof req.query.q === 'string' ? req.query.q : undefined,
    view: view === 'archived' || view === 'trash' ? view : 'active',
    pinned: boolQuery(req.query.pinned),
    has_reminder: boolQuery(req.query.has_reminder),
    has_attachment: boolQuery(req.query.has_attachment),
    checklist: boolQuery(req.query.checklist),
    linked: boolQuery(req.query.linked),
    tag: typeof req.query.tag === 'string' ? req.query.tag : undefined,
    updated_from: typeof req.query.updated_from === 'string' ? req.query.updated_from : undefined,
    updated_to: typeof req.query.updated_to === 'string' ? req.query.updated_to : undefined,
  };
  res.json(listQuickNotes(db, filters));
});

router.post('/', (req, res) => {
  const body = parseBody(quickNoteInputSchema, req);
  res.status(201).json(createQuickNote(db, body, actorContactId(req)));
});

/** Danh sach tag khong trung — phai dung TRUOC '/:id' de khong bi intParam bat nham. */
router.get('/tags', (req, res) => {
  const visible = accessOf(req).visibleContactIds('notes', 'read');
  res.json(listQuickNoteTags(db, visible === 'all' ? undefined : visible));
});

router.get('/:id', (req, res) => res.json(getQuickNote(db, noteId(req, 'read'))));

router.patch('/:id', (req, res) => {
  const body = parseBody(quickNoteFieldsSchema.partial(), req);
  res.json(updateQuickNote(db, noteId(req, 'update'), body));
});

router.delete('/:id', (req, res) => {
  softDeleteQuickNote(db, noteId(req, 'delete'));
  res.json({ ok: true });
});

/** Chi xoa vinh vien duoc ghi chu DANG trong Thung rac (xem permanentlyDeleteQuickNote). */
router.delete('/:id/permanent', (req, res) => {
  permanentlyDeleteQuickNote(db, noteId(req, 'delete'));
  res.json({ ok: true });
});

/**
 * Goi khi dong mot ghi chu (Escape/bam nen/nut Đóng) — tu huy neu ghi chu do
 * hoan toan rong, giong Google Keep (xem discardIfEmptyQuickNote).
 */
router.post('/:id/discard-if-empty', (req, res) => {
  const discarded = discardIfEmptyQuickNote(db, noteId(req, 'update'));
  res.json({ discarded });
});

router.post('/:id/restore', (req, res) => res.json(restoreQuickNote(db, noteId(req, 'delete'))));

router.post('/:id/pin', (req, res) => {
  const { pinned } = parseBody(z.object({ pinned: z.boolean() }), req);
  res.json(setPinned(db, noteId(req, 'update'), pinned));
});

router.post('/:id/archive', (req, res) => {
  const { archived } = parseBody(z.object({ archived: z.boolean() }), req);
  res.json(setArchived(db, noteId(req, 'update'), archived));
});

/** FR-BOARD: keo tha sap xep tay (v33) — xem moveQuickNote/computeMovePosition. */
router.post('/:id/move', (req, res) => {
  const body = parseBody(quickNoteMoveSchema, req);
  res.json(moveQuickNote(db, noteId(req, 'update'), body));
});

router.put('/:id/relations', (req, res) => {
  const { relations } = parseBody(z.object({ relations: z.array(quickNoteRelationSchema) }), req);
  res.json(syncRelations(db, noteId(req, 'update'), relations));
});

/**
 * FR17: Task duoc tao boi form chung toan app (Task Composer, xem
 * `openTaskComposer` trong `client/src/stores/uiStore.ts`) — endpoint nay chi
 * ghi lai lien ket SAU KHI task da ton tai, khong tu tao Task.
 */
router.post('/:id/convert/task', (req, res) => {
  const { card_id } = parseBody(z.object({ card_id: z.number().int().positive() }), req);
  res.json(markConverted(db, noteId(req, 'update'), 'task', card_id));
});

/** FR16: tao mot CRM Note (meeting_notes) moi tu noi dung Quick Note, giu nguyen ban goc. */
router.post('/:id/convert/crm-note', (req, res) => {
  const id = noteId(req, 'update');
  const note = getQuickNote(db, id);
  const links = parseBody(
    meetingNoteInputSchema.pick({ customer_id: true, deal_id: true, project_id: true }),
    req
  );
  const crmNote = createMeetingNote(
    db,
    {
      ...links,
      purpose_key: 'blank',
      title: note.title || 'Ghi chú không tiêu đề',
      content_json: note.content_json,
      content_text: note.content_text,
    },
    actorContactId(req)
  );
  res.status(201).json(markConverted(db, id, 'crm_note', crmNote.id as number));
});

export default router;
