import { useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Flag, Plus, X } from 'lucide-react';
import { api } from '../../api/client';
import { PRIORITY_COLORS, PRIORITY_ORDER, t } from '../../i18n/vi';
import { invalidateCardViews } from '../../lib/queryKeys';
import { describeWhen, parseQuickTask } from '../../lib/quickTaskParser';
import { useUiStore } from '../../stores/uiStore';
import type { Card, Priority } from '../../types';
import { DatePicker } from '../common/DatePicker';
import { Popover, PopoverItem, usePopover } from '../common/Popover';
import { Button, FormError, focusRing } from '../common/ui';
import { ReminderField } from './ReminderField';

/**
 * O them viec dau danh sach Cong viec (1.17.1).
 *
 * Mot o nhap lon hieu ngay gio nhu Ctrl+J ("mai 9h gọi anh Nam" → han mai, nhac
 * 9:00), ben duoi la thanh nut nho: Ưu tiên · Hạn · Nhắc lúc. Tu chon o thanh nut
 * thi thang phan tu hieu tu dong vua go. Them xong o van mo de go tiep.
 *
 * Truoc day la ba hang roi rac (o ten, o uu tien rong het dong, o ngay) — o
 * `Select` mac dinh `w-full` nen day moi thu xuong dong.
 */
