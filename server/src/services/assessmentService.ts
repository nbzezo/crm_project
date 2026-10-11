/**
 * Danh gia co hoi theo 4 cau hoi (v70) — khung "Opportunity Assessment".
 *
 * 4 cau hoi x 5 tieu chi = 20 o:
 *   1. Khach co nhu cau THAT?   2. Ta CANH TRANH duoc?
 *   3. Ta CHOT duoc?            4. Co DANG DAU TU khong?
 *
 * Day la lop TONG HOP dat len tren bo may BANT + 4P, khong thay no:
 * - 8 o lay thang tu 8 yeu to da cham (deal_scores) — khong cham lai lan hai.
 * - 9 o la tieu chi moi trong deal_assessments, cham 0–3 khong bat bang chung.
 * - 3 o suy tu du lieu co san (lich su mua, nhom ra quyet dinh, diem 4P).
 *
 * Moi thu o day chi la goi y ho tro: khong chan giai doan, khong dong toi forecast,
 * khong cong vao bant_total/p4_total.
 */
import type { Database } from 'better-sqlite3';
import { isClosedStage } from '../lib/pipeline.ts';
import { HttpError } from '../lib/validate.ts';
import {
  ASSESSMENT_CRITERIA,
  SCORE_FACTORS,
  WORTH_CRITERIA,
  type AssessmentCriterion,
  type DealDecision,
  type Factor,
  type Quadrant,
} from '../lib/crm.ts';

export type AssessmentQuestion = 'need' | 'compete' | 'close' | 'worth';
type DerivedKey = 'existing_relationship' | 'influence' | 'win_likelihood';

type CellSource =
  | { kind: 'factor'; key: Factor }
  | { kind: 'criterion'; key: AssessmentCriterion }
  | { kind: 'derived'; key: DerivedKey };

/** Thu tu va so o theo dung tai lieu goc (slide "Deal Assessment"). */
export const ASSESSMENT_GRID: { no: number; question: AssessmentQuestion; source: CellSource }[] = [
  { no: 1, question: 'need', source: { kind: 'factor', key: 'need' } },
  { no: 2, question: 'need', source: { kind: 'factor', key: 'budget' } },
  { no: 3, question: 'need', source: { kind: 'factor', key: 'authority' } },
  { no: 4, question: 'need', source: { kind: 'criterion', key: 'financial_health' } },
  { no: 5, question: 'need', source: { kind: 'factor', key: 'timeline' } },
  { no: 6, question: 'compete', source: { kind: 'criterion', key: 'resources' } },
  { no: 7, question: 'compete', source: { kind: 'factor', key: 'fit' } },
  { no: 8, question: 'compete', source: { kind: 'factor', key: 'process' } },
  { no: 9, question: 'compete', source: { kind: 'factor', key: 'price' } },
  { no: 10, question: 'compete', source: { kind: 'criterion', key: 'unique_value' } },
  { no: 11, question: 'close', source: { kind: 'factor', key: 'relationship' } },
  { no: 12, question: 'close', source: { kind: 'criterion', key: 'exec_relationship' } },
  { no: 13, question: 'close', source: { kind: 'criterion', key: 'informal_decision' } },
  { no: 14, question: 'close', source: { kind: 'derived', key: 'existing_relationship' } },
  { no: 15, question: 'close', source: { kind: 'derived', key: 'influence' } },
  { no: 16, question: 'worth', source: { kind: 'criterion', key: 'profit' } },
  { no: 17, question: 'worth', source: { kind: 'criterion', key: 'follow_on' } },
  { no: 18, question: 'worth', source: { kind: 'derived', key: 'win_likelihood' } },
  { no: 19, question: 'worth', source: { kind: 'criterion', key: 'delivery_risk' } },
  { no: 20, question: 'worth', source: { kind: 'criterion', key: 'strategic' } },
];

type Level = 'unknown' | 'weak' | 'strong';

interface GridCell {
  no: number;
  question: AssessmentQuestion;
  kind: CellSource['kind'];
  key: string;
  /** Diem da xac nhan (hoac suy ra). null = chua cham. */
  score: number | null;
  /** Diem AI de xuat dang cho xac nhan, neu co. */
  suggested_score: number | null;
  level: Level;
}

interface CriterionRow {
  criterion: AssessmentCriterion;
  score: number;
  status: 'suggested' | 'confirmed';
  note: string;
  updated_at: string;
  updated_by_name: string | null;
}

export type WorthLevel = 'unknown' | 'low' | 'medium' | 'high';

/**
 * Ket luan = o ma tran BANT/4P (that? thang duoc?) + muc "Dang dau tu".
 * Chuoi hien thi nam o giao dien (i18n/assessment.ts).
 */
