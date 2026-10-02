import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { formatDate, todayStr } from '../../lib/format';
import { ErrorState, Skeleton } from '../common/ui';
import { FocusAgenda } from './FocusAgenda';
import { FocusAiPanel } from './FocusAiPanel';
import { FocusDigestDialog } from './FocusDigestDialog';
import {
  AttentionPanel,
  CarryOverPanel,
  MilestonesPanel,
  RetroPanel,
  RevenuePanel,
  WaitingPanel,
  WorkloadPanel,
} from './FocusPanels';
import { FocusSummary } from './FocusSummary';
import { FocusToolbar } from './FocusToolbar';
import { periodFor, periodTitle, type Period } from './focusPeriod';
import type { FocusData, FocusMode } from './focusTypes';
import { readPrefs, writePrefs } from './focusPrefs';

/**
 * Tab "Trọng tâm" cua trang Tong quan: trong ky da chon toi phai lam gi, can
 * chu y gi — kem goi y cua AI. Du lieu tu GET /api/focus.
 */
export function FocusView() {
  const today = todayStr();
  const [initial] = useState(readPrefs);
  const [period, setPeriod] = useState<Period>(() => periodFor(initial.kind, today));
  const [mode, setMode] = useState<FocusMode>(initial.mode);
  const [digestOpen, setDigestOpen] = useState(false);

  useEffect(() => {
    writePrefs({ kind: period.kind === 'custom' ? initial.kind : period.kind, mode });
  }, [period.kind, mode, initial.kind]);

  const { data, error, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['focus', period.from, period.to, mode],
    queryFn: () =>
      api.get<FocusData>(`/api/focus?from=${period.from}&to=${period.to}&mode=${mode}`),
    placeholderData: keepPreviousData,
  });

  const effectiveMode = data?.scope.mode ?? mode;
  const title = periodTitle(period, data?.range.today ?? today);
  const rangeText =
    period.from === period.to
      ? formatDate(period.from)
      : `${formatDate(period.from)} – ${formatDate(period.to)}`;

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-xl font-bold tracking-[-0.02em] text-tr-text sm:text-2xl">
          Trọng tâm {title}
        </h2>
        <span className="text-sm text-tr-muted" aria-live="polite">
          {rangeText}
          {effectiveMode === 'team' ? ' · nhóm tôi quản lý' : ''}
          {isFetching && !isLoading ? ' · đang cập nhật…' : ''}
        </span>
      </div>

      <FocusToolbar
        period={period}
        today={data?.range.today ?? today}
        onChange={setPeriod}
        mode={effectiveMode}
        canTeam={data?.can_team ?? false}
        onModeChange={setMode}
        onOpenDigest={() => setDigestOpen(true)}
      />

      {error ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : !data ? (
        <div role="status" aria-label="Đang tải Trọng tâm" className="space-y-3">
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-[84px] rounded-panel" />
            ))}
          </div>
          <div className="grid gap-3 lg:grid-cols-12">
            <Skeleton className="h-96 rounded-panel lg:col-span-8" />
            <Skeleton className="h-96 rounded-panel lg:col-span-4" />
          </div>
        </div>
      ) : (
        <>
          <FocusSummary data={data} />

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
            <div className="min-w-0 space-y-3 lg:col-span-8">
              <FocusAiPanel
                key={`${period.from}|${period.to}|${effectiveMode}`}
                data={data}
                mode={effectiveMode}
              />
              <FocusAgenda key={`${period.from}|${period.to}`} data={data} />
              <div className="grid gap-3 md:grid-cols-2">
                <RetroPanel data={data} />
                <RevenuePanel data={data} />
              </div>
            </div>
            <div className="min-w-0 space-y-3 lg:col-span-4">
              <CarryOverPanel data={data} />
              <AttentionPanel
                data={data}
                onSelectDay={(date) => setPeriod(periodFor('day', date))}
              />
              <WaitingPanel data={data} />
              <MilestonesPanel data={data} />
            </div>
          </div>

          <WorkloadPanel data={data} />
        </>
      )}

      <FocusDigestDialog open={digestOpen} onClose={() => setDigestOpen(false)} />
    </div>
  );
}
