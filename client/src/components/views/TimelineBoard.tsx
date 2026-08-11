import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { api, qs } from '../../api/client';
import { TimelineView, type Zoom } from '../timeline/TimelineView';
import { ErrorState, Segmented, Skeleton } from '../common/ui';
import { PRIORITY_COLORS, t } from '../../i18n/vi';
import { useUiStore } from '../../stores/uiStore';
import type { Priority, TimelineItem } from '../../types';

interface TimelineResponse {
  items: TimelineItem[];
  unscheduled: {
    id: number;
    title: string;
    board_name: string;
    customer_name: string | null;
    priority: Priority;
  }[];
}

/** Dòng thời gian dùng chung; trong một bảng thì nhóm theo danh sách thay vì theo bảng. */
export function TimelineBoard({ boardId }: { boardId?: number }) {
  const openCard = useUiStore((s) => s.openCard);
  const [groupBy, setGroupBy] = useState<'board' | 'customer'>('board');
  const [zoom, setZoom] = useState<Zoom>('month');
  const [showUnscheduled, setShowUnscheduled] = useState(true);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['timeline', groupBy, boardId ?? 'all'],
    queryFn: () =>
      api.get<TimelineResponse>(`/api/views/timeline${qs({ groupBy, board_id: boardId })}`),
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          value={groupBy}
          onChange={(v) => setGroupBy(v as 'board' | 'customer')}
          options={[
            { value: 'board', label: boardId ? 'Theo danh sách' : t.timeline.groupByBoard },
            { value: 'customer', label: t.timeline.groupByCustomer },
          ]}
        />
        <Segmented
          value={zoom}
          onChange={(v) => setZoom(v as Zoom)}
          options={[
            { value: 'week', label: t.timeline.zoomWeek },
            { value: 'month', label: t.timeline.zoomMonth },
            { value: 'quarter', label: t.timeline.zoomQuarter },
          ]}
        />
      </div>

      {error ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <Skeleton className="h-72 rounded-modal" />
      ) : (
        <>
          <TimelineView items={data.items} zoom={zoom} onOpenCard={openCard} />

          {data.unscheduled.length > 0 && (
            <div className="mt-4 rounded-lg border border-tr-border bg-tr-panel shadow-sm">
              <button
                onClick={() => setShowUnscheduled((v) => !v)}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-semibold text-tr-text"
              >
                {showUnscheduled ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                {t.timeline.unscheduled}
                <span className="text-xs font-normal text-tr-muted">
                  ({data.unscheduled.length})
                </span>
              </button>
              {showUnscheduled && (
                <div className="divide-y divide-tr-border border-t border-tr-border">
                  {data.unscheduled.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => openCard(item.id)}
                      className="flex w-full items-center gap-3 px-4 py-2 text-left transition hover:bg-tr-hover"
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: PRIORITY_COLORS[item.priority] }}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-tr-text">
                        {item.title}
                      </span>
                      <span className="shrink-0 text-xs text-tr-muted">
                        {item.customer_name ?? item.board_name}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

