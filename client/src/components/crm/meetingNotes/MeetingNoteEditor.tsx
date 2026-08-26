import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, ListChecks, Sparkles, Trash2 } from 'lucide-react';
import { api } from '../../../api/client';
import { Button, focusRing, IconButton, Input } from '../../common/ui';
import { ConfirmDialog } from '../../common/ConfirmDialog';
import { useUiStore } from '../../../stores/uiStore';
import type { AiActionProposal } from '../../../ai/types';
import type { MeetingNote, MeetingNoteSummary } from '../../../types';
import { AttendeesField } from './AttendeesField';
import { LazyMeetingNoteBody } from './LazyMeetingNoteBody';

/**
 * `{}` (khong khoa nao) nghia la ghi chu doc lap — dung boi trang "Ghi chu"
 * o muc Phan tich & cong cu (xem NotesPage.tsx), khac voi tab "Ghi chú họp"
 * trong mot Co hoi/Du an cu the (luon truyen dung mot khoa).
 */
type Links = Partial<{ deal_id: number; project_id: number }>;

interface SummaryState extends MeetingNoteSummary {
  proposals: AiActionProposal[];
}

/**
 * Man hinh soan mot ghi chu hop: tieu de, ngay hop, nguoi tham du, than soan
 * thao (BlockNote, nap lazy) va khoi Tom tat AI. Tu luu (autosave) debounce
 * ~800ms sau lan doi cuoi — khong co nut "Luu" rieng, giong Notion.
 */
