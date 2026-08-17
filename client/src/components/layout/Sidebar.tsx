import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Activity,
  BarChart3,
  BellRing,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Contact,
  FileSignature,
  FolderKanban,
  FolderOpen,
  GanttChartSquare,
  GripVertical,
  LayoutDashboard,
  ListChecks,
  RotateCcw,
  Settings,
  Sparkles,
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

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
}

type NavGroupId = 'work' | 'sales' | 'insights';
type NavOrder = Record<NavGroupId, string[]>;

const HOME_NAV: NavItem = {
  to: '/',
  label: t.nav.dashboard,
  icon: LayoutDashboard,
  end: true,
};
const SETTINGS_NAV: NavItem = { to: '/settings', label: t.nav.settings, icon: Settings };
const NAV_GROUPS: { id: NavGroupId; label: string; items: NavItem[] }[] = [
  {
    id: 'work',
    label: 'Công việc',
    items: [
      { to: '/projects', label: t.nav.projects, icon: FolderKanban },
      { to: '/boards', label: t.nav.boards, icon: Trello },
      { to: '/tasks', label: t.nav.tasks, icon: ListChecks },
      { to: '/follow-up', label: t.nav.followUp, icon: BellRing },
      { to: '/calendar', label: t.nav.calendar, icon: CalendarDays },
      { to: '/timeline', label: t.nav.timeline, icon: GanttChartSquare },
      { to: '/documents', label: t.nav.documents, icon: FolderOpen },
    ],
  },
  {
    id: 'sales',
    label: 'CRM & tổ chức',
    items: [
      { to: '/org-directory', label: t.nav.orgDirectory, icon: Contact },
      { to: '/customers', label: t.nav.customers, icon: Users },
      { to: '/pipeline', label: t.nav.pipeline, icon: Target },
      { to: '/pipeline-health', label: t.nav.pipelineHealth, icon: Activity },
      { to: '/contracts', label: t.nav.contracts, icon: FileSignature },
      { to: '/revenue', label: t.nav.revenue, icon: CircleDollarSign },
    ],
  },
  {
    id: 'insights',
    label: 'Phân tích & công cụ',
    items: [
      { to: '/reports', label: t.nav.reports, icon: BarChart3 },
      { to: '/ai', label: t.nav.ai, icon: Sparkles },
    ],
  },
];

const DEFAULT_NAV_ORDER: NavOrder = {
  work: NAV_GROUPS[0].items.map((item) => item.to),
  sales: NAV_GROUPS[1].items.map((item) => item.to),
  insights: NAV_GROUPS[2].items.map((item) => item.to),
};
const NAV_ORDER_STORAGE_KEY = 'workflow-sidebar-nav-order-v1';

function normalizeNavOrder(value: unknown): NavOrder {
  const saved = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const result = {} as NavOrder;

  for (const group of NAV_GROUPS) {
    const defaults = DEFAULT_NAV_ORDER[group.id];
    const allowed = new Set(defaults);
    const rawOrder = saved[group.id];
    const preferred: string[] = Array.isArray(rawOrder)
      ? rawOrder.filter((id: unknown): id is string => typeof id === 'string' && allowed.has(id))
      : [];
    const unique = [...new Set(preferred)];
    result[group.id] = [...unique, ...defaults.filter((id) => !unique.includes(id))];
  }

  return result;
}

function loadNavOrder(): NavOrder {
  if (typeof window === 'undefined') return normalizeNavOrder(null);
  try {
    return normalizeNavOrder(JSON.parse(localStorage.getItem(NAV_ORDER_STORAGE_KEY) ?? 'null'));
  } catch {
    return normalizeNavOrder(null);
  }
}

function isDefaultNavOrder(order: NavOrder): boolean {
  return NAV_GROUPS.every(({ id }) => order[id].join('|') === DEFAULT_NAV_ORDER[id].join('|'));
}

/* Muc dieu huong cao 44px tren cam ung, thu gon con 32px tu breakpoint sm. */
const ITEM_BASE =
  'flex min-h-[44px] items-center gap-2.5 rounded-full px-3 text-sm transition sm:min-h-0 sm:py-1.5';

