import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlarmClock, Building2, ChevronDown, ExternalLink, X } from 'lucide-react';
import { api } from '../../api/client';
import { formatDateTime, todayStr } from '../../lib/format';
import { invalidateCalendar, invalidateCardViews } from '../../lib/queryKeys';
import { snoozePresets } from '../../lib/reminderTimes';
import { useLockStore } from '../../stores/lockStore';
import { useUiStore } from '../../stores/uiStore';
import { Popover, usePopover } from '../common/Popover';
import { Button, focusRing } from '../common/ui';
import { useDialog } from '../common/useDialog';

interface DueReminder {
  id: number;
  title: string;
  note: string;
  due_at: string;
  card_id: number | null;
  card_title: string | null;
  card_is_done: number | null;
  customer_name: string | null;
  deal_title: string | null;
}

type Action = { type: 'dismiss' } | { type: 'complete-task' } | { type: 'snooze'; until: string };

/** Hoan doi gio la mot lan nhac moi — khoa gom ca gio. */
const keyOf = (r: DueReminder) => `${r.id}@${r.due_at}`;

/** Viec con mo thi nut chinh la "Xong việc" (hoan thanh ca viec), khong thi chi tat nhac. */
const hasOpenTask = (r: DueReminder) => r.card_id !== null && !r.card_is_done;

/** Gio nhac, kem ngay khi khong phai hom nay. */
const dueLabel = (r: DueReminder) =>
  r.due_at.slice(0, 10) === todayStr() ? r.due_at.slice(11, 16) : formatDateTime(r.due_at);

/** Cung khoa voi ReminderBell — nguoi dung bat "thong bao tren may tinh" o do. */
const NOTIFICATION_PREF_KEY = 'workflow.notification-preferences.v1';

function desktopEnabled(): boolean {
  try {
    const prefs = JSON.parse(localStorage.getItem(NOTIFICATION_PREF_KEY) ?? '') as {
      desktop?: boolean;
    };
    return (
      prefs.desktop === true && 'Notification' in window && Notification.permission === 'granted'
    );
  } catch {
    return false;
  }
}

/** Tieng "ting" ngan khi co nhac moi. Trinh duyet chan am thanh truoc thao tac dau thi bo qua. */
function chime() {
  try {
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
    [880, 1318.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime + 0.9);
    });
    setTimeout(() => void ctx.close(), 1200);
  } catch {
    /* khong co am thanh van hien popup */
  }
}

/**
 * Popup giua man hinh khi nhac hen cua minh toi gio (1.16.0).
 *
 * Nguon la `GET /api/reminders/due`, hoi lai moi 20 giay va khi quay lai tab.
 * Mot nhac: hien chi tiet. Tu hai nhac tro len (vd. nhieu viec cung dat 9:00):
 * hien danh sach, moi dong co nut rieng, cuoi popup co Hoan / Tat tat ca — de
 * khong phai bam qua tung cai mot.
 *
 * Nhac chi het khi nguoi dung chon: Xong / Tat (is_done = 1) hoac Hoan (doi
 * `due_at`). Dong bang X hay Escape la Hoan tat ca 10 phut — khong co cach nao
 * lam mat loi nhac ma khong co chu dich. Telegram tu gui lai khi doi gio vi
 * khoa da gui gom ca `due_at` (telegramNotifier.ts).
 *
 * Khong hien khi man hinh dang khoa: man cho che du lieu, nhac se bat len ngay
 * sau khi mo khoa.
 */
