import { useState } from 'react';
import { Logo } from '../components/common/Logo';
import { Button, Field, FormError, Input } from '../components/common/ui';
import { t } from '../i18n/vi';
import { useAuthStore } from '../stores/authStore';

/**
 * Bat doi mat khau do quan tri dat thay (POST /api/users/:id/password).
 *
 * May chu chan moi route nghiep vu bang 403 cho toi khi doi xong (xem
 * middleware/currentUser.ts), nen o day khong co gi khac de hien — cho nguoi do
 * vao app thi moi man hinh deu loi.
 */
export default function ForceChangePasswordPage() {
  const user = useAuthStore((s) => s.user);
  const checkSession = useAuthStore((s) => s.checkSession);
  const logout = useAuthStore((s) => s.logout);
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const mismatch = confirm.length > 0 && password !== confirm;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (mismatch) return;
    setError(null);
    setPending(true);
    try {
      const res = await fetch('/api/auth/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: current, new_password: password }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || t.auth.forceChangeFailed);
      }
      /* Doi xong may chu da tat co must_change_password — nap lai /me la vao app. */
      await checkSession();
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="tr-app-stage flex min-h-dvh items-center justify-center bg-tr-surface px-4 py-[max(1rem,env(safe-area-inset-top))]">
      <div className="w-full max-w-sm rounded-modal border border-tr-border bg-tr-panel p-6 shadow-lg">
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <Logo className="h-10 w-10" />
          <h1 className="tr-display text-lg font-bold text-tr-text">{t.auth.forceChangeTitle}</h1>
          <p className="text-xs text-tr-muted">{t.auth.forceChangeSubtitle}</p>
          {user?.email ? <p className="text-xs text-tr-subtle">{user.email}</p> : null}
        </div>
        <form onSubmit={submit} className="space-y-3">
          <FormError error={error} />
          <Field label={t.auth.temporaryPassword} required>
            <Input
              type="password"
              autoComplete="current-password"
              autoFocus
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </Field>
          <Field label={t.auth.newPassword} hint={t.auth.newPasswordHint} required>
            <Input
              type="password"
              autoComplete="new-password"
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
              type="password"
              autoComplete="new-password"
              minLength={8}
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
            disabled={pending || !current || password.length < 8 || password !== confirm}
          >
            {pending ? t.common.saving : t.auth.changePassword}
          </Button>
          <Button type="button" className="w-full" onClick={() => void logout()}>
            {t.auth.signOut}
          </Button>
        </form>
      </div>
    </div>
  );
}
