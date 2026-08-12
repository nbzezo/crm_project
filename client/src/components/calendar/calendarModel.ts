import {
  AlertCircle,
  Bell,
  CalendarClock,
  CheckSquare,
  Clock,
  FileText,
  MoveRight,
  Phone,
  Users,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { addDays, format, parseISO } from 'date-fns';
import { PRIORITY_COLORS, t } from '../../i18n/vi';
import { formatVNDShort } from '../../lib/format';
import type { CalEventType, CalendarEventRow, CalendarItem } from '../../types';

/** Nguon sinh ra su kien. 'event' la lich ca nhan tu tao, con lai la dan xuat. */
export type CalendarSource = CalendarItem['kind'];

/* ---------- Bien nua khoang <-> FullCalendar ---------- */
/**
 * CSDL, API va FullCalendar deu dung NUA KHOANG [start, end) nen KHONG can quy
 * doi o day. Hai ham duoi chi phuc vu BIEU MAU, noi nguoi dung nghi theo kieu
 * "bao gom": chon 15/08 -> 17/08 nghia la ba ngay.
 *
 * Day la CHO DUY NHAT trong toan bo ma nguon duoc cong/tru mot ngay.
 */
export function allDayEndToForm(endExclusive: string): string {
  return format(addDays(parseISO(endExclusive.slice(0, 10)), -1), 'yyyy-MM-dd');
}

export function allDayEndFromForm(endInclusive: string): string {
  return `${format(addDays(parseISO(endInclusive), 1), 'yyyy-MM-dd')}T00:00`;
}

/** Icon theo loai lich ca nhan (muc 21, 22). */
export const EVENT_TYPE_ICON: Record<CalEventType, LucideIcon> = {
  task: CheckSquare,
  meeting: Users,
  call: Phone,
  reminder: Bell,
  appointment: CalendarClock,
  deadline: Clock,
  other: CalendarClock,
};

/**
 * Nhung gi giao dien duoc phep lam voi mot su kien.
 *
 * Ton tai de UI KHONG con phan nhanh theo `kind`. BRD ap mot mo hinh
 * form + trang thai + sua/xoa cho MOI su kien, nhung "Hop dong het han 31/12"
 * thi khong the keo, khong the xoa khoi lich, khong co trang thai "Da huy".
 * Tach ra day de moi cho chi hoi mot cau: "duoc lam gi?".
 */
export interface Capabilities {
  /** Mo bieu mau sua day du. Chi lich ca nhan (Phase 4) moi co. */
  edit: boolean;
  /** Keo sang ngay khac. */
  moveDate: boolean;
  /** Keo sang gio khac trong Week/Day. */
  moveTime: boolean;
  /** Keo canh duoi de doi thoi luong. */
  resize: boolean;
  /** Tick hoan thanh nhanh. */
  complete: boolean;
  /** Xoa khoi lich. */
  remove: boolean;
}

/** Noi di toi khi bam vao mot su kien chi-doc. */
export type CalLink =
  { kind: 'card'; cardId: number; label: string } | { kind: 'route'; to: string; label: string };

const NO_CAPS: Capabilities = {
  edit: false,
  moveDate: false,
  moveTime: false,
  resize: false,
  complete: false,
  remove: false,
};

/**
 * Mo ta mot su kien da chuan hoa de hien thi.
 *
 * Ton tai de luoi (FullCalendar) va che do Danh sach (tu dung) dung chung
 * mot cho phan nhanh theo `kind` — truoc day logic nay nam thang trong
 * CalendarView nen khong tai su dung duoc.
 */
export interface CalEvent {
  /** Khoa on dinh, dong thoi la id ben FullCalendar. */
  key: string;
  source: CalendarSource;
  id: number;
  title: string;
  /** 'YYYY-MM-DD'. */
  date: string;
  /** 'HH:mm' neu nguon co gio, nguoc lai null. */
  time: string | null;
  /**
   * Moc ket thuc LOAI TRU, cung quy uoc voi FullCalendar nen truyen thang duoc.
   * null voi cac nguon dan xuat — chung chi la mot moc ngay, khong co do dai.
   */
  end: string | null;
  Icon: LucideIcon;
  bg: string;
  fg: string;
  done: boolean;
  overdue: boolean;
  /** Nhan loai doc duoc — muc 22 cam dung mau lam tin hieu duy nhat. */
  typeLabel: string;
  caps: Capabilities;
  /** Nguon that su cua su kien; null khi khong di toi dau duoc. */
  link: CalLink | null;
  cardId: number | null;
  /** Dong phu: ten khach hang, gia tri hop dong, dia diem… */
  subtitle: string | null;
  /** Ban ghi goc — chi co voi lich ca nhan, dung de do vao bieu mau sua. */
  row: CalendarEventRow | null;
}

const TOKEN = {
  reminder: { bg: 'var(--cal-reminder-bg)', fg: 'var(--cal-reminder-fg)' },
  nextAction: { bg: 'var(--cal-next-action-bg)', fg: 'var(--cal-next-action-fg)' },
  dealClose: { bg: 'var(--cal-deal-close-bg)', fg: 'var(--cal-deal-close-fg)' },
  contract: { bg: 'var(--cal-contract-end-bg)', fg: 'var(--cal-contract-end-fg)' },
} as const;

/** Su kien qua han: chua xong va ngay da troi qua (muc 35). */
function computeOverdue(event: Exclude<CalendarItem, { kind: 'event' }>, today: string): boolean {
  const past = event.date.slice(0, 10) < today;
  if (event.kind === 'card' || event.kind === 'reminder') return past && event.is_done === 0;
  // Cac moc CRM khong co trang thai hoan thanh — chi tinh la da qua.
  return past;
}

export function toCalEvent(event: CalendarItem, today: string): CalEvent {
  /* Lich ca nhan: nguon duy nhat sua duoc day du. `is_overdue` da tinh o server
     nen huy hieu tren lich khong the lech voi chuong bao hay Tong quan. */
  if (event.kind === 'event') {
    const allDay = event.all_day === 1;
    return {
      key: `event-${event.id}`,
      source: 'event',
      id: event.id,
      title: event.title,
      date: event.start_at.slice(0, 10),
      time: allDay ? null : event.start_at.slice(11, 16),
      // FullCalendar cung dung end LOAI TRU nen truyen thang, khong quy doi.
      // All-day chi can phan ngay; co gio thi giu ca gio.
      end: allDay ? event.end_at.slice(0, 10) : event.end_at,
      Icon: EVENT_TYPE_ICON[event.event_type],
      bg: `var(--cal-type-${event.event_type})`,
      fg: 'var(--cal-type-ink)',
      done: event.status === 'done',
      overdue: event.is_overdue === 1,
      typeLabel: t.calendarType[event.event_type],
      caps: {
        edit: true,
        moveDate: true,
        moveTime: !allDay,
        resize: !allDay,
        complete: event.status !== 'cancelled',
        remove: true,
      },
      link: null,
      cardId: null,
      subtitle: event.location || null,
      row: event,
    };
  }

  const overdue = computeOverdue(event, today);
  const base = {
    id: event.id,
    source: event.kind,
    date: event.date.slice(0, 10),
    overdue,
    subtitle: null as string | null,
    end: null,
    row: null,
  };

  if (event.kind === 'card') {
    return {
      ...base,
      key: `card-${event.id}`,
      title: event.title,
      time: null,
      Icon: CheckSquare,
      bg: PRIORITY_COLORS[event.priority],
      fg: '#fff',
      done: event.is_done === 1,
      typeLabel: t.calendar.sourceCard,
      // The la nguon dan xuat duy nhat keo doi ngay duoc — `PATCH /api/cards/:id`
      // da co san va tinh nang nay dang chay, bo di la pha chuc nang cu.
      caps: { ...NO_CAPS, moveDate: true },
      link: { kind: 'card', cardId: event.id, label: t.calendar.openCard },
      cardId: event.id,
      subtitle: event.customer_name ?? event.board_name,
    };
  }
  if (event.kind === 'reminder') {
    return {
      ...base,
      key: `reminder-${event.id}`,
      title: event.title,
      time: event.time,
      Icon: Bell,
      bg: TOKEN.reminder.bg,
      fg: TOKEN.reminder.fg,
      done: event.is_done === 1,
      typeLabel: t.calendar.sourceReminder,
      caps: NO_CAPS,
      link:
        event.card_id === null
          ? null
          : { kind: 'card', cardId: event.card_id, label: t.calendar.openCard },
      cardId: event.card_id,
      subtitle: null,
    };
  }
  if (event.kind === 'next_action') {
    return {
      ...base,
      key: `action-${event.id}`,
      title: event.title,
      time: null,
      Icon: MoveRight,
      bg: TOKEN.nextAction.bg,
      fg: TOKEN.nextAction.fg,
      done: false,
      typeLabel: t.calendar.sourceNextAction,
      caps: NO_CAPS,
      link: { kind: 'route', to: `/deals/${event.id}`, label: t.calendar.openDeal },
      cardId: null,
      subtitle: event.customer_name,
    };
  }
  if (event.kind === 'deal_close') {
    return {
      ...base,
      key: `deal_close-${event.id}`,
      title: event.title,
      time: null,
      Icon: Wallet,
      bg: TOKEN.dealClose.bg,
      fg: TOKEN.dealClose.fg,
      done: false,
      typeLabel: t.calendar.sourceDealClose,
      caps: NO_CAPS,
      link: { kind: 'route', to: `/deals/${event.id}`, label: t.calendar.openDeal },
      cardId: null,
      subtitle: `${event.customer_name} · ${formatVNDShort(event.value_vnd)}`,
    };
  }
  return {
    ...base,
    key: `contract_end-${event.id}`,
    title: event.title,
    time: null,
    Icon: FileText,
    bg: TOKEN.contract.bg,
    fg: TOKEN.contract.fg,
    done: false,
    typeLabel: t.calendar.sourceContractEnd,
    caps: NO_CAPS,
    link: { kind: 'route', to: '/contracts', label: t.calendar.openContract },
    cardId: null,
    subtitle: `${event.customer_name} · ${formatVNDShort(event.value_vnd)}`,
  };
}

/** Bieu tuong canh bao dung chung cho nhan "Quá hạn". */
export const OverdueIcon = AlertCircle;

/**
 * Khung gio can hien trong Week/Day.
 *
 * Muc 12 chot mac dinh 06:00–23:00, nhung khoa cung khung do gay hai loi am tham:
 *  - su kien nam ngoai khung BIEN MAT khong dau vet;
 *  - duong chi gio hien tai (muc 13) khong ve duoc khi bay gio la 23:30.
 * Nen khung phai noi ra vua du de phu ca hai.
 *
 * `nowHour` truyen vao thay vi doc `new Date()` ben trong de ham nay van thuan tuy.
 */
export function slotBounds(events: CalEvent[], nowHour: number): { min: string; max: string } {
  let minHour = 6;
  let maxHour = 23;

  const widen = (hour: number) => {
    if (Number.isNaN(hour)) return;
    if (hour < minHour) minHour = Math.max(0, hour);
    if (hour + 1 > maxHour) maxHour = Math.min(24, hour + 1);
  };

  for (const event of events) {
    if (event.time) widen(Number(event.time.slice(0, 2)));
  }
  widen(nowHour);

  const pad = (h: number) => `${String(h).padStart(2, '0')}:00:00`;
  return { min: pad(minHour), max: pad(maxHour) };
}
