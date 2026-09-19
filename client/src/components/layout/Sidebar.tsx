import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router';
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
  Check,
  ChevronDown,
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
  NotebookPen,
  NotebookText,
  Pencil,
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
import { selectNeedsNudge } from '../../lib/followUp';
import { t } from '../../i18n/vi';
import type { Board, NotificationFeed, TaskRow } from '../../types';
import { useUiStore } from '../../stores/uiStore';
import { useDialog } from '../common/useDialog';
import { focusRing } from '../common/ui';
import { buildDndAnnouncements } from '../../lib/dnd/announcements';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  /**
   * Item nay khong dieu huong sang trang — bam de mo mot overlay toan cuc (vd.
   * Bang Ghi chu nhanh, xem QuickNotesBoard.tsx). `to` van dung lam id on dinh
   * cho sap xep/badge, chi khong duoc dung lam duong dan thuc su.
   */
  isAction?: boolean;
}

type NavGroupId = 'daily' | 'projects' | 'sales' | 'analytics' | 'tools';
type NavOrder = Record<NavGroupId, string[]>;

const HOME_NAV: NavItem = {
  to: '/',
  label: t.nav.dashboard,
  icon: LayoutDashboard,
  end: true,
};
const SETTINGS_NAV: NavItem = { to: '/settings', label: t.nav.settings, icon: Settings };
const QUICK_NOTES_NAV: NavItem = {
  to: '/quick-notes',
  label: t.nav.quickNotes,
  icon: NotebookPen,
  isAction: true,
};
const NAV_GROUPS: { id: NavGroupId; label: string; items: NavItem[] }[] = [
  {
    id: 'daily',
    label: t.nav.groupDaily,
    items: [
      { to: '/tasks', label: t.nav.tasks, icon: ListChecks },
      { to: '/follow-up', label: t.nav.followUp, icon: BellRing },
      { to: '/calendar', label: t.nav.calendar, icon: CalendarDays },
    ],
  },
  {
    id: 'projects',
    label: t.nav.groupProjects,
    items: [
      { to: '/projects', label: t.nav.projects, icon: FolderKanban },
      { to: '/boards', label: t.nav.boards, icon: Trello },
      { to: '/timeline', label: t.nav.timeline, icon: GanttChartSquare },
      { to: '/documents', label: t.nav.documents, icon: FolderOpen },
    ],
  },
  {
    id: 'sales',
    label: t.nav.groupSales,
    items: [
      { to: '/customers', label: t.nav.customers, icon: Users },
      { to: '/pipeline', label: t.nav.pipeline, icon: Target },
      { to: '/contracts', label: t.nav.contracts, icon: FileSignature },
      { to: '/revenue', label: t.nav.revenue, icon: CircleDollarSign },
      { to: '/org-directory', label: t.nav.orgDirectory, icon: Contact },
    ],
  },
  {
    id: 'analytics',
    label: t.nav.groupAnalytics,
    items: [
      { to: '/reports', label: t.nav.reports, icon: BarChart3 },
      { to: '/pipeline-health', label: t.nav.pipelineHealth, icon: Activity },
    ],
  },
  {
    id: 'tools',
    label: t.nav.groupTools,
    items: [
      { to: '/ai', label: t.nav.ai, icon: Sparkles },
      { to: '/notes', label: t.nav.notes, icon: NotebookText, end: true },
    ],
  },
];

const DEFAULT_NAV_ORDER = Object.fromEntries(
  NAV_GROUPS.map((group) => [group.id, group.items.map((item) => item.to)])
) as NavOrder;
/* v2 co so do nhom moi; khong tai thu tu v1 vi cac muc da chuyen qua nhom khac. */
const NAV_ORDER_STORAGE_KEY = 'workflow-sidebar-nav-order-v2';
const NAV_GROUPS_COLLAPSED_STORAGE_KEY = 'workflow-sidebar-groups-collapsed-v1';

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

function isGroupDefaultOrder(groupId: NavGroupId, order: NavOrder): boolean {
  return order[groupId].join('|') === DEFAULT_NAV_ORDER[groupId].join('|');
}

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'workflow-sidebar-collapsed-v1';

function loadCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

type CollapsedGroups = Partial<Record<NavGroupId, boolean>>;

