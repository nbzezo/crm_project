import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, FolderKanban, Plus, Target, Users } from 'lucide-react';
import { Link } from 'react-router';
import { api, qs } from '../../../api/client';
import { Button, EmptyState, Skeleton } from '../../common/ui';
import { formatDateTime } from '../../../lib/format';
import type { MeetingNote } from '../../../types';
import { MeetingNoteEditor } from './MeetingNoteEditor';

/**
 * `{}` (khong khoa nao) nghia la liet ke TAT CA ghi chu — dung boi trang "Ghi
 * chu" o muc Phan tich & cong cu (xem NotesPage.tsx), khac voi tab "Ghi chú
 * họp" trong mot Co hoi/Du an cu the (luon truyen dung mot khoa).
 */
type Links = Partial<{ deal_id: number; project_id: number }>;

/** Cơ hội/Dự án mà ghi chú thuộc về — chỉ hiện khi liệt kê TẤT CẢ ghi chú. */
function NoteContextBadge({ note }: { note: MeetingNote }) {
  if (note.deal_id && note.deal_title) {
    return (
      <Link
        to={`/deals/${note.deal_id}`}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 text-tr-primary hover:underline"
      >
        <Target size={11} aria-hidden="true" /> {note.deal_title}
      </Link>
    );
  }
  if (note.project_id && note.project_name) {
    return (
      <Link
        to={`/projects/${note.project_id}`}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 text-tr-primary hover:underline"
      >
        <FolderKanban size={11} aria-hidden="true" /> {note.project_name}
      </Link>
    );
  }
  if (note.customer_name) return <span>{note.customer_name}</span>;
  return <span className="italic">Ghi chú riêng</span>;
}

/**
 * Danh sach ghi chu hop + nut tao moi.
 *
 * Dung o hai noi: tab "Ghi chú họp" cua trang Co hoi/Du an (truyen `links` cu
 * the, giong cach DocumentPanel nhan `links`) VA trang "Ghi chu" o muc Phan
 * tich & cong cu — liet ke TAT CA ghi chu (truyen `links={{}}`, `showContext`).
 */
export function MeetingNotesPanel({
  links,
  customerId,
  showContext = false,
  initialSelectedId = null,
}: {
  links: Links;
  customerId: number | null;
  /** Hien Co hoi/Du an cua tung ghi chu — chi can khi liet ke TAT CA ghi chu. */
  showContext?: boolean;
  /** Mo san mot ghi chu cu the (vd. vua tao tu nut hanh dong noi) — xem QuickCreateFab.tsx. */
  initialSelectedId?: number | null;
}) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(initialSelectedId);
  const queryKey = ['meeting-notes', links] as const;

  const { data: notes, isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      api.get<MeetingNote[]>(`/api/meeting-notes${qs(links as Record<string, number>)}`),
  });

  const create = useMutation({
    mutationFn: () =>
      api.post<MeetingNote>('/api/meeting-notes', {
        ...links,
        customer_id: customerId,
        title: 'Ghi chú họp mới',
      }),
    onSuccess: (note) => {
      queryClient.setQueryData<MeetingNote[]>(queryKey, (old = []) => [note, ...old]);
      setSelectedId(note.id);
    },
  });

  if (isLoading) return <Skeleton className="h-40 rounded-panel" />;

  const selected = (notes ?? []).find((n) => n.id === selectedId);
  if (selected) {
    return (
      <MeetingNoteEditor
        key={selected.id}
        note={selected}
        links={links}
        onBack={() => setSelectedId(null)}
        onDeleted={() => setSelectedId(null)}
      />
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-tr-subtle">Ghi chú họp</h3>
        <Button variant="primary" onClick={() => create.mutate()} disabled={create.isPending}>
          <Plus size={15} aria-hidden="true" /> {create.isPending ? 'Đang tạo…' : 'Ghi chú mới'}
        </Button>
      </div>

      {!notes || notes.length === 0 ? (
        <EmptyState
          message="Chưa có ghi chú họp nào."
          hint="Tạo ghi chú đầu tiên để bắt đầu ghi lại nội dung cuộc họp."
        />
      ) : (
        <ul className="divide-y divide-tr-border overflow-hidden rounded-lg border border-tr-border bg-tr-panel">
          {notes.map((note) => (
            <li key={note.id}>
              <button
                type="button"
                onClick={() => setSelectedId(note.id)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition hover:bg-tr-hover"
              >
                <FileText size={16} className="shrink-0 text-tr-muted" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-tr-text">
                    {note.title || 'Ghi chú không tiêu đề'}
                  </div>
                  <div className="truncate text-xs text-tr-muted">
                    {note.meeting_at
                      ? formatDateTime(note.meeting_at)
                      : formatDateTime(note.updated_at)}
                    {note.attendees.length > 0 && (
                      <span className="ml-2 inline-flex items-center gap-1">
                        <Users size={11} aria-hidden="true" /> {note.attendees.length}
                      </span>
                    )}
                    {showContext && (
                      <span className="ml-2">
                        <NoteContextBadge note={note} />
                      </span>
                    )}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
