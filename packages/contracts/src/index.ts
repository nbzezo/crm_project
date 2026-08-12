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
