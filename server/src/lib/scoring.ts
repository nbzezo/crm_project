/**
 * Bo may cham diem co hoi B2B theo BANT + 4P (v10).
 *
 * Ba nguyen tac chi phoi toan bo tep nay:
 *
 * 1. KHONG SUY DOAN. Diem >= 1 phai co bang chung; diem cao nhat cua moi yeu to
 *    con bi rang buoc boi du lieu co that (BR-SCR-01..08) — khong co su kien bat buoc
 *    duoc khach xac nhan thi khong cham TIMELINE = 3 duoc, du nguoi dung muon.
 * 2. DU LIEU DAN XUAT TINH KHI DOC. O ma tran, tuoi diem va ba co veto nam trong
 *    VIEW deal_scorecard, khong luu thanh cot.
 * 3. KHONG CHAM VAO deals.probability. Xac suat theo giai doan va diem chat luong
 *    la hai chi so doc lap; chenh lech giua chung chinh la muc thoi phong pipeline.
 *
 * Moi ham deu nhan `db` lam tham so de test duoc voi CSDL trong bo nho.
 */
import type { Database } from 'better-sqlite3';
import { HttpError } from './validate.ts';
import {
  BANT_FACTORS,
  COMMITTEE_RECENT_DAYS,
  ECONOMIC_ROLES,
  EVIDENCE_MIN_LENGTH,
  QUADRANT_CUTOFF,
  SCORE_FACTORS,
  SCORING_DEFAULTS,
  axisOf,
  isClosed,
  type Factor,
  type Quadrant,
  type Stage,
  type VetoCode,
} from './crm.ts';

/* ---------- Kieu du lieu ---------- */

export interface ScoreRow {
  factor: Factor;
  score: number;
  status: 'suggested' | 'confirmed';
  evidence: string;
  source_type: string | null;
  source_id: number | null;
  verified: number;
  challenge: string;
  scored_at: string | null;
}

export interface ScoreItem extends ScoreRow {
  axis: 'bant' | 'p4';
  /** Diem toi da hien tai cho phep boi du lieu (BR-SCR-01..08); 3 = khong bi chan. */
  max_allowed: number;
  /** Ma viec can lam de go tran diem, null neu khong bi chan. */
  blocked_by: string | null;
}

export interface VetoFlag {
  code: VetoCode;
  /** true = chan forecast; false = chi canh bao (V3 o che do 'warn'). */
  blocking: boolean;
}

export interface Recommendation {
  /** Ma dung de dich sang cau chu o i18n phia giao dien. */
  code: 'veto' | 'lift_factor' | 'reverify';
  factor: Factor | null;
  veto_code: VetoCode | null;
}

export interface Scorecard {
  deal_id: number;
  stage: Stage;
  locked: boolean;
  items: ScoreItem[];
  bant_total: number;
  p4_total: number;
  quadrant: Quadrant;
  /** Khoang cach toi nguong lat o — de nguoi dung biet minh dang sat ranh gioi (C10). */
  distance_to_boundary: { bant: number; p4: number };
  score_age_days: number | null;
  stale: boolean;
  veto: VetoFlag[];
  forecast_eligible: boolean;
  /** So yeu to da cham (score >= 1) — di kem confidence, khong gop lam mot. */
  scored_count: number;
  verified_count: number;
  /** verified / scored_count. null khi chua cham yeu to nao. */
  confidence: number | null;
  challenge_required: boolean;
  recommendations: Recommendation[];
}

export interface ScoringSettings {
  stageGate: Partial<Record<Stage, number>>;
  staleDays: number;
  v3Mode: 'warn' | 'veto';
  challengeThresholdVnd: number;
  winlossMinDeals: number;
}

/* ---------- Cau hinh ---------- */

