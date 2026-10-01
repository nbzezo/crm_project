import { useEffect, useRef, useState } from 'react';
import { ExternalLink, TriangleAlert } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { api } from '../../api/client';
import { Button, Field, FormError, Input, Panel, Segmented, Select } from '../common/ui';
import { t } from '../../i18n/vi';
import { formatDateTime } from '../../lib/format';
import { useUiStore } from '../../stores/uiStore';
import { detectProvider, EMAIL_PROVIDERS, type EmailProviderId } from './emailProviders';
import { GoogleMailConnect } from './GoogleMailConnect';

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
  /** `google`: gui qua Gmail API bang tai khoan da dang nhap qua trinh duyet. */
  auth_type: 'password' | 'google';
  google_client_id: string;
  has_google_client_secret: boolean;
  google_account: string;
  /** Do may chu tinh — phai trung tung ky tu voi dong khai bao o Google Cloud. */
  google_redirect_uri: string;
}

type Draft = Omit<
  EmailConfig,
  | 'has_password'
  | 'ready'
  | 'last_test_at'
  | 'last_error'
  | 'has_google_client_secret'
  | 'google_account'
  | 'google_redirect_uri'
> & {
  password: string;
  google_client_secret: string;
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
  auth_type: 'password',
  google_client_id: '',
  google_client_secret: '',
};

export function EmailSettings() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [testTo, setTestTo] = useState('');
  const [params, setParams] = useSearchParams();

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
      has_google_client_secret: _hs,
      google_account: _ga,
      google_redirect_uri: _gr,
      ...rest
    } = config.data;
    setDraft({ ...rest, password: '', google_client_secret: '' });
  }, [config.data]);

  /* Quay ve tu trang dang nhap Google: bao ket qua mot lan roi xoa tham so khoi
     URL, de F5 khong bao lai. */
  const handledReturn = useRef<string | null>(null);
  useEffect(() => {
    const connected = params.get('google');
    const failure = params.get('google_error');
    if (!connected && !failure) return;
    /* StrictMode chay effect hai lan truoc khi URL kip doi — chi bao mot lan. */
    const key = `${connected}|${failure}`;
    if (handledReturn.current === key) return;
    handledReturn.current = key;
    if (connected) pushToast(t.emailSettings.googleConnectedToast, 'success');
    if (failure) pushToast(failure, 'error');
    const next = new URLSearchParams(params);
    next.delete('google');
    next.delete('google_error');
    setParams(next, { replace: true });
    void queryClient.invalidateQueries({ queryKey: ['email', 'config'] });
  }, [params, setParams, pushToast, queryClient]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  /* Dang nhap Google chi co voi Gmail — host khong con y nghia o che do do. */
  const providerId: EmailProviderId =
    draft.auth_type === 'google' ? 'gmail' : detectProvider(draft.host);
  const provider = EMAIL_PROVIDERS.find((row) => row.id === providerId) ?? null;
  /* "Tuy chinh" la mot lua chon tuong minh: bam vao thi mo khoa o host ma khong
     xoa gi — nguoi dung sua tiep tu cau hinh dang co. */
  const [customMode, setCustomMode] = useState(false);
  const activeProvider: EmailProviderId = customMode ? 'custom' : providerId;

  const chooseProvider = (id: EmailProviderId) => {
    if (id === 'custom') {
      setCustomMode(true);
      set('auth_type', 'password');
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
      /* Gmail mac dinh dang nhap bang Google; nha cung cap khac chi co mat khau. */
      auth_type: id === 'gmail' ? 'google' : 'password',
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

  const saveDraft = () =>
    api.put<EmailConfig>('/api/email/config', {
      ...draft,
      /* Chuoi rong nghia la "khong doi", khong phai "xoa" — xoa co nut rieng. */
      password: draft.password || undefined,
      google_client_secret: draft.google_client_secret || undefined,
    });

  const save = useMutation({
    mutationFn: saveDraft,
    onSuccess: (data) => {
      queryClient.setQueryData(['email', 'config'], data);
      pushToast(t.emailSettings.saveOk, 'success');
    },
  });

  /* Luu truoc roi moi roi trang: Client ID vua go phai nam trong CSDL thi may chu
     moi dung duoc trang dang nhap. */
  const connectGoogle = useMutation({
    mutationFn: saveDraft,
    onSuccess: () => window.location.assign('/api/email/oauth/google/start'),
  });

  const disconnectGoogle = useMutation({
    mutationFn: () => api.post<EmailConfig>('/api/email/oauth/google/disconnect', {}),
    onSuccess: (data) => {
      queryClient.setQueryData(['email', 'config'], data);
      pushToast(t.emailSettings.googleDisconnected, 'success');
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
  const googleMode = draft.auth_type === 'google';

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
        error={
          save.error ??
          connectGoogle.error ??
          disconnectGoogle.error ??
          testConnection.error ??
          sendTest.error ??
          clearPassword.error
        }
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

        {activeProvider === 'gmail' ? (
          <div>
            <p className="mb-1 text-xs font-semibold text-tr-subtle">
              {t.emailSettings.authMethod}
            </p>
            <Segmented
              label={t.emailSettings.authMethod}
              value={draft.auth_type}
              onChange={(value) => set('auth_type', value)}
              options={[
                { value: 'google', label: t.emailSettings.authGoogle },
                { value: 'password', label: t.emailSettings.authAppPassword },
              ]}
            />
          </div>
        ) : null}

        {googleMode ? (
          <GoogleMailConnect
            redirectUri={saved?.google_redirect_uri ?? ''}
            appBaseUrlSet={Boolean(saved?.app_base_url)}
            clientId={draft.google_client_id}
            onClientIdChange={(value) => set('google_client_id', value)}
            clientSecret={draft.google_client_secret}
            onClientSecretChange={(value) => set('google_client_secret', value)}
            hasSavedSecret={Boolean(saved?.has_google_client_secret)}
            account={saved?.google_account ?? ''}
            connecting={connectGoogle.isPending}
            onConnect={() => connectGoogle.mutate()}
            disconnecting={disconnectGoogle.isPending}
            onDisconnect={() => disconnectGoogle.mutate()}
          />
        ) : null}

        {provider && activeProvider !== 'custom' && !googleMode ? (
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

        {googleMode ? null : (
          <>
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
          </>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t.emailSettings.fromName}>
            <Input value={draft.from_name} onChange={(e) => set('from_name', e.target.value)} />
          </Field>
          <Field label={t.emailSettings.fromEmail} required>
            <Input
              type="email"
              readOnly={googleMode}
              title={googleMode ? t.emailSettings.googleFromHint : undefined}
              value={googleMode ? saved?.google_account || draft.from_email : draft.from_email}
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
            disabled={
              testConnection.isPending ||
              (saved?.auth_type === 'google' ? !saved.google_account : !saved?.host)
            }
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
