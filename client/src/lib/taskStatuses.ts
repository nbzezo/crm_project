import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CARD_STATUSES, type CardStatus, type TaskStatusDef } from '@workflow/contracts';
import { api } from '../api/client';
import { t } from '../i18n/vi';

/**
 * Trạng thái công việc cấu hình được (v67).
 *
 * Một trạng thái cụ thể (`key`, vd "khao_sat") mang một ý nghĩa (`kind`, một trong
 * sáu giá trị cũ). Thẻ trả về `status` = ý nghĩa và `status_key` = trạng thái cụ
 * thể; thẻ cũ có thể thiếu `status_key` — lúc đó trạng thái chính là khoá dựng
 * sẵn trùng `status`.
 */

export const TASK_STATUSES_KEY = ['task-statuses'] as const;

/** Sáu trạng thái dựng sẵn — dùng khi danh sách chưa tải xong, để không hiện khoá thô. */
const FALLBACK: TaskStatusDef[] = CARD_STATUSES.map((kind, index) => ({
  key: kind,
  label: t.cardStatus[kind],
  color: null,
  kind,
  position: (index + 1) * 1024,
  is_active: 1,
  is_builtin: 1,
}));

export interface StatusIndex {
  /** Mọi trạng thái kể cả đã ẩn (thẻ cũ có thể còn mang trạng thái đã ẩn). */
  all: TaskStatusDef[];
  /** Trạng thái đang dùng, theo thứ tự — nguồn cho mọi ô chọn. */
  active: TaskStatusDef[];
  def: (key: string | null | undefined) => TaskStatusDef | undefined;
  label: (key: string | null | undefined) => string;
  kind: (key: string | null | undefined) => CardStatus;
}

export function buildStatusIndex(list: TaskStatusDef[]): StatusIndex {
  const byKey = new Map(list.map((status) => [status.key, status]));
  const def = (key: string | null | undefined) => (key ? byKey.get(key) : undefined);
  return {
    all: list,
    active: list.filter((status) => status.is_active),
    def,
    label: (key) => def(key)?.label ?? (key ? (t.cardStatus[key] ?? key) : ''),
    kind: (key) =>
      def(key)?.kind ??
      ((CARD_STATUSES as readonly string[]).includes(key ?? '') ? (key as CardStatus) : 'todo'),
  };
}

export function useTaskStatuses(): StatusIndex {
  const { data } = useQuery({
    queryKey: TASK_STATUSES_KEY,
    queryFn: () => api.get<TaskStatusDef[]>('/api/task-statuses?all=1'),
    staleTime: 5 * 60_000,
  });
  return useMemo(() => buildStatusIndex(data ?? FALLBACK), [data]);
}

/** Trạng thái hiệu lực của một thẻ/dòng việc. */
export function statusKeyOf(item: {
  status?: CardStatus | null;
  status_key?: string | null;
}): string {
  return item.status_key ?? item.status ?? 'todo';
}

/** Nhãn ý nghĩa của trạng thái — dùng trong Cài đặt. */
export const STATUS_KIND_LABELS: Record<CardStatus, string> = {
  todo: 'Chưa bắt đầu — việc mới vào đây',
  doing: 'Đang thực hiện',
  waiting_customer: 'Chờ bên ngoài — hiện ở Nhắc người khác khi sắp đến hạn',
  blocked: 'Bị chặn — ghi lý do bị chặn',
  review: 'Chờ duyệt — hiện cho người duyệt',
  done: 'Hoàn thành — tính là đã xong',
};