export type Verdict =
  | 'pursue'
  | 'win_not_worth'
  | 'reshape'
  | 'reshape_invest'
  | 'withdraw'
  | 'nurture'
  | 'nurture_strategic'
  | 'deprioritize'
  | 'disqualify';

interface DecisionRow {
  id: number;
  deal_id: number;
  decision: DealDecision;
  reason: string;
  review_date: string | null;
  author_kind: 'user' | 'ai';
  author_contact_id: number | null;
  author_name: string | null;
  payload: unknown;
  created_at: string;
}

export interface Assessment {
  deal_id: number;
  locked: boolean;
  quadrant: Quadrant;
  bant_total: number;
  p4_total: number;
  criteria: CriterionRow[];
  grid: GridCell[];
  worth_total: number;
  worth_scored: number;
  worth_level: WorthLevel;
  verdict: Verdict;
  decisions: DecisionRow[];
}

/* ---------- Doc ---------- */

function levelOf(score: number | null): Level {
  if (score === null || score === 0) return 'unknown';
  return score === 1 ? 'weak' : 'strong';
}

function dealOf(db: Database, dealId: number) {
  const row = db
    .prepare(
      `SELECT d.id, d.stage, d.customer_id, d.bant_total, d.p4_total, s.quadrant
         FROM deals d JOIN deal_scorecard s ON s.deal_id = d.id WHERE d.id = ?`
    )
    .get(dealId) as
    | {
        id: number;
        stage: string;
        customer_id: number;
        bant_total: number;
        p4_total: number;
        quadrant: Quadrant;
      }
    | undefined;
  if (!row) throw new HttpError(404, 'Khong tim thay co hoi');
  return row;
}

function criteriaOf(db: Database, dealId: number): Map<AssessmentCriterion, CriterionRow> {
  const rows = db
    .prepare(
      `SELECT a.criterion, a.score, a.status, a.note, a.updated_at, c.full_name AS updated_by_name
         FROM deal_assessments a LEFT JOIN contacts c ON c.id = a.updated_by_contact_id
        WHERE a.deal_id = ?`
    )
    .all(dealId) as CriterionRow[];
  return new Map(rows.map((row) => [row.criterion, row]));
}

/** #14 — da tung mua cua ta chua: co hoi thang khac hoac hop dong cua cung khach hang. */
function existingRelationship(db: Database, dealId: number, customerId: number): number {
  const won = (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM deals
          WHERE customer_id = ? AND id <> ?
            AND stage IN (SELECT key FROM pipeline_stages WHERE category = 'won')`
      )
      .get(customerId, dealId) as { n: number }
  ).n;
  const contracts = (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM contracts WHERE customer_id = ? AND (deal_id IS NULL OR deal_id <> ?)`
      )
      .get(customerId, dealId) as { n: number }
  ).n;
  const total = won + contracts;
  if (total >= 2) return 3;
  return total === 1 ? 2 : 1;
}

/** #15 — nguoi co anh huong lon (>= 4/5) co dung ve phia ta khong. */
function influenceConnected(db: Database, dealId: number): number | null {
  const members = db
    .prepare(`SELECT stance, influence FROM deal_committee WHERE deal_id = ?`)
    .all(dealId) as { stance: string; influence: number }[];
  if (members.length === 0) return null;
  const high = members.filter((m) => m.influence >= 4);
  const supportive = high.filter((m) => m.stance === 'supporter' || m.stance === 'mentor');
  const hostile = high.filter((m) => m.stance === 'opposed' || m.stance === 'enemy');
  if (supportive.length === 0) return 1;
  return hostile.length === 0 ? 3 : 2;
}

/** #18 — kha nang thang suy tu truc 4P da cham. */
function winLikelihood(p4Total: number): number | null {
  if (p4Total === 0) return null;
  if (p4Total >= 9) return 3;
  return p4Total >= 7 ? 2 : 1;
}

export function worthLevelOf(criteria: Map<AssessmentCriterion, CriterionRow>): {
  total: number;
  scored: number;
  level: WorthLevel;
} {
  let total = 0;
  let scored = 0;
  for (const key of WORTH_CRITERIA) {
    const row = criteria.get(key);
    if (!row || row.status !== 'confirmed' || row.score === 0) continue;
    total += row.score;
    scored += 1;
  }
  /* Chua cham du 3/5 tieu chi thi chua du co so de noi deal "dang" hay "khong dang". */
  if (scored < 3) return { total, scored, level: 'unknown' };
  const average = total / scored;
  const level = average >= 2 ? 'high' : average < 1.5 ? 'low' : 'medium';
  return { total, scored, level };
}

