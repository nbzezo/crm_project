import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Plus, Users } from 'lucide-react';
import { api, qs } from '../../../api/client';
import { Button, EmptyState, Skeleton } from '../../common/ui';
import { formatDateTime } from '../../../lib/format';
import type { MeetingNote } from '../../../types';
import { MeetingNoteEditor } from './MeetingNoteEditor';
import { DocumentTemplatePicker } from './DocumentTemplatePicker';
import {
  createDocumentFromTemplate,
  documentPurposeLabel,
  type DocumentPurpose,
} from './documentTemplates';

/** Co hoi hoac Du an ma danh sach thuoc ve — luon truyen dung mot khoa. */
type Links = Partial<{ deal_id: number; project_id: number }>;

/**
 * Danh sach ghi chu hop + nut tao moi cua MOT Co hoi/Du an (tab "Ghi chú họp").
 * Trang Tai lieu liet ke TAT CA trang bang DocumentPagesLibrary (tim, loc, phan
 * trang) — xem components/documents/DocumentPagesLibrary.tsx.
 */
export function MeetingNotesPanel({
  links,
  customerId,
}: {
  links: Links;
  customerId: number | null;
}) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [newlyCreatedId, setNewlyCreatedId] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const queryKey = ['meeting-notes', links] as const;

  const { data: notes, isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      api.get<MeetingNote[]>(`/api/meeting-notes${qs(links as Record<string, number>)}`),
  });

  const create = useMutation({
    mutationFn: (purpose: DocumentPurpose) =>
      api.post<MeetingNote>('/api/meeting-notes', {
        ...links,
        customer_id: customerId,
        ...createDocumentFromTemplate(purpose),
      }),
    onSuccess: (note) => {
      queryClient.setQueryData<MeetingNote[]>(queryKey, (old = []) => [note, ...old]);
      setPickerOpen(false);
      setNewlyCreatedId(note.id);
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
        autoFocus={selected.id === newlyCreatedId}
        links={links}
        onBack={() => {
          setSelectedId(null);
          setNewlyCreatedId(null);
        }}
        onDeleted={() => setSelectedId(null)}
      />
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-tr-subtle">Trang tài liệu</h3>
        <Button variant="primary" onClick={() => setPickerOpen(true)}>
          <Plus size={15} aria-hidden="true" /> Tạo trang
        </Button>
      </div>

      {!notes || notes.length === 0 ? (
        <EmptyState
          message="Chưa có trang tài liệu nào."
          hint="Chọn một mẫu để tạo trang đầu tiên."
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
                    {note.title || 'Trang không tiêu đề'}
                  </div>
                  {/* Trich noi dung: tieu de thoi khong du de phan biet hai ghi
                      chu cung chu de. */}
                  {note.content_text.trim() && (
                    <div className="truncate text-xs text-tr-subtle">
                      {note.content_text.trim().replace(/\s+/g, ' ').slice(0, 120)}
                    </div>
                  )}
                  <div className="truncate text-xs text-tr-muted">
                    {documentPurposeLabel(note.purpose_key)} · {formatDateTime(note.updated_at)}
                    {note.attendees.length > 0 && (
                      <span className="ml-2 inline-flex items-center gap-1">
                        <Users size={11} aria-hidden="true" /> {note.attendees.length}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      <DocumentTemplatePicker
        open={pickerOpen}
        pending={create.isPending}
        error={
          create.isError
            ? create.error instanceof Error
              ? create.error.message
              : 'Không tạo được trang'
            : null
        }
        onClose={() => {
          if (!create.isPending) {
            setPickerOpen(false);
            create.reset();
          }
        }}
        onSelect={(purpose) => create.mutate(purpose)}
      />
    </div>
  );
}
