/**
 * Nghiem thu bo may cham diem BANT + 4P theo bo AC-SCR-01..14.
 *
 * Chay: npm run test -w server
 * Moi test dung mot CSDL trong bo nho rieng, di qua dung duong migrate that (0 -> 10).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { migrate } from '../db/migrate.ts';
import {
  checkStageGate,
  confirmScore,
  getScorecard,
  saveScoringSettings,
  snapshotScores,
  unverifyBySource,
  writeScore,
} from './scoring.ts';
import type { Factor } from './crm.ts';

/* ---------- Do gian ---------- */

const EV = 'Bang chung du dai de vuot nguong 20 ky tu';

interface Fixture {
  db: Database.Database;
  dealId: number;
  contactId: number;
  economicId: number;
}

function setup(): Fixture {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);

  const customerId = Number(
    db.prepare(`INSERT INTO customers (name) VALUES ('Cong ty Thu Nghiem')`).run().lastInsertRowid
  );
  const contactId = Number(
    db
      .prepare(`INSERT INTO contacts (customer_id, full_name, buying_role) VALUES (?, 'Nguoi dung', 'user')`)
      .run(customerId).lastInsertRowid
  );
  const economicId = Number(
    db
      .prepare(
        `INSERT INTO contacts (customer_id, full_name, buying_role) VALUES (?, 'Giam doc Tai chinh', 'economic_buyer')`
      )
      .run(customerId).lastInsertRowid
  );
  const dealId = Number(
    db
      .prepare(
        `INSERT INTO deals (customer_id, title, stage, probability, value_vnd) VALUES (?, 'Co hoi thu', 'lead', 10, 100000000)`
      )
      .run(customerId).lastInsertRowid
  );
  return { db, dealId, contactId, economicId };
}

/** Tao du lieu de go tran diem cua tung yeu to (BR-SCR-01..08). */
function unlockTimeline(f: Fixture, confirmed = true): void {
  f.db
    .prepare(
      `INSERT INTO deal_events (deal_id, event_type, description, event_date, confirmed)
       VALUES (?, 'contract_expiry', 'Hop dong cu het han', '2026-12-31', ?)`
    )
    .run(f.dealId, confirmed ? 1 : 0);
}

function addInteraction(f: Fixture, contactId: number): number {
  return Number(
    f.db
      .prepare(
        `INSERT INTO interactions (customer_id, contact_id, deal_id, type, occurred_at, summary)
         SELECT customer_id, ?, id, 'call', date('now','localtime'), 'Trao doi ngan sach' FROM deals WHERE id = ?`
      )
      .run(contactId, f.dealId).lastInsertRowid
  );
}

function unlockAuthority(f: Fixture): void {
  f.db
    .prepare(`INSERT INTO deal_committee (deal_id, contact_id, stance) VALUES (?, ?, 'neutral')`)
    .run(f.dealId, f.economicId);
  addInteraction(f, f.economicId);
}

function unlockRelationship(f: Fixture): void {
  f.db
    .prepare(
      `INSERT INTO deal_committee (deal_id, contact_id, stance, is_champion) VALUES (?, ?, 'supporter', 1)`
    )
    .run(f.dealId, f.contactId);
  addInteraction(f, f.contactId);
  if (
    (f.db.prepare(`SELECT COUNT(*) AS n FROM deal_committee WHERE deal_id = ?`).get(f.dealId) as {
      n: number;
    }).n < 2
  )
    unlockAuthority(f);
}

function unlockPrice(f: Fixture, shaped = false): void {
  f.db
    .prepare(
      `INSERT INTO deal_competitors (deal_id, name, price_position, shaped_requirements)
       VALUES (?, 'Doi thu X', 'similar', ?)`
    )
    .run(f.dealId, shaped ? 1 : 0);
}

/** Mo khoa het moi rang buoc de tap trung kiem tra phep tinh. */
function unlockAll(f: Fixture): void {
  unlockTimeline(f);
  unlockRelationship(f);
  unlockPrice(f);
}

function score(f: Fixture, factor: Factor, value: number, evidence = EV) {
  return writeScore(f.db, f.dealId, factor, { score: value, evidence });
}

