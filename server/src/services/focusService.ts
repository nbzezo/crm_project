import type { Database } from 'better-sqlite3';
import type { PermissionAction, PermissionResource } from '@workflow/contracts';
import { STALE_DAYS } from '../lib/crm.ts';
import {
  FLOW_NEXT_STEP_COLUMN,
  FLOW_PROGRESS_COLUMNS,
  flowProgressText,
} from '../lib/taskFlowSql.ts';
import { HttpError } from '../lib/validate.ts';
import { cadenceSql, careEventsBetween } from './customerCare.ts';

/*
 * "Trong tam" — mot khung nhin theo KY (ngay / tuan / thang / tu chon) tra loi
 * hai cau hoi: trong khoang nay toi phai lam gi, va phai de y dieu gi.
 *
 * Tach khoi route vi ba noi cung doc: man hinh Trong tam, AI phan tich ky, va
 * ban tin Telegram chay ngam (khong co Request nao). Ca ba phai thay CUNG mot
 * bo du lieu — neu ban tin sang thu Hai noi "5 viec" ma man hinh noi "6" thi
 * nguoi dung se khong tin ca hai.
 *
 * PHAM VI: moi truy van di qua `own()` / `taskWithin()` ben duoi. Pham vi duoc
 * dua vao duoi dang danh sach contact id (`visibleContactIds`), giong
 * lib/scope.ts, nhung khong can Request — test va bo hen gio goi thang duoc.
 */

export type Visible = 'all' | number[];
export type FocusMode = 'me' | 'team';

export interface FocusScope {
  /** `me` = viec cua toi; `team` = moi thu toi duoc nhin (nhom toi quan ly). */
  mode: FocusMode;
  me: number | null;
  tasks: Visible;
  deals: Visible;
  contracts: Visible;
  quotations: Visible;
  services: Visible;
  customers: Visible;
  boards: Visible;
  projects: Visible;
  notes: Visible;
}

interface AccessLike {
  contactId: number | null;
  visibleContactIds(resource: PermissionResource, action: PermissionAction): 'all' | number[];
}

export function focusScopeOf(access: AccessLike, mode: FocusMode): FocusScope {
  const read = (resource: PermissionResource) => access.visibleContactIds(resource, 'read');
  return {
    mode,
    me: access.contactId,
    tasks: read('tasks'),
    deals: read('deals'),
    contracts: read('contracts'),
    quotations: read('quotations'),
    services: read('services'),
    customers: read('customers'),
    boards: read('boards'),
    projects: read('projects'),
    notes: read('notes'),
  };
}

/** Nguoi nay co nhin duoc viec cua ai khac ngoai minh khong — de hien nut "Nhóm tôi quản lý". */
export function canSeeTeam(access: AccessLike): boolean {
  const visible = access.visibleContactIds('tasks', 'read');
  if (visible === 'all') return true;
  return visible.some((id) => id !== access.contactId);
}

/** Pham vi cho bo hen gio (ban tin Telegram): mot nguoi, khong gioi han quyen. */
export function ownerScope(me: number | null): FocusScope {
  return {
    mode: 'me',
    me,
    tasks: 'all',
    deals: 'all',
    contracts: 'all',
    quotations: 'all',
    services: 'all',
    customers: 'all',
    boards: 'all',
    projects: 'all',
    notes: 'all',
  };
}

/* ---------- Ghep dieu kien pham vi ---------- */

/*
 * Id nam thang trong SQL — cung ly do voi `scopeFragment` o lib/scope.ts: chung
 * den tu `visibleContactIds()` (CSDL doc ra), khong bao gio tu dau vao nguoi
 * dung. Van loc lai thanh so nguyen duong o day.
 */
function idList(ids: number[]): string {
  return ids.filter((id) => Number.isInteger(id) && id > 0).join(',');
}

function personal(scope: FocusScope): boolean {
  return scope.mode === 'me' && scope.me != null && Number.isInteger(scope.me);
}

/**
 * Dieu kien cho mot cot chu so huu: pham vi quyen, cong them "chinh toi" khi o
 * che do ca nhan. Ban ghi vo chu chi hien khi xem ca nhom (giong lib/scope.ts).
 */
function own(scope: FocusScope, visible: Visible, column: string): string {
  let sql = '';
  if (visible !== 'all') {
    const list = idList(visible);
    sql = list ? ` AND (${column} IN (${list}) OR ${column} IS NULL)` : ' AND 1 = 0';
  }
  if (personal(scope)) sql += ` AND ${column} = ${scope.me}`;
  return sql;
}

/**
 * Nhu `own()` nhung o che do ca nhan van giu ban ghi CHUA CO CHU — cho lich,
 * nhac hen va bien ban hop.
 *
 * Truoc ban 1.4.1 cac duong tao ba loai nay khong ghi `owner_contact_id`, nen
 * moi ban ghi tao sau v40 deu vo chu. Trang Lich van hien chung (scope
 * `OrUnowned`), nen Trong tam phai hien giong vay — neu khong, "Của tôi" mat
 * sach lich du nguoi dung thay ro no o trang Lich. Khong the gan chu nguoc lai
 * bang migration vi khong con biet ai da tao.
 */
function ownOrLegacy(scope: FocusScope, visible: Visible, column: string): string {
  let sql = '';
  if (visible !== 'all') {
    const list = idList(visible);
    sql = list ? ` AND (${column} IN (${list}) OR ${column} IS NULL)` : ' AND 1 = 0';
  }
  if (personal(scope)) sql += ` AND (${column} = ${scope.me} OR ${column} IS NULL)`;
  return sql;
}

/**
 * Viec: giong `taskScope` o routes/views.ts — viec tren bang minh thay, viec
 * giao cho minh, viec chua giao. O che do ca nhan: viec giao cho toi, hoac viec
 * chua giao ma chinh toi tao.
 */
function taskWithin(scope: FocusScope): string {
  let sql = '';
  if (scope.tasks !== 'all') {
    const list = idList(scope.tasks);
    const owned = list ? `b.owner_contact_id IN (${list})` : '1 = 0';
    const mine = scope.me != null ? ` OR k.assignee_contact_id = ${Number(scope.me)}` : '';
    sql = ` AND (${owned} OR b.owner_contact_id IS NULL${mine} OR k.assignee_contact_id IS NULL)`;
  }
  if (personal(scope)) {
    sql += ` AND (k.assignee_contact_id = ${scope.me}
                  OR (k.assignee_contact_id IS NULL AND k.creator_contact_id = ${scope.me}))`;
  }
  return sql;
}

/* ---------- Ky ---------- */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_RANGE_DAYS = 92;

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** 0 = Chu nhat ... 6 = Thu bay. */
function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function isWorkday(date: string): boolean {
  const day = weekday(date);
  return day !== 0 && day !== 6;
}

