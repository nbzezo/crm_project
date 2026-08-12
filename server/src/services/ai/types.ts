export const AI_PROVIDERS = ['gemini', 'anthropic', 'deepseek'] as const;
export type AiProviderName = (typeof AI_PROVIDERS)[number];

export interface ModelCapabilities {
  text: boolean;
  structuredOutput: boolean;
  toolCalling: boolean;
  vision: boolean;
  documentInput: boolean;
  reasoning: boolean;
}

export interface DiscoveredModel {
  id: string;
  displayName: string;
  capabilities: ModelCapabilities;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
}

export interface ProviderConnection {
  provider: AiProviderName;
  baseUrl: string;
  apiKey: string;
}

export interface GenerateRequest {
  model: string;
  system: string;
  prompt: string;
  maxOutputTokens?: number;
  temperature?: number;
  json?: boolean;
}

export interface GenerateResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export type AiTaskMode = 'fast' | 'balanced' | 'reasoning';

export interface AiRunRequest {
  task: string;
  mode?: AiTaskMode;
  provider?: AiProviderName;
  model?: string;
  system: string;
  prompt: string;
  json?: boolean;
  maxOutputTokens?: number;
  contextType?: string;
  contextId?: number;
}

export interface AiRunResult extends GenerateResult {
  requestId: string;
  provider: AiProviderName;
  model: string;
  fallbackCount: number;
  estimatedCostUsd: number | null;
}

export class AiProviderError extends Error {
  code: string;
  status?: number;
  retryable: boolean;

  constructor(message: string, code: string, status?: number, retryable = false) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}
