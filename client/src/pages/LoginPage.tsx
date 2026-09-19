import { useState } from 'react';
import { Logo } from '../components/common/Logo';
import { Button, Field, FormError, Input } from '../components/common/ui';
import { t } from '../i18n/vi';
import { useAuthStore } from '../stores/authStore';

/**
 * Man dang nhap + man "quen mat khau" trong cung mot khung.
 *
 * Hai man chung mot khung vi chung la hai trang thai cua cung mot viec (vao duoc
 * tai khoan), va vi LoginPage duoc render NGOAI router (xem AuthGate) nen khong
 * co duong dan rieng de tach ra thanh hai route.
 */
type Mode = 'sign-in' | 'forgot';

export default function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const [mode, setMode] = useState<Mode>('sign-in');

  return (
    <div className="tr-app-stage flex min-h-dvh items-center justify-center bg-tr-surface px-4">
      <div className="w-full max-w-sm rounded-modal border border-tr-border bg-tr-panel p-6 shadow-lg">
        {mode === 'sign-in' ? (
          <SignInForm onLogin={login} onForgot={() => setMode('forgot')} />
        ) : (
          <ForgotForm onBack={() => setMode('sign-in')} />
        )}
      </div>
    </div>
  );
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-5 flex flex-col items-center gap-2 text-center">
      <Logo className="h-10 w-10" />
      <h1 className="text-lg font-bold text-tr-text">{title}</h1>
      <p className="text-xs text-tr-muted">{subtitle}</p>
    </div>
  );
}

function SignInForm({
  onLogin,
  onForgot,
}: {
  onLogin: (login: string, password: string) => Promise<void>;
  onForgot: () => void;
}) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await onLogin(identifier.trim(), password);
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Header title={t.auth.signInTitle} subtitle={t.auth.signInSubtitle} />
      <form onSubmit={submit} className="space-y-3">
        <FormError error={error} />
        {/* `type="text"` chu khong phai `type="email"`: o nay con nhan ca ten dang
            nhap cu, ma trinh duyet se tu chan mot chuoi khong co dau @. */}
        <Field label={t.auth.email} hint={t.auth.emailHint} required>
          <Input
            name="username"
            autoComplete="username"
            autoFocus
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
          />
        </Field>
        <Field label={t.auth.password} required>
          <Input
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          disabled={pending || !identifier.trim() || !password}
        >
          {pending ? t.auth.signingIn : t.auth.signIn}
        </Button>
        <div className="pt-1 text-center">
          <button
            type="button"
            onClick={onForgot}
            className="rounded-control text-xs text-tr-muted underline underline-offset-2 hover:text-tr-text"
          >
            {t.auth.forgot}
          </button>
        </div>
      </form>
    </>
  );
}

function ForgotForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      /* May chu luon tra 204, ke ca khi email khong ton tai. Man hinh nay phai
         giu nguyen su im lang do: bao "khong tim thay tai khoan" se bien day
         thanh cong cu do xem dia chi nao co trong he thong. */
      if (!res.ok && res.status !== 204) throw new Error('Không gửi được yêu cầu');
      setSent(true);
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Header title={t.auth.forgotTitle} subtitle={t.auth.forgotSubtitle} />
      {sent ? (
        <div className="space-y-4">
          <p className="rounded-control bg-tr-surface p-3 text-sm text-tr-text">
            {t.auth.forgotDone}
          </p>
          <Button variant="secondary" size="lg" className="w-full" onClick={onBack}>
            {t.auth.backToSignIn}
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <FormError error={error} />
          <Field label={t.auth.email} required>
            <Input
              name="email"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            disabled={pending || !email.trim()}
          >
            {pending ? t.auth.forgotSending : t.auth.forgotSubmit}
          </Button>
          <div className="pt-1 text-center">
            <button
              type="button"
              onClick={onBack}
              className="rounded-control text-xs text-tr-muted underline underline-offset-2 hover:text-tr-text"
            >
              {t.auth.backToSignIn}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
