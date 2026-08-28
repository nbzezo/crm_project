import { useEffect, type ReactNode } from 'react';
import { t } from '../../i18n/vi';
import { useAuthStore } from '../../stores/authStore';
import LoginPage from '../../pages/LoginPage';

/**
 * Cong xac thuc toan cuc — bao ngoai RouterProvider trong main.tsx.
 *
 * Kiem tra phien mot lan khi tai app: dang kiem tra -> spinner, chua dang nhap
 * -> LoginPage, da dang nhap -> render app that.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const checkSession = useAuthStore((s) => s.checkSession);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  if (status === 'checking') {
    return (
      <div
        role="status"
        className="flex min-h-dvh items-center justify-center bg-tr-surface text-sm text-tr-muted"
      >
        {t.common.loading}
      </div>
    );
  }

  if (status === 'anonymous') return <LoginPage />;

  return <>{children}</>;
}
