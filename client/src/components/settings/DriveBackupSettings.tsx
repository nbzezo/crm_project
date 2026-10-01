import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, CloudUpload, ExternalLink, TriangleAlert } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { api } from '../../api/client';
import { Button, Field, FormError, Input, Panel, Select } from '../common/ui';
import { formatBytes } from '../crm/DocumentUpload';
import { t } from '../../i18n/vi';
import { formatDateTime } from '../../lib/format';
import { useUiStore } from '../../stores/uiStore';

/*
 * Sao luu CSDL va tep tai len ra Google Drive (v49).
 *
 * Nut dang nhap la mot DIEU HUONG cua trinh duyet (xem routes/driveBackup.ts):
 * sang trang dong y cua Google roi quay ve man nay kem `?drive=connected` hoac
 * `?drive_error=...`. Vi vay trang se roi di — luu Client ID / Secret truoc da.
 *
 * Chay sao luu la viec NEN: may chu tra ngay va man nay hoi lai trang thai
 * `running` cho toi khi xong.
 */

interface DriveConfig {
  enabled: boolean;
  interval_hours: number;
  keep_db_count: number;
  google_client_id: string;
  has_google_client_secret: boolean;
  google_account: string;
  connected: boolean;
  folder_url: string | null;
  next_run_at: string | null;
  last_run_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  last_db_name: string | null;
  last_db_size: number | null;
  last_files_uploaded: number | null;
  last_files_failed: number | null;
  running: boolean;
  last_restore: { restored: number; failed: number; notBackedUp: number } | null;
  tracked_files: number;
  pending_files: number;
  missing_on_disk: number;
  missing_restorable: number;
  email_client_available: boolean;
  google_redirect_uri: string;
  app_base_url_set: boolean;
}

const QUERY_KEY = ['drive-backup', 'config'];

