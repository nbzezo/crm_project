/* Trang tai lieu dung chung; cac ghi chu da co duoc giu la bien ban hop. */
ALTER TABLE meeting_notes ADD COLUMN purpose_key TEXT NOT NULL DEFAULT 'meeting'
  CHECK (purpose_key IN ('blank', 'meeting', 'plan', 'proposal', 'report', 'process', 'decision'));

CREATE INDEX idx_meeting_notes_updated ON meeting_notes(updated_at DESC, id DESC);
