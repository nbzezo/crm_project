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
import { foldText } from './format';
import { PICKLISTS, STAGES, STAGE_PROBABILITY } from '@workflow/contracts';
import {
  ACCOUNT_SIZES,
  ACCOUNT_SOURCES,
  DOC_TYPE_ORDER,
  LOST_REASON_ORDER,
  STAGE_COLORS,
  STAGE_FALLBACK_COLOR,
  t,
} from '../i18n/vi';

export type StageCategory = 'open' | 'won' | 'lost';

export interface PipelineStage {
  id: number;
  pipeline_id: number;
  key: string;
  label: string;
  category: StageCategory;
  position: number;
  color: string | null;
  probability: number;
  is_active: 0 | 1;
  gate_bant_min: number | null;
  require_economic_buyer: 0 | 1;
  track_poc: 0 | 1;
  max_days_in_stage: number | null;
}

export interface Pipeline {
  id: number;
  name: string;
  is_default: 0 | 1;
  stages: PipelineStage[];
}

export interface CrmConfig {
  picklists: Record<PicklistKey, PicklistItem[]>;
  pipelines: Pipeline[];
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

/** Pipeline gốc (giống migration v64) — dùng trước khi nạp xong và trong test. */
const DEFAULT_PIPELINE: Pipeline = {
  id: 1,
  name: 'Bán hàng',
  is_default: 1,
  stages: STAGES.map((key, index) => ({
    id: -(index + 1),
    pipeline_id: 1,
    key,
    label: t.stage[key] ?? key,
    category: key === 'won' ? 'won' : key === 'lost' ? 'lost' : 'open',
    position: index + 1,
    color: STAGE_COLORS[key] ?? null,
    probability: STAGE_PROBABILITY[key],
    is_active: 1,
    gate_bant_min: key === 'quoted' ? 7 : key === 'negotiating' ? 9 : null,
    require_economic_buyer: key === 'negotiating' ? 1 : 0,
    track_poc: key === 'poc' ? 1 : 0,
    max_days_in_stage: null,
  })),
};

export const DEFAULT_CRM_CONFIG: CrmConfig = {
  pipelines: [DEFAULT_PIPELINE],
  picklists: {
    lost_reason: seed('lost_reason', LOST_REASON_ORDER, t.lostReason),
    interaction_type: seed(
      'interaction_type',
      Object.keys(t.interactionType),
      t.interactionType as Record<string, string>
    ),
    doc_type: seed('doc_type', DOC_TYPE_ORDER, t.docType),
    customer_industry: [],
    customer_size: seed('customer_size', ACCOUNT_SIZES, {}),
    customer_source: seed('customer_source', ACCOUNT_SOURCES, {}),
    deal_source: seed('deal_source', ACCOUNT_SOURCES, {}),
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
        pipelines: config.pipelines?.length ? config.pipelines : DEFAULT_CRM_CONFIG.pipelines,
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

/** Giá trị lưu trong bản ghi của một mục: khoá, hoặc chính nhãn (danh mục lưu nhãn). */
export function storedValue(list: PicklistKey, item: PicklistItem): string {
  return PICKLISTS[list].storage === 'key' ? item.item_key : item.label;
}

function labelIn(config: CrmConfig, list: PicklistKey, value: string | null | undefined): string {
  if (!value) return '';
  if (PICKLISTS[list].storage === 'label') return value;
  return config.picklists[list]?.find((item) => item.item_key === value)?.label ?? value;
}

/**
 * Các lựa chọn cho một ô chọn: mục đang bật, cộng mục đang ẩn nếu bản ghi đang
 * mang sẵn nó (`current`) — để mở lại bản ghi cũ không bị mất giá trị.
 */
function optionsIn(config: CrmConfig, list: PicklistKey, current?: string | null) {
  return (config.picklists[list] ?? []).filter(
    (item) => item.is_active === 1 || (current != null && storedValue(list, item) === current)
  );
}

export interface PicklistChoice {
  value: string;
  label: string;
  /** Giá trị bản ghi đang mang nhưng không còn trong danh mục (dữ liệu cũ). */
  missing?: boolean;
}

/**
 * Lựa chọn sẵn cho `<select>`: giá trị + nhãn. Bản ghi đang mang một giá trị không
 * có trong danh mục thì vẫn có một dòng cho nó, để mở form không âm thầm xoá mất.
 */
function choicesIn(config: CrmConfig, list: PicklistKey, current?: string | null) {
  const choices: PicklistChoice[] = optionsIn(config, list, current).map((item) => ({
    value: storedValue(list, item),
    label: item.label,
  }));
  if (current && !choices.some((choice) => choice.value === current))
    choices.push({ value: current, label: current, missing: true });
  return choices;
}

/**
 * Đưa một giá trị gõ tự do (AI điền, dán từ nơi khác) về đúng giá trị trong danh
 * mục nếu khớp khi bỏ dấu và hoa thường; không khớp thì trả lại nguyên văn.
 */
export function matchPicklistValue(list: PicklistKey, raw: string): string {
  const folded = foldText(raw.trim());
  const item = (useCrmConfigStore.getState().config.picklists[list] ?? []).find(
    (entry) => foldText(entry.label) === folded || foldText(entry.item_key) === folded
  );
  return item ? storedValue(list, item) : raw;
}

export function pickChoices(list: PicklistKey, current?: string | null): PicklistChoice[] {
  return choicesIn(useCrmConfigStore.getState().config, list, current);
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
      choices: (list: PicklistKey, current?: string | null) => choicesIn(config, list, current),
      items: (list: PicklistKey) => config.picklists[list] ?? [],
    }),
    [config]
  );
}

