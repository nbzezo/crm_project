/* v29: don entity_change_log khi ban ghi goc (deal/project/contract) bi xoa.

   entity_change_log (v23) la bang da hinh (entity_type + entity_id), giong het
   label_links (v9) — entity_id khong dat duoc khoa ngoai that nen khong co
   ON DELETE CASCADE tu nhien. v9 da bu dieu nay bang 5 trigger trg_label_links_*
   cho label_links; day la dieu tuong tu cho ba loai thuc the ma entity_change_log
   ho tro (CHECK entity_type IN ('deal','project','contract')).

   Thieu trigger nay: deals.id/projects.id/contracts.id la INTEGER PRIMARY KEY
   thuong (khong AUTOINCREMENT) nen SQLite se tai su dung id vua giai phong cho
   ban ghi ke tiep — nhat ky thay doi cua ban ghi CU se hien nham thanh nhat ky
   cua ban ghi MOI cung id, co the ro ri du lieu thuong mai giua hai khach hang
   khong lien quan. */
CREATE TRIGGER trg_entity_change_log_deal AFTER DELETE ON deals BEGIN
  DELETE FROM entity_change_log WHERE entity_type = 'deal' AND entity_id = OLD.id;
END;
CREATE TRIGGER trg_entity_change_log_project AFTER DELETE ON projects BEGIN
  DELETE FROM entity_change_log WHERE entity_type = 'project' AND entity_id = OLD.id;
END;
CREATE TRIGGER trg_entity_change_log_contract AFTER DELETE ON contracts BEGIN
  DELETE FROM entity_change_log WHERE entity_type = 'contract' AND entity_id = OLD.id;
END;
