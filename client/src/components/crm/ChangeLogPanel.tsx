/**
 * Nhật ký thay đổi của một cơ hội / dự án / hợp đồng (v23, v24).
 *
 * Chỉ đọc. Mục đích duy nhất là trả lời "con số này thành ra thế này từ bao giờ,
 * và vì lý do gì" — nên mỗi dòng phải đọc được mà không cần tra cứu gì thêm:
 * tên trường bằng tiếng Việt, giá trị đã được định dạng đúng kiểu của nó.
 */
import { History } from 'lucide-react';
import { Panel } from '../common/ui';
import { t } from '../../i18n/vi';
import { formatDate, formatDateTime, formatVND } from '../../lib/format';
import type { ChangeLogEntry, Stage } from '../../types';

const FIELD_LABELS: Record<string, string> = {
  stage: 'Giai đoạn',
  value_vnd: 'Giá trị dự kiến',
  won_value_vnd: 'Giá trị chốt',
  expected_close_date: 'Ngày chốt dự kiến',
  customer_id: 'Khách hàng',
  project_id: 'Dự án triển khai',
  handover_ready: 'Hồ sơ bàn giao',
  lost_reason: 'Lý do thua',
  status: 'Trạng thái',
  plan_start: 'Bắt đầu kế hoạch',
  plan_end: 'Kết thúc kế hoạch',
  budget_vnd: 'Ngân sách',
  owner_contact_id: 'Người phụ trách',
  start_date: 'Ngày bắt đầu',
  end_date: 'Ngày kết thúc',
};

/**
 * Giá trị được lưu dưới dạng chuỗi thô nên phải định dạng lại theo TÊN TRƯỜNG.
 *
 * Lưu kèm kiểu vào nhật ký sẽ làm bảng phình ra vì một thứ chỉ dùng lúc hiển thị;
 * suy từ tên trường là đủ, và khi gặp trường lạ thì rơi về chuỗi thô — vẫn đọc
 * được, chỉ là chưa đẹp.
 */
function formatValue(field: string, raw: string | null): string {
  if (raw === null || raw === '') return '—';
  if (field === 'stage') return t.stage[raw as Stage] ?? raw;
  if (field === 'handover_ready') return raw === '1' ? 'Đã đủ' : 'Chưa đủ';
  if (field === 'lost_reason') return t.lostReason[raw] ?? raw;
  if (field.endsWith('_vnd')) return formatVND(Number(raw));
  if (field.endsWith('_date') || field === 'plan_start' || field === 'plan_end') {
    return formatDate(raw);
  }
  return raw;
}

export function ChangeLogPanel({
  entries,
  title = 'Nhật ký thay đổi',
}: {
  entries: ChangeLogEntry[];
  title?: string;
}) {
  return (
    <Panel title={title}>
      {entries.length === 0 ? (
        <p className="text-sm text-tr-muted">
          Chưa có thay đổi nào được ghi nhận. Nhật ký bắt đầu ghi từ khi hệ thống lên phiên bản có
          theo dõi lịch sử.
        </p>
      ) : (
        <ol className="space-y-2.5">
          {entries.map((entry) => (
            <li key={entry.id} className="flex gap-2.5 text-sm">
              <History size={14} aria-hidden="true" className="mt-1 shrink-0 text-tr-muted" />
              <div className="min-w-0 flex-1">
                <p className="text-tr-text">
                  <span className="font-medium">{FIELD_LABELS[entry.field] ?? entry.field}</span>
                  {': '}
                  <span className="text-tr-muted line-through">
                    {formatValue(entry.field, entry.old_value)}
                  </span>
                  {' → '}
                  <span className="font-medium">{formatValue(entry.field, entry.new_value)}</span>
                </p>
                {entry.note && (
                  <p className="mt-0.5 text-xs text-tr-subtle italic">Lý do: {entry.note}</p>
                )}
                <p className="mt-0.5 text-xs text-tr-muted">
                  {formatDateTime(entry.changed_at)}
                  {entry.actor_name ? ` · ${entry.actor_name}` : ''}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
