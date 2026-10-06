import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  CheckCircle2,
  Globe,
  KeyRound,
  Mic,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { api } from '../../api/client';
import type { AiProviderConfig, VoiceModelSetting, VoicePromptTemplate } from '../../ai/types';
import { Button, Field, FormError, Input, Panel, Select, Textarea, focusRing } from '../common/ui';
import { useUiStore } from '../../stores/uiStore';
import { ChevronDown } from 'lucide-react';
import { SaveBar, StatusBadge, TechDetails, Toggle } from '../settings/SettingsKit';
import { useSettingsDirty } from '../settings/settingsDirty';

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
  const [open, setOpen] = useState(config.status !== 'ready');
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
      return Boolean(apiKey || config.has_api_key);
    },
    onSuccess: (hasKey) => {
      setApiKey('');
      pushToast(`Đã lưu cấu hình ${config.display_name}`, 'success');
      /* Luu va nhan dien model la hai buoc rieng: luu thanh cong ma nhan dien
         loi thi loi do hien rieng, khong lam nguoi dung tuong chua luu duoc. */
      if (hasKey) sync.mutate();
      else void refresh();
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
  const dirty =
    baseUrl !== config.base_url ||
    apiKey !== '' ||
    enabled !== config.enabled ||
    defaultModel !== (config.default_model ?? '') ||
    fastModel !== (config.fast_model ?? '') ||
    reasoningModel !== (config.reasoning_model ?? '') ||
    tokenLimit !== String(config.daily_token_limit) ||
    costLimit !==
      (config.daily_cost_limit_usd === null ? '' : String(config.daily_cost_limit_usd)) ||
    inputPrice !==
      (config.input_cost_per_million_usd === null
        ? ''
        : String(config.input_cost_per_million_usd)) ||
    outputPrice !==
      (config.output_cost_per_million_usd === null
        ? ''
        : String(config.output_cost_per_million_usd));
  useSettingsDirty(`ai-${config.provider}`, dirty, `AI · ${config.display_name}`, () =>
    save.mutateAsync()
  );
  const statusIcon =
    config.status === 'ready' ? (
      <CheckCircle2 size={14} className="text-tr-success" />
    ) : config.status === 'error' ? (
      <TriangleAlert size={14} className="text-tr-danger" />
    ) : (
      <KeyRound size={14} className="text-tr-muted" />
    );

  return (
    <div className="rounded-panel border border-tr-border bg-tr-list">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`flex min-h-11 w-full flex-wrap items-center gap-3 rounded-panel p-4 text-left ${focusRing}`}
      >
        <Bot size={16} className="text-tr-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-tr-text">{config.display_name}</span>
          <span className="flex items-center gap-1.5 text-xs text-tr-muted">
            {statusIcon}
            {config.status === 'ready'
              ? `${models.length} model sẵn sàng${config.api_key_hint ? ` · ${config.api_key_hint}` : ''}`
              : config.status === 'error'
                ? config.last_error || 'Kết nối lỗi'
                : 'Chưa cấu hình'}
          </span>
        </span>
        {!config.enabled ? (
          <StatusBadge tone="off">Đang tắt</StatusBadge>
        ) : config.status === 'ready' ? (
          <StatusBadge tone="ok">Sẵn sàng</StatusBadge>
        ) : config.status === 'error' ? (
          <StatusBadge tone="error">Lỗi</StatusBadge>
        ) : (
          <StatusBadge tone="warn">Chưa cấu hình</StatusBadge>
        )}
        {dirty && <span className="text-xs font-medium text-tr-warning">Chưa lưu</span>}
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`text-tr-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="border-t border-tr-border p-4">
          <Toggle
            checked={enabled}
            onChange={setEnabled}
            label="Kích hoạt nhà cung cấp này"
            description="Tắt thì hệ thống không gọi tới nhà cung cấp này, kể cả khi dự phòng."
          />
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Field label="API Base URL">
              <Input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
            </Field>
            <Field
              label="API key"
              hint={
                config.has_api_key
                  ? `Đã lưu ${config.api_key_hint}; để trống để giữ nguyên`
                  : undefined
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
            <ModelField
              label="Model nhanh"
              value={fastModel}
              onChange={setFastModel}
              models={models}
            />
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

          {config.provider === '9router' && (
            <div className="mt-3">
              <TechDetails>
                <p className="leading-relaxed">
                  Mặc định dùng 9Router cục bộ tại <code>http://127.0.0.1:20128/v1</code>. Nếu dùng
                  9Router Cloud, đổi Base URL thành <code>https://9router.com/v1</code> rồi nhập API
                  key từ Dashboard 9Router. Khi WorkFlow chạy bằng Docker và 9Router chạy trên máy
                  chủ, dùng
                  <code> http://host.docker.internal:20128/v1</code>.
                </p>
              </TechDetails>
            </div>
          )}

          <FormError error={save.error} />
          {sync.error && (
            <p className="mt-2 text-xs text-tr-danger">
              Đã lưu, nhưng nhận diện model lỗi: {(sync.error as Error).message}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="primary"
              disabled={!dirty || save.isPending}
              onClick={() => save.mutate()}
            >
              <ShieldCheck size={15} aria-hidden="true" />{' '}
              {save.isPending ? 'Đang lưu…' : 'Lưu thay đổi'}
            </Button>
            <Button
              disabled={!config.has_api_key || sync.isPending || dirty}
              title={dirty ? 'Lưu thay đổi trước' : undefined}
              onClick={() => sync.mutate()}
            >
              <RefreshCw
                size={15}
                className={sync.isPending ? 'animate-spin' : ''}
                aria-hidden="true"
              />
              {sync.isPending ? 'Đang nhận diện…' : 'Kiểm tra & nhận diện model'}
            </Button>
          </div>
        </div>
      )}
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

/**
 * Chon model chuyen ghi am -> van ban.
 *
 * Tach khoi ba o model cua tung nha cung cap vi day la lua chon theo TAC VU chu
 * khong theo nha cung cap: chi mot so model doc duoc audio, va khi chon tay thi
 * backend ghim cung dung model do thay vi fallback sang model khong doc duoc
 * (nguyen nhan cu cua loi 502 "khong doc duoc tep dinh kem").
 */
function VoiceModelSettings({ providers }: { providers: AiProviderConfig[] }) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);

  const { data, isLoading, error } = useQuery({
    queryKey: ['ai-voice-model'],
    queryFn: () => api.get<VoiceModelSetting>('/api/ai/voice-model'),
  });

  const [choice, setChoice] = useState<string | null>(null);
  const saved = data?.provider && data.model ? `${data.provider}::${data.model}` : '';
  const value = choice ?? saved;

  const save = useMutation({
    mutationFn: () => {
      // Tach o dau '::' DAU TIEN: model_id cua vai nha cung cap co dau ':' ben trong.
      const cut = value.indexOf('::');
      const body =
        cut > 0
          ? { provider: value.slice(0, cut), model: value.slice(cut + 2) }
          : { provider: null, model: null };
      return api.put<VoiceModelSetting>('/api/ai/voice-model', body);
    },
    onSuccess: (next) => {
      queryClient.setQueryData(['ai-voice-model'], next);
      setChoice(null);
      pushToast('Đã lưu model cho ghi âm', 'success');
    },
  });

  const options = providers.flatMap((provider) =>
    provider.models
      .filter((model) => model.is_available)
      .map((model) => ({
        key: `${provider.provider}::${model.model_id}`,
        label: `${provider.display_name} · ${model.display_name}`,
        audio: Boolean(model.capabilities.audioInput),
      }))
  );
  const selected = options.find((option) => option.key === value);

  return (
    <div className="rounded-panel border border-tr-border bg-tr-list p-3">
      <FormError error={error ?? save.error} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[260px] flex-1">
          <Field
            label="Model chuyển ghi âm thành văn bản"
            hint="Để trống là tự động chọn nhà cung cấp đầu tiên đọc được audio."
          >
            <Select
              value={value}
              disabled={isLoading}
              onChange={(event) => setChoice(event.target.value)}
            >
              <option value="">— tự động —</option>
              {options.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                  {option.audio ? ' · audio' : ''}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Button
          variant="primary"
          disabled={save.isPending || isLoading || value === saved}
          onClick={() => save.mutate()}
        >
          {save.isPending ? 'Đang lưu…' : 'Lưu model'}
        </Button>
      </div>
      {selected && !selected.audio && (
        <p className="mt-2 text-xs text-tr-warning">
          Model này không được đánh dấu đọc được audio. Vẫn dùng được nếu nhà cung cấp hỗ trợ, nhưng
          nếu chuyển ghi âm báo lỗi thì hãy đổi sang model có nhãn “audio”.
        </p>
      )}
      {options.length === 0 && (
        <p className="mt-2 text-xs text-tr-muted">
          Chưa có model nào — bấm “Đồng bộ model” ở nhà cung cấp phía trên trước.
        </p>
      )}
    </div>
  );
}

function VoicePromptTemplatesSettings({ providers }: { providers: AiProviderConfig[] }) {
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
          <Mic size={16} className="text-tr-primary" /> Ghi âm → văn bản
        </span>
      }
    >
      <p className="mb-4 text-sm text-tr-subtle">
        Áp dụng khi chuyển ghi âm thành văn bản trong Ghi chú hoặc Ghi chú nhanh: chọn "Chuyển
        nguyên văn" hoặc một trong các mẫu tóm tắt dưới đây.
      </p>
      <FormError error={error ?? save.error} />

      <div className="mb-4">
        <VoiceModelSettings providers={providers} />
      </div>

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

      <div className="mt-3 border-t border-tr-border pt-3">
        <Button
          onClick={() => {
            const key = slugifyKey('mau moi', new Set(draft.map((item) => item.key)));
            setDraft([...draft, { key, name: '', prompt: '' }]);
          }}
        >
          <Plus size={15} aria-hidden="true" /> Thêm mẫu
        </Button>
      </div>
      <SaveBar
        dirty={dirty}
        saving={save.isPending}
        disabled={invalid}
        problem={invalid ? 'Còn mẫu thiếu tên hoặc nội dung — điền đầy đủ hoặc xoá mẫu đó.' : null}
        onSave={() => save.mutate()}
        onReset={() => loaded && setDraft(structuredClone(loaded))}
      />
    </Panel>
  );
}

/**
 * Tim web qua 9Router.
 *
 * Gemini va Claude co cong cu tim web rieng nen khong can cau hinh gi. 9Router thi
 * khong: /chat/completions khong tim web, ung dung phai tu goi /v1/search truoc
 * bang mot model tim kiem (Tavily, Brave, SearXNG...) — model chat Gemini trong
 * 9Router KHONG dung cho viec nay.
 */
function WebSearchSettings({ providers }: { providers: AiProviderConfig[] }) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);
  const nineRouter = providers.find((provider) => provider.provider === '9router');
  const ready = Boolean(nineRouter?.enabled && nineRouter.has_api_key);

  const saved = useQuery({
    queryKey: ['ai-web-search-model'],
    queryFn: () => api.get<{ model: string | null }>('/api/ai/web-search-model'),
  });
  const models = useQuery({
    queryKey: ['ai-web-search-models'],
    queryFn: () => api.get<string[]>('/api/ai/web-search-models'),
    enabled: ready,
    retry: false,
  });

  const [choice, setChoice] = useState<string | null>(null);
  const current = saved.data?.model ?? '';
  const value = choice ?? current;
  const options = [...new Set([...(models.data ?? []), ...(current ? [current] : [])])];

  const save = useMutation({
    mutationFn: () =>
      api.put<{ model: string | null }>('/api/ai/web-search-model', { model: value || null }),
    onSuccess: (next) => {
      queryClient.setQueryData(['ai-web-search-model'], next);
      setChoice(null);
      pushToast('Đã lưu model tìm kiếm web', 'success');
    },
  });

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Globe size={16} className="text-tr-primary" /> Tìm kiếm web
        </span>
      }
    >
      <p className="mb-4 text-sm text-tr-subtle">
        Gemini và Claude tự tìm trên web khi được phép (vd. tra cứu khách hàng). Với 9Router, chọn
        một model tìm kiếm để hệ thống tìm trước rồi gửi kết quả cho AI. Model chat (kể cả Gemini
        trong 9Router) không dùng được ở đây — cần bật nhà cung cấp tìm kiếm như Tavily, Brave,
        Serper hoặc SearXNG trong 9Router.
      </p>
      <FormError error={saved.error ?? save.error} />
      {!ready ? (
        <p className="text-xs text-tr-muted">
          Bật 9Router và nhập API key ở phía trên để chọn model tìm kiếm.
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[260px] flex-1">
            <Field label="Model tìm kiếm của 9Router" hint="Để trống là không tìm web qua 9Router.">
              <Select
                value={value}
                disabled={saved.isLoading || models.isLoading}
                onChange={(event) => setChoice(event.target.value)}
              >
                <option value="">— không tìm web —</option>
                {options.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Button
            variant="primary"
            disabled={save.isPending || value === current}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Đang lưu…' : 'Lưu model'}
          </Button>
        </div>
      )}
      {ready && models.error && (
        <p className="mt-2 text-xs text-tr-warning">
          Không đọc được danh sách model tìm kiếm từ 9Router: {(models.error as Error).message}
        </p>
      )}
      {ready && models.data?.length === 0 && (
        <p className="mt-2 text-xs text-tr-warning">
          9Router chưa có model tìm kiếm nào — hãy bật một nhà cung cấp tìm kiếm trong 9Router.
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
          Gemini, Claude, DeepSeek hoặc 9Router; hệ thống tự chọn theo tác vụ và chuyển nhà cung cấp
          khi lỗi.
        </p>
        {isLoading && <p className="text-sm text-tr-muted">Đang tải cấu hình AI…</p>}
        <FormError error={error} />
        <div className="space-y-3">
          {providers.map((provider) => (
            <ProviderEditor key={provider.provider} config={provider} />
          ))}
        </div>
      </Panel>

      <WebSearchSettings providers={providers} />

      <VoicePromptTemplatesSettings providers={providers} />
    </div>
  );
}