export function validateRange(from: string, to: string): void {
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || Number.isNaN(Date.parse(from))) {
    throw new HttpError(400, 'Khoảng ngày không hợp lệ');
  }
  if (to < from) throw new HttpError(400, 'Ngày kết thúc phải sau ngày bắt đầu');
  if (daysBetween(from, to) + 1 > MAX_RANGE_DAYS) {
    throw new HttpError(400, `Khoảng xem tối đa ${MAX_RANGE_DAYS} ngày`);
  }
}

/** Thu Hai cua tuan chua `date`. */
export function weekStart(date: string): string {
  const day = weekday(date);
  return addDays(date, day === 0 ? -6 : 1 - day);
}

/* ---------- Kieu du lieu tra ve ---------- */

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

/** Phai lam / Lich / Moc kinh doanh. */
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
  priority: string | null;
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

/* ---------- Gio lam viec (dung cho tai cong viec va goi y xep lich) ---------- */

export const WORK_HOURS = {
  start: '08:00',
  end: '17:30',
  lunchStart: '12:00',
  lunchEnd: '13:30',
  /** Gio lam that moi ngay — dung de tinh suc chua. */
  daily: 8,
  /** Viec chua uoc luong duoc tinh tam ngan nay gio. */
  defaultTaskHours: 1,
};

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function fromMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/* ---------- Truy van ---------- */

interface Row {
  [key: string]: unknown;
}

const TASK_COLUMNS = `
  k.id, k.title, k.priority, k.due_date, k.start_date, k.is_done, k.completed_at, k.status,
  k.estimate_hours, k.assignee_contact_id, k.creator_contact_id, k.approver_contact_id,
  k.customer_id, k.deal_id, b.project_id,
  ac.full_name AS assignee_name, b.name AS board_name, c.name AS customer_name, d.title AS deal_title,
  (SELECT COUNT(*) FROM card_due_changes dc WHERE dc.card_id = k.id) AS slip_count,
  (SELECT COUNT(*) FROM card_dependencies cd JOIN cards p ON p.id = cd.predecessor_id
    WHERE cd.successor_id = k.id AND p.is_done = 0 AND p.is_archived = 0) AS blocked_by,
  ${FLOW_PROGRESS_COLUMNS},
  ${FLOW_NEXT_STEP_COLUMN}`;

const TASK_FROM = `
  FROM cards k
  JOIN lists l ON l.id = k.list_id
  JOIN boards b ON b.id = l.board_id
  LEFT JOIN customers c ON c.id = k.customer_id
  LEFT JOIN deals d ON d.id = k.deal_id
  LEFT JOIN contacts ac ON ac.id = k.assignee_contact_id
 WHERE b.is_archived = 0 AND k.is_archived = 0`;

function joinMeta(...parts: (unknown | null | undefined)[]): string {
  return parts
    .filter((part) => part != null && String(part).trim() !== '')
    .map(String)
    .join(' · ');
}

function baseItem(
  partial: Partial<AgendaItem> &
    Pick<AgendaItem, 'key' | 'kind' | 'group' | 'id' | 'title' | 'date'>
): AgendaItem {
  return {
    time: null,
    end_time: null,
    done: false,
    overdue: false,
    priority: null,
    meta: '',
    value_vnd: null,
    card_id: null,
    customer_id: null,
    deal_id: null,
    project_id: null,
    assignee_name: null,
    estimate_hours: null,
    slip_count: 0,
    blocked: false,
    status: null,
    event_type: null,
    ...partial,
  };
}

function cardItem(row: Row, today: string, showAssignee: boolean): AgendaItem {
  const done = Boolean(row.is_done);
  const due = String(row.due_date);
  return baseItem({
    key: `card-${row.id}`,
    kind: 'card',
    group: 'todo',
    id: Number(row.id),
    title: String(row.title),
    date: due,
    done,
    overdue: !done && due < today,
    priority: (row.priority as string) ?? null,
    meta: joinMeta(
      showAssignee ? (row.assignee_name ?? 'Chưa giao') : null,
      row.customer_name,
      row.deal_title ?? row.board_name,
      // Buoc dang lam cua quy trinh (v66) — ca nguoi doc lan AI phan tich deu can.
      done ? null : flowProgressText(row)
    ),
    card_id: Number(row.id),
    customer_id: (row.customer_id as number) ?? null,
    deal_id: (row.deal_id as number) ?? null,
    project_id: (row.project_id as number) ?? null,
    assignee_name: (row.assignee_name as string) ?? null,
    estimate_hours: row.estimate_hours == null ? null : Number(row.estimate_hours),
    slip_count: Number(row.slip_count ?? 0),
    blocked: row.status === 'blocked' || Number(row.blocked_by ?? 0) > 0,
    status: (row.status as string) ?? null,
  });
}

export interface BuildFocusOptions {
  from: string;
  to: string;
  scope: FocusScope;
  /** Ghi de "hom nay"/"bay gio" — cho test. Mac dinh doc tu CSDL (gio dia phuong). */
  today?: string;
  now?: string;
  /** Bo phan nhin lai ky — ban tin Telegram khong can. */
  withRetro?: boolean;
}

