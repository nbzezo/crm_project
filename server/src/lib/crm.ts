/** Hang so nghiep vu CRM theo BRD. */

export const STAGES = [
  'lead',
  'approaching',
  'discussing',
  'quoted',
  'negotiating',
  'won',
  'lost',
] as const;
export type Stage = (typeof STAGES)[number];

/** Xac suat goi y theo giai doan (FR-OPP-03). */
export const STAGE_PROBABILITY: Record<Stage, number> = {
  lead: 10,
  approaching: 20,
  discussing: 40,
  quoted: 60,
  negotiating: 80,
  won: 100,
  lost: 0,
};

export const OPEN_STAGES = STAGES.filter((s) => s !== 'won' && s !== 'lost');

export function isClosed(stage: Stage): boolean {
  return stage === 'won' || stage === 'lost';
}

export const LOST_REASONS = [
  'price',
  'competitor',
  'no_budget',
  'project_stopped',
  'solution_mismatch',
  'requirement_unmet',
  'no_contact',
  'bad_timing',
  'self_build',
  'other',
] as const;

export const CONTRACT_STATUSES = ['draft', 'signing', 'active', 'expired', 'terminated'] as const;
export const QUOTATION_STATUSES = [
  'draft',
  'sent',
  'reviewing',
  'revision',
  'accepted',
  'rejected',
] as const;
export const DOC_TYPES = [
  'proposal',
  'quotation',
  'contract',
  'nda',
  'meeting_minute',
  'requirement',
  'profile',
  'other',
] as const;

/* ---------- Dich vu su dung & doanh thu khach hang hien huu (v7) ---------- */

/** Loai hop dong: khach moi hay mo rong tren khach hien huu. */
export const CONTRACT_KINDS = ['new', 'expansion'] as const;

/** Thoi han hop dong dich vu. */
export const CONTRACT_TERMS = ['long', 'short', 'trial', 'other'] as const;

/** Tinh trang dich vu khach hang dang su dung. */
export const SERVICE_STATUSES = ['using', 'pending', 'paused', 'stopped'] as const;

/**
 * Vong doi cua MOT khoan doanh thu thang: so tien khong nhan doi, chi chuyen giai doan.
 * Doi soat co the lam so tien thay doi so voi du kien ban dau.
 */
export const REVENUE_STAGES = ['forecast', 'reconciled', 'invoiced', 'paid'] as const;
export type RevenueStage = (typeof REVENUE_STAGES)[number];

/** Thu tu tien cua giai doan — dung de tinh phieu tich luy (da thanh toan thi cung da XHD). */
export const STAGE_RANK: Record<RevenueStage, number> = {
  forecast: 0,
  reconciled: 1,
  invoiced: 2,
  paid: 3,
};

/** So ngay khong co hoat dong thi coi la "nguoi lanh" (FR-PIP-04). */
export const STALE_DAYS = 14;

/* ---------- Cham diem co hoi BANT + 4P (v10) ---------- */

/**
 * 8 yeu to cham diem. Bon yeu to dau thuoc truc BANT (co hoi co that khong),
 * bon yeu to sau thuoc truc 4P (ta co kha nang thang khong). Truc suy tu vi tri,
 * khong luu thanh cot rieng.
 */
export const SCORE_FACTORS = [
  'budget',
  'authority',
  'need',
  'timeline',
  'price',
  'relationship',
  'fit',
  'process',
] as const;
export type Factor = (typeof SCORE_FACTORS)[number];

export const BANT_FACTORS = SCORE_FACTORS.slice(0, 4) as readonly Factor[];
export const P4_FACTORS = SCORE_FACTORS.slice(4) as readonly Factor[];

export function axisOf(factor: Factor): 'bant' | 'p4' {
  return (BANT_FACTORS as readonly string[]).includes(factor) ? 'bant' : 'p4';
}

export const QUADRANTS = ['pursue', 'reshape', 'nurture', 'disqualify'] as const;
export type Quadrant = (typeof QUADRANTS)[number];

/** Nguong lat o ma tran. Moi truc toi da 12 diem. */
export const QUADRANT_CUTOFF = 7;

/** Do dai toi thieu cua o bang chung khi cham diem >= 1 (Muc 2.2 cua spec). */
export const EVIDENCE_MIN_LENGTH = 20;

export const SCORE_STATUSES = ['suggested', 'confirmed'] as const;
export const EVIDENCE_SOURCE_TYPES = ['interaction', 'document', 'manual'] as const;
export const COMMITTEE_STANCES = ['supporter', 'neutral', 'opposed', 'unknown'] as const;
export const EVENT_TYPES = [
  'contract_expiry',
  'regulatory',
  'audit',
  'product_launch',
  'fiscal_deadline',
  'other',
] as const;
export const PRICE_POSITIONS = ['lower', 'similar', 'higher', 'unknown'] as const;

/** Vai tro trong contacts.buying_role duoc coi la nguoi co quyen chi tien (veto V2). */
export const ECONOMIC_ROLES = ['economic_buyer', 'decision_maker'] as const;

/** So ngay coi la "da tiep xuc gan day" khi tinh chieu rong quan he. */
export const COMMITTEE_RECENT_DAYS = 30;

/**
 * Ma cac quy tac phu quyet. V3 mac dinh chi canh bao vi truc 4P (yeu to PROCESS)
 * da do vi the canh tranh roi — xem muc C9 cua ban ra soat.
 */
export const VETO_CODES = [
  'V1_NO_COMPELLING_EVENT',
  'V2_NO_ECONOMIC_BUYER',
  'V3_COMPETITOR_SHAPED',
] as const;
export type VetoCode = (typeof VETO_CODES)[number];

/** Gia tri mac dinh cua cac khoa trong bang app_settings. */
export const SCORING_DEFAULTS = {
  stageGate: { quoted: 7, negotiating: 9 } as Partial<Record<Stage, number>>,
  staleDays: 30,
  v3Mode: 'warn' as 'warn' | 'veto',
  challengeThresholdVnd: 500_000_000,
  winlossMinDeals: 30,
};

/** Cac moc nhac truoc khi hop dong het han (FR-CTR-04). */
export const RENEWAL_WINDOWS = [90, 60, 30, 7];
