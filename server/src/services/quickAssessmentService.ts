/**
 * Danh gia nhanh (che do Co ban, v71): 10 cau Co / Chua ro / Khong bang loi thuong.
 *
 * Lop nay KHONG ghi gi vao bo Nang cao (deal_scores / deal_assessments) — bo do doi bang
 * chung va co tran diem. Nguoc lai, cau nao nguoi dung chua tra loi thi lay goi y suy tu
 * diem Nang cao DA XAC NHAN, de nguoi da cham chi tiet khong phai tra loi lai tu dau.
 */
import type { Database } from 'better-sqlite3';
import { HttpError } from '../lib/validate.ts';
import { getAssessment } from './assessmentService.ts';

export const QUICK_QUESTIONS = [
  'need',
  'budget',
  'deadline',
  'decision_maker',
  'supporter',
  'fit',
  'advantage',
  'process',
  'profit',
  'future',
] as const;
export type QuickQuestion = (typeof QUICK_QUESTIONS)[number];
export type QuickAnswer = 'yes' | 'unsure' | 'no';

type Group = 'real' | 'edge' | 'worth';

/** Nhom cua tung cau va o Nang cao dung de suy ra goi y (so o theo luoi 20 o). */
const QUESTION_DEF: Record<QuickQuestion, { group: Group; cells: number[] }> = {
  need: { group: 'real', cells: [1] },
  budget: { group: 'real', cells: [2] },
  deadline: { group: 'real', cells: [5] },
  decision_maker: { group: 'real', cells: [3] },
  supporter: { group: 'edge', cells: [11] },
  fit: { group: 'edge', cells: [7] },
  advantage: { group: 'edge', cells: [10] },
  process: { group: 'edge', cells: [8] },
  profit: { group: 'worth', cells: [16] },
  future: { group: 'worth', cells: [17, 20] },
};

/** Thu tu uu tien khi chon "viec nen lam tiep": gap duoc nguoi duyet chi la viec dau tien. */
const ACTION_PRIORITY: QuickQuestion[] = [
  'decision_maker',
  'need',
  'budget',
  'deadline',
  'supporter',
  'advantage',
  'process',
  'fit',
  'profit',
  'future',
];

export type QuickVerdict =
  'not_started' | 'go' | 'clarify' | 'build_edge' | 'keep_warm' | 'stop_no_need' | 'stop_not_worth';

interface QuickItem {
  question: QuickQuestion;
  group: Group;
  /** null = chua co cau tra loi va cung khong suy ra duoc. */
  answer: QuickAnswer | null;
  /** 'derived' = suy tu diem Nang cao, khong luu trong deal_quick_answers. */
  source: 'user' | 'ai' | 'derived' | null;
  note: string;
  updated_at: string | null;
  updated_by_name: string | null;
}

export interface QuickAssessment {
  deal_id: number;
  locked: boolean;
  items: QuickItem[];
  counts: { yes: number; unsure: number; no: number };
  verdict: QuickVerdict;
  /** Toi da 3 cau can xu ly tiep, theo ACTION_PRIORITY. */
  next_actions: { question: QuickQuestion; answer: QuickAnswer | null }[];
  /** Lan cuoi nguoi dung luu danh gia nhanh — null neu chua lan nao. */
  answered_at: string | null;
}

function answerFromScore(score: number | null): QuickAnswer | null {
  if (score === null || score === 0) return null;
  return score >= 2 ? 'yes' : 'no';
}

export function quickVerdictOf(
  items: Pick<QuickItem, 'question' | 'group' | 'answer'>[]
): QuickVerdict {
  const answer = (q: QuickQuestion) => items.find((item) => item.question === q)?.answer ?? null;
  const known = items.filter((item) => item.answer === 'yes' || item.answer === 'no').length;
  const unsure = items.length - known;
  const yesIn = (group: Group) =>
    items.filter((item) => item.group === group && item.answer === 'yes').length;

  if (answer('need') === 'no') return 'stop_no_need';
  if (answer('profit') === 'no' && answer('future') === 'no') return 'stop_not_worth';
  if (known === 0) return 'not_started';
  if (unsure >= 5) return 'clarify';
  const real = yesIn('real');
  const edge = yesIn('edge');
  const worthNo = answer('profit') === 'no' || answer('future') === 'no';
  if (real >= 3 && edge >= 3 && !worthNo) return 'go';
  if (real >= 3 && edge < 3) return 'build_edge';
  if (real < 3 && edge >= 3) return 'keep_warm';
  return 'clarify';
}

