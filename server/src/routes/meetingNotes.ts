import { Router } from 'express';
import { meetingNoteFieldsSchema, meetingNoteInputSchema } from '@workflow/contracts/schemas';
import { db } from '../db/connection.ts';
import { intParam, parseBody } from '../lib/validate.ts';
import {
  createMeetingNote,
  getMeetingNote,
  listMeetingNotes,
  softDeleteMeetingNote,
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

router.post('/', (req, res) => {
  const body = parseBody(meetingNoteInputSchema, req);
  res.status(201).json(createMeetingNote(db, body));
});

router.get('/:id', (req, res) => res.json(getMeetingNote(db, intParam(req.params.id))));

router.patch('/:id', (req, res) => {
  const body = parseBody(meetingNoteFieldsSchema.partial(), req);
  res.json(updateMeetingNote(db, intParam(req.params.id), body));
});

router.delete('/:id', (req, res) => {
  softDeleteMeetingNote(db, intParam(req.params.id));
  res.json({ ok: true });
});

export default router;
