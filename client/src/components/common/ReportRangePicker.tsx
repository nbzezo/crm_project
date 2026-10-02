import { t } from '../../i18n/vi';
import type { RangeKey } from '../../lib/reportRange';
import { DateInput, focusRing } from './ui';

/** Bo chon khoang thoi gian dung chung cho trang Báo cáo và Hiệu suất. */
export function ReportRangePicker({
  rangeKey,
  onRangeKeyChange,
  customFrom,
  onCustomFromChange,
  customTo,
  onCustomToChange,
}: {
  rangeKey: RangeKey;
  onRangeKeyChange: (key: RangeKey) => void;
  customFrom: string;
  onCustomFromChange: (value: string) => void;
  customTo: string;
  onCustomToChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {(
        [
          ['month', t.reports.thisMonth],
          ['quarter', t.reports.thisQuarter],
          ['six', t.reports.sixMonths],
          ['custom', t.reports.custom],
        ] as [RangeKey, string][]
      ).map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onRangeKeyChange(key)}
          aria-pressed={rangeKey === key}
          className={`min-h-[44px] rounded-panel px-3 text-sm transition fine:min-h-0 fine:py-1.5 ${focusRing} ${
            rangeKey === key
              ? 'bg-tr-primary font-medium text-tr-on-primary'
              : 'border border-tr-border bg-tr-panel text-tr-subtle hover:bg-tr-hover'
          }`}
        >
          {label}
        </button>
      ))}
      {rangeKey === 'custom' && (
        <div className="flex items-center gap-2 text-sm">
          <div className="w-40">
            <DateInput
              value={customFrom || null}
              onChange={(value) => onCustomFromChange(value ?? '')}
              aria-label="Từ ngày"
            />
          </div>
          <span className="text-tr-muted" aria-hidden="true">
            →
          </span>
          <div className="w-40">
            <DateInput
              value={customTo || null}
              onChange={(value) => onCustomToChange(value ?? '')}
              aria-label="Đến ngày"
            />
          </div>
        </div>
      )}
    </div>
  );
}