export function verdictOf(quadrant: Quadrant, worth: WorthLevel): Verdict {
  switch (quadrant) {
    case 'pursue':
      return worth === 'low' ? 'win_not_worth' : 'pursue';
    case 'reshape':
      return worth === 'high' ? 'reshape_invest' : worth === 'low' ? 'withdraw' : 'reshape';
    case 'nurture':
      return worth === 'high' ? 'nurture_strategic' : worth === 'low' ? 'deprioritize' : 'nurture';
    default:
      return 'disqualify';
  }
}

function decisionsOf(db: Database, dealId: number): DecisionRow[] {
  const rows = db
    .prepare(
      `SELECT d.id, d.deal_id, d.decision, d.reason, d.review_date, d.author_kind,
              d.author_contact_id, c.full_name AS author_name, d.payload, d.created_at
         FROM deal_decisions d LEFT JOIN contacts c ON c.id = d.author_contact_id
        WHERE d.deal_id = ?
        ORDER BY d.created_at DESC, d.id DESC LIMIT 50`
    )
    .all(dealId) as (Omit<DecisionRow, 'payload'> & { payload: string | null })[];
  return rows.map((row) => {
    let payload: unknown = null;
    if (row.payload) {
      try {
        payload = JSON.parse(row.payload);
      } catch {
        payload = null;
      }
    }
    return { ...row, payload };
  });
}

export function getAssessment(db: Database, dealId: number): Assessment {
  const deal = dealOf(db, dealId);
  const criteria = criteriaOf(db, dealId);
  const factorRows = new Map(
    (
      db.prepare(`SELECT factor, score, status FROM deal_scores WHERE deal_id = ?`).all(dealId) as {
        factor: Factor;
        score: number;
        status: 'suggested' | 'confirmed';
      }[]
    ).map((row) => [row.factor, row])
  );

  const derived: Record<DerivedKey, number | null> = {
    existing_relationship: existingRelationship(db, dealId, deal.customer_id),
    influence: influenceConnected(db, dealId),
    win_likelihood: winLikelihood(deal.p4_total),
  };

  const grid: GridCell[] = ASSESSMENT_GRID.map(({ no, question, source }) => {
    let score: number | null = null;
    let suggested: number | null = null;
    if (source.kind === 'derived') {
      score = derived[source.key];
    } else {
      const row = source.kind === 'factor' ? factorRows.get(source.key) : criteria.get(source.key);
      if (row?.status === 'confirmed') score = row.score;
      else if (row) suggested = row.score;
    }
    return {
      no,
      question,
      kind: source.kind,
      key: source.key,
      score,
      suggested_score: suggested,
      level: levelOf(score),
    };
  });

  const worth = worthLevelOf(criteria);
  return {
    deal_id: dealId,
    locked: isClosedStage(db, deal.stage),
    quadrant: deal.quadrant,
    bant_total: deal.bant_total,
    p4_total: deal.p4_total,
    criteria: ASSESSMENT_CRITERIA.flatMap((key) => {
      const row = criteria.get(key);
      return row ? [row] : [];
    }),
    grid,
    worth_total: worth.total,
    worth_scored: worth.scored,
    worth_level: worth.level,
    verdict: verdictOf(deal.quadrant, worth.level),
    decisions: decisionsOf(db, dealId),
  };
}

/* ---------- Ghi ---------- */

function assertOpen(db: Database, dealId: number): void {
  if (isClosedStage(db, dealOf(db, dealId).stage))
    throw new HttpError(409, 'Co hoi da chot nen danh gia chi doc', { code: 'ASSESSMENT_LOCKED' });
}

export function writeCriterion(
  db: Database,
  dealId: number,
  criterion: AssessmentCriterion,
  input: { score: number; note?: string; status?: 'suggested' | 'confirmed' },
  actorContactId: number | null
): Assessment {
  assertOpen(db, dealId);
  const current = criteriaOf(db, dealId).get(criterion);
  db.prepare(
    `INSERT INTO deal_assessments (deal_id, criterion, score, status, note, updated_by_contact_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now','localtime'))
     ON CONFLICT(deal_id, criterion) DO UPDATE SET
       score = excluded.score, status = excluded.status, note = excluded.note,
       updated_by_contact_id = excluded.updated_by_contact_id, updated_at = excluded.updated_at`
  ).run(
    dealId,
    criterion,
    input.score,
    input.status ?? 'confirmed',
    (input.note ?? current?.note ?? '').trim(),
    actorContactId
  );
  return getAssessment(db, dealId);
}

export function confirmCriterion(
  db: Database,
  dealId: number,
  criterion: AssessmentCriterion,
  actorContactId: number | null
): Assessment {
  const row = criteriaOf(db, dealId).get(criterion);
  if (!row) throw new HttpError(404, 'Tieu chi nay chua duoc cham');
  if (row.status === 'confirmed') return getAssessment(db, dealId);
  return writeCriterion(
    db,
    dealId,
    criterion,
    { score: row.score, note: row.note },
    actorContactId
  );
}