export function buildFocus(db: Database, options: BuildFocusOptions): FocusData {
  const { from, to, scope } = options;
  validateRange(from, to);
  const clock = db
    .prepare(`SELECT date('now','localtime') AS today, strftime('%H:%M','now','localtime') AS now`)
    .get() as { today: string; now: string };
  const today = options.today ?? clock.today;
  const now = options.now ?? clock.now;
  const tasks = taskWithin(scope);
  const showAssignee = scope.mode === 'team' || scope.me == null;
  const carryBefore = from < today ? from : today;

  /* ---------- Phai lam ---------- */
  const cardsInRange = db
    .prepare(
      `SELECT ${TASK_COLUMNS} ${TASK_FROM}
          AND k.due_date BETWEEN ? AND ?${tasks}
        ORDER BY k.due_date, k.is_done,
                 CASE k.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END
        LIMIT 500`
    )
    .all(from, to) as Row[];

  const carryRows = db
    .prepare(
      `SELECT ${TASK_COLUMNS} ${TASK_FROM}
          AND k.is_done = 0 AND k.due_date IS NOT NULL AND k.due_date < ?${tasks}
        ORDER BY k.due_date LIMIT 50`
    )
    .all(carryBefore) as Row[];
  const carryTotal = (
    db
      .prepare(
        `SELECT COUNT(*) AS n ${TASK_FROM}
            AND k.is_done = 0 AND k.due_date IS NOT NULL AND k.due_date < ?${tasks}`
      )
      .get(carryBefore) as { n: number }
  ).n;
  const overdueTotal = (
    db
      .prepare(
        `SELECT COUNT(*) AS n ${TASK_FROM}
            AND k.is_done = 0 AND k.due_date IS NOT NULL AND k.due_date < ?${tasks}`
      )
      .get(today) as { n: number }
  ).n;

  const items: AgendaItem[] = cardsInRange.map((row) => cardItem(row, today, showAssignee));
  const carryOver: AgendaItem[] = carryRows.map((row) => cardItem(row, today, showAssignee));

  const reminderScope = ownOrLegacy(scope, scope.tasks, 'r.owner_contact_id');
  const reminderRows = db
    .prepare(
      `SELECT r.id, r.title, r.note, r.due_at, r.is_done, r.card_id, r.customer_id, r.deal_id,
              c.name AS customer_name, k.title AS card_title
         FROM reminders r
         LEFT JOIN customers c ON c.id = r.customer_id
         LEFT JOIN cards k ON k.id = r.card_id
        WHERE ((substr(r.due_at, 1, 10) BETWEEN ? AND ?)
               OR (r.is_done = 0 AND substr(r.due_at, 1, 10) < ?))${reminderScope}
        ORDER BY r.due_at LIMIT 200`
    )
    .all(from, to, carryBefore) as Row[];
  for (const row of reminderRows) {
    const at = String(row.due_at);
    const date = at.slice(0, 10);
    const done = Boolean(row.is_done);
    const item = baseItem({
      key: `reminder-${row.id}`,
      kind: 'reminder',
      group: 'todo',
      id: Number(row.id),
      title: String(row.title),
      date,
      time: at.slice(11, 16) || null,
      done,
      overdue: !done && (date < today || (date === today && at.slice(11, 16) < now)),
      meta: joinMeta(row.customer_name, row.card_title),
      card_id: (row.card_id as number) ?? null,
      customer_id: (row.customer_id as number) ?? null,
      deal_id: (row.deal_id as number) ?? null,
    });
    if (date < from) carryOver.push(item);
    else items.push(item);
  }

  /* Ghi chu nhanh la du lieu CA NHAN — chi chu so huu, ke ca khi xem ca nhom. */
  if (scope.me != null) {
    const noteRows = db
      .prepare(
        `SELECT id, title, reminder_at FROM quick_notes
          WHERE deleted_at IS NULL AND reminder_status = 'pending'
            AND substr(reminder_at, 1, 10) BETWEEN ? AND ? AND owner_contact_id = ?
          ORDER BY reminder_at LIMIT 50`
      )
      .all(from, to, scope.me) as Row[];
    for (const row of noteRows) {
      const at = String(row.reminder_at);
      items.push(
        baseItem({
          key: `quick_note-${row.id}`,
          kind: 'quick_note',
          group: 'todo',
          id: Number(row.id),
          title: String(row.title || 'Ghi chú nhanh'),
          date: at.slice(0, 10),
          time: at.slice(11, 16) || null,
          meta: 'Ghi chú nhanh',
        })
      );
    }
  }

  /* ---------- Co hoi: hanh dong tiep theo, chot, PoC, xem lai tam dung, su kien ---------- */
  const dealScope = own(scope, scope.deals, 'd.owner_contact_id');
  const DEAL_FROM = `FROM deals d JOIN customers c ON c.id = d.customer_id AND c.org_kind = 'customer'
                    WHERE d.stage_category = 'open'${dealScope}`;

  const nextActions = db
    .prepare(
      `SELECT d.id, d.title, d.next_action, d.next_action_date, d.value_vnd, d.customer_id, c.name AS customer_name
         ${DEAL_FROM} AND d.next_action_date IS NOT NULL
          AND (d.next_action_date BETWEEN ? AND ? OR d.next_action_date < ?)
        ORDER BY d.next_action_date LIMIT 100`
    )
    .all(from, to, carryBefore) as Row[];
  for (const row of nextActions) {
    const date = String(row.next_action_date);
    const item = baseItem({
      key: `next_action-${row.id}`,
      kind: 'next_action',
      group: 'todo',
      id: Number(row.id),
      title: String(row.next_action || 'Hành động tiếp theo'),
      date,
      overdue: date < today,
      meta: joinMeta(row.customer_name, row.title),
      value_vnd: Number(row.value_vnd ?? 0),
      deal_id: Number(row.id),
      customer_id: (row.customer_id as number) ?? null,
    });
    if (date < from) carryOver.push(item);
    else items.push(item);
  }

  const dealDates = db
    .prepare(
      `SELECT d.id, d.title, d.value_vnd, d.probability, d.customer_id, c.name AS customer_name,
              d.expected_close_date, d.poc_start_date, d.poc_end_date, d.on_hold, d.on_hold_review_date
         ${DEAL_FROM}
          AND (d.expected_close_date BETWEEN @from AND @to OR d.poc_start_date BETWEEN @from AND @to
               OR d.poc_end_date BETWEEN @from AND @to
               OR (d.on_hold = 1 AND d.on_hold_review_date BETWEEN @from AND @to))
        LIMIT 200`
    )
    .all({ from, to }) as Row[];
  const inRange = (value: unknown) => typeof value === 'string' && value >= from && value <= to;
  for (const row of dealDates) {
    const common = {
      id: Number(row.id),
      deal_id: Number(row.id),
      customer_id: (row.customer_id as number) ?? null,
      value_vnd: Number(row.value_vnd ?? 0),
    };
    if (inRange(row.expected_close_date))
      items.push(
        baseItem({
          ...common,
          key: `deal_close-${row.id}`,
          kind: 'deal_close',
          group: 'milestone',
          title: `Dự kiến chốt: ${row.title}`,
          date: String(row.expected_close_date),
          overdue: String(row.expected_close_date) < today,
          meta: joinMeta(row.customer_name, `${row.probability ?? 0}%`),
        })
      );
    if (inRange(row.poc_start_date))
      items.push(
        baseItem({
          ...common,
          key: `poc_start-${row.id}`,
          kind: 'poc',
          group: 'calendar',
          title: `Bắt đầu PoC: ${row.title}`,
          date: String(row.poc_start_date),
          meta: String(row.customer_name ?? ''),
        })
      );
    if (inRange(row.poc_end_date))
      items.push(
        baseItem({
          ...common,
          key: `poc_end-${row.id}`,
          kind: 'poc',
          group: 'calendar',
          title: `Kết thúc PoC: ${row.title}`,
          date: String(row.poc_end_date),
          meta: String(row.customer_name ?? ''),
        })
      );
    if (row.on_hold && inRange(row.on_hold_review_date))
      items.push(
        baseItem({
          ...common,
          key: `hold_review-${row.id}`,
          kind: 'hold_review',
          group: 'milestone',
          title: `Xem lại cơ hội tạm dừng: ${row.title}`,
          date: String(row.on_hold_review_date),
          meta: String(row.customer_name ?? ''),
        })
      );
  }

  const dealEvents = db
    .prepare(
      `SELECT e.id, e.description, e.event_date, e.confirmed, d.id AS deal_id, d.title AS deal_title,
              d.customer_id, c.name AS customer_name
         FROM deal_events e JOIN deals d ON d.id = e.deal_id
         JOIN customers c ON c.id = d.customer_id AND c.org_kind = 'customer'
        WHERE d.stage_category = 'open' AND e.event_date BETWEEN ? AND ?${dealScope}
        LIMIT 100`
    )
    .all(from, to) as Row[];
  for (const row of dealEvents)
    items.push(
      baseItem({
        key: `deal_event-${row.id}`,
        kind: 'deal_event',
        group: 'milestone',
        id: Number(row.id),
        title: String(row.description),
        date: String(row.event_date),
        meta: joinMeta(
          row.customer_name,
          row.deal_title,
          row.confirmed ? 'đã xác nhận' : 'chưa xác nhận'
        ),
        deal_id: Number(row.deal_id),
        customer_id: (row.customer_id as number) ?? null,
      })
    );

  /* ---------- Lich ---------- */
  const eventRows = db
    .prepare(
      `SELECT e.id, e.title, e.location, e.event_type, e.start_at, e.end_at, e.all_day, e.status
         FROM calendar_events e
        WHERE e.status != 'cancelled'
          AND e.start_at < ? AND e.end_at > ?${ownOrLegacy(scope, scope.tasks, 'e.owner_contact_id')}
        ORDER BY e.start_at LIMIT 300`
    )
    .all(`${addDays(to, 1)}T00:00`, `${from}T00:00`) as Row[];
  const events: AgendaItem[] = [];
  for (const row of eventRows) {
    const start = String(row.start_at);
    const end = String(row.end_at);
    const date = start.slice(0, 10) < from ? from : start.slice(0, 10);
    const allDay = Boolean(row.all_day);
    const done = row.status === 'done';
    const item = baseItem({
      key: `event-${row.id}`,
      kind: 'event',
      group: 'calendar',
      id: Number(row.id),
      title: String(row.title),
      date,
      time: allDay ? null : start.slice(11, 16),
      end_time: allDay
        ? null
        : end.slice(0, 10) === start.slice(0, 10)
          ? end.slice(11, 16)
          : '23:59',
      done,
      overdue: !done && end <= `${today}T${now}`,
      meta: String(row.location ?? ''),
      status: String(row.status),
      event_type: String(row.event_type),
    });
    events.push(item);
    items.push(item);
  }

  const meetingNotes = db
    .prepare(
      `SELECT n.id, n.title, n.meeting_at, n.deal_id, n.project_id, n.customer_id,
              d.title AS deal_title, p.name AS project_name, c.name AS customer_name
         FROM meeting_notes n
         LEFT JOIN deals d ON d.id = n.deal_id
         LEFT JOIN projects p ON p.id = n.project_id
         LEFT JOIN customers c ON c.id = n.customer_id
        WHERE n.deleted_at IS NULL AND n.meeting_at IS NOT NULL
          AND substr(n.meeting_at, 1, 10) BETWEEN ? AND ?${ownOrLegacy(scope, scope.notes, 'n.owner_contact_id')}
        ORDER BY n.meeting_at LIMIT 100`
    )
    .all(from, to) as Row[];
  for (const row of meetingNotes) {
    const at = String(row.meeting_at);
    items.push(
      baseItem({
        key: `meeting_note-${row.id}`,
        kind: 'meeting_note',
        group: 'calendar',
        id: Number(row.id),
        title: String(row.title),
        date: at.slice(0, 10),
        time: at.length >= 16 ? at.slice(11, 16) : null,
        meta: joinMeta(row.customer_name, row.deal_title ?? row.project_name),
        deal_id: (row.deal_id as number) ?? null,
        project_id: (row.project_id as number) ?? null,
        customer_id: (row.customer_id as number) ?? null,
      })
    );
  }

  /* ---------- Moc kinh doanh / du an ---------- */
  const contracts = db
    .prepare(
      `SELECT k.id, k.name, k.number, k.end_date, k.value_vnd, k.renewal_followed, c.id AS customer_id,
              c.name AS customer_name
         FROM contracts k JOIN customers c ON c.id = k.customer_id AND c.org_kind = 'customer'
         LEFT JOIN deals dd ON dd.id = k.deal_id
        WHERE k.status = 'active' AND k.end_date BETWEEN ? AND ?
          ${own(scope, scope.contracts, 'COALESCE(dd.owner_contact_id, c.owner_contact_id)')}
        ORDER BY k.end_date LIMIT 100`
    )
    .all(from, to) as Row[];
  for (const row of contracts)
    items.push(
      baseItem({
        key: `contract_end-${row.id}`,
        kind: 'contract_end',
        group: 'milestone',
        id: Number(row.id),
        title: `Hợp đồng hết hạn: ${row.name}`,
        date: String(row.end_date),
        meta: joinMeta(
          row.customer_name,
          row.renewal_followed ? 'đã theo dõi gia hạn' : 'chưa theo dõi gia hạn'
        ),
        value_vnd: Number(row.value_vnd ?? 0),
        customer_id: Number(row.customer_id),
      })
    );

  const quotes = db
    .prepare(
      `SELECT q.id, q.code, q.version, q.valid_until, q.value_vnd, q.status, q.deal_id,
              c.id AS customer_id, c.name AS customer_name
         FROM quotations q JOIN customers c ON c.id = q.customer_id AND c.org_kind = 'customer'
         LEFT JOIN deals dl ON dl.id = q.deal_id
        WHERE q.status IN ('sent','reviewing','revision') AND q.valid_until BETWEEN ? AND ?
          ${own(scope, scope.quotations, 'COALESCE(dl.owner_contact_id, c.owner_contact_id)')}
        ORDER BY q.valid_until LIMIT 100`
    )
    .all(from, to) as Row[];
  for (const row of quotes)
    items.push(
      baseItem({
        key: `quote_expiry-${row.id}`,
        kind: 'quote_expiry',
        group: 'milestone',
        id: Number(row.id),
        title: `Báo giá hết hiệu lực: ${row.code || `#${row.id}`}${Number(row.version) > 1 ? ` (v${row.version})` : ''}`,
        date: String(row.valid_until),
        meta: String(row.customer_name ?? ''),
        value_vnd: Number(row.value_vnd ?? 0),
        customer_id: Number(row.customer_id),
        deal_id: (row.deal_id as number) ?? null,
      })
    );

  const services = db
    .prepare(
      `SELECT cs.id, cs.end_date, s.name AS service_name, c.id AS customer_id, c.name AS customer_name
         FROM customer_services cs JOIN customers c ON c.id = cs.customer_id AND c.org_kind = 'customer'
         LEFT JOIN services s ON s.id = cs.service_id
        WHERE cs.status IN ('using','pending') AND cs.end_date BETWEEN ? AND ?
          ${own(scope, scope.services, 'cs.owner_contact_id')}
        ORDER BY cs.end_date LIMIT 100`
    )
    .all(from, to) as Row[];
  for (const row of services)
    items.push(
      baseItem({
        key: `service_end-${row.id}`,
        kind: 'service_end',
        group: 'milestone',
        id: Number(row.id),
        title: `Dịch vụ đến hạn: ${row.service_name ?? 'Dịch vụ'}`,
        date: String(row.end_date),
        meta: String(row.customer_name ?? ''),
        customer_id: Number(row.customer_id),
      })
    );

  const boardMilestones = db
    .prepare(
      `SELECT b.id, b.name, b.milestone_date, b.project_id, p.name AS project_name
         FROM boards b LEFT JOIN projects p ON p.id = b.project_id
        WHERE b.is_archived = 0 AND b.milestone_date BETWEEN ? AND ?
          ${own(scope, scope.boards, 'b.owner_contact_id')}
        LIMIT 100`
    )
    .all(from, to) as Row[];
  for (const row of boardMilestones)
    items.push(
      baseItem({
        key: `board_milestone-${row.id}`,
        kind: 'board_milestone',
        group: 'milestone',
        id: Number(row.id),
        title: `Hạn giai đoạn: ${row.name}`,
        date: String(row.milestone_date),
        meta: String(row.project_name ?? ''),
        project_id: (row.project_id as number) ?? null,
      })
    );

  const projects = db
    .prepare(
      `SELECT p.id, p.name, p.plan_end, p.status, c.name AS customer_name
         FROM projects p LEFT JOIN customers c ON c.id = p.customer_id
        WHERE p.is_archived = 0 AND p.status NOT IN ('done','cancelled')
          AND p.plan_end BETWEEN ? AND ?${own(scope, scope.projects, 'p.owner_contact_id')}
        LIMIT 100`
    )
    .all(from, to) as Row[];
  for (const row of projects)
    items.push(
      baseItem({
        key: `project_end-${row.id}`,
        kind: 'project_end',
        group: 'milestone',
        id: Number(row.id),
        title: `Dự án kết thúc theo kế hoạch: ${row.name}`,
        date: String(row.plan_end),
        overdue: String(row.plan_end) < today,
        meta: String(row.customer_name ?? ''),
        project_id: Number(row.id),
      })
    );

  /* Cham soc khach (v54): sinh nhat nguoi lien he va ngay ky niem hop dong. */
  for (const event of careEventsBetween(db, from, to, {
    scopeSql: own(scope, scope.customers, 'c.owner_contact_id'),
  }).slice(0, 100))
    items.push(
      baseItem({
        key: `${event.kind}-${event.contact_id ?? event.contract_id}-${event.date}`,
        kind: event.kind,
        group: 'milestone',
        id: Number(event.contact_id ?? event.contract_id),
        title: event.title,
        date: event.date,
        meta: event.customer_name,
        customer_id: event.customer_id,
      })
    );

  items.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.time ?? '99').localeCompare(b.time ?? '99') ||
      Number(a.done) - Number(b.done)
  );
  carryOver.sort((a, b) => a.date.localeCompare(b.date));

  /* ---------- Tai cong viec tung ngay ---------- */
  const days: DayLoad[] = [];
  const dayCount = daysBetween(from, to) + 1;
  for (let i = 0; i < dayCount; i += 1) {
    const date = addDays(from, i);
    const dayCards = items.filter((item) => item.kind === 'card' && item.date === date);
    const open = dayCards.filter((item) => !item.done);
    const meetingMinutes = events
      .filter((event) => event.date === date && event.time && event.end_time)
      .reduce(
        (sum, event) => sum + Math.max(0, toMinutes(event.end_time!) - toMinutes(event.time!)),
        0
      );
    const estimate = open.reduce(
      (sum, item) => sum + (item.estimate_hours ?? WORK_HOURS.defaultTaskHours),
      0
    );
    const load = Math.round((estimate + meetingMinutes / 60) * 10) / 10;
    days.push({
      date,
      is_workday: isWorkday(date),
      task_count: open.length,
      done_count: dayCards.length - open.length,
      meeting_minutes: meetingMinutes,
      estimate_hours: Math.round(estimate * 10) / 10,
      load_hours: load,
      overloaded:
        date >= today && (open.length >= 6 || meetingMinutes >= 300 || load > WORK_HOURS.daily + 1),
    });
  }

  /* ---------- Can chu y ---------- */
  const attention: AttentionItem[] = [];

  const slipping = db
    .prepare(
      `SELECT * FROM (SELECT ${TASK_COLUMNS} ${TASK_FROM}
                         AND k.is_done = 0 AND k.due_date IS NOT NULL AND k.due_date <= ?${tasks})
        WHERE slip_count >= 2 ORDER BY slip_count DESC, due_date LIMIT 8`
    )
    .all(to) as Row[];
  for (const row of slipping)
    attention.push({
      key: `slipping-${row.id}`,
      kind: 'slipping',
      severity: Number(row.slip_count) >= 3 ? 'danger' : 'warning',
      title: String(row.title),
      meta: joinMeta(
        `Đã lùi hạn ${row.slip_count} lần`,
        showAssignee ? row.assignee_name : null,
        row.customer_name
      ),
      card_id: Number(row.id),
      deal_id: null,
      customer_id: (row.customer_id as number) ?? null,
      date: (row.due_date as string) ?? null,
    });

  const blocked = db
    .prepare(
      `SELECT * FROM (SELECT ${TASK_COLUMNS}, k.blocked_reason ${TASK_FROM}
                         AND k.is_done = 0 AND (k.due_date IS NULL OR k.due_date <= ?)${tasks})
        WHERE status = 'blocked' OR blocked_by > 0 ORDER BY due_date IS NULL, due_date LIMIT 8`
    )
    .all(to) as Row[];
  for (const row of blocked)
    attention.push({
      key: `blocked-${row.id}`,
      kind: 'blocked',
      severity: 'warning',
      title: String(row.title),
      meta: joinMeta(
        Number(row.blocked_by) > 0 ? `Chờ ${row.blocked_by} việc trước` : 'Đang bị chặn',
        row.blocked_reason,
        showAssignee ? row.assignee_name : null
      ),
      card_id: Number(row.id),
      deal_id: null,
      customer_id: (row.customer_id as number) ?? null,
      date: (row.due_date as string) ?? null,
    });

  const staleDeals = db
    .prepare(
      `SELECT * FROM (
         SELECT d.id, d.title, d.value_vnd, d.customer_id, c.name AS customer_name,
                CAST(julianday(?) - julianday(COALESCE(
                  (SELECT MAX(substr(i.occurred_at,1,10)) FROM interactions i WHERE i.deal_id = d.id),
                  substr(d.created_at,1,10))) AS INTEGER) AS days_idle
           ${DEAL_FROM} AND COALESCE(d.on_hold, 0) = 0)
        WHERE days_idle >= ? ORDER BY value_vnd DESC LIMIT 6`
    )
    .all(today, STALE_DAYS) as Row[];
  for (const row of staleDeals)
    attention.push({
      key: `stale_deal-${row.id}`,
      kind: 'stale_deal',
      severity: Number(row.days_idle) >= STALE_DAYS * 2 ? 'danger' : 'warning',
      title: String(row.title),
      meta: joinMeta(row.customer_name, `${row.days_idle} ngày không tương tác`),
      card_id: null,
      deal_id: Number(row.id),
      customer_id: (row.customer_id as number) ?? null,
      date: null,
    });

  /* Quá nhịp liên hệ (v54): mỗi khách có nhịp riêng theo hạng chăm sóc (VIP 14 ngày,
     Chiến lược 21, Tiêu chuẩn 30, Ít ưu tiên 90) hoặc nhịp đặt tay. Khách VIP /
     chiến lược luôn được theo dõi, kể cả khi chưa có cơ hội mở hay hợp đồng. */
  const coldCustomers = db
    .prepare(
      `SELECT * FROM (
         SELECT c.id, c.name, c.care_tier, ${cadenceSql('c')} AS cadence,
                (SELECT MAX(substr(i.occurred_at,1,10)) FROM interactions i WHERE i.customer_id = c.id) AS last_contact,
                (SELECT COALESCE(SUM(d.value_vnd),0) FROM deals d
                  WHERE d.customer_id = c.id AND d.stage_category = 'open') AS open_vnd
           FROM customers c
          WHERE c.org_kind = 'customer'
            AND (c.care_tier IN ('vip','key')
                 OR EXISTS (SELECT 1 FROM deals d WHERE d.customer_id = c.id AND d.stage_category = 'open')
                 OR EXISTS (SELECT 1 FROM contracts k WHERE k.customer_id = c.id AND k.status = 'active'))
            ${own(scope, scope.customers, 'c.owner_contact_id')})
        WHERE last_contact IS NULL OR last_contact < date(?, '-' || cadence || ' days')
        ORDER BY care_tier = 'vip' DESC, care_tier = 'key' DESC, open_vnd DESC LIMIT 6`
    )
    .all(today) as Row[];
  for (const row of coldCustomers)
    attention.push({
      key: `cold_customer-${row.id}`,
      kind: 'cold_customer',
      severity: row.care_tier === 'vip' || row.care_tier === 'key' ? 'warning' : 'info',
      title: String(row.name),
      meta: row.last_contact
        ? `Liên hệ lần cuối ${daysBetween(String(row.last_contact), today)} ngày trước · nhịp ${row.cadence} ngày`
        : 'Chưa ghi nhận tương tác nào',
      card_id: null,
      deal_id: null,
      customer_id: Number(row.id),
      date: (row.last_contact as string) ?? null,
    });

  if (scope.mode === 'team') {
    const unassigned = db
      .prepare(
        `SELECT ${TASK_COLUMNS} ${TASK_FROM}
            AND k.is_done = 0 AND k.assignee_contact_id IS NULL AND k.assignee_org_id IS NULL
            AND k.due_date IS NOT NULL AND k.due_date <= ?${tasks}
          ORDER BY k.due_date LIMIT 6`
      )
      .all(to) as Row[];
    for (const row of unassigned)
      attention.push({
        key: `unassigned-${row.id}`,
        kind: 'unassigned',
        severity: 'warning',
        title: String(row.title),
        meta: joinMeta('Chưa giao cho ai', row.board_name),
        card_id: Number(row.id),
        deal_id: null,
        customer_id: (row.customer_id as number) ?? null,
        date: (row.due_date as string) ?? null,
      });
  }

  for (const day of days) {
    if (!day.overloaded) continue;
    attention.push({
      key: `overloaded_day-${day.date}`,
      kind: 'overloaded_day',
      severity: 'warning',
      title: `Ngày ${day.date.slice(8, 10)}/${day.date.slice(5, 7)} quá tải`,
      meta: joinMeta(
        `${day.task_count} việc`,
        day.meeting_minutes > 0 ? `${Math.round(day.meeting_minutes / 6) / 10} giờ họp` : null,
        `ước tính ${day.load_hours} giờ`
      ),
      card_id: null,
      deal_id: null,
      customer_id: null,
      date: day.date,
    });
  }

  /* Trung lich: hai su kien co gio de len nhau trong cung mot ngay. */
  const timed = events
    .filter((event) => event.time && event.end_time && event.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time!.localeCompare(b.time!));
  for (let i = 0; i < timed.length; i += 1) {
    for (let j = i + 1; j < timed.length; j += 1) {
      const a = timed[i];
      const b = timed[j];
      if (b.date !== a.date || b.time! >= a.end_time!) break;
      attention.push({
        key: `conflict-${a.id}-${b.id}`,
        kind: 'conflict',
        severity: 'danger',
        title: `Trùng lịch: ${a.title} / ${b.title}`,
        meta: `${a.date.slice(8, 10)}/${a.date.slice(5, 7)} · ${a.time}–${a.end_time} và ${b.time}–${b.end_time}`,
        card_id: null,
        deal_id: null,
        customer_id: null,
        date: a.date,
      });
    }
  }

  /* ---------- Ai dang cho ai ---------- */
  const waiting: FocusData['waiting'] = { on_me: [], on_others: [] };
  if (scope.me != null) {
    const me = Number(scope.me);
    const NUDGES = `(SELECT COUNT(*) FROM task_nudges n WHERE n.card_id = k.id) AS nudge_count,
                    (SELECT MAX(n.sent_at) FROM task_nudges n WHERE n.card_id = k.id) AS last_nudged_at`;
    const onMe = db
      .prepare(
        `SELECT k.id, k.title, k.due_date, k.status, k.creator_contact_id, k.approver_contact_id,
                k.assignee_contact_id, cr.full_name AS creator_name, ac.full_name AS assignee_name, ${NUDGES}
           FROM cards k
           JOIN lists l ON l.id = k.list_id JOIN boards b ON b.id = l.board_id
           LEFT JOIN contacts cr ON cr.id = k.creator_contact_id
           LEFT JOIN contacts ac ON ac.id = k.assignee_contact_id
          WHERE b.is_archived = 0 AND k.is_archived = 0 AND k.is_done = 0
            AND ((k.assignee_contact_id = @me AND k.creator_contact_id IS NOT NULL AND k.creator_contact_id != @me
                  AND (k.due_date <= @to OR EXISTS (SELECT 1 FROM task_nudges n WHERE n.card_id = k.id)))
                 OR (k.approver_contact_id = @me AND k.status = 'review'))
          ORDER BY k.due_date IS NULL, k.due_date LIMIT 15`
      )
      .all({ me, to }) as Row[];
    for (const row of onMe) {
      const approval = row.approver_contact_id === me && row.status === 'review';
      waiting.on_me.push({
        card_id: Number(row.id),
        title: String(row.title),
        due_date: (row.due_date as string) ?? null,
        status: (row.status as string) ?? null,
        person_name: (approval ? row.assignee_name : row.creator_name) as string | null,
        person_contact_id: (approval ? row.assignee_contact_id : row.creator_contact_id) as
          number | null,
        reason: approval ? 'approval' : Number(row.nudge_count) > 0 ? 'nudged' : 'assigned',
        nudge_count: Number(row.nudge_count ?? 0),
        last_nudged_at: (row.last_nudged_at as string) ?? null,
        overdue: row.due_date != null && String(row.due_date) < today,
      });
    }

    const onOthers = db
      .prepare(
        `SELECT k.id, k.title, k.due_date, k.status, k.assignee_contact_id, k.creator_contact_id,
                ac.full_name AS assignee_name, ${NUDGES}
           FROM cards k
           JOIN lists l ON l.id = k.list_id JOIN boards b ON b.id = l.board_id
           LEFT JOIN contacts ac ON ac.id = k.assignee_contact_id
          WHERE b.is_archived = 0 AND k.is_archived = 0 AND k.is_done = 0
            AND k.assignee_contact_id IS NOT NULL AND k.assignee_contact_id != @me
            AND (k.creator_contact_id = @me OR k.approver_contact_id = @me
                 OR EXISTS (SELECT 1 FROM task_watchers w WHERE w.card_id = k.id AND w.contact_id = @me))
            AND k.due_date IS NOT NULL AND k.due_date <= @to
          ORDER BY k.due_date LIMIT 15`
      )
      .all({ me, to }) as Row[];
    for (const row of onOthers)
      waiting.on_others.push({
        card_id: Number(row.id),
        title: String(row.title),
        due_date: (row.due_date as string) ?? null,
        status: (row.status as string) ?? null,
        person_name: (row.assignee_name as string) ?? null,
        person_contact_id: (row.assignee_contact_id as number) ?? null,
        reason: row.creator_contact_id === me ? 'delegated' : 'watching',
        nudge_count: Number(row.nudge_count ?? 0),
        last_nudged_at: (row.last_nudged_at as string) ?? null,
        overdue: String(row.due_date) < today,
      });
  }

  /* ---------- Tai nhom ---------- */
  const workload =
    scope.mode === 'team'
      ? (db
          .prepare(
            `SELECT k.assignee_contact_id, ac.full_name AS assignee_name,
                    SUM(CASE WHEN k.is_done = 0 AND k.due_date BETWEEN @from AND @to THEN 1 ELSE 0 END) AS open_count,
                    SUM(CASE WHEN k.is_done = 0 AND k.due_date < @today THEN 1 ELSE 0 END) AS overdue_count,
                    SUM(CASE WHEN k.is_done = 0 AND k.due_date BETWEEN @from AND @to
                             THEN COALESCE(k.estimate_hours, ${WORK_HOURS.defaultTaskHours}) ELSE 0 END) AS estimate_hours,
                    SUM(CASE WHEN k.is_done = 1 AND substr(k.completed_at,1,10) BETWEEN @from AND @to THEN 1 ELSE 0 END) AS done_count
               ${TASK_FROM} AND k.due_date IS NOT NULL${tasks}
              GROUP BY k.assignee_contact_id
             HAVING open_count > 0 OR overdue_count > 0 OR done_count > 0
              ORDER BY overdue_count DESC, open_count DESC LIMIT 20`
          )
          .all({ from, to, today }) as FocusData['workload'])
      : [];

  /* ---------- Tong hop ---------- */
  const cardItems = items.filter((item) => item.kind === 'card');
  const openCards = cardItems.filter((item) => !item.done);
  const meetingEvents = events.filter((event) =>
    ['meeting', 'call', 'appointment'].includes(event.event_type ?? '')
  );
  const meetingMinutes = days.reduce((sum, day) => sum + day.meeting_minutes, 0);
  const closes = items.filter((item) => item.kind === 'deal_close');
  const upcomingFrom = from > today ? from : today;
  const remainingDays = days.filter((day) => day.date >= upcomingFrom);
  const workdaysLeft = remainingDays.filter((day) => day.is_workday).length;
  const remainingOpen = openCards.filter((item) => item.date >= upcomingFrom);
  const remainingEstimate = remainingOpen.reduce(
    (sum, item) => sum + (item.estimate_hours ?? WORK_HOURS.defaultTaskHours),
    0
  );
  const remainingMeetings = remainingDays.reduce((sum, day) => sum + day.meeting_minutes, 0) / 60;

  const summary: FocusData['summary'] = {
    due_count: cardItems.length,
    open_due_count: openCards.length,
    done_due_count: cardItems.length - openCards.length,
    overdue_count: overdueTotal,
    /* The chi lay 50 dong dau nen dem the bang COUNT rieng; nhac hen va hanh
       dong co hoi da nam tron trong danh sach. */
    carry_over_count: carryTotal + carryOver.filter((item) => item.kind !== 'card').length,
    meeting_count: meetingEvents.length + meetingNotes.length,
    meeting_minutes: meetingMinutes,
    deal_close_count: closes.length,
    deal_close_vnd: closes.reduce((sum, item) => sum + (item.value_vnd ?? 0), 0),
    expiring_count: items.filter((item) =>
      ['contract_end', 'quote_expiry', 'service_end'].includes(item.kind)
    ).length,
    estimate_hours:
      Math.round(openCards.reduce((sum, item) => sum + (item.estimate_hours ?? 0), 0) * 10) / 10,
    unestimated_count: openCards.filter((item) => item.estimate_hours == null).length,
    capacity_hours: workdaysLeft * WORK_HOURS.daily,
    load_hours: Math.round((remainingEstimate + remainingMeetings) * 10) / 10,
    workdays_left: workdaysLeft,
  };

  return {
    range: { from, to, today, now, days: dayCount },
    scope: { mode: scope.mode, me: scope.me },
    summary,
    items,
    carry_over: carryOver,
    attention,
    waiting,
    days,
    retro:
      options.withRetro === false || from > today
        ? null
        : {
            current: retroStats(db, scope, from, to < today ? to : today),
            previous: retroStats(db, scope, ...previousRange(from, to)),
          },
    workload,
    free_slots: freeSlots(events, days, today, now),
  };
}

