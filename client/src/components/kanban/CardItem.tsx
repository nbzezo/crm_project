import { memo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AlignLeft, Building2, CheckSquare, Clock, ListTree, Paperclip, Pencil } from 'lucide-react';
import { PRIORITY_COLORS, t } from '../../i18n/vi';
import { contrastInk, formatDateShort, isOverdue, todayStr } from '../../lib/format';
import { useUiStore } from '../../stores/uiStore';
import type { Card, Label } from '../../types';

interface Props {
  card: Card;
  labels: Label[];
  onClick: () => void;
  dragging?: boolean;
}

/**
 * Boc trong memo: handleDragOver cua BoardView chay lien tuc trong suot thao tac
 * keo, moi lan deu doi cache bang. Khong co memo thi ca tram the deu render lai
 * theo tung khung hinh.
 */
export const CardItem = memo(function CardItem({ card, labels, onClick }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `card-${card.id}`,
    data: { type: 'card', cardId: card.id, listId: card.list_id },
  });

  if (isDragging) {
    // Trello chua cho o trong bang chieu cao the khi dang keo
    return (
      <div
        ref={setNodeRef}
        style={{ transform: CSS.Translate.toString(transform), transition }}
        className="rounded-panel bg-tr-hover-strong"
      >
        <div className="invisible">
          <CardBody card={card} labels={labels} onClick={() => {}} />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      /* touchAction: none — neu khong trinh duyet se cuop cu cham de cuon trang
         va thao tac keo tren dien thoai gan nhu khong bao gio bat duoc. */
      style={{ transform: CSS.Translate.toString(transform), transition, touchAction: 'none' }}
      {...attributes}
      {...listeners}
    >
      <CardBody card={card} labels={labels} onClick={onClick} />
    </div>
  );
});

/** Nhan hien thi dang thanh mau hay dang chu — bam vao nhan de doi (giong Trello). */
function LabelChips({ cardLabels, expanded }: { cardLabels: Label[]; expanded: boolean }) {
  const toggle = useUiStore((s) => s.toggleLabelText);
  if (cardLabels.length === 0) return null;

  return (
    <div className="mb-1.5 flex flex-wrap gap-1">
      {cardLabels.map((label) => (
        <button
          key={label.id}
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
          aria-label={`Nhãn ${label.name} — bấm để đổi cách hiển thị nhãn`}
          title={label.name}
          className={`inline-flex items-center overflow-hidden rounded-control text-xs font-semibold transition ${
            expanded ? 'h-4 max-w-full px-2' : 'h-2 w-10'
          }`}
          style={{ backgroundColor: label.color, color: contrastInk(label.color) }}
        >
          {expanded && <span className="truncate">{label.name}</span>}
        </button>
      ))}
    </div>
  );
}

export function CardBody({ card, labels, onClick, dragging }: Props) {
  const labelsExpanded = useUiStore((s) => s.labelText);
  const cardLabels = labels.filter((l) => card.label_ids?.includes(l.id));
  const overdue = isOverdue(card.due_date, card.is_done);
  const dueSoon = !overdue && !card.is_done && card.due_date === todayStr();

  const dueClass = card.is_done
    ? 'tr-badge-done'
    : overdue
      ? 'tr-badge-overdue'
      : dueSoon
        ? 'tr-badge-soon'
        : 'text-tr-muted hover:bg-tr-hover';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={`${card.title}${card.due_date ? `, hạn ${formatDateShort(card.due_date)}` : ''}, ưu tiên ${t.priority[card.priority]}${card.is_done ? ', đã hoàn thành' : ''}`}
      className={`tr-card-shadow group relative cursor-grab overflow-hidden rounded-panel bg-tr-card text-tr-text transition hover:ring-2 hover:ring-tr-primary focus-visible:ring-2 focus-visible:ring-tr-primary focus-visible:outline-none active:cursor-grabbing ${
        dragging ? 'rotate-3 shadow-lg' : ''
      }`}
    >
      {card.cover_color && <div className="h-8 w-full" style={{ backgroundColor: card.cover_color }} />}

      <div className="px-3 pt-2 pb-1.5">
        <LabelChips cardLabels={cardLabels} expanded={labelsExpanded} />

        <div className={`text-sm leading-5 ${card.is_done ? 'text-tr-muted line-through' : ''}`}>
          {card.title}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-tr-muted">
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: PRIORITY_COLORS[card.priority] }}
            title={`${t.card.priority}: ${t.priority[card.priority]}`}
          />
          {card.due_date && (
            <span className={`inline-flex items-center gap-1 rounded px-1 py-0.5 ${dueClass}`}>
              <Clock size={12} />
              {formatDateShort(card.due_date)}
            </span>
          )}
          {card.description && (
            <span title={t.card.description}>
              <AlignLeft size={13} />
            </span>
          )}
          {(card.subtask_total ?? 0) > 0 && (
            <span
              className={`inline-flex items-center gap-1 rounded px-1 py-0.5 ${
                card.subtask_done === card.subtask_total ? 'tr-badge-done' : ''
              }`}
              title="Việc con"
            >
              <ListTree size={12} />
              {card.subtask_done}/{card.subtask_total}
            </span>
          )}
          {card.checklist_total > 0 && (
            <span
              className={`inline-flex items-center gap-1 rounded px-1 py-0.5 ${
                card.checklist_done === card.checklist_total ? 'tr-badge-done' : ''
              }`}
              title={t.card.checklist}
            >
              <CheckSquare size={12} />
              {card.checklist_done}/{card.checklist_total}
            </span>
          )}
          {(card.attachment_total ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1" title="Tệp đính kèm">
              <Paperclip size={12} />
              {card.attachment_total}
            </span>
          )}
          {card.customer_name && (
            <span className="inline-flex max-w-[9rem] items-center gap-1 truncate">
              <Building2 size={12} />
              {card.customer_name}
            </span>
          )}
        </div>
      </div>

      <span className="absolute top-1.5 right-1.5 hidden rounded bg-tr-card p-1 text-tr-muted shadow group-hover:block">
        <Pencil size={12} />
      </span>
    </div>
  );
}
