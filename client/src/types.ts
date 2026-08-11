export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type Stage =
  | 'lead'
  | 'approaching'
  | 'discussing'
  | 'quoted'
  | 'negotiating'
  | 'won'
  | 'lost';
export type InteractionType =
  | 'call'
  | 'email'
  | 'meeting'
  | 'demo'
  | 'proposal'
  | 'followup'
  | 'note'
  | 'zalo'
  | 'other';

/** Loại đối tượng gắn nhãn được (FR-TAG-30). */
export type LabelEntity = 'card' | 'customer' | 'deal' | 'contact' | 'contract';

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
  deal_id: number | null;
  deal_title?: string | null;
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
  total_won_vnd?: number;
  open_pipeline_vnd?: number;
  active_contract_count?: number;
  last_activity_at?: string | null;
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

export type ContractKind = 'new' | 'expansion';
export type ContractTerm = 'long' | 'short' | 'trial' | 'other';
export type ServiceStatus = 'using' | 'pending' | 'paused' | 'stopped';
/** Vòng đời một khoản doanh thu tháng — số tiền không nhân đôi, chỉ chuyển giai đoạn. */
export type RevenueStage = 'forecast' | 'reconciled' | 'invoiced' | 'paid';

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
  card_id: number | null;
  created_at: string;
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

export type CalendarEvent =
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
  board_name: string;
  customer_name: string | null;
  group_id: number;
  group_name: string;
}

export interface DealsResponse {
  stages: Record<Stage, Deal[]>;
  totals: Record<Stage, { count: number; sum_vnd: number; weighted_vnd: number }>;
}
