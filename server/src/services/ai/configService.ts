import type { Database } from 'better-sqlite3';
import { decryptSecret, encryptSecret } from './secretStore.ts';
import { defaultProviderUrl, listProviderModels } from './providers.ts';
import type { AiProviderName, DiscoveredModel, ProviderConnection } from './types.ts';

interface ProviderSecretRow {
  provider: AiProviderName;
  display_name: string;
  base_url: string;
  api_key_ciphertext: string;
  api_key_iv: string;
  api_key_tag: string;
  enabled: number;
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
  created_at: string;
  updated_at: string;
}

export interface ProviderUpdate {
  baseUrl?: string;
  apiKey?: string;
  clearApiKey?: boolean;
  enabled?: boolean;
  defaultModel?: string | null;
  fastModel?: string | null;
  reasoningModel?: string | null;
  dailyTokenLimit?: number;
  dailyCostLimitUsd?: number | null;
  inputCostPerMillionUsd?: number | null;
  outputCostPerMillionUsd?: number | null;
}

function row(db: Database, provider: AiProviderName): ProviderSecretRow {
  return db
    .prepare(`SELECT * FROM ai_provider_configs WHERE provider = ?`)
    .get(provider) as ProviderSecretRow;
}

function redactKey(apiKey: string): string | null {
  if (!apiKey) return null;
  return `••••${apiKey.slice(-4)}`;
}

export function providerConnection(
  db: Database,
  provider: AiProviderName
): ProviderConnection | null {
  const config = row(db, provider);
  const apiKey = decryptSecret({
    ciphertext: config.api_key_ciphertext,
    iv: config.api_key_iv,
    tag: config.api_key_tag,
  });
  if (!apiKey) return null;
  return { provider, baseUrl: config.base_url, apiKey };
}

export function listProviderConfigs(db: Database) {
  const rows = db
    .prepare(`SELECT * FROM ai_provider_configs ORDER BY provider`)
    .all() as ProviderSecretRow[];
  return rows.map((config) => {
    const apiKey = decryptSecret({
      ciphertext: config.api_key_ciphertext,
      iv: config.api_key_iv,
      tag: config.api_key_tag,
    });
    return {
      provider: config.provider,
      display_name: config.display_name,
      base_url: config.base_url,
      enabled: Boolean(config.enabled),
      has_api_key: Boolean(apiKey),
      api_key_hint: redactKey(apiKey),
      default_model: config.default_model,
      fast_model: config.fast_model,
      reasoning_model: config.reasoning_model,
      daily_token_limit: config.daily_token_limit,
      daily_cost_limit_usd: config.daily_cost_limit_usd,
      input_cost_per_million_usd: config.input_cost_per_million_usd,
      output_cost_per_million_usd: config.output_cost_per_million_usd,
      last_tested_at: config.last_tested_at,
      status: config.status,
      last_error: config.last_error,
      models: db
        .prepare(
          `SELECT model_id, display_name, capabilities_json, input_token_limit, output_token_limit,
                  is_available, discovered_at
             FROM ai_models WHERE provider = ? ORDER BY is_available DESC, display_name`
        )
        .all(config.provider)
        .map((model) => {
          const value = model as Record<string, unknown>;
          return {
            ...value,
            is_available: Boolean(value.is_available),
            capabilities: JSON.parse(String(value.capabilities_json ?? '{}')) as unknown,
            capabilities_json: undefined,
          };
        }),
    };
  });
}

export function updateProviderConfig(
  db: Database,
  provider: AiProviderName,
  update: ProviderUpdate
): void {
  const current = row(db, provider);
  const nextBaseUrl = (update.baseUrl ?? current.base_url ?? defaultProviderUrl(provider))
    .trim()
    .replace(/\/+$/, '');

  let encrypted = {
    ciphertext: current.api_key_ciphertext,
    iv: current.api_key_iv,
    tag: current.api_key_tag,
  };
  if (update.clearApiKey) encrypted = encryptSecret('');
  else if (update.apiKey?.trim()) encrypted = encryptSecret(update.apiKey.trim());

  const hasKey = Boolean(encrypted.ciphertext);
  const enabled = update.enabled === undefined ? Boolean(current.enabled) : update.enabled;
  db.prepare(
    `UPDATE ai_provider_configs
        SET base_url = ?, api_key_ciphertext = ?, api_key_iv = ?, api_key_tag = ?, enabled = ?,
            default_model = ?, fast_model = ?, reasoning_model = ?, daily_token_limit = ?,
            daily_cost_limit_usd = ?, input_cost_per_million_usd = ?,
            output_cost_per_million_usd = ?, status = ?, last_error = NULL,
            updated_at = datetime('now','localtime')
      WHERE provider = ?`
  ).run(
    nextBaseUrl,
    encrypted.ciphertext,
    encrypted.iv,
    encrypted.tag,
    enabled && hasKey ? 1 : 0,
    update.defaultModel === undefined ? current.default_model : update.defaultModel,
    update.fastModel === undefined ? current.fast_model : update.fastModel,
    update.reasoningModel === undefined ? current.reasoning_model : update.reasoningModel,
    update.dailyTokenLimit ?? current.daily_token_limit,
    update.dailyCostLimitUsd === undefined
      ? current.daily_cost_limit_usd
      : update.dailyCostLimitUsd,
    update.inputCostPerMillionUsd === undefined
      ? current.input_cost_per_million_usd
      : update.inputCostPerMillionUsd,
    update.outputCostPerMillionUsd === undefined
      ? current.output_cost_per_million_usd
      : update.outputCostPerMillionUsd,
    hasKey ? (update.apiKey?.trim() ? 'not_configured' : current.status) : 'not_configured',
    provider
  );
}

