import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { Activity, Bell, Bot, DatabaseZap, Play, ShieldCheck, Sparkles } from 'lucide-react';
import { api } from '../api/client';
import { type AiActionProposal } from '../ai/types';
import { Button, EmptyState, FormError, Panel, Segmented } from '../components/common/ui';
import { PageShell } from '../components/common/PageShell';
import { AssistantChat } from '../components/ai/AssistantChat';
import { ProposalCard } from '../components/ai/ProposalCard';
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
  const tabs = (
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
  );

  /*
   * Tab Tro ly chiem TRON chieu cao con lai, khong nam trong PageShell.
   *
   * Mot khung chat phai co o nhap ghim o day man hinh va phan hoi thoai tu cuon
   * — dieu do chi lam duoc khi no biet chieu cao cua minh. PageShell thi nguoc
   * lai: no cho noi dung dai ra va de <main> cuon. Hai tab con lai van la trang
   * tai lieu binh thuong nen giu nguyen PageShell.
   */
  if (tab === 'assistant') {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-tr-border px-4 py-2.5">
          <h1 className="inline-flex items-center gap-2 text-base font-bold tracking-tight text-tr-text">
            <Sparkles size={16} className="text-tr-primary" aria-hidden="true" />
            Trợ lý công việc &amp; CRM
          </h1>
          {tabs}
        </header>
        <div className="min-h-0 flex-1">
          <AssistantChat />
        </div>
      </div>
    );
  }

  return (
    <PageShell width="content">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-tr-primary/10 px-2.5 py-1 text-xs font-semibold text-tr-primary">
            <Sparkles size={13} /> AI Copilot
          </span>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-tr-text">
            Trợ lý công việc &amp; CRM
          </h1>
          <p className="mt-1 text-sm text-tr-muted">
            Hỏi dữ liệu, duyệt hành động và theo dõi automation trong một không gian an toàn.
          </p>
        </div>
        {tabs}
      </header>

      {tab === 'operations' && <OperationsTab />}
      {tab === 'usage' && <UsageTab />}
    </PageShell>
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

      {/* Chi muc RAG truoc day nam canh khung hoi dap. No khong phai thu nguoi
          dung dung trong luc tro chuyen — no la mot thao tac bao tri, nen thuoc
          ve tab Van hanh cung voi automation va hanh dong cho duyet. */}
      <div className="lg:col-span-12">
        <RagStatus />
      </div>
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
