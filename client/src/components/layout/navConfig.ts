import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  BellRing,
  CalendarDays,
  CircleDollarSign,
  BookUser,
  Contact,
  Gauge,
  FileSignature,
  FolderKanban,
  FolderOpen,
  GanttChartSquare,
  HeartPulse,
  LayoutDashboard,
  ListChecks,
  Settings,
  Share2,
  Sparkles,
  Target,
  Trello,
  Users,
} from 'lucide-react';
import { api } from '../../api/client';
import { selectNeedsNudge } from '../../lib/followUp';
import { usePermissionCheck, type PermissionKey } from '../../lib/permissions';
import { t } from '../../i18n/vi';
import type { NotificationFeed, TaskRow } from '../../types';

export interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  permission?: PermissionKey;
  permissionAny?: PermissionKey[];
}
export type NavGroupId = 'daily' | 'projects' | 'sales';
export type NavOrder = Record<NavGroupId, string[]>;

export const HOME_NAV: NavItem = {
  to: '/',
  label: t.nav.dashboard,
  icon: LayoutDashboard,
  end: true,
};
export const AI_NAV: NavItem = {
  to: '/ai',
  label: t.nav.ai,
  icon: Sparkles,
  permission: 'ai:read',
};
export const SETTINGS_NAV: NavItem = { to: '/settings', label: t.nav.settings, icon: Settings };
export const SETTINGS_PERMISSIONS: PermissionKey[] = [
  'settings.app:read',
  'settings.ai:read',
  'settings.email:read',
  'settings.telegram:read',
  'data.export:export',
  'admin.users:read',
  'admin.org:read',
  'admin.positions:read',
];

export function useCanOpenSettings(): boolean {
  const allowed = usePermissionCheck();
  return SETTINGS_PERMISSIONS.some((key) => allowed(key));
}

/*
 * Ba nhom: Ban lam viec -> Du an -> Kinh doanh. Moi nhom giu bao cao CUA NO (Bao
 * cao o Du an, Suc khoe pipeline o Kinh doanh); bao cao tong nam o tab "Báo cáo
 * tổng" cua trang Tong quan. Hieu suat la thu nguoi dung xem cho CHINH MINH moi
 * ngay nen nam o Ban lam viec.
 *
 * Nhom dau tung ten "Hôm nay" nhung chua Lich va Danh ba ca nhan — khong cai nao la
 * "hom nay". Doi `label`, giu `id` 'daily' de thu tu nguoi dung da luu khong mat.
 */
export const NAV_GROUPS: { id: NavGroupId; label: string; items: NavItem[] }[] = [
  {
    id: 'daily',
    label: t.nav.groupDaily,
    items: [
      { to: '/tasks', label: t.nav.tasks, icon: ListChecks, permission: 'tasks:read' },
      { to: '/follow-up', label: t.nav.followUp, icon: BellRing, permission: 'tasks:read' },
      { to: '/calendar', label: t.nav.calendar, icon: CalendarDays, permission: 'tasks:read' },
      {
        to: '/performance',
        label: t.nav.performance,
        icon: Gauge,
        permission: 'report.tasks:read',
      },
      { to: '/my-contacts', label: t.nav.myContacts, icon: BookUser },
    ],
  },
  {
    id: 'projects',
    label: t.nav.groupProjects,
    items: [
      { to: '/projects', label: t.nav.projects, icon: FolderKanban, permission: 'projects:read' },
      { to: '/boards', label: t.nav.boards, icon: Trello, permission: 'boards:read' },
      { to: '/timeline', label: t.nav.timeline, icon: GanttChartSquare, permission: 'tasks:read' },
      {
        to: '/documents',
        label: t.nav.documents,
        icon: FolderOpen,
        permissionAny: ['documents:read', 'notes:read'],
      },
      { to: '/reports', label: t.nav.reports, icon: BarChart3, permission: 'report.tasks:read' },
      {
        to: '/shares',
        label: t.nav.shares,
        icon: Share2,
        permissionAny: ['documents:update', 'quotations:update', 'contracts:update'],
      },
    ],
  },
  {
    id: 'sales',
    label: t.nav.groupSales,
    items: [
      { to: '/customers', label: t.nav.customers, icon: Users, permission: 'customers:read' },
      { to: '/pipeline', label: t.nav.pipeline, icon: Target, permission: 'deals:read' },
      {
        to: '/pipeline-health',
        label: t.nav.pipelineHealth,
        icon: HeartPulse,
        permission: 'report.sales:read',
      },
      {
        to: '/contracts',
        label: t.nav.contracts,
        icon: FileSignature,
        permission: 'contracts:read',
      },
      { to: '/revenue', label: t.nav.revenue, icon: CircleDollarSign, permission: 'revenues:read' },
      {
        to: '/org-directory',
        label: t.nav.orgDirectory,
        icon: Contact,
        permission: 'contacts:read',
      },
    ],
  },
];

/** Nhom chua duong dan dang mo — ke ca trang con (`/boards/12`, `/revenue/new`). */
export function navGroupOf(pathname: string): NavGroupId | null {
  const group = NAV_GROUPS.find((g) =>
    g.items.some((item) => pathname === item.to || pathname.startsWith(`${item.to}/`))
  );
  return group?.id ?? null;
}

export function useGroupItems(order: NavOrder): (group: (typeof NAV_GROUPS)[number]) => NavItem[] {
  const allowed = usePermissionCheck();
  return (group) => {
    const itemMap = new Map(
      group.items
        .filter((item) =>
          item.permissionAny
            ? item.permissionAny.some((key) => allowed(key))
            : allowed(item.permission)
        )
        .map((item) => [item.to, item])
    );
    return order[group.id]
      .map((to) => itemMap.get(to))
      .filter((item): item is NavItem => item !== undefined);
  };
}

export const DEFAULT_NAV_ORDER = Object.fromEntries(
  NAV_GROUPS.map((group) => [group.id, group.items.map((item) => item.to)])
) as NavOrder;
export const NAV_ORDER_STORAGE_KEY = 'workflow-sidebar-nav-order-v3';

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

export function loadNavOrder(): NavOrder {
  if (typeof window === 'undefined') return normalizeNavOrder(null);
  try {
    return normalizeNavOrder(JSON.parse(localStorage.getItem(NAV_ORDER_STORAGE_KEY) ?? 'null'));
  } catch {
    return normalizeNavOrder(null);
  }
}

export function isGroupDefaultOrder(groupId: NavGroupId, order: NavOrder): boolean {
  return order[groupId].join('|') === DEFAULT_NAV_ORDER[groupId].join('|');
}

/** Shared React Query keys let the sidebar and mobile sheet reuse badge requests. */
export function useNavBadges(): Record<string, number> {
  const { data: feed } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<NotificationFeed>('/api/notifications'),
    refetchInterval: 60_000,
  });
  const { data: tasks } = useQuery({
    queryKey: ['tasks', 'follow-up'],
    queryFn: () => api.get<TaskRow[]>('/api/views/tasks?done=0'),
    staleTime: 60_000,
  });
  return {
    '/tasks': feed?.counts.task ?? 0,
    '/follow-up': tasks ? selectNeedsNudge(tasks).length : 0,
  };
}