function loadCollapsedGroups(): CollapsedGroups {
  if (typeof window === 'undefined') return {};
  try {
    const value = JSON.parse(
      localStorage.getItem(NAV_GROUPS_COLLAPSED_STORAGE_KEY) ?? '{}'
    ) as unknown;
    if (!value || typeof value !== 'object') return {};
    return Object.fromEntries(
      NAV_GROUPS.map((group) => [group.id, (value as Record<string, unknown>)[group.id] === true])
    ) as CollapsedGroups;
  } catch {
    return {};
  }
}

/* Muc dieu huong cao 44px tren cam ung, thu gon con 32px tu breakpoint sm. */
const ITEM_BASE =
  'flex min-h-[44px] items-center gap-2.5 rounded-full px-3 text-sm transition fine:min-h-0 fine:py-1.5';

function navItemClass(isActive: boolean, extra = ''): string {
  return `${ITEM_BASE} ${focusRing} min-w-0 ${extra} ${
    isActive
      ? 'bg-[var(--tr-nav-active-bg)] font-semibold text-[var(--tr-nav-active-text)]'
      : 'text-[var(--tr-nav-text)] hover:bg-[var(--tr-nav-hover)]'
  }`;
}

function NavBadge({ count, tone = 'primary' }: { count: number; tone?: 'primary' | 'danger' }) {
  if (count <= 0) return null;
  return (
    <span
      className={`ml-auto flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full px-1 text-xs font-semibold text-tr-on-primary ${
        tone === 'danger' ? 'bg-tr-danger' : 'bg-tr-primary'
      }`}
      aria-hidden="true"
    >
      {count > 9 ? '9+' : count}
    </span>
  );
}

function useBoards() {
  return useQuery({
    queryKey: ['boards', false],
    queryFn: () => api.get<Board[]>('/api/boards'),
    staleTime: 30_000,
  });
}

/* Dung chung queryKey voi ReminderBell ('notifications') va FollowUpPage
   ('tasks','follow-up') de React Query gop request, khong goi API rieng. */
function useNavBadges() {
  const { data: feed } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<NotificationFeed>('/api/notifications'),
    refetchInterval: 60_000,
  });
  const { data: tasks } = useQuery({
    queryKey: ['tasks', 'follow-up'],
    queryFn: () => api.get<TaskRow[]>('/api/views/tasks?done=0'),
    // Chi de dem badge canh "Cần theo dõi": tai lai toan bo danh sach viec dang
    // mo tren moi lan doi route la phi. Con so nay khong can tuoi tung giay.
    staleTime: 60_000,
  });

  return {
    '/tasks': feed?.counts.task ?? 0,
    '/follow-up': tasks ? selectNeedsNudge(tasks).length : 0,
  } as Record<string, number>;
}

interface NavBadgeProps {
  badge?: number;
  badgeTone?: 'primary' | 'danger';
}

function NavItemLink({
  item,
  onNavigate,
  badge = 0,
  badgeTone,
}: { item: NavItem; onNavigate?: () => void } & NavBadgeProps) {
  const Icon = item.icon;
  const openQuickNotesBoard = useUiStore((s) => s.openQuickNotesBoard);

  if (item.isAction) {
    return (
      <button
        type="button"
        onClick={() => {
          openQuickNotesBoard();
          onNavigate?.();
        }}
        className={navItemClass(false)}
      >
        <Icon size={16} className="shrink-0" aria-hidden="true" />
        <span className="truncate">{item.label}</span>
        <NavBadge count={badge} tone={badgeTone} />
      </button>
    );
  }

  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) => navItemClass(isActive)}
    >
      <Icon size={16} className="shrink-0" aria-hidden="true" />
      <span className="truncate">{item.label}</span>
      <NavBadge count={badge} tone={badgeTone} />
    </NavLink>
  );
}

