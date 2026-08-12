import { useDeferredValue, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarPlus, ChevronDown, ChevronRight, RotateCcw, Search } from 'lucide-react';
import { api, qs } from '../../api/client';
import { PRIORITY_COLORS, PRIORITY_ORDER, t } from '../../i18n/vi';
import { foldText } from '../../lib/format';
import { useUiStore } from '../../stores/uiStore';
import type { Priority, TimelineDependency, TimelineItem } from '../../types';
import { Button, ErrorState, Input, Segmented, Select, Skeleton, focusRing } from '../common/ui';
import { TimelineView, type Zoom } from '../timeline/TimelineView';

interface UnscheduledTimelineItem {
  id: number;
  title: string;
  board_name: string;
  list_name: string;
  customer_name: string | null;
  priority: Priority;
}

interface TimelineResponse {
  items: TimelineItem[];
  unscheduled: UnscheduledTimelineItem[];
  dependencies: TimelineDependency[];
}

/**
 * Dòng thời gian dùng chung; trong một bảng thì nhóm theo danh sách thay vì theo bảng.
 *
 * `projectId` cho phạm vi cả dự án (v19) — Gantt cấp dự án là dạng xem có giá trị
 * nhất khi quản lý tiến độ, và trước đó không có cách nào mở được.
 */
