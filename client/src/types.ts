import type {
  ContractKind,
  ContractTerm,
  InteractionType,
  LabelEntity,
  Priority,
  RevenueStage,
  ServiceStatus,
  Stage,
} from '@workflow/contracts';

export type {
  ContractKind,
  ContractTerm,
  InteractionType,
  LabelEntity,
  Priority,
  RevenueStage,
  ServiceStatus,
  Stage,
};

/** Loại đối tượng gắn nhãn được (FR-TAG-30). */

/**
 * Nhãn — tối đa 2 cấp: `parent_id = null` là nhãn cha (nhóm, không gắn trực tiếp
 * vào bản ghi, BR-TAG-13); `parent_id` khác null là nhãn con, đơn vị được gắn.
 */
export interface Label {
  id: number;
  name: string;
  color: string;
  parent_id?: number | null;
  description?: string;
  status?: 'active' | 'inactive';
  /** JSON gốc; dùng `scope_list` cho tiện. */
  scope?: string;
  scope_list?: LabelEntity[];
  is_starred?: number;
  position?: number;
  is_system?: number;
  group_name?: string | null;
  used_count?: number;
  used_by_type?: Record<string, number>;
}

/** Một nhóm nhãn kèm các nhãn con — dùng cho màn Quản lý nhãn (`?tree=1`). */
export interface LabelGroup extends Label {
  children: Label[];
}

export interface LabelRecord {
  entity_type: LabelEntity;
  id: number;
  title: string;
}

/** Kết quả kiểm tra tên nhãn trước khi lưu (FR-TAG-39). */
export interface LabelNameCheck {
  duplicate: boolean;
  conflict: { field: string; value: string } | null;
}

export interface Board {
  id: number;
  name: string;
  color: string;
  background: string;
  is_starred: number;
  customer_id: number | null;
  customer_name?: string | null;
  is_archived: number;
  card_count?: number;
  created_at: string;
  updated_at: string;
}

export interface List {
  id: number;
  name: string;
  position: number;
  is_collapsed: number;
  cards: Card[];
}

export interface Card {
  id: number;
  list_id: number;
  title: string;
  description?: string;
  position: number;
  start_date: string | null;
  due_date: string | null;
  priority: Priority;
  customer_id: number | null;
  customer_name?: string | null;
  contact_id?: number | null;
  contact_name?: string | null;
  deal_id: number | null;
  deal_title?: string | null;
  contract_id?: number | null;
  contract_name?: string | null;
  quotation_id?: number | null;
  quotation_code?: string | null;
  is_done: number;
  completed_at?: string | null;
  cover_color: string | null;
  created_at?: string;
  parent_id: number | null;
  label_ids: number[];
  checklist_total: number;
  checklist_done: number;
  subtask_total?: number;
  subtask_done?: number;
  attachment_total?: number;
}

export interface BoardFull extends Board {
  lists: List[];
  labels: Label[];
}

export interface ChecklistItem {
  id: number;
  card_id: number;
  content: string;
  is_done: number;
  position: number;
}

export interface CardComment {
  id: number;
  card_id: number;
  body: string;
  created_at: string;
  updated_at: string | null;
}

export type FieldType = 'text' | 'number' | 'date' | 'select' | 'checkbox';

/** Dinh nghia truong thong tin — board_id null nghia la dung chung cho moi bang. */
export interface CardField {
  id: number;
  board_id: number | null;
  name: string;
  field_type: FieldType;
  options: string[];
  show_on_card: number;
  position: number;
}

/** Dinh nghia truong kem gia tri da nhap cho mot the cu the. */
export interface CardFieldValue extends CardField {
  value: string;
}

export interface CardDetail extends Card {
  labels: Label[];
  checklist: ChecklistItem[];
  reminders: Reminder[];
  comments: CardComment[];
  subtasks: SubTask[];
  attachments: CrmDocument[];
  fields: CardFieldValue[];
  parent: { id: number; title: string } | null;
  board: { id: number; name: string; list_id: number; list_name: string } | null;
}

export interface SubTask {
  id: number;
  title: string;
  priority: Priority;
  start_date: string | null;
  due_date: string | null;
  is_done: number;
  customer_id: number | null;
  customer_name: string | null;
}

export interface Customer {
  id: number;
  name: string;
  tax_code: string | null;
  industry: string | null;
  address: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  short_name: string | null;
  size: string | null;
  source: string | null;
  status: 'prospect' | 'customer' | 'inactive';
  notes: string;
  deal_count?: number;
  open_deal_count?: number;
  open_task_count?: number;
  overdue_task_count?: number;
  total_won_vnd?: number;
  open_pipeline_vnd?: number;
  active_contract_count?: number;
  last_activity_at?: string | null;
  deals_without_next_action_count?: number;
  overdue_next_action_count?: number;
  next_deal_action?: string | null;
  next_deal_action_date?: string | null;
  next_task_title?: string | null;
  next_task_due_date?: string | null;
  next_reminder_title?: string | null;
  next_reminder_due_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: number;
  customer_id: number;
  full_name: string;
  title: string | null;
  department: string | null;
  phone: string | null;
  email: string | null;
  zalo: string | null;
  linkedin: string | null;
  buying_role: string | null;
  relationship: string | null;
  is_primary: number;
  notes: string;
}

