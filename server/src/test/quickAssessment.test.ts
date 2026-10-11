/**
 * Danh gia nhanh 10 cau (che do Co ban, v71): goi y suy tu diem Nang cao da xac nhan,
 * thu tu ket luan, 3 viec nen lam tiep, khoa khi co hoi da chot.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { migrate } from '../db/migrate.ts';
import {
  getQuickAssessment,
  quickVerdictOf,
  saveQuickAnswers,
  type QuickAnswer,
  type QuickQuestion,
} from '../services/quickAssessmentService.ts';
import { writeCriterion } from '../services/assessmentService.ts';

function setup() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  const customerId = Number(
    db.prepare(`INSERT INTO customers (name) VALUES ('Khach nhanh')`).run().lastInsertRowid
  );
  const me = Number(
    db
      .prepare(`INSERT INTO contacts (customer_id, full_name) VALUES (?, 'Nguoi ban')`)
      .run(customerId).lastInsertRowid
  );
  const dealId = Number(
    db
      .prepare(`INSERT INTO deals (customer_id, title, stage) VALUES (?, 'Co hoi nhanh', 'lead')`)
      .run(customerId).lastInsertRowid
  );
  return { db, me, dealId };
}

const GROUPS: Record<QuickQuestion, 'real' | 'edge' | 'worth'> = {
  need: 'real',
  budget: 'real',
  deadline: 'real',
  decision_maker: 'real',
  supporter: 'edge',
  fit: 'edge',
  advantage: 'edge',
  process: 'edge',
  profit: 'worth',
  future: 'worth',
};

function verdict(answers: Partial<Record<QuickQuestion, QuickAnswer>>) {
  return quickVerdictOf(
    (Object.keys(GROUPS) as QuickQuestion[]).map((question) => ({
      question,
      group: GROUPS[question],
      answer: answers[question] ?? null,
    }))
  );
}

test('ket luan: chua tra loi gi la not_started, khong phai "can tim hieu"', () => {
  assert.equal(verdict({}), 'not_started');
  assert.equal(verdict({ budget: 'unsure' }), 'not_started');
});

test('ket luan theo dung thu tu uu tien', () => {
  // Khong co nhu cau that thi dung, du moi cau khac la Co
  assert.equal(
    verdict({ need: 'no', budget: 'yes', deadline: 'yes', decision_maker: 'yes' }),
    'stop_no_need'
  );
  assert.equal(verdict({ need: 'yes', profit: 'no', future: 'no' }), 'stop_not_worth');
  assert.equal(verdict({ need: 'yes', budget: 'yes', deadline: 'yes' }), 'clarify');
  const strong = {
    need: 'yes',
    budget: 'yes',
    deadline: 'yes',
    supporter: 'yes',
    fit: 'yes',
    advantage: 'yes',
  } as const;
  assert.equal(verdict(strong), 'go');
  // Chi mot cau "Dang lam" la Khong thi khong con "Nen theo"
  assert.equal(verdict({ ...strong, profit: 'no' }), 'clarify');
  assert.equal(
    verdict({
      need: 'yes',
      budget: 'yes',
      deadline: 'yes',
      decision_maker: 'yes',
      fit: 'yes',
      advantage: 'no',
    }),
    'build_edge'
  );
  assert.equal(
    verdict({
      need: 'yes',
      budget: 'no',
      deadline: 'no',
      supporter: 'yes',
      fit: 'yes',
      advantage: 'yes',
    }),
    'keep_warm'
  );
});

test('goi y suy tu diem Nang cao DA XAC NHAN; diem AI de xuat khong duoc dung', () => {
  const { db, me, dealId } = setup();
  db.prepare(
    `INSERT INTO deal_scores (deal_id, factor, score, evidence) VALUES (?, 'budget', 3, 'Ngan sach da duyet 2 ty dong')`
  ).run(dealId);
  db.prepare(
    `INSERT INTO deal_scores (deal_id, factor, score, status, evidence)
     VALUES (?, 'need', 3, 'suggested', 'AI doan khach co nhu cau lon')`
  ).run(dealId);
  writeCriterion(db, dealId, 'strategic', { score: 3 }, me);
  writeCriterion(db, dealId, 'profit', { score: 1 }, me);

  const q = getQuickAssessment(db, dealId);
  const item = (key: QuickQuestion) => q.items.find((i) => i.question === key)!;
  assert.deepEqual([item('budget').answer, item('budget').source], ['yes', 'derived']);
  assert.deepEqual([item('need').answer, item('need').source], [null, null]);
  assert.equal(item('profit').answer, 'no');
  // "future" gop o tiep noi va o chien luoc, lay o tot nhat
  assert.equal(item('future').answer, 'yes');
  assert.equal(q.answered_at, null);
});

test('luu cau tra loi ghi de goi y; viec nen lam tiep uu tien nguoi duyet chi', () => {
  const { db, me, dealId } = setup();
  const q = saveQuickAnswers(
    db,
    dealId,
    [
      { question: 'need', answer: 'yes' },
      { question: 'budget', answer: 'unsure', note: 'Cho khach bao lai' },
      { question: 'decision_maker', answer: 'no', source: 'ai' },
    ],
    me
  );
  assert.deepEqual(
    q.next_actions.map((a) => a.question),
    ['decision_maker', 'budget', 'deadline']
  );
  assert.equal(q.next_actions[0]!.answer, 'no');
  const budget = q.items.find((i) => i.question === 'budget')!;
  assert.deepEqual(
    [budget.answer, budget.note, budget.updated_by_name],
    ['unsure', 'Cho khach bao lai', 'Nguoi ban']
  );
  assert.equal(q.items.find((i) => i.question === 'decision_maker')!.source, 'ai');
  assert.ok(q.answered_at);
  assert.deepEqual(q.counts, { yes: 1, unsure: 8, no: 1 });

  db.prepare(`UPDATE deals SET stage = 'won' WHERE id = ?`).run(dealId);
  assert.throws(
    () => saveQuickAnswers(db, dealId, [{ question: 'need', answer: 'no' }], me),
    /đã chốt/
  );
});
