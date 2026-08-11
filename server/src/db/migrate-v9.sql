-- v9: Nhan 2 cap + gan duoc cho nhieu loai doi tuong (Account, Opportunity, Contact, Contract).
--
-- Nguyen tac: CHI THEM, khong sua cau truc cua module nao khac.
-- Bang card_labels khong bi xoa han ma duoc thay bang VIEW cung ten + INSTEAD OF trigger,
-- nen moi cau SQL dang dung card_labels o cards.ts / lists.ts / boards.ts / views.ts /
-- seed.ts / system.ts van chay y nguyen, khong phai sua dong nao.

/* ---------- 1. Mo rong bang labels ---------- */
-- parent_id NULL = nhan cha (nhom, khong gan duoc vao ban ghi — BR-TAG-13)
-- Khong co cot label_level: cap suy ra tu parent_id.
ALTER TABLE labels ADD COLUMN parent_id   INTEGER REFERENCES labels(id);
ALTER TABLE labels ADD COLUMN description TEXT    NOT NULL DEFAULT '';
ALTER TABLE labels ADD COLUMN status      TEXT    NOT NULL DEFAULT 'active'
  CHECK (status IN ('active','inactive'));
-- JSON mang loai doi tuong ap dung; '[]' = moi loai
ALTER TABLE labels ADD COLUMN scope       TEXT    NOT NULL DEFAULT '[]';
ALTER TABLE labels ADD COLUMN is_starred  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE labels ADD COLUMN position    REAL    NOT NULL DEFAULT 0;
-- Ten da bo dau + chu thuong, dung de chong trung (BR-TAG-14). Do migrate.ts dien.
ALTER TABLE labels ADD COLUMN name_norm   TEXT    NOT NULL DEFAULT '';
-- Nhom he thong "Chua phan nhom": khong xoa, khong doi ten duoc
ALTER TABLE labels ADD COLUMN is_system   INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_labels_parent ON labels(parent_id, position);

/* ---------- 2. Bang lien ket da doi tuong ---------- */
CREATE TABLE label_links (
  label_id    INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  entity_type TEXT    NOT NULL CHECK (entity_type IN ('card','customer','deal','contact','contract')),
  entity_id   INTEGER NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (label_id, entity_type, entity_id)   -- BR-TAG-07: khong gan trung nhan
);
CREATE INDEX idx_label_links_entity ON label_links(entity_type, entity_id);

/* ---------- 3. Nhom "Chua phan nhom" + dua toan bo nhan cu vao do ---------- */
-- Giu nguyen label_id nen nhan dang gan tren the khong mat (FR-TAG-37).
INSERT INTO labels (name, color, name_norm, is_system, position, description)
  VALUES ('Chưa phân nhóm', '#8993a4', 'chua phan nhom', 1, 999,
          'Nhóm mặc định cho nhãn cũ và nhãn tạo nhanh. Nên sắp xếp lại vào nhóm phù hợp.');

UPDATE labels
   SET parent_id = (SELECT id FROM labels WHERE is_system = 1),
       position  = id
 WHERE is_system = 0;

/* ---------- 4. Chuyen lien ket the sang bang moi ---------- */
INSERT INTO label_links (label_id, entity_type, entity_id)
  SELECT label_id, 'card', card_id FROM card_labels;

DROP TABLE card_labels;

-- View cung ten: moi cau SELECT cu doc duoc nguyen ven
CREATE VIEW card_labels AS
  SELECT entity_id AS card_id, label_id FROM label_links WHERE entity_type = 'card';

-- INSTEAD OF trigger: moi cau INSERT / DELETE cu ghi duoc nguyen ven
CREATE TRIGGER trg_card_labels_insert INSTEAD OF INSERT ON card_labels BEGIN
  INSERT OR IGNORE INTO label_links (label_id, entity_type, entity_id)
    VALUES (NEW.label_id, 'card', NEW.card_id);
END;

CREATE TRIGGER trg_card_labels_delete INSTEAD OF DELETE ON card_labels BEGIN
  DELETE FROM label_links
   WHERE entity_type = 'card' AND entity_id = OLD.card_id AND label_id = OLD.label_id;
END;

/* ---------- 5. Don lien ket khi ban ghi bi xoa ---------- */
-- entity_id da hinh nen khong dat duoc khoa ngoai; trigger thay cho ON DELETE CASCADE
-- ma bang card_labels cu dang co, va lam dieu tuong tu cho 4 loai doi tuong moi.
CREATE TRIGGER trg_label_links_card AFTER DELETE ON cards BEGIN
  DELETE FROM label_links WHERE entity_type = 'card' AND entity_id = OLD.id;
END;
CREATE TRIGGER trg_label_links_customer AFTER DELETE ON customers BEGIN
  DELETE FROM label_links WHERE entity_type = 'customer' AND entity_id = OLD.id;
END;
CREATE TRIGGER trg_label_links_deal AFTER DELETE ON deals BEGIN
  DELETE FROM label_links WHERE entity_type = 'deal' AND entity_id = OLD.id;
END;
CREATE TRIGGER trg_label_links_contact AFTER DELETE ON contacts BEGIN
  DELETE FROM label_links WHERE entity_type = 'contact' AND entity_id = OLD.id;
END;
CREATE TRIGGER trg_label_links_contract AFTER DELETE ON contracts BEGIN
  DELETE FROM label_links WHERE entity_type = 'contract' AND entity_id = OLD.id;
END;