/* ---------- AC-SCR-01..03: phep tinh tong va o ma tran ---------- */

test('AC-SCR-01 tong hai truc va o ma tran', () => {
  const f = setup();
  unlockAll(f);
  score(f, 'budget', 3);
  score(f, 'authority', 2);
  score(f, 'need', 3, 'Khach tu tinh thiet hai 180 trieu moi thang');
  score(f, 'timeline', 1);
  score(f, 'price', 2);
  score(f, 'relationship', 1);
  score(f, 'fit', 3);
  const card = score(f, 'process', 1);

  assert.equal(card.bant_total, 9);
  assert.equal(card.p4_total, 7);
  assert.equal(card.quadrant, 'pursue');
  f.db.close();
});

test('AC-SCR-02 ranh gioi 7 diem lat o dung chieu', () => {
  const f = setup();
  unlockAll(f);
  score(f, 'budget', 3);
  score(f, 'authority', 3);
  score(f, 'need', 1);
  let card = score(f, 'fit', 3);
  assert.equal(card.bant_total, 7);
  assert.equal(card.p4_total, 3);
  assert.equal(card.quadrant, 'reshape', 'BANT 7 / 4P 3 phai la RESHAPE');
  assert.equal(card.distance_to_boundary.bant, 0);

  card = score(f, 'authority', 2);
  assert.equal(card.bant_total, 6);
  assert.equal(card.quadrant, 'disqualify');

  score(f, 'price', 3);
  card = score(f, 'process', 1);
  assert.equal(card.p4_total, 7);
  assert.equal(card.quadrant, 'nurture', 'BANT 6 / 4P 7 phai la NURTURE');
  f.db.close();
});

test('AC-SCR-03 sinh luoi: chua cham thi khong co dong nao trong deal_scores', () => {
  const f = setup();
  const card = getScorecard(f.db, f.dealId);
  assert.equal(card.items.length, 8);
  assert.equal(card.bant_total, 0);
  assert.equal(card.quadrant, 'disqualify');
  assert.equal(card.score_age_days, null);
  assert.equal(card.confidence, null, 'chua cham thi khong co confidence');
  assert.equal(card.scored_count, 0);
  const rows = f.db.prepare(`SELECT COUNT(*) AS n FROM deal_scores`).get() as { n: number };
  assert.equal(rows.n, 0);
  f.db.close();
});

/* ---------- AC-SCR-04..06: bang chung va rang buoc rubric ---------- */

test('AC-SCR-04 bang chung bat buoc voi diem >= 1, diem 0 van duoc ghi bang chung', () => {
  const f = setup();
  assert.throws(
    () => writeScore(f.db, f.dealId, 'budget', { score: 2, evidence: 'qua ngan' }),
    /Bang chung/
  );
  score(f, 'budget', 2);
  // Diem 0 do "thong tin tieu cuc ro rang" — phai ghi duoc bang chung
  const card = writeScore(f.db, f.dealId, 'fit', {
    score: 0,
    evidence: 'Khach yeu cau tich hop SAP, ngoai nang luc hien tai',
  });
  assert.ok((card.items.find((i) => i.factor === 'fit')?.evidence.length ?? 0) > 0);
  f.db.close();
});

test('AC-SCR-05 BR-SCR-01: TIMELINE = 3 doi su kien bat buoc da xac nhan', () => {
  const f = setup();
  assert.throws(() => score(f, 'timeline', 3), /Chua du du lieu/);

  unlockTimeline(f, false);
  assert.throws(() => score(f, 'timeline', 3), /Chua du du lieu/);
  assert.equal(getScorecard(f.db, f.dealId).items.find((i) => i.factor === 'timeline')?.max_allowed, 2);

  f.db.prepare(`UPDATE deal_events SET confirmed = 1 WHERE deal_id = ?`).run(f.dealId);
  const card = score(f, 'timeline', 3);
  assert.equal(card.bant_total, 3);
  assert.equal(card.veto.some((v) => v.code === 'V1_NO_COMPELLING_EVENT'), false);
  f.db.close();
});

