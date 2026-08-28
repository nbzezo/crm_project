/**
 * Trang chi tiết Cơ hội — nhà của module chấm điểm.
 *
 * Bố cục tab dùng lại đúng khuôn `role="tablist"` của trang Hồ sơ khách hàng.
 * Biểu mẫu sửa nhanh (DealForm dạng modal) giữ nguyên, không thay thế.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router';
import { Breadcrumbs } from '../components/common/Breadcrumbs';
import { ArrowLeft, FolderKanban, Pencil, Plus, RefreshCw } from 'lucide-react';
import { api } from '../api/client';
import { DealForm } from '../components/crm/DealForm';
import { DealStageStepper } from '../components/crm/DealStageStepper';
import { DealSmartButtons } from '../components/crm/DealSmartButtons';
import { DealActivitySidebar } from '../components/crm/DealActivitySidebar';
import { HandoverPanel } from '../components/crm/HandoverPanel';
import { ChangeLogPanel } from '../components/crm/ChangeLogPanel';
import { HealthBadge } from './ProjectsPage';
import { Scorecard } from '../components/crm/Scorecard';
import { CommitteePanel } from '../components/crm/CommitteePanel';
import { DocumentPanel } from '../components/crm/DocumentUpload';
import { MeetingNotesPanel } from '../components/crm/meetingNotes/MeetingNotesPanel';
import { AiBrief } from '../components/ai/AiBrief';
import { EntityLabels } from '../components/labels/EntityLabels';
import { Tabs } from '../components/common/Tabs';
import {
  Button,
  ColorBadge,
  ErrorState,
  Panel,
  Skeleton,
  focusRing,
} from '../components/common/ui';
import { VETO_BADGE_COLOR, t } from '../i18n/vi';
import { QUADRANT_COLORS, QUADRANT_LABELS } from '../i18n/scoring';
import { formatDate, formatVND } from '../lib/format';
import { useUiStore } from '../stores/uiStore';
import type {
  ChangeLogEntry,
  CommitteeResponse,
  Deal,
  Factor,
  HandoverState,
  Interaction,
  Project,
  Scorecard as ScorecardData,
} from '../types';

type Tab = 'info' | 'score' | 'committee' | 'notes' | 'handover';

interface DealFull extends Deal {
  activities: Interaction[];
  documents: unknown[];
  /** Tổng quan dự án triển khai — chỉ có khi cơ hội đã gắn dự án (v23). */
  project: Project | null;
  changes: ChangeLogEntry[];
}