function SortableNavItem({
  item,
  onNavigate,
  badge = 0,
  badgeTone,
}: { item: NavItem; onNavigate?: () => void } & NavBadgeProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.to,
  });
  const Icon = item.icon;
  const openQuickNotesBoard = useUiStore((s) => s.openQuickNotesBoard);
  const itemExtra = `pr-12 sm:pr-9 ${isDragging ? 'shadow-md ring-1 ring-tr-primary/40' : ''}`;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group relative ${isDragging ? 'z-10 opacity-80' : ''}`}
    >
      {item.isAction ? (
        <button
          type="button"
          onClick={() => {
            openQuickNotesBoard();
            onNavigate?.();
          }}
          className={navItemClass(false, itemExtra)}
        >
          <Icon size={16} className="shrink-0" aria-hidden="true" />
          <span className="truncate">{item.label}</span>
          <NavBadge count={badge} tone={badgeTone} />
        </button>
      ) : (
        <NavLink
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) => navItemClass(isActive, itemExtra)}
        >
          <Icon size={16} className="shrink-0" aria-hidden="true" />
          <span className="truncate">{item.label}</span>
          <NavBadge count={badge} tone={badgeTone} />
        </NavLink>
      )}
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Sắp xếp ${item.label}`}
        title="Kéo để đổi vị trí · Nhấn Space để sắp xếp bằng bàn phím"
        className={`absolute top-1/2 right-0 flex h-11 w-11 -translate-y-1/2 touch-none cursor-grab items-center justify-center rounded-control text-tr-muted opacity-40 transition hover:bg-[var(--tr-nav-hover)] hover:opacity-100 focus-visible:opacity-100 active:cursor-grabbing sm:right-1 fine:h-7 fine:w-7 hoverable:opacity-0 hoverable:group-hover:opacity-70 ${focusRing}`}
      >
        <GripVertical size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

