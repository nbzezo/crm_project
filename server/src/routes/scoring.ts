/**
 * API cham diem co hoi BANT + 4P (v10).
 *
 * Mount tai '/api' va dat TRUOC router system. Cac duong dan deu co >= 2 doan
 * (`/deals/:id/scorecard`…) nen khong dung cham route `/:id` cua router deals.
 */
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.ts';
import { fold } from '../lib/viSearch.ts';
import { HttpError, intParam, parseBody, required } from '../lib/validate.ts';
import {
  COMMITTEE_STANCES,
  EVENT_TYPES,
  EVIDENCE_SOURCE_TYPES,
  PRICE_POSITIONS,
  SCORE_FACTORS,
  SCORE_STATUSES,
  type Factor,
} from '../lib/crm.ts';
import {
  confirmScore,
  getCommittee,
  getCompetitors,
  getEvents,
  getScorecard,
  getScoringSettings,
  saveScoringSettings,
  writeScore,
} from '../lib/scoring.ts';

const router = Router();

/* ---------- Tien ich ---------- */

/** Moi thao tac deu phai chac chan co hoi ton tai truoc khi ghi bang con. */
function assertDeal(dealId: number): void {
  required(
    db.prepare(`SELECT id FROM deals WHERE id = ?`).get(dealId),
    'Khong tim thay co hoi'
  );
}

function factorParam(value: string | undefined): Factor {
  if (!SCORE_FACTORS.includes(value as Factor)) throw new HttpError(400, 'Yeu to khong hop le');
  return value as Factor;
}

/* ---------- Scorecard va diem ---------- */

router.get('/deals/:id/scorecard', (req, res) => {
  const dealId = intParam(req.params.id);
  res.json(getScorecard(db, dealId));
});

const scoreSchema = z.object({
  score: z.number().int().min(0).max(3),
  evidence: z.string().max(1000).default(''),
  status: z.enum(SCORE_STATUSES).optional(),
  source_type: z.enum(EVIDENCE_SOURCE_TYPES).nullable().optional(),
  source_id: z.number().int().positive().nullable().optional(),
  challenge: z.string().max(1000).optional(),
  reason: z.string().max(200).optional(),
});

router.put('/deals/:id/scores/:factor', (req, res) => {
  const dealId = intParam(req.params.id);
  assertDeal(dealId);
  const factor = factorParam(req.params.factor);
  res.json(writeScore(db, dealId, factor, parseBody(scoreSchema, req)));
});

router.post('/deals/:id/scores/:factor/confirm', (req, res) => {
  const dealId = intParam(req.params.id);
  assertDeal(dealId);
  res.json(confirmScore(db, dealId, factorParam(req.params.factor)));
});

router.get('/deals/:id/score-history', (req, res) => {
  const dealId = intParam(req.params.id);
  res.json(
    db
      .prepare(
        `SELECT id, factor, old_score, new_score, reason, changed_at
           FROM deal_score_history WHERE deal_id = ? ORDER BY changed_at, id`
      )
      .all(dealId)
  );
});

/**
 * F-11: nguon bang chung dung duoc — chi hoat dong va tai lieu CUA CHINH co hoi nay.
 * Tim khong dau bang helper fold() da co, khong viet moi.
 */
router.get('/deals/:id/evidence-sources', (req, res) => {
  const dealId = intParam(req.params.id);
  const q = fold(String(req.query.q ?? '').trim());

  const interactions = db
    .prepare(
      `SELECT i.id, 'interaction' AS source_type, i.type AS kind, substr(i.occurred_at, 1, 10) AS occurred_at,
              i.summary, i.result, c.full_name AS contact_name
         FROM interactions i LEFT JOIN contacts c ON c.id = i.contact_id
        WHERE i.deal_id = ? ORDER BY i.occurred_at DESC LIMIT 100`
    )
    .all(dealId) as Record<string, unknown>[];

  const documents = db
    .prepare(
      `SELECT id, 'document' AS source_type, doc_type AS kind, substr(created_at, 1, 10) AS occurred_at,
              name AS summary, NULL AS result, NULL AS contact_name
         FROM documents WHERE deal_id = ? ORDER BY created_at DESC LIMIT 100`
    )
    .all(dealId) as Record<string, unknown>[];

  const all = [...interactions, ...documents];
  const filtered = q
    ? all.filter((r) => fold(`${r.summary ?? ''} ${r.result ?? ''} ${r.contact_name ?? ''}`).includes(q))
    : all;
  res.json(filtered);
});

/* ---------- Nhom ra quyet dinh (F-03) ---------- */

