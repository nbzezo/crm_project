/**
 * Trang chi tiết Cơ hội — nhà của module chấm điểm.
 *
 * Bố cục tab dùng lại đúng khuôn `role="tablist"` của trang Hồ sơ khách hàng.
 * Biểu mẫu sửa nhanh (DealForm dạng modal) giữ nguyên, không thay thế.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router';
import { ArrowLeft, Pencil, Plus, RefreshCw } from 'lucide-react';
import { api } from '../api/client';
import { DealForm } from '../components/crm/DealForm';
import { Scorecard } from '../components/crm/Scorecard';
import { CommitteePanel } from '../components/crm/CommitteePanel';
import { InteractionTimeline } from '../components/crm/InteractionTimeline';
import { DocumentPanel } from '../components/crm/DocumentUpload';
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
import { STAGE_COLORS, t } from '../i18n/vi';
import { QUADRANT_COLORS, QUADRANT_LABELS } from '../i18n/scoring';
import { formatDate, formatVND } from '../lib/format';
import { useUiStore } from '../stores/uiStore';
import type { CustomerFull, Deal, Factor, Scorecard as ScorecardData } from '../types';

type Tab = 'info' | 'score' | 'committee' | 'activities';

interface DealFull extends Deal {
  activities: unknown[];
  documents: unknown[];
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

  // Chỉ tải hồ sơ khách hàng khi vào tab Hoạt động — timeline cần danh sách liên hệ
  const { data: customer } = useQuery({
    queryKey: ['customer', deal?.customer_id],
    queryFn: () => api.get<CustomerFull>(`/api/customers/${deal!.customer_id}/full`),
    enabled: Boolean(deal?.customer_id) && tab === 'activities',
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
    { key: 'activities', label: 'Hoạt động' },
  ];

  return (
    <div className="p-6">
      <div className="mb-4 flex items-start gap-3">
        <Link to="/pipeline" className="mt-1 rounded p-1 text-tr-muted hover:bg-tr-hover">
          <ArrowLeft size={18} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-tr-text">{deal.title}</h2>
            <ColorBadge color={STAGE_COLORS[deal.stage]}>{t.stage[deal.stage]}</ColorBadge>
            {card && (
              <ColorBadge color={QUADRANT_COLORS[card.quadrant]}>
                {QUADRANT_LABELS[card.quadrant]}
              </ColorBadge>
            )}
            {card?.veto.some((v) => v.blocking) && (
              <ColorBadge color="#e04b3a">Ngoài forecast</ColorBadge>
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
              Xác suất theo giai đoạn: <strong>{deal.probability}%</strong>
            </span>
            {deal.expected_close_date && (
              <span>Dự kiến chốt: {formatDate(deal.expected_close_date)}</span>
            )}
            {card && (
              <span>
                BANT <strong className="text-tr-text">{card.bant_total}</strong>/12 · 4P{' '}
                <strong className="text-tr-text">{card.p4_total}</strong>/12
              </span>
            )}
          </div>
          <div className="mt-1.5">
            <EntityLabels entityType="deal" entityId={id} />
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
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
        <AiBrief contextType="deal" contextId={id} compact />
      </div>

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

        {tab === 'committee' && <CommitteePanel deal={deal} />}

        {tab === 'info' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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

        {tab === 'activities' &&
          (customer ? (
            <InteractionTimeline
              customerId={deal.customer_id}
              interactions={customer.interactions ?? []}
              contacts={customer.contacts}
              deals={customer.deals}
              defaultDealId={id}
            />
          ) : (
            <Skeleton className="h-48 rounded-panel" />
          ))}
      </Tabs>

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