export function TimelineBoard({ boardId, projectId }: { boardId?: number; projectId?: number }) {
  const openCard = useUiStore((state) => state.openCard);
  const [groupBy, setGroupBy] = useState<'board' | 'customer'>('board');
  const [zoom, setZoom] = useState<Zoom>('month');
  const [search, setSearch] = useState('');
  const [priority, setPriority] = useState<Priority | ''>('');
  const [showUnscheduled, setShowUnscheduled] = useState(true);
  const deferredSearch = useDeferredValue(search);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['timeline', groupBy, boardId ?? 'all', projectId ?? 'all'],
    queryFn: () =>
      api.get<TimelineResponse>(
        `/api/views/timeline${qs({ groupBy, board_id: boardId, project_id: projectId })}`
      ),
  });

  const activeFilterCount = (search.trim() ? 1 : 0) + (priority ? 1 : 0);
  const filtered = useMemo(() => {
    if (!data) return { items: [], unscheduled: [], dependencies: [] };
    const query = foldText(deferredSearch.trim());
    const matches = (item: {
      title: string;
      board_name: string;
      customer_name: string | null;
      priority: Priority;
      group_name?: string;
      list_name?: string;
    }) => {
      if (priority && item.priority !== priority) return false;
      if (!query) return true;
      return foldText(
        [item.title, item.group_name, item.list_name, item.board_name, item.customer_name]
          .filter(Boolean)
          .join(' ')
      ).includes(query);
    };
    const items = data.items.filter(matches);
    // Lọc bỏ cạnh có đầu nằm ngoài kết quả lọc — nếu không, đường nối sẽ trỏ tới
    // một thanh không còn hiện trên trục.
    const visible = new Set(items.map((item) => item.id));
    return {
      items,
      unscheduled: data.unscheduled.filter(matches),
      dependencies: (data.dependencies ?? []).filter(
        (edge) => visible.has(edge.predecessor_id) && visible.has(edge.successor_id)
      ),
    };
  }, [data, deferredSearch, priority]);

  const resetFilters = () => {
    setSearch('');
    setPriority('');
  };

  return (
    <div className="w-full min-w-0">
      <div className="mb-4 rounded-modal border border-tr-border bg-tr-panel p-3 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="mb-1.5 text-2xs font-semibold tracking-wide text-tr-muted uppercase">
              Cách nhóm
            </p>
            <Segmented
              label="Cách nhóm công việc"
              value={groupBy}
              onChange={setGroupBy}
              options={[
                { value: 'board', label: boardId ? 'Theo danh sách' : t.timeline.groupByBoard },
                { value: 'customer', label: t.timeline.groupByCustomer },
              ]}
            />
          </div>

          <div className="sm:text-right">
            <p className="mb-1.5 text-2xs font-semibold tracking-wide text-tr-muted uppercase">
              Thang thời gian
            </p>
            <Segmented
              label="Thang thời gian"
              value={zoom}
              onChange={setZoom}
              options={[
                { value: 'week', label: t.timeline.zoomWeek },
                { value: 'month', label: t.timeline.zoomMonth },
                { value: 'quarter', label: t.timeline.zoomQuarter },
              ]}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-tr-border pt-3">
          <label className="relative min-w-[min(100%,16rem)] flex-1 sm:max-w-sm">
            <span className="sr-only">Tìm công việc trên dòng thời gian</span>
            <Search
              size={15}
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-tr-muted"
            />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm công việc..."
              className="h-9 pl-9"
            />
          </label>

          <label className="min-w-44">
            <span className="sr-only">Lọc theo mức ưu tiên</span>
            <Select
              value={priority}
              onChange={(event) => setPriority(event.target.value as Priority | '')}
              className="h-9"
            >
              <option value="">Tất cả ưu tiên</option>
              {PRIORITY_ORDER.map((value) => (
                <option key={value} value={value}>
                  {t.priority[value]}
                </option>
              ))}
            </Select>
          </label>

          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" onClick={resetFilters} title="Xóa bộ lọc timeline">
              <RotateCcw size={14} aria-hidden="true" /> Đặt lại
            </Button>
          )}

          {data && (
            <span className="ml-auto text-xs text-tr-muted" aria-live="polite">
              {filtered.items.length}/{data.items.length} công việc đã xếp lịch
            </span>
          )}
        </div>
      </div>

      {error ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <Skeleton className="h-72 rounded-modal" />
      ) : (
        <>
          <TimelineView
            items={filtered.items}
            dependencies={filtered.dependencies}
            zoom={zoom}
            onOpenCard={openCard}
            emptyMessage={activeFilterCount > 0 ? 'Không tìm thấy công việc phù hợp' : undefined}
            emptyHint={activeFilterCount > 0 ? 'Thử đổi từ khóa hoặc đặt lại bộ lọc.' : undefined}
          />

          {data.unscheduled.length > 0 && (
            <section className="mt-4 overflow-hidden rounded-modal border border-tr-border bg-tr-panel shadow-sm">
              <button
                type="button"
                onClick={() => setShowUnscheduled((value) => !value)}
                aria-expanded={showUnscheduled}
                className={`flex min-h-11 w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold text-tr-text transition hover:bg-tr-hover ${focusRing}`}
              >
                {showUnscheduled ? (
                  <ChevronDown size={16} className="shrink-0 text-tr-muted" aria-hidden="true" />
                ) : (
                  <ChevronRight size={16} className="shrink-0 text-tr-muted" aria-hidden="true" />
                )}
                <span>Chưa xếp lịch</span>
                <span className="rounded-full bg-tr-hover-strong px-2 py-0.5 text-xs font-medium text-tr-subtle">
                  {filtered.unscheduled.length}
                </span>
                <span className="ml-auto hidden text-xs font-normal text-tr-muted sm:inline">
                  Thêm ngày bắt đầu hoặc hạn để đưa lên timeline
                </span>
              </button>

              {showUnscheduled && (
                <div className="divide-y divide-tr-border border-t border-tr-border">
                  {filtered.unscheduled.length === 0 ? (
                    <p className="px-4 py-5 text-center text-sm text-tr-muted">
                      Không có công việc chưa xếp lịch phù hợp bộ lọc.
                    </p>
                  ) : (
                    filtered.unscheduled.map((item) => (
                      <div
                        key={item.id}
                        className="flex flex-wrap items-center gap-3 px-4 py-2.5 transition hover:bg-tr-hover"
                      >
                        <span
                          aria-hidden="true"
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: PRIORITY_COLORS[item.priority] }}
                        />
                        <button
                          type="button"
                          onClick={() => openCard(item.id)}
                          title={item.title}
                          className={`min-w-0 flex-1 truncate text-left text-sm font-medium text-tr-text hover:underline ${focusRing}`}
                        >
                          {item.title}
                        </button>
                        <span className="max-w-full shrink-0 truncate text-xs text-tr-muted sm:max-w-48">
                          {boardId ? item.list_name : (item.customer_name ?? item.board_name)}
                        </span>
                        <span className="rounded-full border border-tr-border px-2 py-0.5 text-2xs text-tr-subtle">
                          {t.priority[item.priority]}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openCard(item.id)}
                          title={`Xếp lịch cho ${item.title}`}
                        >
                          <CalendarPlus size={14} aria-hidden="true" /> Xếp lịch
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
