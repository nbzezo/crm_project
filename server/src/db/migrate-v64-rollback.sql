/* ---------- Rollback v64 -> v63 ----------

   Chay bang: npm run db:rollback --workspace server -- 63

   KHONG dung lai `deals` de bo khoa ngoai `stage -> pipeline_stages(key)` va them
   lai CHECK cu — cung ly do voi rollback v27: dung lai bang trung tam nhat o duong
   quay lui la dat rui ro vao dung cho khong nen dat. Vi khoa ngoai van con, hai
   bang `pipelines` / `pipeline_stages` duoc GIU LAI (ung dung v63 khong doc chung).

   XU LY DU LIEU:
   - Tam giai doan goc duoc chen lai neu da bi xoa, de khoa ngoai van nhan moi gia
     tri ma ung dung v63 ghi ra.
   - Co hoi dang o giai doan tu them (ngoai tam khoa goc) duoc keo ve giai doan goc
     gan nhat dung truoc no trong pipeline, cung loai mo/thang/thua; khong co thi ve
     'lead' (mo), 'won', 'lost'.
   - Cong diem BANT chep nguoc ve `app_settings.scoring.stage_gate`.

   MAT MAT DU LIEU: ten, mau, thu tu, xac suat da sua cua giai doan; giai doan tu
   them (co hoi cua no chuyen nhu tren); so ngay toi da moi giai doan. */

INSERT OR IGNORE INTO pipelines (id, name, is_default, position) VALUES (1, 'Bán hàng', 1, 1);
INSERT OR IGNORE INTO pipeline_stages (pipeline_id, key, label, category, position, probability)
VALUES
  (1, 'lead', 'Tiềm năng', 'open', 1, 10),
  (1, 'approaching', 'Đang tiếp cận', 'open', 2, 20),
  (1, 'discussing', 'Đang trao đổi', 'open', 3, 40),
  (1, 'poc', 'PoC / Thử nghiệm', 'open', 4, 50),
  (1, 'quoted', 'Gửi báo giá', 'open', 5, 60),
  (1, 'negotiating', 'Đàm phán', 'open', 6, 80),
  (1, 'won', 'Thành công', 'won', 1000, 100),
  (1, 'lost', 'Thất bại', 'lost', 1001, 0);

UPDATE deals SET stage = COALESCE(
  (SELECT g.key FROM pipeline_stages s JOIN pipeline_stages g
      ON g.category = s.category AND g.position <= s.position
     AND g.key IN ('lead','approaching','discussing','poc','quoted','negotiating','won','lost')
    WHERE s.key = deals.stage
    ORDER BY g.position DESC LIMIT 1),
  CASE deals.stage_category WHEN 'won' THEN 'won' WHEN 'lost' THEN 'lost' ELSE 'lead' END)
WHERE stage NOT IN ('lead','approaching','discussing','poc','quoted','negotiating','won','lost');

DELETE FROM app_settings WHERE key = 'scoring.stage_gate';
INSERT INTO app_settings (key, value, updated_at)
SELECT 'scoring.stage_gate', COALESCE(json_group_object(key, gate_bant_min), '{}'),
       datetime('now','localtime')
  FROM pipeline_stages WHERE gate_bant_min IS NOT NULL;

DROP TRIGGER IF EXISTS trg_deals_stage_category_ins;
DROP TRIGGER IF EXISTS trg_deals_stage_category_upd;
DROP INDEX IF EXISTS idx_deals_stage_category;
ALTER TABLE deals DROP COLUMN stage_category;