test('AC-SCR-06 BR-SCR-06: doi thu soan tieu chi thi PROCESS bi ep ve 0', () => {
  const f = setup();
  unlockPrice(f);
  score(f, 'process', 3);

  f.db.prepare(`UPDATE deal_competitors SET shaped_requirements = 1 WHERE deal_id = ?`).run(f.dealId);
  const card = getScorecard(f.db, f.dealId);
  assert.equal(card.items.find((i) => i.factor === 'process')?.max_allowed, 0);
  assert.equal(card.items.find((i) => i.factor === 'process')?.blocked_by, 'competitor_shaped');
  assert.throws(() => score(f, 'process', 1), /Chua du du lieu/);
  f.db.close();
});

test('BR-SCR-07 va BR-SCR-08: PRICE doi mat bang gia, NEED = 3 doi con so', () => {
  const f = setup();
  assert.throws(() => score(f, 'price', 1), /Chua du du lieu/);
  unlockPrice(f);
  score(f, 'price', 2);

  assert.throws(() => score(f, 'need', 3, 'Khach dau vi quy trinh doi soat thu cong'), /con so/);
  score(f, 'need', 3, 'Doi soat thu cong ton 180 trieu moi thang');
  f.db.close();
});

/* ---------- AC-SCR-07..09: veto, de xuat, xac thuc ---------- */

test('AC-SCR-07 veto khong doi o ma tran nhung chan forecast', () => {
  const f = setup();
  unlockRelationship(f);
  unlockPrice(f);
  score(f, 'budget', 3);
  score(f, 'authority', 3);
  score(f, 'need', 3, 'Thiet hai 200 trieu moi thang');
  score(f, 'price', 3);
  score(f, 'relationship', 3);
  score(f, 'fit', 3);
  const card = score(f, 'process', 3);

  assert.equal(card.quadrant, 'pursue', 'veto khong duoc doi o ma tran');
  assert.equal(card.veto.some((v) => v.code === 'V1_NO_COMPELLING_EVENT' && v.blocking), true);
  assert.equal(card.forecast_eligible, false);
  assert.equal(card.recommendations[0].code, 'veto');
  f.db.close();
});

test('V3 mac dinh chi canh bao, chuyen sang che do veto thi chan forecast', () => {
  const f = setup();
  unlockTimeline(f);
  unlockAuthority(f);
  unlockPrice(f, true);

  let card = getScorecard(f.db, f.dealId);
  const v3 = card.veto.find((v) => v.code === 'V3_COMPETITOR_SHAPED');
  assert.equal(v3?.blocking, false, 'mac dinh V3 chi canh bao');
  assert.equal(card.forecast_eligible, true);

  saveScoringSettings(f.db, { v3_mode: 'veto' });
  card = getScorecard(f.db, f.dealId);
  assert.equal(card.veto.find((v) => v.code === 'V3_COMPETITOR_SHAPED')?.blocking, true);
  assert.equal(card.forecast_eligible, false);
  f.db.close();
});

test('AC-SCR-08 diem de xuat khong vao tong cho toi khi xac nhan', () => {
  const f = setup();
  unlockTimeline(f);
  const suggested = writeScore(f.db, f.dealId, 'need', {
    score: 3,
    evidence: 'AI doc transcript: khach neu thiet hai 180 trieu/thang',
    status: 'suggested',
  });
  assert.equal(suggested.bant_total, 0, 'diem suggested khong duoc cong vao tong');

  const confirmed = confirmScore(f.db, f.dealId, 'need');
  assert.equal(confirmed.bant_total, 3);
  const history = f.db
    .prepare(`SELECT COUNT(*) AS n FROM deal_score_history WHERE deal_id = ?`)
    .get(f.dealId) as { n: number };
  assert.equal(history.n, 2, 'ca lan de xuat va lan xac nhan deu duoc ghi lai');
  f.db.close();
});

