import crypto from 'node:crypto';
import type { Database } from 'better-sqlite3';
import { generateWithProvider } from './providers.ts';
import { providerConnection } from './configService.ts';
import {
  AiProviderError,
  type AiProviderName,
  type AiRunRequest,
  type AiRunResult,
  type ModelCapabilities,
} from './types.ts';

interface GatewayConfig {
  provider: AiProviderName;
  base_url: string;
  enabled: number;
  default_model: string | null;
  fast_model: string | null;
  reasoning_model: string | null;
  daily_token_limit: number;
  daily_cost_limit_usd: number | null;
  input_cost_per_million_usd: number | null;
  output_cost_per_million_usd: number | null;
}

function estimateCost(config: GatewayConfig, inputTokens: number, outputTokens: number) {
  if (config.input_cost_per_million_usd === null || config.output_cost_per_million_usd === null)
    return null;
  return (
    (inputTokens * config.input_cost_per_million_usd +
      outputTokens * config.output_cost_per_million_usd) /
    1_000_000
  );
}

function modelFor(config: GatewayConfig, request: AiRunRequest): string | null {
  if (request.model) return request.model;
  if (request.mode === 'fast') return config.fast_model ?? config.default_model;
  if (request.mode === 'reasoning') return config.reasoning_model ?? config.default_model;
  return config.default_model ?? config.fast_model ?? config.reasoning_model;
}

/**
 * Model nay co lam duoc viec dang can khong?
 *
 * Nang luc duoc luu vao ai_models luc dong bo. Khong tim thay dong nao thi coi nhu
 * KHONG dap ung — tha bo qua mot nha cung cap con hon gui tep cho model khong doc
 * duoc roi bao loi kho hieu cho nguoi dung.
 */
function modelSupports(
  db: Database,
  provider: AiProviderName,
  model: string,
  capability: keyof ModelCapabilities
): boolean {
  const row = db
    .prepare(`SELECT capabilities_json FROM ai_models WHERE provider = ? AND model_id = ?`)
    .get(provider, model) as { capabilities_json: string } | undefined;
  if (!row) return false;
  try {
    return Boolean((JSON.parse(row.capabilities_json) as ModelCapabilities)[capability]);
  } catch {
    return false;
  }
}

function usageToday(db: Database, provider: AiProviderName) {
  return db
    .prepare(
      `SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens,
              COALESCE(SUM(estimated_cost_usd), 0) AS cost
         FROM ai_usage_logs
        WHERE provider = ? AND date(created_at) = date('now','localtime') AND status = 'success'`
    )
    .get(provider) as { tokens: number; cost: number };
}

