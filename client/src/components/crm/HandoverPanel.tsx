/**
 * Checklist bàn giao Sales → Delivery của một cơ hội (v24).
 *
 * Cờ "hồ sơ đã đủ" trên cơ hội do máy chủ tính lại từ các mục bắt buộc sau mỗi
 * thao tác, nên ở đây không có state cục bộ nào giữ nó — mọi phản hồi đều trả về
 * giá trị mới và giao diện chỉ việc hiển thị. Giữ một bản sao ở client là cách
 * chắc chắn nhất để hai bên lệch nhau.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, CircleDashed, Plus, Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import { Button, Input, Panel, Skeleton, focusRing } from '../common/ui';
import { formatDateTime } from '../../lib/format';
import type { HandoverItem, HandoverState } from '../../types';

export function HandoverPanel({ dealId }: { dealId: number }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['deal', dealId, 'handover'],
    queryFn: () => api.get<HandoverState>(`/api/deals/${dealId}/handover`),
  });

  /* Mọi thao tác đều làm cờ bàn giao đổi được, mà cờ đó hiện trên thẻ Pipeline
     và trang chi tiết — nên làm mới cả hai chứ không chỉ riêng checklist. */
  const refresh = (next: HandoverState) => {
    queryClient.setQueryData(['deal', dealId, 'handover'], next);
    queryClient.invalidateQueries({ queryKey: ['deal', dealId, 'full'] });
    queryClient.invalidateQueries({ queryKey: ['deals'] });
  };

  const applyTemplate = useMutation({
    mutationFn: () => api.post<HandoverState>(`/api/deals/${dealId}/handover/template`, {}),
    onSuccess: refresh,
  });

  const addItem = useMutation({
    mutationFn: (content: string) =>
      api.post<HandoverState>(`/api/deals/${dealId}/handover`, { content }),
    onSuccess: (next) => {
      setDraft('');
      refresh(next);
    },
  });

  const toggle = useMutation({
    mutationFn: (item: HandoverItem) =>
      api.patch<HandoverState>(`/api/deals/${dealId}/handover/${item.id}`, {
        is_done: !item.is_done,
      }),
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: (item: HandoverItem) =>
      api.del<HandoverState>(`/api/deals/${dealId}/handover/${item.id}`),
    onSuccess: refresh,
  });

  if (isLoading || !data) return <Skeleton className="h-48 rounded-panel" />;

  const requiredLeft = data.items.filter((i) => i.is_required && !i.is_done).length;
  const doneCount = data.items.filter((i) => i.is_done).length;

  return (
    <Panel title="Checklist bàn giao">
      {data.items.length === 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-tr-muted">
            Cơ hội này chưa có checklist bàn giao. Đổ bộ mẫu chuẩn để biết còn thiếu hồ sơ nào trước
            khi chuyển sang đội triển khai.
          </p>
          <Button
            variant="primary"
            disabled={applyTemplate.isPending}
            onClick={() => applyTemplate.mutate()}
          >
            <Plus size={15} aria-hidden="true" />
            {applyTemplate.isPending ? 'Đang tạo…' : 'Dùng mẫu chuẩn'}
          </Button>
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                data.handover_ready
                  ? 'bg-tr-success/15 text-tr-success'
                  : 'bg-tr-warning/15 text-tr-warning'
              }`}
            >
              {data.handover_ready ? 'Hồ sơ đã đủ' : `Còn ${requiredLeft} mục bắt buộc`}
            </span>
            <span className="text-xs text-tr-muted">
              {doneCount}/{data.items.length} mục · SLA {data.sla_days} ngày kể từ khi thắng
            </span>
          </div>

          <ul className="space-y-1">
            {data.items.map((item) => (
              <li key={item.id} className="group flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => toggle.mutate(item)}
                  aria-pressed={item.is_done === 1}
                  aria-label={`${item.is_done ? 'Bỏ đánh dấu' : 'Đánh dấu đã xong'}: ${item.content}`}
                  className={`mt-0.5 shrink-0 rounded-full ${focusRing} ${
                    item.is_done ? 'text-tr-success' : 'text-tr-muted hover:text-tr-primary'
                  }`}
                >
                  {item.is_done ? <CircleCheck size={17} /> : <CircleDashed size={17} />}
                </button>

                <div className="min-w-0 flex-1 py-0.5">
                  <span
                    className={`text-sm ${item.is_done ? 'text-tr-muted line-through' : 'text-tr-text'}`}
                  >
                    {item.content}
                  </span>
                  {!item.is_required && (
                    <span className="ml-1.5 text-xs text-tr-muted">(tham khảo)</span>
                  )}
                  {item.is_done && item.done_at && (
                    <span className="ml-1.5 text-xs text-tr-muted">
                      {formatDateTime(item.done_at)}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => remove.mutate(item)}
                  aria-label={`Xóa mục: ${item.content}`}
                  className={`mt-0.5 shrink-0 rounded p-0.5 text-tr-muted opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 hover:text-tr-danger ${focusRing}`}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>

          <form
            className="mt-3 flex gap-2 border-t border-tr-border pt-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (draft.trim()) addItem.mutate(draft.trim());
            }}
          >
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Thêm mục bàn giao riêng của cơ hội này…"
              aria-label="Nội dung mục bàn giao mới"
            />
            <Button type="submit" disabled={!draft.trim() || addItem.isPending}>
              <Plus size={15} aria-hidden="true" /> Thêm
            </Button>
          </form>
        </>
      )}
    </Panel>
  );
}
