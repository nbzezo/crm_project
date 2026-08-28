import { CARD_STATUSES } from '@workflow/contracts';
import { focusRing, selectOptionContrast } from '../common/ui';
import { t } from '../../i18n/vi';
import type { CardStatus } from '../../types';

/**
 * Màu theo *ý nghĩa hành động*, không theo thứ tự vòng đời.
 *
 * Hai trạng thái chờ bên ngoài (`waiting_customer`, `blocked`) dùng tông cảnh báo
 * vì chúng là thứ cần một lời nhắc, không phải thứ tự nó sẽ tiến lên.
 */
export const CARD_STATUS_TONE: Record<CardStatus, string> = {
  todo: 'bg-tr-hover text-tr-subtle',
  doing: 'bg-tr-primary/15 text-tr-primary',
  waiting_customer: 'bg-amber-500/15 text-amber-500',
  blocked: 'bg-tr-danger/15 text-tr-danger',
  review: 'bg-violet-500/15 text-violet-400',
  done: 'bg-tr-success/15 text-tr-success',
};

/**
 * Chỉ màu chữ, dùng khi chip nằm trên **nền không đoán trước được**.
 *
 * `CARD_STATUS_TONE` có nền bán trong suốt: đặt lên tiêu đề cột Kanban thì nó
 * hoà với màu nền bảng do người dùng chọn, và tương phản tụt xuống dưới ngưỡng
 * WCAG AA (đo được 4.49 trên nền xanh đậm). Ghép với một nền đục là hết đoán.
 */
export const CARD_STATUS_TEXT: Record<CardStatus, string> = {
  todo: 'text-tr-subtle',
  doing: 'text-tr-primary',
  waiting_customer: 'text-amber-500',
  blocked: 'text-tr-danger',
  review: 'text-violet-400',
  done: 'text-tr-success',
};

/** Trạng thái đang chờ một ai đó bên ngoài — tập mà màn “Cần nhắc” quan tâm. */
export function isWaitingStatus(status: CardStatus | null | undefined): boolean {
  return status === 'blocked' || status === 'waiting_customer';
}

export function CardStatusChip({
  status,
  blockedReason,
}: {
  status: CardStatus | null | undefined;
  blockedReason?: string | null;
}) {
  const value = status ?? 'todo';
  // 'todo' là mặc định của mọi thẻ — bày nó ở mọi nơi chỉ làm loãng thông tin.
  if (value === 'todo') return null;
  return (
    <span
      title={blockedReason ?? undefined}
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${CARD_STATUS_TONE[value]}`}
    >
      {t.cardStatus[value]}
    </span>
  );
}

/** Ô chọn trạng thái gọn cho dòng bảng / dòng cây. */
export function CardStatusSelect({
  value,
  taskTitle,
  onChange,
}: {
  value: CardStatus | null | undefined;
  taskTitle: string;
  onChange: (status: CardStatus) => void;
}) {
  const current = value ?? 'todo';
  return (
    <select
      value={current}
      aria-label={`Trạng thái: ${taskTitle}`}
      onChange={(e) => onChange(e.target.value as CardStatus)}
      className={`max-w-36 truncate rounded-control border border-transparent px-1.5 py-0.5 text-xs outline-none transition hover:border-tr-border focus:border-tr-primary ${CARD_STATUS_TONE[current]} ${focusRing} ${selectOptionContrast}`}
    >
      {CARD_STATUSES.map((status) => (
        <option key={status} value={status}>
          {t.cardStatus[status]}
        </option>
      ))}
    </select>
  );
}
