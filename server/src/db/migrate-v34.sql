/* ---------- v34: Dinh kem tep vao Ghi chu hop (meeting_notes) ----------

   `documents.quick_note_id` da co tu v32 de dinh kem tep (vd. ghi am) vao mot
   Ghi chu nhanh. Ghi chu hop (meeting_notes) chua co cot tuong duong — them de
   ho tro tinh nang ghi chu bang giong nol: file ghi am duoc luu nhu mot
   `documents` binh thuong (khong bang rieng), chi gan them lien ket toi ghi
   chu hop qua cot nay.

   Chi them mot cot nullable, khong dong CHECK constraint nao — khong can
   dung lai bang (tao-chep-xoa-doi ten) nhu v31 da phai lam, chi mot ALTER
   TABLE thuong. */

ALTER TABLE documents ADD COLUMN meeting_note_id INTEGER REFERENCES meeting_notes(id) ON DELETE CASCADE;
CREATE INDEX idx_documents_meeting_note ON documents(meeting_note_id);