function StarredBoards({ boards, onNavigate }: { boards: Board[]; onNavigate?: () => void }) {
  if (boards.length === 0) return null;

  return (
    <section aria-label="Đã ghim" className="mt-2 border-l border-tr-border/80 pl-1">
      <h3 className="mb-1 flex items-center gap-1.5 px-3 text-xs font-semibold text-tr-muted">
        <Star size={11} aria-hidden="true" /> Đã ghim
      </h3>
      {boards.map((board) => (
        <NavLink
          key={board.id}
          to={`/boards/${board.id}`}
          onClick={onNavigate}
          className={({ isActive }) => navItemClass(isActive, 'gap-2')}
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
  allowCustomize?: boolean;
}

/** Phan noi dung dung chung cho ca thanh ben co dinh lan ngan keo tren mobile. */
function SidebarNav({ order, onOrderChange, onNavigate, allowCustomize = false }: SidebarNavProps) {
  const { data: boards = [] } = useBoards();
  const starred = boards.filter((board) => board.is_starred).slice(0, 5);
  const badges = useNavBadges();
  const { pathname } = useLocation();
  const [editMode, setEditMode] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<CollapsedGroups>(loadCollapsedGroups);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  /* Khi den mot trang bang link sau hoac nut Back, luon mo nhom chua trang do. */
  useEffect(() => {
    const activeGroup = NAV_GROUPS.find((group) =>
      group.items.some((item) => pathname === item.to || pathname.startsWith(`${item.to}/`))
    );
    if (!activeGroup) return;
    setCollapsedGroups((current) =>
      current[activeGroup.id] ? { ...current, [activeGroup.id]: false } : current
    );
  }, [pathname]);

  const toggleGroup = (groupId: NavGroupId) => {
    setCollapsedGroups((current) => {
      const next = { ...current, [groupId]: !current[groupId] };
      try {
        localStorage.setItem(NAV_GROUPS_COLLAPSED_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Trinh duyet chan storage van khong duoc lam hong thao tac thu gon nhom.
      }
      return next;
    });
  };

  /* Id cua muc dieu huong chinh la duong dan (`/tasks`), doc len nghe nhu duong
     dan ky thuat — doi sang dung nhan hien tren man hinh. */
  const announcements = useMemo(() => {
    const labels = new Map(
      [HOME_NAV, SETTINGS_NAV, ...NAV_GROUPS.flatMap((g) => g.items)].map((item) => [
        item.to,
        item.label,
      ])
    );
    return buildDndAnnouncements({
      itemNoun: 'mục điều hướng',
      resolve: (id) => {
        const label = labels.get(id);
        return label ? `mục ${label}` : null;
      },
    });
  }, []);

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
        <StarredBoards boards={starred} onNavigate={onNavigate} />

        {allowCustomize && (
          <div className="mt-2 flex justify-end px-1">
            <button
              type="button"
              onClick={() => setEditMode((current) => !current)}
              aria-pressed={editMode}
              className={`flex min-h-9 items-center gap-1.5 rounded-control px-2 text-xs font-medium text-tr-muted transition hover:bg-[var(--tr-nav-hover)] hover:text-[var(--tr-nav-text)] ${focusRing}`}
            >
              {editMode ? (
                <Check size={13} aria-hidden="true" />
              ) : (
                <Pencil size={13} aria-hidden="true" />
              )}
              {editMode ? 'Xong' : 'Tùy chỉnh menu'}
            </button>
          </div>
        )}

        {NAV_GROUPS.map((group) => {
          const itemMap = new Map(group.items.map((item) => [item.to, item]));
          const items = order[group.id]
            .map((to) => itemMap.get(to))
            .filter((item): item is NavItem => item !== undefined);
          const isCollapsed = collapsedGroups[group.id] === true;

          return (
            <section key={group.id} aria-label={group.label} className="mt-3">
              <div className="mb-1 flex min-h-5 items-center px-3">
                <h3 className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    aria-expanded={!isCollapsed}
                    className={`flex w-full items-center gap-1.5 rounded-control text-left text-xs font-semibold tracking-[0.08em] text-tr-muted uppercase transition hover:text-[var(--tr-nav-text)] ${focusRing}`}
                  >
                    <ChevronDown
                      size={12}
                      className={`shrink-0 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                      aria-hidden="true"
                    />
                    <span className="truncate">{group.label}</span>
                  </button>
                </h3>
                {editMode && !isGroupDefaultOrder(group.id, order) && (
                  <button
                    type="button"
                    onClick={() =>
                      onOrderChange({ ...order, [group.id]: DEFAULT_NAV_ORDER[group.id] })
                    }
                    aria-label="Khôi phục thứ tự mặc định"
                    title="Khôi phục thứ tự mặc định"
                    className={`ml-auto -mr-2 flex h-11 w-11 items-center justify-center rounded-control text-tr-muted transition hover:bg-[var(--tr-nav-hover)] hover:text-[var(--tr-nav-text)] sm:-mr-1 fine:h-7 fine:w-7 ${focusRing}`}
                  >
                    <RotateCcw size={13} aria-hidden="true" />
                  </button>
                )}
              </div>
              {!isCollapsed &&
                (editMode ? (
                  <DndContext
                    sensors={sensors}
                    accessibility={{ announcements }}
                    collisionDetection={closestCenter}
                    onDragEnd={(event) => onDragEnd(group.id, event)}
                  >
                    <SortableContext items={order[group.id]} strategy={verticalListSortingStrategy}>
                      <div className="space-y-0.5">
                        {items.map((item) => (
                          <SortableNavItem
                            key={item.to}
                            item={item}
                            onNavigate={onNavigate}
                            badge={badges[item.to]}
                            badgeTone={item.to === '/follow-up' ? 'danger' : 'primary'}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                ) : (
                  <div className="space-y-0.5">
                    {items.map((item) => (
                      <NavItemLink
                        key={item.to}
                        item={item}
                        onNavigate={onNavigate}
                        badge={badges[item.to]}
                        badgeTone={item.to === '/follow-up' ? 'danger' : 'primary'}
                      />
                    ))}
                  </div>
                ))}
            </section>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-[var(--tr-nav-border)] px-2.5 pt-2 pb-3">
        <NavItemLink item={QUICK_NOTES_NAV} onNavigate={onNavigate} />
        <NavItemLink item={SETTINGS_NAV} onNavigate={onNavigate} />
        <div className="mt-2 hidden px-3 text-xs text-tr-muted sm:block">{t.search.hint}</div>
      </div>
    </>
  );
}

function CollapsedNavLink({ item, badge = 0, badgeTone }: { item: NavItem } & NavBadgeProps) {
  const Icon = item.icon;
  const openQuickNotesBoard = useUiStore((s) => s.openQuickNotesBoard);
  const badgeDot = badge > 0 && (
    <span
      className={`absolute top-1 right-1 h-2 w-2 rounded-full ${
        badgeTone === 'danger' ? 'bg-tr-danger' : 'bg-tr-primary'
      }`}
      aria-hidden="true"
    />
  );

  if (item.isAction) {
    return (
      <button
        type="button"
        onClick={() => openQuickNotesBoard()}
        title={item.label}
        aria-label={item.label}
        className={`relative flex h-11 w-11 items-center justify-center rounded-control text-[var(--tr-nav-text)] transition hover:bg-[var(--tr-nav-hover)] fine:h-9 fine:w-9 ${focusRing}`}
      >
        <Icon size={18} aria-hidden="true" />
        {badgeDot}
      </button>
    );
  }

  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={item.label}
      aria-label={item.label}
      className={({ isActive }) =>
        `relative flex h-11 w-11 items-center justify-center rounded-control transition fine:h-9 fine:w-9 ${focusRing} ${
          isActive
            ? 'bg-[var(--tr-nav-active-bg)] text-[var(--tr-nav-active-text)]'
            : 'text-[var(--tr-nav-text)] hover:bg-[var(--tr-nav-hover)]'
        }`
      }
    >
      <Icon size={18} aria-hidden="true" />
      {badgeDot}
    </NavLink>
  );
}

/** Dai thu gon: chi hien icon, bo qua bang gan sao va keo-tha de giu don gian. */
function CollapsedNav({ order }: { order: NavOrder }) {
  const badges = useNavBadges();

  return (
    <nav aria-label={t.app.name} className="flex flex-1 flex-col items-center gap-1 py-3">
      <CollapsedNavLink item={HOME_NAV} />
      {NAV_GROUPS.map((group) => {
        const itemMap = new Map(group.items.map((item) => [item.to, item]));
        const items = order[group.id]
          .map((to) => itemMap.get(to))
          .filter((item): item is NavItem => item !== undefined);
        return (
          <div
            key={group.id}
            role="group"
            aria-label={group.label}
            className="flex flex-col items-center gap-1 border-t border-[var(--tr-nav-border)] pt-1"
          >
            {items.map((item) => (
              <CollapsedNavLink
                key={item.to}
                item={item}
                badge={badges[item.to]}
                badgeTone={item.to === '/follow-up' ? 'danger' : 'primary'}
              />
            ))}
          </div>
        );
      })}
      <div className="mt-auto flex flex-col gap-1 border-t border-[var(--tr-nav-border)] pt-2">
        <CollapsedNavLink item={QUICK_NOTES_NAV} />
        <CollapsedNavLink item={SETTINGS_NAV} />
      </div>
    </nav>
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
      className="tr-anim-fade fixed inset-0 z-nav-overlay bg-tr-overlay md:hidden"
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
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const [navOrder, setNavOrder] = useState<NavOrder>(loadNavOrder);

  const updateNavOrder = (next: NavOrder) => {
    setNavOrder(next);
    try {
      localStorage.setItem(NAV_ORDER_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Trinh duyet chan storage van khong duoc lam hong thao tac sap xep trong phien.
    }
  };

  const updateCollapsed = (next: boolean) => {
    setCollapsed(next);
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, next ? '1' : '0');
    } catch {
      // Trinh duyet chan storage van khong duoc lam hong thao tac thu gon trong phien.
    }
  };

  return (
    <>
      <NavDrawer order={navOrder} onOrderChange={updateNavOrder} />

      {collapsed ? (
        <aside className="tr-scroll hidden w-14 shrink-0 flex-col overflow-y-auto border-r border-[var(--tr-nav-border)] bg-[var(--tr-nav-panel)] text-[var(--tr-nav-text)] backdrop-blur-sm md:flex">
          <button
            type="button"
            onClick={() => updateCollapsed(false)}
            className={`mx-auto mt-3 flex h-9 w-9 items-center justify-center rounded-control text-tr-muted transition hover:bg-[var(--tr-nav-hover)] hover:text-[var(--tr-nav-text)] ${focusRing}`}
            aria-label="Mở rộng thanh điều hướng"
            aria-expanded={false}
          >
            <ChevronRight size={14} aria-hidden="true" />
          </button>
          <CollapsedNav order={navOrder} />
        </aside>
      ) : (
        <aside className="tr-scroll relative z-sticky hidden w-56 shrink-0 flex-col overflow-y-auto border-r border-[var(--tr-nav-border)] bg-[var(--tr-nav-panel)] text-[var(--tr-nav-text)] backdrop-blur-sm md:flex">
          <button
            type="button"
            onClick={() => updateCollapsed(true)}
            className={`absolute -right-3 top-3 z-sticky rounded-full border border-[var(--tr-nav-border)] bg-tr-panel p-2 text-[var(--tr-nav-text)] shadow-sm transition hover:bg-[var(--tr-nav-hover)] ${focusRing}`}
            aria-label="Thu gọn thanh điều hướng"
            aria-expanded
          >
            <ChevronLeft size={14} aria-hidden="true" />
          </button>
          <SidebarNav order={navOrder} onOrderChange={updateNavOrder} allowCustomize />
        </aside>
      )}
    </>
  );
}
