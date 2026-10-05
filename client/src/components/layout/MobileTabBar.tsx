import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BellRing, LayoutDashboard, LayoutGrid, ListChecks, Plus } from 'lucide-react';
import { NavLink } from 'react-router';
import { api } from '../../api/client';
import { usePermissionCheck } from '../../lib/permissions';
import { useUiStore } from '../../stores/uiStore';
import type { NotificationFeed } from '../../types';
import { MoreSheet } from './MoreSheet';
import { useTaskCounts } from '../../hooks/useTaskCounts';

function Badge({ count, tone = 'primary' }: { count: number; tone?: 'primary' | 'danger' }) {
  if (!count) return null;
  return (
    <span
      className={`absolute -top-1 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-tr-on-primary ${tone === 'danger' ? 'bg-tr-danger' : 'bg-tr-primary'}`}
      aria-label={`${count} mục`}
    >
      {count > 9 ? '9+' : count}
    </span>
  );
}

export function MobileTabBar() {
  const allowed = usePermissionCheck();
  const [moreOpen, setMoreOpen] = useState(false);
  const setQuickCreateOpen = useUiStore((s) => s.setQuickCreateOpen);
  const { data: feed } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<NotificationFeed>('/api/notifications'),
    staleTime: 60_000,
  });
  const { data: counts } = useTaskCounts({ staleTime: 60_000 });
  const tabs = [
    { to: '/', label: 'Tổng quan', icon: LayoutDashboard, end: true },
    allowed('tasks:read')
      ? { to: '/tasks', label: 'Công việc', icon: ListChecks, badge: feed?.counts.task ?? 0 }
      : null,
    { action: () => setQuickCreateOpen(true), label: 'Tạo', icon: Plus },
    allowed('tasks:read')
      ? {
          to: '/follow-up',
          label: 'Theo dõi',
          icon: BellRing,
          badge: counts?.nudge ?? 0,
          tone: 'danger' as const,
        }
      : null,
    { action: () => setMoreOpen(true), label: 'Thêm', icon: LayoutGrid },
  ].filter(Boolean) as Array<{
    to?: string;
    label: string;
    icon: typeof Plus;
    end?: boolean;
    action?: () => void;
    badge?: number;
    tone?: 'primary' | 'danger';
  }>;

  return (
    <>
      <nav
        aria-label="Điều hướng chính"
        className="fixed inset-x-0 bottom-0 z-sticky flex border-t border-tr-border bg-tr-panel pb-[var(--tr-safe-bottom)] md:hidden [html[data-keyboard-open]_&]:hidden"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          if (tab.to) {
            return (
              <NavLink
                key={tab.label}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  `relative flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs ${isActive ? 'font-semibold text-tr-primary' : 'text-tr-muted'}`
                }
              >
                <Icon size={20} aria-hidden="true" />
                <span>{tab.label}</span>
                <Badge count={tab.badge ?? 0} tone={tab.tone} />
              </NavLink>
            );
          }
          return (
            <button
              key={tab.label}
              type="button"
              onClick={tab.action}
              className={`relative flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs ${tab.label === 'Tạo' ? 'text-tr-primary' : 'text-tr-muted'}`}
            >
              <span
                className={
                  tab.label === 'Tạo'
                    ? 'flex h-10 w-12 items-center justify-center rounded-panel bg-tr-primary text-tr-on-primary'
                    : ''
                }
              >
                <Icon size={20} aria-hidden="true" />
              </span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}