/**
 * Ky lien truoc de so sanh: tron mot thang thi lay dung thang truoc (thang 10
 * so voi ca thang 9, khong phai "31 ngay truoc"); con lai lui dung do dai ky.
 */
export function previousRange(from: string, to: string): [string, string] {
  const monthEnd = addDays(nextMonthStart(from), -1);
  if (from.endsWith('-01') && to === monthEnd) {
    const prevEnd = addDays(from, -1);
    return [`${prevEnd.slice(0, 7)}-01`, prevEnd];
  }
  const length = daysBetween(from, to) + 1;
  return [addDays(from, -length), addDays(from, -1)];
}

function nextMonthStart(date: string): string {
  const d = new Date(`${date.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

/** Thong ke nhin lai mot khoang (da qua hoac dang dien ra). */
function retroStats(db: Database, scope: FocusScope, from: string, to: string): RetroStats {
  const tasks = taskWithin(scope);
  const planned = db
    .prepare(
      `SELECT COUNT(*) AS planned,
              COALESCE(SUM(CASE WHEN k.is_done = 1 AND substr(k.completed_at,1,10) <= k.due_date THEN 1 ELSE 0 END), 0) AS on_time,
              COALESCE(SUM(CASE WHEN k.is_done = 1 AND substr(k.completed_at,1,10) > k.due_date THEN 1 ELSE 0 END), 0) AS late,
              COALESCE(SUM(CASE WHEN k.is_done = 0 THEN 1 ELSE 0 END), 0) AS open
         ${TASK_FROM} AND k.due_date BETWEEN ? AND ?${tasks}`
    )
    .get(from, to) as { planned: number; on_time: number; late: number; open: number };
  const completed = (
    db
      .prepare(
        `SELECT COUNT(*) AS n ${TASK_FROM}
            AND k.is_done = 1 AND substr(k.completed_at,1,10) BETWEEN ? AND ?${tasks}`
      )
      .get(from, to) as { n: number }
  ).n;
  const meetings = (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM calendar_events e
          WHERE e.status != 'cancelled' AND e.event_type IN ('meeting','call','appointment')
            AND substr(e.start_at,1,10) BETWEEN ? AND ?${ownOrLegacy(scope, scope.tasks, 'e.owner_contact_id')}`
      )
      .get(from, to) as { n: number }
  ).n;
  const interactions = (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM interactions i
           JOIN customers c ON c.id = i.customer_id
           LEFT JOIN deals d ON d.id = i.deal_id
          WHERE substr(i.occurred_at,1,10) BETWEEN ? AND ?
            ${own(scope, scope.customers, 'COALESCE(d.owner_contact_id, c.owner_contact_id)')}`
      )
      .get(from, to) as { n: number }
  ).n;
  const deals = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN d.stage_category = 'won' THEN 1 ELSE 0 END), 0) AS won,
              COALESCE(SUM(CASE WHEN d.stage_category = 'won' THEN COALESCE(d.won_value_vnd, d.value_vnd) ELSE 0 END), 0) AS won_vnd,
              COALESCE(SUM(CASE WHEN d.stage_category = 'lost' THEN 1 ELSE 0 END), 0) AS lost
         FROM deals d
        WHERE d.stage_category <> 'open' AND substr(d.closed_at,1,10) BETWEEN ? AND ?
          ${own(scope, scope.deals, 'd.owner_contact_id')}`
    )
    .get(from, to) as { won: number; won_vnd: number; lost: number };
  const done = planned.on_time + planned.late;
  return {
    from,
    to,
    planned: planned.planned,
    done_on_time: planned.on_time,
    done_late: planned.late,
    still_open: planned.open,
    completed_in_range: completed,
    completion_rate: planned.planned > 0 ? Math.round((done / planned.planned) * 100) / 100 : null,
    meetings,
    interactions,
    deals_won: deals.won,
    deals_won_vnd: deals.won_vnd,
    deals_lost: deals.lost,
  };
}

