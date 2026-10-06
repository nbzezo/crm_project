/* Quay lui v67: bo trang thai cong viec tu cau hinh.

   - `cards.status` von da mang y nghia (kind) nen giu nguyen; chi bo `status_key`.
     Moi the tu dong ve trang thai dung san cung y nghia.
   - Cot kanban dang gan trang thai tu tao: quy ve trang thai dung san cung y nghia.
   - Quy trinh cua trang thai tu tao bi bo (v66 chi biet nam trang thai dung san).
     rollbackTo() chay voi foreign_keys = OFF nen phai xoa buoc bang tay.
   - Dung lai card_flows voi CHECK cua v66.
   rollbackTo() da sao luu CSDL truoc khi chay. */

UPDATE lists
   SET status_mapping = (SELECT kind FROM task_statuses WHERE key = lists.status_mapping)
 WHERE status_mapping IS NOT NULL
   AND status_mapping NOT IN ('todo','doing','waiting_customer','blocked','review','done');

DELETE FROM card_flow_steps
 WHERE flow_id IN (SELECT id FROM card_flows
                    WHERE status NOT IN ('todo','doing','waiting_customer','blocked','review'));
DELETE FROM card_flows
 WHERE status NOT IN ('todo','doing','waiting_customer','blocked','review');

CREATE TABLE card_flows_v66 (
  id INTEGER PRIMARY KEY,
  card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  status TEXT NOT NULL
    CHECK (status IN ('todo','doing','waiting_customer','blocked','review')),
  from_template INTEGER NOT NULL DEFAULT 0 CHECK (from_template IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  created_by_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  completed_at TEXT,
  skipped_at TEXT,
  skipped_by_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  UNIQUE (card_id, status)
);
INSERT INTO card_flows_v66 SELECT id, card_id, status, from_template, created_at,
       created_by_contact_id, completed_at, skipped_at, skipped_by_contact_id FROM card_flows;
DROP TABLE card_flows;
ALTER TABLE card_flows_v66 RENAME TO card_flows;

DROP INDEX IF EXISTS idx_cards_status_key;
ALTER TABLE cards DROP COLUMN status_key;
DROP TABLE task_statuses;