function chooseModels(models: DiscoveredModel[]) {
  const available = models.filter((model) => model.capabilities.text);
  const fast =
    available.find((model) => /flash-lite|flash|haiku|lite/i.test(model.id)) ?? available[0];
  const reasoning =
    available.find(
      (model) => model.capabilities.reasoning || /opus|pro|reason|thinking/i.test(model.id)
    ) ?? available[0];
  const balanced =
    available.find((model) => !/lite/i.test(model.id) && model.id !== reasoning?.id) ??
    fast ??
    reasoning;
  return {
    fast: fast?.id ?? null,
    balanced: balanced?.id ?? null,
    reasoning: reasoning?.id ?? null,
  };
}

export async function syncProviderModels(
  db: Database,
  provider: AiProviderName,
  transient?: { baseUrl?: string; apiKey?: string }
): Promise<DiscoveredModel[]> {
  const saved = row(db, provider);
  const connection = transient?.apiKey
    ? {
        provider,
        baseUrl: transient.baseUrl?.trim() || saved.base_url,
        apiKey: transient.apiKey.trim(),
      }
    : providerConnection(db, provider);
  if (!connection) throw new Error('Chưa cấu hình API key cho nhà cung cấp này');

  try {
    const models = await listProviderModels(connection);
    if (models.length === 0) throw new Error('API không trả về model sinh nội dung phù hợp');
    const selected = chooseModels(models);
    db.transaction(() => {
      db.prepare(`UPDATE ai_models SET is_available = 0 WHERE provider = ?`).run(provider);
      const upsert = db.prepare(
        `INSERT INTO ai_models
          (provider, model_id, display_name, capabilities_json, input_token_limit,
           output_token_limit, is_available, discovered_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now','localtime'))
         ON CONFLICT(provider, model_id) DO UPDATE SET
           display_name = excluded.display_name,
           capabilities_json = excluded.capabilities_json,
           input_token_limit = excluded.input_token_limit,
           output_token_limit = excluded.output_token_limit,
           is_available = 1,
           discovered_at = excluded.discovered_at`
      );
      for (const model of models) {
        upsert.run(
          provider,
          model.id,
          model.displayName,
          JSON.stringify(model.capabilities),
          model.inputTokenLimit ?? null,
          model.outputTokenLimit ?? null
        );
      }
      db.prepare(
        `UPDATE ai_provider_configs
            SET base_url = ?,
                default_model = CASE
                  WHEN default_model IS NULL OR NOT EXISTS (
                    SELECT 1 FROM ai_models m WHERE m.provider = ai_provider_configs.provider
                      AND m.model_id = ai_provider_configs.default_model AND m.is_available = 1
                  ) THEN ? ELSE default_model END,
                fast_model = CASE
                  WHEN fast_model IS NULL OR NOT EXISTS (
                    SELECT 1 FROM ai_models m WHERE m.provider = ai_provider_configs.provider
                      AND m.model_id = ai_provider_configs.fast_model AND m.is_available = 1
                  ) THEN ? ELSE fast_model END,
                reasoning_model = CASE
                  WHEN reasoning_model IS NULL OR NOT EXISTS (
                    SELECT 1 FROM ai_models m WHERE m.provider = ai_provider_configs.provider
                      AND m.model_id = ai_provider_configs.reasoning_model AND m.is_available = 1
                  ) THEN ? ELSE reasoning_model END,
                status = 'ready', last_error = NULL, last_tested_at = datetime('now','localtime'),
                updated_at = datetime('now','localtime')
          WHERE provider = ?`
      ).run(connection.baseUrl, selected.balanced, selected.fast, selected.reasoning, provider);
    })();
    return models;
  } catch (error) {
    db.prepare(
      `UPDATE ai_provider_configs SET status = 'error', last_error = ?,
              last_tested_at = datetime('now','localtime'), updated_at = datetime('now','localtime')
        WHERE provider = ?`
    ).run(error instanceof Error ? error.message.slice(0, 500) : 'Lỗi không xác định', provider);
    throw error;
  }
}