export function addDecision(
  db: Database,
  dealId: number,
  input: { decision: DealDecision; reason?: string; review_date?: string | null; remind?: boolean },
  actorContactId: number | null
): Assessment {
  assertOpen(db, dealId);
  const reviewDate = input.review_date || null;
  db.transaction(() => {
    db.prepare(
      `INSERT INTO deal_decisions (deal_id, decision, reason, review_date, author_kind, author_contact_id)
       VALUES (?, ?, ?, ?, 'user', ?)`
    ).run(dealId, input.decision, (input.reason ?? '').trim(), reviewDate, actorContactId);

    /* Ngay xet lai di qua module Nhac hen da co — khong dung lich rieng. */
    if (input.remind && reviewDate) {
      const deal = db.prepare(`SELECT title, customer_id FROM deals WHERE id = ?`).get(dealId) as {
        title: string;
        customer_id: number;
      };
      db.prepare(
        `INSERT INTO reminders (title, note, due_at, customer_id, deal_id, owner_contact_id)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        `Xem lại cơ hội: ${deal.title}`,
        'Đến ngày xét lại quyết định Theo / Tạm dừng / Rút của cơ hội này.',
        `${reviewDate}T09:00`,
        deal.customer_id,
        dealId,
        actorContactId
      );
    }
  })();
  return getAssessment(db, dealId);
}

/** Xoa duoc quyet dinh cua chinh minh va nhan dinh AI; khong xoa quyet dinh cua nguoi khac. */
export function deleteDecision(
  db: Database,
  dealId: number,
  decisionId: number,
  actorContactId: number | null
): Assessment {
  const row = db
    .prepare(
      `SELECT author_kind, author_contact_id FROM deal_decisions WHERE id = ? AND deal_id = ?`
    )
    .get(decisionId, dealId) as
    { author_kind: 'user' | 'ai'; author_contact_id: number | null } | undefined;
  if (!row) throw new HttpError(404, 'Khong tim thay quyet dinh');
  if (row.author_kind === 'user' && row.author_contact_id !== actorContactId)
    throw new HttpError(403, 'Chỉ xóa được quyết định do chính bạn ghi');
  db.prepare(`DELETE FROM deal_decisions WHERE id = ?`).run(decisionId);
  return getAssessment(db, dealId);
}

/* ---------- Nhan dinh AI ---------- */

export interface AiReview {
  summary: string;
  recommendation: DealDecision;
  criteria: { key: string; score: number; reason: string }[];
  factors: { key: string; score: number; reason: string }[];
  unknowns: { cell: number; question: string }[];
  risks: string[];
  actions: string[];
}

/**
 * Luu nhan dinh AI vao nhat ky va dien diem DE XUAT cho tieu chi chua co diem nguoi
 * cham. Khong bao gio ghi de diem nguoi dung da xac nhan; diem 8 yeu to BANT/4P chi
 * nam trong payload de tham khao (bo may do doi bang chung that).
 */
export function saveAiReview(
  db: Database,
  dealId: number,
  review: AiReview,
  actorContactId: number | null
): Assessment {
  const criteria = criteriaOf(db, dealId);
  const clean: AiReview = {
    ...review,
    criteria: review.criteria.filter((c) =>
      (ASSESSMENT_CRITERIA as readonly string[]).includes(c.key)
    ),
    factors: review.factors.filter((f) => (SCORE_FACTORS as readonly string[]).includes(f.key)),
    unknowns: review.unknowns.filter((u) => u.cell >= 1 && u.cell <= 20),
  };
  const locked = isClosedStage(db, dealOf(db, dealId).stage);

  db.transaction(() => {
    if (!locked) {
      const suggest = db.prepare(
        `INSERT INTO deal_assessments (deal_id, criterion, score, status, note, updated_by_contact_id, updated_at)
         VALUES (?, ?, ?, 'suggested', ?, NULL, datetime('now','localtime'))
         ON CONFLICT(deal_id, criterion) DO UPDATE SET
           score = excluded.score, note = excluded.note, updated_at = excluded.updated_at
         WHERE deal_assessments.status = 'suggested'`
      );
      for (const item of clean.criteria) {
        if (criteria.get(item.key as AssessmentCriterion)?.status === 'confirmed') continue;
        suggest.run(dealId, item.key, item.score, `AI: ${item.reason}`.slice(0, 2000));
      }
    }
    db.prepare(
      `INSERT INTO deal_decisions (deal_id, decision, reason, author_kind, author_contact_id, payload)
       VALUES (?, ?, ?, 'ai', ?, ?)`
    ).run(
      dealId,
      clean.recommendation,
      clean.summary.slice(0, 4000),
      actorContactId,
      JSON.stringify(clean)
    );
  })();
  return getAssessment(db, dealId);
}
