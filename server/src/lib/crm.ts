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

/** Cac moc nhac truoc khi hop dong het han (FR-CTR-04). */
export const RENEWAL_WINDOWS = [90, 60, 30, 7];