/* ---------- Giai đoạn cơ hội (1.26.0) ----------

   Giao diện không gọi tên giai đoạn ('won', 'negotiating'…): hỏi loại (`category`)
   và thuộc tính (`track_poc`, `gate_bant_min`…). Các hàm dưới đọc pipeline mặc định
   — giao diện hiện chỉ có một. */

function pipelineIn(config: CrmConfig): Pipeline {
  return (
    config.pipelines.find((pipeline) => pipeline.is_default === 1) ??
    config.pipelines[0] ??
    DEFAULT_PIPELINE
  );
}

function stageIn(config: CrmConfig, key: string | null | undefined): PipelineStage | undefined {
  if (!key) return undefined;
  for (const pipeline of config.pipelines) {
    const stage = pipeline.stages.find((entry) => entry.key === key);
    if (stage) return stage;
  }
  return undefined;
}

const state = () => useCrmConfigStore.getState().config;

export function defaultPipeline(): Pipeline {
  return pipelineIn(state());
}

/** Thuộc tính đầy đủ của một giai đoạn (undefined nếu không có trong cấu hình). */
export function stageMeta(key: string | null | undefined): PipelineStage | undefined {
  return stageIn(state(), key);
}

export function stageLabel(key: string | null | undefined): string {
  return stageIn(state(), key)?.label ?? key ?? '';
}

export function stageColor(key: string | null | undefined): string {
  return stageIn(state(), key)?.color ?? STAGE_FALLBACK_COLOR;
}

export function stageProbability(key: string | null | undefined): number {
  return stageIn(state(), key)?.probability ?? 0;
}

/** Giai đoạn chưa biết coi như đang mở — an toàn hơn là coi như đã chốt. */
export function stageCategory(key: string | null | undefined): StageCategory {
  return stageIn(state(), key)?.category ?? 'open';
}

export function isClosedStage(key: string | null | undefined): boolean {
  return stageCategory(key) !== 'open';
}

/**
 * Khoá giai đoạn theo thứ tự hiển thị. Mặc định chỉ giai đoạn đang dùng; truyền
 * `include` để giữ thêm một giai đoạn đã ẩn mà bản ghi đang mang.
 */
export function stageKeys(options: { include?: string | null; all?: boolean } = {}): string[] {
  return pipelineIn(state())
    .stages.filter((stage) => options.all || stage.is_active === 1 || stage.key === options.include)
    .map((stage) => stage.key);
}

export function openStageKeys(): string[] {
  return pipelineIn(state())
    .stages.filter((stage) => stage.category === 'open' && stage.is_active === 1)
    .map((stage) => stage.key);
}

/** Giai đoạn mở đầu tiên — nơi cơ hội mới bắt đầu. */
export function startStageKey(): string {
  return openStageKeys()[0] ?? 'lead';
}

/** Khoá giai đoạn Thắng / Thua của pipeline mặc định. */
export function closedStageKey(category: Exclude<StageCategory, 'open'>): string {
  return pipelineIn(state()).stages.find((stage) => stage.category === category)?.key ?? category;
}

/**
 * Giai đoạn "đầu phễu": hai giai đoạn mở đầu tiên. Ở đó chưa chấm điểm nào là
 * bình thường (khách còn đang được tìm hiểu), không phải dấu hiệu bỏ quên.
 */
export function isEarlyStage(key: string | null | undefined): boolean {
  return key != null && openStageKeys().slice(0, 2).includes(key);
}

/** Hook cho màn hình cần vẽ lại khi pipeline đổi (Cài đặt, Kanban). */
export function usePipeline(): Pipeline {
  return useCrmConfigStore((store) => pipelineIn(store.config));
}
