import { Diamond, LogOut, Menu } from 'lucide-react';
import { Link } from 'react-router';
import { SearchBox } from '../common/SearchBox';
import { ReminderBell } from './ReminderBell';
import { ThemeToggle } from './ThemeToggle';
import { t } from '../../i18n/vi';
import { useUiStore } from '../../stores/uiStore';
import { useAuthStore } from '../../stores/authStore';
import { focusRing, IconButton } from '../common/ui';

export function Topbar() {
  const setNavOpen = useUiStore((s) => s.setNavOpen);
  const logout = useAuthStore((s) => s.logout);

  return (
    <header className="tr-topbar flex h-14 shrink-0 items-center gap-1 border-b border-tr-border/70 bg-transparent px-2.5 sm:gap-2 sm:px-5">
      <button
        type="button"
        onClick={() => setNavOpen(true)}
        aria-label={t.common.openMenu}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-tr-muted transition hover:bg-tr-hover hover:text-tr-text md:hidden ${focusRing}`}
      >
        <Menu size={20} aria-hidden="true" />
      </button>

      <Link
        to="/"
        aria-label={t.app.name}
        className={`flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-control transition hover:bg-tr-hover sm:h-9 sm:w-auto sm:px-1.5 sm:py-1 ${focusRing}`}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-control bg-tr-primary text-tr-on-primary shadow-sm sm:h-7 sm:w-7">
          <Diamond size={14} fill="currentColor" aria-hidden="true" />
        </span>
        <span className="hidden text-base font-bold tracking-[-0.02em] text-tr-text sm:inline">
          {t.app.name}
        </span>
      </Link>

      <div className="ml-1 min-w-0 flex-1">
        <SearchBox />
      </div>

      <ThemeToggle />
      <ReminderBell />
      <IconButton label={t.auth.signOut} onClick={() => void logout()}>
        <LogOut size={18} aria-hidden="true" />
      </IconButton>
    </header>
  );
}