export function getScoringSettings(db: Database): ScoringSettings {
  const rows = db
    .prepare(`SELECT key, value FROM app_settings WHERE key LIKE 'scoring.%'`)
    .all() as { key: string; value: string }[];
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const num = (key: string, fallback: number): number => {
    const n = Number(map.get(key));
    return Number.isFinite(n) ? n : fallback;
  };

  let stageGate = SCORING_DEFAULTS.stageGate;
  try {
    const raw = map.get('scoring.stage_gate');
    if (raw) stageGate = JSON.parse(raw) as Partial<Record<Stage, number>>;
  } catch {
    /* cau hinh hong thi dung mac dinh */
  }

  return {
    stageGate,
    staleDays: num('scoring.stale_days', SCORING_DEFAULTS.staleDays),
    v3Mode: map.get('scoring.v3_mode') === 'veto' ? 'veto' : 'warn',
    challengeThresholdVnd: num(
      'scoring.challenge_threshold_vnd',
      SCORING_DEFAULTS.challengeThresholdVnd
    ),
    winlossMinDeals: num('scoring.winloss_min_deals', SCORING_DEFAULTS.winlossMinDeals),
  };
}

export function saveScoringSettings(db: Database, patch: Record<string, unknown>): void {
  const upsert = db.prepare(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, datetime('now','localtime'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  );
  db.transaction(() => {
    for (const [key, value] of Object.entries(patch)) {
      upsert.run(`scoring.${key}`, typeof value === 'string' ? value : JSON.stringify(value));
    }
  })();
}

/* ---------- Doc du lieu nen ---------- */

interface DealRow {
  id: number;
  stage: Stage;
  value_vnd: number;
  expected_close_date: string | null;
  bant_total: number;
  p4_total: number;
  score_updated_at: string | null;
}

export function getDeal(db: Database, dealId: number): DealRow {
  const row = db
    .prepare(
      `SELECT id, stage, value_vnd, expected_close_date, bant_total, p4_total, score_updated_at
         FROM deals WHERE id = ?`
    )
    .get(dealId) as DealRow | undefined;
  if (!row) throw new HttpError(404, 'Khong tim thay co hoi');
  return row;
}

export function getScoreRows(db: Database, dealId: number): Map<Factor, ScoreRow> {
  const rows = db
    .prepare(
      `SELECT factor, score, status, evidence, source_type, source_id, verified, challenge, scored_at
         FROM deal_scores WHERE deal_id = ?`
    )
    .all(dealId) as ScoreRow[];
  return new Map(rows.map((r) => [r.factor, r]));
}

export interface CommitteeMember {
  contact_id: number;
  full_name: string;
  title: string | null;
  role: string | null;
  stance: string;
  is_champion: number;
  influence: number;
  note: string;
  /** Tinh tu interactions — khong luu thanh cot de tranh nguon su that thu hai. */
  last_contact_at: string | null;
}

export function getCommittee(db: Database, dealId: number): CommitteeMember[] {
  return db
    .prepare(
      `SELECT m.contact_id, c.full_name, c.title, m.stance, m.is_champion, m.influence, m.note,
              COALESCE(m.role_override, c.buying_role) AS role,
              (SELECT MAX(substr(i.occurred_at, 1, 10)) FROM interactions i
                WHERE i.contact_id = m.contact_id AND (i.deal_id = ? OR i.deal_id IS NULL))
                AS last_contact_at
         FROM deal_committee m JOIN contacts c ON c.id = m.contact_id
        WHERE m.deal_id = ?
        ORDER BY m.influence DESC, c.full_name`
    )
    .all(dealId, dealId) as CommitteeMember[];
}

export interface DealEvent {
  id: number;
  deal_id: number;
  event_type: string;
  description: string;
  event_date: string | null;
  confirmed: number;
  is_primary: number;
}

export function getEvents(db: Database, dealId: number): DealEvent[] {
  return db
    .prepare(
      `SELECT id, deal_id, event_type, description, event_date, confirmed, is_primary
         FROM deal_events WHERE deal_id = ? ORDER BY is_primary DESC, event_date`
    )
    .all(dealId) as DealEvent[];
}

export interface DealCompetitor {
  id: number;
  deal_id: number;
  name: string;
  incumbent: number;
  shaped_requirements: number;
  price_position: string;
  note: string;
}

export function getCompetitors(db: Database, dealId: number): DealCompetitor[] {
  return db
    .prepare(
      `SELECT id, deal_id, name, incumbent, shaped_requirements, price_position, note
         FROM deal_competitors WHERE deal_id = ? ORDER BY incumbent DESC, id`
    )
    .all(dealId) as DealCompetitor[];
}

/* ---------- BR-SCR-01..08: rang buoc cheo giua rubric va du lieu ---------- */

/**
 * Tran diem cua tung yeu to theo du lieu co that.
 *
 * Day la phan bien rubric tu ban mo ta thanh rang buoc. Khong co no, moi deal
 * deu se la 9-10 diem truoc ky bao cao.
 *
 * Tra ve { max, blocked_by } — `blocked_by` la ma viec can lam, giao dien dich sang
 * cau chu va dan nguoi dung toi dung tab can sua.
 */
export function factorCeiling(
  db: Database,
  dealId: number,
  factor: Factor
): { max: number; blocked_by: string | null } {
  const one = (sql: string, ...params: unknown[]): number =>
    (db.prepare(sql).get(...params) as { n: number }).n ?? 0;

  switch (factor) {
    case 'timeline': {
      // BR-SCR-01 / BR-SCR-02: khong co su kien bat buoc thi khong the biet deal chot khi nao
      const confirmed = one(
        `SELECT COUNT(*) AS n FROM deal_events
          WHERE deal_id = ? AND confirmed = 1 AND event_date IS NOT NULL`,
        dealId
      );
      if (confirmed > 0) return { max: 3, blocked_by: null };
      const any = one(`SELECT COUNT(*) AS n FROM deal_events WHERE deal_id = ?`, dealId);
      if (any > 0) return { max: 2, blocked_by: 'event_unconfirmed' };
      return { max: 1, blocked_by: 'event_missing' };
    }

    case 'authority': {
      // BR-SCR-03: cham 3 doi da gap nguoi co quyen chi tien
      const economicMet = one(
        `SELECT COUNT(*) AS n FROM deal_committee m JOIN contacts c ON c.id = m.contact_id
          WHERE m.deal_id = ?
            AND COALESCE(m.role_override, c.buying_role) IN (${ECONOMIC_ROLES.map(() => '?').join(',')})
            AND EXISTS (SELECT 1 FROM interactions i
                         WHERE i.contact_id = m.contact_id AND (i.deal_id = ? OR i.deal_id IS NULL))`,
        dealId,
        ...ECONOMIC_ROLES,
        dealId
      );
      if (economicMet > 0) return { max: 3, blocked_by: null };
      // BR-SCR-04: cham 2 doi da lap ban do >= 3 vai tro khac nhau
      const roles = one(
        `SELECT COUNT(DISTINCT COALESCE(m.role_override, c.buying_role)) AS n
           FROM deal_committee m JOIN contacts c ON c.id = m.contact_id
          WHERE m.deal_id = ? AND COALESCE(m.role_override, c.buying_role) IS NOT NULL`,
        dealId
      );
      if (roles >= 3) return { max: 2, blocked_by: 'economic_buyer_missing' };
      return { max: 1, blocked_by: 'committee_thin' };
    }

    case 'relationship': {
      // BR-SCR-05: 0 = single-threaded, nen cham >= 1 doi it nhat 2 nguoi
      const members = one(`SELECT COUNT(*) AS n FROM deal_committee WHERE deal_id = ?`, dealId);
      if (members < 2) return { max: members === 0 ? 0 : 1, blocked_by: 'single_threaded' };

      const champion = one(
        `SELECT COUNT(*) AS n FROM deal_committee
          WHERE deal_id = ? AND is_champion = 1 AND stance = 'supporter'`,
        dealId
      );
      if (champion === 0) return { max: 1, blocked_by: 'champion_missing' };

      const recent = one(
        `SELECT COUNT(*) AS n FROM deal_committee m
          WHERE m.deal_id = ?
            AND (SELECT MAX(substr(i.occurred_at, 1, 10)) FROM interactions i
                  WHERE i.contact_id = m.contact_id AND (i.deal_id = ? OR i.deal_id IS NULL))
                >= date('now','localtime',?)`,
        dealId,
        dealId,
        `-${COMMITTEE_RECENT_DAYS} days`
      );
      if (recent * 2 < members) return { max: 1, blocked_by: 'coverage_thin' };

      // Cham 3 doi khong con nguoi phan doi co anh huong lon
      const blocker = one(
        `SELECT COUNT(*) AS n FROM deal_committee
          WHERE deal_id = ? AND stance = 'opposed' AND influence >= 4`,
        dealId
      );
      return blocker > 0 ? { max: 2, blocked_by: 'blocker_present' } : { max: 3, blocked_by: null };
    }

    case 'process': {
      // BR-SCR-06: tieu chi do doi thu soan thi theo rubric PROCESS bat buoc bang 0
      const shaped = one(
        `SELECT COUNT(*) AS n FROM deal_competitors WHERE deal_id = ? AND shaped_requirements = 1`,
        dealId
      );
      return shaped > 0
        ? { max: 0, blocked_by: 'competitor_shaped' }
        : { max: 3, blocked_by: null };
    }

    case 'price': {
      // BR-SCR-07: khong biet mat bang gia thi theo rubric la 0
      const known = one(
        `SELECT COUNT(*) AS n FROM deal_competitors
          WHERE deal_id = ? AND price_position <> 'unknown'`,
        dealId
      );
      return known > 0 ? { max: 3, blocked_by: null } : { max: 0, blocked_by: 'price_unknown' };
    }

    default:
      return { max: 3, blocked_by: null };
  }
}

/** BR-SCR-08: NEED = 3 doi pain da luong hoa — o bang chung phai co con so. */
function needsNumber(factor: Factor, score: number, evidence: string): boolean {
  return factor === 'need' && score === 3 && !/\d/.test(evidence);
}

/* ---------- Tinh tong, o ma tran, veto ---------- */

/**
 * Chi cong yeu to da xac nhan: diem `suggested` khong duoc vao tong (BR-SCR-09).
 *
 * `touch` = false khi lan ghi khong phai la mot lan cham that (vi du chi luu de xuat),
 * de dong ho staleness khong bi lam moi oan.
 */
export function recalcTotals(
  db: Database,
  dealId: number,
  touch = true
): { bant: number; p4: number } {
  const rows = db
    .prepare(`SELECT factor, score FROM deal_scores WHERE deal_id = ? AND status = 'confirmed'`)
    .all(dealId) as { factor: Factor; score: number }[];
  let bant = 0;
  let p4 = 0;
  for (const row of rows) {
    if (axisOf(row.factor) === 'bant') bant += row.score;
    else p4 += row.score;
  }
  db.prepare(
    `UPDATE deals SET bant_total = ?, p4_total = ?,
            score_updated_at = ${touch ? `datetime('now','localtime')` : 'score_updated_at'}
      WHERE id = ?`
  ).run(bant, p4, dealId);
  return { bant, p4 };
}

export function quadrantOf(bant: number, p4: number): Quadrant {
  if (bant >= QUADRANT_CUTOFF && p4 >= QUADRANT_CUTOFF) return 'pursue';
  if (bant >= QUADRANT_CUTOFF) return 'reshape';
  if (p4 >= QUADRANT_CUTOFF) return 'nurture';
  return 'disqualify';
}

interface ScorecardViewRow {
  deal_id: number;
  bant_total: number;
  p4_total: number;
  quadrant: Quadrant;
  score_age_days: number | null;
  v1_no_event: number;
  v2_no_economic: number;
  v3_shaped: number;
}

export function readScorecardView(db: Database, dealId: number): ScorecardViewRow {
  const row = db.prepare(`SELECT * FROM deal_scorecard WHERE deal_id = ?`).get(dealId) as
    ScorecardViewRow | undefined;
  if (!row) throw new HttpError(404, 'Khong tim thay co hoi');
  return row;
}

export function vetoFlagsOf(row: ScorecardViewRow, settings: ScoringSettings): VetoFlag[] {
  const flags: VetoFlag[] = [];
  if (row.v1_no_event) flags.push({ code: 'V1_NO_COMPELLING_EVENT', blocking: true });
  if (row.v2_no_economic) flags.push({ code: 'V2_NO_ECONOMIC_BUYER', blocking: true });
  // V3 mac dinh chi canh bao: truc 4P (yeu to PROCESS) da do vi the canh tranh roi
  if (row.v3_shaped)
    flags.push({ code: 'V3_COMPETITOR_SHAPED', blocking: settings.v3Mode === 'veto' });
  return flags;
}

/* ---------- Scorecard day du ---------- */

export function getScorecard(db: Database, dealId: number): Scorecard {
  const deal = getDeal(db, dealId);
  const settings = getScoringSettings(db);
  const view = readScorecardView(db, dealId);
  const rows = getScoreRows(db, dealId);

  const items: ScoreItem[] = SCORE_FACTORS.map((factor) => {
    const row = rows.get(factor);
    const ceiling = factorCeiling(db, dealId, factor);
    return {
      factor,
      axis: axisOf(factor),
      score: row?.score ?? 0,
      status: row?.status ?? 'confirmed',
      evidence: row?.evidence ?? '',
      source_type: row?.source_type ?? null,
      source_id: row?.source_id ?? null,
      verified: row?.verified ?? 0,
      challenge: row?.challenge ?? '',
      scored_at: row?.scored_at ?? null,
      max_allowed: ceiling.max,
      blocked_by: ceiling.blocked_by,
    };
  });

  const confirmed = items.filter((i) => i.status === 'confirmed');
  const scoredCount = confirmed.filter((i) => i.score >= 1).length;
  const verifiedCount = confirmed.filter((i) => i.score >= 1 && i.verified === 1).length;
  const veto = vetoFlagsOf(view, settings);
  const stale = view.score_age_days !== null && view.score_age_days > settings.staleDays;

  return {
    deal_id: dealId,
    stage: deal.stage,
    locked: isClosed(deal.stage),
    items,
    bant_total: view.bant_total,
    p4_total: view.p4_total,
    quadrant: view.quadrant,
    distance_to_boundary: {
      bant: view.bant_total - QUADRANT_CUTOFF,
      p4: view.p4_total - QUADRANT_CUTOFF,
    },
    score_age_days: view.score_age_days,
    stale,
    veto,
    forecast_eligible: !veto.some((f) => f.blocking) && !stale,
    scored_count: scoredCount,
    verified_count: verifiedCount,
    // C6: confidence do do TIN CAY cua nhung gi da cham, khong phat deal vi chua cham xong
    confidence: scoredCount === 0 ? null : Number((verifiedCount / scoredCount).toFixed(2)),
    challenge_required: deal.value_vnd >= settings.challengeThresholdVnd,
    recommendations: recommendationsOf(items, veto, stale),
  };
}

/**
 * F-15: toi da 3 de xuat, uu tien theo thu tu — go veto truoc, roi den yeu to co
 * don bay lon nhat, cuoi cung la yeu to can xac thuc lai.
 */
export function recommendationsOf(
  items: ScoreItem[],
  veto: VetoFlag[],
  stale: boolean
): Recommendation[] {
  const out: Recommendation[] = [];

  for (const flag of veto.filter((f) => f.blocking)) {
    out.push({ code: 'veto', factor: null, veto_code: flag.code });
  }

  const liftable = items
    .filter((i) => i.score <= 1 && i.max_allowed > i.score)
    .sort((a, b) => b.max_allowed - b.score - (a.max_allowed - a.score));
  for (const item of liftable) {
    if (out.length >= 3) break;
    out.push({ code: 'lift_factor', factor: item.factor, veto_code: null });
  }

  if (out.length < 3 && stale) {
    const unverified = items.find((i) => i.score >= 1 && i.verified === 0);
    if (unverified) out.push({ code: 'reverify', factor: unverified.factor, veto_code: null });
  }

  return out.slice(0, 3);
}

/* ---------- Ghi diem ---------- */

export interface WriteScoreInput {
  score: number;
  evidence: string;
  status?: 'suggested' | 'confirmed';
  source_type?: string | null;
  source_id?: number | null;
  challenge?: string;
  reason?: string;
}

export function writeScore(
  db: Database,
  dealId: number,
  factor: Factor,
  input: WriteScoreInput
): Scorecard {
  const deal = getDeal(db, dealId);
  // BR-SCR-10: diem cua deal da chot chi doc
  if (isClosed(deal.stage))
    throw new HttpError(409, 'Co hoi da chot nen diem chi doc', { code: 'SCORE_LOCKED' });

  const evidence = (input.evidence ?? '').trim();
  const status = input.status ?? 'confirmed';

  if (input.score >= 1 && evidence.length < EVIDENCE_MIN_LENGTH)
    throw new HttpError(422, `Bang chung phai tu ${EVIDENCE_MIN_LENGTH} ky tu tro len`, {
      code: 'EVIDENCE_TOO_SHORT',
      min_length: EVIDENCE_MIN_LENGTH,
    });
  if (evidence.length > 1000)
    throw new HttpError(422, 'Bang chung toi da 1000 ky tu', { code: 'EVIDENCE_TOO_LONG' });

  const ceiling = factorCeiling(db, dealId, factor);
  if (input.score > ceiling.max)
    throw new HttpError(422, 'Chua du du lieu de cham muc diem nay', {
      code: 'FACTOR_CEILING',
      factor,
      max_allowed: ceiling.max,
      blocked_by: ceiling.blocked_by,
    });

  if (needsNumber(factor, input.score, evidence))
    throw new HttpError(422, 'Cham NEED = 3 thi bang chung phai co con so luong hoa', {
      code: 'NEED_NOT_QUANTIFIED',
      factor,
      max_allowed: 2,
      blocked_by: 'pain_not_quantified',
    });

  const settings = getScoringSettings(db);
  const challenge = (input.challenge ?? '').trim();
  if (
    deal.value_vnd >= settings.challengeThresholdVnd &&
    axisOf(factor) === 'p4' &&
    input.score >= 2 &&
    status === 'confirmed' &&
    challenge.length < EVIDENCE_MIN_LENGTH
  )
    throw new HttpError(422, 'Deal lon: cham 4P tu 2 diem tro len phai tra loi cau phan bien', {
      code: 'CHALLENGE_REQUIRED',
      factor,
    });

  const sourceType = input.source_type ?? null;
  const sourceId = input.source_id ?? null;
  if (sourceType && sourceType !== 'manual' && sourceId)
    assertSource(db, dealId, sourceType, sourceId);
  const verified = sourceType && sourceType !== 'manual' && sourceId ? 1 : 0;

  const previous = getScoreRows(db, dealId).get(factor);

  db.transaction(() => {
    db.prepare(
      `INSERT INTO deal_scores
         (deal_id, factor, score, status, evidence, source_type, source_id, verified, challenge, scored_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))
       ON CONFLICT(deal_id, factor) DO UPDATE SET
         score = excluded.score, status = excluded.status, evidence = excluded.evidence,
         source_type = excluded.source_type, source_id = excluded.source_id,
         verified = excluded.verified, challenge = excluded.challenge, scored_at = excluded.scored_at`
    ).run(dealId, factor, input.score, status, evidence, sourceType, sourceId, verified, challenge);

    recalcTotals(db, dealId, status === 'confirmed');

    db.prepare(
      `INSERT INTO deal_score_history (deal_id, factor, old_score, new_score, reason)
       VALUES (?, ?, ?, ?, ?)`
    ).run(dealId, factor, previous?.score ?? null, input.score, input.reason ?? '');
  })();

  return getScorecard(db, dealId);
}

/** Nguon bang chung phai thuoc dung co hoi nay — khong cho tro toi hoat dong cua deal khac. */
function assertSource(db: Database, dealId: number, sourceType: string, sourceId: number): void {
  const table = sourceType === 'interaction' ? 'interactions' : 'documents';
  const row = db.prepare(`SELECT deal_id FROM ${table} WHERE id = ?`).get(sourceId) as
    { deal_id: number | null } | undefined;
  if (!row) throw new HttpError(404, 'Khong tim thay nguon bang chung');
  if (row.deal_id !== dealId)
    throw new HttpError(422, 'Nguon bang chung khong thuoc co hoi nay', {
      code: 'SOURCE_MISMATCH',
    });
}

/** Doi diem de xuat thanh diem chinh thuc (FR-SCR-31). */
export function confirmScore(db: Database, dealId: number, factor: Factor): Scorecard {
  const row = getScoreRows(db, dealId).get(factor);
  if (!row) throw new HttpError(404, 'Yeu to nay chua duoc cham');
  if (row.status === 'confirmed') return getScorecard(db, dealId);
  return writeScore(db, dealId, factor, {
    score: row.score,
    evidence: row.evidence,
    status: 'confirmed',
    source_type: row.source_type,
    source_id: row.source_id,
    challenge: row.challenge,
    reason: 'xac nhan diem de xuat',
  });
}

/**
 * C5: nguon bang chung bi xoa thi diem GIU NGUYEN nhung mat dau da xac thuc.
 * Goi tu route xoa hoat dong / tai lieu.
 */
export function unverifyBySource(db: Database, sourceType: string, sourceId: number): void {
  const rows = db
    .prepare(
      `SELECT deal_id, factor, score FROM deal_scores
        WHERE source_type = ? AND source_id = ? AND verified = 1`
    )
    .all(sourceType, sourceId) as { deal_id: number; factor: Factor; score: number }[];
  if (rows.length === 0) return;

  const clear = db.prepare(
    `UPDATE deal_scores SET verified = 0, source_type = NULL, source_id = NULL
      WHERE deal_id = ? AND factor = ?`
  );
  const log = db.prepare(
    `INSERT INTO deal_score_history (deal_id, factor, old_score, new_score, reason)
     VALUES (?, ?, ?, ?, 'nguon bang chung da bi xoa')`
  );
  db.transaction(() => {
    for (const row of rows) {
      clear.run(row.deal_id, row.factor);
      log.run(row.deal_id, row.factor, row.score, row.score);
    }
  })();
}

/* ---------- Cong giai doan (F-04) ---------- */

export interface GateResult {
  ok: boolean;
  required: number | null;
  bant_total: number;
  /** Ma cac viec dang thieu: yeu to co the nang diem + veto dang chan. */
  blocked_by: string[];
}

export function checkStageGate(db: Database, dealId: number, target: Stage): GateResult {
  const settings = getScoringSettings(db);
  const required = settings.stageGate[target] ?? null;
  const view = readScorecardView(db, dealId);

  // C17: keo sang That bai KHONG BAO GIO bi chan — neu khong se khong dong duoc deal xau
  if (target === 'lost' || required === null)
    return { ok: true, required, bant_total: view.bant_total, blocked_by: [] };

  const blocked: string[] = [];
  if (view.bant_total < required) {
    for (const factor of BANT_FACTORS) {
      const ceiling = factorCeiling(db, dealId, factor);
      const current =
        (
          db
            .prepare(`SELECT score FROM deal_scores WHERE deal_id = ? AND factor = ?`)
            .get(dealId, factor) as { score: number } | undefined
        )?.score ?? 0;
      if (current < ceiling.max) blocked.push(`factor:${factor}`);
    }
  }
  // Vao Dam phan ma chua tiep can nguoi co quyen chi tien thi khong phai dam phan
  if (target === 'negotiating' && view.v2_no_economic) blocked.push('veto:V2_NO_ECONOMIC_BUYER');

  const ok = view.bant_total >= required && !(target === 'negotiating' && view.v2_no_economic);
  return { ok, required, bant_total: view.bant_total, blocked_by: blocked };
}

/** C12: chup diem ngay khi chot de F-10/F-16 khong phai dung lai tu lich su. */
export function snapshotScores(db: Database, dealId: number): void {
  const card = getScorecard(db, dealId);
  const takenAt = (db.prepare(`SELECT datetime('now','localtime') AS t`).get() as { t: string }).t;
  const snapshot = {
    taken_at: takenAt,
    bant_total: card.bant_total,
    p4_total: card.p4_total,
    quadrant: card.quadrant,
    confidence: card.confidence,
    veto: card.veto.map((v) => v.code),
    scores: Object.fromEntries(
      card.items.map((i) => [i.factor, { score: i.score, verified: i.verified }])
    ),
  };
  db.prepare(`UPDATE deals SET score_snapshot = ? WHERE id = ?`).run(
    JSON.stringify(snapshot),
    dealId
  );
}
