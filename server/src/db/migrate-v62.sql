/* v62: danh muc dong (1.24.0).

   Lý do thất bại, loại tương tác và loại tài liệu chuyển từ hằng số trong mã sang
   bảng `picklist_items`: quản trị viên tự thêm, đổi tên, ẩn, sắp xếp, gộp ở
   Cài đặt → Danh mục. Dữ liệu nghiệp vụ vẫn lưu `item_key` như cũ, nên các khoá
   hiện có được chèn lại đúng như trước và không dòng nào phải đổi.

   Ràng buộc CHECK trên `interactions.type` được gỡ trong migrate.ts (dựng lại bảng),
   không ở đây — SQLite không sửa CHECK tại chỗ được. */

CREATE TABLE picklist_items (
  id INTEGER PRIMARY KEY,
  list_key TEXT NOT NULL,
  item_key TEXT NOT NULL,
  label TEXT NOT NULL,
  color TEXT,
  position REAL NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  is_system INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (list_key, item_key)
);
CREATE INDEX idx_picklist_items_list ON picklist_items(list_key, position);

INSERT INTO picklist_items (list_key, item_key, label, position, is_system) VALUES
  ('lost_reason', 'price', 'Giá cao', 1, 0),
  ('lost_reason', 'competitor', 'Có đối thủ tốt hơn', 2, 0),
  ('lost_reason', 'no_budget', 'Không có ngân sách', 3, 0),
  ('lost_reason', 'project_stopped', 'Dừng dự án', 4, 0),
  ('lost_reason', 'solution_mismatch', 'Không phù hợp giải pháp', 5, 0),
  ('lost_reason', 'requirement_unmet', 'Không đáp ứng yêu cầu', 6, 0),
  ('lost_reason', 'no_contact', 'Không liên hệ được', 7, 0),
  ('lost_reason', 'bad_timing', 'Thời điểm chưa phù hợp', 8, 0),
  ('lost_reason', 'self_build', 'Khách hàng tự triển khai', 9, 0),
  ('lost_reason', 'other', 'Khác', 10, 1),

  ('interaction_type', 'call', 'Gọi điện', 1, 0),
  ('interaction_type', 'email', 'Email', 2, 0),
  ('interaction_type', 'meeting', 'Gặp mặt', 3, 0),
  ('interaction_type', 'demo', 'Demo', 4, 0),
  ('interaction_type', 'proposal', 'Proposal', 5, 0),
  ('interaction_type', 'followup', 'Follow-up', 6, 0),
  ('interaction_type', 'note', 'Ghi chú', 7, 0),
  ('interaction_type', 'zalo', 'Zalo', 8, 0),
  ('interaction_type', 'other', 'Khác', 9, 1),

  ('doc_type', 'proposal', 'Proposal', 1, 0),
  ('doc_type', 'quotation', 'Báo giá', 2, 0),
  ('doc_type', 'contract', 'Hợp đồng', 3, 1),
  ('doc_type', 'nda', 'NDA', 4, 0),
  ('doc_type', 'meeting_minute', 'Biên bản họp', 5, 0),
  ('doc_type', 'requirement', 'Yêu cầu khách hàng', 6, 0),
  ('doc_type', 'profile', 'Hồ sơ năng lực', 7, 0),
  ('doc_type', 'other', 'Khác', 8, 1);

/* Giá trị lạ đã nằm sẵn trong dữ liệu (nhập tay qua SQL, bản cũ) vẫn phải hiển thị
   được: thêm thành mục đang ẩn, nhãn là chính khoá, để quản trị viên đổi tên hoặc gộp. */
INSERT OR IGNORE INTO picklist_items (list_key, item_key, label, position, is_active)
  SELECT DISTINCT 'lost_reason', lost_reason, lost_reason, 100, 0
    FROM deals WHERE lost_reason IS NOT NULL AND lost_reason <> '';
INSERT OR IGNORE INTO picklist_items (list_key, item_key, label, position, is_active)
  SELECT DISTINCT 'doc_type', doc_type, doc_type, 100, 0
    FROM documents WHERE doc_type IS NOT NULL AND doc_type <> '';
