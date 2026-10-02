/* Kieu du lieu cua GET /api/focus — doi chieu server/src/services/focusService.ts. */

export type FocusMode = 'me' | 'team';

export type AgendaKind =
  | 'card'
  | 'reminder'
  | 'quick_note'
  | 'next_action'
  | 'event'
  | 'meeting_note'
  | 'poc'
  | 'deal_event'
  | 'deal_close'
  | 'hold_review'
  | 'contract_end'
  | 'quote_expiry'
  | 'service_end'
  | 'board_milestone'
  | 'project_end'
  | 'birthday'
  | 'contract_anniversary';

export type AgendaGroup = 'todo' | 'calendar' | 'milestone';

export interface AgendaItem {
  key: string;
  kind: AgendaKind;
  group: AgendaGroup;
  id: number;
  title: string;
  date: string;
  time: string | null;
  end_time: string | null;
  done: boolean;
  overdue: boolean;
  priority: 'low' | 'medium' | 'high' | 'urgent' | null;
  meta: string;
  value_vnd: number | null;
  card_id: number | null;
  customer_id: number | null;
  deal_id: number | null;
  project_id: number | null;
  assignee_name: string | null;
  estimate_hours: number | null;
  slip_count: number;
  blocked: boolean;
  status: string | null;
  event_type: string | null;
}

export interface AttentionItem {
  key: string;
  kind:
    | 'slipping'
    | 'blocked'
    | 'stale_deal'
    | 'cold_customer'
    | 'unassigned'
    | 'overloaded_day'
    | 'conflict';
  severity: 'danger' | 'warning' | 'info';
  title: string;
  meta: string;
  card_id: number | null;
  deal_id: number | null;
  customer_id: number | null;
  date: string | null;
}

export interface WaitingItem {
  card_id: number;
  title: string;
  due_date: string | null;
  status: string | null;
  person_name: string | null;
  person_contact_id: number | null;
  reason: 'assigned' | 'approval' | 'nudged' | 'delegated' | 'watching';
  nudge_count: number;
  last_nudged_at: string | null;
  overdue: boolean;
}

export interface DayLoad {
  date: string;
  is_workday: boolean;
  task_count: number;
  done_count: number;
  meeting_minutes: number;
  estimate_hours: number;
  load_hours: number;
  overloaded: boolean;
}

export interface RetroStats {
  from: string;
  to: string;
  planned: number;
  done_on_time: number;
  done_late: number;
  still_open: number;
  completed_in_range: number;
  completion_rate: number | null;
  meetings: number;
  interactions: number;
  deals_won: number;
  deals_won_vnd: number;
  deals_lost: number;
}

export interface FreeSlot {
  date: string;
  start: string;
  end: string;
  minutes: number;
}

export interface FocusData {
  range: { from: string; to: string; today: string; now: string; days: number };
  scope: { mode: FocusMode; me: number | null };
  can_team: boolean;
  summary: {
    due_count: number;
    open_due_count: number;
    done_due_count: number;
    overdue_count: number;
    carry_over_count: number;
    meeting_count: number;
    meeting_minutes: number;
    deal_close_count: number;
    deal_close_vnd: number;
    expiring_count: number;
    estimate_hours: number;
    unestimated_count: number;
    capacity_hours: number;
    load_hours: number;
    workdays_left: number;
  };
  items: AgendaItem[];
  carry_over: AgendaItem[];
  attention: AttentionItem[];
  waiting: { on_me: WaitingItem[]; on_others: WaitingItem[] };
  days: DayLoad[];
  retro: { current: RetroStats; previous: RetroStats } | null;
  workload: {
    assignee_contact_id: number | null;
    assignee_name: string | null;
    open_count: number;
    overdue_count: number;
    estimate_hours: number;
    done_count: number;
  }[];
  free_slots: FreeSlot[];
}

/* POST /api/ai/focus-plan — doi chieu server/src/services/focusAi.ts. */
export interface FocusPlan {
  headline: string;
  summary: string;
  priorities: { title: string; reason: string; ref?: string | null }[];
  risks: string[];
  schedule: { date: string; start: string; end: string; title: string; ref?: string | null }[];
  delegate: { title: string; to: string; reason: string; card_id?: number | null }[];
  suggested_tasks: {
    title: string;
    reason: string;
    due_date?: string | null;
    priority?: string | null;
  }[];
  messages: { to: string; purpose: string; text: string }[];
  proposals: {
    id: number;
    title: string;
    explanation?: string;
    status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed' | string;
  }[];
  generated_at: string;
  cached: boolean;
  meta: { provider: string; model: string; inputTokens: number; outputTokens: number };
}