test('AC-SCR-09 xoa nguon bang chung: mat dau xac thuc, diem giu nguyen', () => {
  const f = setup();
  const interactionId = addInteraction(f, f.contactId);
  const card = writeScore(f.db, f.dealId, 'budget', {
    score: 2,
    evidence: 'Chi Hoa xac nhan ngan sach 2 ty da duyet',
    source_type: 'interaction',
    source_id: interactionId,
  });
  assert.equal(card.items.find((i) => i.factor === 'budget')?.verified, 1);
  assert.equal(card.confidence, 1);

  unverifyBySource(f.db, 'interaction', interactionId);
  const after = getScorecard(f.db, f.dealId);
  assert.equal(after.items.find((i) => i.factor === 'budget')?.score, 2, 'diem phai giu nguyen');
  assert.equal(after.items.find((i) => i.factor === 'budget')?.verified, 0);
  assert.equal(after.confidence, 0);
  const reason = f.db
    .prepare(`SELECT reason FROM deal_score_history ORDER BY id DESC LIMIT 1`)
    .get() as { reason: string };
  assert.match(reason.reason, /nguon bang chung/);
  f.db.close();
});

test('nguon bang chung phai thuoc dung co hoi do', () => {
  const f = setup();
  const other = Number(
    f.db
      .prepare(
        `INSERT INTO deals (customer_id, title, stage) SELECT customer_id, 'Co hoi khac', 'lead' FROM deals WHERE id = ?`
      )
      .run(f.dealId).lastInsertRowid
  );
  const foreign = Number(
    f.db
      .prepare(
        `INSERT INTO interactions (customer_id, contact_id, deal_id, type, occurred_at, summary)
         SELECT customer_id, ?, ?, 'call', date('now','localtime'), 'Cua deal khac' FROM deals WHERE id = ?`
      )
      .run(f.contactId, other, other).lastInsertRowid
  );
  assert.throws(
    () =>
      writeScore(f.db, f.dealId, 'budget', {
        score: 2,
        evidence: EV,
        source_type: 'interaction',
        source_id: foreign,
      }),
    /khong thuoc co hoi nay/
  );
  f.db.close();
});

/* ---------- AC-SCR-10..12: cong giai doan, khoa khi chot, khong cham probability ---------- */

test('AC-SCR-10 cong giai doan chan khi thieu diem, lost khong bao gio bi chan', () => {
  const f = setup();
  unlockAll(f);
  score(f, 'budget', 2);
  score(f, 'authority', 2);

  const blocked = checkStageGate(f.db, f.dealId, 'quoted');
  assert.equal(blocked.ok, false);
  assert.equal(blocked.required, 7);
  assert.equal(blocked.bant_total, 4);
  assert.ok(blocked.blocked_by.includes('factor:timeline'), 'phai chi ra yeu to con nang duoc');

  assert.equal(checkStageGate(f.db, f.dealId, 'lost').ok, true, 'That bai khong bao gio bi chan');
  assert.equal(checkStageGate(f.db, f.dealId, 'discussing').ok, true, 'giai doan khong dat nguong');

  score(f, 'need', 3, 'Thiet hai 180 trieu moi thang');
  score(f, 'timeline', 3);
  assert.equal(checkStageGate(f.db, f.dealId, 'quoted').ok, true);

  // Dam phan con doi khong dinh veto V2 (chua tiep can nguoi co quyen chi tien)
  const negotiating = checkStageGate(f.db, f.dealId, 'negotiating');
  assert.equal(negotiating.bant_total, 10);
  assert.equal(negotiating.ok, true, 'da co economic buyer qua unlockRelationship -> unlockAuthority');
  f.db.close();
});

test('cong Dam phan chan khi chua tiep can nguoi co quyen chi tien', () => {
  const f = setup();
  unlockTimeline(f);
  // Nhom co 3 vai tro nhung khong ai la economic buyer da tiep xuc
  for (const role of ['technical', 'procurement', 'legal']) {
    const id = Number(
      f.db
        .prepare(
          `INSERT INTO contacts (customer_id, full_name, buying_role)
           SELECT customer_id, ?, ? FROM deals WHERE id = ?`
        )
        .run(`Nguoi ${role}`, role, f.dealId).lastInsertRowid
    );
    f.db.prepare(`INSERT INTO deal_committee (deal_id, contact_id) VALUES (?, ?)`).run(f.dealId, id);
  }
  score(f, 'budget', 3);
  score(f, 'authority', 2);
  score(f, 'need', 2);
  score(f, 'timeline', 3);

  const gate = checkStageGate(f.db, f.dealId, 'negotiating');
  assert.equal(gate.bant_total, 10);
  assert.equal(gate.ok, false);
  assert.ok(gate.blocked_by.includes('veto:V2_NO_ECONOMIC_BUYER'));
  f.db.close();
});

