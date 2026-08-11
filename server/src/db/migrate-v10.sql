-- v10: Cham diem co hoi B2B theo BANT + 4P.
--
-- Nguyen tac: CHI THEM, khong sua cau truc cua module nao khac.
-- Moi bang moi deu ON DELETE CASCADE theo deals nen xoa co hoi la sach,
-- khong can trigger don nhu module Nhan (o do entity_id da hinh moi phai dung trigger).
--
-- Du lieu dan xuat (o ma tran, co veto, tuoi diem) KHONG luu thanh cot ma tinh
-- khi doc qua VIEW deal_scorecard — tranh lech du lieu.

/* ---------- 1. Tam diem 8 yeu to (4 BANT + 4P) ---------- */
-- Sinh luoi: yeu to chua cham thi khong co dong nao, tong van tinh tren du 8 yeu to.
CREATE TABLE deal_scores (
  deal_id     INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  factor      TEXT NOT NULL CHECK (factor IN
                ('budget','authority','need','timeline','price','relationship','fit','process')),
  score       INTEGER NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 3),
  -- 'suggested' = de xuat (AI hoac nguoi khac), KHONG cong vao tong cho toi khi xac nhan
  status      TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('suggested','confirmed')),
  evidence    TEXT NOT NULL DEFAULT '',
  source_type TEXT CHECK (source_type IN ('interaction','document','manual')),
  source_id   INTEGER,
  verified    INTEGER NOT NULL DEFAULT 0,
  -- Cau tra loi phan bien bat buoc voi 4P >= 2 o deal lon (F-13)
  challenge   TEXT NOT NULL DEFAULT '',
  scored_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (deal_id, factor),
  -- Diem 0 VAN DUOC PHEP co bang chung (truong hop "thong tin tieu cuc ro rang")
  CHECK (score = 0 OR length(evidence) >= 20),
  CHECK (length(evidence) <= 1000)
);
-- Khong co cot 'axis': 4 yeu to dau la BANT, 4 yeu to sau la 4P — suy tu factor.

/* ---------- 2. Nhom ra quyet dinh: bang noi, KHONG lap tu dien vai tro ---------- */
-- Vai tro doc tu contacts.buying_role (9 gia tri da co). role_override chi dung khi
-- mot nguoi giu vai tro khac o co hoi cu the.
-- last_contact_at KHONG luu: tinh tu interactions de khong co nguon su that thu hai.
CREATE TABLE deal_committee (
  deal_id       INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  contact_id    INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  role_override TEXT,
  -- Thai do tach hoan toan khoi chuc nang: mot economic buyer van co the la champion
  stance        TEXT NOT NULL DEFAULT 'unknown'
                CHECK (stance IN ('supporter','neutral','opposed','unknown')),
  is_champion   INTEGER NOT NULL DEFAULT 0,
  influence     INTEGER NOT NULL DEFAULT 3 CHECK (influence BETWEEN 1 AND 5),
  note          TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (deal_id, contact_id)
);
CREATE INDEX idx_deal_committee_contact ON deal_committee(contact_id);

