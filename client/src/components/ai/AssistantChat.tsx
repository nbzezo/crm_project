import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUp,
  Bot,
  Check,
  ListPlus,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../../api/client';
import {
  TASK_LINK_KEYS,
  type AiAskResult,
  type AiChatDetail,
  type AiChatMessage,
  type AiChatSession,
  type AiMode,
  type TaskAssistResult,
} from '../../ai/types';
import { Button, FormError, IconButton, Select, focusRing } from '../common/ui';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { AnswerText } from './AnswerText';
import { ProposalCard } from './ProposalCard';
import { t } from '../../i18n/vi';
import { formatDate, formatDateTime } from '../../lib/format';
import { useAuthStore } from '../../stores/authStore';
import { useUiStore, type TaskContext } from '../../stores/uiStore';

/*
 * Tro ly AI dang MOT CUOC TRO CHUYEN.
 *
 * Truoc day man hinh nay la mot bieu mau: mot o nhap co dinh, mot nut "Gửi câu
 * hỏi", va lich su nam trong mot khung cuon cao 34rem ben tren. No hoat dong,
 * nhung no khong cu xu nhu mot cuoc tro chuyen — cau hoi vua go BIEN MAT cho
 * toi khi cau tra loi ve, nen trong luc cho thi man hinh khong co dau hieu nao
 * cho thay he thong da nhan duoc gi.
 *
 * Ba thay doi lam nen cam giac "dang chat":
 *   1. Cau hoi hien NGAY khi gui, kem mot chi bao dang tra loi ben duoi.
 *   2. Enter de gui, Shift+Enter de xuong dong — dung thoi quen cua moi khung
 *      chat. (Ctrl+Enter van giu duoc, khong pha thoi quen cu cua ai.)
 *   3. Doan hoi thoai chiem het chieu cao va tu cuon xuong day, o nhap ghim o
 *      duoi — thay vi mot khung cuon nho long trong trang.
 *
 * PHAM VI DU LIEU: may chu chi dua vao ngu canh nhung dong nguoi dang hoi
 * duoc phep doc (server/src/services/ai/contextBuilder.ts). Giao dien khong
 * quyet dinh gi ve dieu do — no chi noi ro dieu do ra bang dong chu duoi o
 * nhap, de khong ai tuong tro ly dang nhin thay toan cong ty.
 */

/** Giu dong bo voi MAX_SESSIONS o server/src/services/ai/chatSessions.ts. */
const MAX_CHAT_SESSIONS = 20;

/** Hai y dinh dung chung mot o nhap. */
type Intent = 'ask' | 'task';

type Scope = 'crm' | 'documents' | 'all';

const SCOPES: { value: Scope; label: string }[] = [
  { value: 'all', label: 'CRM + tài liệu' },
  { value: 'crm', label: 'Chỉ CRM' },
  { value: 'documents', label: 'Chỉ tài liệu' },
];

const SUGGESTIONS = [
  'Cơ hội nào cần tôi xử lý trước hôm nay?',
  'Khách hàng nào có hợp đồng sắp hết hạn?',
  'Deal nào trên 500 triệu chưa có tương tác gần đây?',
  'Tóm tắt rủi ro từ các tài liệu liên quan đến báo giá.',
];

/**
 * Ghep danh sach tin nhan phang thanh cac luot hoi-dap de ve.
 *
 * May chu luu tung tin nhan mot (role user / assistant) vi do la don vi that
 * cua mot hoi thoai; giao dien lai ve theo CAP. Ghep o day de phan render
 * khong phai biet gi ve cach luu tru.
 */
function turnsOf(messages: AiChatMessage[]): { question: string; result: AiAskResult }[] {
  const turns: { question: string; result: AiAskResult }[] = [];
  for (let i = 0; i < messages.length; i++) {
    const current = messages[i];
    if (current.role !== 'user') continue;
    const reply = messages[i + 1];
    if (!reply || reply.role !== 'assistant') continue;
    turns.push({
      question: current.content,
      result: {
        answer: reply.content,
        sources: reply.meta?.sources ?? [],
        follow_up_questions: reply.meta?.follow_up_questions ?? [],
        proposal: reply.meta?.proposal ?? null,
        meta: reply.meta?.meta ?? { requestId: String(reply.id), provider: '', model: '' },
      } as AiAskResult,
    });
  }
  return turns;
}

