import { useEffect, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '../api/client';
import { DealCardBody, SortableDealCard } from '../components/crm/DealCard';
import { DealForm } from '../components/crm/DealForm';
import { Modal } from '../components/common/Modal';
import {
  Button,
  DateInput,
  ErrorState,
  Field,
  Input,
  MoneyInput,
  Select,
  Skeleton,
  Textarea,
} from '../components/common/ui';
import { labelsOf, useLabelMap } from '../components/labels/EntityLabels';
import {
  EMPTY_LABEL_FILTER,
  LabelFilter,
  matchLabelFilter,
  type LabelFilterState,
} from '../components/labels/LabelFilter';
import { LOST_REASON_ORDER, STAGE_COLORS, STAGE_ORDER, t } from '../i18n/vi';
import { formatVND, formatVNDShort, todayStr } from '../lib/format';
import { invalidateCrmViews } from '../lib/queryKeys';
import type { Deal, DealsResponse, Label, Stage } from '../types';

function clone(data: DealsResponse): DealsResponse {
  const stages = {} as Record<Stage, Deal[]>;
  for (const s of STAGE_ORDER) stages[s] = [...(data.stages[s] ?? [])];
  return { stages, totals: data.totals };
}

function locate(data: DealsResponse, dealId: number): { stage: Stage; index: number } | null {
  for (const stage of STAGE_ORDER) {
    const index = (data.stages[stage] ?? []).findIndex((d) => d.id === dealId);
    if (index >= 0) return { stage, index };
  }
  return null;
}

type MoveVars = { dealId: number; stage: Stage; beforeId: number | null; afterId: number | null };

export default function PipelinePage() {
  const queryClient = useQueryClient();
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);
  const [form, setForm] = useState<{ open: boolean; deal?: Deal | null; stage?: Stage }>({
    open: false,
  });
  /** BR-03: giữ lại thao tác kéo đang chờ lý do thua. */
  const [pendingLost, setPendingLost] = useState<MoveVars | null>(null);
  const [lostReason, setLostReason] = useState('');
  const [lostNote, setLostNote] = useState('');
  /** FR-OPP-06: nhập giá trị chốt thật và tạo hợp đồng ngay khi thắng. */
  const [wonDeal, setWonDeal] = useState<Deal | null>(null);
  /** FR-TAG-21/22: lọc pipeline theo nhãn, mặc định không lọc gì. */
  const [labelFilter, setLabelFilter] = useState<LabelFilterState>(EMPTY_LABEL_FILTER);
  const labelMap = useLabelMap('deal');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['deals'],
    queryFn: () => api.get<DealsResponse>('/api/deals'),
  });

  /* Cung bo sensor voi bang Kanban: chuot, cam ung va ban phim. */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const setData = (next: DealsResponse) => queryClient.setQueryData(['deals'], next);
  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['deals'] });
    invalidateCrmViews(queryClient);
  };

  const move = useMutation({
    mutationFn: (vars: MoveVars & { lost_reason?: string; lost_note?: string }) =>
      api.patch<Deal>(`/api/deals/${vars.dealId}/move`, {
        stage: vars.stage,
        beforeId: vars.beforeId,
        afterId: vars.afterId,
        lost_reason: vars.lost_reason,
        lost_note: vars.lost_note,
      }),
    onSuccess: (deal, vars) => {
      refreshAll();
      if (vars.stage === 'won') setWonDeal(deal);
    },
    onError: (error, vars) => {
      // Server tu choi vi chua co ly do thua -> mo hop thoai bat buoc chon
      if (error instanceof Error && error.message === 'NEED_LOST_REASON') {
        setPendingLost(vars);
        setLostReason('');
        setLostNote('');
      }
      queryClient.invalidateQueries({ queryKey: ['deals'] });
    },
  });

  function handleDragStart(event: DragStartEvent) {
    const dealId = event.active.data.current?.dealId as number | undefined;
    if (!dealId || !data) return;
    const found = locate(data, dealId);
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

    const next = clone(data);
    const from = locate(next, dealId);
    if (!from || from.stage === targetStage) return;

    const [moved] = next.stages[from.stage].splice(from.index, 1);
    moved.stage = targetStage;
    const overIdx =
      over.data.current?.type === 'deal'
        ? next.stages[targetStage].findIndex((d) => d.id === over.data.current!.dealId)
        : -1;
    next.stages[targetStage].splice(overIdx >= 0 ? overIdx : next.stages[targetStage].length, 0, moved);
    setData(next);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDeal(null);
    if (!over || !data || active.data.current?.type !== 'deal') return;

    const dealId = active.data.current.dealId as number;
    const targetStage = targetStageOf(over.data.current as Record<string, unknown>);
    if (!targetStage) return;

    const next = clone(data);
    const from = locate(next, dealId);
    if (!from) return;

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
      moved.stage = targetStage;
      const overIdx =
        over.data.current?.type === 'deal'
          ? next.stages[targetStage].findIndex((d) => d.id === over.data.current!.dealId)
          : -1;
      next.stages[targetStage].splice(
        overIdx >= 0 ? overIdx : next.stages[targetStage].length,
        0,
        moved
      );
    }
    setData(next);

    const finalList = next.stages[targetStage];
    const idx = finalList.findIndex((d) => d.id === dealId);
    move.mutate({
      dealId,
      stage: targetStage,
      beforeId: idx > 0 ? finalList[idx - 1].id : null,
      afterId: idx < finalList.length - 1 ? finalList[idx + 1].id : null,
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

  const openTotal = STAGE_ORDER.filter((s) => s !== 'won' && s !== 'lost').reduce(
    (acc, s) => {
      acc.sum += data.totals[s]?.sum_vnd ?? 0;
      acc.weighted += data.totals[s]?.weighted_vnd ?? 0;
      acc.count += data.totals[s]?.count ?? 0;
      return acc;
    },
    { sum: 0, weighted: 0, count: 0 }
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-4 px-4 pt-4">
        <Metric label="Cơ hội đang mở" value={String(openTotal.count)} />
        <Metric label="Tổng pipeline" value={formatVND(openTotal.sum)} />
        <Metric label="Weighted pipeline" value={formatVND(Math.round(openTotal.weighted))} />
        <LabelFilter scope="deal" value={labelFilter} onChange={setLabelFilter} />
        <Button variant="primary" className="ml-auto" onClick={() => setForm({ open: true, deal: null })}>
          <Plus size={16} /> {t.deal.newDeal}
        </Button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveDeal(null)}
      >
        <div className="tr-scroll flex flex-1 items-start gap-3 overflow-x-auto p-4">
          {STAGE_ORDER.map((stage) => (
            <StageColumn
              key={stage}
              stage={stage}
              deals={(data.stages[stage] ?? []).filter((deal) =>
                matchLabelFilter(
                  labelsOf(labelMap, deal.id).map((l) => l.id),
                  labelFilter
                )
              )}
              labelMap={labelMap}
              onAdd={() => setForm({ open: true, deal: null, stage })}
              onOpen={(deal) => setForm({ open: true, deal })}
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

      <DealForm
        open={form.open}
        deal={form.deal}
        defaultStage={form.stage}
        onClose={() => setForm({ open: false })}
      />

      <LostReasonDialog
        pending={pendingLost}
        reason={lostReason}
        note={lostNote}
        onReason={setLostReason}
        onNote={setLostNote}
        onCancel={() => setPendingLost(null)}
        onConfirm={() => {
          if (!pendingLost || !lostReason) return;
          move.mutate({ ...pendingLost, lost_reason: lostReason, lost_note: lostNote });
          setPendingLost(null);
        }}
      />

      <WonDialog deal={wonDeal} onClose={() => setWonDeal(null)} onDone={refreshAll} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-tr-muted">{label}</div>
      <div className="text-lg font-semibold text-tr-text">{value}</div>
    </div>
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
  const total = deals.reduce((sum, d) => sum + d.value_vnd, 0);
  const weighted = deals.reduce((sum, d) => sum + (d.value_vnd * d.probability) / 100, 0);

  return (
    <div ref={setNodeRef} className="flex max-h-full w-[272px] shrink-0 flex-col rounded-xl bg-tr-list">
      <header className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STAGE_COLORS[stage] }} />
        <span className="flex-1 text-sm font-semibold text-tr-text">{t.stage[stage]}</span>
        <span className="text-xs text-tr-muted">{deals.length}</span>
      </header>

      <div className="tr-scroll min-h-[4rem] flex-1 space-y-2 overflow-y-auto px-2">
        <SortableContext items={deals.map((d) => `deal-${d.id}`)} strategy={verticalListSortingStrategy}>
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
        {stage !== 'won' && stage !== 'lost' && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-tr-muted">Trọng số</span>
            <span className="text-tr-subtle">{formatVNDShort(Math.round(weighted))}</span>
          </div>
        )}
        <button
          onClick={onAdd}
          className="flex w-full items-center gap-1.5 rounded-lg px-1 py-1 text-xs text-tr-subtle transition hover:bg-tr-hover-strong"
        >
          <Plus size={13} /> {t.deal.newDeal}
        </button>
      </footer>
    </div>
  );
}

/** BR-03 / AC-04: không cho chuyển sang Thua nếu chưa chọn lý do. */
function LostReasonDialog({
  pending,
  reason,
  note,
  onReason,
  onNote,
  onCancel,
  onConfirm,
}: {
  pending: MoveVars | null;
  reason: string;
  note: string;
  onReason: (v: string) => void;
  onNote: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={pending !== null}
      onClose={onCancel}
      title="Vì sao thua cơ hội này?"
      width="max-w-md"
      footer={
        <>
          <Button onClick={onCancel}>{t.common.cancel}</Button>
          <Button variant="primary" disabled={!reason} onClick={onConfirm}>
            Xác nhận thua
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t.deal.lostReason}>
          <Select value={reason} onChange={(e) => onReason(e.target.value)}>
            <option value="">— bắt buộc chọn —</option>
            {LOST_REASON_ORDER.map((r) => (
              <option key={r} value={r}>
                {t.lostReason[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Ghi chú chi tiết" hint={t.common.optional}>
          <Textarea rows={3} value={note} onChange={(e) => onNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

/** FR-OPP-06: nhập giá trị chốt thực tế, có thể tạo luôn hợp đồng. */
function WonDialog({
  deal,
  onClose,
  onDone,
}: {
  deal: Deal | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [wonValue, setWonValue] = useState(0);
  const [makeContract, setMakeContract] = useState(true);
  const [number, setNumber] = useState('');
  const [start, setStart] = useState<string | null>(todayStr());
  const [end, setEnd] = useState<string | null>(null);

  const open = deal !== null;

  useEffect(() => {
    if (!deal) return;
    setWonValue(deal.won_value_vnd ?? deal.value_vnd);
    setNumber('');
    setStart(todayStr());
    setEnd(null);
    setMakeContract(true);
  }, [deal?.id]);

  const save = useMutation({
    mutationFn: async () => {
      if (!deal) return;
      await api.patch(`/api/deals/${deal.id}`, {
        won_value_vnd: wonValue || deal.value_vnd,
      });
      if (makeContract) {
        await api.post('/api/contracts', {
          customer_id: deal.customer_id,
          deal_id: deal.id,
          name: deal.title,
          number: number || null,
          value_vnd: wonValue || deal.value_vnd,
          sign_date: todayStr(),
          start_date: start,
          end_date: end,
          status: 'active',
        });
      }
    },
    onSuccess: () => {
      onDone();
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Chốt thành công: ${deal?.title ?? ''}`}
      width="max-w-lg"
      footer={
        <>
          <Button onClick={onClose}>Để sau</Button>
          <Button variant="primary" onClick={() => save.mutate()}>
            {t.common.save}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field
            label="Giá trị chốt thực tế"
            hint={deal ? `Giá trị dự kiến: ${formatVND(deal.value_vnd)}` : undefined}
          >
            <MoneyInput value={wonValue} onChange={setWonValue} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <label className="flex items-center gap-2 text-sm text-tr-text">
            <input
              type="checkbox"
              checked={makeContract}
              onChange={(e) => setMakeContract(e.target.checked)}
              className="h-4 w-4 rounded border-tr-border"
            />
            Tạo hợp đồng từ cơ hội này
          </label>
        </div>
        {makeContract && (
          <>
            <Field label="Số hợp đồng">
              <Input value={number} onChange={(e) => setNumber(e.target.value)} />
            </Field>
            <Field label="Ngày bắt đầu">
              <DateInput value={start} onChange={setStart} />
            </Field>
            <Field label="Ngày kết thúc">
              <DateInput value={end} onChange={setEnd} />
            </Field>
          </>
        )}
      </div>
    </Modal>
  );
}
