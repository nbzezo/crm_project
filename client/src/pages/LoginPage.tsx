import { useState } from 'react';
import { Diamond } from 'lucide-react';
import { Button, Field, FormError, Input } from '../components/common/ui';
import { t } from '../i18n/vi';
import { useAuthStore } from '../stores/authStore';

export default function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="tr-app-stage flex min-h-dvh items-center justify-center bg-tr-surface px-4">
      <div className="w-full max-w-sm rounded-modal border border-tr-border bg-tr-panel p-6 shadow-lg">
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-control bg-tr-primary text-tr-on-primary">
            <Diamond size={18} fill="currentColor" aria-hidden="true" />
          </span>
          <h1 className="text-lg font-bold text-tr-text">{t.auth.signInTitle}</h1>
          <p className="text-xs text-tr-muted">{t.auth.signInSubtitle}</p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <FormError error={error} />
          <Field label={t.auth.username} required>
            <Input
              name="username"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
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
            disabled={pending || !username.trim() || !password}
          >
            {pending ? t.auth.signingIn : t.auth.signIn}
          </Button>
        </form>
      </div>
    </div>
  );
}
