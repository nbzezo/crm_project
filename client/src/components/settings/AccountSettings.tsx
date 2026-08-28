import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Button, Field, FormError, Input, Panel } from '../common/ui';
import { t } from '../../i18n/vi';
import { useUiStore } from '../../stores/uiStore';
import { useAuthStore } from '../../stores/authStore';

export function AccountSettings() {
  const pushToast = useUiStore((s) => s.pushToast);
  const username = useAuthStore((s) => s.username);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');

  const change = useMutation({
    mutationFn: () =>
      api.patch('/api/auth/password', { current_password: current, new_password: next }),
    onSuccess: () => {
      setCurrent('');
      setNext('');
      pushToast(t.auth.passwordChanged, 'success');
    },
  });

  return (
    <Panel title={t.auth.changePassword}>
      <p className="mb-3 text-sm text-tr-subtle">
        {t.auth.username}: <span className="font-medium text-tr-text">{username}</span>
      </p>
      <FormError error={change.error} />
      <div className="max-w-sm space-y-3">
        <Field label={t.auth.currentPassword} required>
          <Input
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>
        <Field label={t.auth.newPassword} hint={t.auth.newPasswordHint} required>
          <Input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </Field>
        <Button
          variant="primary"
          disabled={change.isPending || !current || next.length < 8}
          onClick={() => change.mutate()}
        >
          {change.isPending ? t.common.saving : t.auth.changePassword}
        </Button>
      </div>
    </Panel>
  );
}
