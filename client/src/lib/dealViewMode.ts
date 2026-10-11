import { useCallback, useState } from 'react';
import { api } from '../api/client';
import { useAuthStore, type DealViewMode } from '../stores/authStore';
import { useUiStore } from '../stores/uiStore';

export type DealTab =
  'overview' | 'assessment' | 'score' | 'committee' | 'info' | 'notes' | 'handover';

const BASIC_TABS: { key: DealTab; label: string }[] = [
  { key: 'overview', label: 'Tổng quan' },
  { key: 'assessment', label: 'Đánh giá' },
  { key: 'committee', label: 'Người liên quan' },
  { key: 'info', label: 'Thông tin' },
  { key: 'notes', label: 'Trang tài liệu' },
  { key: 'handover', label: 'Bàn giao' },
];
const ADVANCED_TABS: { key: DealTab; label: string }[] = [
  { key: 'assessment', label: 'Đánh giá' },
  { key: 'score', label: 'Chấm điểm' },
  { key: 'committee', label: 'Nhóm quyết định' },
  { key: 'info', label: 'Thông tin' },
  { key: 'notes', label: 'Trang tài liệu' },
  { key: 'handover', label: 'Bàn giao' },
];

export function dealTabsFor(mode: DealViewMode) {
  return mode === 'basic' ? BASIC_TABS : ADVANCED_TABS;
}
export function resolveDealTab(mode: DealViewMode, requested: string | null | undefined): DealTab {
  const tabs = dealTabsFor(mode);
  return tabs.some((tab) => tab.key === requested) ? (requested as DealTab) : tabs[0].key;
}
export function influenceBucket(n: number): 'low' | 'medium' | 'high' {
  return n <= 2 ? 'low' : n === 3 ? 'medium' : 'high';
}
export function influenceValue(bucket: 'low' | 'medium' | 'high'): 2 | 3 | 5 {
  return bucket === 'low' ? 2 : bucket === 'medium' ? 3 : 5;
}

export function useDealViewMode() {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const pushToast = useUiStore((state) => state.pushToast);
  const [saving, setSaving] = useState(false);
  const mode: DealViewMode = user?.deal_view_mode ?? 'basic';
  const setMode = useCallback(
    async (next: DealViewMode) => {
      if (next === mode || saving) return;
      setSaving(true);
      try {
        setUser(await api.patch('/api/auth/me/preferences', { deal_view_mode: next }));
      } catch {
        pushToast('Không đổi được chế độ xem — thử lại sau.');
      } finally {
        setSaving(false);
      }
    },
    [mode, saving, setUser, pushToast]
  );
  return { mode, setMode, saving };
}