function saveUsage(
  db: Database,
  values: {
    requestId: string;
    task: string;
    provider?: AiProviderName;
    model?: string;
    contextType?: string;
    contextId?: number;
    inputTokens?: number;
    outputTokens?: number;
    estimatedCostUsd?: number | null;
    latencyMs: number;
    status: 'success' | 'error' | 'blocked';
    fallbackCount: number;
    errorCode?: string;
  }
) {
  db.prepare(
    `INSERT INTO ai_usage_logs
      (request_id, task, provider, model, context_type, context_id, input_tokens, output_tokens,
       estimated_cost_usd, latency_ms, status, fallback_count, error_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    values.requestId,
    values.task,
    values.provider ?? null,
    values.model ?? null,
    values.contextType ?? null,
    values.contextId ?? null,
    values.inputTokens ?? 0,
    values.outputTokens ?? 0,
    values.estimatedCostUsd ?? null,
    values.latencyMs,
    values.status,
    values.fallbackCount,
    values.errorCode ?? null
  );
}

export async function runAi(db: Database, request: AiRunRequest): Promise<AiRunResult> {
  const requestId = crypto.randomUUID();
  const started = Date.now();
  const configs = db
    .prepare(
      `SELECT provider, base_url, enabled, default_model, fast_model, reasoning_model,
              daily_token_limit, daily_cost_limit_usd, input_cost_per_million_usd,
              output_cost_per_million_usd
         FROM ai_provider_configs WHERE enabled = 1 AND status = 'ready'`
    )
    .all() as GatewayConfig[];
  const ordered = request.provider
    ? [
        ...configs.filter((config) => config.provider === request.provider),
        ...configs.filter((config) => config.provider !== request.provider),
      ]
    : configs;

  if (ordered.length === 0) {
    saveUsage(db, {
      requestId,
      task: request.task,
      contextType: request.contextType,
      contextId: request.contextId,
      latencyMs: Date.now() - started,
      status: 'blocked',
      fallbackCount: 0,
      errorCode: 'not_configured',
    });
    throw new AiProviderError(
      'Chưa có nhà cung cấp AI sẵn sàng. Hãy cấu hình trong Cài đặt.',
      'not_configured'
    );
  }

  let lastError: unknown;
  let fallbackCount = 0;
  let lastProvider: AiProviderName | undefined;
  let lastModel: string | undefined;

  for (const config of ordered) {
    const model = modelFor(config, request);
    const connection = providerConnection(db, config.provider);
    if (!model || !connection) continue;
    if (
      request.requiresCapability &&
      !modelSupports(db, config.provider, model, request.requiresCapability)
    ) {
      lastError = new AiProviderError(
        `Model ${model} không đọc được tệp đính kèm`,
        'capability_missing'
      );
      fallbackCount += 1;
      continue;
    }
    lastProvider = config.provider;
    lastModel = model;

    const used = usageToday(db, config.provider);
    if (config.daily_token_limit > 0 && used.tokens >= config.daily_token_limit) {
      lastError = new AiProviderError('Đã đạt giới hạn token trong ngày', 'token_quota');
      fallbackCount += 1;
      continue;
    }
    if (
      config.daily_cost_limit_usd !== null &&
      config.daily_cost_limit_usd > 0 &&
      used.cost >= config.daily_cost_limit_usd
    ) {
      lastError = new AiProviderError('Đã đạt giới hạn chi phí AI trong ngày', 'cost_quota');
      fallbackCount += 1;
      continue;
    }

    try {
      const result = await generateWithProvider(connection, {
        model,
        system: request.system,
        prompt: request.prompt,
        json: request.json,
        maxOutputTokens: request.maxOutputTokens,
        attachments: request.attachments,
      });
      const estimatedCostUsd = estimateCost(config, result.inputTokens, result.outputTokens);
      saveUsage(db, {
        requestId,
        task: request.task,
        provider: config.provider,
        model,
        contextType: request.contextType,
        contextId: request.contextId,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        estimatedCostUsd,
        latencyMs: Date.now() - started,
        status: 'success',
        fallbackCount,
      });
      return {
        ...result,
        requestId,
        provider: config.provider,
        model,
        fallbackCount,
        estimatedCostUsd,
      };
    } catch (error) {
      lastError = error;
      fallbackCount += 1;
    }
  }

  const providerError =
    lastError instanceof AiProviderError
      ? lastError
      : new AiProviderError('Không nhà cung cấp AI nào xử lý được yêu cầu', 'all_providers_failed');
  saveUsage(db, {
    requestId,
    task: request.task,
    provider: lastProvider,
    model: lastModel,
    contextType: request.contextType,
    contextId: request.contextId,
    latencyMs: Date.now() - started,
    status:
      providerError.code === 'token_quota' || providerError.code === 'cost_quota'
        ? 'blocked'
        : 'error',
    fallbackCount: Math.max(0, fallbackCount - 1),
    errorCode: providerError.code,
  });
  throw providerError;
}

/**
 * Goi AI va tra ve du lieu da qua schema, thay cho mau `schema.parse(parseAiJson(...))`
 * lap lai o tung route.
 *
 * Cho phep mot lan thu lai voi loi nhac chat hon: khong nha cung cap nao dam bao
 * duoc JSON dung cau truc (Anthropic khong co che do JSON that su), nen lan hong
 * dau tien la binh thuong chu chua phai loi. Lan thu hai hong thi moi bao loi.
 */
export async function runStructured<T>(
  db: Database,
  request: AiRunRequest,
  schema: { parse: (value: unknown) => T }
): Promise<{ data: T; meta: AiRunResult }> {
  const attempt = async (prompt: string) => {
    const meta = await runAi(db, { ...request, prompt, json: true });
    return { data: schema.parse(parseAiJson(meta.text)), meta };
  };

  try {
    return await attempt(request.prompt);
  } catch (error) {
    // Loi tu nha cung cap (het quota, mat mang) thi thu lai cung vo ich.
    if (error instanceof AiProviderError && error.code !== 'invalid_json') throw error;
    const reason = error instanceof Error ? error.message : String(error);
    return attempt(
      `${request.prompt}\n\nLan tra loi truoc khong dung dinh dang (${reason}). ` +
        'Lan nay chi tra ve DUY NHAT mot doi tuong JSON hop le, khong kem loi giai thich hay dau ```.'
    );
  }
}

export function parseAiJson<T>(text: string): T {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced ?? trimmed;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(candidate.slice(start, end + 1)) as T;
    throw new AiProviderError('Mô hình trả về JSON không hợp lệ', 'invalid_json', undefined, true);
  }
}
