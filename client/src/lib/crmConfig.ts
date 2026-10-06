/**
 * Cấu hình nghiệp vụ CRM đọc từ máy chủ (`GET /api/crm-config`, từ 1.24.0).
 *
 * Danh mục (lý do thất bại, loại tương tác, loại tài liệu…) là dữ liệu do quản trị
 * viên tự sửa, không còn là hằng số. Kho này giữ bản mới nhất cho cả ứng dụng:
 * `useCrmConfigLoader()` nạp một lần khi vào app, mọi chỗ hiển thị dùng
 * `usePicklist()` (component) hoặc `pickLabel()` (hàm thường).
 *
 * Giá trị khởi tạo là danh mục gốc trong `i18n/vi.ts`, nên trước khi nạp xong
 * (và trong test) giao diện vẫn hiện đúng nhãn thay vì hiện khoá.
 */
import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { create } from 'zustand';
import type { PicklistItem, PicklistKey } from '@workflow/contracts';
import { api } from '../api/client';
import { DOC_TYPE_ORDER, LOST_REASON_ORDER, t } from '../i18n/vi';

export interface CrmConfig {
  picklists: Record<PicklistKey, PicklistItem[]>;
}

export const CRM_CONFIG_QUERY_KEY = ['crm-config'] as const;

function seed(list: PicklistKey, keys: readonly string[], labels: Record<string, string>) {
  return keys.map((key, index): PicklistItem => ({
    id: -(index + 1),
    list_key: list,
    item_key: key,
    label: labels[key] ?? key,
    color: null,
    position: index + 1,
    is_active: 1,
    is_system: key === 'other' ? 1 : 0,
  }));
}

export const DEFAULT_CRM_CONFIG: CrmConfig = {
  picklists: {
    lost_reason: seed('lost_reason', LOST_REASON_ORDER, t.lostReason),
    interaction_type: seed(
      'interaction_type',
      Object.keys(t.interactionType),
      t.interactionType as Record<string, string>
    ),
    doc_type: seed('doc_type', DOC_TYPE_ORDER, t.docType),
  },
};

interface CrmConfigState {
  config: CrmConfig;
  /** Đã nhận bản từ máy chủ ít nhất một lần. */
  loaded: boolean;
  setConfig: (config: CrmConfig) => void;
}

export const useCrmConfigStore = create<CrmConfigState>((set) => ({
  config: DEFAULT_CRM_CONFIG,
  loaded: false,
  setConfig: (config) =>
    set({
      loaded: true,
      config: {
        ...DEFAULT_CRM_CONFIG,
        ...config,
        picklists: { ...DEFAULT_CRM_CONFIG.picklists, ...config.picklists },
      },
    }),
}));

/**
 * Nạp cấu hình khi vào app; lưu ở Cài đặt thì invalidate `CRM_CONFIG_QUERY_KEY`.
 *
 * Trả về `true` khi đã có bản từ máy chủ (hoặc nạp lỗi — khi đó dùng danh mục gốc).
 * App chờ cờ này trước khi vẽ trang, nên `pickLabel()` gọi ở bất kỳ đâu đều đọc
 * đúng bản mới ngay lần vẽ đầu.
 */
export function useCrmConfigLoader(): boolean {
  const setConfig = useCrmConfigStore((state) => state.setConfig);
  const loaded = useCrmConfigStore((state) => state.loaded);
  const query = useQuery({
    queryKey: CRM_CONFIG_QUERY_KEY,
    queryFn: () => api.get<CrmConfig>('/api/crm-config'),
    staleTime: Infinity,
  });
  useEffect(() => {
    if (query.data) setConfig(query.data);
  }, [query.data, setConfig]);
  return loaded || query.isError;
}

function labelIn(config: CrmConfig, list: PicklistKey, value: string | null | undefined): string {
  if (!value) return '';
  return config.picklists[list]?.find((item) => item.item_key === value)?.label ?? value;
}

/**
 * Các lựa chọn cho một ô chọn: mục đang bật, cộng mục đang ẩn nếu bản ghi đang
 * mang sẵn nó (`current`) — để mở lại bản ghi cũ không bị mất giá trị.
 */
function optionsIn(config: CrmConfig, list: PicklistKey, current?: string | null) {
  return (config.picklists[list] ?? []).filter(
    (item) => item.is_active === 1 || (current != null && item.item_key === current)
  );
}

/** Nhãn của một giá trị danh mục, dùng ngoài component (đọc bản cấu hình hiện tại). */
export function pickLabel(list: PicklistKey, value: string | null | undefined): string {
  return labelIn(useCrmConfigStore.getState().config, list, value);
}

/** Lựa chọn cho ô chọn, dùng ngoài hook. Xem `optionsIn`. */
export function pickOptions(list: PicklistKey, current?: string | null): PicklistItem[] {
  return optionsIn(useCrmConfigStore.getState().config, list, current);
}

/** Hook cho component: tự vẽ lại khi cấu hình đổi. */
export function usePicklist() {
  const config = useCrmConfigStore((state) => state.config);
  return useMemo(
    () => ({
      label: (list: PicklistKey, value: string | null | undefined) => labelIn(config, list, value),
      options: (list: PicklistKey, current?: string | null) => optionsIn(config, list, current),
      items: (list: PicklistKey) => config.picklists[list] ?? [],
    }),
    [config]
  );
}
