import { Menu } from 'lucide-react';
import { Link } from 'react-router';
import { SearchBox } from '../common/SearchBox';
import { ReminderBell } from './ReminderBell';
import { ThemeToggle } from './ThemeToggle';
import { t } from '../../i18n/vi';
import { useUiStore } from '../../stores/uiStore';
import { focusRing } from '../common/ui';

export function Topbar() {
  const setNavOpen = useUiStore((s) => s.setNavOpen);

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-tr-navfg-border bg-tr-nav px-2 sm:gap-3 sm:px-4">
      <button
        type="button"
        onClick={() => setNavOpen(true)}
        aria-label={t.common.openMenu}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-panel text-tr-navfg transition hover:bg-white/10 md:hidden ${focusRing}`}
      >
        <Menu size={20} aria-hidden="true" />
      </button>

      <Link
        to="/"
        className={`flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-panel transition hover:bg-white/10 sm:h-auto sm:w-auto sm:px-1.5 sm:py-1 ${focusRing}`}
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-control bg-tr-primary text-sm font-bold text-tr-on-primary">
          W
        </span>
        <span className="hidden text-lg font-bold tracking-tight text-tr-navfg sm:inline">
          {t.app.name}
        </span>
      </Link>

      <div className="ml-1 min-w-0 flex-1 sm:ml-2">
        <SearchBox />
      </div>

      <ThemeToggle />
      <ReminderBell />
    </header>
  );
}