export interface Deal {
  id: number;
  customer_id: number;
  customer_name?: string;
  contact_id: number | null;
  contact_name?: string | null;
  title: string;
  product: string | null;
  stage: Stage;
  probability: number;
  value_vnd: number;
  won_value_vnd: number | null;
  position: number;
  expected_close_date: string | null;
  closed_at: string | null;
  lost_reason: string | null;
  lost_note: string | null;
  source: string | null;
  need: string | null;
  competitor: string | null;
  next_action: string | null;
  next_action_date: string | null;
  is_renewal: number;
  notes: string;
  days_idle?: number;
  last_activity_at?: string | null;
  quotation_count?: number;
  contract_count?: number;
  /* Chấm điểm BANT + 4P (v10) — ô ma trận và cờ veto tính khi đọc qua VIEW. */
  bant_total?: number;
  p4_total?: number;
  score_updated_at?: string | null;
  score_snapshot?: string | null;
  quadrant?: Quadrant;
  score_age_days?: number | null;
  v1_no_event?: number;
  v2_no_economic?: number;
  v3_shaped?: number;
  created_at: string;
  updated_at: string;
}

export interface Contract {
  id: number;
  customer_id: number;
  customer_name?: string;
  deal_id: number | null;
  deal_title?: string | null;
  name: string;
  number: string | null;
  value_vnd: number;
  sign_date: string | null;
  start_date: string | null;
  end_date: string | null;
  status: 'draft' | 'signing' | 'active' | 'expired' | 'terminated';
  payment_terms: string | null;
  renewal_followed: number;
  notes: string;
  days_left?: number | null;
  document_count?: number;
  created_at: string;
  updated_at: string;
}

export interface Quotation {
  id: number;
  customer_id: number;
  customer_name?: string;
  deal_id: number | null;
  deal_title?: string | null;
  code: string | null;
  version: number;
  quote_date: string | null;
  value_vnd: number;
  valid_until: string | null;
  status: 'draft' | 'sent' | 'reviewing' | 'revision' | 'accepted' | 'rejected';
  notes: string;
  is_expired?: number;
  document_count?: number;
  created_at: string;
  updated_at: string;
}

/* ---------- Dịch vụ sử dụng & doanh thu khách hàng hiện hữu ---------- */

/** Vòng đời một khoản doanh thu tháng — số tiền không nhân đôi, chỉ chuyển giai đoạn. */

/** Danh mục dịch vụ dùng chung — CRM quản lý thêm/sửa tại đây. */
export interface Service {
  id: number;
  name: string;
  code: string | null;
  category: string | null;
  unit: string | null;
  default_price_vnd: number;
  is_active: number;
  notes: string;
  position: number;
  line_count?: number;
  customer_count?: number;
  created_at: string;
  updated_at: string;
}

/** Doanh thu một tháng: số tiền thực tế hiện hành + số dự kiến ban đầu + giai đoạn. */
export interface RevenueCell {
  amount_vnd: number;
  forecast_vnd: number;
  stage: RevenueStage;
  note: string;
}

/** Tổng của một phạm vi: các ô stage_* là số tiền ĐANG NẰM ở từng giai đoạn (rời nhau). */
export interface RevenueTotals {
  amount_vnd: number;
  forecast_vnd: number;
  stage_forecast_vnd: number;
  stage_reconciled_vnd: number;
  stage_invoiced_vnd: number;
  stage_paid_vnd: number;
}

/** Một dòng "khách hàng × dịch vụ" kèm ma trận doanh thu 12 tháng của năm đang xem. */
export interface RevenueLine {
  id: number;
  customer_id: number;
  customer_name: string;
  customer_short_name: string | null;
  service_id: number | null;
  service_name: string | null;
  contract_id: number | null;
  contract_name: string | null;
  contract_number: string | null;
  am: string | null;
  contract_kind: ContractKind;
  contract_term: ContractTerm;
  status: ServiceStatus;
  start_date: string | null;
  end_date: string | null;
  notes: string;
  /** Khóa là 'YYYY-MM'. */
  months: Record<string, RevenueCell>;
  totals: RevenueTotals;
}

export interface RevenueLinesResponse {
  year: number;
  lines: RevenueLine[];
}