/* ---------- 3. Su kien bat buoc (compelling event) ---------- */
-- Khac Next Action: Next Action la viec CUA TA (doi duoc), su kien nay la rang buoc
-- CUA KHACH (doi duoc thi khong phai su kien bat buoc).
CREATE TABLE deal_events (
  id          INTEGER PRIMARY KEY,
  deal_id     INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL CHECK (event_type IN
                ('contract_expiry','regulatory','audit','product_launch','fiscal_deadline','other')),
  description TEXT NOT NULL,
  event_date  TEXT,
  confirmed   INTEGER NOT NULL DEFAULT 0,
  is_primary  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_deal_events_deal ON deal_events(deal_id, is_primary DESC, event_date);

/* ---------- 4. Doi thu theo co hoi ---------- */
-- Khong tao danh muc doi thu dung chung: ten van la text, chuan hoa bang name_norm
-- de goi y ten da nhap truoc do. Ba truong quyet dinh ben duoi la thu duy nhat
-- ma veto V3 va rubric PRICE can toi.
CREATE TABLE deal_competitors (
  id                  INTEGER PRIMARY KEY,
  deal_id             INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  name_norm           TEXT NOT NULL DEFAULT '',
  incumbent           INTEGER NOT NULL DEFAULT 0,
  shaped_requirements INTEGER NOT NULL DEFAULT 0,
  price_position      TEXT NOT NULL DEFAULT 'unknown'
                      CHECK (price_position IN ('lower','similar','higher','unknown')),
  note                TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_deal_competitors_deal ON deal_competitors(deal_id);

-- Chuyen doi thu dang nam o deals.competitor sang dong dau tien. Cot cu GIU NGUYEN
-- (module Co hoi khong phai sua dong nao). name_norm do migrate.ts dien.
INSERT INTO deal_competitors (deal_id, name)
  SELECT id, trim(competitor) FROM deals
   WHERE competitor IS NOT NULL AND trim(competitor) <> '';

/* ---------- 5. Nhat ky thay doi diem ---------- */
-- factor cung nhan gia tri 'stage_gate_override' cho lan ghi de cong giai doan.
CREATE TABLE deal_score_history (
  id         INTEGER PRIMARY KEY,
  deal_id    INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  factor     TEXT NOT NULL,
  old_score  INTEGER,
  new_score  INTEGER,
  reason     TEXT NOT NULL DEFAULT '',
  changed_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_deal_score_history ON deal_score_history(deal_id, changed_at);

/* ---------- 6. Cau hinh phia server ---------- */
-- He thong chua co noi luu cau hinh nao. Dung dang key/value cho gon.
CREATE TABLE app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

INSERT INTO app_settings (key, value) VALUES
  -- Nguong diem BANT toi thieu de vao tung giai doan. lost KHONG BAO GIO bi chan.
  ('scoring.stage_gate', '{"quoted":7,"negotiating":9}'),
  -- Diem qua han bao nhieu ngay thi coi la cu (KHAC STALE_DAYS = 14 cua "nguoi tuong tac")
  ('scoring.stale_days', '30'),
  -- 'warn' = doi thu dinh hinh tieu chi chi canh bao; 'veto' = chan luon forecast
  ('scoring.v3_mode', 'warn'),
  -- Deal vuot nguong nay bat buoc tra loi cau phan bien khi cham 4P >= 2 (F-13)
  ('scoring.challenge_threshold_vnd', '500000000'),
  -- Duoi nguong nay thi bao cao win/loss khong dua khuyen nghi hieu chinh nguong
  ('scoring.winloss_min_deals', '30');

/* ---------- 7. Bon cot them vao deals (chi thu khong suy duoc) ---------- */
ALTER TABLE deals ADD COLUMN bant_total       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE deals ADD COLUMN p4_total         INTEGER NOT NULL DEFAULT 0;
ALTER TABLE deals ADD COLUMN score_updated_at TEXT;
-- JSON chup du 8 yeu to + tong + o + veto ngay khi chuyen won/lost, phuc vu F-10/F-16.
ALTER TABLE deals ADD COLUMN score_snapshot   TEXT;

CREATE INDEX idx_deals_score ON deals(bant_total, p4_total);

/* ---------- 8. O ma tran, veto, tuoi diem: TINH KHI DOC ---------- */
CREATE VIEW deal_scorecard AS
SELECT
  d.id AS deal_id,
  d.bant_total,
  d.p4_total,
  CASE WHEN d.bant_total >= 7 AND d.p4_total >= 7 THEN 'pursue'
       WHEN d.bant_total >= 7                     THEN 'reshape'
       WHEN d.p4_total   >= 7                     THEN 'nurture'
       ELSE 'disqualify' END AS quadrant,
  CASE WHEN d.score_updated_at IS NULL THEN NULL
       ELSE CAST(julianday(date('now','localtime'))
                 - julianday(date(d.score_updated_at)) AS INTEGER) END AS score_age_days,
  -- V1: khong co su kien bat buoc duoc khach xac nhan va co ngay cu the
  (SELECT COUNT(*) FROM deal_events e
    WHERE e.deal_id = d.id AND e.confirmed = 1 AND e.event_date IS NOT NULL) = 0
    AS v1_no_event,
  -- V2: chua tiep can nguoi co quyen chi tien.
  -- Tinh ca hoat dong gan voi co hoi nay va hoat dong chung o cap khach hang.
  (SELECT COUNT(*) FROM deal_committee m
     JOIN contacts c ON c.id = m.contact_id
    WHERE m.deal_id = d.id
      AND COALESCE(m.role_override, c.buying_role) IN ('economic_buyer','decision_maker')
      AND EXISTS (SELECT 1 FROM interactions i
                   WHERE i.contact_id = m.contact_id
                     AND (i.deal_id = d.id OR i.deal_id IS NULL))) = 0
    AS v2_no_economic,
  -- V3: doi thu da tham gia soan tieu chi. Mac dinh chi canh bao (scoring.v3_mode).
  (SELECT COUNT(*) FROM deal_competitors k
    WHERE k.deal_id = d.id AND k.shaped_requirements = 1) > 0
    AS v3_shaped
FROM deals d;
