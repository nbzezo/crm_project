import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import viLocale from '@fullcalendar/core/locales/vi';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, qs } from '../../api/client';
import { PRIORITY_COLORS, t } from '../../i18n/vi';
import { todayStr } from '../../lib/format';
import { invalidateCardViews } from '../../lib/queryKeys';
import { useUiStore } from '../../stores/uiStore';
import { ErrorState, Skeleton } from '../common/ui';
import { CalendarToolbar } from '../calendar/CalendarToolbar';
import { CalendarList } from '../calendar/CalendarList';
import { EventChip } from '../calendar/EventChip';
import { EventDrawer } from '../calendar/EventDrawer';
import { EventTooltip, type TooltipTarget } from '../calendar/EventTooltip';
import {
  EventForm,
  draftFromRow,
  draftFromSlot,
  draftToApi,
  type EventDraft,
} from '../calendar/EventForm';
import { useCalendarEvents } from '../calendar/useCalendarEvents';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { slotBounds, toCalEvent, type CalEvent } from '../calendar/calendarModel';
import {
  FC_VIEW,
  defaultView,
  isViewMode,
  normalizeDate,
  rangeFor,
  rememberView,
  type CalendarViewMode,
} from '../calendar/calendarPrefs';
import type { CalendarConflict, CalendarItem } from '../../types';

/**
 * Lich dung chung. Bo trong ca hai khoa la xem toan bo; truyen `boardId` la pham
 * vi mot bang, `projectId` la pham vi mot du an (v19).
 *
 * `scoped` gom hai truong hop lai: ca hai deu la khung nhin thu hep, nen deu KHONG
 * co du lieu ngoai cong viec (lich ca nhan, moc CRM) va khong tao su kien duoc.
 */
