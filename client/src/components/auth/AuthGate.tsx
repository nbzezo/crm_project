import { useEffect, type ReactNode } from 'react';
import { t } from '../../i18n/vi';
import { useAuthStore } from '../../stores/authStore';
import LoginPage from '../../pages/LoginPage';
import ResetPasswordPage from '../../pages/ResetPasswordPage';

/**
 * Cong xac thuc toan cuc — bao ngoai RouterProvider trong main.tsx.
 *
 * Kiem tra phien mot lan khi tai app: dang kiem tra -> spinner, chua dang nhap
 * -> LoginPage, da dang nhap -> render app that.
 *
 * `/reset-password` duoc xu ly TRUOC moi thu khac va nam ngoai router: nguoi mo
 * lien ket trong thu theo dinh nghia la chua dang nhap duoc, nen khong the de no
 * sau mot cong doi dang nhap. Kiem tra ca khi dang co phien — nguoi dung co the
 * dang dang nhap o tab khac ma van bam vao lien ket trong thu.
 */
const RESET_PATH = '/reset-password';

export function AuthGate({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const checkSession = useAuthStore((s) => s.checkSession);
  const onResetRoute = window.location.pathname === RESET_PATH;

  useEffect(() => {
    if (!onResetRoute) void checkSession();
  }, [checkSession, onResetRoute]);

  if (onResetRoute) return <ResetPasswordPage />;

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
