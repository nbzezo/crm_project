/**
 * Hộp xác nhận xóa cơ hội — liệt kê mọi thứ gắn với cơ hội và cho chọn thứ nào
 * xóa theo. Mục không chọn được giữ lại, chỉ bỏ liên kết với cơ hội.
 *
 * Mỗi mục hiện cả các liên kết KHÁC của nó (hợp đồng, báo giá, công việc, dự án…)
 * để người dùng thấy mục nào đang dùng chung trước khi chọn. Máy chủ
 * (`dealDeleteService.ts`) kiểm lại từng id và quyền, nên giao diện chỉ gợi ý.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Link2 } from 'lucide-react';
import { api } from '../../api/client';
import { Modal } from '../common/Modal';
import { Button, SkeletonRows } from '../common/ui';
import { t } from '../../i18n/vi';
import { formatDate } from '../../lib/format';

type Group =
  | 'documents'
  | 'meeting_notes'
  | 'quotations'
  | 'contracts'
  | 'cards'
  | 'interactions'
  | 'reminders';

type LinkKind = 'contract' | 'quotation' | 'card' | 'meeting_note' | 'project' | 'board' | 'deal';

interface DeleteItem {
  id: number;
  title: string;
  date: string | null;
  status: string | null;
  links: { kind: LinkKind; label: string }[];
  note: string | null;
  blocked: string | null;
}

interface DeletePreview {
  deal: { id: number; title: string; customer_id: number };
  own: { scores: number; committee: number; events: number; competitors: number; handover: number };
  groups: Record<Group, DeleteItem[]>;
}

const GROUPS: { key: Group; label: string; effect: string }[] = [
  { key: 'documents', label: 'Tài liệu', effect: 'Xóa = chuyển vào Thùng rác, khôi phục được' },
  {
    key: 'meeting_notes',
    label: 'Trang tài liệu',
    effect: 'Xóa = chuyển vào Thùng rác, khôi phục được',
  },
  { key: 'quotations', label: 'Báo giá', effect: 'Xóa vĩnh viễn' },
  { key: 'contracts', label: 'Hợp đồng', effect: 'Xóa vĩnh viễn' },
  { key: 'cards', label: 'Công việc', effect: 'Xóa vĩnh viễn, kèm việc con' },
  { key: 'interactions', label: 'Hoạt động', effect: 'Xóa vĩnh viễn' },
  { key: 'reminders', label: 'Nhắc việc', effect: 'Xóa vĩnh viễn' },
];

const LINK_LABEL: Record<LinkKind, string> = {
  contract: 'Hợp đồng',
  quotation: 'Báo giá',
  card: 'Công việc',
  meeting_note: 'Trang tài liệu',
  project: 'Dự án',
  board: 'Bảng',
  deal: 'Cơ hội',
};

function statusLabel(group: Group, status: string | null): string | null {
  if (!status) return null;
  if (status === 'done') return 'Đã xong';
  if (group === 'quotations') return t.quotationStatus[status] ?? status;
  if (group === 'contracts') return t.contractStatus[status] ?? status;
  if (group === 'interactions')
    return (t.interactionType as Record<string, string>)[status] ?? status;
  return status;
}

const EMPTY: Record<Group, number[]> = {
  documents: [],
  meeting_notes: [],
  quotations: [],
  contracts: [],
  cards: [],
  interactions: [],
  reminders: [],
};

export function DealDeleteDialog({
  dealId,
  dealTitle,
  open,
  onClose,
}: {
  dealId: number;
  dealTitle: string;
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Record<Group, number[]>>(EMPTY);

  const preview = useQuery({
    queryKey: ['deal', dealId, 'delete-preview'],
    queryFn: () => api.get<DeletePreview>(`/api/deals/${dealId}/delete-preview`),
    enabled: open,
    // Luôn đọc mới khi mở: danh sách có thể vừa đổi ở tab khác.
    staleTime: 0,
    gcTime: 0,
  });

  const remove = useMutation({
    mutationFn: () => api.del(`/api/deals/${dealId}`, { delete: selected }),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['deal', dealId] });
      navigate('/pipeline');
      // Xóa chạm tới nhiều loại bản ghi (tài liệu, việc, báo giá…) — làm mới tất cả.
      void queryClient.invalidateQueries();
    },
  });

  const close = () => {
    setSelected(EMPTY);
    remove.reset();
    onClose();
  };

  const toggle = (group: Group, id: number, on: boolean) =>
    setSelected((prev) => ({
      ...prev,
      [group]: on ? [...prev[group], id] : prev[group].filter((x) => x !== id),
    }));

  const data = preview.data;
  const total = Object.values(selected).reduce((sum, ids) => sum + ids.length, 0);
  const own = data
    ? [
        [data.own.scores, 'điểm chấm'],
        [data.own.committee, 'người trong nhóm quyết định'],
        [data.own.events, 'mốc sự kiện'],
        [data.own.competitors, 'đối thủ'],
        [data.own.handover, 'mục bàn giao'],
      ].filter(([n]) => Number(n) > 0)
    : [];
  const visibleGroups = data ? GROUPS.filter((g) => data.groups[g.key].length > 0) : [];

  return (
    <Modal
      open={open}
      onClose={close}
      title="Xóa cơ hội"
      width="max-w-2xl"
      footer={
        <>
          <Button onClick={close}>{t.common.cancel}</Button>
          <Button
            variant="danger"
            disabled={!data || remove.isPending}
            onClick={() => remove.mutate()}
          >
            {total > 0 ? `Xóa cơ hội và ${total} mục đã chọn` : 'Xóa cơ hội'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-tr-subtle">
          Xóa <strong className="text-tr-text">{dealTitle}</strong>. Không thể hoàn tác.
        </p>

        {preview.isLoading && <SkeletonRows rows={4} cols={1} />}
        {preview.error && (
          <p role="alert" className="text-tr-danger">
            {preview.error.message}
          </p>
        )}

        {data && (
          <>
            <p className="text-tr-subtle">
              Luôn xóa theo dữ liệu riêng của cơ hội
              {own.length > 0
                ? `: ${own.map(([n, label]) => `${n} ${label}`).join(', ')}`
                : ''}{' '}
              (cùng nhãn và nhật ký thay đổi).
            </p>

            {visibleGroups.length === 0 ? (
              <p className="text-tr-muted">
                Không có tài liệu, công việc hay bản ghi nào khác gắn với cơ hội này.
              </p>
            ) : (
              <p className="text-tr-subtle">
                Đánh dấu những mục muốn <strong className="text-tr-text">xóa cùng</strong>. Mục
                không đánh dấu được giữ lại và chỉ bỏ liên kết với cơ hội. Mục có{' '}
                <span className="text-tr-warning">liên kết khác</span> đang được dùng ở chỗ khác —
                cân nhắc kỹ trước khi xóa.
              </p>
            )}

            {visibleGroups.map((group) => {
              const items = data.groups[group.key];
              const selectable = items.filter((item) => !item.blocked).map((item) => item.id);
              const chosen = selected[group.key];
              const allOn = selectable.length > 0 && selectable.every((id) => chosen.includes(id));
              return (
                <section key={group.key} aria-labelledby={`deal-del-${group.key}`}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <h3 id={`deal-del-${group.key}`} className="font-semibold text-tr-text">
                      {group.label}{' '}
                      <span className="font-normal text-tr-muted">({items.length})</span>
                      <span className="ml-2 text-xs font-normal text-tr-muted">{group.effect}</span>
                    </h3>
                    {selectable.length > 1 && (
                      <button
                        type="button"
                        className="shrink-0 text-xs text-tr-primary hover:underline"
                        onClick={() =>
                          setSelected((prev) => ({ ...prev, [group.key]: allOn ? [] : selectable }))
                        }
                      >
                        {allOn ? 'Bỏ chọn' : 'Chọn tất cả'}
                      </button>
                    )}
                  </div>
                  <ul className="divide-y divide-tr-border rounded-control border border-tr-border">
                    {items.map((item) => {
                      const meta = [
                        statusLabel(group.key, item.status),
                        formatDate(item.date) || null,
                      ]
                        .filter(Boolean)
                        .join(' · ');
                      return (
                        <li key={item.id}>
                          <label
                            className={`flex gap-2.5 px-3 py-2 ${item.blocked ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:bg-tr-hover'}`}
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5 shrink-0"
                              disabled={!!item.blocked}
                              checked={chosen.includes(item.id)}
                              onChange={(e) => toggle(group.key, item.id, e.target.checked)}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-tr-text">{item.title}</span>
                              {meta && <span className="block text-xs text-tr-muted">{meta}</span>}
                              {item.links.length > 0 && (
                                <span className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-tr-warning">
                                  <Link2 size={12} aria-hidden="true" />
                                  Còn gắn với:{' '}
                                  {item.links
                                    .map((l) => `${LINK_LABEL[l.kind]} “${l.label}”`)
                                    .join(', ')}
                                </span>
                              )}
                              {item.note && (
                                <span className="block text-xs text-tr-muted">{item.note}</span>
                              )}
                              {item.blocked && (
                                <span className="block text-xs text-tr-danger">{item.blocked}</span>
                              )}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </>
        )}

        {remove.error && (
          <p role="alert" className="text-tr-danger">
            {remove.error.message}
          </p>
        )}
      </div>
    </Modal>
  );
}
