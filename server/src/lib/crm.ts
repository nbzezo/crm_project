/** Hang so nghiep vu CRM theo BRD. */
import {
  CONTRACT_KINDS,
  CONTRACT_STATUSES,
  CONTRACT_TERMS,
  DOC_TYPES,
  LOST_REASONS,
  QUADRANT_CUTOFF,
  QUOTATION_STATUSES,
  REVENUE_STAGES,
  SERVICE_STATUSES,
  STAGE_PROBABILITY,
  STAGES,
  STALE_DAYS,
  type RevenueStage,
  type Stage,
} from '@workflow/contracts';

export {
  CONTRACT_KINDS,
  CONTRACT_STATUSES,
  CONTRACT_TERMS,
  DOC_TYPES,
  LOST_REASONS,
  QUADRANT_CUTOFF,
  QUOTATION_STATUSES,
  REVENUE_STAGES,
  SERVICE_STATUSES,
  STAGE_PROBABILITY,
  STAGES,
  STALE_DAYS,
};
export type { RevenueStage, Stage };

export const OPEN_STAGES = STAGES.filter((s) => s !== 'won' && s !== 'lost');

export function isClosed(stage: Stage): boolean {
  return stage === 'won' || stage === 'lost';
}

/* ---------- Dich vu su dung & doanh thu khach hang hien huu (v7) ---------- */

/**
 * Vong doi cua MOT khoan doanh thu thang: so tien khong nhan doi, chi chuyen giai doan.
 * Doi soat co the lam so tien thay doi so voi du kien ban dau.
 */

/** Thu tu tien cua giai doan — dung de tinh phieu tich luy (da thanh toan thi cung da XHD). */
export const STAGE_RANK: Record<RevenueStage, number> = {
  forecast: 0,
  reconciled: 1,
  invoiced: 2,
  paid: 3,
};

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
