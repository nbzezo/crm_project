/* Quay lui v41 — bo chu so huu khoi phien chat Tro ly AI. */

DROP INDEX IF EXISTS idx_ai_chat_sessions_user;

ALTER TABLE ai_chat_sessions DROP COLUMN user_id;

CREATE INDEX IF NOT EXISTS idx_ai_chat_sessions_updated ON ai_chat_sessions(updated_at DESC);
