/* ---------- v70: Danh gia co hoi theo 4 cau hoi (Opportunity Assessment) ----------

   Bo sung cho bo may BANT + 4P (v10), KHONG thay no:
   - deal_assessments: 9 tieu chi ma 8 yeu to cu chua do — 5 tieu chi truc "Dang dau tu"
     (thang thi ta duoc gi) va 4 tieu chi bo sung cho cau "Nhu cau that / Canh tranh /
     Chot duoc". Day la cong cu ho tro tu danh gia nen KHONG bat bang chung 20 ky tu,
     KHONG cong vao bant_total/p4_total, KHONG chan giai doan hay forecast.
   - deal_decisions: nhat ky quyet dinh Theo / Tam dung / Rut cua nguoi dung VA nhan
     dinh cua AI (author_kind = 'ai', noi dung day du trong payload).
   - deal_committee: thai do 5 bac (them 'mentor', 'enemy') + muc tiep xuc. */

CREATE TABLE deal_assessments (
  deal_id    INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  criterion  TEXT NOT NULL CHECK (criterion IN
               ('profit','follow_on','strategic','resources','delivery_risk',
                'financial_health','unique_value','exec_relationship','informal_decision')),
  score      INTEGER NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 3),
  -- 'suggested' = AI de xuat, chua tinh vao tong cho toi khi nguoi dung xac nhan
  status     TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('suggested','confirmed')),
  note       TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 2000),
  updated_by_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (deal_id, criterion)
);

CREATE TABLE deal_decisions (
  id                INTEGER PRIMARY KEY,
  deal_id           INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  decision          TEXT NOT NULL CHECK (decision IN ('pursue','pause','withdraw')),
  reason            TEXT NOT NULL DEFAULT '' CHECK (length(reason) <= 4000),
  review_date       TEXT,
  author_kind       TEXT NOT NULL DEFAULT 'user' CHECK (author_kind IN ('user','ai')),
  author_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  -- JSON nhan dinh AI (tieu chi de xuat, dieu chua biet, rui ro). NULL voi quyet dinh cua nguoi.
  payload           TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_deal_decisions_deal ON deal_decisions(deal_id, created_at DESC, id DESC);

/* ---------- Thai do 5 bac trong nhom ra quyet dinh ----------
   CHECK cua cot stance duoc doi trong migrate.ts (rebuildTable giu nguyen VIEW
   deal_scorecard, chi muc va trigger). Khoa 'opposed' duoc giu cho "Khong ung ho"
   de du lieu cu khong phai doi; them 'mentor' va 'enemy'. */

-- Muc tiep xuc cua ta voi nguoi nay: so luoc / nhieu lan / chuyen sau. NULL = chua tiep xuc.
ALTER TABLE deal_committee ADD COLUMN contact_depth TEXT
  CHECK (contact_depth IN ('brief','multiple','in_depth'));
