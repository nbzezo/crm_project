/**
 * Sổ hoạt động cố định kiểu "chatter" — hiển thị song song với tab đang xem,
 * thay vì phải bấm sang một tab riêng mới thấy hoạt động gần đây.
 *
 * Danh sách rút gọn đọc thẳng `deal.activities` (đã có sẵn trong DealFull,
 * không fetch thêm gì khi vào trang). Chỉ khi mở ngăn kéo "Ghi nhận đầy đủ/Xem
 * tất cả" mới tải hồ sơ khách hàng đầy đủ — giữ đúng tinh thần lazy-fetch mà
 * tab Hoạt động cũ đã làm, chỉ đổi từ "đang ở tab nào" sang "ngăn kéo có đang
 * mở không".
 *
 * Ô ghi chú nhanh phía trên danh sách gọi thẳng `POST /api/interactions` với
 * `type: 'note'` — cùng bảng, cùng endpoint với form đầy đủ trong ngăn kéo,
 * chỉ bỏ bớt các trường (loại, liên hệ, kết quả…) để gõ một câu là xong, kiểu
 * "Log note" của Odoo. Vẫn bật `ScoringPrompt` sau khi lưu (F-12) vì đây cũng
 * là một tương tác thật gắn với cơ hội, không khác gì ghi qua form đầy đủ.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '../../api/client';
import { Drawer } from '../common/Drawer';
import { Button, Panel, Skeleton, Textarea } from '../common/ui';
import { ICONS, COLORS, InteractionTimeline } from './InteractionTimeline';
import { ScoringPrompt } from './ScoringPrompt';
import { formatDateTime, nowLocalInput } from '../../lib/format';
import { invalidateCrmViews } from '../../lib/queryKeys';
import type { CustomerFull, Interaction } from '../../types';

const RECENT_LIMIT = 8;

export function DealActivitySidebar({
  dealId,
  customerId,
  activities,
}: {
  dealId: number;
  customerId: number;
  activities: Interaction[];
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [justLogged, setJustLogged] = useState<string | null>(null);

  const { data: customer } = useQuery({
    queryKey: ['customer', customerId],
    queryFn: () => api.get<CustomerFull>(`/api/customers/${customerId}/full`),
    enabled: open,
  });

  const addNote = useMutation({
    mutationFn: (summary: string) =>
      api.post('/api/interactions', {
        customer_id: customerId,
        deal_id: dealId,
        type: 'note',
        occurred_at: nowLocalInput(),
        summary,
      }),
    onSuccess: (_result, summary) => {
      setNote('');
      setJustLogged(summary);
      // Sidebar doc `deal.activities` tu query cua trang cha — phai invalidate
      // dung key do thi danh sach moi cap nhat, invalidateCrmViews khong dong.
      queryClient.invalidateQueries({ queryKey: ['deal', dealId, 'full'] });
      invalidateCrmViews(queryClient, customerId);
    },
  });

  const submitNote = () => {
    const trimmed = note.trim();
    if (!trimmed || addNote.isPending) return;
    addNote.mutate(trimmed);
  };

  const recent = activities.slice(0, RECENT_LIMIT);

  return (
    <>
      <Panel
        title="Hoạt động"
        action={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus size={14} aria-hidden="true" /> Ghi nhận đầy đủ
          </Button>
        }
      >
        {justLogged && (
          <ScoringPrompt
            dealId={dealId}
            summary={justLogged}
            onDismiss={() => setJustLogged(null)}
          />
        )}

        <form
          className="mb-3 space-y-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            submitNote();
          }}
        >
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitNote();
              }
            }}
            placeholder="Viết ghi chú hoặc bình luận nhanh… (Enter để gửi, Shift+Enter xuống dòng)"
            aria-label="Ghi chú nhanh"
          />
          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              variant="primary"
              disabled={!note.trim() || addNote.isPending}
            >
              {addNote.isPending ? 'Đang lưu…' : 'Lưu ghi chú'}
            </Button>
          </div>
        </form>

        {recent.length === 0 ? (
          <p className="text-sm text-tr-muted">
            Chưa có hoạt động nào — viết ghi chú ở trên, hoặc dùng "Ghi nhận đầy đủ" cho cuộc gọi,
            email hay cuộc họp.
          </p>
        ) : (
          <ul className="space-y-3">
            {recent.map((item) => {
              const Icon = ICONS[item.type];
              return (
                <li key={item.id} className="flex gap-2">
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${COLORS[item.type]}`}
                  >
                    <Icon size={13} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm text-tr-text">{item.summary}</p>
                    <p className="mt-0.5 text-2xs text-tr-muted">
                      {formatDateTime(item.occurred_at)}
                      {item.contact_name && ` · ${item.contact_name}`}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {activities.length > RECENT_LIMIT && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-3 text-xs font-medium text-tr-primary hover:underline"
          >
            Xem tất cả {activities.length} hoạt động
          </button>
        )}
      </Panel>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Hoạt động của cơ hội"
        width="w-[min(32rem,100vw)]"
      >
        {customer ? (
          <InteractionTimeline
            customerId={customerId}
            interactions={customer.interactions ?? []}
            contacts={customer.contacts}
            deals={customer.deals}
            defaultDealId={dealId}
          />
        ) : (
          <Skeleton className="h-48 rounded-panel" />
        )}
      </Drawer>
    </>
  );
}
