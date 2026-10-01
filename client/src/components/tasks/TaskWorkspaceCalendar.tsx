import { useMemo, useState } from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { vi } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useUiStore } from '../../stores/uiStore';
import type { TaskRow } from '../../types';
import { Button, focusRing } from '../common/ui';
import { TaskCardRow } from './TaskCardRow';
import { flattenHierarchy } from './taskHierarchy';

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export function TaskWorkspaceCalendar({ tasks }: { tasks: TaskRow[] }) {
  const openCard = useUiStore((state) => state.openCard);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const days = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
        end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
      }),
    [month]
  );
  const byDay = useMemo(() => {
    const map = new Map<string, TaskRow[]>();
    for (const task of tasks) {
      if (!task.due_date) continue;
      const key = task.due_date.slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), task]);
    }
    // Trong mỗi ngày, việc con đi ngay dưới việc cha (nếu cùng ngày).
    for (const [key, list] of map)
      map.set(
        key,
        flattenHierarchy(list).map((row) => row.task)
      );
    return map;
  }, [tasks]);
  const parentTitle = useMemo(() => new Map(tasks.map((task) => [task.id, task.title])), [tasks]);
  const depthOf = (task: TaskRow, dayTasks: TaskRow[]) =>
    task.parent_id && dayTasks.some((other) => other.id === task.parent_id) ? 1 : 0;
  const today = new Date();

  return (
    <section
      className="overflow-hidden rounded-panel border border-tr-border bg-tr-panel shadow-sm"
      aria-label="Lịch công việc"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-tr-border px-3 py-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            aria-label="Tháng trước"
            onClick={() => setMonth((value) => subMonths(value, 1))}
          >
            <ChevronLeft size={16} />
          </Button>
          <Button
            variant="ghost"
            aria-label="Tháng sau"
            onClick={() => setMonth((value) => addMonths(value, 1))}
          >
            <ChevronRight size={16} />
          </Button>
          <Button variant="ghost" onClick={() => setMonth(startOfMonth(new Date()))}>
            Hôm nay
          </Button>
        </div>
        <h2 className="text-sm font-semibold capitalize text-tr-text">
          {format(month, "'Tháng' M, yyyy", { locale: vi })}
        </h2>
      </header>
      <div className="tr-scroll max-h-[65dvh] overflow-y-auto md:hidden">
        {days
          .filter(
            (day) =>
              isSameMonth(day, month) && (byDay.get(format(day, 'yyyy-MM-dd'))?.length ?? 0) > 0
          )
          .map((day) => (
            <div key={format(day, 'yyyy-MM-dd')}>
              <h3 className="sticky top-0 z-10 bg-tr-surface px-3 py-2 text-sm font-semibold text-tr-text">
                {format(day, 'EEEE, d/M', { locale: vi })}
              </h3>
              {(byDay.get(format(day, 'yyyy-MM-dd')) ?? []).map((task, _i, list) => (
                <TaskCardRow
                  key={task.id}
                  task={task}
                  depth={depthOf(task, list)}
                  onOpen={() => openCard(task.id, 'drawer')}
                />
              ))}
            </div>
          ))}
      </div>
      <div className="hidden min-w-[760px] grid-cols-7 border-b border-tr-border bg-tr-surface md:grid">
        {WEEKDAYS.map((day) => (
          <div key={day} className="px-2 py-2 text-center text-xs font-semibold text-tr-subtle">
            {day}
          </div>
        ))}
      </div>
      <div className="tr-scroll hidden overflow-x-auto md:block">
        <div className="grid min-w-[760px] grid-cols-7">
          {days.map((day) => {
            const key = format(day, 'yyyy-MM-dd');
            const dayTasks = byDay.get(key) ?? [];
            return (
              <div
                key={key}
                className={`min-h-28 border-r border-b border-tr-border p-1.5 ${isSameMonth(day, month) ? 'bg-tr-panel' : 'bg-tr-surface/60'}`}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs ${isSameDay(day, today) ? 'bg-tr-primary font-semibold text-tr-on-primary' : isSameMonth(day, month) ? 'text-tr-text' : 'text-tr-muted'}`}
                >
                  {format(day, 'd')}
                </span>
                <div className="mt-1 space-y-1">
                  {dayTasks.slice(0, 3).map((task) => {
                    const nested = depthOf(task, dayTasks) > 0;
                    const orphanOf =
                      !nested && task.parent_id ? parentTitle.get(task.parent_id) : undefined;
                    return (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => openCard(task.id, 'drawer')}
                        className={`block w-full truncate rounded-control border-l-2 px-1.5 py-1 text-left ${nested ? 'text-[11px]' : 'text-xs'} ${nested ? 'ml-3 w-[calc(100%-0.75rem)]' : ''} ${task.is_done ? 'border-tr-success bg-tr-success/10 text-tr-muted line-through' : nested ? 'border-tr-primary/50 bg-tr-hover text-tr-text' : 'border-tr-primary bg-tr-primary/10 text-tr-text'} hover:bg-tr-hover ${focusRing}`}
                        title={orphanOf ? `${task.title} (việc con của ${orphanOf})` : task.title}
                      >
                        {(nested || orphanOf) && <span className="mr-1 text-tr-muted">↳</span>}
                        {task.title}
                      </button>
                    );
                  })}
                  {dayTasks.length > 3 && (
                    <span className="block px-1 text-xs text-tr-muted">
                      +{dayTasks.length - 3} việc
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