router.get('/deals/:id/committee', (req, res) => {
  const dealId = intParam(req.params.id);
  assertDeal(dealId);
  const members = getCommittee(db, dealId);
  const chosen = new Set(members.map((m) => m.contact_id));
  // Goi y nguoi lien he cua chinh khach hang do ma chua duoc dua vao nhom
  const candidates = (
    db
      .prepare(
        `SELECT c.id AS contact_id, c.full_name, c.title, c.buying_role AS role
           FROM contacts c JOIN deals d ON d.customer_id = c.customer_id
          WHERE d.id = ? ORDER BY c.is_primary DESC, c.full_name`
      )
      .all(dealId) as { contact_id: number }[]
  ).filter((c) => !chosen.has(c.contact_id));
  res.json({ members, candidates });
});

const memberSchema = z.object({
  contact_id: z.number().int().positive(),
  role_override: z.string().max(40).nullable().optional(),
  stance: z.enum(COMMITTEE_STANCES).optional(),
  is_champion: z.boolean().optional(),
  influence: z.number().int().min(1).max(5).optional(),
  note: z.string().max(500).optional(),
});

router.post('/deals/:id/committee', (req, res) => {
  const dealId = intParam(req.params.id);
  assertDeal(dealId);
  const body = parseBody(memberSchema, req);

  const contact = required(
    db
      .prepare(
        `SELECT c.id FROM contacts c JOIN deals d ON d.customer_id = c.customer_id
          WHERE c.id = ? AND d.id = ?`
      )
      .get(body.contact_id, dealId),
    'Nguoi lien he khong thuoc khach hang cua co hoi nay'
  ) as { id: number };

  // C19: gioi han 20 thanh vien
  const count = db
    .prepare(`SELECT COUNT(*) AS n FROM deal_committee WHERE deal_id = ?`)
    .get(dealId) as { n: number };
  if (count.n >= 20) throw new HttpError(422, 'Toi da 20 thanh vien trong nhom ra quyet dinh');

  db.prepare(
    `INSERT INTO deal_committee (deal_id, contact_id, role_override, stance, is_champion, influence, note)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(deal_id, contact_id) DO NOTHING`
  ).run(
    dealId,
    contact.id,
    body.role_override ?? null,
    body.stance ?? 'unknown',
    body.is_champion ? 1 : 0,
    body.influence ?? 3,
    body.note ?? ''
  );
  res.status(201).json(getCommittee(db, dealId));
});

router.patch('/deals/:id/committee/:contactId', (req, res) => {
  const dealId = intParam(req.params.id);
  const contactId = intParam(req.params.contactId, 'contactId');
  const body = parseBody(memberSchema.partial().omit({ contact_id: true }), req);
  const current = required(
    db.prepare(`SELECT * FROM deal_committee WHERE deal_id = ? AND contact_id = ?`).get(dealId, contactId),
    'Khong tim thay thanh vien'
  ) as Record<string, unknown>;

  db.prepare(
    `UPDATE deal_committee SET role_override = ?, stance = ?, is_champion = ?, influence = ?, note = ?
      WHERE deal_id = ? AND contact_id = ?`
  ).run(
    body.role_override !== undefined ? body.role_override : (current.role_override as string | null),
    body.stance ?? (current.stance as string),
    body.is_champion !== undefined ? (body.is_champion ? 1 : 0) : (current.is_champion as number),
    body.influence ?? (current.influence as number),
    body.note ?? (current.note as string),
    dealId,
    contactId
  );
  res.json(getCommittee(db, dealId));
});

router.delete('/deals/:id/committee/:contactId', (req, res) => {
  const dealId = intParam(req.params.id);
  db.prepare(`DELETE FROM deal_committee WHERE deal_id = ? AND contact_id = ?`).run(
    dealId,
    intParam(req.params.contactId, 'contactId')
  );
  res.json(getCommittee(db, dealId));
});

/* ---------- Su kien bat buoc ---------- */

router.get('/deals/:id/events', (req, res) => {
  res.json(getEvents(db, intParam(req.params.id)));
});

const eventSchema = z.object({
  event_type: z.enum(EVENT_TYPES),
  description: z.string().min(3, 'Mo ta qua ngan').max(500),
  event_date: z.string().nullable().optional(),
  confirmed: z.boolean().optional(),
  is_primary: z.boolean().optional(),
});

/** Chi mot su kien duoc danh dau chinh (C19). */
function clearPrimary(dealId: number, keepId: number | null): void {
  db.prepare(`UPDATE deal_events SET is_primary = 0 WHERE deal_id = ? AND id <> ?`).run(
    dealId,
    keepId ?? 0
  );
}