function useBoards() {
  return useQuery({
    queryKey: ['boards', false],
    queryFn: () => api.get<Board[]>('/api/boards'),
    staleTime: 30_000,
  });
}

function NavItemLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const Icon = item.icon;

  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        `${ITEM_BASE} ${focusRing} min-w-0 ${
          isActive
            ? 'bg-[var(--tr-nav-active-bg)] font-semibold text-[var(--tr-nav-active-text)]'
            : 'text-[var(--tr-nav-text)] hover:bg-[var(--tr-nav-hover)]'
        }`
      }
    >
      <Icon size={16} className="shrink-0" aria-hidden="true" />
      <span className="truncate">{item.label}</span>
    </NavLink>
  );
}

function SortableNavItem({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.to,
  });
  const Icon = item.icon;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group relative ${isDragging ? 'z-10 opacity-80' : ''}`}
    >
      <NavLink
        to={item.to}
        end={item.end}
        onClick={onNavigate}
        className={({ isActive }) =>
          `${ITEM_BASE} ${focusRing} min-w-0 pr-12 sm:pr-9 ${
            isActive
              ? 'bg-[var(--tr-nav-active-bg)] font-semibold text-[var(--tr-nav-active-text)]'
              : 'text-[var(--tr-nav-text)] hover:bg-[var(--tr-nav-hover)]'
          } ${isDragging ? 'shadow-md ring-1 ring-tr-primary/40' : ''}`
        }
      >
        <Icon size={16} className="shrink-0" aria-hidden="true" />
        <span className="truncate">{item.label}</span>
      </NavLink>
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Sắp xếp ${item.label}`}
        title="Kéo để đổi vị trí · Nhấn Space để sắp xếp bằng bàn phím"
        className={`absolute top-1/2 right-0 flex h-11 w-11 -translate-y-1/2 touch-none cursor-grab items-center justify-center rounded-control text-tr-muted opacity-40 transition hover:bg-[var(--tr-nav-hover)] hover:opacity-100 focus-visible:opacity-100 active:cursor-grabbing sm:right-1 sm:h-7 sm:w-7 sm:opacity-0 sm:group-hover:opacity-70 ${focusRing}`}
      >
        <GripVertical size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

