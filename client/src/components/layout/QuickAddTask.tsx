import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CalendarDays, CornerDownLeft, X, Zap } from 'lucide-react';
import { api } from '../../api/client';
import { invalidateCardViews } from '../../lib/queryKeys';
import { describeWhen, parseQuickTask } from '../../lib/quickTaskParser';
import { useLockStore } from '../../stores/lockStore';
import { useUiStore } from '../../stores/uiStore';
import type { Card } from '../../types';
import { focusRing } from '../common/ui';
import { useDialog } from '../common/useDialog';

/**
 * O nhap nhanh mot dong (1.17.0): go "mai 9h gọi anh Nam", Enter la co viec
 * "Gọi anh Nam", han mai, nhac 9:00 — popup giua man hinh (DueReminderPopup)
 * se bat len dung gio.
 *
 * Mo bang Ctrl/Cmd+J tu bat ky dau, hoac muc dau cua nut Tao nhanh. Viec giao
 * cho nguoi dang dang nhap va vao danh sach mac dinh (createCard tu chon) —
 * can gan bang, khach hang... thi mo viec ra sua, hoac dung form day du.
 *
 * Ban xem truoc hien ngay khi go; hieu sai ngay gio thi bam × tren nhan de bo,
 * ca dong thanh tieu de.
 */
export function QuickAddTask() {
  const open = useUiStore((s) => s.quickAddOpen);
  const setOpen = useUiStore((s) => s.setQuickAddOpen);
  const pushToast = useUiStore((s) => s.pushToast);
  const openCard = useUiStore((s) => s.openCard);
  const locked = useLockStore((s) => s.locked);
  const queryClient = useQueryClient();
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const hintId = useId();
  const [text, setText] = useState('');
  const [ignoreWhen, setIgnoreWhen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      if (e.key.toLowerCase() !== 'j') return;
      e.preventDefault();
      if (!useLockStore.getState().locked) setOpen(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [setOpen]);

  const close = () => {
    setOpen(false);
    setText('');
    setIgnoreWhen(false);
  };

  useDialog({ open: open && !locked, onClose: close, containerRef: panelRef });

  const parsed = useMemo(() => parseQuickTask(text), [text]);
  const raw = text.trim().replace(/\s+/g, ' ');
  const title = ignoreWhen ? raw.charAt(0).toUpperCase() + raw.slice(1) : parsed.title;
  const remindAt = ignoreWhen ? null : parsed.remindAt;
  const dueDate = ignoreWhen ? null : parsed.dueDate;
  const hasWhen = !ignoreWhen && (parsed.remindAt !== null || parsed.dueDate !== null);

  const create = useMutation({
    mutationFn: async (input: {
      title: string;
      remindAt: string | null;
      dueDate: string | null;
    }) => {
      const card = await api.post<Card>('/api/cards', {
        list_id: null,
        title: input.title,
        due_date: input.dueDate,
      });
      if (input.remindAt) {
        try {
          await api.post('/api/reminders', {
            title: input.title,
            due_at: input.remindAt,
            card_id: card.id,
          });
        } catch {
          // Viec da tao: bao rieng phan nhac de nguoi dung dat lai trong the.
          return { card, reminderFailed: true };
        }
      }
      return { card, reminderFailed: false };
    },
    onSuccess: ({ card, reminderFailed }, input) => {
      invalidateCardViews(queryClient);
      void queryClient.invalidateQueries({ queryKey: ['reminders'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      const openAction = { label: 'Mở', run: () => openCard(card.id) };
      if (reminderFailed) {
        pushToast(`Đã tạo “${input.title}” nhưng chưa đặt được giờ nhắc`, 'error', openAction);
      } else {
        const when = input.remindAt ? ` · nhắc ${describeWhen(input.remindAt)}` : '';
        pushToast(`Đã tạo “${input.title}”${when}`, 'success', openAction);
      }
    },
    onError: (error) =>
      pushToast(error instanceof Error ? error.message : 'Không tạo được công việc'),
  });

  /** Enter: tao va dong. Shift+Enter: tao va go tiep viec khac. */
  const submit = (keepOpen: boolean) => {
    if (!title || create.isPending) return;
    create.mutate({ title, remindAt, dueDate });
    setText('');
    setIgnoreWhen(false);
    if (keepOpen) inputRef.current?.focus();
    else setOpen(false);
  };

  if (!open || locked) return null;

  return createPortal(
    <div
      className="tr-anim-fade fixed inset-0 z-modal flex items-start justify-center bg-tr-overlay p-4 pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="tr-modal tr-anim-pop w-full max-w-xl overflow-hidden rounded-modal bg-tr-panel shadow-2xl"
      >
        <h2 id={titleId} className="sr-only">
          Thêm việc nhanh
        </h2>
        <div className="flex items-center gap-3 px-4 py-3">
          <Zap size={18} className="shrink-0 text-tr-primary" aria-hidden="true" />
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (!e.target.value.trim()) setIgnoreWhen(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit(e.shiftKey);
              }
            }}
            placeholder="VD: mai 9h gọi anh Nam"
            aria-label="Nội dung việc, có thể kèm ngày giờ nhắc"
            aria-describedby={hintId}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent py-1 text-base text-tr-text outline-none placeholder:text-tr-muted"
          />
          <button
            type="button"
            onClick={close}
            aria-label="Đóng"
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-tr-muted transition hover:bg-tr-hover hover:text-tr-text fine:h-8 fine:w-8 ${focusRing}`}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {raw && (
          <div className="border-t border-tr-border px-4 py-3" aria-live="polite">
            <p className="text-sm text-tr-text">
              <span className="text-tr-muted">Việc: </span>
              {title || <span className="text-tr-muted italic">thêm tên việc</span>}
            </p>
            {hasWhen && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {remindAt ? (
                  <WhenChip
                    icon={<Bell size={13} aria-hidden="true" />}
                    label={`Nhắc ${describeWhen(remindAt)}`}
                  />
                ) : (
                  dueDate && (
                    <WhenChip
                      icon={<CalendarDays size={13} aria-hidden="true" />}
                      label={`Hạn ${describeWhen(dueDate)}`}
                    />
                  )
                )}
                <button
                  type="button"
                  onClick={() => {
                    setIgnoreWhen(true);
                    inputRef.current?.focus();
                  }}
                  className={`rounded-full px-2 py-0.5 text-xs text-tr-muted transition hover:bg-tr-hover hover:text-tr-text ${focusRing}`}
                >
                  Không phải ngày giờ
                </button>
              </div>
            )}
          </div>
        )}

        <div
          id={hintId}
          className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-tr-border bg-tr-surface px-4 py-2 text-xs text-tr-muted"
        >
          <span className="inline-flex items-center gap-1">
            <CornerDownLeft size={12} aria-hidden="true" /> Enter để tạo
          </span>
          <span>Shift + Enter tạo rồi nhập tiếp</span>
          <span>Giao cho bạn, vào danh sách mặc định</span>
        </div>
      </div>
    </div>,
    document.body
  );
}

function WhenChip({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-tr-primary/10 px-2.5 py-0.5 text-xs font-medium text-tr-primary">
      {icon}
      {label}
    </span>
  );
}
