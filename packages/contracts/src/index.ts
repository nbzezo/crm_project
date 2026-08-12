export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];

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

/** Xac suat mac dinh cua tung giai doan; dung chung cho API va optimistic UI. */
export const STAGE_PROBABILITY: Record<Stage, number> = {
  lead: 10,
  approaching: 20,
  discussing: 40,
  quoted: 60,
  negotiating: 80,
  won: 100,
  lost: 0,
};

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

export const INTERACTION_TYPES = [
  'call',
  'email',
  'meeting',
  'demo',
  'proposal',
  'followup',
  'note',
  'zalo',
  'other',
] as const;
export type InteractionType = (typeof INTERACTION_TYPES)[number];

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

export const CONTRACT_KINDS = ['new', 'expansion'] as const;
export type ContractKind = (typeof CONTRACT_KINDS)[number];
export const CONTRACT_TERMS = ['long', 'short', 'trial', 'other'] as const;
export type ContractTerm = (typeof CONTRACT_TERMS)[number];
export const SERVICE_STATUSES = ['using', 'pending', 'paused', 'stopped'] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];
export const REVENUE_STAGES = ['forecast', 'reconciled', 'invoiced', 'paid'] as const;
export type RevenueStage = (typeof REVENUE_STAGES)[number];

export const LABEL_ENTITIES = ['card', 'customer', 'deal', 'contact', 'contract'] as const;
export type LabelEntity = (typeof LABEL_ENTITIES)[number];

/**
 * Loai to chuc trong so danh ba.
 *
 * `customers` vua la danh sach khach hang vua la so danh ba to chuc de nguoi phu
 * trach mot cong viec co the thuoc bat ky ben nao. Chi 'customer' moi la doi tuong
 * cua pipeline / doanh thu / bao cao CRM — cac truy van liet ke khach hang phai loc
 * theo cot nay, neu khong "cong ty toi" se lot vao forecast.
 */
export const ORG_KINDS = ['own', 'customer', 'partner', 'vendor'] as const;
export type OrgKind = (typeof ORG_KINDS)[number];

/**
 * Vong doi mot cong viec (v16).
 *
 * `is_done` van ton tai va la nguon cho ~80 truy van cu; hai cot rang buoc nhau
 * bang bat bien is_done = 1 <=> status = 'done'. Chi setCardStatus() duoc ghi.
 *
 * 'waiting_customer' va 'blocked' la ly do ton tai cua ca danh sach nay: mot viec
 * dang cho ben ngoai khong phai viec bi bo quen, va phan biet duoc hai thu do moi
 * biet nen nhac ai.
 */
export const CARD_STATUSES = [
  'todo',
  'doing',
  'waiting_customer',
  'blocked',
  'review',
  'done',
] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

/** Kenh da dung de nhac mot nguoi phu trach. */
export const NUDGE_CHANNELS = ['zalo', 'email', 'call', 'meeting', 'other'] as const;
export type NudgeChannel = (typeof NUDGE_CHANNELS)[number];

export const PROJECT_STATUSES = ['planning', 'active', 'on_hold', 'done', 'cancelled'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/**
 * Suc khoe du an — tinh khi doc, khong bao gio luu.
 *
 * Luu lai se lap tuc lac hau: mot du an chuyen tu xanh sang do chi vi hom nay la
 * ngay qua `plan_end`, khong co ai sua gi ca. Khong co su kien nao de kich hoat
 * viec cap nhat, nen gia tri luu se sai am tham.
 */
export const PROJECT_HEALTHS = ['green', 'amber', 'red'] as const;
export type ProjectHealth = (typeof PROJECT_HEALTHS)[number];
