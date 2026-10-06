import { Suspense, lazy, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { LayoutGrid, List as ListIcon, Plus } from 'lucide-react';
import { api } from '../api/client';
import { DealCardBody, SortableDealCard } from '../components/crm/DealCard';
import {
  Button,
  ColorBadge,
  EmptyState,
  ErrorState,
  Select,
  Skeleton,
  focusRing,
} from '../components/common/ui';
import { PageHeader, PageShell } from '../components/common/PageShell';
import { labelsOf, useLabelMap } from '../components/labels/EntityLabels';
import {
  EMPTY_LABEL_FILTER,
  LabelFilter,
  matchLabelFilter,
  type LabelFilterState,
} from '../components/labels/LabelFilter';
import { t } from '../i18n/vi';
import { formatVND, formatVNDShort } from '../lib/format';
import { invalidateCrmViews } from '../lib/queryKeys';
import { applyOptimisticStage, cloneDeals, locateDeal, refreshDealTotals } from '../lib/dnd/deals';
import { buildDndAnnouncements } from '../lib/dnd/announcements';
import { useMediaQuery } from '../lib/useMediaQuery';
import { useDealStageMove } from '../hooks/useDealStageMove';
import type { Deal, DealsResponse, Label, Stage } from '../types';
import {
  closedStageKey,
  isClosedStage,
  stageCategory,
  stageColor,
  stageLabel,
  usePipeline,
} from '../lib/crmConfig';

/* Lazy: modal chi tai khi nguoi dung mo. Nhap tinh thi chunk cua no nam
   trong bundle cua trang du phan lon luot xem khong bao gio mo toi. */
const DealForm = lazy(() =>
  import('../components/crm/DealForm').then((module) => ({ default: module.DealForm }))
);

export default function PipelinePage() {
  const pipeline = usePipeline();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);
  const dragSnapshot = useRef<DealsResponse | null>(null);
  const [form, setForm] = useState<{ open: boolean; deal?: Deal | null; stage?: Stage }>({
    open: false,
  });
  /** FR-TAG-21/22: lọc pipeline theo nhãn, mặc định không lọc gì. */
  const [labelFilter, setLabelFilter] = useState<LabelFilterState>(EMPTY_LABEL_FILTER);
  /** v23: chỉ hiện cơ hội đã thắng nhưng hồ sơ bàn giao chưa đủ. */
  const [pendingHandoverOnly, setPendingHandoverOnly] = useState(false);
  const [view, setView] = useState<'board' | 'list'>(() => {
    try {
      const saved = localStorage.getItem('workflow-pipeline-view-v1');
      if (saved === 'board' || saved === 'list') return saved;
    } catch {
      // Storage bị chặn: vẫn dùng mặc định phù hợp kích thước màn hình.
    }
    return window.matchMedia('(max-width: 639px)').matches ? 'list' : 'board';
  });
  const [stageFilter, setStageFilter] = useState<Stage | 'all'>('all');
  const labelMap = useLabelMap('deal');
  const changeView = (next: 'board' | 'list') => {
    setView(next);
    try {
      localStorage.setItem('workflow-pipeline-view-v1', next);
    } catch {
      // Không để lỗi storage chặn thao tác đổi dạng xem.
    }
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['deals'],
    queryFn: () => api.get<DealsResponse>('/api/deals'),
  });

  /* Doi id ky thuat (`stage-quoted`, id so cua co hoi) sang ten doc duoc, de
     trinh doc man hinh phat ra "Da tha Hop dong ACME vao Bao gia" thay vi
     "Da tha 42 vao stage-quoted". */
  const announcements = useMemo(
    () =>
      buildDndAnnouncements({
        itemNoun: 'cơ hội',
        resolve: (id) => {
          if (id.startsWith('stage-')) {
            const stage = id.slice('stage-'.length) as Stage;
            return `cột ${stageLabel(stage)}`;
          }
          if (!data) return null;
          for (const stage of Object.keys(data.stages)) {
            const deal = data.stages[stage]?.find((d) => String(d.id) === id);
            if (deal) return `cơ hội ${deal.title}`;
          }
          return null;
        },
      }),
    [data]
  );

  /* Cung bo sensor voi bang Kanban: chuot, cam ung va ban phim. */
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const setData = (next: DealsResponse) => queryClient.setQueryData(['deals'], next);
  const restoreDragSnapshot = () => {
    if (dragSnapshot.current) setData(dragSnapshot.current);
    dragSnapshot.current = null;
  };
  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['deals'] });
    invalidateCrmViews(queryClient);
  };

  const { move, dialogs: stageMoveDialogs } = useDealStageMove({
    invalidate: refreshAll,
    onMoveSuccess: () => {
      dragSnapshot.current = null;
    },
    onMoveError: () => {
      restoreDragSnapshot();
      queryClient.invalidateQueries({ queryKey: ['deals'] });
    },
  });

  function handleDragStart(event: DragStartEvent) {
    const dealId = event.active.data.current?.dealId as number | undefined;
    if (!dealId || !data) return;
    dragSnapshot.current = cloneDeals(data);
    const found = locateDeal(data, dealId);
    if (found) setActiveDeal(data.stages[found.stage][found.index]);
  }

  function targetStageOf(overData: Record<string, unknown> | undefined): Stage | null {
    if (!overData) return null;
    if (overData.type === 'deal' || overData.type === 'stage') return overData.stage as Stage;
    return null;
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || !data || active.data.current?.type !== 'deal') return;
    const dealId = active.data.current.dealId as number;
    const targetStage = targetStageOf(over.data.current as Record<string, unknown>);
    if (!targetStage) return;

    const next = cloneDeals(data);
    const from = locateDeal(next, dealId);
    if (!from || from.stage === targetStage) return;

    const [moved] = next.stages[from.stage].splice(from.index, 1);
    applyOptimisticStage(moved, targetStage);
    const overIdx =
      over.data.current?.type === 'deal'
        ? next.stages[targetStage].findIndex((d) => d.id === over.data.current!.dealId)
        : -1;
    next.stages[targetStage].splice(
      overIdx >= 0 ? overIdx : next.stages[targetStage].length,
      0,
      moved
    );
    refreshDealTotals(next);
    setData(next);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDeal(null);
    if (!over || !data || active.data.current?.type !== 'deal') {
      restoreDragSnapshot();
      return;
    }

    const dealId = active.data.current.dealId as number;
    const targetStage = targetStageOf(over.data.current as Record<string, unknown>);
    if (!targetStage) {
      restoreDragSnapshot();
      return;
    }

    const next = cloneDeals(data);
    const from = locateDeal(next, dealId);
    if (!from) {
      restoreDragSnapshot();
      return;
    }

    /* Chup vi tri cu TRUOC khi splice — toast "Hoàn tác" can no de tra thẻ ve
       dung cot va dung cho trong cot. Sap xep lai trong cung mot cot thi
       prevStage trung targetStage nen hook tu bo qua toast. */
    const fromList = next.stages[from.stage];
    const previous = {
      prevStage: from.stage,
      prevBeforeId: from.index > 0 ? fromList[from.index - 1].id : null,
      prevAfterId: from.index < fromList.length - 1 ? fromList[from.index + 1].id : null,
    };

    if (from.stage === targetStage) {
      const list = next.stages[targetStage];
      const overIdx =
        over.data.current?.type === 'deal'
          ? list.findIndex((d) => d.id === over.data.current!.dealId)
          : list.length - 1;
      if (overIdx >= 0 && overIdx !== from.index)
        next.stages[targetStage] = arrayMove(list, from.index, overIdx);
    } else {
      const [moved] = next.stages[from.stage].splice(from.index, 1);
      applyOptimisticStage(moved, targetStage);
      const overIdx =
        over.data.current?.type === 'deal'
          ? next.stages[targetStage].findIndex((d) => d.id === over.data.current!.dealId)
          : -1;
      next.stages[targetStage].splice(
        overIdx >= 0 ? overIdx : next.stages[targetStage].length,
        0,
        moved
      );
      refreshDealTotals(next);
    }
    setData(next);

    const finalList = next.stages[targetStage];
    const idx = finalList.findIndex((d) => d.id === dealId);
    move({
      dealId,
      stage: targetStage,
      beforeId: idx > 0 ? finalList[idx - 1].id : null,
      afterId: idx < finalList.length - 1 ? finalList[idx + 1].id : null,
      ...previous,
    });
  }

  if (error)
    return (
      <div className="p-6">
        <ErrorState onRetry={() => refetch()} />
      </div>
    );
  if (isLoading || !data)
    return (
      <div role="status" aria-label={t.common.loading} className="flex gap-3 p-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="w-64 shrink-0 space-y-2">
            <Skeleton className="h-8 w-full rounded-panel" />
            {Array.from({ length: 2 + (i % 3) }).map((_, j) => (
              <Skeleton key={j} className="h-24 w-full rounded-panel" />
            ))}
          </div>
        ))}
      </div>
    );

  /* Cột Kanban: giai đoạn đang dùng, cộng giai đoạn đã ẩn mà vẫn còn cơ hội (không
     để cơ hội nào biến mất khỏi màn hình). */
  const columns = pipeline.stages
    .filter((stage) => stage.is_active === 1 || (data.stages[stage.key]?.length ?? 0) > 0)
    .map((stage) => stage.key);
  const openTotal = columns
    .filter((s) => !isClosedStage(s))
    .reduce(
      (acc, s) => {
        acc.sum += data.totals[s]?.sum_vnd ?? 0;
        acc.weighted += data.totals[s]?.weighted_vnd ?? 0;
        acc.count += data.totals[s]?.count ?? 0;
        return acc;
      },
      { sum: 0, weighted: 0, count: 0 }
    );

  /* Mục §12 của đặc tả: "Won đang chờ bàn giao" là một chỉ số quản trị riêng,
     không phải một trạng thái ẩn bên trong cột Won. */
  const pendingHandover = (data.stages[closedStageKey('won')] ?? []).filter(
    (deal) => !deal.handover_ready
  );
  const visibleDeals = (stage: Stage) =>
    (data.stages[stage] ?? []).filter(
      (deal) =>
        matchLabelFilter(
          labelsOf(labelMap, deal.id).map((label) => label.id),
          labelFilter
        ) &&
        (!pendingHandoverOnly || (stageCategory(deal.stage) === 'won' && !deal.handover_ready))
    );

  return (
    <PageShell width="wide" spacing="sm" className="flex h-full flex-col pb-4">
      <PageHeader
        title={t.nav.pipeline}
        description="Theo dõi cơ hội bán hàng theo từng giai đoạn."
        actions={
          <Button variant="primary" onClick={() => setForm({ open: true, deal: null })}>
            <Plus size={16} /> {t.deal.newDeal}
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-4 px-4 pt-4">
        <Metric label="Cơ hội đang mở" value={String(openTotal.count)} />
        {/* Dang RUT GON, khong phai day du: chan moi cot Kanban ngay ben duoi cung
            la dang rut gon, de hai kieu canh nhau trong mot khung nhin thi cung
            mot so tien doc ra hai ve khac han. Con so chinh xac nam o `title`. */}
        <Metric
          label="Tổng pipeline"
          value={formatVNDShort(openTotal.sum)}
          title={formatVND(openTotal.sum)}
        />
        <Metric
          label="Pipeline có trọng số"
          value={formatVNDShort(Math.round(openTotal.weighted))}
          title={formatVND(Math.round(openTotal.weighted))}
        />
        {(pendingHandover.length > 0 || pendingHandoverOnly) && (
          <FilterMetric
            label="Chờ bàn giao"
            value={String(pendingHandover.length)}
            active={pendingHandoverOnly}
            tone={pendingHandover.length > 0 ? 'warning' : 'muted'}
            onClick={() => setPendingHandoverOnly((on) => !on)}
          />
        )}
        <LabelFilter scope="deal" value={labelFilter} onChange={setLabelFilter} />
        {view === 'list' && (
          <Select
            aria-label="Lọc theo giai đoạn"
            value={stageFilter}
            onChange={(event) => setStageFilter(event.target.value as Stage | 'all')}
            className="w-auto"
          >
            <option value="all">Tất cả giai đoạn</option>
            {columns.map((stage) => (
              <option key={stage} value={stage}>
                {stageLabel(stage)}
              </option>
            ))}
          </Select>
        )}
        <div className="inline-flex rounded-control border border-tr-border bg-tr-panel p-0.5">
          <button
            type="button"
            onClick={() => changeView('board')}
            aria-label="Xem dạng pipeline"
            aria-pressed={view === 'board'}
            className={`flex h-11 items-center gap-1 rounded-control px-2 text-xs fine:h-8 ${focusRing} ${
              view === 'board' ? 'bg-tr-primary text-tr-on-primary' : 'text-tr-muted'
            }`}
          >
            <LayoutGrid size={14} aria-hidden="true" /> Pipeline
          </button>
          <button
            type="button"
            onClick={() => changeView('list')}
            aria-label="Xem dạng danh sách"
            aria-pressed={view === 'list'}
            className={`flex h-11 items-center gap-1 rounded-control px-2 text-xs fine:h-8 ${focusRing} ${
              view === 'list' ? 'bg-tr-primary text-tr-on-primary' : 'text-tr-muted'
            }`}
          >
            <ListIcon size={14} aria-hidden="true" /> Danh sách
          </button>
        </div>
      </div>

      {view === 'board' ? (
        <DndContext
          sensors={sensors}
          accessibility={{ announcements }}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={() => {
            setActiveDeal(null);
            restoreDragSnapshot();
          }}
        >
          <div className="tr-scroll flex snap-x snap-mandatory flex-1 items-start gap-3 overflow-x-auto p-4">
            {columns.map((stage) => (
              <StageColumn
                key={stage}
                stage={stage}
                deals={visibleDeals(stage)}
                labelMap={labelMap}
                onAdd={() => setForm({ open: true, deal: null, stage })}
                onOpen={(deal) => navigate(`/deals/${deal.id}`)}
              />
            ))}
          </div>

          <DragOverlay>
            {activeDeal && (
              <DealCardBody
                deal={activeDeal}
                labels={labelsOf(labelMap, activeDeal.id)}
                onClick={() => {}}
                dragging
              />
            )}
          </DragOverlay>
        </DndContext>
      ) : (
        <PipelineList
          deals={(stageFilter === 'all' ? columns : [stageFilter]).flatMap(visibleDeals)}
          onOpen={(deal) => navigate(`/deals/${deal.id}`)}
        />
      )}

      <Suspense fallback={null}>
        {form.open && (
          <DealForm
            open
            deal={form.deal}
            defaultStage={form.stage}
            onClose={() => setForm({ open: false })}
          />
        )}
      </Suspense>

      {stageMoveDialogs}
    </PageShell>
  );
}

