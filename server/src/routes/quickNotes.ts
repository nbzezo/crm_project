import { Router } from 'express';
import { z } from 'zod';
import {
  meetingNoteInputSchema,
  quickNoteFieldsSchema,
  quickNoteInputSchema,
  quickNoteMoveSchema,
  quickNoteRelationSchema,
} from '@workflow/contracts/schemas';
import { db } from '../db/connection.ts';
import { intParam, parseBody } from '../lib/validate.ts';
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

function boolQuery(value: unknown): boolean {
  return value === '1' || value === 'true';
}

router.get('/', (req, res) => {
  const view = req.query.view;
  const filters: QuickNoteFilters = {
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
  res.status(201).json(createQuickNote(db, body));
});

/** Danh sach tag khong trung — phai dung TRUOC '/:id' de khong bi intParam bat nham. */
router.get('/tags', (req, res) => res.json(listQuickNoteTags(db)));

router.get('/:id', (req, res) => res.json(getQuickNote(db, intParam(req.params.id))));

router.patch('/:id', (req, res) => {
  const body = parseBody(quickNoteFieldsSchema.partial(), req);
  res.json(updateQuickNote(db, intParam(req.params.id), body));
});

router.delete('/:id', (req, res) => {
  softDeleteQuickNote(db, intParam(req.params.id));
  res.json({ ok: true });
});

/** Chi xoa vinh vien duoc ghi chu DANG trong Thung rac (xem permanentlyDeleteQuickNote). */
router.delete('/:id/permanent', (req, res) => {
  permanentlyDeleteQuickNote(db, intParam(req.params.id));
  res.json({ ok: true });
});

/**
 * Goi khi dong mot ghi chu (Escape/bam nen/nut Đóng) — tu huy neu ghi chu do
 * hoan toan rong, giong Google Keep (xem discardIfEmptyQuickNote).
 */
router.post('/:id/discard-if-empty', (req, res) => {
  const discarded = discardIfEmptyQuickNote(db, intParam(req.params.id));
  res.json({ discarded });
});

router.post('/:id/restore', (req, res) => res.json(restoreQuickNote(db, intParam(req.params.id))));

router.post('/:id/pin', (req, res) => {
  const { pinned } = parseBody(z.object({ pinned: z.boolean() }), req);
  res.json(setPinned(db, intParam(req.params.id), pinned));
});

router.post('/:id/archive', (req, res) => {
  const { archived } = parseBody(z.object({ archived: z.boolean() }), req);
  res.json(setArchived(db, intParam(req.params.id), archived));
});

/** FR-BOARD: keo tha sap xep tay (v33) — xem moveQuickNote/computeMovePosition. */
router.post('/:id/move', (req, res) => {
  const body = parseBody(quickNoteMoveSchema, req);
  res.json(moveQuickNote(db, intParam(req.params.id), body));
});

router.put('/:id/relations', (req, res) => {
  const { relations } = parseBody(z.object({ relations: z.array(quickNoteRelationSchema) }), req);
  res.json(syncRelations(db, intParam(req.params.id), relations));
});

/**
 * FR17: Task duoc tao boi form chung toan app (Task Composer, xem
 * `openTaskComposer` trong `client/src/stores/uiStore.ts`) — endpoint nay chi
 * ghi lai lien ket SAU KHI task da ton tai, khong tu tao Task.
 */
router.post('/:id/convert/task', (req, res) => {
  const { card_id } = parseBody(z.object({ card_id: z.number().int().positive() }), req);
  res.json(markConverted(db, intParam(req.params.id), 'task', card_id));
});

/** FR16: tao mot CRM Note (meeting_notes) moi tu noi dung Quick Note, giu nguyen ban goc. */
router.post('/:id/convert/crm-note', (req, res) => {
  const id = intParam(req.params.id);
  const note = getQuickNote(db, id);
  const links = parseBody(
    meetingNoteInputSchema.pick({ customer_id: true, deal_id: true, project_id: true }),
    req
  );
  const crmNote = createMeetingNote(db, {
    ...links,
    title: note.title || 'Ghi chú không tiêu đề',
    content_json: note.content_json,
    content_text: note.content_text,
  });
  res.status(201).json(markConverted(db, id, 'crm_note', crmNote.id as number));
});

export default router;