export default function DealDetailPage() {
  const { dealId } = useParams();
  const id = Number(dealId);
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState(false);
  const openTaskComposer = useUiStore((s) => s.openTaskComposer);

  const tab = (params.get('tab') as Tab) ?? 'score';
  const focusFactor = (params.get('factor') as Factor) ?? null;
  const setTab = (next: Tab) => {
    const merged = new URLSearchParams(params);
    merged.set('tab', next);
    merged.delete('factor');
    setParams(merged, { replace: true });
  };

  const {
    data: deal,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['deal', id, 'full'],
    queryFn: () => api.get<DealFull>(`/api/deals/${id}`),
    enabled: Number.isFinite(id),
  });

  const { data: card } = useQuery({
    queryKey: ['deal', id, 'scorecard'],
    queryFn: () => api.get<ScorecardData>(`/api/deals/${id}/scorecard`),
    enabled: Number.isFinite(id),
  });

  /* Trùng đúng query key mà CommitteePanel/HandoverPanel đang dùng cho tab của
     chúng — TanStack Query dùng chung cache, chỉ để lấy số cho smart buttons
     chứ không fetch thêm lần nào. */
  const { data: committee } = useQuery({
    queryKey: ['deal', id, 'committee'],
    queryFn: () => api.get<CommitteeResponse>(`/api/deals/${id}/committee`),
    enabled: Number.isFinite(id),
  });

  const { data: handover } = useQuery({
    queryKey: ['deal', id, 'handover'],
    queryFn: () => api.get<HandoverState>(`/api/deals/${id}/handover`),
    enabled: Number.isFinite(id),
  });

  if (error)
    return (
      <div className="p-6">
        <ErrorState onRetry={() => refetch()} />
      </div>
    );
  if (isLoading || !deal)
    return (
      <div role="status" aria-label={t.common.loading} className="space-y-4 p-6">
        <Skeleton className="h-24 rounded-panel" />
        <Skeleton className="h-64 rounded-panel" />
      </div>
    );

  const TABS: { key: Tab; label: string }[] = [
    { key: 'score', label: 'Chấm điểm' },
    { key: 'committee', label: 'Nhóm quyết định' },
    { key: 'info', label: 'Thông tin' },
    { key: 'notes', label: 'Ghi chú họp' },
    { key: 'handover', label: 'Bàn giao' },
  ];

  const pendingHandover = deal.stage === 'won' && !deal.handover_ready;

  return (
    <div className="p-6">
      {/* Chuoi ba tang that su cua co hoi la Khach hang → Ho so → Co hoi; di
          qua Pipeline chi la mot loi vao khac. */}
      <Breadcrumbs
        items={[
          { label: t.nav.customers, to: '/customers' },
          // Ten khach hang khong phai luc nao cung co trong payload; thieu thi bo
          // han bac do thay vi hien mot muc trong.
          ...(deal.customer_name
            ? [{ label: deal.customer_name, to: `/customers/${deal.customer_id}` }]
            : []),
          { label: deal.title },
        ]}
      />
      <div className="mt-2 mb-4 flex items-start gap-3">
        <Link
          to="/pipeline"
          aria-label={`Quay lại ${t.nav.pipeline}`}
          className={`mt-1 rounded-control p-1 text-tr-muted hover:bg-tr-hover ${focusRing}`}
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-tr-text">{deal.title}</h2>
            {card && (
              <ColorBadge color={QUADRANT_COLORS[card.quadrant]}>
                Scoring: {QUADRANT_LABELS[card.quadrant]}
              </ColorBadge>
            )}
            {card?.veto.some((v) => v.blocking) && (
              <ColorBadge color={VETO_BADGE_COLOR}>Ngoài forecast</ColorBadge>
            )}
            {deal.is_renewal === 1 && (
              <span className="flex items-center gap-1 text-xs text-tr-muted">
                <RefreshCw size={12} /> Gia hạn
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-4 text-sm text-tr-muted">
            <Link
              to={`/customers/${deal.customer_id}`}
              className={`text-tr-primary hover:underline ${focusRing}`}
            >
              {deal.customer_name}
            </Link>
            <span>
              Giá trị: <strong className="text-tr-success">{formatVND(deal.value_vnd)}</strong>
            </span>
            <span>
              Xác suất: <strong>{deal.probability}%</strong>
            </span>
            {deal.expected_close_date && (
              <span>Dự kiến chốt: {formatDate(deal.expected_close_date)}</span>
            )}
          </div>
          <div className="mt-1.5">
            <EntityLabels entityType="deal" entityId={id} />
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <AiBrief contextType="deal" contextId={id} />
          {/* Cong viec tao tu day tu mang theo khach hang va nguoi lien he cua co hoi. */}
          <Button onClick={() => openTaskComposer({ context: { deal_id: id } })}>
            <Plus size={15} /> Tạo công việc
          </Button>
          <Button onClick={() => setEditing(true)}>
            <Pencil size={15} /> {t.common.edit}
          </Button>
        </div>
      </div>

      <div className="mb-4">
        <DealStageStepper deal={deal} />
      </div>

      <div className="mb-4">
        <DealSmartButtons
          documentCount={deal.documents.length}
          scorecard={card}
          committee={committee}
          handover={handover}
          pendingHandover={pendingHandover}
          onNavigate={setTab}
        />
      </div>

      <div
        className={`grid grid-cols-1 gap-4 ${tab === 'notes' ? '' : 'lg:grid-cols-[minmax(0,1fr)_320px]'}`}
      >
        <div className="min-w-0">
          <Tabs
            value={tab}
            onChange={setTab}
            items={TABS.map((item) => ({ value: item.key, label: item.label }))}
            ariaLabel="Nội dung cơ hội"
            idPrefix="dealtab"
            className="mb-4"
          >
            {tab === 'score' && (
              <Scorecard
                dealId={id}
                focusFactor={focusFactor}
                onGoToCommittee={() => setTab('committee')}
              />
            )}

            {tab === 'committee' && <CommitteePanel deal={deal} scorecard={card} />}

            {tab === 'info' && (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <Panel title="Thông tin cơ hội">
                  <dl className="space-y-2 text-sm">
                    <Row label="Sản phẩm / dịch vụ" value={deal.product} />
                    <Row label="Nguồn" value={deal.source} />
                    <Row label="Người liên hệ chính" value={deal.contact_name ?? null} />
                    <Row label="Nhu cầu khách hàng" value={deal.need} />
                    <Row label="Hành động tiếp theo" value={deal.next_action} />
                    <Row
                      label="Ngày thực hiện"
                      value={deal.next_action_date ? formatDate(deal.next_action_date) : null}
                    />
                    {deal.lost_reason && (
                      <Row
                        label={t.deal.lostReason}
                        value={t.lostReason[deal.lost_reason] ?? deal.lost_reason}
                      />
                    )}
                  </dl>
                  <p className="mt-3 border-t border-tr-border pt-3 text-sm whitespace-pre-wrap text-tr-text">
                    {deal.notes || '—'}
                  </p>
                </Panel>
                <DocumentPanel links={{ deal_id: id }} title="Tài liệu của cơ hội" />
              </div>
            )}

            {tab === 'notes' && (
              <MeetingNotesPanel links={{ deal_id: id }} customerId={deal.customer_id} />
            )}

            {tab === 'handover' && (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <HandoverPanel dealId={id} />
                <div className="space-y-4">
                  <Panel title="Dự án triển khai">
                    {deal.project ? (
                      <div className="space-y-2 text-sm">
                        <Link
                          to={`/projects/${deal.project.id}`}
                          className={`inline-flex items-center gap-1.5 font-medium text-tr-primary hover:underline ${focusRing}`}
                        >
                          <FolderKanban size={15} aria-hidden="true" />
                          {deal.project.name}
                        </Link>
                        {/*
                        Chỉ thông tin TỔNG QUAN (đặc tả 7.4). Mọi con số ở đây đều
                        do máy chủ tính khi đọc từ chính dự án, không phải bản sao
                        lưu trên cơ hội — nên không có gì để lệch.
                      */}
                        <dl className="space-y-2">
                          <Row label="Trạng thái" value={t.projectStatus[deal.project.status]} />
                          <Row
                            label="Tiến độ"
                            value={`${deal.project.progress_pct}% · ${deal.project.task_done}/${deal.project.task_total} việc`}
                          />
                          <Row
                            label="Hạn kế hoạch"
                            value={deal.project.plan_end ? formatDate(deal.project.plan_end) : null}
                          />
                          <Row label="Người phụ trách" value={deal.project.owner_name} />
                        </dl>
                        <HealthBadge health={deal.project.health} />
                      </div>
                    ) : (
                      <p className="text-sm text-tr-muted">
                        Cơ hội này chưa gắn dự án triển khai nào. Chọn dự án trong biểu mẫu sửa cơ
                        hội — mỗi cơ hội gắn được tối đa một dự án.
                      </p>
                    )}
                  </Panel>
                  <ChangeLogPanel entries={deal.changes ?? []} />
                </div>
              </div>
            )}
          </Tabs>
        </div>

        {tab !== 'notes' && (
          <DealActivitySidebar
            dealId={id}
            customerId={deal.customer_id}
            activities={deal.activities}
          />
        )}
      </div>

      <DealForm
        open={editing}
        deal={deal}
        defaultCustomerId={deal.customer_id}
        onClose={() => setEditing(false)}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-3">
      <dt className="w-40 shrink-0 text-tr-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-tr-text">{value || '—'}</dd>
    </div>
  );
}
