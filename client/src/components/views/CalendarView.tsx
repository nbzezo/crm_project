import { useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import viLocale from '@fullcalendar/core/locales/vi';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, qs } from '../../api/client';
import { PRIORITY_COLORS, t } from '../../i18n/vi';
import { formatVNDShort } from '../../lib/format';
import { invalidateCardViews } from '../../lib/queryKeys';
import { useUiStore } from '../../stores/uiStore';
import { ErrorState } from '../common/ui';
import type { CalendarEvent } from '../../types';

/** Mau su kien khong phai the — dung chung cho ca chu giai va chinh su kien. */
const EVENT_COLORS = {
  reminder: '#eda100',
  nextAction: '#eb6834',
  dealClose: '#9f8fef',
  contract: '#6cc3e0',
} as const;

/** Lịch dùng chung: bỏ trống boardId là xem toàn bộ, truyền vào là xem trong một bảng. */
export function CalendarView({ boardId }: { boardId?: number }) {
  const queryClient = useQueryClient();
  const openCard = useUiStore((s) => s.openCard);
  const pushToast = useUiStore((s) => s.pushToast);
  const [range, setRange] = useState<{ from: string; to: string }>({ from: '', to: '' });

  const { data: events = [], error } = useQuery({
    queryKey: ['calendar', range.from, range.to, boardId ?? 'all'],
    queryFn: () =>
      api.get<CalendarEvent[]>(`/api/views/calendar${qs({ ...range, board_id: boardId })}`),
    enabled: range.from !== '',
  });

  const reschedule = useMutation({
    mutationFn: (vars: { id: number; due_date: string }) =>
      api.patch(`/api/cards/${vars.id}`, { due_date: vars.due_date }),
    onSuccess: () => invalidateCardViews(queryClient),
    // onError o cap mutation ghi de toast mac dinh trong main.tsx — phai tu bao
    // loi, neu khong su kien chi lang le nhay ve cho cu.
    onError: (err) => {
      pushToast(err instanceof Error ? err.message : t.common.saveError);
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
    },
  });

  const fcEvents = events.map((event) => {
    if (event.kind === 'card') {
      return {
        id: `card-${event.id}`,
        title: event.title,
        start: event.date,
        allDay: true,
        backgroundColor: PRIORITY_COLORS[event.priority],
        borderColor: PRIORITY_COLORS[event.priority],
        textColor: '#fff',
        editable: true,
        extendedProps: { kind: 'card', cardId: event.id },
      };
    }
    if (event.kind === 'reminder') {
      return {
        id: `reminder-${event.id}`,
        title: `🔔 ${event.time} ${event.title}`,
        start: event.date,
        allDay: true,
        backgroundColor: EVENT_COLORS.reminder,
        borderColor: EVENT_COLORS.reminder,
        textColor: '#1d2125',
        editable: false,
        extendedProps: { kind: 'reminder', cardId: event.card_id },
      };
    }
    if (event.kind === 'next_action') {
      return {
        id: `action-${event.id}`,
        title: `➡ ${event.title} · ${event.customer_name}`,
        start: event.date,
        allDay: true,
        backgroundColor: EVENT_COLORS.nextAction,
        borderColor: EVENT_COLORS.nextAction,
        textColor: '#fff',
        editable: false,
        extendedProps: { kind: 'next_action' },
      };
    }
    const isDeal = event.kind === 'deal_close';
    return {
      id: `${event.kind}-${event.id}`,
      title: isDeal
        ? `💰 ${event.title} · ${formatVNDShort(event.value_vnd)}`
        : `📄 ${event.title}`,
      start: event.date,
      allDay: true,
      backgroundColor: isDeal ? EVENT_COLORS.dealClose : EVENT_COLORS.contract,
      borderColor: isDeal ? EVENT_COLORS.dealClose : EVENT_COLORS.contract,
      textColor: '#1d2125',
      editable: false,
      extendedProps: { kind: event.kind },
    };
  });

  if (error) {
    return (
      <ErrorState
        onRetry={() => queryClient.invalidateQueries({ queryKey: ['calendar'] })}
      />
    );
  }

  return (
    <div className="rounded-panel border border-tr-border bg-tr-panel p-3 shadow-sm sm:p-4">
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-tr-muted">
        <Legend color={PRIORITY_COLORS.urgent} label={`${t.nav.tasks} (màu theo mức ưu tiên)`} />
        <Legend color={EVENT_COLORS.reminder} label={t.reminder.reminders} />
        {boardId === undefined && (
          <>
            <Legend color={EVENT_COLORS.nextAction} label="Hành động tiếp theo của cơ hội" />
            <Legend color={EVENT_COLORS.dealClose} label="Cơ hội — dự kiến chốt" />
            <Legend color={EVENT_COLORS.contract} label="Hợp đồng — ngày hết hạn" />
          </>
        )}
      </div>

      <FullCalendar
        plugins={[dayGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        locale={viLocale}
        firstDay={1}
        height="auto"
        editable
        /* true = tu tinh theo chieu cao o thay vi cat cung o 4 su kien */
        dayMaxEvents
        /* Truoc day right='' nen khong co cach nao doi che do xem.
           Ca ba che do deu thuoc dayGridPlugin — khong can them phu thuoc. */
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,dayGridWeek,dayGridDay',
        }}
        buttonText={{ today: t.common.today, month: 'Tháng', week: 'Tuần', day: 'Ngày' }}
        events={fcEvents}
        datesSet={(info) =>
          setRange({ from: info.startStr.slice(0, 10), to: info.endStr.slice(0, 10) })
        }
        eventClick={(info) => {
          const cardId = info.event.extendedProps.cardId as number | null;
          if (cardId) openCard(cardId);
        }}
        eventDrop={(info) => {
          const kind = info.event.extendedProps.kind as string;
          const cardId = info.event.extendedProps.cardId as number;
          if (kind !== 'card' || !info.event.startStr) {
            info.revert();
            return;
          }
          reschedule.mutate({ id: cardId, due_date: info.event.startStr.slice(0, 10) });
        }}
      />
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