export function CalendarView({ boardId, projectId }: { boardId?: number; projectId?: number }) {
  const scoped = boardId !== undefined || projectId !== undefined;
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);

  /**
   * View + ngay nam trong URL (`cv` / `cd`) nen F5, nut Back va chia se link
   * deu giu nguyen man hinh. Dat ten rieng chu khong dung `view` vi BoardPage
   * da chiem tham so do cho tab cua no.
   */
  const [searchParams, setSearchParams] = useSearchParams();
  /* Chi tinh mot lan: gia tri du phong khi URL chua noi gi. Doc localStorage moi
     lan render se lam view nhay khi nguoi dung doi lua chon o tab khac. */
  const [fallbackView] = useState(defaultView);
  /* View SUY RA tu URL chu khong giu state rieng — neu giu rieng thi bam Back
     se doi URL ma man hinh dung yen. */
  const cv = searchParams.get('cv');
  const view: CalendarViewMode = isViewMode(cv) ? cv : fallbackView;
  const date = normalizeDate(searchParams.get('cd'));

  // Muc 7: ghi nho ca khi view den tu URL, khong chi khi bam nut.
  useEffect(() => {
    rememberView(view);
  }, [view]);

  const patchParams = useCallback(
    (patch: Record<string, string>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch)) next.set(key, value);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const setView = useCallback(
    (next: CalendarViewMode) => patchParams({ cv: next, cd: date }),
    [patchParams, date]
  );

  const setDate = useCallback(
    (next: string) => patchParams({ cv: view, cd: next }),
    [patchParams, view]
  );

  const range = useMemo(() => rangeFor(view, date), [view, date]);

  const {
    data: events = [],
    error,
    isPending,
  } = useQuery({
    queryKey: ['calendar', range.from, range.to, boardId ?? 'all', projectId ?? 'all'],
    queryFn: () =>
      api.get<CalendarItem[]>(
        `/api/views/calendar${qs({ ...range, board_id: boardId, project_id: projectId })}`
      ),
    // Giu du lieu ky truoc khi dang tai ky moi — neu khong luoi se nhay rong
    // mot nhip moi lan bam lui/toi.
    placeholderData: keepPreviousData,
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

  const items = useMemo(() => {
    const today = todayStr();
    return events.map((event) => toCalEvent(event, today));
  }, [events]);

  /* Muc 20: bam su kien KHONG dieu huong — luon mo ngan keo. Day cung la cho
     sua ba "ngo cut" cu (co hoi / hop dong / nhac hen khong gan the truoc day
     bam vao khong co gi xay ra). */
  const [selected, setSelected] = useState<CalEvent | null>(null);
  const openedFocus = useRef<string | null>(null);

  /* Link tu trung tam thong bao co `focus=<source>-<id>`. Khi du lieu cua ngay
     dich tai xong, mo thang ngan keo cua dung muc thay vi chi dua nguoi dung toi
     mot trang lich chung chung. Xoa tham so sau khi mo de Back/F5 khong bat lai. */
  useEffect(() => {
    const focus = searchParams.get('focus');
    if (!focus || openedFocus.current === focus) return;
    const match = items.find((item) => item.key === focus);
    if (!match) return;
    openedFocus.current = focus;
    setSelected(match);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('focus');
        return next;
      },
      { replace: true }
    );
  }, [items, searchParams, setSearchParams]);

  /* Bieu mau tao/sua. `editingId` null = dang tao moi. */
  const [form, setForm] = useState<{ draft: EventDraft; editingId: number | null } | null>(null);
  const [conflicts, setConflicts] = useState<CalendarConflict[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<CalEvent | null>(null);
  const { create, update, remove } = useCalendarEvents();

  const openCreate = useCallback((startAt: string, endAt: string, allDay: boolean) => {
    setConflicts([]);
    setForm({ draft: draftFromSlot(startAt, endAt, allDay), editingId: null });
  }, []);

  const submit = (draft: EventDraft) => {
    const body = draftToApi(draft);
    const done = (res: { conflicts?: CalendarConflict[] }) => {
      // Muc 45: trung lich chi la CANH BAO. Con trung thi giu form mo de nguoi
      // dung tu quyet — server da luu roi, khong chan.
      if (res.conflicts && res.conflicts.length > 0) {
        setConflicts(res.conflicts);
        return;
      }
      setForm(null);
      setConflicts([]);
    };
    if (form?.editingId) update.mutate({ id: form.editingId, body }, { onSuccess: done });
    else create.mutate(body, { onSuccess: done });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-panel border border-tr-border bg-tr-panel p-3 shadow-sm sm:p-4">
      <CalendarToolbar
        view={view}
        date={date}
        onViewChange={setView}
        onDateChange={setDate}
        /* Lich ca nhan khong thuoc bang nao, nen tab Lich trong Bang khong tao duoc. */
        onCreate={scoped ? undefined : () => openCreate(`${date}T09:00`, `${date}T10:00`, false)}
      />

      <div className="mb-3 flex shrink-0 flex-wrap gap-x-4 gap-y-1 text-xs text-tr-muted">
        <Legend color={PRIORITY_COLORS.urgent} label={t.calendar.legendTasks} />
        <Legend color="var(--cal-reminder-bg)" label={t.reminder.reminders} />
        {!scoped && (
          <>
            <Legend color="var(--cal-next-action-bg)" label={t.calendar.legendNextAction} />
            <Legend color="var(--cal-deal-close-bg)" label={t.calendar.legendDealClose} />
            <Legend color="var(--cal-contract-end-bg)" label={t.calendar.legendContractEnd} />
          </>
        )}
      </div>

      {/* Loi chi thay the phan noi dung — thanh cong cu van song de con doi
          ky/che do xem thay vi ket cung o mot man hinh loi. */}
      {error ? (
        <div className="min-h-0 flex-1">
          <ErrorState onRetry={() => queryClient.invalidateQueries({ queryKey: ['calendar'] })} />
        </div>
      ) : (
        <div className="relative min-h-0 flex-1">
          {isPending && <GridSkeleton />}
          {view === 'list' ? (
            <CalendarList events={items} onSelect={setSelected} />
          ) : (
            <CalendarGrid
              view={view}
              date={date}
              items={items}
              onDateChange={setDate}
              onOpen={setSelected}
              onCardDrop={(id, due_date) => reschedule.mutate({ id, due_date })}
              onCreateSlot={scoped ? undefined : openCreate}
            />
          )}
          {/* Muc 49 — ngay trong khong nen la mot luoi im lang. */}
          {view === 'day' && !isPending && items.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <p className="rounded-panel bg-tr-panel/90 px-4 py-2 text-sm text-tr-muted">
                {t.calendar.emptyDay}
              </p>
            </div>
          )}
        </div>
      )}

      <EventDrawer
        item={selected}
        onClose={() => setSelected(null)}
        onEdit={(item) => {
          if (!item.row) return;
          setConflicts([]);
          setForm({ draft: draftFromRow(item.row), editingId: item.id });
          setSelected(null);
        }}
        onComplete={(item) => {
          update.mutate({ id: item.id, body: { status: 'done' } });
          setSelected(null);
        }}
        onDelete={(item) => {
          setConfirmDelete(item);
          setSelected(null);
        }}
      />

      {form && (
        <EventForm
          open
          /* `key` buoc React dung state noi bo moi khi doi sang su kien khac —
             neu khong bieu mau se giu lai gia tri cua lan mo truoc. */
          key={form.editingId ?? `new-${form.draft.startDate}-${form.draft.startTime}`}
          initial={form.draft}
          editing={form.editingId !== null}
          saving={create.isPending || update.isPending}
          error={create.error ?? update.error}
          conflicts={conflicts}
          onSave={submit}
          onClose={() => {
            setForm(null);
            setConflicts([]);
          }}
        />
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        message={t.calendar.confirmDelete}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) remove.mutate(confirmDelete.id);
          setConfirmDelete(null);
        }}
      />
    </div>
  );
}

