import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import {
  Activity,
  Bell,
  Bot,
  Check,
  DatabaseZap,
  Play,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import type { AiActionProposal, AiAskResult, AiMode } from '../ai/types';
import {
  Button,
  EmptyState,
  Field,
  FormError,
  Panel,
  Segmented,
  Select,
  Textarea,
} from '../components/common/ui';
import { PageShell } from '../components/common/PageShell';
import { formatDateTime } from '../lib/format';
import { useUiStore } from '../stores/uiStore';

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

export default function AiWorkspacePage() {
  const [tab, setTab] = useState<Tab>('assistant');
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
  const [question, setQuestion] = useState('');
  const [scope, setScope] = useState<'crm' | 'documents' | 'all'>('all');
  const [mode, setMode] = useState<AiMode>('balanced');
  const ask = useMutation({
    mutationFn: () => api.post<AiAskResult>('/api/ai/ask', { question, scope, mode }),
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
      if (ask.data?.proposal?.id === variables.id)
        ask.data.proposal.status = variables.decision === 'approve' ? 'executed' : 'rejected';
    },
  });

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <Panel title="Hỏi dữ liệu CRM" className="lg:col-span-8">
        <div className="grid gap-3 sm:grid-cols-[1fr_180px_160px] sm:items-end">
          <Field label="Câu hỏi">
            <Textarea
              rows={4}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ví dụ: Cơ hội nào giá trị lớn đang thiếu tương tác và tôi nên làm gì tiếp theo?"
            />
          </Field>
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
          <Field label="Chế độ model">
            <Select value={mode} onChange={(event) => setMode(event.target.value as AiMode)}>
              <option value="fast">Nhanh</option>
              <option value="balanced">Cân bằng</option>
              <option value="reasoning">Suy luận</option>
            </Select>
          </Field>
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            variant="primary"
            disabled={question.trim().length < 3 || ask.isPending}
            onClick={() => ask.mutate()}
          >
            <Send size={15} /> {ask.isPending ? 'Đang phân tích…' : 'Gửi câu hỏi'}
          </Button>
        </div>
        <FormError error={ask.error ?? decide.error} />

        {ask.data && (
          <div className="mt-5 space-y-4 border-t border-tr-border pt-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-tr-primary">
              <Sparkles size={14} /> {ask.data.meta.provider} · {ask.data.meta.model}
            </div>
            <p className="text-sm leading-7 whitespace-pre-wrap text-tr-text">{ask.data.answer}</p>
            {ask.data.sources.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-tr-subtle">Nguồn đã dùng</h3>
                <ul className="mt-1 space-y-1 text-xs text-tr-muted">
                  {ask.data.sources.map((source) => (
                    <li key={source}>• {source}</li>
                  ))}
                </ul>
              </div>
            )}
            {ask.data.proposal && (
              <ProposalCard
                proposal={ask.data.proposal}
                onDecide={(decision) => decide.mutate({ id: ask.data!.proposal!.id, decision })}
                pending={decide.isPending}
              />
            )}
          </div>
        )}
      </Panel>

      <div className="space-y-4 lg:col-span-4">
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
      <pre className="mt-2 max-h-44 overflow-auto rounded-lg bg-tr-panel p-2 text-2xs whitespace-pre-wrap text-tr-muted">
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
                <div className="mt-2 flex items-center justify-between gap-2 text-2xs text-tr-muted">
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
                <th className="px-3 py-2">Provider</th>
                <th className="px-3 py-2 text-right">Request</th>
                <th className="px-3 py-2 text-right">Token</th>
                <th className="px-3 py-2 text-right">Chi phí</th>
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
                <th className="px-3 py-2">Thời gian</th>
                <th className="px-3 py-2">Tác vụ</th>
                <th className="px-3 py-2">Model</th>
                <th className="px-3 py-2 text-right">Token</th>
                <th className="px-3 py-2">Trạng thái</th>
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
                    {item.status}
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