export function TaskQuickAdd({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const openTaskComposer = useUiStore((state) => state.openTaskComposer);
  const openCard = useUiStore((state) => state.openCard);
  const pushToast = useUiStore((state) => state.pushToast);
  const inputRef = useRef<HTMLInputElement>(null);
  const priorityPop = usePopover();
  const duePop = usePopover();

  const [text, setText] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  /** `undefined` = lay tu dong vua go; con lai la nguoi dung tu chon (ke ca bo = null). */
  const [manualDue, setManualDue] = useState<string | null | undefined>(undefined);
  const [manualRemind, setManualRemind] = useState<string | null | undefined>(undefined);
  const [ignoreParse, setIgnoreParse] = useState(false);

  const raw = text.trim().replace(/\s+/g, ' ');
  const parsed = useMemo(() => parseQuickTask(text), [text]);
  const useParse = !ignoreParse && (parsed.remindAt !== null || parsed.dueDate !== null);
  const title = useParse ? parsed.title : raw.charAt(0).toUpperCase() + raw.slice(1);
  const dueDate = manualDue !== undefined ? manualDue : useParse ? parsed.dueDate : null;
  const remindAt = manualRemind !== undefined ? manualRemind : useParse ? parsed.remindAt : null;
  const dueFromText = manualDue === undefined && useParse && parsed.dueDate !== null;
  const remindFromText = manualRemind === undefined && useParse && parsed.remindAt !== null;

  const reset = () => {
    setText('');
    setManualDue(undefined);
    setManualRemind(undefined);
    setIgnoreParse(false);
  };

  const create = useMutation({
    mutationFn: async (input: {
      title: string;
      priority: Priority;
      dueDate: string | null;
      remindAt: string | null;
    }) => {
      const card = await api.post<Card>('/api/cards', {
        title: input.title,
        priority: input.priority,
        due_date: input.dueDate,
      });
      let reminderFailed = false;
      if (input.remindAt) {
        await api
          .post('/api/reminders', { title: input.title, due_at: input.remindAt, card_id: card.id })
          .catch(() => {
            reminderFailed = true;
          });
      }
      return { card, reminderFailed };
    },
    onSuccess: ({ card, reminderFailed }, input) => {
      invalidateCardViews(queryClient);
      void queryClient.invalidateQueries({ queryKey: ['reminders'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      const action = { label: 'Mở', run: () => openCard(card.id, 'drawer') };
      if (reminderFailed) {
        pushToast(`Đã tạo “${input.title}” nhưng chưa đặt được giờ nhắc`, 'error', action);
      } else {
        const when = input.remindAt ? ` · nhắc ${describeWhen(input.remindAt)}` : '';
        pushToast(`Đã tạo “${input.title}”${when}`, 'success', action);
      }
    },
  });

  const submit = () => {
    if (!title || create.isPending) return;
    create.mutate({ title, priority, dueDate, remindAt });
    reset();
    inputRef.current?.focus();
  };

  return (
    <div className="border-b border-tr-border bg-tr-primary/5 px-3 py-3 lg:px-5">
      <FormError error={create.error} />
      <div className="rounded-panel border border-tr-primary/40 bg-tr-panel shadow-sm focus-within:border-tr-primary focus-within:ring-2 focus-within:ring-tr-primary/15">
        <div className="flex items-center gap-2 pr-1 pl-3">
          <Plus size={18} className="shrink-0 text-tr-primary" aria-hidden="true" />
          <input
            ref={inputRef}
            autoFocus
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              if (!event.target.value.trim()) setIgnoreParse(false);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submit();
              }
              if (event.key === 'Escape') onClose();
            }}
            placeholder="Thêm việc… vd: mai 9h gọi anh Nam"
            aria-label="Tên công việc mới, có thể kèm ngày giờ nhắc"
            autoComplete="off"
            className="h-12 min-w-0 flex-1 bg-transparent text-sm text-tr-text outline-none placeholder:text-tr-muted"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng thêm nhanh"
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-tr-muted hover:bg-tr-hover hover:text-tr-text fine:h-8 fine:w-8 ${focusRing}`}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-t border-tr-border px-2 py-2">
          <ChipButton
            onClick={priorityPop.toggle}
            expanded={priorityPop.open}
            label={`Ưu tiên: ${t.priority[priority]}`}
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: PRIORITY_COLORS[priority] }}
              aria-hidden="true"
            />
            {t.priority[priority]}
          </ChipButton>

          <span className="inline-flex items-center">
            <ChipButton
              onClick={duePop.toggle}
              expanded={duePop.open}
              active={dueDate !== null}
              label={dueDate ? `Hạn ${describeWhen(dueDate)}` : 'Đặt hạn'}
            >
              <Flag size={13} aria-hidden="true" />
              {dueDate ? `Hạn ${describeWhen(dueDate)}` : 'Hạn'}
              {dueFromText && <span className="font-normal text-tr-muted">· tự hiểu</span>}
            </ChipButton>
            {dueDate && (
              <button
                type="button"
                onClick={() => setManualDue(null)}
                aria-label="Bỏ hạn"
                className={`ml-0.5 flex h-7 w-7 items-center justify-center rounded-full text-tr-muted hover:bg-tr-hover hover:text-tr-text ${focusRing}`}
              >
                <X size={12} aria-hidden="true" />
              </button>
            )}
          </span>

          <ReminderField
            variant="chip"
            value={remindAt}
            onChange={setManualRemind}
            dueDate={dueDate}
            hint={remindFromText ? 'tự hiểu' : undefined}
          />

          {useParse && (
            <button
              type="button"
              onClick={() => {
                setIgnoreParse(true);
                inputRef.current?.focus();
              }}
              className={`rounded-full px-2 py-1 text-xs text-tr-muted hover:bg-tr-hover hover:text-tr-text ${focusRing}`}
            >
              Không phải ngày giờ
            </button>
          )}

          <span className="flex-1" />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              openTaskComposer({
                context: {},
                draft: { title, priority, dueDate, remindAt },
              });
              onClose();
            }}
          >
            Chi tiết…
          </Button>
          <Button size="sm" variant="primary" disabled={!title} onClick={submit}>
            Thêm
          </Button>
        </div>
      </div>
      <p className="mt-1.5 px-1 text-xs text-tr-muted">
        Gõ kèm giờ như “mai 9h”, “thứ 6 14h”, “30 phút nữa” để tự đặt hạn và giờ nhắc · Enter để
        thêm · Esc để đóng
      </p>

      <Popover
        open={priorityPop.open}
        anchor={priorityPop.anchor}
        onClose={priorityPop.close}
        title={t.card.priority}
        width={200}
      >
        {PRIORITY_ORDER.map((value) => (
          <PopoverItem
            key={value}
            icon={
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: PRIORITY_COLORS[value] }}
              />
            }
            onClick={() => {
              setPriority(value);
              priorityPop.close();
            }}
          >
            {t.priority[value]}
          </PopoverItem>
        ))}
      </Popover>
      <Popover
        open={duePop.open}
        anchor={duePop.anchor}
        onClose={duePop.close}
        title="Hạn hoàn thành"
        width={288}
      >
        <DatePicker
          value={dueDate}
          onSelect={(value) => {
            setManualDue(value);
            duePop.close();
          }}
        />
      </Popover>
    </div>
  );
}

function ChipButton({
  children,
  onClick,
  expanded,
  active = true,
  label,
}: {
  children: ReactNode;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  expanded: boolean;
  active?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      aria-label={label}
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs transition hover:border-tr-primary ${
        active
          ? 'border-tr-border bg-tr-panel font-medium text-tr-text'
          : 'border-tr-border bg-tr-panel text-tr-muted'
      } ${focusRing}`}
    >
      {children}
    </button>
  );
}
