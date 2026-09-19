/* ---------- Rollback v39 -> v38 ----------

   Chay bang: npm run db:rollback --workspace server -- 38

   MAT MAT DU LIEU: bo toan bo so do to chuc, vi tri, ma tran phan quyen va viec
   gan nguoi vao vi tri. Sau khi quay lui, API tro lai trang thai MOI NGUOI DANG
   NHAP DEU THAY MOI THU — dung xac thuc van con, nhung khong con chan theo tinh
   nang nua. Chi lam dieu nay khi chap nhan duoc dieu do.

   Cac dong nhat ky co entity_type la 'position' / 'user_position' / 'org_unit'
   bi xoa: bang cu khong co cho chung trong CHECK. */

DROP INDEX IF EXISTS idx_user_positions_position;
DROP TABLE IF EXISTS user_positions;
DROP TABLE IF EXISTS position_permissions;
DROP TABLE IF EXISTS positions;

DROP INDEX IF EXISTS idx_contacts_org_unit;
ALTER TABLE contacts DROP COLUMN org_unit_id;

DROP INDEX IF EXISTS idx_org_units_parent;
DROP TABLE IF EXISTS org_units;
DROP TABLE IF EXISTS org_unit_kinds;

DELETE FROM app_settings WHERE key = 'permissions.version';

/* Thu hep lai CHECK cua entity_change_log. Cung ly do voi luot di: bo ba trigger
   cua v29 nam tren deals/projects/contracts, phai go truoc khi doi ten bang. */
DROP TRIGGER IF EXISTS trg_entity_change_log_deal;
DROP TRIGGER IF EXISTS trg_entity_change_log_project;
DROP TRIGGER IF EXISTS trg_entity_change_log_contract;

CREATE TABLE entity_change_log_v38 (
  id INTEGER PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('deal', 'project', 'contract')),
  entity_id INTEGER NOT NULL,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  note TEXT,
  actor_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  changed_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
INSERT INTO entity_change_log_v38 (id, entity_type, entity_id, field, old_value, new_value, note, actor_contact_id, changed_at)
SELECT id, entity_type, entity_id, field, old_value, new_value, note, actor_contact_id, changed_at
  FROM entity_change_log
 WHERE entity_type IN ('deal', 'project', 'contract');
DROP TABLE entity_change_log;
ALTER TABLE entity_change_log_v38 RENAME TO entity_change_log;
CREATE INDEX idx_entity_change_log ON entity_change_log(entity_type, entity_id, changed_at DESC);

CREATE TRIGGER trg_entity_change_log_deal AFTER DELETE ON deals BEGIN
  DELETE FROM entity_change_log WHERE entity_type = 'deal' AND entity_id = OLD.id;
END;
CREATE TRIGGER trg_entity_change_log_project AFTER DELETE ON projects BEGIN
  DELETE FROM entity_change_log WHERE entity_type = 'project' AND entity_id = OLD.id;
END;
CREATE TRIGGER trg_entity_change_log_contract AFTER DELETE ON contracts BEGIN
  DELETE FROM entity_change_log WHERE entity_type = 'contract' AND entity_id = OLD.id;
END;
