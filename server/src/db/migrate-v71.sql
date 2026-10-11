/* ---------- v71: che do Co ban / Nang cao cho trang Co hoi ----------

   - users.deal_view_mode: moi tai khoan tu chon cach xem trang co hoi. Mac dinh 'basic'
     (danh gia nhanh 10 cau); 'advanced' la bo 20 o + BANT/4P nhu ban 1.35.0.
   - deal_quick_answers: cau tra loi Co / Chua ro / Khong cua danh gia nhanh. Cau chua
     tra loi thi API tu suy tu diem Nang cao DA XAC NHAN — phan suy ra KHONG luu o day.
   - Gop "Champion" vao thai do 'mentor' (Nguoi ung ho chinh): champion dang khong phan doi
     thi chuyen thanh mentor, roi dong bo is_champion = (stance = 'mentor'). */

ALTER TABLE users ADD COLUMN deal_view_mode TEXT NOT NULL DEFAULT 'basic'
  CHECK (deal_view_mode IN ('basic','advanced'));

CREATE TABLE deal_quick_answers (
  deal_id    INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  question   TEXT NOT NULL CHECK (question IN
               ('need','budget','deadline','decision_maker','supporter','fit','advantage',
                'process','profit','future')),
  answer     TEXT NOT NULL CHECK (answer IN ('yes','unsure','no')),
  note       TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
  -- 'ai' = nguoi dung luu nguyen goi y cua AI; sua lai thi thanh 'user'
  source     TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('user','ai')),
  updated_by_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (deal_id, question)
);

UPDATE deal_committee SET stance = 'mentor'
 WHERE is_champion = 1 AND stance NOT IN ('opposed','enemy');
UPDATE deal_committee SET is_champion = CASE WHEN stance = 'mentor' THEN 1 ELSE 0 END;
