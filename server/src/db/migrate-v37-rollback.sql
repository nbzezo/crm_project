/* Quay lui v37: bo hai bang phien chat AI. Du lieu hoi dap mat han — day la
   lich su tro chuyen, khong phai ban ghi CRM, nen khong co gi de di chuyen ve. */
DROP INDEX IF EXISTS idx_ai_chat_sessions_updated;
DROP INDEX IF EXISTS idx_ai_chat_messages_session;
DROP TABLE IF EXISTS ai_chat_messages;
DROP TABLE IF EXISTS ai_chat_sessions;
