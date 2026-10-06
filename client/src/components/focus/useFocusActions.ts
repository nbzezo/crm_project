import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, isUserCancelled } from '../../api/client';
import { invalidateCalendar, invalidateCardViews, invalidateCrmViews } from '../../lib/queryKeys';
import { useUiStore } from '../../stores/uiStore';
import type { AgendaItem } from './focusTypes';

/** Ly do ghi kem vao lich su doi han (card_due_changes) khi doi tu man hinh nay. */
const DUE_REASON = 'Dời hạn từ màn Trọng tâm';

/** Muc nao doi ngay duoc ngay tren man hinh Trong tam. */
export function canReschedule(item: AgendaItem): boolean {
  return (
    !item.done && (item.kind === 'card' || item.kind === 'reminder' || item.kind === 'next_action')
  );
}

export function canComplete(item: AgendaItem): boolean {
  return !item.done && (item.kind === 'card' || item.kind === 'reminder');
}

async function patchDate(item: AgendaItem, date: string) {
  if (item.kind === 'card')
    await api.patch(`/api/cards/${item.id}`, { due_date: date, due_reason: DUE_REASON });
  else if (item.kind === 'reminder')
    await api.patch(`/api/reminders/${item.id}`, { due_at: `${date}T${item.time ?? '08:00'}` });
  else if (item.kind === 'next_action')
    await api.patch(`/api/deals/${item.id}`, { next_action_date: date });
}

async function patchDone(item: AgendaItem, done: boolean) {
  if (item.kind === 'card') await api.patch(`/api/cards/${item.id}`, { is_done: done });
  else if (item.kind === 'reminder')
    await api.patch(`/api/reminders/${item.id}`, { is_done: done });
}

/**
 * Thao tac nhanh tren mot muc: xong / doi ngay, kem "Hoàn tác" o toast.
 *
 * Goi API ngay (khong tre nhu undoableDelete) — doi han va danh dau xong deu
 * dao nguoc duoc bang mot PATCH nguoc lai, khong mat du lieu.
 */
export function useFocusActions() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);

  const refresh = (item: AgendaItem) => {
    if (item.kind === 'next_action') invalidateCrmViews(queryClient);
    else if (item.kind === 'reminder') invalidateCalendar(queryClient);
    invalidateCardViews(queryClient);
  };

  const reschedule = useMutation({
    mutationFn: ({ item, date }: { item: AgendaItem; date: string }) => patchDate(item, date),
    onSuccess: (_data, { item, date }) => {
      refresh(item);
      pushToast(`Đã dời “${item.title}” sang ${date.slice(8, 10)}/${date.slice(5, 7)}`, 'success', {
        label: 'Hoàn tác',
        run: () => {
          void patchDate(item, item.date).then(() => refresh(item));
        },
      });
    },
    onError: (error) => pushToast(error instanceof Error ? error.message : 'Không dời được'),
  });

  const complete = useMutation({
    mutationFn: (item: AgendaItem) => patchDone(item, true),
    onSuccess: (_data, item) => {
      refresh(item);
      pushToast(`Đã xong “${item.title}”`, 'success', {
        label: 'Hoàn tác',
        run: () => {
          void patchDone(item, false).then(() => refresh(item));
        },
      });
    },
    onError: (error) => {
      if (!isUserCancelled(error)) {
        pushToast(error instanceof Error ? error.message : 'Không cập nhật được');
      }
    },
  });

  return {
    reschedule: (item: AgendaItem, date: string) => {
      if (date !== item.date) reschedule.mutate({ item, date });
    },
    complete: (item: AgendaItem) => complete.mutate(item),
    pending: reschedule.isPending || complete.isPending,
  };
}
