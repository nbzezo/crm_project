import type { Priority } from '../types';

export type AiProviderName = 'gemini' | 'anthropic' | 'deepseek' | '9router';
export type AiMode = 'fast' | 'balanced' | 'reasoning';

export const TASK_LINK_KEYS = [
  'customer_id',
  'contact_id',
  'deal_id',
  'contract_id',
  'quotation_id',
] as const;
export type TaskLinkKey = (typeof TASK_LINK_KEYS)[number];

interface AiModel {
  model_id: string;
  display_name: string;
  capabilities: {
    text?: boolean;
    structuredOutput?: boolean;
    toolCalling?: boolean;
    vision?: boolean;
    documentInput?: boolean;
    reasoning?: boolean;
    /** Đọc trực tiếp dữ liệu audio — điều kiện để dùng cho chuyển ghi âm thành văn bản. */
    audioInput?: boolean;
  };
  input_token_limit: number | null;
  output_token_limit: number | null;
  is_available: boolean;
  discovered_at: string;
}

export interface AiProviderConfig {
  provider: AiProviderName;
  display_name: string;
  base_url: string;
  enabled: boolean;
  has_api_key: boolean;
  api_key_hint: string | null;
  default_model: string | null;
  fast_model: string | null;
  reasoning_model: string | null;
  daily_token_limit: number;
  daily_cost_limit_usd: number | null;
  input_cost_per_million_usd: number | null;
  output_cost_per_million_usd: number | null;
  last_tested_at: string | null;
  status: 'not_configured' | 'ready' | 'error';
  last_error: string | null;
  models: AiModel[];
}

/** Mẫu prompt xử lý ghi âm (chuyển văn bản/tóm tắt) — cấu hình trong Cài đặt. */
export interface VoicePromptTemplate {
  key: string;
  name: string;
  prompt: string;
}

/**
 * Model dùng cho chuyển ghi âm thành văn bản. Cả hai trường null = để hệ thống tự
 * chọn nhà cung cấp đọc được audio; chọn tay thì backend ghim cứng đúng model đó.
 */
export interface VoiceModelSetting {
  provider: AiProviderName | null;
  model: string | null;
}

interface AiMeta {
  requestId: string;
  provider: AiProviderName;
  model: string;
  inputTokens: number;
  outputTokens: number;
  fallbackCount: number;
  estimatedCostUsd: number | null;
}

export interface AiBriefResult {
  headline: string;
  summary: string;
  risks: string[];
  next_actions: string[];
  sources: string[];
  meta: AiMeta;
}

export interface AiActionProposal {
  id: number;
  request_id: string | null;
  action_type: 'create_task' | 'create_reminder' | 'update_deal_next_action' | 'create_interaction';
  title: string;
  explanation: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';
  execution_result: unknown;
  created_at: string;
}

export interface AiAskResult {
  answer: string;
  sources: string[];
  follow_up_questions: string[];
  proposal: AiActionProposal | null;
  meta: AiMeta;
}

/* ---------- Phiên chat với Trợ lý AI (v37) ---------- */

/** Một phiên trong danh sách bên phải — không kèm tin nhắn. */
export interface AiChatSession {
  id: number;
  /** Rỗng cho tới lượt hỏi đầu tiên; server tự lấy câu hỏi đó làm tiêu đề. */
  title: string;
  scope: 'crm' | 'documents' | 'all';
  created_at: string;
  updated_at: string;
  message_count: number;
}

/**
 * Tin nhắn đã lưu. `meta` giữ nguyên phần phụ của câu trả lời (nguồn, gợi ý
 * tiếp theo, đề xuất hành động, provider/model) để mở lại phiên cũ hiện đúng
 * như lúc vừa trả lời.
 */
export interface AiChatMessage {
  id: number;
  session_id: number;
  role: 'user' | 'assistant';
  content: string;
  meta: Omit<AiAskResult, 'answer'> | null;
  created_at: string;
}

export interface AiChatDetail extends AiChatSession {
  messages: AiChatMessage[];
}

/** Bản nháp công việc có cấu trúc do AI chuẩn hóa từ câu nhập tự nhiên. */
export interface TaskAssistResult {
  title: string;
  description: string;
  priority: Priority;
  start_date: string | null;
  due_date: string | null;
  checklist: string[];
  links: Record<TaskLinkKey, number | null>;
  confidence: number;
  rationale: string;
  warnings: string[];
  meta: Pick<AiMeta, 'requestId' | 'provider' | 'model'>;
}
