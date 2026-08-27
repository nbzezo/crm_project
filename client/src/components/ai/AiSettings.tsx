import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  CheckCircle2,
  KeyRound,
  Mic,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { api } from '../../api/client';
import type { AiProviderConfig, VoicePromptTemplate } from '../../ai/types';
import { Button, Field, FormError, Input, Panel, Select, Textarea, focusRing } from '../common/ui';
import { useUiStore } from '../../stores/uiStore';

function nullableNumber(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function ProviderEditor({ config }: { config: AiProviderConfig }) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);
  const [baseUrl, setBaseUrl] = useState(config.base_url);
  const [apiKey, setApiKey] = useState('');
  const [enabled, setEnabled] = useState(config.enabled);
  const [defaultModel, setDefaultModel] = useState(config.default_model ?? '');
  const [fastModel, setFastModel] = useState(config.fast_model ?? '');
  const [reasoningModel, setReasoningModel] = useState(config.reasoning_model ?? '');
  const [tokenLimit, setTokenLimit] = useState(String(config.daily_token_limit));
  const [costLimit, setCostLimit] = useState(
    config.daily_cost_limit_usd === null ? '' : String(config.daily_cost_limit_usd)
  );
  const [inputPrice, setInputPrice] = useState(
    config.input_cost_per_million_usd === null ? '' : String(config.input_cost_per_million_usd)
  );
  const [outputPrice, setOutputPrice] = useState(
    config.output_cost_per_million_usd === null ? '' : String(config.output_cost_per_million_usd)
  );

  useEffect(() => {
    setBaseUrl(config.base_url);
    setEnabled(config.enabled);
    setDefaultModel(config.default_model ?? '');
    setFastModel(config.fast_model ?? '');
    setReasoningModel(config.reasoning_model ?? '');
    setTokenLimit(String(config.daily_token_limit));
    setCostLimit(config.daily_cost_limit_usd === null ? '' : String(config.daily_cost_limit_usd));
    setInputPrice(
      config.input_cost_per_million_usd === null ? '' : String(config.input_cost_per_million_usd)
    );
    setOutputPrice(
      config.output_cost_per_million_usd === null ? '' : String(config.output_cost_per_million_usd)
    );
  }, [config]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['ai-providers'] });
  const save = useMutation({
    mutationFn: async () => {
      await api.put(`/api/ai/providers/${config.provider}`, {
        base_url: baseUrl,
        api_key: apiKey || undefined,
        enabled,
        default_model: defaultModel || null,
        fast_model: fastModel || null,
        reasoning_model: reasoningModel || null,
        daily_token_limit: Math.max(0, Number(tokenLimit) || 0),
        daily_cost_limit_usd: nullableNumber(costLimit),
        input_cost_per_million_usd: nullableNumber(inputPrice),
        output_cost_per_million_usd: nullableNumber(outputPrice),
      });
      if (apiKey || config.has_api_key) {
        await api.post(`/api/ai/providers/${config.provider}/sync`);
      }
    },
    onSuccess: () => {
      setApiKey('');
      void refresh();
      pushToast(`Đã lưu và nhận diện model ${config.display_name}`, 'success');
    },
  });
  const sync = useMutation({
    mutationFn: () => api.post(`/api/ai/providers/${config.provider}/sync`),
    onSuccess: () => {
      void refresh();
      pushToast(`Đã đồng bộ model ${config.display_name}`, 'success');
    },
  });

  const models = config.models.filter((model) => model.is_available);
  const statusIcon =
    config.status === 'ready' ? (
      <CheckCircle2 size={14} className="text-tr-success" />
    ) : config.status === 'error' ? (
      <TriangleAlert size={14} className="text-tr-danger" />
    ) : (
      <KeyRound size={14} className="text-tr-muted" />
    );

  return (
    <div className="rounded-panel border border-tr-border bg-tr-list p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-tr-text">
            <Bot size={16} /> {config.display_name}
          </h3>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-tr-muted">
            {statusIcon}
            {config.status === 'ready'
              ? `${models.length} model sẵn sàng${config.api_key_hint ? ` · ${config.api_key_hint}` : ''}`
              : config.status === 'error'
                ? config.last_error || 'Kết nối lỗi'
                : 'Chưa cấu hình'}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-tr-subtle">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="h-4 w-4 rounded border-tr-border"
          />
          Kích hoạt
        </label>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Field label="API Base URL">
          <Input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
        </Field>
        <Field
          label="API key"
          hint={
            config.has_api_key ? `Đã lưu ${config.api_key_hint}; để trống để giữ nguyên` : undefined
          }
        >
          <Input
            type="password"
            autoComplete="new-password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={config.has_api_key ? '••••••••' : 'Nhập API key'}
          />
        </Field>
        <ModelField
          label="Model cân bằng"
          value={defaultModel}
          onChange={setDefaultModel}
          models={models}
        />
        <ModelField label="Model nhanh" value={fastModel} onChange={setFastModel} models={models} />
        <ModelField
          label="Model suy luận"
          value={reasoningModel}
          onChange={setReasoningModel}
          models={models}
        />
        <Field label="Giới hạn token/ngày" hint="0 = không giới hạn">
          <Input
            type="number"
            min="0"
            value={tokenLimit}
            onChange={(event) => setTokenLimit(event.target.value)}
          />
        </Field>
        <Field label="Ngân sách/ngày (USD)" hint="Để trống nếu chưa cấu hình đơn giá">
          <Input
            type="number"
            min="0"
            step="0.01"
            value={costLimit}
            onChange={(event) => setCostLimit(event.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="USD/M token vào">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={inputPrice}
              onChange={(event) => setInputPrice(event.target.value)}
            />
          </Field>
          <Field label="USD/M token ra">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={outputPrice}
              onChange={(event) => setOutputPrice(event.target.value)}
            />
          </Field>
        </div>
      </div>

      <FormError error={save.error ?? sync.error} />
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>
          <ShieldCheck size={15} /> {save.isPending ? 'Đang kiểm tra…' : 'Lưu & nhận diện model'}
        </Button>
        <Button disabled={!config.has_api_key || sync.isPending} onClick={() => sync.mutate()}>
          <RefreshCw size={15} className={sync.isPending ? 'animate-spin' : ''} /> Đồng bộ model
        </Button>
      </div>
    </div>
  );
}

function ModelField({
  label,
  value,
  onChange,
  models,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  models: AiProviderConfig['models'];
}) {
  return (
    <Field label={label}>
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">— tự động —</option>
        {models.map((model) => (
          <option key={model.model_id} value={model.model_id}>
            {model.display_name}
            {model.capabilities.reasoning ? ' · reasoning' : ''}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/** Slug ổn định làm khóa chọn mẫu — chỉ sinh một lần lúc thêm mới, không đổi khi sửa tên sau đó. */
function slugifyKey(name: string, taken: Set<string>): string {
  const base =
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/gi, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'mau';
  let candidate = base;
  let i = 2;
  while (taken.has(candidate)) candidate = `${base}_${i++}`;
  return candidate;
}

function VoicePromptTemplatesSettings() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);

  const { data, isLoading, error } = useQuery({
    queryKey: ['ai-voice-templates'],
    queryFn: () => api.get<VoicePromptTemplate[]>('/api/ai/voice-prompt-templates'),
  });

  const [draft, setDraft] = useState<VoicePromptTemplate[] | null>(null);
  const [loaded, setLoaded] = useState<VoicePromptTemplate[] | null>(null);
  if (data && data !== loaded) {
    setLoaded(data);
    setDraft(structuredClone(data));
  }

  const save = useMutation({
    mutationFn: () => api.put<VoicePromptTemplate[]>('/api/ai/voice-prompt-templates', draft ?? []),
    onSuccess: (next) => {
      queryClient.setQueryData(['ai-voice-templates'], next);
      setLoaded(next);
      pushToast('Đã lưu mẫu prompt ghi âm', 'success');
    },
  });

  if (isLoading || !draft) return <p className="text-sm text-tr-muted">Đang tải mẫu prompt…</p>;

  const dirty = loaded ? JSON.stringify(draft) !== JSON.stringify(loaded) : false;
  const invalid = draft.some((item) => !item.name.trim() || !item.prompt.trim());

  const patch = (index: number, next: Partial<VoicePromptTemplate>) =>
    setDraft(draft.map((item, i) => (i === index ? { ...item, ...next } : item)));

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Mic size={16} className="text-tr-primary" /> Mẫu prompt cho ghi âm
        </span>
      }
    >
      <p className="mb-4 text-sm text-tr-subtle">
        Áp dụng khi chuyển ghi âm thành văn bản trong Ghi chú hoặc Ghi chú nhanh: chọn "Chuyển
        nguyên văn" hoặc một trong các mẫu tóm tắt dưới đây.
      </p>
      <FormError error={error ?? save.error} />

      <ul className="space-y-3">
        {draft.map((item, index) => (
          <li key={item.key} className="rounded-panel border border-tr-border bg-tr-list p-3">
            <div className="flex items-start gap-2">
              <div className="flex-1 space-y-2">
                <Field label="Tên mẫu">
                  <Input
                    value={item.name}
                    onChange={(event) => patch(index, { name: event.target.value })}
                    placeholder="Tóm tắt cuộc họp"
                  />
                </Field>
                <Field label="Nội dung prompt" hint="Chỉ dẫn cho AI xử lý bản ghi âm theo mẫu này.">
                  <Textarea
                    value={item.prompt}
                    onChange={(event) => patch(index, { prompt: event.target.value })}
                    rows={3}
                    placeholder="Tóm tắt nội dung ghi âm thành các gạch đầu dòng chính…"
                  />
                </Field>
              </div>
              <button
                type="button"
                onClick={() => setDraft(draft.filter((_, i) => i !== index))}
                aria-label={`Xóa mẫu ${item.name || index + 1}`}
                className={`shrink-0 rounded p-1.5 text-tr-muted transition hover:text-tr-danger ${focusRing}`}
              >
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center gap-2 border-t border-tr-border pt-3">
        <Button
          onClick={() => {
            const key = slugifyKey('mau moi', new Set(draft.map((item) => item.key)));
            setDraft([...draft, { key, name: '', prompt: '' }]);
          }}
        >
          <Plus size={15} aria-hidden="true" /> Thêm mẫu
        </Button>
        <span className="flex-1" />
        <Button
          variant="primary"
          disabled={save.isPending || !dirty || invalid}
          onClick={() => save.mutate()}
        >
          {save.isPending ? 'Đang lưu…' : 'Lưu cấu hình'}
        </Button>
      </div>
      {invalid && (
        <p className="mt-2 text-xs text-tr-danger">
          Còn mẫu thiếu tên hoặc nội dung — điền đầy đủ hoặc xóa mẫu đó trước khi lưu.
        </p>
      )}
    </Panel>
  );
}

export function AiSettings() {
  const {
    data: providers = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['ai-providers'],
    queryFn: () => api.get<AiProviderConfig[]>('/api/ai/providers'),
  });

  return (
    <div className="space-y-4">
      <Panel
        title={
          <span className="flex items-center gap-2">
            <Bot size={16} className="text-tr-primary" /> Trợ lý AI đa nhà cung cấp
          </span>
        }
      >
        <p className="mb-4 text-sm text-tr-subtle">
          API key chỉ được gửi đến backend và mã hóa tại máy chủ. Model được đọc trực tiếp từ
          Gemini, Claude hoặc DeepSeek; hệ thống tự chọn theo tác vụ và chuyển nhà cung cấp khi lỗi.
        </p>
        {isLoading && <p className="text-sm text-tr-muted">Đang tải cấu hình AI…</p>}
        <FormError error={error} />
        <div className="space-y-3">
          {providers.map((provider) => (
            <ProviderEditor key={provider.provider} config={provider} />
          ))}
        </div>
      </Panel>

      <VoicePromptTemplatesSettings />
    </div>
  );
}