/**
 * Khung gio trong trong gio lam viec — toi da 7 ngay lam viec tu hom nay.
 * Dung cho AI goi y xep lich; khong goi y khung gio da troi qua.
 */
function freeSlots(events: AgendaItem[], days: DayLoad[], today: string, now: string): FreeSlot[] {
  const slots: FreeSlot[] = [];
  const upcoming = days.filter((day) => day.is_workday && day.date >= today).slice(0, 7);
  for (const day of upcoming) {
    let start = toMinutes(WORK_HOURS.start);
    if (day.date === today) {
      const current = toMinutes(now);
      start = Math.max(start, Math.ceil(current / 30) * 30);
    }
    const busy = [
      [toMinutes(WORK_HOURS.lunchStart), toMinutes(WORK_HOURS.lunchEnd)],
      ...events
        .filter((event) => event.date === day.date && event.time && event.end_time)
        .map((event) => [toMinutes(event.time!), toMinutes(event.end_time!)]),
    ].sort((a, b) => a[0] - b[0]);
    const end = toMinutes(WORK_HOURS.end);
    let cursor = start;
    for (const [busyStart, busyEnd] of [...busy, [end, end]]) {
      const slotEnd = Math.min(busyStart, end);
      if (slotEnd - cursor >= 30) {
        slots.push({
          date: day.date,
          start: fromMinutes(cursor),
          end: fromMinutes(slotEnd),
          minutes: slotEnd - cursor,
        });
      }
      cursor = Math.max(cursor, busyEnd);
      if (cursor >= end) break;
    }
  }
  return slots;
}

