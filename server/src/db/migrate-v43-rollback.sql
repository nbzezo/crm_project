/* Quay ve v42: ghi chu khong con phan loai muc dich (tat ca lai la bien ban hop). */
DROP INDEX IF EXISTS idx_meeting_notes_updated;
ALTER TABLE meeting_notes DROP COLUMN purpose_key;
