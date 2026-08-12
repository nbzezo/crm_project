export type AiProviderName = 'gemini' | 'anthropic' | 'deepseek';
export type AiMode = 'fast' | 'balanced' | 'reasoning';

export interface AiModel {
  model_id: string;
  display_name: string;
  capabilities: {
    text?: boolean;
    structuredOutput?: boolean;
    toolCalling?: boolean;
    vision?: boolean;
    documentInput?: boolean;
    reasoning?: boolean;
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

export interface AiMeta {
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
