import { ChevronLeft, ChevronRight, Printer, Send, User, Users } from 'lucide-react';
import { Button, DateInput, IconButton, Segmented } from '../common/ui';
import { usePermission } from '../../lib/permissions';
import { addDays } from '../../lib/format';
import type { FocusMode } from './focusTypes';
import {
  MAX_RANGE_DAYS,
  containsToday,
  periodFor,
  periodLength,
  shiftPeriod,
  type Period,
  type PeriodKind,
} from './focusPeriod';

const KIND_OPTIONS: { value: PeriodKind; label: string }[] = [
  { value: 'day', label: 'Ngày' },
  { value: 'week', label: 'Tuần' },
  { value: 'month', label: 'Tháng' },
  { value: 'custom', label: 'Tự chọn' },
];

export function FocusToolbar({
  period,
  today,
  onChange,
  mode,
  canTeam,
  onModeChange,
  onOpenDigest,
}: {
  period: Period;
  today: string;
  onChange: (period: Period) => void;
  mode: FocusMode;
  canTeam: boolean;
  onModeChange: (mode: FocusMode) => void;
  onOpenDigest: () => void;
}) {
  const canTelegram = usePermission('settings.telegram', 'read');

  const changeKind = (kind: PeriodKind) => {
    if (kind === 'custom') {
      onChange({ kind, from: period.from, to: period.to });
      return;
    }
    // Giu ngay dang xem lam moc: dang xem 15/11 ma bam "Tuần" thi ra tuan chua 15/11.
    const anchor = containsToday(period, today) ? today : period.from;
    onChange(periodFor(kind, anchor));
  };

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <Segmented
        label="Chọn kỳ xem"
        value={period.kind}
        onChange={changeKind}
        options={KIND_OPTIONS}
      />

      <div className="flex items-center gap-1">
        <IconButton label="Kỳ trước" onClick={() => onChange(shiftPeriod(period, -1))}>
          <ChevronLeft size={16} aria-hidden="true" />
        </IconButton>
        <Button
          size="sm"
          disabled={period.kind !== 'custom' && containsToday(period, today)}
          onClick={() =>
            onChange(
              period.kind === 'custom'
                ? { kind: 'custom', from: today, to: addDays(today, periodLength(period) - 1) }
                : periodFor(period.kind, today)
            )
          }
        >
          Về hiện tại
        </Button>
        <IconButton label="Kỳ sau" onClick={() => onChange(shiftPeriod(period, 1))}>
          <ChevronRight size={16} aria-hidden="true" />
        </IconButton>
      </div>

      {period.kind === 'custom' && (
        <div className="flex items-center gap-1.5 text-sm text-tr-subtle">
          <span className="w-36">
            <DateInput
              aria-label="Từ ngày"
              value={period.from}
              onChange={(value) =>
                value && onChange(clampRange(value, value > period.to ? value : period.to, 'from'))
              }
            />
          </span>
          <span aria-hidden="true">–</span>
          <span className="w-36">
            <DateInput
              aria-label="Đến ngày"
              value={period.to}
              onChange={(value) =>
                value &&
                onChange(clampRange(value < period.from ? value : period.from, value, 'to'))
              }
            />
          </span>
        </div>
      )}

      <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
        {canTeam && (
          <Segmented
            label="Phạm vi"
            value={mode}
            onChange={onModeChange}
            options={[
              { value: 'me', label: 'Của tôi', icon: <User size={14} aria-hidden="true" /> },
              {
                value: 'team',
                label: 'Cả nhóm',
                icon: <Users size={14} aria-hidden="true" />,
              },
            ]}
          />
        )}
        <IconButton label="In / lưu PDF" onClick={() => window.print()}>
          <Printer size={16} aria-hidden="true" />
        </IconButton>
        {canTelegram && (
          <IconButton label="Bản tin Telegram" onClick={onOpenDigest}>
            <Send size={16} aria-hidden="true" />
          </IconButton>
        )}
      </div>
    </div>
  );
}

/** Giu khoang tu chon trong gioi han may chu chap nhan, uu tien dau vua sua. */
function clampRange(from: string, to: string, edited: 'from' | 'to'): Period {
  if (periodLength({ from, to }) <= MAX_RANGE_DAYS) return { kind: 'custom', from, to };
  return edited === 'from'
    ? { kind: 'custom', from, to: addDays(from, MAX_RANGE_DAYS - 1) }
    : { kind: 'custom', from: addDays(to, -(MAX_RANGE_DAYS - 1)), to };
}
