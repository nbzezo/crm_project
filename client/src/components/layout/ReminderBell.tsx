import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  BellRing,
  Bot,
  CalendarClock,
  Check,
  CheckCheck,
  Clock3,
  ListTodo,
  Settings2,
  ShieldAlert,
  UserRoundSearch,
} from 'lucide-react';
import {
  addDays,
  addMinutes,
  differenceInCalendarDays,
  differenceInMinutes,
  format,
  isSameDay,
  parseISO,
  setHours,
  setMinutes,
} from 'date-fns';
import { useNavigate } from 'react-router';
import { api } from '../../api/client';
import { invalidateCalendar, invalidateCardViews } from '../../lib/queryKeys';
import { useUiStore } from '../../stores/uiStore';
import type { CardStatus, NotificationFeed, NotificationItem } from '../../types';
import { Popover, usePopover } from '../common/Popover';

type Tab = 'unread' | 'read';
type Category = 'schedule' | 'task' | 'crm' | 'system';
type Filter = 'all' | Category;

interface Preferences {
  enabled: Record<Category, boolean>;
  desktop: boolean;
}

const PREF_KEY = 'workflow.notification-preferences.v1';
const DEFAULT_PREFS: Preferences = {
  enabled: { schedule: true, task: true, crm: true, system: true },
  desktop: false,
};

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'schedule', label: 'Nhắc & lịch' },
  { value: 'task', label: 'Công việc' },
  { value: 'crm', label: 'CRM' },
  { value: 'system', label: 'Hệ thống' },
];

const CATEGORY_LABEL: Record<Category, string> = {
  schedule: 'Nhắc hẹn và lịch',
  task: 'Công việc đến hạn',
  crm: 'Cảnh báo CRM',
  system: 'Hệ thống và tự động hóa',
};

const EMPTY_FEED: NotificationFeed = {
  items: [],
  unread_count: 0,
  counts: { reminder: 0, event: 0, task: 0, crm: 0, system: 0 },
};

