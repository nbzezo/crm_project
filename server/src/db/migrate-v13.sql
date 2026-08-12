-- v13: Nen tang AI Copilot da nha cung cap, hanh dong co phe duyet, RAG va automation.

CREATE TABLE ai_provider_configs (
  provider TEXT PRIMARY KEY CHECK (provider IN ('gemini','anthropic','deepseek')),
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

INSERT INTO ai_provider_configs (provider, display_name, base_url) VALUES
  ('gemini', 'Google Gemini', 'https://generativelanguage.googleapis.com'),
  ('anthropic', 'Anthropic Claude', 'https://api.anthropic.com'),
  ('deepseek', 'DeepSeek', 'https://api.deepseek.com');

CREATE TABLE ai_models (
  id INTEGER PRIMARY KEY,
  provider TEXT NOT NULL REFERENCES ai_provider_configs(provider) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  capabilities_json TEXT NOT NULL DEFAULT '{}',
  input_token_limit INTEGER,
  output_token_limit INTEGER,
  is_available INTEGER NOT NULL DEFAULT 1,
  discovered_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE(provider, model_id)
);
CREATE INDEX idx_ai_models_provider ON ai_models(provider, is_available, model_id);

CREATE TABLE ai_usage_logs (
  id INTEGER PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  task TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  context_type TEXT,
  context_id INTEGER,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd REAL,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('success','error','blocked')),
  fallback_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_ai_usage_created ON ai_usage_logs(created_at DESC);
CREATE INDEX idx_ai_usage_provider ON ai_usage_logs(provider, created_at DESC);

CREATE TABLE ai_feedback (
  id INTEGER PRIMARY KEY,
  request_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('accepted','edited','rejected','helpful','unhelpful')),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_ai_feedback_request ON ai_feedback(request_id, created_at DESC);

CREATE TABLE ai_action_proposals (
  id INTEGER PRIMARY KEY,
  request_id TEXT,
  action_type TEXT NOT NULL CHECK (
    action_type IN ('create_task','create_reminder','update_deal_next_action','create_interaction')
  ),
  title TEXT NOT NULL,
  explanation TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','executed','failed')),
  execution_result_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  decided_at TEXT,
  executed_at TEXT
);
CREATE INDEX idx_ai_actions_status ON ai_action_proposals(status, created_at DESC);

CREATE TABLE ai_document_chunks (
  id INTEGER PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  search_text TEXT NOT NULL DEFAULT '',
  source_label TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE(document_id, chunk_index)
);
CREATE INDEX idx_ai_chunks_document ON ai_document_chunks(document_id, chunk_index);
CREATE VIRTUAL TABLE ai_document_chunks_fts USING fts5(
  content,
  search_text,
  content='ai_document_chunks',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);
CREATE TRIGGER ai_document_chunks_ai AFTER INSERT ON ai_document_chunks BEGIN
  INSERT INTO ai_document_chunks_fts(rowid, content, search_text)
  VALUES (new.id, new.content, new.search_text);
END;
CREATE TRIGGER ai_document_chunks_ad AFTER DELETE ON ai_document_chunks BEGIN
  INSERT INTO ai_document_chunks_fts(ai_document_chunks_fts, rowid, content, search_text)
  VALUES ('delete', old.id, old.content, old.search_text);
END;
CREATE TRIGGER ai_document_chunks_au AFTER UPDATE ON ai_document_chunks BEGIN
  INSERT INTO ai_document_chunks_fts(ai_document_chunks_fts, rowid, content, search_text)
  VALUES ('delete', old.id, old.content, old.search_text);
  INSERT INTO ai_document_chunks_fts(rowid, content, search_text)
  VALUES (new.id, new.content, new.search_text);
END;

CREATE TABLE ai_automations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  automation_type TEXT NOT NULL CHECK (
    automation_type IN ('pipeline_risk','overdue_followup','contract_expiry','daily_brief')
  ),
  enabled INTEGER NOT NULL DEFAULT 0,
  interval_minutes INTEGER NOT NULL DEFAULT 1440 CHECK (interval_minutes BETWEEN 15 AND 10080),
  config_json TEXT NOT NULL DEFAULT '{}',
  last_run_at TEXT,
  next_run_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

INSERT INTO ai_automations (name, automation_type, interval_minutes, config_json) VALUES
  ('Cảnh báo rủi ro pipeline', 'pipeline_risk', 360, '{"inactive_days":14,"min_value_vnd":0}'),
  ('Theo dõi Next Action quá hạn', 'overdue_followup', 180, '{}'),
  ('Hợp đồng sắp hết hạn', 'contract_expiry', 1440, '{"days":30}'),
  ('Kế hoạch làm việc hằng ngày', 'daily_brief', 1440, '{}');

CREATE TABLE ai_automation_runs (
  id INTEGER PRIMARY KEY,
  automation_id INTEGER NOT NULL REFERENCES ai_automations(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('success','error')),
  items_found INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  finished_at TEXT
);

CREATE TABLE ai_notifications (
  id INTEGER PRIMARY KEY,
  automation_id INTEGER REFERENCES ai_automations(id) ON DELETE SET NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  fingerprint TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE(fingerprint)
);
CREATE INDEX idx_ai_notifications_unread ON ai_notifications(is_read, created_at DESC);