router.post('/deals/:id/events', (req, res) => {
  const dealId = intParam(req.params.id);
  assertDeal(dealId);
  const body = parseBody(eventSchema, req);
  const info = db
    .prepare(
      `INSERT INTO deal_events (deal_id, event_type, description, event_date, confirmed, is_primary)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      dealId,
      body.event_type,
      body.description,
      body.event_date || null,
      body.confirmed ? 1 : 0,
      body.is_primary ? 1 : 0
    );
  if (body.is_primary) clearPrimary(dealId, Number(info.lastInsertRowid));
  res.status(201).json(getEvents(db, dealId));
});

router.patch('/deals/:id/events/:eventId', (req, res) => {
  const dealId = intParam(req.params.id);
  const eventId = intParam(req.params.eventId, 'eventId');
  const body = parseBody(eventSchema.partial(), req);
  const current = required(
    db.prepare(`SELECT * FROM deal_events WHERE id = ? AND deal_id = ?`).get(eventId, dealId),
    'Khong tim thay su kien'
  ) as Record<string, unknown>;

  db.prepare(
    `UPDATE deal_events SET event_type = ?, description = ?, event_date = ?, confirmed = ?, is_primary = ?
      WHERE id = ?`
  ).run(
    body.event_type ?? (current.event_type as string),
    body.description ?? (current.description as string),
    body.event_date !== undefined ? body.event_date || null : (current.event_date as string | null),
    body.confirmed !== undefined ? (body.confirmed ? 1 : 0) : (current.confirmed as number),
    body.is_primary !== undefined ? (body.is_primary ? 1 : 0) : (current.is_primary as number),
    eventId
  );
  if (body.is_primary) clearPrimary(dealId, eventId);
  res.json(getEvents(db, dealId));
});

router.delete('/deals/:id/events/:eventId', (req, res) => {
  const dealId = intParam(req.params.id);
  db.prepare(`DELETE FROM deal_events WHERE id = ? AND deal_id = ?`).run(
    intParam(req.params.eventId, 'eventId'),
    dealId
  );
  res.json(getEvents(db, dealId));
});

/* ---------- F-14: lich trien khai nguoc tu su kien bat buoc ---------- */

/**
 * Rubric TIMELINE = 3 doi "lich trien khai nguoc da duoc thong nhat" nhung khong tinh
 * nang nao tao ra no — nen diem 3 se duoc cham dua tren tri nho. Day la cho tao ra no.
 *
 * Cac moc lui tinh tu ngay su kien. Moc nao roi vao qua khu la bang chung deal se truot ky.
 */
const BACKWARD_MILESTONES = [
  { offset: -14, title: 'Ky hop dong' },
  { offset: -28, title: 'Khach phe duyet noi bo' },
  { offset: -35, title: 'Gui bao gia cuoi' },
  { offset: -45, title: 'Chot yeu cau ky thuat' },
  { offset: -60, title: 'Khach quyet dinh ngan sach' },
];

router.get('/deals/:id/backward-plan', (req, res) => {
  const dealId = intParam(req.params.id);
  const event = db
    .prepare(
      `SELECT id, description, event_date FROM deal_events
        WHERE deal_id = ? AND event_date IS NOT NULL
        ORDER BY is_primary DESC, event_date LIMIT 1`
    )
    .get(dealId) as { id: number; description: string; event_date: string } | undefined;

  if (!event) {
    res.json({ event: null, milestones: [] });
    return;
  }

  const shift = db.prepare(`SELECT date(?, ?) AS d`);
  const today = (db.prepare(`SELECT date('now','localtime') AS d`).get() as { d: string }).d;
  const milestones = BACKWARD_MILESTONES.map((m) => {
    const date = (shift.get(event.event_date, `${m.offset} days`) as { d: string }).d;
    return { title: m.title, date, overdue: date < today };
  }).sort((a, b) => a.date.localeCompare(b.date));

  res.json({ event, milestones });
});

const planSchema = z.object({
  milestones: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(120),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
    )
    .min(1)
    .max(10),
});

router.post('/deals/:id/backward-plan', (req, res) => {
  const dealId = intParam(req.params.id);
  const deal = required(
    db.prepare(`SELECT id, title, customer_id FROM deals WHERE id = ?`).get(dealId),
    'Khong tim thay co hoi'
  ) as { id: number; title: string; customer_id: number };
  const body = parseBody(planSchema, req);

  // Dung lai module Nhac hen da co, khong dung lich rieng
  const insert = db.prepare(
    `INSERT INTO reminders (title, note, due_at, customer_id, deal_id) VALUES (?, ?, ?, ?, ?)`
  );
  const created = db.transaction(() => {
    let n = 0;
    for (const milestone of body.milestones) {
      insert.run(
        milestone.title,
        `Moc lui cua lich trien khai nguoc — ${deal.title}`,
        `${milestone.date}T09:00`,
        deal.customer_id,
        dealId
      );
      n += 1;
    }
    return n;
  })();

  res.status(201).json({ created });
});

/* ---------- Doi thu ---------- */

router.get('/deals/:id/competitors', (req, res) => {
  const dealId = intParam(req.params.id);
  // Goi y ten doi thu da nhap o cac co hoi khac (khong tao danh muc dung chung)
  const known = db
    .prepare(
      `SELECT name, COUNT(*) AS uses FROM deal_competitors
        WHERE deal_id <> ? GROUP BY name_norm ORDER BY uses DESC LIMIT 20`
    )
    .all(dealId);
  res.json({ items: getCompetitors(db, dealId), known });
});

const competitorSchema = z.object({
  name: z.string().min(1, 'Ten doi thu khong duoc de trong').max(80),
  incumbent: z.boolean().optional(),
  shaped_requirements: z.boolean().optional(),
  price_position: z.enum(PRICE_POSITIONS).optional(),
  note: z.string().max(500).optional(),
});

router.post('/deals/:id/competitors', (req, res) => {
  const dealId = intParam(req.params.id);
  assertDeal(dealId);
  const body = parseBody(competitorSchema, req);
  const count = db
    .prepare(`SELECT COUNT(*) AS n FROM deal_competitors WHERE deal_id = ?`)
    .get(dealId) as { n: number };
  if (count.n >= 5) throw new HttpError(422, 'Toi da 5 doi thu cho mot co hoi');

  db.prepare(
    `INSERT INTO deal_competitors (deal_id, name, name_norm, incumbent, shaped_requirements, price_position, note)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    dealId,
    body.name.trim(),
    fold(body.name).replace(/\s+/g, ' ').trim(),
    body.incumbent ? 1 : 0,
    body.shaped_requirements ? 1 : 0,
    body.price_position ?? 'unknown',
    body.note ?? ''
  );
  res.status(201).json(getCompetitors(db, dealId));
});