export function MeetingNoteEditor({
  note,
  links,
  onBack,
  onDeleted,
}: {
  note: MeetingNote;
  links: Links;
  onBack: () => void;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const queryKey = ['meeting-notes', links] as const;

  const [title, setTitle] = useState(note.title);
  const [meetingAt, setMeetingAt] = useState(note.meeting_at ?? '');
  const [attendeeIds, setAttendeeIds] = useState(note.attendees.map((a) => a.contact_id));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [summary, setSummary] = useState<SummaryState | null>(
    note.ai_summary ? { ...note.ai_summary, proposals: [] } : null
  );
  const bodyRef = useRef({ contentJson: note.content_json, contentText: note.content_text });
  const [bodyVersion, setBodyVersion] = useState(0);
  const skipNextSave = useRef(true);

  const save = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      api.patch<MeetingNote>(`/api/meeting-notes/${note.id}`, patch),
    onSuccess: (updated) => {
      queryClient.setQueryData<MeetingNote[]>(queryKey, (old = []) =>
        old.map((n) => (n.id === updated.id ? updated : n))
      );
    },
  });

  useEffect(() => {
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    const id = setTimeout(() => {
      save.mutate({
        title: title.trim() || 'Ghi chú không tiêu đề',
        meeting_at: meetingAt || null,
        attendee_contact_ids: attendeeIds,
        content_json: bodyRef.current.contentJson,
        content_text: bodyRef.current.contentText,
      });
    }, 800);
    return () => clearTimeout(id);
  }, [title, meetingAt, attendeeIds, bodyVersion]);

  const remove = useMutation({
    mutationFn: () => api.del(`/api/meeting-notes/${note.id}`),
    onSuccess: () => {
      queryClient.setQueryData<MeetingNote[]>(queryKey, (old = []) =>
        old.filter((n) => n.id !== note.id)
      );
      onDeleted();
    },
  });

  const summarize = useMutation({
    mutationFn: () =>
      api.post<{
        summary: string;
        action_items: MeetingNoteSummary['action_items'];
        proposals: AiActionProposal[];
      }>(`/api/ai/assist/meeting-note/${note.id}/summarize`),
    onSuccess: (data) =>
      setSummary({
        summary: data.summary,
        action_items: data.action_items,
        proposals: data.proposals,
      }),
    onError: (error) =>
      pushToast(error instanceof Error ? error.message : 'Không tóm tắt được ghi chú'),
  });

  const approve = useMutation({
    mutationFn: (proposalId: number) => api.post(`/api/ai/actions/${proposalId}/approve`),
    onSuccess: (_res, proposalId) => {
      setSummary((s) =>
        s
          ? {
              ...s,
              proposals: s.proposals.map((p) =>
                p.id === proposalId ? { ...p, status: 'executed' } : p
              ),
            }
          : s
      );
      pushToast('Đã tạo công việc', 'success');
    },
    onError: (error) =>
      pushToast(error instanceof Error ? error.message : 'Không tạo được công việc'),
  });

  const saveStatus = save.isPending ? 'Đang lưu…' : save.isSuccess ? 'Đã lưu' : '';

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <IconButton label="Quay lại danh sách ghi chú" onClick={onBack}>
          <ArrowLeft size={16} />
        </IconButton>
        {/* Input thuong (khong dung component Input dung chung) — can toan
            quyen kiem soat vien/nen de lam ro day la o co the sua, thay vi bi
            cac class mac dinh cua inputBase (border, focus:ring...) ganh dua
            thu tu bien dich voi class ghi de o day (cung mot loi da gap voi
            o ngay hop truoc — hai class Tailwind cung sua mot thuoc tinh thi
            khong chac class nao thang). */}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Tiêu đề ghi chú"
          aria-label="Tiêu đề ghi chú"
          className={`flex-1 rounded-control border border-transparent bg-transparent px-1.5 py-1 text-xl font-bold tracking-tight text-tr-text outline-none transition-colors placeholder:font-normal placeholder:text-tr-muted hover:border-tr-border hover:bg-tr-hover focus:border-tr-primary/50 focus:bg-tr-hover ${focusRing}`}
        />
        <span className="shrink-0 text-xs text-tr-muted">{saveStatus}</span>
        <IconButton label="Xoá ghi chú" tone="danger" onClick={() => setConfirmDelete(true)}>
          <Trash2 size={16} />
        </IconButton>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        {/* Boc trong div co chieu rong co dinh — Input luon tu ep w-full (xem
            inputBase o ui.tsx), truyen w-56 thang vao Input se bi w-full de
            (hai class Tailwind cung sua width, thu tu trong CSS bien dich
            quyet dinh chu khong phai thu tu viet trong className). */}
        <div className="w-56">
          <Input
            type="datetime-local"
            value={meetingAt}
            onChange={(e) => setMeetingAt(e.target.value)}
            aria-label="Thời gian họp"
          />
        </div>
        <AttendeesField value={attendeeIds} onChange={setAttendeeIds} />
      </div>

      <LazyMeetingNoteBody
        noteId={note.id}
        initialContentJson={note.content_json}
        customerId={note.customer_id}
        dealId={note.deal_id}
        projectId={note.project_id}
        onChange={(payload) => {
          bodyRef.current = payload;
          setBodyVersion((v) => v + 1);
        }}
      />

      {summary ? (
        <div className="mt-4 rounded-panel border border-tr-primary/20 bg-tr-panel p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-tr-text">
              <Sparkles size={15} className="text-tr-primary" aria-hidden="true" /> Tóm tắt bằng AI
            </div>
            <Button
              variant="primary"
              size="sm"
              disabled={summarize.isPending}
              onClick={() => summarize.mutate()}
            >
              {summarize.isPending ? 'Đang phân tích…' : 'Tóm tắt lại'}
            </Button>
          </div>

          <div className="mt-3 space-y-3">
            <p className="text-sm text-tr-subtle">{summary.summary}</p>
            {summary.action_items.length > 0 && (
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-tr-muted uppercase">
                  <ListChecks size={13} aria-hidden="true" /> Việc cần làm
                </div>
                <ul className="space-y-1.5">
                  {summary.action_items.map((item, index) => {
                    const proposal = summary.proposals[index];
                    const done = proposal?.status === 'executed';
                    return (
                      <li
                        key={`${item.title}-${index}`}
                        className="flex items-center justify-between gap-2 rounded-control bg-tr-hover px-2.5 py-1.5 text-sm"
                      >
                        <span className={done ? 'text-tr-muted line-through' : 'text-tr-text'}>
                          {item.title}
                        </span>
                        {proposal &&
                          (done ? (
                            <span className="flex items-center gap-1 text-xs text-tr-success">
                              <CheckCircle2 size={13} /> Đã tạo
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              disabled={approve.isPending}
                              onClick={() => approve.mutate(proposal.id)}
                            >
                              Tạo công việc
                            </Button>
                          ))}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>
      ) : (
        // Chua co tom tat thi chi can 1 nut, khong can ca mot khung rieng —
        // tranh chiem them cho trong khi vung note con trong.
        <Button
          size="sm"
          className="mt-4 gap-1.5"
          disabled={summarize.isPending}
          onClick={() => summarize.mutate()}
        >
          <Sparkles size={14} className="text-tr-primary" aria-hidden="true" />
          {summarize.isPending ? 'Đang phân tích…' : 'Tóm tắt bằng AI'}
        </Button>
      )}

      <ConfirmDialog
        open={confirmDelete}
        message="Xoá ghi chú họp này? Bạn có thể tạo lại nhưng không khôi phục được nội dung."
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          remove.mutate();
          setConfirmDelete(false);
        }}
      />
    </div>
  );
}
