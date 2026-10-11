/* Quay ve v69: bo danh gia 4 cau hoi. Mat diem 9 tieu chi bo sung, nhat ky quyet dinh,
   nhan dinh AI va muc tiep xuc. Thai do 5 bac thu ve 4 bac: Mentor -> Ung ho,
   Ke thu -> Phan doi. Diem BANT + 4P khong bi dong toi. */
DROP TABLE deal_decisions;
DROP TABLE deal_assessments;

UPDATE deal_committee SET stance = 'supporter' WHERE stance = 'mentor';
UPDATE deal_committee SET stance = 'opposed' WHERE stance = 'enemy';

DROP VIEW deal_scorecard;

CREATE TABLE deal_committee_v69 (
  deal_id       INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  contact_id    INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  role_override TEXT,
  stance        TEXT NOT NULL DEFAULT 'unknown'
                CHECK (stance IN ('supporter','neutral','opposed','unknown')),
  is_champion   INTEGER NOT NULL DEFAULT 0,
  influence     INTEGER NOT NULL DEFAULT 3 CHECK (influence BETWEEN 1 AND 5),
  note          TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (deal_id, contact_id)
);
INSERT INTO deal_committee_v69
  (deal_id, contact_id, role_override, stance, is_champion, influence, note, created_at)
SELECT deal_id, contact_id, role_override, stance, is_champion, influence, note, created_at
  FROM deal_committee;
DROP TABLE deal_committee;
ALTER TABLE deal_committee_v69 RENAME TO deal_committee;
CREATE INDEX idx_deal_committee_contact ON deal_committee(contact_id);

-- Nguyen van VIEW cua v10.
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
