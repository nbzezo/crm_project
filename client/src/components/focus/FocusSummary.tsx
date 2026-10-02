import {
  AlertTriangle,
  CalendarClock,
  Gauge,
  ListTodo,
  Target,
  type LucideIcon,
} from 'lucide-react';
import { formatVNDShort } from '../../lib/format';
import type { FocusData } from './focusTypes';

function hours(minutes: number): string {
  const value = Math.round((minutes / 60) * 10) / 10;
  return `${value.toLocaleString('vi-VN')} giờ`;
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone?: 'neutral' | 'danger' | 'warning';
}) {
  const toneClass =
    tone === 'danger'
      ? 'bg-tr-danger/10 text-tr-danger'
      : tone === 'warning'
        ? 'bg-tr-warning/10 text-tr-warning'
        : 'bg-tr-panel text-tr-text';
  return (
    <div
      className={`tr-kpi tr-bento-card flex min-h-[84px] min-w-0 flex-col justify-between rounded-panel border border-tr-border p-3 ${toneClass}`}
    >
      <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-tr-subtle">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-tr-hover">
          <Icon size={13} aria-hidden="true" />
        </span>
        <span className="truncate">{label}</span>
      </span>
      <span className="mt-1.5 flex min-w-0 items-end justify-between gap-1.5">
        <span className="tr-kpi-value truncate text-2xl font-bold tracking-[-0.035em] tabular-nums">
          {value}
        </span>
        {hint && <span className="truncate pb-0.5 text-xs font-medium text-tr-subtle">{hint}</span>}
      </span>
    </div>
  );
}

/** Thanh tai: khoi luong uoc tinh so voi gio lam con lai trong ky. */
function LoadStat({ data }: { data: FocusData }) {
  const { load_hours: load, capacity_hours: capacity, unestimated_count } = data.summary;
  const ratio = capacity > 0 ? load / capacity : load > 0 ? 2 : 0;
  const tone = ratio > 1 ? 'danger' : ratio > 0.85 ? 'warning' : 'neutral';
  const barClass =
    tone === 'danger' ? 'bg-tr-danger' : tone === 'warning' ? 'bg-tr-warning' : 'bg-tr-success';
  const label = capacity > 0 ? `${Math.round(ratio * 100)}%` : load > 0 ? 'Hết giờ' : '—';
  return (
    <div
      className={`tr-kpi tr-bento-card col-span-2 flex min-h-[84px] min-w-0 flex-col justify-between rounded-panel border border-tr-border p-3 md:col-span-1 ${tone === 'danger' ? 'bg-tr-danger/10' : 'bg-tr-panel'}`}
      title={`Ước tính ${load} giờ (gồm giờ họp; việc chưa ước lượng tính 1 giờ) trên ${capacity} giờ làm việc còn lại`}
    >
      <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-tr-subtle">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-tr-hover">
          <Gauge size={13} aria-hidden="true" />
        </span>
        <span className="truncate">Khối lượng</span>
      </span>
      <span className="mt-1 flex items-end justify-between gap-1.5">
        <span
          className={`tr-kpi-value text-2xl font-bold tracking-[-0.035em] tabular-nums ${tone === 'danger' ? 'text-tr-danger' : 'text-tr-text'}`}
        >
          {label}
        </span>
        <span className="truncate pb-0.5 text-xs font-medium text-tr-subtle">
          {load}/{capacity} giờ
        </span>
      </span>
      <span
        className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-tr-hover"
        role="meter"
        aria-label="Khối lượng so với giờ làm việc còn lại"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, Math.round(ratio * 100))}
      >
        <span
          className={`block h-full rounded-full ${barClass}`}
          style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }}
        />
      </span>
      {unestimated_count > 0 && (
        <span className="sr-only">{unestimated_count} việc chưa có ước lượng giờ</span>
      )}
    </div>
  );
}

export function FocusSummary({ data }: { data: FocusData }) {
  const s = data.summary;
  return (
    <section aria-label="Tóm tắt kỳ" className="grid grid-cols-2 gap-2.5 md:grid-cols-5">
      <Stat
        icon={ListTodo}
        label="Việc đến hạn"
        value={String(s.open_due_count)}
        hint={s.done_due_count > 0 ? `${s.done_due_count} đã xong` : undefined}
      />
      <Stat
        icon={AlertTriangle}
        label="Quá hạn"
        value={String(s.overdue_count)}
        hint={
          s.overdue_count === 0
            ? 'Đang kiểm soát tốt'
            : s.carry_over_count > 0
              ? `${s.carry_over_count} tồn trước kỳ`
              : 'trong kỳ này'
        }
        tone={s.overdue_count > 0 ? 'danger' : 'neutral'}
      />
      <Stat
        icon={CalendarClock}
        label="Lịch họp"
        value={String(s.meeting_count)}
        hint={s.meeting_minutes > 0 ? hours(s.meeting_minutes) : undefined}
      />
      <Stat
        icon={Target}
        label="Mốc kinh doanh"
        value={String(s.deal_close_count + s.expiring_count)}
        hint={
          s.deal_close_count > 0
            ? `${s.deal_close_count} chốt · ${formatVNDShort(s.deal_close_vnd)}`
            : s.expiring_count > 0
              ? `${s.expiring_count} sắp hết hạn`
              : undefined
        }
        tone={s.expiring_count > 0 ? 'warning' : 'neutral'}
      />
      <LoadStat data={data} />
    </section>
  );
}