function StarredBoards({ boards, onNavigate }: { boards: Board[]; onNavigate?: () => void }) {
  const { boardId } = useParams();
  if (boards.length === 0) return null;

  return (
    <section aria-label="Bảng đã gắn sao" className="mt-2 border-l border-tr-border/80 pl-1">
      <h3 className="mb-1 flex items-center gap-1.5 px-3 text-2xs font-semibold text-tr-muted">
        <Star size={11} aria-hidden="true" /> Bảng đã gắn sao
      </h3>
      {boards.map((board) => (
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
    </section>
  );
}

interface SidebarNavProps {
  order: NavOrder;
  onOrderChange: (next: NavOrder) => void;
  onNavigate?: () => void;
}

/** Phan noi dung dung chung cho ca thanh ben co dinh lan ngan keo tren mobile. */
function SidebarNav({ order, onOrderChange, onNavigate }: SidebarNavProps) {
  const { data: boards = [] } = useBoards();
  const starred = boards.filter((board) => board.is_starred);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const onDragEnd = (groupId: NavGroupId, event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const current = order[groupId];
    const from = current.indexOf(String(active.id));
    const to = current.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onOrderChange({ ...order, [groupId]: arrayMove(current, from, to) });
  };

  return (
    <>
      <nav aria-label={t.app.name} className="px-2.5 py-3">
        <NavItemLink item={HOME_NAV} onNavigate={onNavigate} />

        {NAV_GROUPS.map((group) => {
          const itemMap = new Map(group.items.map((item) => [item.to, item]));
          const items = order[group.id]
            .map((to) => itemMap.get(to))
            .filter((item): item is NavItem => item !== undefined);

          return (
            <section key={group.id} aria-label={group.label} className="mt-3">
              <div className="mb-1 flex min-h-5 items-center px-3">
                <h3 className="text-2xs font-semibold tracking-[0.08em] text-tr-muted uppercase">
                  {group.label}
                </h3>
                {group.id === 'work' && !isDefaultNavOrder(order) && (
                  <button
                    type="button"
                    onClick={() => onOrderChange(normalizeNavOrder(null))}
                    aria-label="Khôi phục thứ tự mặc định"
                    title="Khôi phục thứ tự mặc định"
                    className={`ml-auto -mr-2 flex h-11 w-11 items-center justify-center rounded-control text-tr-muted transition hover:bg-[var(--tr-nav-hover)] hover:text-[var(--tr-nav-text)] sm:-mr-1 sm:h-7 sm:w-7 ${focusRing}`}
                  >
                    <RotateCcw size={13} aria-hidden="true" />
                  </button>
                )}
              </div>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(event) => onDragEnd(group.id, event)}
              >
                <SortableContext items={order[group.id]} strategy={verticalListSortingStrategy}>
                  <div className="space-y-0.5">
                    {items.map((item) => (
                      <SortableNavItem key={item.to} item={item} onNavigate={onNavigate} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
              {group.id === 'work' && <StarredBoards boards={starred} onNavigate={onNavigate} />}
            </section>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-[var(--tr-nav-border)] px-2.5 pt-2 pb-3">
        <NavItemLink item={SETTINGS_NAV} onNavigate={onNavigate} />
        <div className="mt-2 hidden px-3 text-2xs text-tr-muted sm:block">{t.search.hint}</div>
      </div>
    </>
  );
}

/** Ngan keo dieu huong cho man hinh hep (< md). */
function NavDrawer({ order, onOrderChange }: Omit<SidebarNavProps, 'onNavigate'>) {
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
        className="tr-anim-slide-left tr-scroll flex h-full w-[min(17rem,85vw)] flex-col overflow-y-auto border-r border-[var(--tr-nav-border)] bg-tr-panel text-[var(--tr-nav-text)] shadow-2xl"
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
        <SidebarNav order={order} onOrderChange={onOrderChange} onNavigate={() => setOpen(false)} />
      </div>
    </div>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [navOrder, setNavOrder] = useState<NavOrder>(loadNavOrder);

  const updateNavOrder = (next: NavOrder) => {
    setNavOrder(next);
    try {
      localStorage.setItem(NAV_ORDER_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Trinh duyet chan storage van khong duoc lam hong thao tac sap xep trong phien.
    }
  };

  return (
    <>
      <NavDrawer order={navOrder} onOrderChange={updateNavOrder} />

      {collapsed ? (
        <aside className="hidden w-4 shrink-0 items-start justify-center border-r border-[var(--tr-nav-border)] bg-transparent pt-4 md:flex">
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className={`-mr-3 rounded-full border border-[var(--tr-nav-border)] bg-tr-panel p-2 text-[var(--tr-nav-text)] shadow-sm transition hover:bg-[var(--tr-nav-hover)] ${focusRing}`}
            aria-label="Mở rộng thanh điều hướng"
            aria-expanded={false}
          >
            <ChevronRight size={14} aria-hidden="true" />
          </button>
        </aside>
      ) : (
        <aside className="tr-scroll relative z-30 hidden w-56 shrink-0 flex-col overflow-y-auto border-r border-[var(--tr-nav-border)] bg-[var(--tr-nav-panel)] text-[var(--tr-nav-text)] backdrop-blur-sm md:flex">
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className={`absolute -right-3 top-3 z-30 rounded-full border border-[var(--tr-nav-border)] bg-tr-panel p-2 text-[var(--tr-nav-text)] shadow-sm transition hover:bg-[var(--tr-nav-hover)] ${focusRing}`}
            aria-label="Thu gọn thanh điều hướng"
            aria-expanded
          >
            <ChevronLeft size={14} aria-hidden="true" />
          </button>
          <SidebarNav order={navOrder} onOrderChange={updateNavOrder} />
        </aside>
      )}
    </>
  );
}
