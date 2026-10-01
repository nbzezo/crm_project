import { useEffect, useState } from 'react';
import { ExternalLink, TriangleAlert } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Button, Field, FormError, Input, Panel, Segmented, Select } from '../common/ui';
import { t } from '../../i18n/vi';
import { formatDateTime } from '../../lib/format';
import { useUiStore } from '../../stores/uiStore';
import { detectProvider, EMAIL_PROVIDERS, type EmailProviderId } from './emailProviders';

/**
 * Cau hinh SMTP. Cung khuon voi TelegramSettings: soan nhap vao state, bam luu
 * mot lan, mat khau chi di mot chieu (doc ra chi con co `has_password`).
 */
export interface EmailConfig {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  has_password: boolean;
  from_name: string;
  from_email: string;
  app_base_url: string;
  ready: boolean;
  last_test_at: string | null;
  last_error: string | null;
}

type Draft = Omit<EmailConfig, 'has_password' | 'ready' | 'last_test_at' | 'last_error'> & {
  password: string;
};

const EMPTY: Draft = {
  enabled: false,
  host: '',
  port: 587,
  secure: false,
  username: '',
  password: '',
  from_name: 'WorkFlow',
  from_email: '',
  app_base_url: '',
};

export function EmailSettings() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [testTo, setTestTo] = useState('');

  const config = useQuery({
    queryKey: ['email', 'config'],
    queryFn: () => api.get<EmailConfig>('/api/email/config'),
  });

  useEffect(() => {
    if (!config.data) return;
    const {
      has_password: _hp,
      ready: _r,
      last_test_at: _lt,
      last_error: _le,
      ...rest
    } = config.data;
    setDraft({ ...rest, password: '' });
  }, [config.data]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const providerId = detectProvider(draft.host);
  const provider = EMAIL_PROVIDERS.find((row) => row.id === providerId) ?? null;
  /* "Tuy chinh" la mot lua chon tuong minh: bam vao thi mo khoa o host ma khong
     xoa gi — nguoi dung sua tiep tu cau hinh dang co. */
  const [customMode, setCustomMode] = useState(false);
  const activeProvider: EmailProviderId = customMode ? 'custom' : providerId;

  const chooseProvider = (id: EmailProviderId) => {
    if (id === 'custom') {
      setCustomMode(true);
      return;
    }
    const preset = EMAIL_PROVIDERS.find((row) => row.id === id);
    if (!preset) return;
    setCustomMode(false);
    setDraft((prev) => ({
      ...prev,
      enabled: true,
      host: preset.host,
      port: preset.port,
      secure: preset.secure,
      /* Gmail / Microsoft dang nhap bang chinh dia chi hop thu. */
      username: prev.username || prev.from_email,
    }));
  };

  /* Voi mau co san, ten dang nhap di theo dia chi gui di cho toi khi nguoi dung
     tu sua no — hai o nay gan nhu luon trung nhau o Gmail / Microsoft. */
  const setFromEmail = (value: string) =>
    setDraft((prev) => ({
      ...prev,
      from_email: value,
      username:
        activeProvider !== 'custom' && (!prev.username || prev.username === prev.from_email)
          ? value
          : prev.username,
    }));

  const save = useMutation({
    mutationFn: () =>
      api.put<EmailConfig>('/api/email/config', {
        ...draft,
        /* Chuoi rong nghia la "khong doi", khong phai "xoa" — xoa co nut rieng. */
        password: draft.password || undefined,
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['email', 'config'], data);
      pushToast(t.emailSettings.saveOk, 'success');
    },
  });

  const clearPassword = useMutation({
    mutationFn: () => api.put<EmailConfig>('/api/email/config', { clear_password: true }),
    onSuccess: (data) => queryClient.setQueryData(['email', 'config'], data),
  });

  const testConnection = useMutation({
    mutationFn: () => api.post<EmailConfig>('/api/email/test', {}),
    onSuccess: (data) => {
      queryClient.setQueryData(['email', 'config'], data);
      pushToast(t.emailSettings.testOk, 'success');
    },
  });

  const sendTest = useMutation({
    mutationFn: () => api.post<EmailConfig>('/api/email/send-test', { to: testTo.trim() }),
    onSuccess: (data) => {
      queryClient.setQueryData(['email', 'config'], data);
      pushToast(t.emailSettings.sendTestOk, 'success');
    },
  });

  const saved = config.data;

  return (
    <Panel title={t.emailSettings.title}>
      <p className="mb-4 text-sm text-tr-subtle">{t.emailSettings.description}</p>

      {saved?.last_error ? (
        <p className="mb-4 flex items-center gap-1.5 text-xs text-tr-danger">
          <TriangleAlert size={14} aria-hidden />
          {saved.last_error}
        </p>
      ) : null}

      <FormError
        error={save.error ?? testConnection.error ?? sendTest.error ?? clearPassword.error}
      />

      <div className="max-w-xl space-y-3">
        <div>
          <p className="mb-1 text-xs font-semibold text-tr-subtle">{t.emailSettings.provider}</p>
          <Segmented
            label={t.emailSettings.provider}
            value={activeProvider}
            onChange={chooseProvider}
            options={[
              ...EMAIL_PROVIDERS.map((row) => ({ value: row.id, label: row.label })),
              { value: 'custom' as const, label: t.emailSettings.providerCustom },
            ]}
          />
        </div>

        {provider && activeProvider !== 'custom' ? (
          <div className="rounded-control border border-tr-border bg-tr-surface p-3 text-sm">
            <p className="mb-1 font-medium text-tr-text">
              {t.emailSettings.providerSteps.replace('{name}', provider.label)}
            </p>
            <ol className="list-decimal space-y-0.5 pl-5 text-tr-subtle">
              {provider.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <a
              href={provider.helpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-tr-primary hover:underline"
            >
              {provider.helpLabel}
              <ExternalLink size={12} aria-hidden />
            </a>
          </div>
        ) : null}

        <label className="flex items-center gap-2 text-sm text-tr-text">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => set('enabled', e.target.checked)}
          />
          {t.emailSettings.enabled}
        </label>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Field label={t.emailSettings.host} required>
            <Input
              value={draft.host}
              readOnly={activeProvider !== 'custom'}
              onChange={(e) => set('host', e.target.value)}
            />
          </Field>
          <Field label={t.emailSettings.port} required>
            <Input
              type="number"
              min={1}
              max={65535}
              className="sm:w-28"
              value={draft.port}
              onChange={(e) => set('port', Number(e.target.value))}
            />
          </Field>
        </div>

        <Field label={t.emailSettings.secure} hint={t.emailSettings.secureHint}>
          <Select
            value={draft.secure ? 'tls' : 'starttls'}
            onChange={(e) => set('secure', e.target.value === 'tls')}
          >
            <option value="starttls">STARTTLS (587)</option>
            <option value="tls">TLS (465)</option>
          </Select>
        </Field>

        <Field label={t.emailSettings.username}>
          <Input
            autoComplete="off"
            value={draft.username}
            onChange={(e) => set('username', e.target.value)}
          />
        </Field>

        <Field
          label={
            activeProvider === 'custom' ? t.emailSettings.password : t.emailSettings.appPassword
          }
          hint={saved?.has_password ? t.emailSettings.passwordSaved : undefined}
        >
          <Input
            type="password"
            autoComplete="new-password"
            value={draft.password}
            onChange={(e) => set('password', e.target.value)}
          />
        </Field>
        {saved?.has_password ? (
          <Button
            variant="secondary"
            disabled={clearPassword.isPending}
            onClick={() => clearPassword.mutate()}
          >
            {t.emailSettings.clearPassword}
          </Button>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t.emailSettings.fromName}>
            <Input value={draft.from_name} onChange={(e) => set('from_name', e.target.value)} />
          </Field>
          <Field label={t.emailSettings.fromEmail} required>
            <Input
              type="email"
              value={draft.from_email}
              onChange={(e) => setFromEmail(e.target.value)}
            />
          </Field>
        </div>

        <Field label={t.emailSettings.appBaseUrl} hint={t.emailSettings.appBaseUrlHint}>
          <Input
            placeholder="https://crm.congty.vn"
            value={draft.app_base_url}
            onChange={(e) => set('app_base_url', e.target.value)}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? t.common.saving : t.common.save}
          </Button>
          <Button
            variant="secondary"
            disabled={testConnection.isPending || !saved?.host}
            onClick={() => testConnection.mutate()}
          >
            {testConnection.isPending ? t.emailSettings.testing : t.emailSettings.test}
          </Button>
          <span className="text-xs text-tr-muted">
            {t.emailSettings.lastTest}:{' '}
            {saved?.last_test_at
              ? formatDateTime(saved.last_test_at)
              : t.emailSettings.notConfigured}
          </span>
        </div>

        <div className="flex flex-wrap items-end gap-2 border-t border-tr-border pt-3">
          <Field label={t.emailSettings.sendTestTo}>
            <Input
              type="email"
              className="sm:w-64"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
            />
          </Field>
          <Button
            variant="secondary"
            disabled={sendTest.isPending || !testTo.trim() || !saved?.ready}
            onClick={() => sendTest.mutate()}
          >
            {t.emailSettings.sendTest}
          </Button>
        </div>
      </div>
    </Panel>
  );
}