function PipelineList({ deals, onOpen }: { deals: Deal[]; onOpen: (deal: Deal) => void }) {
  /* Chi mount mot bien the: truoc day ca danh sach the lan bang cung render,
     mot cai bi `hidden` che di, nen moi co hoi ton hai lan node DOM. */
  const isWide = useMediaQuery('(min-width: 640px)');

  if (deals.length === 0) {
    return (
      <div className="m-4">
        <EmptyState
          message="Không có cơ hội nào khớp bộ lọc."
          hint="Thử nới bộ lọc nhãn hoặc giai đoạn ở thanh trên."
        />
      </div>
    );
  }

  return (
    <div className="tr-scroll flex-1 overflow-auto p-4">
      {!isWide && (
        <ul className="space-y-2" aria-label="Danh sách cơ hội">
          {deals.map((deal) => (
            <li key={deal.id}>
              <button
                type="button"
                onClick={() => onOpen(deal)}
                className={`w-full rounded-panel border border-tr-border bg-tr-panel p-3 text-left shadow-sm transition hover:border-tr-primary/40 hover:bg-tr-hover ${focusRing}`}
              >
                <span className="flex items-start gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-tr-text">
                      {deal.title}
                    </span>
                    <span className="block truncate text-xs text-tr-muted">
                      {deal.customer_name}
                    </span>
                  </span>
                  <ColorBadge color={stageColor(deal.stage)} small>
                    {stageLabel(deal.stage)}
                  </ColorBadge>
                </span>
                <span className="mt-2 flex items-end justify-between gap-3 text-xs">
                  <span className="min-w-0 truncate text-tr-subtle">
                    {deal.next_action || 'Chưa có hành động tiếp theo'}
                  </span>
                  <strong className="shrink-0 text-tr-text">
                    {formatVNDShort(deal.value_vnd)}
                  </strong>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {isWide && (
        <div className="overflow-hidden rounded-panel border border-tr-border bg-tr-panel shadow-sm">
          <table className="w-full min-w-[760px] text-sm">
            <caption className="sr-only">Danh sách cơ hội bán hàng</caption>
            <thead className="bg-tr-surface text-left text-xs text-tr-subtle">
              <tr>
                <th scope="col" className="px-3 py-2">
                  Cơ hội
                </th>
                <th scope="col" className="px-3 py-2">
                  Khách hàng
                </th>
                <th scope="col" className="px-3 py-2">
                  Giai đoạn
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  Giá trị
                </th>
                <th scope="col" className="px-3 py-2">
                  Việc kế tiếp
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tr-border">
              {deals.map((deal) => (
                <tr key={deal.id} className="hover:bg-tr-hover">
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => onOpen(deal)}
                      className={`max-w-64 truncate text-left font-semibold text-tr-text hover:text-tr-primary hover:underline ${focusRing}`}
                    >
                      {deal.title}
                    </button>
                  </td>
                  <td className="max-w-48 truncate px-3 py-2 text-tr-subtle">
                    {deal.customer_name}
                  </td>
                  <td className="px-3 py-2">
                    <ColorBadge color={stageColor(deal.stage)} small>
                      {stageLabel(deal.stage)}
                    </ColorBadge>
                  </td>
                  <td className="px-3 py-2 text-right font-medium whitespace-nowrap text-tr-text">
                    {formatVNDShort(deal.value_vnd)}
                  </td>
                  <td className="max-w-64 truncate px-3 py-2 text-tr-subtle">
                    {deal.next_action || 'Chưa đặt'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div>
      <div className="text-xs text-tr-muted">{label}</div>
      <div className="text-lg font-semibold text-tr-text" title={title}>
        {value}
      </div>
    </div>
  );
}

/**
 * Chỉ số bấm được để lọc bảng — dùng cho "Won chờ bàn giao".
 *
 * Là `button` thật chứ không phải `div` có onClick: nó thay đổi nội dung đang
 * hiển thị nên phải tới được bằng bàn phím, và `aria-pressed` mới nói ra được
 * rằng bộ lọc đang bật.
 */
function FilterMetric({
  label,
  value,
  active,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  active: boolean;
  tone: 'warning' | 'muted';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={active ? 'Bỏ lọc, hiện lại toàn bộ pipeline' : 'Chỉ hiện cơ hội đang chờ bàn giao'}
      className={`rounded-control px-2 py-1 text-left transition ${focusRing} ${
        active ? 'bg-tr-warning/15 ring-1 ring-tr-warning' : 'hover:bg-tr-hover'
      }`}
    >
      <div className="text-xs text-tr-muted">{label}</div>
      <div
        className={`text-lg font-semibold ${tone === 'warning' ? 'text-tr-warning' : 'text-tr-text'}`}
      >
        {value}
      </div>
    </button>
  );
}

function StageColumn({
  stage,
  deals,
  labelMap,
  onAdd,
  onOpen,
}: {
  stage: Stage;
  deals: Deal[];
  labelMap: Record<string, Label[]>;
  onAdd: () => void;
  onOpen: (deal: Deal) => void;
}) {
  const { setNodeRef } = useDroppable({ id: `stage-${stage}`, data: { type: 'stage', stage } });
  const closed = isClosedStage(stage);
  const [expanded, setExpanded] = useState(() => {
    try {
      return localStorage.getItem(`workflow-pipeline-closed-expanded-v1:${stage}`) === '1';
    } catch {
      return false;
    }
  });
  const total = deals.reduce((sum, d) => sum + d.value_vnd, 0);
  const weighted = deals.reduce((sum, d) => sum + (d.value_vnd * d.probability) / 100, 0);

  if (closed && !expanded) {
    return (
      <button
        ref={setNodeRef}
        type="button"
        onClick={() => {
          setExpanded(true);
          try {
            localStorage.setItem(`workflow-pipeline-closed-expanded-v1:${stage}`, '1');
          } catch {
            // Khong de storage loi chan mo cot da dong.
          }
        }}
        className="flex h-full min-h-[12rem] w-14 shrink-0 flex-col items-center justify-between rounded-panel border-t-4 bg-tr-list py-3 text-tr-text hover:bg-tr-hover"
        style={{ borderTopColor: stageColor(stage) }}
        aria-label={`Mở cột ${stageLabel(stage)}`}
        title={`Trọng số ${formatVNDShort(Math.round(weighted))}`}
      >
        <span className="text-xs font-semibold [writing-mode:vertical-rl]">
          {stageLabel(stage)}
        </span>
        <span className="text-xs text-tr-muted">{deals.length}</span>
        <span className="text-xs text-tr-muted">{formatVNDShort(total)}</span>
      </button>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className="flex max-h-full w-[min(272px,calc(100vw-2rem))] shrink-0 snap-start flex-col rounded-panel bg-tr-list"
    >
      <header className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stageColor(stage) }} />
        <span className="tr-list-title flex-1 text-sm font-semibold text-tr-text">
          {stageLabel(stage)}
        </span>
        <span className="text-xs text-tr-muted">{deals.length}</span>
      </header>

      <div className="tr-scroll min-h-[4rem] flex-1 space-y-2 overflow-y-auto px-2">
        <SortableContext
          items={deals.map((d) => `deal-${d.id}`)}
          strategy={verticalListSortingStrategy}
        >
          {deals.map((deal) => (
            <SortableDealCard
              key={deal.id}
              deal={deal}
              labels={labelsOf(labelMap, deal.id)}
              onClick={() => onOpen(deal)}
            />
          ))}
        </SortableContext>
      </div>

      <footer className="space-y-1 px-3 py-2">
        <div className="flex items-center justify-between border-t border-tr-border pt-2 text-xs">
          <span className="text-tr-muted">Tổng</span>
          <span className="font-semibold text-tr-text">{formatVNDShort(total)}</span>
        </div>
        {!closed && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-tr-muted">Trọng số</span>
            <span className="text-tr-subtle">{formatVNDShort(Math.round(weighted))}</span>
          </div>
        )}
        <button
          onClick={onAdd}
          className="flex w-full items-center gap-1.5 rounded-control px-1 py-1 text-xs text-tr-subtle transition hover:bg-tr-hover-strong"
        >
          <Plus size={13} /> {t.deal.newDeal}
        </button>
      </footer>
    </div>
  );
}
