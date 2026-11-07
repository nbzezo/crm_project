/* v76 (1.42.0): bien ban hop tinh la mot lan lien he voi khach (phan 1) va popup nhac
   gom ca nhac cua lich (phan 2).

   ---------- Phan 1: customer_touchpoints ----------

   Truoc day "lan lien he cuoi" (nhip cham soc, canh bao "khong tuong tac >14 ngay", cot
   Lien he cuoi o danh sach Khach hang, Trong tam, AI) chi doc bang `interactions`. Ai ghi
   buoi hop bang Trang tai lieu (muc dich Hop, co gio hop) thi khach van bi coi la lau
   khong lien he.

   `customer_touchpoints` gop hai nguon vao MOT cho de moi truy van "lan lien he cuoi" doc
   cung mot dinh nghia:
   - moi dong `interactions`;
   - bien ban hop (`meeting_notes`): muc dich 'meeting', co `meeting_at`, chua xoa, va gio
     hop KHONG o tuong lai (hop da len lich chua dien ra thi chua phai lien he).
     Khach cua bien ban lay theo thu tu: gan thang -> qua co hoi -> qua du an.

   Tach ba nhanh UNION ALL (thay vi mot COALESCE) de dieu kien `customer_id = ?` day xuong
   tung nhanh van dung chi muc: nhanh 1 dung idx_meeting_notes_customer, nhanh 2/3 di qua
   chi muc customer_id cua deals/projects roi chi muc deal_id/project_id cua meeting_notes.

   customer_stats.last_activity_at (v74) doc tu view nay, nen them trigger danh dau "ban"
   khi bien ban doi khach / gio hop / muc dich / bi xoa. Gioi han da biet: bien ban hen
   gio trong tuong lai chi duoc tinh vao cache khi khach bi danh dau ban lan ke tiep. */

CREATE INDEX IF NOT EXISTS idx_meeting_notes_customer ON meeting_notes(customer_id, meeting_at);

CREATE VIEW customer_touchpoints AS
  SELECT 'interaction' AS source, i.id AS source_id, i.customer_id, i.deal_id,
         i.contact_id, i.occurred_at
    FROM interactions i
  UNION ALL
  SELECT 'meeting_note', m.id, m.customer_id, m.deal_id, NULL, m.meeting_at
    FROM meeting_notes m
   WHERE m.customer_id IS NOT NULL
     AND m.purpose_key = 'meeting' AND m.meeting_at IS NOT NULL AND m.deleted_at IS NULL
     AND substr(m.meeting_at, 1, 10) <= date('now', 'localtime')
  UNION ALL
  SELECT 'meeting_note', m.id, d.customer_id, m.deal_id, NULL, m.meeting_at
    FROM meeting_notes m JOIN deals d ON d.id = m.deal_id
   WHERE m.customer_id IS NULL
     AND m.purpose_key = 'meeting' AND m.meeting_at IS NOT NULL AND m.deleted_at IS NULL
     AND substr(m.meeting_at, 1, 10) <= date('now', 'localtime')
  UNION ALL
  SELECT 'meeting_note', m.id, p.customer_id, NULL, NULL, m.meeting_at
    FROM meeting_notes m JOIN projects p ON p.id = m.project_id
   WHERE m.customer_id IS NULL AND m.deal_id IS NULL AND p.customer_id IS NOT NULL
     AND m.purpose_key = 'meeting' AND m.meeting_at IS NOT NULL AND m.deleted_at IS NULL
     AND substr(m.meeting_at, 1, 10) <= date('now', 'localtime');

/* Khach chiu anh huong cua mot bien ban: gan thang, hoac qua co hoi / du an. */
CREATE TRIGGER meeting_notes_stats_insert AFTER INSERT ON meeting_notes
WHEN NEW.purpose_key = 'meeting'
BEGIN
  INSERT OR IGNORE INTO stats_dirty (kind, id)
    SELECT 'customer', COALESCE(NEW.customer_id,
                                (SELECT customer_id FROM deals WHERE id = NEW.deal_id),
                                (SELECT customer_id FROM projects WHERE id = NEW.project_id))
     WHERE COALESCE(NEW.customer_id,
                    (SELECT customer_id FROM deals WHERE id = NEW.deal_id),
                    (SELECT customer_id FROM projects WHERE id = NEW.project_id)) IS NOT NULL;
END;

CREATE TRIGGER meeting_notes_stats_update
AFTER UPDATE OF customer_id, deal_id, project_id, purpose_key, meeting_at, deleted_at ON meeting_notes
WHEN NEW.purpose_key = 'meeting' OR OLD.purpose_key = 'meeting'
BEGIN
  INSERT OR IGNORE INTO stats_dirty (kind, id)
    SELECT 'customer', COALESCE(NEW.customer_id,
                                (SELECT customer_id FROM deals WHERE id = NEW.deal_id),
                                (SELECT customer_id FROM projects WHERE id = NEW.project_id))
     WHERE COALESCE(NEW.customer_id,
                    (SELECT customer_id FROM deals WHERE id = NEW.deal_id),
                    (SELECT customer_id FROM projects WHERE id = NEW.project_id)) IS NOT NULL;
  INSERT OR IGNORE INTO stats_dirty (kind, id)
    SELECT 'customer', COALESCE(OLD.customer_id,
                                (SELECT customer_id FROM deals WHERE id = OLD.deal_id),
                                (SELECT customer_id FROM projects WHERE id = OLD.project_id))
     WHERE COALESCE(OLD.customer_id,
                    (SELECT customer_id FROM deals WHERE id = OLD.deal_id),
                    (SELECT customer_id FROM projects WHERE id = OLD.project_id)) IS NOT NULL;
END;

CREATE TRIGGER meeting_notes_stats_delete AFTER DELETE ON meeting_notes
WHEN OLD.purpose_key = 'meeting'
BEGIN
  INSERT OR IGNORE INTO stats_dirty (kind, id)
    SELECT 'customer', COALESCE(OLD.customer_id,
                                (SELECT customer_id FROM deals WHERE id = OLD.deal_id),
                                (SELECT customer_id FROM projects WHERE id = OLD.project_id))
     WHERE COALESCE(OLD.customer_id,
                    (SELECT customer_id FROM deals WHERE id = OLD.deal_id),
                    (SELECT customer_id FROM projects WHERE id = OLD.project_id)) IS NOT NULL;
END;

/* Bien ban hop da co tu truoc: tinh lai cache cho moi khach mot lan. */
INSERT OR IGNORE INTO stats_dirty (kind, id) SELECT 'customer', id FROM customers;

/* ---------- Phan 2: trang thai popup cua nhac lich ----------

   Popup "Den gio nhac" (DueReminderPopup) truoc day chi doc bang `reminders`: dat nhac
   tren su kien lich hay tren Ghi chu nhanh thi khong bao gio bat len trong ung dung.
   Ghi chu nhanh tu co cot trang thai (`reminder_status`), con moc nhac cua su kien TINH
   KHI DOC (start_at - reminder_minutes, xem v11) va su kien co the khong co chu — nen
   "da tat / hoan den" phai luu theo TUNG NGUOI o day.

   `due_at` la moc nhac luc nguoi dung xu ly. Doi gio su kien thi moc moi khac moc da luu,
   nen nhac bat lai — dung nhu bang reminders (doi `due_at` la mot lan nhac moi). */
CREATE TABLE reminder_popup_states (
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  due_at TEXT NOT NULL,
  dismissed INTEGER NOT NULL DEFAULT 0 CHECK (dismissed IN (0,1)),
  snoozed_until TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (contact_id, item_key)
) WITHOUT ROWID;
