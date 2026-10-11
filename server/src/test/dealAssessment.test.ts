/**
 * Danh gia co hoi theo 4 cau hoi (v70): luoi 20 o, truc "Dang dau tu", ket luan,
 * nhat ky quyet dinh va nhan dinh AI. Moi test mot CSDL trong bo nho, di qua migrate that.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { migrate } from '../db/migrate.ts';
import {
  addDecision,
  confirmCriterion,
  deleteDecision,
  getAssessment,
  saveAiReview,
  verdictOf,
  writeCriterion,
} from '../services/assessmentService.ts';

function setup() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  const customerId = Number(
    db.prepare(`INSERT INTO customers (name) VALUES ('Cong ty Danh Gia')`).run().lastInsertRowid
  );
  const me = Number(
    db
      .prepare(`INSERT INTO contacts (customer_id, full_name) VALUES (?, 'Nguoi ban')`)
      .run(customerId).lastInsertRowid
  );
  const other = Number(
    db
      .prepare(`INSERT INTO contacts (customer_id, full_name) VALUES (?, 'Truong phong')`)
      .run(customerId).lastInsertRowid
  );
  const dealId = Number(
    db
      .prepare(
        `INSERT INTO deals (customer_id, title, stage, value_vnd) VALUES (?, 'Co hoi A', 'lead', 1000)`
      )
      .run(customerId).lastInsertRowid
  );
  return { db, customerId, me, other, dealId };
}

const cell = (a: ReturnType<typeof getAssessment>, no: number) => a.grid.find((c) => c.no === no)!;

test('luoi 20 o: chua cham thi moi o la "chua biet", dung thu tu 4 cau hoi', () => {
  const { db, dealId } = setup();
  const a = getAssessment(db, dealId);
  assert.equal(a.grid.length, 20);
  assert.deepEqual(
    a.grid.map((c) => c.question),
    [
      ...Array(5).fill('need'),
      ...Array(5).fill('compete'),
      ...Array(5).fill('close'),
      ...Array(5).fill('worth'),
    ]
  );
  // #14 khach moi (chua mua lan nao) la "yeu", khong phai "chua biet"
  assert.equal(cell(a, 14).level, 'weak');
  for (const c of a.grid.filter((g) => g.no !== 14)) assert.equal(c.level, 'unknown', `o #${c.no}`);
  assert.equal(a.worth_level, 'unknown');
  assert.equal(a.verdict, 'disqualify');
});

test('o lay tu 8 yeu to BANT/4P va tieu chi moi; diem AI de xuat khong tinh cho toi khi xac nhan', () => {
  const { db, dealId, me } = setup();
  db.prepare(
    `INSERT INTO deal_scores (deal_id, factor, score, evidence) VALUES (?, 'budget', 3, 'Ngan sach da duyet 2 ty dong')`
  ).run(dealId);
  writeCriterion(db, dealId, 'financial_health', { score: 1, note: 'No dong' }, me);
  saveAiReview(
    db,
    dealId,
    {
      summary: 'Nen tam dung',
      recommendation: 'pause',
      criteria: [
        { key: 'profit', score: 2, reason: 'Bien tot' },
        { key: 'financial_health', score: 3, reason: 'Khong ghi de diem nguoi cham' },
        { key: 'khong_ton_tai', score: 3, reason: 'bo qua' },
      ],
      factors: [],
      unknowns: [{ cell: 99, question: 'bo qua' }],
      risks: [],
      actions: [],
    },
    me
  );
  let a = getAssessment(db, dealId);
  assert.equal(cell(a, 2).score, 3);
  assert.equal(cell(a, 2).level, 'strong');
  assert.equal(cell(a, 4).score, 1, 'diem nguoi cham giu nguyen');
  assert.equal(cell(a, 16).score, null);
  assert.equal(cell(a, 16).suggested_score, 2);
  const ai = a.decisions[0]!;
  assert.equal(ai.author_kind, 'ai');
  assert.equal(ai.decision, 'pause');
  assert.deepEqual((ai.payload as { unknowns: unknown[] }).unknowns, []);

  a = confirmCriterion(db, dealId, 'profit', me);
  assert.equal(cell(a, 16).score, 2);
  assert.equal(cell(a, 16).suggested_score, null);
});

test('Dang dau tu: can >= 3 tieu chi; thang duoc nhung khong dang thi ket luan khac "Theo duoi"', () => {
  const { db, dealId, me } = setup();
  db.prepare(`UPDATE deals SET bant_total = 9, p4_total = 9 WHERE id = ?`).run(dealId);
  writeCriterion(db, dealId, 'profit', { score: 1 }, me);
  writeCriterion(db, dealId, 'follow_on', { score: 1 }, me);
  let a = getAssessment(db, dealId);
  assert.equal(a.worth_level, 'unknown');
  assert.equal(a.verdict, 'pursue');
  a = writeCriterion(db, dealId, 'resources', { score: 1 }, me);
  assert.equal(a.worth_total, 3);
  assert.equal(a.worth_level, 'low');
  assert.equal(a.verdict, 'win_not_worth');
  // #18 kha nang thang suy tu 4P = 9
  assert.equal(cell(a, 18).score, 3);
});

test('ket luan theo o ma tran va muc Dang dau tu', () => {
  assert.equal(verdictOf('reshape', 'high'), 'reshape_invest');
  assert.equal(verdictOf('reshape', 'low'), 'withdraw');
  assert.equal(verdictOf('nurture', 'high'), 'nurture_strategic');
  assert.equal(verdictOf('nurture', 'low'), 'deprioritize');
  assert.equal(verdictOf('disqualify', 'high'), 'disqualify');
});

test('#14 quan he san co va #15 ket noi nguoi anh huong suy tu du lieu', () => {
  const { db, dealId, customerId, me, other } = setup();
  db.prepare(
    `INSERT INTO deals (customer_id, title, stage) VALUES (?, 'Co hoi cu da thang', 'won')`
  ).run(customerId);
  db.prepare(
    `INSERT INTO deal_committee (deal_id, contact_id, stance, influence) VALUES (?, ?, 'mentor', 5)`
  ).run(dealId, me);
  let a = getAssessment(db, dealId);
  assert.equal(cell(a, 14).score, 2);
  assert.equal(cell(a, 15).score, 3);
  db.prepare(
    `INSERT INTO deal_committee (deal_id, contact_id, stance, influence) VALUES (?, ?, 'enemy', 4)`
  ).run(dealId, other);
  a = getAssessment(db, dealId);
  assert.equal(cell(a, 15).score, 2);
});

test('quyet dinh: ghi kem nhac ngay xet lai, chi xoa duoc cua minh, co hoi da chot thi khoa', () => {
  const { db, dealId, me, other } = setup();
  let a = addDecision(
    db,
    dealId,
    { decision: 'pursue', reason: 'Khach can gap', review_date: '2026-11-01', remind: true },
    me
  );
  assert.equal(a.decisions.length, 1);
  assert.equal(a.decisions[0]!.author_name, 'Nguoi ban');
  const reminder = db
    .prepare(`SELECT due_at, deal_id, owner_contact_id FROM reminders WHERE deal_id = ?`)
    .get(dealId);
  assert.deepEqual(reminder, { due_at: '2026-11-01T09:00', deal_id: dealId, owner_contact_id: me });

  const id = a.decisions[0]!.id;
  assert.throws(() => deleteDecision(db, dealId, id, other), /chính bạn/);
  a = deleteDecision(db, dealId, id, me);
  assert.equal(a.decisions.length, 0);

  db.prepare(`UPDATE deals SET stage = 'won' WHERE id = ?`).run(dealId);
  assert.equal(getAssessment(db, dealId).locked, true);
  assert.throws(() => writeCriterion(db, dealId, 'profit', { score: 2 }, me), /chi doc/);
  assert.throws(() => addDecision(db, dealId, { decision: 'pause' }, me), /chi doc/);
});
