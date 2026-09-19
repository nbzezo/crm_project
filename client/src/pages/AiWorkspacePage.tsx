import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import {
  Activity,
  Bell,
  Bot,
  Check,
  DatabaseZap,
  Play,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import {
  TASK_LINK_KEYS,
  type AiActionProposal,
  type AiAskResult,
  type AiChatDetail,
  type AiChatMessage,
  type AiChatSession,
  type AiMode,
  type TaskAssistResult,
} from '../ai/types';
import {
  Button,
  EmptyState,
  Field,
  FormError,
  IconButton,
  Panel,
  Segmented,
  Select,
  SkeletonRows,
  Textarea,
  focusRing,
} from '../components/common/ui';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { PageShell } from '../components/common/PageShell';
import { t } from '../i18n/vi';
import { formatDate, formatDateTime } from '../lib/format';
import { useUiStore, type TaskContext } from '../stores/uiStore';

type Tab = 'assistant' | 'operations' | 'usage';

interface Automation {
  id: number;
  name: string;
  automation_type: string;
  enabled: boolean;
  interval_minutes: number;
  config: Record<string, unknown>;
  last_run_at: string | null;
  next_run_at: string | null;
}

interface AiNotification {
  id: number;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  body: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

interface UsageData {
  totals: {
    requests: number;
    successful: number;
    input_tokens: number;
    output_tokens: number;
    estimated_cost_usd: number | null;
    avg_latency_ms: number | null;
  };
  by_provider: {
    provider: string | null;
    requests: number;
    tokens: number;
    estimated_cost_usd: number | null;
  }[];
  daily: { day: string; requests: number; tokens: number; estimated_cost_usd: number | null }[];
  recent: {
    request_id: string;
    task: string;
    provider: string | null;
    model: string | null;
    input_tokens: number;
    output_tokens: number;
    latency_ms: number;
    status: string;
    fallback_count: number;
    error_code: string | null;
    created_at: string;
  }[];
}

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

/** Giu dong bo voi MAX_SESSIONS o server/src/services/ai/chatSessions.ts. */
const MAX_CHAT_SESSIONS = 20;

/** Hai y dinh dung chung mot o nhap tren trang Tro ly AI. */
type Intent = 'ask' | 'task';

export default function AiWorkspacePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const tab: Tab =
    requestedTab === 'operations' || requestedTab === 'usage' ? requestedTab : 'assistant';
  const setTab = (next: Tab) => {
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current);
        params.set('tab', next);
        return params;
      },
      { replace: true }
    );
  };
  return (
    <PageShell width="content">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-tr-primary/10 px-2.5 py-1 text-xs font-semibold text-tr-primary">
            <Sparkles size={13} /> AI Copilot
          </span>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-tr-text">
            Trợ lý công việc & CRM
          </h1>
          <p className="mt-1 text-sm text-tr-muted">
            Hỏi dữ liệu, duyệt hành động và theo dõi automation trong một không gian an toàn.
          </p>
        </div>
        <Segmented
          value={tab}
          onChange={setTab}
          label="Chế độ AI Copilot"
          options={[
            { value: 'assistant', label: 'Hỏi AI', icon: <Bot size={14} /> },
            { value: 'operations', label: 'Vận hành', icon: <ShieldCheck size={14} /> },
            { value: 'usage', label: 'Sử dụng', icon: <Activity size={14} /> },
          ]}
        />
      </header>

      {tab === 'assistant' && <AssistantTab />}
      {tab === 'operations' && <OperationsTab />}
      {tab === 'usage' && <UsageTab />}
    </PageShell>
  );
}

