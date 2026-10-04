import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { describeWhen } from '../../lib/quickTaskParser';
import { reminderPresets } from '../../lib/reminderTimes';
import { Popover, usePopover } from '../common/Popover';
import { Button, DateTimeInput, focusRing } from '../common/ui';

const LOCAL_MINUTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * O chon gio nhac cho mot viec CHUA tao (1.17.1) — form "Tạo công việc" va o
 * them nhanh dau danh sach. Gia tri la 'YYYY-MM-DDTHH:mm'; noi goi tu tao dong
 * `reminders` sau khi luu viec. Viec da co thi dung o "Nhắc lúc" trong CardModal
 * (dat nhieu lan nhac, bo tung lan).
 *
 * `variant="field"`: rong nhu mot o nhap trong form. `variant="chip"`: nut nho
 * trong thanh cong cu.
 */
export function ReminderField({
  value,
  onChange,
  dueDate,
  variant = 'field',
  hint,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  /** Han chot 'YYYY-MM-DD' — de goi y "9:00 ngày hạn". */
  dueDate?: string | null;
  variant?: 'field' | 'chip';
  /** Chu nho sau nhan, vd. "tự hiểu" khi gio lay tu dong vua go. */
  hint?: string;
}) {
  const pop = usePopover();
  const [custom, setCustom] = useState('');

  useEffect(() => {
    if (pop.open) setCustom(value ?? reminderPresets(new Date())[1].value);
  }, [pop.open, value]);

  const pick = (next: string | null) => {
    onChange(next);
    pop.close();
  };

  const label = value ? `Nhắc ${describeWhen(value)}` : 'Nhắc lúc…';

  return (
    <>
      <div
        className={
          variant === 'field'
            ? 'flex min-h-11 w-full items-center rounded-control border border-tr-border bg-tr-list fine:min-h-[38px]'
            : `inline-flex items-center rounded-full border ${value ? 'border-tr-primary/40 bg-tr-primary/10' : 'border-tr-border bg-tr-panel'}`
        }
      >
        <button
          type="button"
          onClick={pop.toggle}
          aria-haspopup="dialog"
          aria-expanded={pop.open}
          className={`flex min-w-0 flex-1 items-center gap-1.5 text-left ${
            variant === 'field' ? 'px-3 py-2 text-sm' : 'min-h-8 px-2.5 text-xs'
          } ${value ? 'font-medium text-tr-primary' : 'text-tr-muted'} rounded-control ${focusRing}`}
        >
          <Bell size={variant === 'field' ? 15 : 13} className="shrink-0" aria-hidden="true" />
          <span className="truncate">{label}</span>
          {hint && value && <span className="shrink-0 font-normal text-tr-muted">· {hint}</span>}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="Bỏ giờ nhắc"
            className={`mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-tr-muted hover:bg-tr-hover hover:text-tr-text ${focusRing}`}
          >
            <X size={13} aria-hidden="true" />
          </button>
        )}
      </div>
      <Popover open={pop.open} anchor={pop.anchor} onClose={pop.close} title="Nhắc lúc" width={360}>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {reminderPresets(new Date(), dueDate).map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => pick(preset.value)}
                className={`rounded-full border border-tr-border px-2.5 py-1 text-xs text-tr-text transition hover:border-tr-primary hover:text-tr-primary ${focusRing}`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-tr-subtle">Hoặc chọn giờ</span>
            <DateTimeInput value={custom || null} onChange={(next) => setCustom(next ?? '')} />
          </label>
          <Button
            variant="primary"
            className="w-full"
            disabled={!LOCAL_MINUTE.test(custom)}
            onClick={() => pick(custom)}
          >
            Đặt nhắc
          </Button>
        </div>
      </Popover>
    </>
  );
}