router.patch('/deals/:id/competitors/:competitorId', (req, res) => {
  const dealId = intParam(req.params.id);
  const competitorId = intParam(req.params.competitorId, 'competitorId');
  const body = parseBody(competitorSchema.partial(), req);
  const current = required(
    db.prepare(`SELECT * FROM deal_competitors WHERE id = ? AND deal_id = ?`).get(competitorId, dealId),
    'Khong tim thay doi thu'
  ) as Record<string, unknown>;

  const name = body.name?.trim() ?? (current.name as string);
  db.prepare(
    `UPDATE deal_competitors SET name = ?, name_norm = ?, incumbent = ?, shaped_requirements = ?,
            price_position = ?, note = ? WHERE id = ?`
  ).run(
    name,
    fold(name).replace(/\s+/g, ' ').trim(),
    body.incumbent !== undefined ? (body.incumbent ? 1 : 0) : (current.incumbent as number),
    body.shaped_requirements !== undefined
      ? body.shaped_requirements
        ? 1
        : 0
      : (current.shaped_requirements as number),
    body.price_position ?? (current.price_position as string),
    body.note ?? (current.note as string),
    competitorId
  );
  res.json(getCompetitors(db, dealId));
});

router.delete('/deals/:id/competitors/:competitorId', (req, res) => {
  const dealId = intParam(req.params.id);
  db.prepare(`DELETE FROM deal_competitors WHERE id = ? AND deal_id = ?`).run(
    intParam(req.params.competitorId, 'competitorId'),
    dealId
  );
  res.json(getCompetitors(db, dealId));
});

/* ---------- Cau hinh ---------- */

router.get('/settings/scoring', (_req, res) => {
  res.json(getScoringSettings(db));
});

const settingsSchema = z.object({
  stage_gate: z.record(z.string(), z.number().int().min(0).max(12)).optional(),
  stale_days: z.number().int().min(1).max(365).optional(),
  v3_mode: z.enum(['warn', 'veto']).optional(),
  challenge_threshold_vnd: z.number().int().min(0).optional(),
  winloss_min_deals: z.number().int().min(1).optional(),
});

router.put('/settings/scoring', (req, res) => {
  const body = parseBody(settingsSchema, req);
  saveScoringSettings(db, body as Record<string, unknown>);
  res.json(getScoringSettings(db));
});

export default router;