export function getQuickAssessment(db: Database, dealId: number): QuickAssessment {
  const advanced = getAssessment(db, dealId);
  const rows = new Map(
    (
      db
        .prepare(
          `SELECT q.question, q.answer, q.note, q.source, q.updated_at, c.full_name AS updated_by_name
             FROM deal_quick_answers q LEFT JOIN contacts c ON c.id = q.updated_by_contact_id
            WHERE q.deal_id = ?`
        )
        .all(dealId) as {
        question: QuickQuestion;
        answer: QuickAnswer;
        note: string;
        source: 'user' | 'ai';
        updated_at: string;
        updated_by_name: string | null;
      }[]
    ).map((row) => [row.question, row])
  );

  const items: QuickItem[] = QUICK_QUESTIONS.map((question) => {
    const def = QUESTION_DEF[question];
    const row = rows.get(question);
    if (row)
      return {
        question,
        group: def.group,
        answer: row.answer,
        source: row.source,
        note: row.note,
        updated_at: row.updated_at,
        updated_by_name: row.updated_by_name,
      };
    /* Goi y tu o Nang cao: lay o tot nhat trong cac o duoc gan (cau "future" gop #17, #20). */
    const scores = def.cells
      .map((no) => advanced.grid.find((cell) => cell.no === no)?.score ?? null)
      .filter((score): score is number => score !== null);
    const derived = answerFromScore(scores.length ? Math.max(...scores) : null);
    return {
      question,
      group: def.group,
      answer: derived,
      source: derived ? 'derived' : null,
      note: '',
      updated_at: null,
      updated_by_name: null,
    };
  });

  const counts = { yes: 0, unsure: 0, no: 0 };
  for (const item of items) counts[item.answer ?? 'unsure'] += 1;

  const byQuestion = new Map(items.map((item) => [item.question, item]));
  const next_actions = ACTION_PRIORITY.filter((q) => byQuestion.get(q)?.answer !== 'yes')
    .slice(0, 3)
    .map((question) => ({ question, answer: byQuestion.get(question)?.answer ?? null }));

  const stamps = [...rows.values()].map((row) => row.updated_at).sort();
  return {
    deal_id: dealId,
    locked: advanced.locked,
    items,
    counts,
    verdict: quickVerdictOf(items),
    next_actions,
    answered_at: stamps.at(-1) ?? null,
  };
}

export function saveQuickAnswers(
  db: Database,
  dealId: number,
  answers: {
    question: QuickQuestion;
    answer: QuickAnswer;
    note?: string;
    source?: 'user' | 'ai';
  }[],
  actorContactId: number | null
): QuickAssessment {
  if (getAssessment(db, dealId).locked)
    throw new HttpError(409, 'Cơ hội đã chốt nên đánh giá chỉ xem được, không sửa được', {
      code: 'ASSESSMENT_LOCKED',
    });
  const upsert = db.prepare(
    `INSERT INTO deal_quick_answers (deal_id, question, answer, note, source, updated_by_contact_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now','localtime'))
     ON CONFLICT(deal_id, question) DO UPDATE SET
       answer = excluded.answer, note = excluded.note, source = excluded.source,
       updated_by_contact_id = excluded.updated_by_contact_id, updated_at = excluded.updated_at`
  );
  db.transaction(() => {
    for (const item of answers)
      upsert.run(
        dealId,
        item.question,
        item.answer,
        (item.note ?? '').trim(),
        item.source ?? 'user',
        actorContactId
      );
  })();
  return getQuickAssessment(db, dealId);
}
