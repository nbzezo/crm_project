import { Router } from 'express';
import { meetingNoteFieldsSchema, meetingNoteInputSchema } from '@workflow/contracts/schemas';
import { db } from '../db/connection.ts';
import { intParam, parseBody } from '../lib/validate.ts';
import { defaultOwner } from '../lib/scope.ts';
import { decodeCursor, pageLimit } from '../lib/paging.ts';
import {
  createMeetingNote,
  getMeetingNote,
  listMeetingNotePage,
  listMeetingNotes,
  meetingNoteFacets,
  restoreMeetingNote,
  softDeleteMeetingNote,
  type MeetingNoteLibraryFilters,
  updateMeetingNote,
} from '../services/meetingNoteService.ts';

const router = Router();

function optionalIntQuery(value: unknown): number | undefined {
  if (typeof value !== 'string' || value === '') return undefined;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

router.get('/', (req, res) => {
  res.json(
    listMeetingNotes(db, {
      deal_id: optionalIntQuery(req.query.deal_id),
      project_id: optionalIntQuery(req.query.project_id),
    })
  );
});

const PURPOSES = new Set(['blank', 'meeting', 'plan', 'proposal', 'report', 'process', 'decision']);
const LINKS = new Set(['deal', 'project', 'none']);

/** Bo loc dung chung cho `/page` va `/facets` — gia tri la bi bo qua, khong bao loi. */
function libraryFilters(query: Record<string, unknown>): MeetingNoteLibraryFilters {
  const purpose = String(query.purpose_key ?? '');
  const linked = String(query.linked ?? '');
  return {
    q: typeof query.q === 'string' ? query.q : undefined,
    purpose_key: PURPOSES.has(purpose) ? purpose : undefined,
    linked: LINKS.has(linked) ? (linked as MeetingNoteLibraryFilters['linked']) : undefined,
    customer_id: optionalIntQuery(query.customer_id),
    trash: query.trash === '1',
  };
}

/**
 * Thu vien trang cua trang Tai lieu (1.28.0): tim, loc, phan trang theo con tro.
 * Ban day du `GET /` van giu cho tab ghi chu cua mot Co hoi/Du an (it dong).
 * Phai dung TRUOC '/:id' de intParam khong bat nham.
 */
router.get('/page', (req, res) => {
  res.json(
    listMeetingNotePage(
      db,
      libraryFilters(req.query),
      req.query.sort === 'meeting' ? 'meeting' : 'updated',
      decodeCursor(req.query.cursor),
      pageLimit(req.query.limit)
    )
  );
});

router.get('/facets', (req, res) => res.json(meetingNoteFacets(db, libraryFilters(req.query))));

router.post('/', (req, res) => {
  const body = parseBody(meetingNoteInputSchema, req);
  res.status(201).json(createMeetingNote(db, body, defaultOwner(req)));
});

router.get('/:id', (req, res) => res.json(getMeetingNote(db, intParam(req.params.id))));

router.patch('/:id', (req, res) => {
  const body = parseBody(meetingNoteFieldsSchema.partial(), req);
  res.json(updateMeetingNote(db, intParam(req.params.id), body));
});

router.post('/:id/restore', (req, res) =>
  res.json(restoreMeetingNote(db, intParam(req.params.id)))
);

router.delete('/:id', (req, res) => {
  softDeleteMeetingNote(db, intParam(req.params.id));
  res.json({ ok: true });
});

export default router;