function GridSkeleton() {
  return (
    <div aria-hidden="true" className="absolute inset-0 z-10 flex flex-col gap-1.5 bg-tr-panel p-1">
      <Skeleton className="h-8 w-full" />
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="w-full flex-1" />
      ))}
    </div>
  );
}

interface GridProps {
  view: Exclude<CalendarViewMode, 'list'>;
  date: string;
  items: CalEvent[];
  onDateChange: (date: string) => void;
  onOpen: (item: CalEvent) => void;
  onCardDrop: (id: number, dueDate: string) => void;
  /** Muc 17: bam mot ngay (Thang) hoac keo mot khoang gio (Tuan/Ngay) de tao. */
  onCreateSlot?: (startAt: string, endAt: string, allDay: boolean) => void;
}

function CalendarGrid({
  view,
  date,
  items,
  onDateChange,
  onOpen,
  onCardDrop,
  onCreateSlot,
}: GridProps) {
  const calendarRef = useRef<FullCalendar>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  /**
   * FullCalendar chi do lai kich thuoc khi `window` doi kich thuoc. Thu gon thanh
   * ben, hien/an thanh dock cua bang, hay thanh cong cu xuong dong deu khong kich
   * hoat no — nen phai tu theo doi chinh o chua. Cung la thu sua ca "do luc flex
   * chua tinh xong nen cao 0px" o lan ve dau tien.
   */
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => calendarRef.current?.getApi().updateSize());
    });
    observer.observe(box);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  /**
   * FullCalendar khong co prop `view`/`date` dieu khien duoc — phai goi lenh.
   * Co chan bang so sanh trang thai hien tai de vong lap
   * `datesSet -> setState -> effect -> gotoDate` khong tu kich hoat mai.
   */
  useEffect(() => {
    const calendarApi = calendarRef.current?.getApi();
    if (!calendarApi) return;
    if (calendarApi.view.type !== FC_VIEW[view]) calendarApi.changeView(FC_VIEW[view]);
    const current = calendarApi.getDate();
    if (
      `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(
        current.getDate()
      ).padStart(2, '0')}` !== date
    ) {
      calendarApi.gotoDate(date);
    }
  }, [view, date]);

  const [tooltip, setTooltip] = useState<TooltipTarget | null>(null);

  const fcEvents = useMemo(
    () =>
      items.map((item) => ({
        id: item.key,
        // Tieu de tho, khong emoji — phan hien thi do `renderChip` lo.
        // Van can `title` de FullCalendar co gi do sap xep / doc man hinh.
        title: item.title,
        // Su kien co gio (nhac hen) dat dung vi tri tren truc gio o Week/Day;
        // cac nguon chi co ngay nam o dai ca ngay.
        start: item.time ? `${item.date}T${item.time}` : item.date,
        // `end` cung la moc LOAI TRU o ca hai phia nen truyen thang. Thieu no thi
        // su kien nhieu ngay chi to duoc mot o.
        end: item.end ?? undefined,
        allDay: item.time === null,
        backgroundColor: item.bg,
        borderColor: item.bg,
        textColor: item.fg,
        // Kha nang duoc do thang vao FullCalendar: khong co quyen thi khong co
        // ca bong keo lan tay cam resize — nguoi dung khong thu duoc dieu cam.
        editable: item.caps.moveDate || item.caps.moveTime,
        startEditable: item.caps.moveDate || item.caps.moveTime,
        durationEditable: item.caps.resize,
        classNames: [
          item.done ? 'cal-done' : '',
          item.overdue && !item.done ? 'cal-overdue' : '',
          item.caps.moveDate || item.caps.moveTime ? '' : 'cal-static',
        ].filter(Boolean),
        extendedProps: { item },
      })),
    [items]
  );

  const { min, max } = useMemo(() => slotBounds(items, new Date().getHours()), [items]);

  return (
    <div ref={boxRef} className="h-full">
      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView={FC_VIEW[view]}
        initialDate={date}
        locale={viLocale}
        timeZone="local"
        firstDay={1}
        /* Muc 6: lap day chieu cao con lai. Can cha co chieu cao xac dinh —
           chuoi `min-h-0 flex-1` phia tren cung cap dung dieu do. */
        height="100%"
        expandRows
        stickyHeaderDates
        /* Thanh cong cu do ung dung tu dung — che do Danh sach khong di qua
           FullCalendar nen dung thanh cua no se lam hai nua giao dien lech nhau. */
        headerToolbar={false}
        editable
        /* true = tu tinh theo chieu cao o thay vi cat cung o 4 su kien */
        dayMaxEvents
        moreLinkContent={(arg) => `+${arg.num} ${t.calendar.moreEvents}`}
        /* Muc 12 — khung gio mac dinh 06:00–23:00, tu noi ra neu co su kien
           nam ngoai de no khong bien mat. Muc 13 — duong chi gio hien tai. */
        slotMinTime={min}
        slotMaxTime={max}
        slotDuration="00:30:00"
        scrollTime="07:00:00"
        nowIndicator
        allDaySlot
        allDayText="Cả ngày"
        events={fcEvents}
        eventContent={renderChip}
        selectable={onCreateSlot !== undefined}
        selectMirror
        /* Cach 2 (muc 17): bam mot ngay trong luoi Thang -> tao lich ca ngay do. */
        dateClick={(info) => {
          if (!onCreateSlot || view !== 'month') return;
          onCreateSlot(
            `${info.dateStr.slice(0, 10)}T09:00`,
            `${info.dateStr.slice(0, 10)}T10:00`,
            false
          );
        }}
        /* Cach 3: keo mot khoang gio trong Tuan/Ngay -> form tu dien gio.
           `startStr`/`endStr` da la gio dia phuong — CAT chuoi, khong parse qua Date. */
        select={(info) => {
          if (!onCreateSlot || view === 'month') return;
          onCreateSlot(info.startStr.slice(0, 16), info.endStr.slice(0, 16), info.allDay);
        }}
        eventMouseEnter={(info) =>
          setTooltip({
            item: info.event.extendedProps.item as CalEvent,
            x: info.jsEvent.clientX,
            y: info.jsEvent.clientY,
          })
        }
        eventMouseLeave={() => setTooltip(null)}
        datesSet={(info) => {
          // An toan hai chieu: neu FullCalendar tu nhay ky (vi du bam vao so ngay)
          // thi keo trang thai cua ung dung theo.
          const start = info.view.currentStart;
          const iso = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(
            2,
            '0'
          )}-${String(start.getDate()).padStart(2, '0')}`;
          if (view === 'day' && iso !== date) onDateChange(iso);
        }}
        eventClick={(info) => onOpen(info.event.extendedProps.item as CalEvent)}
        eventDrop={(info) => {
          const item = info.event.extendedProps.item as CalEvent;
          // Tu choi TRUOC khi goi API — day la truong hop duy nhat duoc dung
          // `revert()`, vi chua co thay doi nao trong bo dem de hoan lai.
          if (!item.caps.moveDate || item.cardId === null || !info.event.startStr) {
            info.revert();
            return;
          }
          onCardDrop(item.cardId, info.event.startStr.slice(0, 10));
        }}
      />
      <EventTooltip target={tooltip} />
    </div>
  );
}

/**
 * Dinh nghia o cap module — KHONG duoc truyen ham inline cho `eventContent`.
 * Moi lan cha render lai, mot ham moi se buoc FullCalendar ve lai TOAN BO
 * su kien; voi o tim kiem go phim thi day la mot vong ve lai moi ky tu.
 */
function renderChip(arg: { event: { extendedProps: Record<string, unknown> } }) {
  return <EventChip item={arg.event.extendedProps.item as CalEvent} />;
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