export function DriveBackupSettings() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const [params, setParams] = useSearchParams();
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [intervalHours, setIntervalHours] = useState(24);
  const [keepDbCount, setKeepDbCount] = useState(14);
  const [copied, setCopied] = useState(false);

  const config = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => api.get<DriveConfig>('/api/drive-backup/config'),
    /* Dang chay nen thi hoi lai de thay luc xong; ranh thi thoi. */
    refetchInterval: (query) => (query.state.data?.running ? 3000 : false),
  });
  const saved = config.data;

  useEffect(() => {
    if (!saved) return;
    setClientId(saved.google_client_id);
    setEnabled(saved.enabled);
    setIntervalHours(saved.interval_hours);
    setKeepDbCount(saved.keep_db_count);
  }, [saved]);

  /* Quay ve tu trang dang nhap Google: bao ket qua mot lan roi xoa tham so khoi URL. */
  const handledReturn = useRef<string | null>(null);
  useEffect(() => {
    const connected = params.get('drive');
    const failure = params.get('drive_error');
    if (!connected && !failure) return;
    const key = `${connected}|${failure}`;
    if (handledReturn.current === key) return;
    handledReturn.current = key;
    if (connected) pushToast(t.driveBackup.connectedToast, 'success');
    if (failure) pushToast(failure, 'error');
    const next = new URLSearchParams(params);
    next.delete('drive');
    next.delete('drive_error');
    setParams(next, { replace: true });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }, [params, setParams, pushToast, queryClient]);

  const setConfig = (data: DriveConfig) => queryClient.setQueryData(QUERY_KEY, data);

  const settingsBody = () => ({
    enabled,
    interval_hours: intervalHours,
    keep_db_count: keepDbCount,
    google_client_id: clientId.trim(),
    google_client_secret: clientSecret || undefined,
  });

  const save = useMutation({
    mutationFn: () => api.put<DriveConfig>('/api/drive-backup/config', settingsBody()),
    onSuccess: (data) => {
      setConfig(data);
      setClientSecret('');
      pushToast(t.driveBackup.saved, 'success');
    },
  });

  /* Chi luu Client; cac thiet lap lich giu nguyen ban da luu de bam "Dang nhap"
     khong am tham doi lich. */
  const connect = useMutation({
    mutationFn: () =>
      api.put<DriveConfig>('/api/drive-backup/config', {
        google_client_id: clientId.trim(),
        google_client_secret: clientSecret || undefined,
      }),
    onSuccess: () => window.location.assign('/api/drive-backup/oauth/start'),
  });

  const reuseEmailClient = useMutation({
    mutationFn: () =>
      api.put<DriveConfig>('/api/drive-backup/config', { copy_client_from_email: true }),
    onSuccess: (data) => {
      setConfig(data);
      setClientSecret('');
    },
  });

  const disconnect = useMutation({
    mutationFn: () => api.post<DriveConfig>('/api/drive-backup/disconnect', {}),
    onSuccess: (data) => {
      setConfig(data);
      pushToast(t.driveBackup.disconnected, 'success');
    },
  });

  const run = useMutation({
    mutationFn: () => api.post<DriveConfig>('/api/drive-backup/run', {}),
    onSuccess: (data) => {
      setConfig(data);
      pushToast(t.driveBackup.runStarted, 'success');
    },
  });

  const restore = useMutation({
    mutationFn: () => api.post<DriveConfig>('/api/drive-backup/restore-missing', {}),
    onSuccess: (data) => setConfig(data),
  });

  /* Bao ket qua khoi phuc khi no vua xong. Lan tai dau tien chi ghi nho gia tri
     dang co: mo trang khong duoc bao lai ket qua cua mot lan khoi phuc tu truoc. */
  const restoreSeen = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!saved) return;
    const current = saved.last_restore ? JSON.stringify(saved.last_restore) : null;
    if (restoreSeen.current === undefined) {
      restoreSeen.current = current;
      return;
    }
    if (current && current !== restoreSeen.current && saved.last_restore) {
      pushToast(
        t.driveBackup.restoreDone
          .replace('{restored}', String(saved.last_restore.restored))
          .replace('{failed}', String(saved.last_restore.failed))
          .replace('{none}', String(saved.last_restore.notBackedUp)),
        'success'
      );
    }
    restoreSeen.current = current;
  }, [saved, pushToast]);

  const copyRedirect = async () => {
    try {
      await navigator.clipboard.writeText(saved?.google_redirect_uri ?? '');
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Trinh duyet chan clipboard: o van chon duoc de copy tay. */
    }
  };

  if (!saved) return null;

  const canConnect = Boolean(
    clientId.trim() && (clientSecret.trim() || saved.has_google_client_secret)
  );
  const unrecoverable = saved.missing_on_disk - saved.missing_restorable;
  const busy = saved.running || run.isPending || restore.isPending;

  return (
    <Panel title={t.driveBackup.title}>
      <p className="mb-2 text-sm text-tr-subtle">{t.driveBackup.intro}</p>
      <p className="mb-4 flex gap-1.5 text-xs text-tr-warning">
        <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
        {t.driveBackup.privacy}
      </p>

      <FormError
        error={
          save.error ??
          connect.error ??
          reuseEmailClient.error ??
          disconnect.error ??
          run.error ??
          restore.error
        }
      />

      {saved.last_error ? (
        <p className="mb-4 flex items-start gap-1.5 text-xs text-tr-danger">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
          {saved.last_error}
        </p>
      ) : null}

      <div className="max-w-xl space-y-3">
        <div className="rounded-control border border-tr-border bg-tr-surface p-3 text-sm">
          {saved.connected ? (
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <CheckCircle2 size={16} className="text-tr-success" aria-hidden />
                <span className="text-tr-text">
                  {t.driveBackup.connectedAs.replace('{account}', saved.google_account)}
                </span>
              </div>
              {saved.folder_url ? (
                <a
                  href={saved.folder_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-tr-primary hover:underline"
                >
                  {t.driveBackup.openFolder}
                  <ExternalLink size={12} aria-hidden />
                </a>
              ) : null}
            </div>
          ) : (
            <p className="text-tr-subtle">{t.driveBackup.notConnected}</p>
          )}
        </div>

        {saved.connected ? (
          <>
            <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
              <dt className="text-tr-muted">{t.driveBackup.lastSuccess}</dt>
              <dd className="text-tr-text">
                {saved.last_success_at
                  ? formatDateTime(saved.last_success_at)
                  : t.driveBackup.never}
              </dd>
              {saved.last_db_name ? (
                <>
                  <dt className="text-tr-muted">{t.driveBackup.lastDb}</dt>
                  <dd className="text-tr-text">
                    {saved.last_db_name}
                    {saved.last_db_size != null ? ` · ${formatBytes(saved.last_db_size)}` : ''}
                  </dd>
                </>
              ) : null}
              {saved.last_files_uploaded != null ? (
                <>
                  <dt className="text-tr-muted">{t.driveBackup.lastFiles}</dt>
                  <dd className="text-tr-text">
                    {t.driveBackup.filesSummary
                      .replace('{uploaded}', String(saved.last_files_uploaded))
                      .replace('{failed}', String(saved.last_files_failed ?? 0))}
                    {' · '}
                    {t.driveBackup.onDrive.replace('{n}', String(saved.tracked_files))}
                    {saved.pending_files > 0
                      ? ` · ${t.driveBackup.pending.replace('{n}', String(saved.pending_files))}`
                      : ''}
                  </dd>
                </>
              ) : null}
              {saved.enabled && saved.next_run_at ? (
                <>
                  <dt className="text-tr-muted">{t.driveBackup.nextRun}</dt>
                  <dd className="text-tr-text">{formatDateTime(saved.next_run_at)}</dd>
                </>
              ) : null}
            </dl>

            <label className="flex items-center gap-2 text-sm text-tr-text">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              {t.driveBackup.enabled}
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t.driveBackup.interval}>
                <Select
                  value={intervalHours}
                  onChange={(e) => setIntervalHours(Number(e.target.value))}
                >
                  {t.driveBackup.intervals.map(([hours, label]) => (
                    <option key={hours} value={hours}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t.driveBackup.keepDb} hint={t.driveBackup.keepDbHint}>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={keepDbCount}
                  onChange={(e) => setKeepDbCount(Number(e.target.value))}
                />
              </Field>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>
                {save.isPending ? t.common.saving : t.driveBackup.save}
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => run.mutate()}>
                <CloudUpload size={15} aria-hidden />
                {saved.running ? t.driveBackup.running : t.driveBackup.runNow}
              </Button>
              <Button
                variant="secondary"
                disabled={disconnect.isPending || saved.running}
                onClick={() => disconnect.mutate()}
              >
                {t.driveBackup.disconnect}
              </Button>
            </div>

            {saved.missing_on_disk > 0 ? (
              <div className="rounded-control border border-tr-warning/40 bg-tr-surface p-3 text-sm">
                <p className="font-medium text-tr-text">{t.driveBackup.restoreTitle}</p>
                {saved.missing_restorable > 0 ? (
                  <p className="mt-1 text-tr-subtle">
                    {t.driveBackup.restoreHint.replace('{n}', String(saved.missing_restorable))}
                  </p>
                ) : null}
                {unrecoverable > 0 ? (
                  <p className="mt-1 text-tr-subtle">
                    {t.driveBackup.restoreNoBackup.replace('{n}', String(unrecoverable))}
                  </p>
                ) : null}
                {saved.missing_restorable > 0 ? (
                  <Button
                    className="mt-2"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => restore.mutate()}
                  >
                    {t.driveBackup.restore.replace('{n}', String(saved.missing_restorable))}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}

        <details
          className="rounded-control border border-tr-border p-3 text-sm"
          open={!saved.connected || undefined}
        >
          <summary className="cursor-pointer font-medium text-tr-text">
            {t.driveBackup.setupTitle}
          </summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-tr-subtle">
            {t.driveBackup.setupSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <a
            href="https://console.cloud.google.com/apis/library/drive.googleapis.com"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-tr-primary hover:underline"
          >
            Google Drive API
            <ExternalLink size={12} aria-hidden />
          </a>
        </details>

        <div>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Field label={t.driveBackup.redirectUri}>
                <Input
                  readOnly
                  value={saved.google_redirect_uri}
                  onFocus={(e) => e.currentTarget.select()}
                />
              </Field>
            </div>
            <Button variant="secondary" onClick={() => void copyRedirect()}>
              {copied ? t.emailSettings.copied : t.emailSettings.copy}
            </Button>
          </div>
          {saved.app_base_url_set ? null : (
            <p className="mt-1 text-xs text-tr-warning">{t.driveBackup.redirectWarn}</p>
          )}
        </div>

        {saved.email_client_available && !saved.has_google_client_secret ? (
          <Button
            variant="secondary"
            disabled={reuseEmailClient.isPending}
            onClick={() => reuseEmailClient.mutate()}
          >
            {t.driveBackup.reuseEmailClient}
          </Button>
        ) : null}

        <Field label={t.driveBackup.clientId} required>
          <Input
            autoComplete="off"
            placeholder="1234567890-abc.apps.googleusercontent.com"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          />
        </Field>
        <Field
          label={t.driveBackup.clientSecret}
          required={!saved.has_google_client_secret}
          hint={saved.has_google_client_secret ? t.driveBackup.secretSaved : undefined}
        >
          <Input
            type="password"
            autoComplete="new-password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
          />
        </Field>
        <Button
          variant={saved.connected ? 'secondary' : 'primary'}
          disabled={!canConnect || connect.isPending}
          onClick={() => connect.mutate()}
        >
          {saved.connected ? t.driveBackup.reconnect : t.driveBackup.connect}
        </Button>
      </div>
    </Panel>
  );
}
