import { parseISO } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Popover } from '../common/Popover';
import { focusRing } from '../common/ui';
import { t } from '../../i18n/vi';
import { todayStr } from '../../lib/format';
import { useState } from 'react';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/**
 * Chon thang/nam truc tiep (muc 47) — thay vi bat nguoi dung bam `<` `>` nhieu lan.
 * Nam duoc giu rieng trong state de doi nam ma chua chon thang thi popover
 * khong dong va khong nhay lich.
 */
export function MonthYearPicker({
  open,
  anchor,
  onClose,
  value,
  onPick,
}: {
  open: boolean;
  anchor: HTMLElement | null;
  onClose: () => void;
  /** Ngay dang xem, dang 'YYYY-MM-DD'. */
  value: string;
  onPick: (dateStr: string) => void;
}) {
  const current = parseISO(value);
  const [year, setYear] = useState(current.getFullYear());
  const currentMonth = current.getMonth() + 1;
  const currentYear = current.getFullYear();
  const today = parseISO(todayStr());

  const pick = (month: number) => {
    onPick(`${year}-${String(month).padStart(2, '0')}-01`);
    onClose();
  };

  return (
    <Popover open={open} anchor={anchor} onClose={onClose} title="Chọn tháng" width={280}>
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setYear((y) => y - 1)}
          aria-label="Năm trước"
          className={`rounded-control p-1.5 text-tr-muted transition hover:bg-tr-hover ${focusRing}`}
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <span className="text-sm font-semibold text-tr-text">{year}</span>
        <button
          type="button"
          onClick={() => setYear((y) => y + 1)}
          aria-label="Năm sau"
          className={`rounded-control p-1.5 text-tr-muted transition hover:bg-tr-hover ${focusRing}`}
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {MONTHS.map((month) => {
          const selected = month === currentMonth && year === currentYear;
          const isThisMonth = month === today.getMonth() + 1 && year === today.getFullYear();
          return (
            <button
              key={month}
              type="button"
              onClick={() => pick(month)}
              aria-current={selected ? 'true' : undefined}
              className={`rounded-control px-2 py-2 text-sm transition ${focusRing} ${
                selected
                  ? 'bg-tr-primary font-semibold text-tr-on-primary'
                  : isThisMonth
                    ? 'font-semibold text-tr-primary hover:bg-tr-hover'
                    : 'text-tr-text hover:bg-tr-hover'
              }`}
            >
              {`${t.calendar.month} ${month}`}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => {
          onPick(todayStr());
          onClose();
        }}
        className={`mt-3 w-full rounded-control py-2 text-sm font-medium text-tr-primary transition hover:bg-tr-hover ${focusRing}`}
      >
        {t.common.today}
      </button>
    </Popover>
  );
}