export function DueReminderPopup() {
  const locked = useLockStore((s) => s.locked);
  const queryClient = useQueryClient();
  const openCard = useUiStore((s) => s.openCard);
  const pushToast = useUiStore((s) => s.pushToast);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  /* An ngay tren may nay sau khi bam, khong doi lan hoi lai — tranh dong vua
     xu ly nhay lai trong tich tac giua luc gui yeu cau va luc danh sach moi ve. */
  const [handled, setHandled] = useState<Set<string>>(() => new Set());
  const announced = useRef<Set<string>>(new Set());

  const { data = [] } = useQuery({
    queryKey: ['reminders', 'due'],
    queryFn: () => api.get<DueReminder[]>('/api/reminders/due'),
    refetchInterval: 20_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    enabled: !locked,
  });

  const queue = useMemo(
    () => (locked ? [] : data.filter((r) => !handled.has(keyOf(r)))),
    [data, handled, locked]
  );
  const open = queue.length > 0;

  // Nhac moi: keu MOT tieng cho ca dot, va bao ra he dieu hanh neu tab dang an.
  useEffect(() => {
    const fresh = queue.filter((r) => !announced.current.has(keyOf(r)));
    if (fresh.length === 0) return;
    fresh.forEach((r) => announced.current.add(keyOf(r)));
    chime();
    if (document.hidden && desktopEnabled()) {
      const first = fresh[0];
      const n =
        fresh.length === 1
          ? new Notification(`🔔 ${first.title}`, {
              body: first.card_title ?? (first.note || 'Đến giờ nhắc'),
              tag: `due-reminder-${keyOf(first)}`,
              requireInteraction: true,
            })
          : new Notification(`🔔 ${fresh.length} lời nhắc đến giờ`, {
              body: fresh.map((r) => `• ${r.title}`).join('\n'),
              tag: `due-reminder-batch-${keyOf(first)}`,
              requireInteraction: true,
            });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    }
  }, [queue]);

  const markHandled = (reminders: DueReminder[], value: boolean) =>
    setHandled((prev) => {
      const next = new Set(prev);
      for (const r of reminders) {
        if (value) next.add(keyOf(r));
        else next.delete(keyOf(r));
      }
      return next;
    });

  const act = useMutation({
    mutationFn: async ({ reminders, action }: { reminders: DueReminder[]; action: Action }) => {
      const results = await Promise.allSettled(
        reminders.map(async (reminder) => {
          if (action.type === 'snooze') {
            await api.patch(`/api/reminders/${reminder.id}`, { due_at: action.until });
            return;
          }
          if (action.type === 'complete-task' && hasOpenTask(reminder)) {
            await api.post(`/api/notifications/task-${reminder.card_id}/complete`, {
              done: true,
            });
          }
          await api.patch(`/api/reminders/${reminder.id}`, { is_done: true });
        })
      );
      const failed = reminders.filter((_, i) => results[i].status === 'rejected');
      if (failed.length > 0) {
        // Chi tra lai nhung dong loi; dong da luu thi de chung bien mat.
        markHandled(failed, false);
        throw new Error(
          failed.length === reminders.length
            ? 'Không lưu được thao tác nhắc'
            : `Không lưu được ${failed.length}/${reminders.length} lời nhắc`
        );
      }
    },
    onMutate: ({ reminders }) => markHandled(reminders, true),
    onSettled: (_, __, { reminders }) => {
      void queryClient.invalidateQueries({ queryKey: ['reminders'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      invalidateCalendar(queryClient);
      const cardIds = new Set(reminders.map((r) => r.card_id).filter((id) => id !== null));
      for (const cardId of cardIds) {
        void queryClient.invalidateQueries({ queryKey: ['card', cardId] });
      }
      if (cardIds.size > 0) invalidateCardViews(queryClient);
    },
    onSuccess: (_, { reminders, action }) => {
      const many = reminders.length > 1;
      if (action.type === 'snooze') {
        pushToast(
          `${many ? `Đã hoãn ${reminders.length} lời nhắc` : 'Sẽ nhắc lại'} đến ${formatDateTime(action.until)}`,
          'success'
        );
      } else if (action.type === 'complete-task') {
        const r = reminders[0];
        pushToast(`Đã hoàn thành “${r.card_title ?? r.title}”`, 'success');
      } else if (many) {
        pushToast(`Đã tắt ${reminders.length} lời nhắc`, 'success');
      }
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Không lưu được thao tác nhắc');
    },
  });

  const run = (reminders: DueReminder[], action: Action) => act.mutate({ reminders, action });
  const snoozeAll = (until: string) => run(queue, { type: 'snooze', until });
  const openTask = (reminder: DueReminder) => {
    run([reminder], { type: 'dismiss' });
    openCard(reminder.card_id as number);
  };

  /* Focus vao khung popup chu KHONG vao nut dau tien: popup bat len giua luc
     nguoi dung dang go, mot phim Enter/cach lot tay khong duoc thanh "Xong việc". */
  useDialog({
    open,
    onClose: () => snoozeAll(snoozePresets(new Date())[0].value),
    containerRef: panelRef,
    focusOnOpen: false,
  });
  // Luc mo, va khi dong vua bam bien mat lam roi focus: dua focus ve khung.
  useEffect(() => {
    const panel = panelRef.current;
    if (open && panel && !panel.contains(document.activeElement)) panel.focus();
  }, [open, queue.length]);

  if (!open) return null;

  const single = queue.length === 1 ? queue[0] : null;

  return createPortal(
    <div className="tr-anim-fade fixed inset-0 z-modal-nested flex items-center justify-center bg-tr-overlay p-4">
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`tr-modal tr-anim-pop relative flex max-h-full w-full flex-col rounded-modal bg-tr-panel p-5 shadow-2xl outline-none ${single ? 'max-w-md' : 'max-w-lg'}`}
      >
        <button
          type="button"
          onClick={() => snoozeAll(snoozePresets(new Date())[0].value)}
          aria-label={single ? 'Đóng, nhắc lại sau 10 phút' : 'Đóng, nhắc lại tất cả sau 10 phút'}
          title={single ? 'Đóng, nhắc lại sau 10 phút' : 'Đóng, nhắc lại tất cả sau 10 phút'}
          className={`absolute top-3 right-3 flex h-11 w-11 items-center justify-center rounded-control text-tr-muted transition hover:bg-tr-hover hover:text-tr-text fine:h-8 fine:w-8 ${focusRing}`}
        >
          <X size={18} aria-hidden="true" />
        </button>

        <div className="flex items-start gap-3 pr-8">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-tr-primary/10 text-tr-primary">
            <AlarmClock size={22} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-tr-primary">
              {single ? `Đến giờ nhắc · ${single.due_at.slice(11, 16)}` : 'Đến giờ nhắc'}
            </p>
            <h2 id={titleId} className="mt-0.5 text-lg leading-snug font-semibold text-tr-text">
              {single ? single.title : `${queue.length} việc cần nhắc`}
            </h2>
          </div>
        </div>

        {single ? (
          <SingleReminder
            reminder={single}
            onAction={(action) => run([single], action)}
            onOpen={() => openTask(single)}
          />
        ) : (
          <ul className="tr-scroll -mx-2 mt-4 min-h-0 flex-1 divide-y divide-tr-border overflow-y-auto">
            {queue.map((reminder) => (
              <ReminderRow
                key={keyOf(reminder)}
                reminder={reminder}
                onAction={(action) => run([reminder], action)}
                onOpen={() => openTask(reminder)}
              />
            ))}
          </ul>
        )}

        <div className="mt-4 border-t border-tr-border pt-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-tr-subtle">
              {single ? 'Nhắc lại sau' : 'Hoãn tất cả'}
            </p>
            {!single && (
              <Button size="sm" variant="ghost" onClick={() => run(queue, { type: 'dismiss' })}>
                Tắt tất cả
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {snoozePresets(new Date()).map((preset) => (
              <Button key={preset.label} size="sm" onClick={() => snoozeAll(preset.value)}>
                {preset.label}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

interface ItemProps {
  reminder: DueReminder;
  onAction: (action: Action) => void;
  onOpen: () => void;
}

/** Mot nhac: chi tiet day du va nut lon. */
function SingleReminder({ reminder, onAction, onOpen }: ItemProps) {
  const context = [reminder.customer_name, reminder.deal_title].filter(Boolean).join(' · ');
  const showCardTitle = reminder.card_title && reminder.card_title !== reminder.title;

  return (
    <>
      <div className="mt-3 space-y-1.5 pl-14 text-sm text-tr-subtle">
        {showCardTitle && <p>Việc: {reminder.card_title}</p>}
        {context && (
          <p className="flex items-center gap-1.5">
            <Building2 size={13} aria-hidden="true" /> {context}
          </p>
        )}
        {reminder.note && <p className="whitespace-pre-line">{reminder.note}</p>}
        {reminder.due_at.slice(0, 10) !== todayStr() && (
          <p className="text-xs text-tr-muted">Hẹn lúc {formatDateTime(reminder.due_at)}</p>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {hasOpenTask(reminder) ? (
          <>
            <Button variant="primary" onClick={() => onAction({ type: 'complete-task' })}>
              Xong việc
            </Button>
            <Button onClick={() => onAction({ type: 'dismiss' })}>Tắt nhắc</Button>
          </>
        ) : (
          <Button variant="primary" onClick={() => onAction({ type: 'dismiss' })}>
            Đã xong
          </Button>
        )}
        {reminder.card_id !== null && (
          <Button variant="ghost" onClick={onOpen}>
            <ExternalLink size={14} aria-hidden="true" /> Mở việc
          </Button>
        )}
      </div>
    </>
  );
}

/** Mot dong trong danh sach nhieu nhac: tieu de gon va nut nho. */
function ReminderRow({ reminder, onAction, onOpen }: ItemProps) {
  const snoozePop = usePopover();
  const sub = [
    reminder.card_title !== reminder.title ? reminder.card_title : null,
    reminder.customer_name,
    reminder.deal_title,
  ]
    .filter(Boolean)
    .join(' · ');
  const name = reminder.title;

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-2 py-2.5">
      <div className="min-w-0 flex-1 basis-48">
        <p className="truncate text-sm font-medium text-tr-text">{name}</p>
        <p className="truncate text-xs text-tr-muted">
          {dueLabel(reminder)}
          {sub && ` · ${sub}`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {hasOpenTask(reminder) ? (
          <>
            <Button
              size="sm"
              variant="primary"
              aria-label={`Xong việc: ${name}`}
              onClick={() => onAction({ type: 'complete-task' })}
            >
              Xong
            </Button>
            <Button
              size="sm"
              aria-label={`Tắt nhắc: ${name}`}
              onClick={() => onAction({ type: 'dismiss' })}
            >
              Tắt
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="primary"
            aria-label={`Đã xong: ${name}`}
            onClick={() => onAction({ type: 'dismiss' })}
          >
            Xong
          </Button>
        )}
        <Button
          size="sm"
          aria-label={`Hoãn: ${name}`}
          aria-haspopup="menu"
          aria-expanded={snoozePop.open}
          onClick={snoozePop.toggle}
        >
          Hoãn <ChevronDown size={12} aria-hidden="true" />
        </Button>
        {reminder.card_id !== null && (
          <Button size="sm" variant="ghost" aria-label={`Mở việc: ${name}`} onClick={onOpen}>
            <ExternalLink size={13} aria-hidden="true" />
          </Button>
        )}
      </div>
      <Popover
        open={snoozePop.open}
        anchor={snoozePop.anchor}
        onClose={snoozePop.close}
        title="Nhắc lại sau"
        width={200}
      >
        <div className="flex flex-col gap-1">
          {snoozePresets(new Date()).map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                snoozePop.close();
                onAction({ type: 'snooze', until: preset.value });
              }}
              className={`rounded-control px-2.5 py-1.5 text-left text-sm text-tr-text hover:bg-tr-hover ${focusRing}`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </Popover>
    </li>
  );
}