test('AC-SCR-11 chot deal thi chup diem va khoa scorecard', () => {
  const f = setup();
  unlockAll(f);
  score(f, 'budget', 3);
  score(f, 'need', 2);
  snapshotScores(f.db, f.dealId);
  f.db.prepare(`UPDATE deals SET stage = 'won' WHERE id = ?`).run(f.dealId);

  const snapshot = JSON.parse(
    (f.db.prepare(`SELECT score_snapshot FROM deals WHERE id = ?`).get(f.dealId) as {
      score_snapshot: string;
    }).score_snapshot
  ) as { bant_total: number; scores: Record<string, unknown> };
  assert.equal(snapshot.bant_total, 5);
  assert.equal(Object.keys(snapshot.scores).length, 8, 'chup du 8 yeu to');

  assert.equal(getScorecard(f.db, f.dealId).locked, true);
  assert.throws(() => score(f, 'budget', 1), /chi doc/);
  f.db.close();
});

test('AC-SCR-12 cham diem khong duoc dong vao deals.probability', () => {
  const f = setup();
  unlockAll(f);
  for (const factor of ['budget', 'authority', 'need', 'timeline'] as Factor[])
    score(f, factor, 3, 'Bang chung day du kem con so 180 trieu moi thang');

  const deal = f.db.prepare(`SELECT probability, stage FROM deals WHERE id = ?`).get(f.dealId) as {
    probability: number;
    stage: string;
  };
  assert.equal(deal.probability, 10, 'xac suat theo giai doan phai giu nguyen');
  assert.equal(deal.stage, 'lead');
  assert.equal(getScorecard(f.db, f.dealId).bant_total, 12);
  f.db.close();
});

/* ---------- AC-SCR-13..14: cau hinh, don du lieu ---------- */

test('AC-SCR-14 xoa co hoi khong de lai dong mo coi', () => {
  const f = setup();
  unlockAll(f);
  score(f, 'budget', 2);
  f.db.prepare(`DELETE FROM deals WHERE id = ?`).run(f.dealId);

  for (const table of [
    'deal_scores',
    'deal_committee',
    'deal_events',
    'deal_competitors',
    'deal_score_history',
  ]) {
    const left = f.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
    assert.equal(left.n, 0, `${table} con dong mo coi`);
  }
  f.db.close();
});

test('diem qua han thi bi loai khoi forecast', () => {
  const f = setup();
  unlockTimeline(f);
  unlockAuthority(f);
  score(f, 'budget', 2);
  f.db
    .prepare(`UPDATE deals SET score_updated_at = date('now','localtime','-45 days') WHERE id = ?`)
    .run(f.dealId);

  const card = getScorecard(f.db, f.dealId);
  assert.equal(card.score_age_days! >= 45, true);
  assert.equal(card.stale, true);
  assert.equal(card.forecast_eligible, false, 'diem cu thi khong duoc vao forecast da loc');
  f.db.close();
});

test('deal lon bat buoc tra loi cau phan bien khi cham 4P >= 2 (F-13)', () => {
  const f = setup();
  unlockPrice(f);
  f.db.prepare(`UPDATE deals SET value_vnd = 2000000000 WHERE id = ?`).run(f.dealId);

  assert.throws(() => score(f, 'price', 2), /phan bien/);
  const card = writeScore(f.db, f.dealId, 'price', {
    score: 2,
    evidence: EV,
    challenge: 'Khach da cong nhan gia tri o cuoc hop ngay 03/08, co bien ban',
  });
  assert.equal(card.p4_total, 2);
  assert.equal(card.challenge_required, true);
  // Truc BANT khong bi rang buoc phan bien
  score(f, 'budget', 3);
  f.db.close();
});
