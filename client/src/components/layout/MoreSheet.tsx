import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, NotebookPen, Palette } from 'lucide-react';
import { NavLink, useLocation } from 'react-router';
import { api } from '../../api/client';
import { backgroundStyle } from '../../lib/backgrounds';
import { usePermissionCheck } from '../../lib/permissions';
import { useUiStore } from '../../stores/uiStore';
import { useThemeStore, type ThemeMode } from '../../stores/themeStore';
import type { Board } from '../../types';
import { BottomSheet } from '../common/BottomSheet';
import {
  AI_NAV,
  NAV_GROUPS,
  SETTINGS_NAV,
  loadNavOrder,
  useCanOpenSettings,
  useGroupItems,
  useNavBadges,
  type NavItem,
} from './navConfig';

const THEMES: { mode: ThemeMode; label: string }[] = [
  { mode: 'light', label: 'Sáng' },
  { mode: 'dark', label: 'Tối' },
  { mode: 'zoho', label: 'Zoho CRM' },
  { mode: 'ubuntu', label: 'Ubuntu 26' },
  { mode: 'system', label: 'Theo hệ thống' },
];

export function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [showThemes, setShowThemes] = useState(false);
  const groupItems = useGroupItems(loadNavOrder());
  const canOpenSettings = useCanOpenSettings();
  const allowed = usePermissionCheck();
  const badges = useNavBadges();
  const pathname = useLocation().pathname;
  const openQuickNotesBoard = useUiStore((s) => s.openQuickNotesBoard);
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  const { data: boards = [] } = useQuery({
    queryKey: ['boards', false],
    queryFn: () => api.get<Board[]>('/api/boards'),
    enabled: open,
  });

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    const active = pathname === item.to || (item.to !== '/' && pathname.startsWith(item.to + '/'));
    return (
      <NavLink
        key={item.to}
        to={item.to}
        onClick={onClose}
        className="relative flex min-h-[68px] flex-col items-center justify-start gap-1 rounded-panel p-1 text-center text-xs text-tr-text"
      >
        <span
          className={`relative flex h-10 w-10 items-center justify-center rounded-panel ${active ? 'bg-tr-primary text-tr-on-primary' : 'bg-tr-primary/10 text-tr-primary'}`}
        >
          <Icon size={20} aria-hidden="true" />
          {(badges[item.to] ?? 0) > 0 && (
            <span className="absolute -right-2 -top-1 rounded-full bg-tr-danger px-1 text-[10px] text-white">
              {badges[item.to] > 9 ? '9+' : badges[item.to]}
            </span>
          )}
        </span>
        <span className="line-clamp-2">{item.label}</span>
      </NavLink>
    );
  };
  const daily = NAV_GROUPS.find((group) => group.id === 'daily');
  const projects = NAV_GROUPS.find((group) => group.id === 'projects');
  const sales = NAV_GROUPS.find((group) => group.id === 'sales');
  const starred = boards.filter((board) => board.is_starred).slice(0, 5);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={showThemes ? 'Giao diện' : 'Tất cả mục'}
      onBack={showThemes ? () => setShowThemes(false) : undefined}
      closeLabel="Đóng tất cả mục"
    >
      {showThemes ? (
        <div className="space-y-1">
          {THEMES.map((theme) => (
            <button
              key={theme.mode}
              type="button"
              role="menuitemradio"
              aria-checked={mode === theme.mode}
              onClick={() => {
                setMode(theme.mode);
                onClose();
              }}
              className="flex min-h-11 w-full items-center justify-between rounded-control px-3 text-left text-sm text-tr-text hover:bg-tr-hover"
            >
              <span>{theme.label}</span>
              {mode === theme.mode && <Check size={18} />}
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <section aria-label="Hôm nay">
            <h3 className="mb-2 text-sm font-semibold text-tr-muted">Hôm nay</h3>
            <div className="grid grid-cols-4 gap-1">
              {daily &&
                groupItems(daily)
                  .filter((item) => item.to === '/calendar')
                  .map(renderItem)}
              {allowed('ai:read') && renderItem(AI_NAV)}
              {allowed('notes:read') && (
                <button
                  type="button"
                  onClick={() => {
                    openQuickNotesBoard();
                    onClose();
                  }}
                  className="flex min-h-[68px] flex-col items-center gap-1 rounded-panel p-1 text-xs text-tr-text"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-panel bg-tr-primary/10 text-tr-primary">
                    <NotebookPen size={20} />
                  </span>
                  Ghi nhanh
                </button>
              )}
            </div>
          </section>
          {projects && (
            <section aria-label="Dự án">
              <h3 className="mb-2 text-sm font-semibold text-tr-muted">Dự án</h3>
              <div className="grid grid-cols-4 gap-1">{groupItems(projects).map(renderItem)}</div>
            </section>
          )}
          {sales && (
            <section aria-label="Kinh doanh">
              <h3 className="mb-2 text-sm font-semibold text-tr-muted">Kinh doanh</h3>
              <div className="grid grid-cols-4 gap-1">
                {groupItems(sales).map(renderItem)}
                {canOpenSettings && renderItem(SETTINGS_NAV)}
              </div>
            </section>
          )}
          {starred.length > 0 && (
            <section aria-label="Bảng đã ghim">
              <h3 className="mb-2 text-sm font-semibold text-tr-muted">Bảng đã ghim</h3>
              <div className="flex gap-2 overflow-x-auto">
                {starred.map((board) => (
                  <NavLink
                    key={board.id}
                    to={`/boards/${board.id}`}
                    onClick={onClose}
                    className="flex h-11 shrink-0 items-center gap-2 rounded-control border border-tr-border px-3 text-sm text-tr-text"
                  >
                    <span className="h-5 w-5 rounded" style={backgroundStyle(board.background)} />
                    {board.name}
                  </NavLink>
                ))}
              </div>
            </section>
          )}
          <button
            type="button"
            onClick={() => setShowThemes(true)}
            className="flex min-h-11 w-full items-center gap-2 border-t border-tr-border px-2 pt-3 text-left text-sm text-tr-text"
          >
            <Palette size={18} /> Giao diện · {THEMES.find((theme) => theme.mode === mode)?.label}
          </button>
        </div>
      )}
    </BottomSheet>
  );
}
