/* v75 (1.38.1): chi muc cho cac con so tong hop + bo chi muc thua.

   1. Chi muc MOT PHAN chi chua viec dang mo (chua xong, chua luu tru). Tong quan, dem viec,
      Bao cao, Trong tam deu dem "viec mo qua han / den han hom nay / sap toi" — truoc day
      quet ca bang cards. Viec da xong tich luy theo thoi gian nen phan mo chi la mot
      phan nho cua bang. Chi muc "phu" du cac cot hay dem (bang qua list_id, nguoi phu trach,
      uu tien, trang thai, viec con) de dem xong ma khong phai doc lai dong cards — thieu
      cot nao thi moi dong phai tra lai bang va cham hon ca quet thang.
   2. Chi muc viec da xong theo thoi diem xong, cho Bao cao "xong trong khoang".
   3. Bo 6 chi muc trung hoan toan hoac la tien to cua mot chi muc khac (moi lan ghi
      phai cap nhat ma khong truy van nao can toi). idx_calendar_events_remind giu lai:
      no la chi muc mot phan, khong thua. */
CREATE INDEX IF NOT EXISTS idx_cards_open_due
  ON cards(due_date, list_id, assignee_contact_id, creator_contact_id, priority, status, parent_id)
  WHERE is_done = 0 AND is_archived = 0;
CREATE INDEX IF NOT EXISTS idx_cards_done_completed
  ON cards(completed_at, list_id, assignee_contact_id, is_archived) WHERE is_done = 1;

-- = idx_deals_project_unique(project_id) WHERE project_id IS NOT NULL (moi so sanh "=" deu dung duoc)
DROP INDEX IF EXISTS idx_deals_project;
-- = idx_contracts_project_lookup(project_id)
DROP INDEX IF EXISTS idx_contracts_project;
-- = khoa UNIQUE(document_id, chunk_index)
DROP INDEX IF EXISTS idx_ai_chunks_document;
-- tien to cua idx_boards_milestone(project_id, milestone_date)
DROP INDEX IF EXISTS idx_boards_project;
-- tien to cua khoa UNIQUE(meeting_note_id, contact_id)
DROP INDEX IF EXISTS idx_meeting_note_attendees_note;
-- tien to cua khoa UNIQUE(quick_note_id, object_type, object_id)
DROP INDEX IF EXISTS idx_qnr_note;