export interface RevenueSummary {
  year: number;
  months: ({ period: string } & RevenueTotals)[];
  totals: RevenueTotals;
  line_count: number;
  by_service: ({ name: string; line_count: number } & RevenueTotals)[];
  by_customer: ({ id: number; name: string } & RevenueTotals)[];
}

/** Dòng dịch vụ hiển thị trong hồ sơ khách hàng (tổng doanh thu mọi năm). */
export interface CustomerService {
  id: number;
  customer_id: number;
  service_id: number | null;
  service_name: string | null;
  contract_id: number | null;
  contract_name: string | null;
  contract_number: string | null;
  am: string | null;
  contract_kind: ContractKind;
  contract_term: ContractTerm;
  status: ServiceStatus;
  start_date: string | null;
  end_date: string | null;
  notes: string;
  amount_vnd: number;
  forecast_vnd: number;
  paid_vnd: number;
}

export interface CrmDocument {
  id: number;
  name: string;
  doc_type: string;
  file_name: string;
  stored_name: string;
  mime: string | null;
  size: number;
  customer_id: number | null;
  customer_name?: string | null;
  contact_id: number | null;
  deal_id: number | null;
  deal_title?: string | null;
  contract_id: number | null;
  contract_name?: string | null;
  quotation_id: number | null;
  quotation_code?: string | null;
  card_id: number | null;
  description: string;
  tags: string;
  owner: string | null;
  effective_date: string | null;
  expires_at: string | null;
  confidentiality: 'public' | 'internal' | 'confidential';
  deleted_at: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface Interaction {
  id: number;
  customer_id: number;
  customer_name?: string;
  contact_id: number | null;
  contact_name?: string | null;
  deal_id: number | null;
  deal_title?: string | null;
  type: InteractionType;
  occurred_at: string;
  summary: string;
  result?: string | null;
}

export interface Reminder {
  id: number;
  title: string;
  note: string;
  due_at: string;
  is_done: number;
  /**
   * Chi co trong `GET /api/reminders?upcoming=1` (v11): danh sach do gop ca
   * nhac hen va lich ca nhan, nen id co the trung giua hai nguon.
   */
  source?: 'reminder' | 'event';
  /** Gio bat dau cua su kien lich — de hien "còn N phút". */
  event_start_at?: string | null;
  card_id: number | null;
  card_title?: string | null;
  customer_id: number | null;
  customer_name?: string | null;
  deal_id: number | null;
  deal_title?: string | null;
}

export interface CustomerFull extends Customer {
  contacts: Contact[];
  deals: Deal[];
  interactions: Interaction[];
  tasks: TaskRow[];
  reminders: Reminder[];
  boards: { id: number; name: string; color: string }[];
  quotations: Quotation[];
  contracts: Contract[];
  documents: CrmDocument[];
  services: CustomerService[];
}

export interface TaskRow {
  id: number;
  title: string;
  priority: Priority;
  start_date: string | null;
  due_date: string | null;
  is_done: number;
  list_id: number;
  list_name: string;
  board_id: number;
  board_name: string;
  board_color?: string;
  customer_id: number | null;
  customer_name: string | null;
  deal_id?: number | null;
  deal_title?: string | null;
  parent_id: number | null;
  subtask_total?: number;
  subtask_done?: number;
  label_ids: number[];
}

/** Loai lich ca nhan (bang calendar_events, v11). */
export type CalEventType =
  'task' | 'meeting' | 'call' | 'reminder' | 'appointment' | 'deadline' | 'other';

export type CalEventStatus = 'pending' | 'done' | 'cancelled';

/**
 * Su kien lich ca nhan — thuc the co that trong CSDL.
 *
 * `start_at`/`end_at` luon dang 'YYYY-MM-DDTHH:mm' gio dia phuong va la
 * NUA KHOANG [start, end): `end_at` la moc LOAI TRU. Su kien ca ngay co ca
 * hai dau mut o 'T00:00'.
 */
export interface CalendarEventRow {
  id: number;
  title: string;
  description: string;
  location: string;
  event_type: CalEventType;
  start_at: string;
  end_at: string;
  all_day: number;
  status: CalEventStatus;
  completed_at: string | null;
  reminder_minutes: number | null;
  recurrence_rule: string | null;
  recurrence_parent_id: number | null;
  original_start_at: string | null;
  created_at: string;
  updated_at: string;
  /** Tinh khi doc o server — khong luu. */
  is_overdue: number;
  reminder_at: string | null;
}

export interface CalendarConflict {
  id: number;
  title: string;
  start_at: string;
  end_at: string;
}

/**
 * Mot muc bat ky hien tren lich: lich ca nhan tu tao, hoac moc sinh ra tu
 * du lieu khac (the, nhac hen, co hoi, hop dong).
 *
 * Truoc day kieu nay ten la `CalendarEvent` — doi ten de danh ten do cho
 * thuc the that su o tren, neu khong hai khai niem se lan lon vinh vien.
 */
export type CalendarItem =
  | ({ kind: 'event' } & CalendarEventRow)
  | {
      kind: 'card';
      id: number;
      title: string;
      date: string;
      priority: Priority;
      is_done: number;
      board_name: string;
      customer_name: string | null;
    }
  | {
      kind: 'reminder';
      id: number;
      title: string;
      date: string;
      time: string;
      is_done: number;
      card_id: number | null;
    }
  | {
      kind: 'deal_close';
      id: number;
      title: string;
      date: string;
      value_vnd: number;
      customer_name: string;
    }
  | {
      kind: 'next_action';
      id: number;
      title: string;
      date: string;
      customer_name: string;
    }
  | {
      kind: 'contract_end';
      id: number;
      title: string;
      date: string;
      value_vnd: number;
      customer_name: string;
    };

export interface TimelineItem {
  id: number;
  title: string;
  start_date: string;
  due_date: string;
  priority: Priority;
  is_done: number;
  /** Tiến độ thật, suy ra từ checklist hoặc việc con; null khi chưa có dữ liệu đo tiến độ. */
  progress: number | null;
  board_name: string;
  customer_name: string | null;
  group_id: number;
  group_name: string;
}

export interface DealsResponse {
  stages: Record<Stage, Deal[]>;
  totals: Record<Stage, { count: number; sum_vnd: number; weighted_vnd: number }>;
}

/* ---------- Chấm điểm cơ hội BANT + 4P (v10) ---------- */

export type Factor =
  'budget' | 'authority' | 'need' | 'timeline' | 'price' | 'relationship' | 'fit' | 'process';

export type Quadrant = 'pursue' | 'reshape' | 'nurture' | 'disqualify';

export type VetoCode = 'V1_NO_COMPELLING_EVENT' | 'V2_NO_ECONOMIC_BUYER' | 'V3_COMPETITOR_SHAPED';

export interface ScoreItem {
  factor: Factor;
  axis: 'bant' | 'p4';
  score: number;
  status: 'suggested' | 'confirmed';
  evidence: string;
  source_type: string | null;
  source_id: number | null;
  verified: number;
  challenge: string;
  scored_at: string | null;
  /** Trần điểm hiện tại theo dữ liệu có thật (BR-SCR-01…08); 3 = không bị chặn. */
  max_allowed: number;
  /** Mã việc cần làm để gỡ trần, tra ở `BLOCKED_REASONS`. */
  blocked_by: string | null;
}

export interface Recommendation {
  code: 'veto' | 'lift_factor' | 'reverify';
  factor: Factor | null;
  veto_code: VetoCode | null;
}

export interface Scorecard {
  deal_id: number;
  stage: Stage;
  /** Cơ hội đã chốt thì scorecard chỉ đọc (BR-SCR-10). */
  locked: boolean;
  items: ScoreItem[];
  bant_total: number;
  p4_total: number;
  quadrant: Quadrant;
  /** Khoảng cách tới ngưỡng lật ô — âm là còn thiếu, 0 là đúng ranh giới. */
  distance_to_boundary: { bant: number; p4: number };
  score_age_days: number | null;
  stale: boolean;
  veto: { code: VetoCode; blocking: boolean }[];
  forecast_eligible: boolean;
  scored_count: number;
  verified_count: number;
  confidence: number | null;
  challenge_required: boolean;
  recommendations: Recommendation[];
}

export interface CommitteeMember {
  contact_id: number;
  full_name: string;
  title: string | null;
  role: string | null;
  stance: 'supporter' | 'neutral' | 'opposed' | 'unknown';
  is_champion: number;
  influence: number;
  note: string;
  /** Tính từ lịch sử tương tác, không lưu trong bảng nhóm quyết định. */
  last_contact_at: string | null;
}

export interface CommitteeResponse {
  members: CommitteeMember[];
  candidates: {
    contact_id: number;
    full_name: string;
    title: string | null;
    role: string | null;
  }[];
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

export interface DealCompetitor {
  id: number;
  deal_id: number;
  name: string;
  incumbent: number;
  shaped_requirements: number;
  price_position: string;
  note: string;
}

export interface EvidenceSource {
  id: number;
  source_type: 'interaction' | 'document';
  kind: string;
  occurred_at: string;
  summary: string;
  result: string | null;
  contact_name: string | null;
}

export interface ScoreHistoryEntry {
  id: number;
  factor: string;
  old_score: number | null;
  new_score: number | null;
  reason: string;
  changed_at: string;
}

export interface ScoringSettings {
  stageGate: Partial<Record<Stage, number>>;
  staleDays: number;
  v3Mode: 'warn' | 'veto';
  challengeThresholdVnd: number;
  winlossMinDeals: number;
}
