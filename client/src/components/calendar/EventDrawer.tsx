import { useNavigate } from 'react-router';
import { Check, Info, Pencil, Trash2 } from 'lucide-react';
import { Drawer } from '../common/Drawer';
import { Button } from '../common/ui';
import { OverdueIcon, type CalEvent } from './calendarModel';
import { t } from '../../i18n/vi';
import { formatDate } from '../../lib/format';
import { useUiStore } from '../../stores/uiStore';

/**
 * Chi tiet mot su kien, mo trong ngan keo ben phai (muc 20).
 *
 * Sua han ba "ngo cut" cua ban cu: truoc day bam vao Co hoi / Hop dong /
 * Nhac hen khong gan the thi KHONG CO GI XAY RA — vi ma cu chi goi `openCard`
 * khi co `cardId`. Gio moi su kien deu mo duoc, va nut chinh dua ve dung nguon.
 *
 * Ngan keo khong bao gio dieu huong ngay khi bam su kien — muc 20 doi "khong
 * chuyen sang page khac". Dieu huong chi xay ra khi nguoi dung bam nut trong day.
 */
export function EventDrawer({
  item,
  onClose,
  onEdit,
  onComplete,
  onDelete,
}: {
  item: CalEvent | null;
  onClose: () => void;
  onEdit?: (item: CalEvent) => void;
  onComplete?: (item: CalEvent) => void;
  onDelete?: (item: CalEvent) => void;
}) {
  const navigate = useNavigate();
  const openCard = useUiStore((s) => s.openCard);

  if (!item) return null;

  const openSource = () => {
    if (!item.link) return;
    onClose();
    if (item.link.kind === 'card') openCard(item.link.cardId);
    else navigate(item.link.to);
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={
        <span className="flex items-start gap-2">
          <span
            aria-hidden="true"
            className="mt-1 h-4 w-1 shrink-0 rounded-full"
            style={{ backgroundColor: item.bg }}
          />
          <span className={item.done ? 'text-tr-muted line-through' : ''}>{item.title}</span>
        </span>
      }
      footer={
        item.caps.edit ? (
          /* Lich ca nhan: sua / hoan thanh / xoa ngay tai day. */
          <div className="flex w-full flex-wrap gap-2">
            {item.caps.complete && !item.done && (
              <Button variant="primary" className="flex-1" onClick={() => onComplete?.(item)}>
                <Check size={15} aria-hidden="true" />
                {t.common.done}
              </Button>
            )}
            <Button className="flex-1" onClick={() => onEdit?.(item)}>
              <Pencil size={15} aria-hidden="true" />
              {t.common.edit}
            </Button>
            {item.caps.remove && (
              <Button variant="danger" onClick={() => onDelete?.(item)} aria-label={t.common.delete}>
                <Trash2 size={15} aria-hidden="true" />
              </Button>
            )}
          </div>
        ) : item.link ? (
          <Button variant="primary" onClick={openSource} className="w-full">
            {item.link.label}
          </Button>
        ) : undefined
      }
    >
      <dl className="space-y-3 text-sm">
        <Row label={t.calendar.fieldType}>
          <span className="inline-flex items-center gap-1.5">
            <item.Icon size={14} className="text-tr-muted" aria-hidden="true" />
            {item.typeLabel}
          </span>
        </Row>

        <Row label={t.calendar.fieldTime}>
          {formatDate(item.date)}
          {item.time ? ` · ${item.time}` : ` · ${t.calendar.allDay}`}
        </Row>

        {item.subtitle && (
          <Row label={item.caps.edit ? t.calendar.fieldLocation : t.calendar.fieldRelated}>
            {item.subtitle}
          </Row>
        )}

        {item.row?.description && (
          <Row label={t.calendar.fieldDescription}>
            <p className="whitespace-pre-wrap">{item.row.description}</p>
          </Row>
        )}

        {item.row?.reminder_at && (
          <Row label={t.calendar.fieldReminder}>{item.row.reminder_at.slice(11, 16)}</Row>
        )}

        {(item.overdue || item.done) && (
          <Row label="Trạng thái">
            {item.done ? (
              <span className="tr-badge-done inline-block rounded-control px-2 py-0.5 text-xs font-semibold">
                {t.common.done}
              </span>
            ) : (
              <span className="tr-badge-overdue inline-flex items-center gap-1 rounded-control px-2 py-0.5 text-xs font-semibold">
                <OverdueIcon size={12} aria-hidden="true" />
                {t.common.overdue}
              </span>
            )}
          </Row>
        )}
      </dl>

      {/* Muc 22: noi ro BANG CHU vi sao khong sua duoc, thay vi de nguoi dung
          doan tu viec thieu nut. */}
      {!item.caps.edit && (
        <p className="mt-5 flex items-start gap-2 rounded-panel bg-tr-hover px-3 py-2.5 text-xs text-tr-muted">
          <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          {item.link ? t.calendar.derivedNote : t.calendar.noSource}
        </p>
      )}
    </Drawer>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-24 shrink-0 text-tr-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-tr-text">{children}</dd>
    </div>
  );
}
