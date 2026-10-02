import { FolderKanban, Lightbulb, Target, X } from 'lucide-react';
import { focusRing } from '../common/ui';

export type CreateKind = 'customer' | 'deal' | 'project';

const STORAGE_PREFIX = 'card-crm-hint-hidden:';

/* Ẩn gợi ý là tiện ích riêng của từng người xem — localStorage có thể bị chặn
   (cửa sổ ẩn danh, chặn dữ liệu trang) nên mọi lần đọc/ghi đều phải chịu lỗi. */
export function readCrmHintHidden(cardId: number): boolean {
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + cardId) === '1';
  } catch {
    return false;
  }
}

export function writeCrmHintHidden(cardId: number): void {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + cardId, '1');
  } catch {
    /* không lưu được thì chỉ ẩn trong lần mở này */
  }
}

/**
 * Nhắc khi việc đã có khách hàng nhưng chưa thuộc cơ hội/dự án nào — kèm nút tạo
 * ngay. Không bắt buộc: nhiều việc chăm sóc khách hàng không thuộc cơ hội nào, nên
 * ẩn được cho từng việc.
 */
export function CrmLinkHint({
  missingDeal,
  missingProject,
  onCreate,
  onHide,
}: {
  missingDeal: boolean;
  missingProject: boolean;
  onCreate: (kind: CreateKind) => void;
  onHide: () => void;
}) {
  const what =
    missingDeal && missingProject ? 'cơ hội hay dự án' : missingDeal ? 'cơ hội' : 'dự án';
  const action = `inline-flex min-h-7 items-center gap-1 rounded px-2 text-xs font-medium text-tr-primary transition hover:bg-tr-hover ${focusRing}`;

  return (
    <div
      role="note"
      className="mb-4 ml-8 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-panel border border-tr-border bg-tr-surface px-3 py-2 text-sm"
    >
      <Lightbulb size={14} className="shrink-0 text-tr-warning" aria-hidden="true" />
      <span className="text-tr-subtle">Việc này chưa thuộc {what} nào.</span>
      {missingDeal && (
        <button type="button" className={action} onClick={() => onCreate('deal')}>
          <Target size={13} aria-hidden="true" /> Tạo cơ hội
        </button>
      )}
      {missingProject && (
        <button type="button" className={action} onClick={() => onCreate('project')}>
          <FolderKanban size={13} aria-hidden="true" /> Tạo dự án
        </button>
      )}
      <button
        type="button"
        onClick={onHide}
        className={`ml-auto flex h-7 w-7 items-center justify-center rounded text-tr-muted transition hover:bg-tr-hover hover:text-tr-text ${focusRing}`}
        aria-label="Ẩn gợi ý này cho công việc này"
        title="Ẩn gợi ý cho công việc này"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
