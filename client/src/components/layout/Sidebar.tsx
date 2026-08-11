import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  FileSignature,
  FolderOpen,
  GanttChartSquare,
  LayoutDashboard,
  ListChecks,
  Settings,
  Star,
  Target,
  Trello,
  Users,
  X,
} from 'lucide-react';
import { api } from '../../api/client';
import { backgroundStyle } from '../../lib/backgrounds';
import { t } from '../../i18n/vi';
import type { Board } from '../../types';
import { useUiStore } from '../../stores/uiStore';
import { useDialog } from '../common/useDialog';
import { focusRing } from '../common/ui';

const NAV = [
  { to: '/', label: t.nav.dashboard, icon: LayoutDashboard, end: true },
  { to: '/boards', label: t.nav.boards, icon: Trello },
  { to: '/customers', label: t.nav.customers, icon: Users },
  { to: '/pipeline', label: t.nav.pipeline, icon: Target },
  { to: '/contracts', label: t.nav.contracts, icon: FileSignature },
  { to: '/revenue', label: t.nav.revenue, icon: CircleDollarSign },
  { to: '/documents', label: t.nav.documents, icon: FolderOpen },
  { to: '/calendar', label: t.nav.calendar, icon: CalendarDays },
  { to: '/timeline', label: t.nav.timeline, icon: GanttChartSquare },
  { to: '/reports', label: t.nav.reports, icon: BarChart3 },
  { to: '/tasks', label: t.nav.tasks, icon: ListChecks },
  { to: '/settings', label: t.nav.settings, icon: Settings },
];

/* Muc dieu huong cao 44px tren cam ung, thu gon con 32px tu breakpoint sm. */
const ITEM_BASE =
  'flex min-h-[44px] items-center gap-3 rounded-control px-3 text-sm transition sm:min-h-0 sm:py-1.5';

function useBoards() {
  return useQuery({
    queryKey: ['boards', false],
    queryFn: () => api.get<Board[]>('/api/boards'),
    staleTime: 30_000,
  });
}

/** Phan noi dung dung chung cho ca thanh ben co dinh lan ngan keo tren mobile. */
function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { boardId } = useParams();
  const { data: boards = [] } = useBoards();
  const starred = boards.filter((b) => b.is_starred);

  return (
    <>
      <nav aria-label={t.app.name} className="space-y-0.5 px-2 py-3">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `${ITEM_BASE} ${focusRing} ${
                isActive
                  ? 'bg-[var(--tr-nav-active-bg)] font-semibold text-[var(--tr-nav-active-text)]'
                  : 'text-[var(--tr-nav-text)] hover:bg-[var(--tr-nav-hover)]'
              }`
            }
          >
            <Icon size={16} aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </nav>

      {starred.length > 0 && (
        <div className="border-t border-[var(--tr-nav-border)] px-2 py-3">
          <h3 className="mb-1 flex items-center gap-1.5 px-3 text-xs font-semibold text-tr-muted">
            <Star size={12} aria-hidden="true" /> Bảng đã gắn sao
          </h3>
          {starred.map((board) => (
            <NavLink
              key={board.id}
              to={`/boards/${board.id}`}
              onClick={onNavigate}
              className={`${ITEM_BASE} ${focusRing} gap-2 ${
                Number(boardId) === board.id
                  ? 'bg-[var(--tr-nav-active-bg)] text-[var(--tr-nav-active-text)]'
                  : 'text-[var(--tr-nav-text)] hover:bg-[var(--tr-nav-hover)]'
              }`}
            >
              <span
                className="h-5 w-6 shrink-0 rounded-control"
                style={backgroundStyle(board.background)}
                aria-hidden="true"
              />
              <span className="truncate">{board.name}</span>
            </NavLink>
          ))}
        </div>
      )}

      <div className="mt-auto hidden px-5 py-3 text-2xs text-tr-muted sm:block">{t.search.hint}</div>
    </>
  );
}

/** Ngan keo dieu huong cho man hinh hep (< md). */
function NavDrawer() {
  const open = useUiStore((s) => s.navOpen);
  const setOpen = useUiStore((s) => s.setNavOpen);
  const panelRef = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();

  // Doi trang bang cach khac (nut Back, lien ket trong noi dung) cung dong ngan keo.
  useEffect(() => {
    setOpen(false);
  }, [pathname, setOpen]);

  useDialog({ open, onClose: () => setOpen(false), containerRef: panelRef });

  if (!open) return null;

  return (
    <div
      className="tr-anim-fade fixed inset-0 z-40 bg-tr-overlay md:hidden"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t.nav.dashboard}
        className="tr-anim-slide-left tr-scroll flex h-full w-[min(17rem,85vw)] flex-col overflow-y-auto border-r border-[var(--tr-nav-border)] bg-[var(--tr-nav-panel)] text-[var(--tr-nav-text)] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--tr-nav-border)] px-4 py-2">
          <span className="text-sm font-semibold">{t.app.name}</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t.common.closeMenu}
            className={`-mr-1.5 flex h-11 w-11 items-center justify-center rounded-panel text-tr-muted transition hover:bg-[var(--tr-nav-hover)] ${focusRing}`}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <SidebarNav onNavigate={() => setOpen(false)} />
      </div>
    </div>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      <NavDrawer />

      {collapsed ? (
        <aside className="hidden w-4 shrink-0 items-start justify-center border-r border-[var(--tr-nav-border)] bg-[var(--tr-nav-panel)] pt-3 md:flex">
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className={`-mr-3 rounded-full border border-[var(--tr-nav-border)] bg-[var(--tr-nav-panel)] p-2 text-[var(--tr-nav-text)] transition hover:bg-[var(--tr-nav-hover)] ${focusRing}`}
            aria-label="Mở rộng thanh điều hướng"
            aria-expanded={false}
          >
            <ChevronRight size={14} aria-hidden="true" />
          </button>
        </aside>
      ) : (
        <aside className="relative z-30 hidden w-60 shrink-0 flex-col border-r border-[var(--tr-nav-border)] bg-[var(--tr-nav-panel)] text-[var(--tr-nav-text)] md:flex">
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className={`absolute -right-3 top-3 z-30 rounded-full border border-[var(--tr-nav-border)] bg-[var(--tr-nav-panel)] p-2 text-[var(--tr-nav-text)] transition hover:bg-[var(--tr-nav-hover)] ${focusRing}`}
            aria-label="Thu gọn thanh điều hướng"
            aria-expanded
          >
            <ChevronLeft size={14} aria-hidden="true" />
          </button>
          <SidebarNav />
        </aside>
      )}
    </>
  );
}
