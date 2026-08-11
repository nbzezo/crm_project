-- v11: Lich ca nhan — su kien la thuc the doc lap (BRD Personal Calendar).
-- Nguyen tac: CHI THEM, khong sua cau truc cua module nao khac.
--
-- Quy uoc thoi gian: [start_at, end_at) — NUA KHOANG, end LUON la moc loai tru.
-- Day dung bang mo hinh cua FullCalendar (all-day end exclusive) nen KHONG co
-- buoc quy doi nao o server; viec +1/-1 ngay CHI xay ra o bieu mau phia client.
-- Ca hai cot luon dung dang 'YYYY-MM-DDTHH:mm' (16 ky tu, gio dia phuong, khong UTC).
-- Su kien ca ngay: hai dau mut deu la 'T00:00'.
--
-- He qua dep: muc 35 cua BRD co hai quy tac qua han (co gio / ca ngay) nhung
-- duoi mo hinh nay chung gop thanh MOT: status='pending' AND end_at <= now.

CREATE TABLE calendar_events (
  id                   INTEGER PRIMARY KEY,
  title                TEXT NOT NULL,
  description          TEXT NOT NULL DEFAULT '',
  location             TEXT NOT NULL DEFAULT '',
  event_type           TEXT NOT NULL DEFAULT 'task' CHECK (event_type IN
                         ('task','meeting','call','reminder','appointment','deadline','other')),

  start_at             TEXT NOT NULL,
  end_at               TEXT NOT NULL,
  all_day              INTEGER NOT NULL DEFAULT 0 CHECK (all_day IN (0,1)),

  -- 'Qua han' KHONG phai trang thai luu tru — tinh khi doc (BRD muc 34).
  status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','done','cancelled')),
  completed_at         TEXT,

  -- So phut nhac truoc start_at. NULL = khong nhac.
  -- Moc nhac TINH KHI DOC, khong luu — tranh lech du lieu khi doi gio su kien.
  reminder_minutes     INTEGER CHECK (reminder_minutes IS NULL OR reminder_minutes BETWEEN 0 AND 43200),

  -- Lich lap (dot sau). Them cot ngay bay gio de khong phai doi shape API sau.
  recurrence_rule      TEXT,
  recurrence_parent_id INTEGER REFERENCES calendar_events(id) ON DELETE CASCADE,
  original_start_at    TEXT,   -- RFC5545 RECURRENCE-ID: moc goc cua ban ghi tach ra

  search_text          TEXT NOT NULL DEFAULT '',
  created_at           TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now','localtime')),

  -- Chan sai dinh dang ngay ngay tu tang DB: khong UTC, khong 'Z', khong giay.
  CHECK (length(start_at) = 16 AND substr(start_at, 11, 1) = 'T'),
  CHECK (length(end_at)   = 16 AND substr(end_at,   11, 1) = 'T'),
  CHECK (end_at > start_at),
  -- Bat loi lech mot ngay cua su kien ca ngay ngay tai cho ghi.
  CHECK (all_day = 0 OR (substr(start_at, 12) = '00:00' AND substr(end_at, 12) = '00:00'))
);

CREATE INDEX idx_calendar_events_range  ON calendar_events(start_at, end_at);
CREATE INDEX idx_calendar_events_status ON calendar_events(status, start_at);
CREATE INDEX idx_calendar_events_recur  ON calendar_events(recurrence_parent_id)
  WHERE recurrence_parent_id IS NOT NULL;
-- Rieng cho chuong bao: chi cac su kien chua xong va co dat nhac.
CREATE INDEX idx_calendar_events_remind ON calendar_events(start_at)
  WHERE reminder_minutes IS NOT NULL AND status = 'pending';