/* ---------- Ban gon cho AI ---------- */

/**
 * Rut gon du lieu ky de dua vao prompt — bo cot hien thi, giu id de AI tham chieu.
 * Gioi han so dong moi nhom: prompt qua dai lam AI bo sot dung thu quan trong nhat.
 */
export function compactFocusForAi(data: FocusData) {
  const pick = (item: AgendaItem) => ({
    ref: item.key,
    title: item.title,
    date: item.date,
    time: item.time ?? undefined,
    end: item.end_time ?? undefined,
    done: item.done || undefined,
    overdue: item.overdue || undefined,
    priority: item.priority ?? undefined,
    meta: item.meta || undefined,
    value_vnd: item.value_vnd || undefined,
    customer_id: item.customer_id ?? undefined,
    deal_id: item.deal_id ?? undefined,
    estimate_hours: item.estimate_hours ?? undefined,
    slip_count: item.slip_count || undefined,
    blocked: item.blocked || undefined,
    assignee: item.assignee_name ?? undefined,
  });
  return {
    range: data.range,
    mode: data.scope.mode,
    summary: data.summary,
    todo: data.items
      .filter((item) => item.group === 'todo')
      .slice(0, 60)
      .map(pick),
    calendar: data.items
      .filter((item) => item.group === 'calendar')
      .slice(0, 40)
      .map(pick),
    milestones: data.items
      .filter((item) => item.group === 'milestone')
      .slice(0, 30)
      .map(pick),
    carry_over: data.carry_over.slice(0, 25).map(pick),
    attention: data.attention
      .slice(0, 25)
      .map(({ kind, title, meta, card_id, deal_id, customer_id }) => ({
        kind,
        title,
        meta,
        card_id: card_id ?? undefined,
        deal_id: deal_id ?? undefined,
        customer_id: customer_id ?? undefined,
      })),
    waiting_on_me: data.waiting.on_me,
    waiting_on_others: data.waiting.on_others,
    days: data.days.filter((day) => day.task_count > 0 || day.meeting_minutes > 0),
    retro: data.retro,
    workload: data.workload,
    free_slots: data.free_slots.slice(0, 30),
  };
}
