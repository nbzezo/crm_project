import { useEffect, useState } from 'react';
import { Logo } from '../components/common/Logo';
import { Button, Field, FormError, Input } from '../components/common/ui';
import { t } from '../i18n/vi';
import { useAuthStore, type AuthUser } from '../stores/authStore';

/**
 * Dat mat khau tu lien ket trong thu — dung cho ca thu MOI tai khoan lan thu
 * QUEN mat khau. Hai truong hop chung mot form, chi khac tieu de.
 *
 * Render NGOAI AuthGate (xem AuthGate.tsx): nguoi mo lien ket nay theo dinh nghia
 * la chua dang nhap duoc, nen khong the nam sau mot cong doi dang nhap.
 *
 * Kiem tra token TRUOC khi hien form: bat nguoi dung nghi ra mot mat khau, go hai
 * lan, roi moi bao "lien ket het han" la mot cach lang phi thoi gian cua ho.
 */
type Phase = 'checking' | 'invalid' | 'ready' | 'done';

interface TokenInfo {
  kind: 'invite' | 'reset';
  email: string | null;
  full_name: string | null;
}

export default function ResetPasswordPage() {
  const setUser = useAuthStore((s) => s.setUser);
  const [phase, setPhase] = useState<Phase>('checking');
  const [info, setInfo] = useState<TokenInfo | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const token = new URLSearchParams(window.location.search).get('token') ?? '';

  useEffect(() => {
    if (!token) {
      setPhase('invalid');
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/auth/reset-token/${encodeURIComponent(token)}`);
        if (cancelled) return;
        if (!res.ok) {
          setPhase('invalid');
          return;
        }
        setInfo((await res.json()) as TokenInfo);
        setPhase('ready');
      } catch {
        if (!cancelled) setPhase('invalid');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const mismatch = confirm.length > 0 && password !== confirm;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (mismatch) return;
    setError(null);
    setPending(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: password }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || t.auth.resetInvalid);
      }
      /* May chu da mo san phien moi trong cung phan hoi — dua thang vao app thay
         vi bat go lai mat khau vua dat xong. Xoa `?token=` khoi URL de khong con
         mot token (da dung) nam trong lich su trinh duyet. */
      setUser((await res.json()) as AuthUser);
      setPhase('done');
      window.history.replaceState(null, '', '/');
      window.location.replace('/');
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  }

  const title = info?.kind === 'invite' ? t.auth.activateTitle : t.auth.resetTitle;
  const subtitle = info?.kind === 'invite' ? t.auth.activateSubtitle : (info?.email ?? '');

  return (
    <div className="tr-app-stage flex min-h-dvh items-center justify-center bg-tr-surface px-4">
      <div className="w-full max-w-sm rounded-modal border border-tr-border bg-tr-panel p-6 shadow-lg">
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <Logo className="h-10 w-10" />
          <h1 className="text-lg font-bold text-tr-text">
            {phase === 'invalid' ? t.auth.resetInvalid : title}
          </h1>
          {phase === 'ready' && subtitle ? (
            <p className="text-xs text-tr-muted">{subtitle}</p>
          ) : null}
        </div>

        {phase === 'checking' ? (
          <p role="status" className="text-center text-sm text-tr-muted">
            {t.auth.resetChecking}
          </p>
        ) : null}

        {phase === 'invalid' ? (
          <div className="space-y-4">
            <p className="rounded-control bg-tr-surface p-3 text-sm text-tr-text">
              {t.auth.resetInvalidHint}
            </p>
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={() => window.location.replace('/')}
            >
              {t.auth.backToSignIn}
            </Button>
          </div>
        ) : null}

        {phase === 'done' ? (
          <p role="status" className="text-center text-sm text-tr-text">
            {t.auth.resetDone}
          </p>
        ) : null}

        {phase === 'ready' ? (
          <form onSubmit={submit} className="space-y-3">
            <FormError error={error} />
            <Field label={t.auth.newPassword} hint={t.auth.newPasswordHint} required>
              <Input
                name="new-password"
                type="password"
                autoComplete="new-password"
                autoFocus
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            <Field
              label={t.auth.confirmPassword}
              error={mismatch ? t.auth.passwordMismatch : undefined}
              required
            >
              <Input
                name="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </Field>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              disabled={pending || password.length < 8 || mismatch || !confirm}
            >
              {t.auth.resetSubmit}
            </Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