function loadPreferences(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(PREF_KEY) ?? '') as Partial<Preferences>;
    return {
      desktop: value.desktop === true,
      enabled: { ...DEFAULT_PREFS.enabled, ...value.enabled },
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function categoryOf(item: NotificationItem): Category {
  if (item.kind === 'reminder' || item.kind === 'event') return 'schedule';
  return item.kind;
}

function itemLabel(item: NotificationItem): string {
  if (item.kind === 'reminder') return 'Nhắc hẹn';
  if (item.kind === 'event') return 'Lịch';
  if (item.kind === 'task') return 'Công việc';
  if (item.kind === 'crm') return 'CRM';
  return 'Hệ thống';
}

function dueLabel(item: NotificationItem): string {
  if (!item.due_at) return 'Cập nhật mới';
  const due = parseISO(item.due_at);
  const now = new Date();
  if (item.kind === 'task') {
    const days = differenceInCalendarDays(due, now);
    if (days < 0) return `Quá hạn ${Math.abs(days)} ngày`;
    if (days === 0) return 'Hôm nay';
    if (days === 1) return 'Ngày mai';
    return `Còn ${days} ngày · ${format(due, 'dd/MM')}`;
  }
  const minutes = differenceInMinutes(due, now);
  if (minutes < 0) {
    const late = Math.abs(minutes);
    if (late < 60) return `Quá hạn ${Math.max(1, late)} phút`;
    if (late < 1440) return `Quá hạn ${Math.floor(late / 60)} giờ`;
    return `Quá hạn ${Math.floor(late / 1440)} ngày`;
  }
  if (isSameDay(due, now)) return `Hôm nay, ${format(due, 'HH:mm')}`;
  if (minutes < 1440) return `Còn ${Math.max(1, Math.ceil(minutes / 60))} giờ`;
  return `Còn ${Math.ceil(minutes / 1440)} ngày · ${format(due, 'dd/MM HH:mm')}`;
}

function snoozeValue(option: '30m' | 'tomorrow'): string {
  const value =
    option === '30m'
      ? addMinutes(new Date(), 30)
      : setMinutes(setHours(addDays(new Date(), 1), 9), 0);
  return format(value, "yyyy-MM-dd'T'HH:mm");
}

function groupItems(items: NotificationItem[]) {
  const now = new Date();
  const overdue: NotificationItem[] = [];
  const today: NotificationItem[] = [];
  const upcoming: NotificationItem[] = [];
  const updates: NotificationItem[] = [];
  for (const item of items) {
    if (!item.due_at) updates.push(item);
    else {
      const due = parseISO(item.due_at);
      if (due < now) overdue.push(item);
      else if (isSameDay(due, now)) today.push(item);
      else upcoming.push(item);
    }
  }
  return [
    { key: 'overdue', label: 'Quá hạn', items: overdue },
    { key: 'today', label: 'Hôm nay', items: today },
    { key: 'upcoming', label: 'Sắp tới', items: upcoming },
    { key: 'updates', label: 'Cập nhật', items: updates },
  ].filter((group) => group.items.length > 0);
}

export function ReminderBell() {
  const popover = usePopover();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const openCard = useUiStore((state) => state.openCard);
  const pushToast = useUiStore((state) => state.pushToast);
  const [tab, setTab] = useState<Tab>('unread');
  const [filter, setFilter] = useState<Filter>('all');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [snoozeKey, setSnoozeKey] = useState<string | null>(null);
  const [preferences, setPreferences] = useState(loadPreferences);
  const desktopSeen = useRef<Set<string> | null>(null);

  const {
    data = EMPTY_FEED,
    isPending,
    error,
  } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<NotificationFeed>('/api/notifications'),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    localStorage.setItem(PREF_KEY, JSON.stringify(preferences));
  }, [preferences]);

  const visibleByPreference = useMemo(
    () => data.items.filter((item) => preferences.enabled[categoryOf(item)]),
    [data.items, preferences.enabled]
  );
  const unreadCount = visibleByPreference.filter((item) => !item.is_read).length;
  const filteredItems = useMemo(
    () =>
      visibleByPreference.filter(
        (item) =>
          item.is_read === (tab === 'read') && (filter === 'all' || categoryOf(item) === filter)
      ),
    [filter, tab, visibleByPreference]
  );
  const groups = useMemo(() => groupItems(filteredItems), [filteredItems]);

  const refreshNotifications = (item?: NotificationItem) => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    queryClient.invalidateQueries({ queryKey: ['ai-notifications'] });
    if (item?.kind === 'task') invalidateCardViews(queryClient);
    else if (item?.kind === 'reminder' || item?.kind === 'event') invalidateCalendar(queryClient);
  };

  const stateMutation = useMutation({
    mutationFn: (vars: {
      item: NotificationItem;
      is_read?: boolean;
      snoozed_until?: string | null;
    }) =>
      api.patch(`/api/notifications/${vars.item.key}/state`, {
        ...(vars.is_read === undefined ? {} : { is_read: vars.is_read }),
        ...(vars.snoozed_until === undefined ? {} : { snoozed_until: vars.snoozed_until }),
      }),
    onSuccess: (_result, vars) => {
      refreshNotifications(vars.item);
      if (vars.snoozed_until) {
        pushToast(
          vars.snoozed_until.endsWith('09:00')
            ? 'Sẽ nhắc lại lúc 09:00 ngày mai'
            : 'Sẽ nhắc lại sau 30 phút',
          'success'
        );
      }
    },
  });

  const completeMutation = useMutation({
    mutationFn: (item: NotificationItem) =>
      api.post<{ ok: true; previous_status?: CardStatus }>(
        `/api/notifications/${item.key}/complete`,
        { done: true }
      ),
    onSuccess: (result, item) => {
      refreshNotifications(item);
      const undo = item.can_undo
        ? {
            label: 'Hoàn tác',
            run: () => {
              void api
                .post(`/api/notifications/${item.key}/complete`, {
                  done: false,
                  restore_status: result.previous_status,
                })
                .then(() => {
                  refreshNotifications(item);
                  pushToast(`Đã khôi phục “${item.title}”`, 'success');
                })
                .catch((undoError: unknown) => {
                  pushToast(
                    undoError instanceof Error ? undoError.message : 'Không thể hoàn tác',
                    'error'
                  );
                });
            },
          }
        : undefined;
      pushToast(`Đã hoàn thành “${item.title}”`, 'success', undo);
    },
  });

  const readAll = useMutation({
    mutationFn: (keys: string[]) => api.post('/api/notifications/read-all', { keys }),
    onSuccess: () => refreshNotifications(),
  });

  const openItem = (item: NotificationItem) => {
    if (!item.is_read) stateMutation.mutate({ item, is_read: true });
    popover.close();
    if (item.card_id) openCard(item.card_id, 'drawer');
    else if (item.link) navigate(item.link);
  };

  useEffect(() => {
    if (desktopSeen.current === null) {
      desktopSeen.current = new Set(data.items.map((item) => item.key));
      return;
    }
    for (const item of data.items) {
      if (desktopSeen.current.has(item.key)) continue;
      desktopSeen.current.add(item.key);
      if (
        preferences.desktop &&
        preferences.enabled[categoryOf(item)] &&
        !item.is_read &&
        'Notification' in window &&
        Notification.permission === 'granted'
      ) {
        const desktopNotification = new Notification(item.title, {
          body: `${itemLabel(item)} · ${dueLabel(item)}\n${item.body}`,
          tag: item.key,
        });
        desktopNotification.onclick = () => window.focus();
      }
    }
  }, [data.items, preferences.desktop, preferences.enabled]);

  const toggleCategory = (category: Category) => {
    setPreferences((current) => ({
      ...current,
      enabled: { ...current.enabled, [category]: !current.enabled[category] },
    }));
  };

  const toggleDesktop = async () => {
    if (preferences.desktop) {
      setPreferences((current) => ({ ...current, desktop: false }));
      return;
    }
    if (!('Notification' in window)) {
      pushToast('Trình duyệt này không hỗ trợ thông báo trên máy tính');
      return;
    }
    const permission =
      Notification.permission === 'default'
        ? await Notification.requestPermission()
        : Notification.permission;
    if (permission !== 'granted') {
      pushToast('Bạn cần cho phép thông báo trong trình duyệt để bật tính năng này');
      return;
    }
    setPreferences((current) => ({ ...current, desktop: true }));
    pushToast('Đã bật thông báo trên máy tính', 'success');
  };

  return (
    <>
      <button
        type="button"
        onClick={popover.toggle}
        className="relative flex h-11 w-11 items-center justify-center rounded-full border border-tr-border bg-tr-panel text-tr-muted shadow-sm transition hover:border-tr-primary/20 hover:text-tr-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tr-primary fine:h-9 fine:w-9"
        aria-label={
          unreadCount > 0
            ? `Thông báo — ${unreadCount} chưa đọc`
            : 'Thông báo — không có mục chưa đọc'
        }
        aria-expanded={popover.open}
        aria-haspopup="dialog"
      >
        {unreadCount > 0 ? (
          <BellRing size={18} aria-hidden="true" />
        ) : (
          <Bell size={18} aria-hidden="true" />
        )}
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-tr-panel bg-tr-danger px-1 text-xs font-bold text-tr-on-danger"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <Popover
        open={popover.open}
        onClose={popover.close}
        anchor={popover.anchor}
        title="Trung tâm thông báo"
        width={420}
      >
        <div className="-m-3 flex min-h-[28rem] flex-col">
          <div className="border-b border-tr-border px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-tr-text">
                  {unreadCount > 0
                    ? `${unreadCount} mục cần bạn chú ý`
                    : 'Bạn đã xử lý hết thông báo'}
                </p>
                <p className="mt-0.5 text-xs text-tr-muted">
                  Nhắc hẹn, công việc và tín hiệu CRM trong một nơi
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen((open) => !open)}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-control transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tr-primary ${
                  settingsOpen
                    ? 'bg-tr-primary/10 text-tr-primary'
                    : 'text-tr-muted hover:bg-tr-hover hover:text-tr-text'
                }`}
                aria-label="Cài đặt thông báo"
                aria-expanded={settingsOpen}
              >
                <Settings2 size={16} aria-hidden="true" />
              </button>
            </div>

            {settingsOpen && (
              <div className="mt-3 rounded-panel border border-tr-border bg-tr-surface p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-tr-subtle">
                  Nguồn hiển thị
                </p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {(Object.keys(CATEGORY_LABEL) as Category[]).map((category) => (
                    <label
                      key={category}
                      className="flex min-h-9 cursor-pointer items-center gap-2 rounded-control px-2 text-xs text-tr-text hover:bg-tr-hover"
                    >
                      <input
                        type="checkbox"
                        checked={preferences.enabled[category]}
                        onChange={() => toggleCategory(category)}
                        className="h-4 w-4 accent-tr-primary"
                      />
                      {CATEGORY_LABEL[category]}
                    </label>
                  ))}
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-tr-border pt-2">
                  <div>
                    <p className="text-xs font-medium text-tr-text">Thông báo trên máy tính</p>
                    <p className="text-xs text-tr-muted">Chỉ xin quyền khi bạn chủ động bật</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={preferences.desktop}
                    onClick={() => void toggleDesktop()}
                    className={`relative h-6 w-11 rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tr-primary ${
                      preferences.desktop ? 'bg-tr-primary' : 'bg-tr-hover-strong'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                        preferences.desktop ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                    <span className="sr-only">Bật thông báo trên máy tính</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-b border-tr-border px-3">
            <div className="flex" role="tablist" aria-label="Trạng thái thông báo">
              {(['unread', 'read'] as Tab[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={tab === value}
                  onClick={() => setTab(value)}
                  className={`relative min-h-11 px-3 text-xs font-medium transition focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-tr-primary ${
                    tab === value ? 'text-tr-primary' : 'text-tr-muted hover:text-tr-text'
                  }`}
                >
                  {value === 'unread' ? `Chưa đọc (${unreadCount})` : 'Đã đọc'}
                  {tab === value && (
                    <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-tr-primary" />
                  )}
                </button>
              ))}
            </div>
            {tab === 'unread' && unreadCount > 0 && (
              <button
                type="button"
                onClick={() =>
                  readAll.mutate(
                    visibleByPreference.filter((item) => !item.is_read).map((item) => item.key)
                  )
                }
                disabled={readAll.isPending}
                className="flex min-h-9 items-center gap-1 rounded-control px-2 text-xs font-medium text-tr-primary transition hover:bg-tr-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tr-primary disabled:opacity-50"
              >
                <CheckCheck size={14} aria-hidden="true" />
                Đọc tất cả
              </button>
            )}
          </div>

          <div className="tr-scroll flex shrink-0 gap-1 overflow-x-auto border-b border-tr-border px-3 py-2">
            {FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setFilter(option.value)}
                className={`min-h-8 shrink-0 rounded-full border px-3 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tr-primary ${
                  filter === option.value
                    ? 'border-tr-primary bg-tr-primary text-tr-on-primary'
                    : 'border-tr-border bg-tr-panel text-tr-muted hover:bg-tr-hover hover:text-tr-text'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="tr-scroll min-h-0 flex-1 overflow-y-auto">
            {isPending && <NotificationSkeleton />}
            {error && !isPending && (
              <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
                <ShieldAlert size={30} className="mb-2 text-tr-danger" aria-hidden="true" />
                <p className="text-sm font-medium text-tr-text">Chưa tải được thông báo</p>
                <button
                  type="button"
                  onClick={() => queryClient.invalidateQueries({ queryKey: ['notifications'] })}
                  className="mt-2 rounded-control px-3 py-2 text-xs font-medium text-tr-primary hover:bg-tr-hover"
                >
                  Thử lại
                </button>
              </div>
            )}
            {!isPending && !error && groups.length === 0 && (
              <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-tr-success/10 text-tr-success">
                  <CheckCheck size={24} aria-hidden="true" />
                </div>
                <p className="text-sm font-semibold text-tr-text">
                  {tab === 'unread' ? 'Không có việc cần xử lý' : 'Chưa có thông báo đã đọc'}
                </p>
                <p className="mt-1 max-w-64 text-xs text-tr-muted">
                  {filter === 'all'
                    ? 'Thông báo mới từ lịch, công việc và CRM sẽ xuất hiện tại đây.'
                    : 'Hãy thử chọn một nhóm thông báo khác.'}
                </p>
              </div>
            )}
            {!isPending &&
              !error &&
              groups.map((group) => (
                <section key={group.key} aria-labelledby={`notification-group-${group.key}`}>
                  <div className="sticky top-0 z-10 flex items-center justify-between border-y border-tr-border bg-tr-surface/95 px-3 py-1.5 backdrop-blur first:border-t-0">
                    <h3
                      id={`notification-group-${group.key}`}
                      className="text-xs font-semibold uppercase tracking-wide text-tr-subtle"
                    >
                      {group.label}
                    </h3>
                    <span className="text-xs text-tr-muted">{group.items.length}</span>
                  </div>
                  {group.items.map((item) => (
                    <NotificationRow
                      key={item.key}
                      item={item}
                      snoozeOpen={snoozeKey === item.key}
                      busy={stateMutation.isPending || completeMutation.isPending}
                      onOpen={() => openItem(item)}
                      onToggleRead={() => stateMutation.mutate({ item, is_read: !item.is_read })}
                      onToggleSnooze={() =>
                        setSnoozeKey((current) => (current === item.key ? null : item.key))
                      }
                      onSnooze={(option) => {
                        stateMutation.mutate({
                          item,
                          is_read: false,
                          snoozed_until: snoozeValue(option),
                        });
                        setSnoozeKey(null);
                      }}
                      onComplete={() => completeMutation.mutate(item)}
                    />
                  ))}
                </section>
              ))}
          </div>

          <button
            type="button"
            onClick={() => {
              popover.close();
              navigate('/calendar?cv=list');
            }}
            className="flex min-h-11 shrink-0 items-center justify-center gap-2 border-t border-tr-border px-4 text-xs font-semibold text-tr-primary transition hover:bg-tr-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-tr-primary"
          >
            <CalendarClock size={15} aria-hidden="true" />
            Mở lịch công việc
          </button>
        </div>
      </Popover>
    </>
  );
}

function NotificationRow({
  item,
  snoozeOpen,
  busy,
  onOpen,
  onToggleRead,
  onToggleSnooze,
  onSnooze,
  onComplete,
}: {
  item: NotificationItem;
  snoozeOpen: boolean;
  busy: boolean;
  onOpen: () => void;
  onToggleRead: () => void;
  onToggleSnooze: () => void;
  onSnooze: (option: '30m' | 'tomorrow') => void;
  onComplete: () => void;
}) {
  const Icon =
    item.kind === 'task'
      ? ListTodo
      : item.kind === 'crm'
        ? UserRoundSearch
        : item.kind === 'system'
          ? Bot
          : CalendarClock;
  const urgent = item.severity === 'critical';

  return (
    <article
      className={`border-b border-tr-border px-3 py-2.5 transition ${
        item.is_read ? 'bg-tr-panel' : 'bg-tr-primary/[0.035]'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <div
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
            urgent
              ? 'bg-tr-danger/10 text-tr-danger'
              : item.kind === 'task'
                ? 'bg-tr-primary/10 text-tr-primary'
                : 'bg-tr-warning/10 text-tr-warning'
          }`}
        >
          <Icon size={15} aria-hidden="true" />
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 rounded-control text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tr-primary"
        >
          <div className="flex items-start gap-2">
            <p
              className={`min-w-0 flex-1 text-sm leading-5 text-tr-text ${item.is_read ? '' : 'font-semibold'}`}
            >
              {item.title}
            </p>
            {!item.is_read && (
              <span
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-tr-primary"
                aria-label="Chưa đọc"
              />
            )}
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs leading-4 text-tr-muted">{item.body}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="font-medium text-tr-subtle">{itemLabel(item)}</span>
            <span
              className={`flex items-center gap-1 ${
                item.due_at && parseISO(item.due_at) < new Date()
                  ? 'font-semibold text-tr-danger'
                  : 'text-tr-muted'
              }`}
            >
              <Clock3 size={11} aria-hidden="true" />
              {dueLabel(item)}
            </span>
            {urgent && (
              <span className="rounded-full bg-tr-danger/10 px-1.5 py-0.5 font-semibold text-tr-danger">
                Khẩn
              </span>
            )}
          </div>
        </button>
        <div className="flex shrink-0 items-center">
          {item.is_read && (
            <button
              type="button"
              onClick={onToggleRead}
              disabled={busy}
              className="flex h-8 w-8 items-center justify-center rounded-control text-tr-muted transition hover:bg-tr-hover hover:text-tr-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tr-primary disabled:opacity-50"
              aria-label={`Đánh dấu chưa đọc: ${item.title}`}
            >
              <Bell size={14} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={onToggleSnooze}
            disabled={busy}
            className="flex h-8 w-8 items-center justify-center rounded-control text-tr-muted transition hover:bg-tr-hover hover:text-tr-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tr-primary disabled:opacity-50"
            aria-label={`Nhắc lại sau: ${item.title}`}
            aria-expanded={snoozeOpen}
          >
            <Clock3 size={14} aria-hidden="true" />
          </button>
          {item.can_complete && (
            <button
              type="button"
              onClick={onComplete}
              disabled={busy}
              className="flex h-8 w-8 items-center justify-center rounded-control text-tr-muted transition hover:bg-tr-success/10 hover:text-tr-success focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tr-primary disabled:opacity-50"
              aria-label={`Hoàn thành: ${item.title}`}
            >
              <Check size={15} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      {snoozeOpen && (
        <div className="mt-2 ml-10 flex items-center gap-1 rounded-control border border-tr-border bg-tr-surface p-1">
          <span className="mr-auto pl-2 text-xs font-medium text-tr-muted">Nhắc lại</span>
          <button
            type="button"
            onClick={() => onSnooze('30m')}
            className="min-h-8 rounded-control px-2 text-xs font-medium text-tr-text hover:bg-tr-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tr-primary"
          >
            30 phút
          </button>
          <button
            type="button"
            onClick={() => onSnooze('tomorrow')}
            className="min-h-8 rounded-control px-2 text-xs font-medium text-tr-text hover:bg-tr-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tr-primary"
          >
            Mai 09:00
          </button>
        </div>
      )}
    </article>
  );
}

function NotificationSkeleton() {
  return (
    <div className="space-y-3 p-3" aria-label="Đang tải thông báo">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="flex animate-pulse gap-3">
          <div className="h-8 w-8 rounded-full bg-tr-hover-strong" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-3/4 rounded bg-tr-hover-strong" />
            <div className="h-3 w-full rounded bg-tr-hover-strong" />
            <div className="h-2.5 w-1/2 rounded bg-tr-hover-strong" />
          </div>
        </div>
      ))}
    </div>
  );
}
