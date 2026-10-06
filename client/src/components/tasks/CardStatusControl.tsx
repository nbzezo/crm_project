import { focusRing, selectOptionContrast } from '../common/ui';
import { useTaskStatuses } from '../../lib/taskStatuses';
import type { CardStatus } from '../../types';

/**
 * Màu theo *ý nghĩa hành động*, không theo thứ tự vòng đời.
 *
 * Hai trạng thái chờ bên ngoài (`waiting_customer`, `blocked`) dùng tông cảnh báo
 * vì chúng là thứ cần một lời nhắc, không phải thứ tự nó sẽ tiến lên. Từ v67 khoá
 * là *ý nghĩa* (`kind`) của trạng thái: mọi trạng thái tự tạo cùng ý nghĩa dùng
 * chung tông này; màu riêng (nếu có) hiện thành chấm màu cạnh tên.
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

/** Chấm màu riêng của trạng thái tự tạo; không có màu riêng thì không vẽ. */
export function StatusDot({ color }: { color: string | null | undefined }) {
  if (!color) return null;
  return (
    <span
      aria-hidden="true"
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

export function CardStatusChip({
  status,
  statusKey,
  blockedReason,
}: {
  /** Ý nghĩa (`card.status`). */
  status: CardStatus | null | undefined;
  /** Trạng thái cụ thể (`card.status_key`); thiếu thì dùng trạng thái dựng sẵn. */
  statusKey?: string | null;
  blockedReason?: string | null;
}) {
  const statuses = useTaskStatuses();
  const key = statusKey ?? status ?? 'todo';
  const kind = statuses.kind(key);
  const def = statuses.def(key);
  // Trạng thái dựng sẵn "Chưa bắt đầu" là mặc định của mọi thẻ — bày nó ở mọi nơi
  // chỉ làm loãng thông tin. Trạng thái tự tạo thì luôn hiện: người dùng đặt nó có lý do.
  if (kind === 'todo' && (!def || def.is_builtin)) return null;
  return (
    <span
      title={blockedReason ?? undefined}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${CARD_STATUS_TONE[kind]}`}
    >
      <StatusDot color={def?.color} />
      {statuses.label(key)}
    </span>
  );
}

/** Ô chọn trạng thái gọn cho dòng bảng / dòng cây. Giá trị là khoá trạng thái. */
export function CardStatusSelect({
  value,
  taskTitle,
  onChange,
}: {
  value: string | null | undefined;
  taskTitle: string;
  onChange: (statusKey: string) => void;
}) {
  const statuses = useTaskStatuses();
  const current = value ?? 'todo';
  const options = statuses.active.some((s) => s.key === current)
    ? statuses.active
    : // Thẻ đang ở trạng thái đã ẩn: vẫn hiện để ô chọn không nói sai trạng thái.
      [...statuses.active, ...statuses.all.filter((s) => s.key === current)];
  return (
    <select
      value={current}
      aria-label={`Trạng thái: ${taskTitle}`}
      onChange={(e) => onChange(e.target.value)}
      className={`max-w-36 truncate rounded-control border border-transparent px-1.5 py-0.5 text-xs outline-none transition hover:border-tr-border focus:border-tr-primary ${CARD_STATUS_TONE[statuses.kind(current)]} ${focusRing} ${selectOptionContrast}`}
    >
      {options.map((status) => (
        <option key={status.key} value={status.key} disabled={!status.is_active}>
          {status.label}
        </option>
      ))}
    </select>
  );
}
