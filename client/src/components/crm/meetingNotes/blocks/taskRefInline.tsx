import { CalendarDays, CheckSquare, User } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { createReactInlineContentSpec } from '@blocknote/react';
import { api } from '../../../../api/client';
import { formatDateShort } from '../../../../lib/format';
import { useUiStore } from '../../../../stores/uiStore';
import { focusRing } from '../../../common/ui';
import type { Card } from '../../../../types';

/**
 * Noi dung inline "taskRef" — the tham chieu toi mot Card that su (khong phai
 * van ban thuong), chen vao ghi chu ngay sau khi tao cong viec qua muc "/"
 * (xem taskSlashMenuItem.tsx) de nguoi dung thay ngay cong viec da tao o dau
 * trong ghi chu, kem vai net chinh (han, nguoi phu trach) chu khong chi ten.
 * Bam vao mo lai chinh Card do. `content: 'none'` nen la mot khoi nguyen tu,
 * giong mentionInline.tsx.
 */
export const taskRefInlineContentSpec = createReactInlineContentSpec(
  {
    type: 'taskRef',
    propSchema: {
      cardId: { default: 0 },
      title: { default: 'Công việc' },
    },
    content: 'none',
  },
  {
    render: (props) => (
      <TaskRefChip
        cardId={props.inlineContent.props.cardId}
        fallbackTitle={props.inlineContent.props.title}
      />
    ),
  }
);

/** '20/08' | '20/08 → 25/08' | 'Hạn 25/08' | null neu khong co ngay nao. */
function formatDateRange(startDate: string | null, dueDate: string | null): string | null {
  if (startDate && dueDate) return `${formatDateShort(startDate)} → ${formatDateShort(dueDate)}`;
  if (dueDate) return `Hạn ${formatDateShort(dueDate)}`;
  if (startDate) return `Từ ${formatDateShort(startDate)}`;
  return null;
}

function TaskRefChip({ cardId, fallbackTitle }: { cardId: number; fallbackTitle: string }) {
  const openCard = useUiStore((s) => s.openCard);
  // Doc truc tiep tu server thay vi luu san trong ghi chu — the luon phan anh
  // dung han/nguoi phu trach HIEN TAI cua cong viec, ke ca khi da doi sau do.
  const { data: card } = useQuery({
    queryKey: ['card', cardId],
    queryFn: () => api.get<Card>(`/api/cards/${cardId}`),
    staleTime: 30_000,
  });

  const title = card?.title ?? fallbackTitle;
  const dateRange = card ? formatDateRange(card.start_date, card.due_date) : null;
  const assigneeName = card?.assignee_name ?? null;

  return (
    <button
      type="button"
      contentEditable={false}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => openCard(cardId)}
      className={`inline-flex items-stretch overflow-hidden rounded-control bg-tr-warning/15 align-middle text-[0.9em] text-tr-warning hover:bg-tr-warning/25 ${focusRing}`}
    >
      <span className="inline-flex items-center gap-1 px-2 py-1 font-medium">
        <CheckSquare size={12} aria-hidden="true" />
        {title}
      </span>
      {dateRange && (
        <span className="inline-flex items-center gap-1 border-l border-tr-warning/30 px-2 py-1 opacity-80">
          <CalendarDays size={11} aria-hidden="true" />
          {dateRange}
        </span>
      )}
      {assigneeName && (
        <span className="inline-flex items-center gap-1 border-l border-tr-warning/30 px-2 py-1 opacity-80">
          <User size={11} aria-hidden="true" />
          {assigneeName}
        </span>
      )}
    </button>
  );
}
