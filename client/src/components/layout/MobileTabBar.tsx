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
    allowed('tasks:read') && counts?.nudge && counts.nudge > 0
      ? {
          to: '/follow-up',
          label: 'Nhắc',
          icon: BellRing,
          badge: counts?.nudge ?? 0,
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

  // Nút "Tạo" luôn nằm giữa thanh: các tab trước và sau nó chia đều hai nửa còn lại,
  // nên khi tab "Nhắc" ẩn (chỉ còn 4 mục) nút không bị đẩy lệch sang phải.
  const createIndex = tabs.findIndex((tab) => tab.label === 'Tạo');
  const leftTabs = tabs.slice(0, createIndex);
  const createTab = tabs[createIndex];
  const rightTabs = tabs.slice(createIndex + 1);

  const renderTab = (tab: (typeof tabs)[number]) => {
    const Icon = tab.icon;
    if (tab.to) {
      return (
        <NavLink
          key={tab.label}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            `relative flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-xs ${isActive ? 'font-semibold text-tr-primary' : 'text-tr-muted'}`
          }
        >
          <span className="relative flex h-8 items-center">
            <Icon size={20} aria-hidden="true" />
            <Badge count={tab.badge ?? 0} tone={tab.tone} />
          </span>
          <span className="truncate">{tab.label}</span>
        </NavLink>
      );
    }
    const isCreate = tab === createTab;
    return (
      <button
        key={tab.label}
        type="button"
        onClick={tab.action}
        className={`relative flex h-14 min-w-0 flex-col items-center justify-center gap-0.5 text-xs text-tr-muted ${isCreate ? 'w-1/5 shrink-0' : 'flex-1'}`}
      >
        {/* Moi o bieu tuong cao h-8 nhu nhau de nhan "Tao" thang hang voi nhan cac tab khac;
            truoc day khoi nut Tao cao h-10 day nhan xuong sat mep man hinh. */}
        <span
          className={
            isCreate
              ? 'flex h-8 w-12 items-center justify-center rounded-panel bg-tr-primary text-tr-on-primary'
              : 'flex h-8 items-center'
          }
        >
          <Icon size={20} aria-hidden="true" />
        </span>
        <span className="truncate">{tab.label}</span>
      </button>
    );
  };

  return (
    <>
      <nav
        aria-label="Điều hướng chính"
        className="fixed inset-x-0 bottom-0 z-sticky flex border-t border-tr-border bg-tr-panel pb-[var(--tr-safe-bottom)] md:hidden [html[data-keyboard-open]_&]:hidden"
      >
        <div className="flex min-w-0 flex-1">{leftTabs.map(renderTab)}</div>
        {createTab ? renderTab(createTab) : null}
        <div className="flex min-w-0 flex-1">{rightTabs.map(renderTab)}</div>
      </nav>
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}
