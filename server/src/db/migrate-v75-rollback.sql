/* Quay ve v74: bo hai chi muc moi, tao lai cac chi muc thua da bo. Du lieu khong doi. */
DROP INDEX IF EXISTS idx_cards_open_due;
DROP INDEX IF EXISTS idx_cards_done_completed;
CREATE INDEX IF NOT EXISTS idx_deals_project ON deals(project_id);
CREATE INDEX IF NOT EXISTS idx_contracts_project ON contracts(project_id);
CREATE INDEX IF NOT EXISTS idx_ai_chunks_document ON ai_document_chunks(document_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_boards_project ON boards(project_id);
CREATE INDEX IF NOT EXISTS idx_meeting_note_attendees_note ON meeting_note_attendees(meeting_note_id);
CREATE INDEX IF NOT EXISTS idx_qnr_note ON quick_note_relations(quick_note_id);
