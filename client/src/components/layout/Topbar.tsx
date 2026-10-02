import { Menu, NotebookPen, Search, Settings } from 'lucide-react';
import { Link, NavLink } from 'react-router';
import { Logo } from '../common/Logo';
import { SearchBox } from '../common/SearchBox';
import { ReminderBell } from './ReminderBell';
import { ThemeToggle } from './ThemeToggle';
import { AccountMenu } from './AccountMenu';
import { AssistantButton } from './AssistantLauncher';
import { t } from '../../i18n/vi';
import { useUiStore } from '../../stores/uiStore';
import { focusRing } from '../common/ui';
import { usePermissionCheck } from '../../lib/permissions';
import { SETTINGS_NAV, useCanOpenSettings } from './navConfig';

export function Topbar({ title }: { title: string }) {
  const setNavOpen = useUiStore((s) => s.setNavOpen);
  const setSearchOpen = useUiStore((s) => s.setSearchOpen);
  const openQuickNotesBoard = useUiStore((s) => s.openQuickNotesBoard);
  const canReadNotes = usePermissionCheck()('notes:read');
  const canOpenSettings = useCanOpenSettings();

  return (
    <header className="tr-topbar flex h-14 shrink-0 items-center gap-1 border-b border-tr-border/70 bg-transparent px-2.5 sm:gap-2 sm:px-5">
      <button
        type="button"
        onClick={() => setNavOpen(true)}
        aria-label={t.common.openMenu}
        className={`hidden h-11 w-11 shrink-0 items-center justify-center rounded-control text-tr-muted transition hover:bg-tr-hover hover:text-tr-text ${focusRing}`}
      >
        <Menu size={20} aria-hidden="true" />
      </button>

      <Link
        to="/"
        aria-label={t.app.name}
        className={`flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-control transition hover:bg-tr-hover fine:h-9 sm:w-auto sm:px-1.5 sm:py-1 ${focusRing}`}
      >
        <Logo className="h-8 w-8 shadow-sm sm:h-7 sm:w-7" />
        <span className="hidden text-base font-bold tracking-[-0.02em] text-tr-text sm:inline">
          {t.app.name}
        </span>
      </Link>

      <span className="min-w-0 flex-1 truncate text-lg font-bold tracking-[-0.02em] text-tr-text md:hidden">
        {title}
      </span>

      <div className="ml-1 min-w-0 flex-1">
        <SearchBox />
      </div>
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        aria-label={t.search.placeholder}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-tr-text md:hidden ${focusRing}`}
      >
        <Search size={20} aria-hidden="true" />
      </button>

      {/* Giao diện Sáng/Tối giữ nguyên ở đây chứ không vào menu tài khoản: đó là
          thao tác một chạm dùng nhiều lần trong ngày, chôn vào menu là làm chậm
          đi để đổi lấy gọn gàng. */}
      <ThemeToggle />
      <AssistantButton />
      {canReadNotes && (
        <button
          type="button"
          onClick={() => openQuickNotesBoard()}
          aria-label={t.nav.quickNotes}
          title={t.nav.quickNotes}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-tr-border bg-tr-panel text-tr-muted transition hover:bg-tr-hover hover:text-tr-text fine:h-8 fine:w-8 ${focusRing}`}
        >
          <NotebookPen size={18} aria-hidden="true" />
        </button>
      )}
      {canOpenSettings && (
        <NavLink
          to={SETTINGS_NAV.to}
          aria-label={SETTINGS_NAV.label}
          title={SETTINGS_NAV.label}
          className={({ isActive }) =>
            `hidden h-11 w-11 shrink-0 items-center justify-center rounded-control border transition md:flex fine:h-8 fine:w-8 ${
              isActive
                ? 'border-tr-primary/40 bg-tr-hover text-tr-text'
                : 'border-tr-border bg-tr-panel text-tr-muted hover:bg-tr-hover hover:text-tr-text'
            } ${focusRing}`
          }
        >
          <Settings size={18} aria-hidden="true" />
        </NavLink>
      )}
      <ReminderBell />
      <AccountMenu />
    </header>
  );
}
