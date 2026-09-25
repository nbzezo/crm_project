import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useBlocker } from 'react-router';
import { ArrowLeft, CheckCircle2, ListChecks, Sparkles, Trash2 } from 'lucide-react';
import { api } from '../../../api/client';
import { Button, DateTimeInput, focusRing, IconButton } from '../../common/ui';
import { ConfirmDialog } from '../../common/ConfirmDialog';
import { Combobox } from '../../common/Combobox';
import { useCustomerOptions, useDealOptions, useProjectOptions } from '../../../lib/useCrmOptions';
import { useUiStore } from '../../../stores/uiStore';
import type { AiActionProposal } from '../../../ai/types';
import type { MeetingNote, MeetingNoteSummary } from '../../../types';
import { AttendeesField } from './AttendeesField';
import { LazyMeetingNoteBody } from './LazyMeetingNoteBody';
import { DOCUMENT_TEMPLATES, type DocumentPurpose } from './documentTemplates';

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
  autoFocus = false,
  links,
  onBack,
  onDeleted,
}: {
  note: MeetingNote;
  autoFocus?: boolean;
  links: Links;
  onBack: () => void;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const queryKey = useRef(['meeting-notes', links] as const);

  const [title, setTitle] = useState(note.title);
  const [purpose, setPurpose] = useState<DocumentPurpose>(note.purpose_key);
  const [customerId, setCustomerId] = useState<number | null>(note.customer_id);
  const [dealId, setDealId] = useState<number | null>(note.deal_id);
  const [projectId, setProjectId] = useState<number | null>(note.project_id);
  const [linksOpen, setLinksOpen] = useState(false);
  const { data: customers = [] } = useCustomerOptions(linksOpen);
  const { data: deals = [] } = useDealOptions(linksOpen);
  const { data: projects = [] } = useProjectOptions(linksOpen);
  const [meetingAt, setMeetingAt] = useState(note.meeting_at ?? '');
  const [attendeeIds, setAttendeeIds] = useState(note.attendees.map((a) => a.contact_id));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [summary, setSummary] = useState<SummaryState | null>(
    note.ai_summary ? { ...note.ai_summary, proposals: [] } : null
  );
  const bodyRef = useRef({ contentJson: note.content_json, contentText: note.content_text });
  const [bodyVersion, setBodyVersion] = useState(0);
  const skipNextSave = useRef(true);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'pending' | 'saving' | 'error'>('saved');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const handlingNavigation = useRef(false);
  const draft = useRef({
    title: note.title,
    purpose_key: note.purpose_key,
    customer_id: note.customer_id,
    deal_id: note.deal_id,
    project_id: note.project_id,
    meeting_at: note.meeting_at,
    attendee_contact_ids: note.attendees.map((a) => a.contact_id),
    content_json: note.content_json,
    content_text: note.content_text,
  });
  const savedSnapshot = useRef(JSON.stringify(draft.current));
  draft.current = {
    title: title.trim() || 'Trang không tiêu đề',
    purpose_key: purpose,
    customer_id: customerId,
    deal_id: dealId,
    project_id: projectId,
    meeting_at: meetingAt || null,
    attendee_contact_ids: attendeeIds,
    content_json: bodyRef.current.contentJson,
    content_text: bodyRef.current.contentText,
  };

  const flushSave = useCallback(async (): Promise<void> => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (inFlight.current) {
      await inFlight.current;
      return flushSave();
    }
    const snapshot = JSON.stringify(draft.current);
    if (snapshot === savedSnapshot.current) {
      setSaveStatus('saved');
      return;
    }
    setSaveStatus('saving');
    const request = api
      .patch<MeetingNote>(`/api/meeting-notes/${note.id}`, draft.current)
      .then((updated) => {
        savedSnapshot.current = snapshot;
        queryClient.setQueryData<MeetingNote[]>(queryKey.current, (old = []) =>
          old
            .map((item) => (item.id === updated.id ? updated : item))
            .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id - a.id)
        );
        void queryClient.invalidateQueries({
          queryKey: ['meeting-notes'],
          refetchType: 'inactive',
        });
      });
    inFlight.current = request;
    try {
      await request;
    } catch {
      setSaveStatus('error');
      throw new Error('Không lưu được trang tài liệu');
    } finally {
      inFlight.current = null;
    }
    if (JSON.stringify(draft.current) !== savedSnapshot.current) return flushSave();
    setSaveStatus('saved');
  }, [note.id, queryClient]);

  useEffect(() => {
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (purpose === 'blank') {
      const derived = deriveTitle(title, bodyRef.current.contentText);
      if (derived) {
        setTitle(derived);
        return;
      }
    }
    setSaveStatus('pending');
    saveTimer.current = setTimeout(() => {
      void flushSave().catch(() => undefined);
    }, 800);
  }, [
    title,
    purpose,
    customerId,
    dealId,
    projectId,
    meetingAt,
    attendeeIds,
    bodyVersion,
    flushSave,
  ]);

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (JSON.stringify(draft.current) !== savedSnapshot.current) {
        void flushSave().catch(() => undefined);
      }
    },
    [flushSave]
  );

  const blocker = useBlocker(() => JSON.stringify(draft.current) !== savedSnapshot.current);
  useEffect(() => {
    if (blocker.state !== 'blocked' || handlingNavigation.current) return;
    handlingNavigation.current = true;
    void flushSave()
      .then(() => blocker.proceed())
      .catch(() => blocker.reset())
      .finally(() => {
        handlingNavigation.current = false;
      });
  }, [blocker, flushSave]);

  useEffect(() => {
    const warnOnUnload = (event: BeforeUnloadEvent) => {
      if (JSON.stringify(draft.current) === savedSnapshot.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnOnUnload);
    return () => window.removeEventListener('beforeunload', warnOnUnload);
  }, []);

  const remove = useMutation({
    mutationFn: async () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (inFlight.current) await inFlight.current.catch(() => undefined);
      await api.del(`/api/meeting-notes/${note.id}`);
    },
    onSuccess: () => {
      savedSnapshot.current = JSON.stringify(draft.current);
      queryClient.setQueryData<MeetingNote[]>(queryKey.current, (old = []) =>
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

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <IconButton
          label="Quay lại danh sách trang"
          onClick={() => {
            void flushSave()
              .then(onBack)
              .catch(() => undefined);
          }}
        >
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
          placeholder="Tiêu đề trang"
          aria-label="Tiêu đề trang"
          className={`flex-1 rounded-control border border-transparent bg-transparent px-1.5 py-1 text-xl font-bold tracking-tight text-tr-text outline-none transition-colors placeholder:font-normal placeholder:text-tr-muted hover:border-tr-border hover:bg-tr-hover focus:border-tr-primary/50 focus:bg-tr-hover ${focusRing}`}
        />
        {saveStatus === 'error' ? (
          <button
            type="button"
            className="shrink-0 text-xs text-tr-danger underline"
            onClick={() => {
              void flushSave().catch(() => undefined);
            }}
          >
            Lưu thất bại · Thử lại
          </button>
        ) : (
          <span role="status" className="shrink-0 text-xs text-tr-muted">
            {saveStatus === 'saved' ? 'Đã lưu' : saveStatus === 'saving' ? 'Đang lưu…' : 'Chưa lưu'}
          </span>
        )}
        <IconButton label="Xoá trang" tone="danger" onClick={() => setConfirmDelete(true)}>
          <Trash2 size={16} />
        </IconButton>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2 text-tr-subtle">
          Mục đích
          <select
            value={purpose}
            onChange={(event) => setPurpose(event.target.value as DocumentPurpose)}
            className={`rounded-control border border-tr-border bg-tr-panel px-2 py-1 text-tr-text ${focusRing}`}
          >
            {DOCUMENT_TEMPLATES.map((template) => (
              <option key={template.key} value={template.key}>
                {template.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <details className="mb-3" onToggle={(event) => setLinksOpen(event.currentTarget.open)}>
        <summary className="cursor-pointer text-sm text-tr-subtle">
          Liên kết Khách hàng / Cơ hội / Dự án
        </summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <div className="text-xs text-tr-subtle">
            Khách hàng
            <Combobox
              value={customerId ?? ''}
              onChange={(value) => setCustomerId(value || null)}
              options={customers.map((item) => ({ id: item.id, label: item.name }))}
              ariaLabel="Khách hàng của trang"
            />
          </div>
          <div className="text-xs text-tr-subtle">
            Cơ hội
            <Combobox
              value={dealId ?? ''}
              onChange={(value) => setDealId(value || null)}
              options={deals.map((item) => ({ id: item.id, label: item.title }))}
              ariaLabel="Cơ hội của trang"
            />
          </div>
          <div className="text-xs text-tr-subtle">
            Dự án
            <Combobox
              value={projectId ?? ''}
              onChange={(value) => setProjectId(value || null)}
              options={projects.map((item) => ({ id: item.id, label: item.name }))}
              ariaLabel="Dự án của trang"
            />
          </div>
        </div>
      </details>

      {purpose === 'meeting' && (
        <details className="mb-3" open={note.purpose_key === 'meeting'}>
          <summary className="cursor-pointer text-sm text-tr-subtle">Chi tiết cuộc họp</summary>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {/* Boc trong div co chieu rong co dinh — o nhap ben trong luon tu ep
            w-full (xem inputBase o ui.tsx), truyen chieu rong thang vao no se bi
            w-full de (hai class Tailwind cung sua width, thu tu trong CSS bien
            dich quyet dinh chu khong phai thu tu viet trong className). */}
            <div className="w-72">
              <DateTimeInput
                value={meetingAt || null}
                onChange={(value) => setMeetingAt(value ?? '')}
                aria-label="Thời gian họp"
              />
            </div>
            <AttendeesField value={attendeeIds} onChange={setAttendeeIds} />
          </div>
        </details>
      )}

      <LazyMeetingNoteBody
        noteId={note.id}
        autoFocus={autoFocus}
        initialContentJson={note.content_json}
        customerId={customerId}
        dealId={dealId}
        projectId={projectId}
        onChange={(payload) => {
          bodyRef.current = payload;
          draft.current = {
            ...draft.current,
            content_json: payload.contentJson,
            content_text: payload.contentText,
          };
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
        message="Xoá trang tài liệu này? Bạn có thể tạo lại nhưng không khôi phục được nội dung."
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          remove.mutate();
          setConfirmDelete(false);
        }}
      />
    </div>
  );
}

/** Ten he thong tu dat khi tao ghi chu — coi nhu "chua co tieu de". */
const DEFAULT_NOTE_TITLES = [
  'Ghi chú mới',
  'Ghi chú họp mới',
  'Ghi chú không tiêu đề',
  'Trang không tiêu đề',
];

/**
 * Tieu de suy ra tu cau dau cua noi dung, hoac '' neu khong nen doi.
 * Tra ve '' khi nguoi dung da tu dat ten, khi noi dung con rong, hoac khi ten
 * suy ra trung voi ten hien tai (tranh vong lap effect).
 */
export function deriveTitle(current: string, contentText: string): string {
  if (!DEFAULT_NOTE_TITLES.includes(current.trim())) return '';
  const first = contentText.trim().split('\n')[0]?.trim() ?? '';
  if (!first) return '';
  const derived = first.length > 80 ? `${first.slice(0, 80)}…` : first;
  return derived === current.trim() ? '' : derived;
}
