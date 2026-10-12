/* v73 (1.38.0): `cards.updated_at` phan anh MOI thay doi hien tren danh sach viec.

   Man Cong viec chuyen sang tai theo phan thay doi: client giu danh sach da tai, moi lan
   chi hoi "viec nao co updated_at moi hon moc lan truoc". Muon vay, nhung con so hien
   tren dong viec ma nam o bang khac (so muc checklist, nhan, viec con, so lan nhac, nguoi
   theo doi, so lan doi han, tien do quy trinh) cung phai lam the "moi" khi chung doi.
   Truoc day cac bang do doi ma the khong doi — danh sach theo phan thay doi se giu so cu.

   Trigger "cham" the cha: chi dat lai `updated_at`. recursive_triggers mac dinh TAT, nen
   lenh UPDATE trong trigger khong kich lai chinh no; trigger `cards_touch_self` co dieu
   kien WHEN nen khong chay khi `updated_at` da doi. */

-- Moi UPDATE tren the ma quen dat updated_at (vai duong ghi cu) van lam the "moi".
CREATE TRIGGER cards_touch_self AFTER UPDATE ON cards
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE cards SET updated_at = datetime('now','localtime') WHERE id = NEW.id;
END;

-- Viec con: dem viec con / viec con xong nam tren dong cua viec cha.
CREATE TRIGGER cards_touch_parent_insert AFTER INSERT ON cards
WHEN NEW.parent_id IS NOT NULL
BEGIN
  UPDATE cards SET updated_at = datetime('now','localtime') WHERE id = NEW.parent_id;
END;
CREATE TRIGGER cards_touch_parent_update AFTER UPDATE OF is_done, is_archived, parent_id ON cards
WHEN NEW.parent_id IS NOT NULL OR OLD.parent_id IS NOT NULL
BEGIN
  UPDATE cards SET updated_at = datetime('now','localtime')
   WHERE id IN (NEW.parent_id, OLD.parent_id);
END;
CREATE TRIGGER cards_touch_parent_delete AFTER DELETE ON cards
WHEN OLD.parent_id IS NOT NULL
BEGIN
  UPDATE cards SET updated_at = datetime('now','localtime') WHERE id = OLD.parent_id;
END;

CREATE TRIGGER checklist_touch_card_insert AFTER INSERT ON checklist_items
BEGIN
  UPDATE cards SET updated_at = datetime('now','localtime') WHERE id = NEW.card_id;
END;
CREATE TRIGGER checklist_touch_card_update AFTER UPDATE ON checklist_items
BEGIN
  UPDATE cards SET updated_at = datetime('now','localtime') WHERE id IN (NEW.card_id, OLD.card_id);
END;
CREATE TRIGGER checklist_touch_card_delete AFTER DELETE ON checklist_items
BEGIN
  UPDATE cards SET updated_at = datetime('now','localtime') WHERE id = OLD.card_id;
END;

-- Nhan cua the nam o label_links (card_labels chi la view tu v9).
CREATE TRIGGER card_labels_touch_card_insert AFTER INSERT ON label_links
WHEN NEW.entity_type = 'card'
BEGIN
  UPDATE cards SET updated_at = datetime('now','localtime') WHERE id = NEW.entity_id;
END;
CREATE TRIGGER card_labels_touch_card_delete AFTER DELETE ON label_links
WHEN OLD.entity_type = 'card'
BEGIN
  UPDATE cards SET updated_at = datetime('now','localtime') WHERE id = OLD.entity_id;
END;

CREATE TRIGGER task_nudges_touch_card_insert AFTER INSERT ON task_nudges
BEGIN
  UPDATE cards SET updated_at = datetime('now','localtime') WHERE id = NEW.card_id;
END;
CREATE TRIGGER task_nudges_touch_card_delete AFTER DELETE ON task_nudges
BEGIN
  UPDATE cards SET updated_at = datetime('now','localtime') WHERE id = OLD.card_id;
END;

CREATE TRIGGER task_watchers_touch_card_insert AFTER INSERT ON task_watchers
BEGIN
  UPDATE cards SET updated_at = datetime('now','localtime') WHERE id = NEW.card_id;
END;
CREATE TRIGGER task_watchers_touch_card_delete AFTER DELETE ON task_watchers
BEGIN
  UPDATE cards SET updated_at = datetime('now','localtime') WHERE id = OLD.card_id;
END;

CREATE TRIGGER card_due_changes_touch_card AFTER INSERT ON card_due_changes
BEGIN
  UPDATE cards SET updated_at = datetime('now','localtime') WHERE id = NEW.card_id;
END;

CREATE TRIGGER card_flows_touch_card_insert AFTER INSERT ON card_flows
BEGIN
  UPDATE cards SET updated_at = datetime('now','localtime') WHERE id = NEW.card_id;
END;
CREATE TRIGGER card_flows_touch_card_update AFTER UPDATE ON card_flows
BEGIN
  UPDATE cards SET updated_at = datetime('now','localtime') WHERE id = NEW.card_id;
END;
CREATE TRIGGER card_flows_touch_card_delete AFTER DELETE ON card_flows
BEGIN
  UPDATE cards SET updated_at = datetime('now','localtime') WHERE id = OLD.card_id;
END;
CREATE TRIGGER card_flow_steps_touch_card_insert AFTER INSERT ON card_flow_steps
BEGIN
  UPDATE cards SET updated_at = datetime('now','localtime')
   WHERE id = (SELECT card_id FROM card_flows WHERE id = NEW.flow_id);
END;
CREATE TRIGGER card_flow_steps_touch_card_update AFTER UPDATE ON card_flow_steps
BEGIN
  UPDATE cards SET updated_at = datetime('now','localtime')
   WHERE id = (SELECT card_id FROM card_flows WHERE id = NEW.flow_id);
END;
CREATE TRIGGER card_flow_steps_touch_card_delete AFTER DELETE ON card_flow_steps
BEGIN
  UPDATE cards SET updated_at = datetime('now','localtime')
   WHERE id = (SELECT card_id FROM card_flows WHERE id = OLD.flow_id);
END;

-- Truy van "viec doi tu moc X" quet theo cot nay.
CREATE INDEX idx_cards_updated ON cards(updated_at);