export function AssistantChat() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);
  const openTaskComposer = useUiStore((state) => state.openTaskComposer);
  const me = useAuthStore((state) => state.user);

  const [intent, setIntent] = useState<Intent>('ask');
  const [draft, setDraft] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const [mode, setMode] = useState<AiMode>('balanced');
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AiChatSession | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  /** Cau hoi vua gui, hien ngay truoc khi may chu tra loi. */
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);

  const streamRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const chats = useQuery({
    queryKey: ['ai', 'chats'],
    queryFn: () => api.get<AiChatSession[]>('/api/ai/chats'),
  });

  const activeChat = useQuery({
    queryKey: ['ai', 'chat', sessionId],
    queryFn: () => api.get<AiChatDetail>(`/api/ai/chats/${sessionId}`),
    enabled: sessionId !== null,
  });

  /* Hoi thoai doc TU MAY CHU chu khong giu ban sao trong RAM: tai lai trang,
     doi phien hay mo tren may khac deu thay cung mot thu. */
  const conversation = useMemo(() => turnsOf(activeChat.data?.messages ?? []), [activeChat.data]);

  const refreshChats = () => {
    void queryClient.invalidateQueries({ queryKey: ['ai', 'chats'] });
    void queryClient.invalidateQueries({ queryKey: ['ai', 'chat'] });
  };

  const removeChat = useMutation({
    mutationFn: (id: number) => api.del(`/api/ai/chats/${id}`),
    onSuccess: (_data, id) => {
      if (id === sessionId) setSessionId(null);
      refreshChats();
    },
  });

  const ask = useMutation({
    mutationFn: async (question: string) => {
      /* Hoi khi chua co phien thi tu mo mot phien moi — nguoi dung khong phai
         bam "Cuộc trò chuyện mới" truoc roi moi go duoc. */
      let target = sessionId;
      if (target === null) {
        const created = await api.post<AiChatSession>('/api/ai/chats', { scope });
        target = created.id;
        setSessionId(target);
      }
      return api.post<AiAskResult>('/api/ai/ask', {
        question,
        scope,
        mode,
        session_id: target,
        history: conversation
          .flatMap((turn) => [
            { role: 'user', content: turn.question },
            { role: 'assistant', content: turn.result.answer },
          ])
          .slice(-10),
      });
    },
    onSettled: () => {
      setPendingQuestion(null);
      refreshChats();
    },
  });

  const quickTask = useMutation({
    mutationFn: (text: string) =>
      api.post<TaskAssistResult>('/api/ai/assist/task', { draft: text, mode }),
  });

  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: number; decision: 'approve' | 'reject' }) =>
      api.post(`/api/ai/actions/${id}/${decision}`),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['ai-actions'] });
      pushToast(
        variables.decision === 'approve' ? 'Đã thực thi hành động AI' : 'Đã từ chối đề xuất',
        'success'
      );
      /* Trang thai de xuat nam trong `meta_json` cua tin nhan da luu, nen doc
         lai tu may chu thay vi vá tay ban sao trong RAM. */
      void queryClient.invalidateQueries({ queryKey: ['ai', 'chat'] });
    },
  });

  const busy = ask.isPending || quickTask.isPending;

  const submit = () => {
    const value = draft.trim();
    if (value.length < 3 || busy) return;
    if (intent === 'ask') {
      setPendingQuestion(value);
      ask.mutate(value);
    } else {
      quickTask.mutate(value);
    }
    setDraft('');
  };

  const startNewChat = () => {
    setSessionId(null);
    setPendingQuestion(null);
    setDraft('');
    quickTask.reset();
    ask.reset();
    setRailOpen(false);
    inputRef.current?.focus();
  };

  /* Cuon xuong day moi khi co them mot luot — giong moi khung chat khac. Dung
     layout effect de khong thay mot khung hinh o vi tri cu roi moi nhay. */
  useLayoutEffect(() => {
    const node = streamRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [conversation.length, pendingQuestion, quickTask.data]);

  /* O nhap tu cao len theo noi dung, toi da chung tam dong — khung chat nao
     cung lam vay, va no tranh viec go mot doan dai trong mot khe hai dong. */
  useEffect(() => {
    const node = inputRef.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, 200)}px`;
  }, [draft]);

  /* Ten day du, khong cat lay chu cuoi. Cat chu cuoi dung voi ten nguoi Viet
     ("Dương Anh Tuấn" -> "Tuấn") nhung hong voi ten hien thi khong phai ten
     nguoi: tai khoan quan tri thanh "Chào thống". */
  const greeting = me?.full_name?.trim() ?? '';
  const empty = conversation.length === 0 && pendingQuestion === null && !quickTask.data;

  return (
    <div className="flex h-full min-h-0">
      {/* ---------- Cot lich su ---------- */}
      <ChatRail
        open={railOpen}
        onClose={() => setRailOpen(false)}
        sessions={chats.data ?? []}
        loading={chats.isLoading}
        activeId={sessionId}
        onPick={(id) => {
          setSessionId(id);
          setPendingQuestion(null);
          setRailOpen(false);
        }}
        onNew={startNewChat}
        onDelete={setPendingDelete}
      />

      {/* ---------- Cot hoi thoai ---------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-tr-border px-3 py-2 lg:px-4">
          <button
            type="button"
            onClick={() => setRailOpen((v) => !v)}
            aria-label={railOpen ? 'Đóng danh sách trò chuyện' : 'Mở danh sách trò chuyện'}
            aria-expanded={railOpen}
            className={`flex h-9 w-9 items-center justify-center rounded-control text-tr-subtle transition hover:bg-tr-hover hover:text-tr-text lg:hidden ${focusRing}`}
          >
            {railOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
          </button>
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-tr-text">
            {activeChat.data?.title || 'Cuộc trò chuyện mới'}
          </h2>
          <Button size="sm" onClick={startNewChat}>
            <MessageSquarePlus size={15} aria-hidden="true" /> Mới
          </Button>
        </div>

        <div ref={streamRef} className="tr-scroll min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-6">
            {empty ? (
              <EmptyChat
                greeting={greeting}
                onPick={(text) => {
                  setIntent('ask');
                  setDraft(text);
                  inputRef.current?.focus();
                }}
              />
            ) : (
              <div className="space-y-6">
                {conversation.map((turn, index) => (
                  <Turn
                    key={`${index}-${turn.result.meta.requestId}`}
                    question={turn.question}
                    result={turn.result}
                    pendingDecision={decide.isPending}
                    onDecide={(decision) =>
                      decide.mutate({ id: turn.result.proposal!.id, decision })
                    }
                    onFollowUp={(text) => {
                      setIntent('ask');
                      setDraft(text);
                      inputRef.current?.focus();
                    }}
                  />
                ))}

                {pendingQuestion !== null && (
                  <div className="space-y-3">
                    <Bubble text={pendingQuestion} />
                    <Thinking />
                  </div>
                )}

                {quickTask.data && (
                  <TaskDraftCard
                    result={quickTask.data}
                    onDismiss={() => quickTask.reset()}
                    onReview={() => {
                      const result = quickTask.data!;
                      const links = Object.fromEntries(
                        TASK_LINK_KEYS.flatMap((key) =>
                          result.links[key] == null ? [] : [[key, result.links[key]]]
                        )
                      ) as TaskContext;
                      openTaskComposer({
                        context: {},
                        projectId: result.project_id,
                        assigneeContactId: result.assignee_contact_id,
                        draft: {
                          title: result.title,
                          description: result.description,
                          priority: result.priority ?? undefined,
                          startDate: result.start_date,
                          dueDate: result.due_date,
                          checklist: result.checklist,
                          links,
                          aiRequestId: result.meta.requestId,
                          aiWarnings: result.warnings,
                        },
                      });
                    }}
                  />
                )}
              </div>
            )}
          </div>
        </div>

        {/* ---------- O nhap ---------- */}
        <div className="shrink-0 border-t border-tr-border bg-tr-panel/80 px-3 py-3 sm:px-6">
          <div className="mx-auto w-full max-w-3xl">
            <FormError error={intent === 'ask' ? (ask.error ?? decide.error) : quickTask.error} />

            <div className="rounded-panel border border-tr-border bg-tr-list focus-within:border-tr-primary">
              <label htmlFor="ai-composer" className="sr-only">
                {intent === 'ask' ? 'Câu hỏi cho trợ lý' : 'Nội dung việc cần tạo'}
              </label>
              <textarea
                id="ai-composer"
                ref={inputRef}
                rows={1}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' || event.shiftKey) return;
                  /* Dang go tieng Viet bang bo go: Enter luc nay la de CHON tu
                     trong bang goi y, khong phai de gui. Gui o day se cat mat
                     chu dang go — loi chi xuat hien voi nguoi go tieng Viet nen
                     rat de lot qua khi thu nghiem. */
                  if (event.nativeEvent.isComposing) return;
                  event.preventDefault();
                  submit();
                }}
                placeholder={
                  intent === 'ask'
                    ? 'Hỏi về khách hàng, cơ hội, hợp đồng, việc của bạn…'
                    : 'Mô tả việc cần làm, AI sẽ viết lại thành task…'
                }
                className={`tr-scroll block max-h-[200px] w-full resize-none bg-transparent px-3 py-2.5 text-sm text-tr-text outline-none placeholder:text-tr-muted ${focusRing}`}
              />

              <div className="flex flex-wrap items-center gap-1.5 border-t border-tr-border/60 px-2 py-1.5">
                <IntentChip
                  active={intent === 'ask'}
                  icon={<Bot size={13} />}
                  label="Hỏi dữ liệu"
                  onClick={() => setIntent('ask')}
                />
                <IntentChip
                  active={intent === 'task'}
                  icon={<ListPlus size={13} />}
                  label="Tạo việc"
                  onClick={() => setIntent('task')}
                />

                {intent === 'ask' && (
                  <label className="ml-1 flex items-center gap-1 text-xs text-tr-muted">
                    <span className="sr-only">Phạm vi tra cứu</span>
                    <Select
                      value={scope}
                      onChange={(event) => setScope(event.target.value as Scope)}
                      className="h-8 !py-0 text-xs"
                    >
                      {SCOPES.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </Select>
                  </label>
                )}
                <label className="flex items-center gap-1 text-xs text-tr-muted">
                  <span className="sr-only">Mức độ chi tiết</span>
                  <Select
                    value={mode}
                    onChange={(event) => setMode(event.target.value as AiMode)}
                    className="h-8 !py-0 text-xs"
                  >
                    <option value="fast">Nhanh</option>
                    <option value="balanced">Cân bằng</option>
                    <option value="reasoning">Suy luận</option>
                  </Select>
                </label>

                <button
                  type="button"
                  onClick={submit}
                  disabled={draft.trim().length < 3 || busy}
                  aria-label={intent === 'ask' ? 'Gửi câu hỏi' : 'Viết lại thành task'}
                  className={`ml-auto flex h-9 w-9 items-center justify-center rounded-full bg-tr-primary text-tr-on-primary transition hover:bg-tr-primary-hover disabled:opacity-40 ${focusRing}`}
                >
                  {intent === 'ask' ? (
                    <ArrowUp size={17} aria-hidden="true" />
                  ) : (
                    <Sparkles size={16} aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            <p className="mt-1.5 px-1 text-xs text-tr-muted">
              {intent === 'ask'
                ? 'Trợ lý chỉ đọc dữ liệu trong phạm vi của bạn và không tự thay đổi gì. Enter để gửi, Shift + Enter để xuống dòng.'
                : 'AI viết lại thành tiêu đề, mô tả, ưu tiên, thời hạn và checklist. Bạn vẫn duyệt trước khi lưu.'}
            </p>
          </div>
        </div>
      </div>

      {/* Xoa phien la mat han lich su trao doi — khong de mot cu bam la xong. */}
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Xoá cuộc trò chuyện"
        message={`Xoá "${pendingDelete?.title || 'Cuộc trò chuyện mới'}"? Toàn bộ nội dung trao đổi sẽ mất.`}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) removeChat.mutate(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- cot lich su */

function ChatRail({
  open,
  onClose,
  sessions,
  loading,
  activeId,
  onPick,
  onNew,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  sessions: AiChatSession[];
  loading: boolean;
  activeId: number | null;
  onPick: (id: number) => void;
  onNew: () => void;
  onDelete: (session: AiChatSession) => void;
}) {
  return (
    <>
      {/* Duoi lg cot nay truot de len noi dung — man hep khong du cho hai cot,
          ma bo han lich su di thi khong quay lai duoc cuoc tro chuyen cu. */}
      {open && (
        <button
          type="button"
          aria-label="Đóng danh sách trò chuyện"
          onClick={onClose}
          className="fixed inset-0 z-modal bg-tr-overlay lg:hidden"
        />
      )}
      <aside
        aria-label="Cuộc trò chuyện với trợ lý"
        className={`${
          open ? 'fixed inset-y-0 left-0 z-modal flex w-72 shadow-2xl' : 'hidden'
        } shrink-0 flex-col border-r border-tr-border bg-tr-panel lg:relative lg:z-auto lg:flex lg:w-64 lg:shadow-none`}
      >
        <div className="flex items-center gap-2 p-2">
          <Button className="flex-1" onClick={onNew}>
            <MessageSquarePlus size={15} aria-hidden="true" /> Cuộc trò chuyện mới
          </Button>
          <IconButton label="Đóng danh sách" onClick={onClose} className="lg:hidden">
            <X size={16} aria-hidden="true" />
          </IconButton>
        </div>

        <div className="tr-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {loading ? (
            <p className="px-2 py-3 text-xs text-tr-muted">{t.common.loading}</p>
          ) : sessions.length === 0 ? (
            <p className="px-2 py-3 text-xs leading-relaxed text-tr-muted">
              Chưa có cuộc trò chuyện nào. Gõ câu hỏi là cuộc đầu tiên được tạo tự động.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {sessions.map((session) => (
                <li key={session.id} className="group flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onPick(session.id)}
                    aria-current={session.id === activeId ? 'true' : undefined}
                    className={`min-w-0 flex-1 rounded-control px-2 py-1.5 text-left transition ${focusRing} ${
                      session.id === activeId
                        ? 'bg-tr-primary/15 text-tr-primary'
                        : 'text-tr-text hover:bg-tr-hover'
                    }`}
                  >
                    <span className="block truncate text-sm">
                      {session.title || 'Cuộc trò chuyện mới'}
                    </span>
                    <span className="block truncate text-xs text-tr-muted">
                      {formatDateTime(session.updated_at)}
                    </span>
                  </button>
                  <IconButton
                    label={`Xoá: ${session.title || 'Cuộc trò chuyện mới'}`}
                    tone="danger"
                    onClick={() => onDelete(session)}
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="border-t border-tr-border px-3 py-2 text-xs text-tr-muted">
          Giữ {MAX_CHAT_SESSIONS} cuộc gần nhất của bạn
        </p>
      </aside>
    </>
  );
}

/* ---------------------------------------------------------------- hoi thoai */

function EmptyChat({ greeting, onPick }: { greeting: string; onPick: (text: string) => void }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-tr-primary/15 text-tr-primary">
        <Sparkles size={22} aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-xl font-semibold text-tr-text">
        {greeting ? `Chào ${greeting}, tôi giúp gì được?` : 'Tôi giúp gì được cho bạn?'}
      </h2>
      <p className="mt-1.5 max-w-md text-sm text-tr-muted">
        Hỏi về khách hàng, cơ hội, hợp đồng hay việc của bạn. Tôi chỉ đọc những dữ liệu bạn được
        phép xem.
      </p>
      <div className="mt-6 grid w-full max-w-xl gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onPick(item)}
            className={`rounded-panel border border-tr-border px-3 py-2.5 text-left text-sm text-tr-subtle transition hover:border-tr-primary/40 hover:bg-tr-hover hover:text-tr-text ${focusRing}`}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

function Bubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-panel bg-tr-primary px-3.5 py-2 text-sm leading-6 whitespace-pre-wrap text-tr-on-primary">
        {text}
      </div>
    </div>
  );
}

function Thinking() {
  return (
    <div role="status" className="flex items-center gap-2 text-sm text-tr-muted">
      <Sparkles size={15} className="animate-pulse text-tr-primary" aria-hidden="true" />
      Đang đọc dữ liệu và soạn câu trả lời…
    </div>
  );
}

function Turn({
  question,
  result,
  pendingDecision,
  onDecide,
  onFollowUp,
}: {
  question: string;
  result: AiAskResult;
  pendingDecision: boolean;
  onDecide: (decision: 'approve' | 'reject') => void;
  onFollowUp: (text: string) => void;
}) {
  return (
    <div className="space-y-3">
      <Bubble text={question} />

      <div className="space-y-3">
        <AnswerText text={result.answer} />

        {result.sources.length > 0 && (
          <details className="text-xs text-tr-muted">
            <summary className={`cursor-pointer rounded font-medium ${focusRing}`}>
              Nguồn đã dùng ({result.sources.length})
            </summary>
            <ul className="mt-1 space-y-1 pl-3">
              {result.sources.map((source) => (
                <li key={source}>• {source}</li>
              ))}
            </ul>
          </details>
        )}

        {result.proposal && (
          <ProposalCard proposal={result.proposal} onDecide={onDecide} pending={pendingDecision} />
        )}

        {result.follow_up_questions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {result.follow_up_questions.map((followUp) => (
              <button
                key={followUp}
                type="button"
                onClick={() => onFollowUp(followUp)}
                className={`rounded-full border border-tr-border px-2.5 py-1 text-left text-xs text-tr-subtle transition hover:bg-tr-hover hover:text-tr-text ${focusRing}`}
              >
                {followUp}
              </button>
            ))}
          </div>
        )}

        {result.meta.provider && (
          <p className="text-xs text-tr-muted">
            {result.meta.provider} · {result.meta.model}
          </p>
        )}
      </div>
    </div>
  );
}

function IntentChip({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${focusRing} ${
        active
          ? 'border-tr-primary/40 bg-tr-primary/15 text-tr-primary'
          : 'border-transparent text-tr-muted hover:bg-tr-hover hover:text-tr-text'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function TaskDraftCard({
  result,
  onReview,
  onDismiss,
}: {
  result: TaskAssistResult;
  onReview: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      aria-live="polite"
      className="rounded-panel border border-tr-primary/30 bg-tr-primary/5 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-tr-primary">
          <Check size={14} aria-hidden="true" /> AI đã viết lại
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-tr-muted">
            {result.meta.provider} · {result.meta.model}
          </span>
          <IconButton label="Bỏ bản nháp này" onClick={onDismiss}>
            <X size={15} aria-hidden="true" />
          </IconButton>
        </div>
      </div>
      <h3 className="mt-3 text-base font-semibold text-tr-text">{result.title}</h3>
      {result.description && (
        <p className="mt-2 text-sm leading-6 whitespace-pre-wrap text-tr-subtle">
          {result.description}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {result.priority && (
          <span className="rounded-full bg-tr-list px-2.5 py-1 text-tr-text">
            Ưu tiên: {t.priority[result.priority]}
          </span>
        )}
        {result.start_date && (
          <span className="rounded-full bg-tr-list px-2.5 py-1 text-tr-text">
            Bắt đầu: {formatDate(result.start_date)}
          </span>
        )}
        {result.due_date && (
          <span className="rounded-full bg-tr-list px-2.5 py-1 text-tr-text">
            Kết thúc / hạn: {formatDate(result.due_date)}
          </span>
        )}
        {(
          [
            'customer_id',
            'contact_id',
            'deal_id',
            'contract_id',
            'quotation_id',
            'project_id',
            'assignee_contact_id',
          ] as const
        ).map((key) =>
          result.labels[key] ? (
            <span key={key} className="rounded-full bg-tr-list px-2.5 py-1 text-tr-text">
              {
                {
                  customer_id: 'Khách hàng',
                  contact_id: 'Liên hệ',
                  deal_id: 'Cơ hội',
                  contract_id: 'Hợp đồng',
                  quotation_id: 'Báo giá',
                  project_id: 'Dự án',
                  assignee_contact_id: 'Người phụ trách',
                }[key]
              }
              : {result.labels[key]}
            </span>
          ) : null
        )}
      </div>
      {result.checklist.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-tr-subtle">Việc cần làm</p>
          <ul className="mt-1 space-y-1 text-xs text-tr-muted">
            {result.checklist.map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden="true">□</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {result.warnings.map((warning) => (
        <p key={warning} className="mt-2 text-xs text-tr-danger">
          {warning}
        </p>
      ))}
      {result.rationale && <p className="mt-2 text-xs text-tr-subtle">Lý do: {result.rationale}</p>}
      <Button className="mt-3" variant="primary" onClick={onReview}>
        <Check size={15} aria-hidden="true" /> Kiểm tra & tạo công việc
      </Button>
    </div>
  );
}
