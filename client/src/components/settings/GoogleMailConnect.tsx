import { useState } from 'react';
import { CheckCircle2, ExternalLink } from 'lucide-react';
import { Button, Field, Input } from '../common/ui';
import { t } from '../../i18n/vi';

/*
 * Phan "Dang nhap bang Google" cua man Email.
 *
 * Nut dang nhap la mot DIEU HUONG cua trinh duyet (khong phai fetch): may chu tra
 * redirect sang trang dong y cua Google, Google tra ve callback, callback tra ve
 * lai man nay kem `?google=connected` hoac `?google_error=...` (xem
 * routes/email.ts). Vi vay trang hien tai se roi di — luu cau hinh truoc da.
 */

export function GoogleMailConnect({
  redirectUri,
  appBaseUrlSet,
  clientId,
  onClientIdChange,
  clientSecret,
  onClientSecretChange,
  hasSavedSecret,
  account,
  connecting,
  onConnect,
  disconnecting,
  onDisconnect,
}: {
  redirectUri: string;
  appBaseUrlSet: boolean;
  clientId: string;
  onClientIdChange: (value: string) => void;
  clientSecret: string;
  onClientSecretChange: (value: string) => void;
  hasSavedSecret: boolean;
  account: string;
  connecting: boolean;
  onConnect: () => void;
  disconnecting: boolean;
  onDisconnect: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const canConnect = Boolean(clientId.trim() && (clientSecret.trim() || hasSavedSecret));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(redirectUri);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Trinh duyet chan clipboard (http, iframe): o van chon duoc de copy tay. */
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-control border border-tr-border bg-tr-surface p-3 text-sm">
        {account ? (
          <div className="flex flex-wrap items-center gap-2">
            <CheckCircle2 size={16} className="text-tr-success" aria-hidden />
            <span className="text-tr-text">
              {t.emailSettings.googleConnectedAs.replace('{account}', account)}
            </span>
          </div>
        ) : (
          <p className="text-tr-subtle">{t.emailSettings.googleNotConnected}</p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            variant={account ? 'secondary' : 'primary'}
            disabled={!canConnect || connecting}
            onClick={onConnect}
          >
            {account ? t.emailSettings.googleReconnect : t.emailSettings.googleConnect}
          </Button>
          {account ? (
            <Button variant="secondary" disabled={disconnecting} onClick={onDisconnect}>
              {t.emailSettings.googleDisconnect}
            </Button>
          ) : null}
        </div>
      </div>

      <details
        className="rounded-control border border-tr-border p-3 text-sm"
        open={!account || undefined}
      >
        <summary className="cursor-pointer font-medium text-tr-text">
          {t.emailSettings.googleIntro}
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-tr-subtle">
          {t.emailSettings.googleSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <a
          href="https://console.cloud.google.com/apis/credentials"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-tr-primary hover:underline"
        >
          {t.emailSettings.googleConsoleLink}
          <ExternalLink size={12} aria-hidden />
        </a>
      </details>

      <div>
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Field label={t.emailSettings.googleRedirectUri}>
              <Input readOnly value={redirectUri} onFocus={(e) => e.currentTarget.select()} />
            </Field>
          </div>
          <Button variant="secondary" onClick={() => void copy()}>
            {copied ? t.emailSettings.copied : t.emailSettings.copy}
          </Button>
        </div>
        {appBaseUrlSet ? null : (
          <p className="mt-1 text-xs text-tr-warning">{t.emailSettings.googleRedirectWarn}</p>
        )}
      </div>

      <Field label={t.emailSettings.googleClientId} required>
        <Input
          autoComplete="off"
          placeholder="1234567890-abc.apps.googleusercontent.com"
          value={clientId}
          onChange={(e) => onClientIdChange(e.target.value)}
        />
      </Field>
      <Field
        label={t.emailSettings.googleClientSecret}
        required={!hasSavedSecret}
        hint={hasSavedSecret ? t.emailSettings.googleSecretSaved : undefined}
      >
        <Input
          type="password"
          autoComplete="new-password"
          value={clientSecret}
          onChange={(e) => onClientSecretChange(e.target.value)}
        />
      </Field>
    </div>
  );
}
