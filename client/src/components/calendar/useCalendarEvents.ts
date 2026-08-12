import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { t } from '../../i18n/vi';
import { invalidateCalendar } from '../../lib/queryKeys';
import { useUiStore } from '../../stores/uiStore';
import type { CalendarConflict, CalendarEventRow } from '../../types';

type EventResponse = CalendarEventRow & { conflicts?: CalendarConflict[] };

/**
 * CRUD cho lich ca nhan.
 *
 * Moi mutation deu tu goi `pushToast` khi loi: `onError` mac dinh o main.tsx bi
 * THAY THE chu khong hop nhat, nen dinh nghia `onError` rieng ma quen bao loi
 * se lam that bai im lang.
 *
 * Chi lam moi khoa `['calendar']` — su kien ca nhan khong dinh toi cong viec,
 * dong thoi gian hay tong quan, nen goi `invalidateCardViews` (6 tien to) se
 * lam thao tac i ma khong duoc gi.
 */
export function useCalendarEvents() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);

  const fail = (err: unknown) => pushToast(err instanceof Error ? err.message : t.common.saveError);

  const create = useMutation({
    mutationFn: (body: unknown) => api.post<EventResponse>('/api/calendar/events', body),
    onSuccess: () => {
      invalidateCalendar(queryClient);
      pushToast(t.calendar.created, 'success');
    },
    onError: fail,
  });

  const update = useMutation({
    mutationFn: (vars: { id: number; body: unknown }) =>
      api.patch<EventResponse>(`/api/calendar/events/${vars.id}`, vars.body),
    onSuccess: () => {
      invalidateCalendar(queryClient);
      pushToast(t.calendar.updated, 'success');
    },
    onError: fail,
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/api/calendar/events/${id}`),
    onSuccess: () => {
      invalidateCalendar(queryClient);
      pushToast(t.calendar.deleted, 'success');
    },
    onError: fail,
  });

  return { create, update, remove };
}
