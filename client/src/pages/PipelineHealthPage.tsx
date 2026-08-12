/**
 * F-08 — Sức khỏe pipeline: nơi hai con số forecast gặp nhau.
 *
 * Con số thứ nhất là forecast truyền thống (Σ giá trị × xác suất theo giai đoạn).
 * Con số thứ hai đã lọc theo veto và tuổi điểm. **Chênh lệch giữa chúng chính là
 * mức thổi phồng pipeline** — đó là toàn bộ lý do màn này tồn tại.
 *
 * Kèm F-02 (ma trận), F-18 (deal đang tụt điểm) và F-17 (phiên rà soát).
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { AlertTriangle, TrendingDown } from 'lucide-react';
import { api, qs } from '../api/client';
import { OpportunityMatrix, type MatrixDeal } from '../components/crm/OpportunityMatrix';
import { ReviewSession } from '../components/crm/ReviewSession';
import {
  ColorBadge,
  EmptyState,
  ErrorState,
  Panel,
  Select,
  Skeleton,
  focusRing,
} from '../components/common/ui';
import { STAGE_ORDER, t } from '../i18n/vi';
import { FACTOR_LABELS, QUADRANT_COLORS, QUADRANT_LABELS, VETO_LABELS } from '../i18n/scoring';
import { formatDate, formatPercent, formatVND, formatVNDShort } from '../lib/format';
import type { Factor, Quadrant, Stage, VetoCode } from '../types';

interface HealthData {
  stage_weighted_vnd: number;
  filtered_weighted_vnd: number;
  inflation_vnd: number;
  inflation_ratio: number;
  open_count: number;
  excluded_count: number;
  quadrant_totals: Record<Quadrant, { count: number; sum_vnd: number }>;
  excluded: {
    id: number;
    title: string;
    customer_name: string;
    weighted_vnd: number;
    blocked_by: string[];
  }[];
  declining: {
    id: number;
    title: string;
    customer_name: string;
    factor: string;
    old_score: number;
    new_score: number;
    changed_at: string;
  }[];
  settings: { stale_days: number; v3_mode: string };
}

export default function PipelineHealthPage() {
  const [stage, setStage] = useState('');
  const [industry, setIndustry] = useState('');
  const [minValue, setMinValue] = useState('');

  const {
    data: health,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['pipeline-health'],
    queryFn: () => api.get<HealthData>('/api/views/pipeline-health'),
  });

  const { data: matrix } = useQuery({
    queryKey: ['matrix', stage, industry, minValue],
    queryFn: () =>
      api.get<{ deals: MatrixDeal[]; industries: string[] }>(
        `/api/views/matrix${qs({ stage, industry, min_value: minValue })}`
      ),
  });

  if (error)
    return (
      <div className="p-6">
        <ErrorState onRetry={() => refetch()} />
      </div>
    );
  if (isLoading || !health)
    return (
      <div className="space-y-4 p-6" role="status" aria-label={t.common.loading}>
        <Skeleton className="h-24 rounded-panel" />
        <Skeleton className="h-96 rounded-panel" />
      </div>
    );

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold text-tr-text">Sức khỏe pipeline</h2>
        <ReviewSession />
      </div>

      {/* Ba con số: truyền thống, đã lọc, và chênh lệch */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Panel>
          <p className="text-xs font-semibold text-tr-subtle">Forecast theo giai đoạn</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-tr-text">
            {formatVNDShort(health.stage_weighted_vnd)}
          </p>
          <p className="text-xs text-tr-muted">Σ giá trị × xác suất theo giai đoạn</p>
        </Panel>
        <Panel>
          <p className="text-xs font-semibold text-tr-subtle">Forecast đã lọc</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-tr-success">
            {formatVNDShort(health.filtered_weighted_vnd)}
          </p>
          <p className="text-xs text-tr-muted">
            Bỏ deal có veto hoặc điểm quá {health.settings.stale_days} ngày
          </p>
        </Panel>
        <Panel className="border-tr-warning/50">
          <p className="text-xs font-semibold text-tr-subtle">Mức thổi phồng pipeline</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-tr-warning">
            {formatVNDShort(health.inflation_vnd)}
          </p>
          <p className="text-xs text-tr-muted">
            {formatPercent(health.inflation_ratio)} pipeline · {health.excluded_count}/
            {health.open_count} cơ hội bị loại
          </p>
        </Panel>
      </div>

      {/* Tỷ trọng 4 ô */}
      <Panel title="Phân bố theo ô ma trận">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(Object.keys(health.quadrant_totals) as Quadrant[]).map((quadrant) => (
            <div key={quadrant} className="rounded-control border border-tr-border p-2.5">
              <ColorBadge color={QUADRANT_COLORS[quadrant]} small>
                {QUADRANT_LABELS[quadrant]}
              </ColorBadge>
              <p className="mt-1.5 text-lg font-semibold tabular-nums text-tr-text">
                {health.quadrant_totals[quadrant].count}
              </p>
              <p className="text-xs text-tr-muted">
                {formatVNDShort(health.quadrant_totals[quadrant].sum_vnd)}
              </p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title="Ma trận cơ hội"
        action={
          <div className="flex flex-wrap gap-2">
            <Select
              value={stage}
              aria-label="Lọc theo giai đoạn"
              onChange={(e) => setStage(e.target.value)}
              className="h-8 w-auto py-0 text-xs"
            >
              <option value="">Mọi giai đoạn</option>
              {STAGE_ORDER.filter((s) => s !== 'won' && s !== 'lost').map((s) => (
                <option key={s} value={s}>
                  {t.stage[s as Stage]}
                </option>
              ))}
            </Select>
            <Select
              value={industry}
              aria-label="Lọc theo ngành"
              onChange={(e) => setIndustry(e.target.value)}
              className="h-8 w-auto py-0 text-xs"
            >
              <option value="">Mọi ngành</option>
              {(matrix?.industries ?? []).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
            <Select
              value={minValue}
              aria-label="Lọc theo quy mô deal"
              onChange={(e) => setMinValue(e.target.value)}
              className="h-8 w-auto py-0 text-xs"
            >
              <option value="">Mọi quy mô</option>
              <option value="100000000">Từ 100 triệu</option>
              <option value="500000000">Từ 500 triệu</option>
              <option value="1000000000">Từ 1 tỷ</option>
            </Select>
          </div>
        }
      >
        {(matrix?.deals.length ?? 0) === 0 ? (
          <EmptyState message="Chưa có cơ hội đang mở nào khớp bộ lọc." />
        ) : (
          <OpportunityMatrix deals={matrix!.deals} />
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Bị loại khỏi forecast đã lọc">
          {health.excluded.length === 0 ? (
            <p className="text-sm text-tr-muted">Không có cơ hội nào bị loại.</p>
          ) : (
            <ul className="space-y-1.5">
              {health.excluded.map((deal) => (
                <li key={deal.id} className="rounded-control border border-tr-border p-2.5">
                  <Link
                    to={`/deals/${deal.id}`}
                    className={`text-sm font-medium text-tr-text hover:underline ${focusRing}`}
                  >
                    {deal.title}
                  </Link>
                  <p className="text-xs text-tr-muted">
                    {deal.customer_name} · {formatVND(deal.weighted_vnd)} weighted
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-tr-danger">
                    <AlertTriangle size={11} aria-hidden="true" />
                    {deal.blocked_by
                      .map((code) =>
                        code === 'STALE'
                          ? `Điểm quá ${health.settings.stale_days} ngày`
                          : (VETO_LABELS[code as VetoCode]?.title ?? code)
                      )
                      .join(' · ')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Đang tụt điểm (30 ngày gần nhất)">
          {health.declining.length === 0 ? (
            <p className="text-sm text-tr-muted">Không có yếu tố nào bị hạ điểm gần đây.</p>
          ) : (
            <ul className="space-y-1.5">
              {health.declining.map((row, index) => (
                <li
                  key={`${row.id}-${index}`}
                  className="flex flex-wrap items-center gap-2 rounded-control border border-tr-border p-2.5 text-sm"
                >
                  <TrendingDown size={14} className="shrink-0 text-tr-warning" aria-hidden="true" />
                  <Link
                    to={`/deals/${row.id}`}
                    className={`min-w-0 flex-1 truncate font-medium text-tr-text hover:underline ${focusRing}`}
                  >
                    {row.title}
                  </Link>
                  <span className="text-xs text-tr-muted">
                    {FACTOR_LABELS[row.factor as Factor] ?? row.factor}: {row.old_score} →{' '}
                    <strong className="text-tr-warning">{row.new_score}</strong>
                  </span>
                  <span className="text-xs text-tr-muted">
                    {formatDate(row.changed_at.slice(0, 10))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
