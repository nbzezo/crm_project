/* ---------- v36: them 9Router nhu nha cung cap OpenAI-compatible ---------- */

CREATE TABLE ai_provider_configs_v36 (
  provider TEXT PRIMARY KEY CHECK (provider IN ('gemini','anthropic','deepseek','9router')),
  display_name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  api_key_ciphertext TEXT NOT NULL DEFAULT '',
  api_key_iv TEXT NOT NULL DEFAULT '',
  api_key_tag TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 0,
  default_model TEXT,
  fast_model TEXT,
  reasoning_model TEXT,
  daily_token_limit INTEGER NOT NULL DEFAULT 250000,
  daily_cost_limit_usd REAL,
  input_cost_per_million_usd REAL,
  output_cost_per_million_usd REAL,
  last_tested_at TEXT,
  status TEXT NOT NULL DEFAULT 'not_configured'
    CHECK (status IN ('not_configured','ready','error')),
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

INSERT INTO ai_provider_configs_v36 SELECT * FROM ai_provider_configs;
DROP TABLE ai_provider_configs;
ALTER TABLE ai_provider_configs_v36 RENAME TO ai_provider_configs;

INSERT INTO ai_provider_configs (provider, display_name, base_url)
VALUES ('9router', '9Router', 'http://127.0.0.1:20128/v1');