function AssistantTab() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);
  const openTaskComposer = useUiStore((state) => state.openTaskComposer);
  /* Mot o nhap, hai y dinh. Khong de AI tu doan: doan sai thi nguoi dung mat
     cong vua go, ma hai chip thi ro rang va khong ton them thao tac nao. */
  const [intent, setIntent] = useState<Intent>('ask');
  const [quickTaskText, setQuickTaskText] = useState('');
  const [question, setQuestion] = useState('');
  const [scope, setScope] = useState<'crm' | 'documents' | 'all'>('all');
  const [mode, setMode] = useState<AiMode>('balanced');
  /* Phien dang mo. `null` = chua chon phien nao; luot hoi dau tien se tu tao. */
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AiChatSession | null>(null);

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

  const newChat = useMutation({
    mutationFn: () => api.post<AiChatSession>('/api/ai/chats', { scope }),
    onSuccess: (session) => {
      setSessionId(session.id);
      setQuestion('');
      refreshChats();
    },
  });

  const removeChat = useMutation({
    mutationFn: (id: number) => api.del(`/api/ai/chats/${id}`),
    onSuccess: (_data, id) => {
      if (id === sessionId) setSessionId(null);
      refreshChats();
    },
  });

  const ask = useMutation({
    mutationFn: async (submittedQuestion: string) => {
      /* Hoi khi chua co phien thi tu mo mot phien moi — nguoi dung khong phai
         bam "Phiên mới" truoc roi moi go duoc. */
      let target = sessionId;
      if (target === null) {
        const created = await api.post<AiChatSession>('/api/ai/chats', { scope });
        target = created.id;
        setSessionId(target);
      }
      return api.post<AiAskResult>('/api/ai/ask', {
        question: submittedQuestion,
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
    onSuccess: () => {
      setQuestion('');
      refreshChats();
    },
  });
  const quickTask = useMutation({
    mutationFn: () =>
      api.post<TaskAssistResult>('/api/ai/assist/task', {
        draft: quickTaskText.trim(),
        mode,
      }),
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
         lai tu may chu thay vi vá tay ban sao trong RAM — mo lai phien cu cung
         phai thay dung trang thai nay. */
      void queryClient.invalidateQueries({ queryKey: ['ai', 'chat'] });
    },
  });

  const submitQuestion = () => {
    const value = question.trim();
    if (value.length >= 3 && !ask.isPending) ask.mutate(value);
  };

  /** Gui theo y dinh dang chon — cung mot o nhap, cung mot nut. */
  const submitComposer = () => {
    if (intent === 'ask') {
      submitQuestion();
      return;
    }
    if (quickTaskText.trim().length >= 3 && !quickTask.isPending) quickTask.mutate();
  };

  const composerBusy =
    intent === 'ask'
      ? question.trim().length < 3 || ask.isPending
      : quickTaskText.trim().length < 3 || quickTask.isPending;

  const reviewQuickTask = () => {
    const result = quickTask.data;
    if (!result) return;
    const links = Object.fromEntries(
      TASK_LINK_KEYS.flatMap((key) => (result.links[key] == null ? [] : [[key, result.links[key]]]))
    ) as TaskContext;
    openTaskComposer({
      context: {},
      draft: {
        title: result.title,
        description: result.description,
        priority: result.priority,
        startDate: result.start_date,
        dueDate: result.due_date,
        checklist: result.checklist,
        links,
        aiRequestId: result.meta.requestId,
        aiWarnings: result.warnings,
      },
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <Panel
        title="Trợ lý AI"
        className="lg:col-span-8"
        action={
          <Button onClick={() => newChat.mutate()} disabled={newChat.isPending}>
            <Plus size={15} aria-hidden="true" /> Phiên mới
          </Button>
        }
      >
        {conversation.length > 0 && (
          <div className="mb-4 max-h-[34rem] space-y-4 overflow-y-auto border-b border-tr-border pb-4">
            {conversation.map((turn, index) => (
              <div key={`${index}-${turn.result.meta.requestId}`} className="space-y-2">
                <div className="ml-auto max-w-[85%] rounded-panel bg-tr-primary px-3 py-2 text-sm text-white">
                  {turn.question}
                </div>
                <div className="max-w-[92%] rounded-panel border border-tr-border bg-tr-list p-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-tr-primary">
                    <Sparkles size={14} /> {turn.result.meta.provider} · {turn.result.meta.model}
                  </div>
                  <p className="mt-2 text-sm leading-7 whitespace-pre-wrap text-tr-text">
                    {turn.result.answer}
                  </p>
                  {turn.result.sources.length > 0 && (
                    <details className="mt-2 text-xs text-tr-muted">
                      <summary className="cursor-pointer font-medium">Nguồn đã dùng</summary>
                      <ul className="mt-1 space-y-1 pl-3">
                        {turn.result.sources.map((source) => (
                          <li key={source}>• {source}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {turn.result.proposal && (
                    <div className="mt-3">
                      <ProposalCard
                        proposal={turn.result.proposal}
                        onDecide={(decision) =>
                          decide.mutate({ id: turn.result.proposal!.id, decision })
                        }
                        pending={decide.isPending}
                      />
                    </div>
                  )}
                  {turn.result.follow_up_questions.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {turn.result.follow_up_questions.map((followUp) => (
                        <button
                          key={followUp}
                          type="button"
                          onClick={() => setQuestion(followUp)}
                          className="rounded-full border border-tr-border px-2.5 py-1 text-left text-xs text-tr-subtle transition hover:bg-tr-hover hover:text-tr-text"
                        >
                          {followUp}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* MOT o nhap duy nhat.
            Truoc day trang co hai khoi gan nhu giong het nhau — hai textarea,
            hai nut gui, hai dropdown "Chế độ model" — nen rat de go cau hoi vao
            o tao task. Y dinh gio chon bang hai chip ngay tren o nhap, ro rang
            va khong ton them thao tac nao. */}
        <div role="group" aria-label="Bạn muốn làm gì" className="mb-2 flex flex-wrap gap-1.5">
          {(
            [
              ['ask', 'Hỏi dữ liệu', <Bot key="a" size={13} />],
              ['task', 'Tạo việc', <Sparkles key="t" size={13} />],
            ] as [Intent, string, React.ReactNode][]
          ).map(([value, label, icon]) => (
            <button
              key={value}
              type="button"
              aria-pressed={intent === value}
              onClick={() => setIntent(value)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${focusRing} ${
                intent === value
                  ? 'border-tr-primary/40 bg-tr-primary/15 text-tr-primary'
                  : 'border-tr-border text-tr-subtle hover:bg-tr-hover'
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>

        <Field label={intent === 'ask' ? 'Câu hỏi' : 'Nội dung việc'}>
          <Textarea
            rows={4}
            value={intent === 'ask' ? question : quickTaskText}
            onChange={(event) => {
              if (intent === 'ask') {
                setQuestion(event.target.value);
              } else {
                setQuickTaskText(event.target.value);
                if (quickTask.data || quickTask.error) quickTask.reset();
              }
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey)) return;
              event.preventDefault();
              submitComposer();
            }}
            placeholder={
              intent === 'ask'
                ? 'Ví dụ: Cơ hội nào giá trị lớn đang thiếu tương tác và tôi nên làm gì tiếp theo?'
                : 'Ví dụ: Thứ sáu gọi lại chị Lan về báo giá VPBank, ưu tiên cao, chuẩn bị trước các câu hỏi về KYC…'
            }
          />
        </Field>
        <p className="mt-1 text-xs text-tr-muted">
          {intent === 'ask'
            ? 'Trợ lý chỉ đọc dữ liệu, không tự thay đổi gì. Nhấn Ctrl + Enter để gửi.'
            : 'AI sẽ viết lại tiêu đề, mô tả, ưu tiên, thời hạn và checklist. Nhấn Ctrl + Enter để phân tích nhanh.'}
        </p>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            {intent === 'ask' && (
              <div className="w-44">
                <Field label="Phạm vi">
                  <Select
                    value={scope}
                    onChange={(event) => setScope(event.target.value as typeof scope)}
                  >
                    <option value="all">CRM + tài liệu</option>
                    <option value="crm">Chỉ CRM</option>
                    <option value="documents">Chỉ tài liệu</option>
                  </Select>
                </Field>
              </div>
            )}
            {/* "Chế độ model" la thuat ngu ky thuat lot ra giao dien nguoi dung
                — xem docs/GLOSSARY.md. Mot o duy nhat cho ca hai y dinh. */}
            <div className="w-44">
              <Field label="Mức độ chi tiết">
                <Select value={mode} onChange={(event) => setMode(event.target.value as AiMode)}>
                  <option value="fast">Nhanh</option>
                  <option value="balanced">Cân bằng</option>
                  <option value="reasoning">Suy luận</option>
                </Select>
              </Field>
            </div>
          </div>
          <Button variant="primary" disabled={composerBusy} onClick={submitComposer}>
            {intent === 'ask' ? (
              <>
                <Send size={15} /> {ask.isPending ? 'Đang phân tích…' : 'Gửi câu hỏi'}
              </>
            ) : (
              <>
                <Sparkles size={15} />{' '}
                {quickTask.isPending ? 'Đang viết lại…' : 'Viết lại thành task'}
              </>
            )}
          </Button>
        </div>
        <FormError error={intent === 'ask' ? (ask.error ?? decide.error) : quickTask.error} />

        {/* Ban nhap chi xuat hien khi CO ket qua — truoc day mot the rong
            "Bản task sẽ xuất hiện ở đây" chiem nua chieu ngang suot thoi gian. */}
        {intent === 'task' && quickTask.data && (
          <div className="mt-4">
            <div
              aria-live="polite"
              className="rounded-panel border border-tr-primary/30 bg-tr-primary/5 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-tr-primary">
                  <Check size={14} /> AI đã viết lại
                </span>
                <span className="text-xs text-tr-muted">
                  {quickTask.data.meta.provider} · {quickTask.data.meta.model}
                </span>
              </div>
              <h3 className="mt-3 text-base font-semibold text-tr-text">{quickTask.data.title}</h3>
              {quickTask.data.description && (
                <p className="mt-2 text-sm leading-6 whitespace-pre-wrap text-tr-subtle">
                  {quickTask.data.description}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-tr-list px-2.5 py-1 text-tr-text">
                  Ưu tiên: {t.priority[quickTask.data.priority]}
                </span>
                {quickTask.data.start_date && (
                  <span className="rounded-full bg-tr-list px-2.5 py-1 text-tr-text">
                    Bắt đầu: {formatDate(quickTask.data.start_date)}
                  </span>
                )}
                {quickTask.data.due_date && (
                  <span className="rounded-full bg-tr-list px-2.5 py-1 text-tr-text">
                    Hạn: {formatDate(quickTask.data.due_date)}
                  </span>
                )}
              </div>
              {quickTask.data.checklist.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-tr-subtle">Việc cần làm</p>
                  <ul className="mt-1 space-y-1 text-xs text-tr-muted">
                    {quickTask.data.checklist.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span aria-hidden="true">□</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {quickTask.data.warnings.map((warning) => (
                <p key={warning} className="mt-2 text-xs text-tr-danger">
                  {warning}
                </p>
              ))}
              <p className="mt-3 text-xs leading-relaxed text-tr-muted">
                Đây mới là bản nháp. Bạn vẫn có thể sửa và chọn bảng, dự án, người phụ trách trước
                khi lưu.
              </p>
              <Button className="mt-3" variant="primary" onClick={reviewQuickTask}>
                <Check size={15} /> Kiểm tra & tạo công việc
              </Button>
            </div>
          </div>
        )}
      </Panel>

      <div className="space-y-4 lg:col-span-4">
        <Panel
          title="Phiên trò chuyện"
          action={
            <span className="text-xs font-normal text-tr-muted">
              giữ {MAX_CHAT_SESSIONS} phiên gần nhất
            </span>
          }
        >
          {chats.isLoading ? (
            <SkeletonRows rows={4} cols={1} />
          ) : (chats.data ?? []).length === 0 ? (
            <EmptyState
              message="Chưa có phiên nào."
              hint="Gõ câu hỏi bên trái là phiên đầu tiên được tạo tự động."
            />
          ) : (
            <ul className="-mx-1 max-h-80 space-y-0.5 overflow-y-auto">
              {(chats.data ?? []).map((session) => (
                <li key={session.id} className="group flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setSessionId(session.id)}
                    aria-current={session.id === sessionId ? 'true' : undefined}
                    className={`min-w-0 flex-1 rounded-control px-2 py-1.5 text-left transition ${focusRing} ${
                      session.id === sessionId
                        ? 'bg-tr-primary/15 text-tr-primary'
                        : 'text-tr-text hover:bg-tr-hover'
                    }`}
                  >
                    <span className="block truncate text-sm font-medium">
                      {session.title || 'Phiên mới'}
                    </span>
                    <span className="block truncate text-xs text-tr-muted">
                      {formatDateTime(session.updated_at)} · {session.message_count / 2} lượt
                    </span>
                  </button>
                  <IconButton
                    label={`Xoá phiên: ${session.title || 'Phiên mới'}`}
                    tone="danger"
                    onClick={() => setPendingDelete(session)}
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Câu hỏi gợi ý">
          <div className="space-y-2">
            {[
              'Cơ hội nào cần tôi xử lý trước hôm nay?',
              'Khách hàng nào có hợp đồng sắp hết hạn?',
              'Tóm tắt rủi ro từ các tài liệu liên quan đến báo giá.',
              'Deal nào trên 500 triệu chưa có tương tác gần đây?',
            ].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setQuestion(item)}
                className="w-full rounded-lg border border-tr-border px-3 py-2 text-left text-xs text-tr-subtle transition hover:bg-tr-hover hover:text-tr-text"
              >
                {item}
              </button>
            ))}
          </div>
        </Panel>
        <RagStatus />
      </div>

      {/* Xoa phien la mat han lich su trao doi — khong de mot cu bam la xong. */}
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Xoá phiên trò chuyện"
        message={`Xoá "${pendingDelete?.title || 'Phiên mới'}"? Toàn bộ nội dung trao đổi trong phiên sẽ mất.`}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) removeChat.mutate(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}

function ProposalCard({
  proposal,
  onDecide,
  pending,
}: {
  proposal: AiActionProposal;
  onDecide: (decision: 'approve' | 'reject') => void;
  pending: boolean;
}) {
  return (
    <div className="rounded-panel border border-tr-warning/40 bg-tr-hover p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-tr-text">
        <ShieldCheck size={15} className="text-tr-warning" /> Hành động cần bạn xác nhận
      </div>
      <h3 className="mt-2 text-sm font-semibold text-tr-text">{proposal.title}</h3>
      {proposal.explanation && (
        <p className="mt-1 text-xs text-tr-subtle">{proposal.explanation}</p>
      )}
      <pre className="mt-2 max-h-44 overflow-auto rounded-lg bg-tr-panel p-2 text-xs whitespace-pre-wrap text-tr-muted">
        {JSON.stringify(proposal.payload, null, 2)}
      </pre>
      {proposal.status === 'pending' ? (
        <div className="mt-3 flex gap-2">
          <Button
            variant="primary"
            size="sm"
            disabled={pending}
            onClick={() => onDecide('approve')}
          >
            <Check size={14} /> Duyệt & thực thi
          </Button>
          <Button size="sm" disabled={pending} onClick={() => onDecide('reject')}>
            <X size={14} /> Từ chối
          </Button>
        </div>
      ) : (
        <p className="mt-2 text-xs font-medium text-tr-muted">Trạng thái: {proposal.status}</p>
      )}
    </div>
  );
}

function RagStatus() {
  const pushToast = useUiStore((state) => state.pushToast);
  const index = useMutation({
    mutationFn: () => api.post<{ indexed: number; chunks: number }>('/api/ai/documents/index'),
    onSuccess: (result) =>
      pushToast(`Đã lập ${result.chunks} đoạn từ ${result.indexed} tài liệu`, 'success'),
  });
  return (
    <Panel title="Chỉ mục tài liệu RAG">
      <p className="text-xs leading-relaxed text-tr-subtle">
        Tài liệu văn bản được chia đoạn và tìm kiếm tại máy chủ. Tài liệu mật không được gửi vào ngữ
        cảnh AI.
      </p>
      <FormError error={index.error} />
      <Button className="mt-3" size="sm" disabled={index.isPending} onClick={() => index.mutate()}>
        <DatabaseZap size={14} /> {index.isPending ? 'Đang lập chỉ mục…' : 'Đồng bộ chỉ mục'}
      </Button>
    </Panel>
  );
}

function OperationsTab() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);
  const automations = useQuery({
    queryKey: ['ai-automations'],
    queryFn: () => api.get<Automation[]>('/api/ai/automations'),
  });
  const actions = useQuery({
    queryKey: ['ai-actions'],
    queryFn: () => api.get<AiActionProposal[]>('/api/ai/actions?status=pending'),
  });
  const notifications = useQuery({
    queryKey: ['ai-notifications'],
    queryFn: () => api.get<AiNotification[]>('/api/ai/notifications'),
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      api.patch(`/api/ai/automations/${id}`, body),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['ai-automations'] }),
  });
  const run = useMutation({
    mutationFn: (id: number) =>
      api.post<{ found: number; created: number }>(`/api/ai/automations/${id}/run`),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['ai-automations'] });
      void queryClient.invalidateQueries({ queryKey: ['ai-notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      pushToast(`Đã quét ${result.found} mục, tạo ${result.created} cảnh báo mới`, 'success');
    },
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
    },
  });

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <Panel title="Automation chủ động" className="lg:col-span-7">
        <p className="mb-3 text-xs text-tr-muted">
          Automation chỉ tạo cảnh báo. Mọi thay đổi CRM vẫn phải được bạn xác nhận.
        </p>
        <FormError error={automations.error ?? update.error ?? run.error} />
        <div className="space-y-2">
          {automations.data?.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-tr-border p-3"
            >
              <label className="flex min-w-0 flex-1 items-start gap-2">
                <input
                  type="checkbox"
                  checked={item.enabled}
                  onChange={(event) =>
                    update.mutate({ id: item.id, body: { enabled: event.target.checked } })
                  }
                  className="mt-0.5 h-4 w-4 rounded border-tr-border"
                />
                <span>
                  <span className="block text-sm font-medium text-tr-text">{item.name}</span>
                  <span className="text-xs text-tr-muted">
                    Mỗi {item.interval_minutes} phút
                    {item.last_run_at
                      ? ` · chạy gần nhất ${formatDateTime(item.last_run_at.slice(0, 16))}`
                      : ''}
                  </span>
                </span>
              </label>
              <Button size="sm" disabled={run.isPending} onClick={() => run.mutate(item.id)}>
                <Play size={13} /> Chạy ngay
              </Button>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Hành động chờ duyệt" className="lg:col-span-5">
        <FormError error={actions.error ?? decide.error} />
        {actions.data?.length ? (
          <div className="space-y-2">
            {actions.data.map((item) => (
              <ProposalCard
                key={item.id}
                proposal={item}
                onDecide={(decision) => decide.mutate({ id: item.id, decision })}
                pending={decide.isPending}
              />
            ))}
          </div>
        ) : (
          <EmptyState message="Không có hành động nào đang chờ duyệt." />
        )}
      </Panel>

      <Panel
        title={
          <span className="flex items-center gap-2">
            <Bell size={15} /> Cảnh báo AI
          </span>
        }
        className="lg:col-span-12"
      >
        {notifications.data?.length ? (
          <div className="grid gap-2 md:grid-cols-2">
            {notifications.data.map((item) => (
              <div key={item.id} className="rounded-lg border border-tr-border p-3">
                <p className="text-sm font-medium text-tr-text">{item.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-tr-subtle">{item.body}</p>
                <div className="mt-2 flex items-center justify-between gap-2 text-xs text-tr-muted">
                  <span>{formatDateTime(item.created_at.slice(0, 16))}</span>
                  {item.link && (
                    <Link className="font-medium text-tr-primary hover:underline" to={item.link}>
                      Mở dữ liệu
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState message="Chưa có cảnh báo từ automation." />
        )}
      </Panel>
    </div>
  );
}

function UsageTab() {
  const usage = useQuery({
    queryKey: ['ai-usage'],
    queryFn: () => api.get<UsageData>('/api/ai/usage'),
  });
  const totals = usage.data?.totals;
  return (
    <div className="space-y-4">
      <FormError error={usage.error} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Yêu cầu 30 ngày" value={totals?.requests ?? 0} />
        <Metric label="Token" value={(totals?.input_tokens ?? 0) + (totals?.output_tokens ?? 0)} />
        <Metric
          label="Độ trễ trung bình"
          value={totals?.avg_latency_ms ? `${totals.avg_latency_ms} ms` : '—'}
        />
        <Metric
          label="Chi phí ước tính"
          value={
            totals?.estimated_cost_usd == null
              ? 'Chưa cấu hình giá'
              : `$${totals.estimated_cost_usd.toFixed(4)}`
          }
        />
      </div>
      <Panel title="Theo nhà cung cấp">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-tr-muted">
              <tr>
                <th scope="col" className="px-3 py-2">
                  Provider
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  Request
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  Token
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  Chi phí
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tr-border">
              {usage.data?.by_provider.map((item) => (
                <tr key={item.provider ?? 'none'}>
                  <td className="px-3 py-2 font-medium text-tr-text">
                    {item.provider ?? 'Không xác định'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{item.requests}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {item.tokens.toLocaleString('vi-VN')}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {item.estimated_cost_usd == null
                      ? '—'
                      : `$${item.estimated_cost_usd.toFixed(4)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Nhật ký gần đây">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-tr-muted">
              <tr>
                <th scope="col" className="px-3 py-2">
                  Thời gian
                </th>
                <th scope="col" className="px-3 py-2">
                  Tác vụ
                </th>
                <th scope="col" className="px-3 py-2">
                  Model
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  Token
                </th>
                <th scope="col" className="px-3 py-2">
                  Trạng thái
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tr-border">
              {usage.data?.recent.map((item) => (
                <tr key={item.request_id}>
                  <td className="px-3 py-2 whitespace-nowrap text-tr-muted">
                    {formatDateTime(item.created_at.slice(0, 16))}
                  </td>
                  <td className="px-3 py-2 text-tr-text">{item.task}</td>
                  <td className="px-3 py-2 text-tr-subtle">
                    {item.provider} · {item.model}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {item.input_tokens + item.output_tokens}
                  </td>
                  <td className="px-3 py-2">
                    <span className={item.status === 'success' ? '' : 'text-tr-danger'}>
                      {item.status}
                    </span>
                    {/* error_code la manh thong tin duy nhat noi ro vi sao mot lan goi
                        that bai (timeout, provider_429, capability_missing…) — thieu no
                        thi moi loi deu chi hien ra ngoai thanh mot con so 502. */}
                    {item.error_code ? ` · ${item.error_code}` : ''}
                    {item.fallback_count ? ` · fallback ${item.fallback_count}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-panel border border-tr-border bg-tr-panel p-4">
      <p className="text-xs text-tr-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold text-tr-text">
        {typeof value === 'number' ? value.toLocaleString('vi-VN') : value}
      </p>
    </div>
  );
}
