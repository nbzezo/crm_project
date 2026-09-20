/*
 * v41 — Phien chat Tro ly AI thuoc ve mot nguoi dung.
 *
 * v37 them phien chat khi ung dung con la mot nguoi dung. Tu v38 co nhieu tai
 * khoan, va bang nay khong co cot chu so huu nen:
 *   - moi nguoi doc va XOA duoc hoi thoai cua nguoi khac;
 *   - noi dung tra loi duoc sinh ra tu PHAM VI CUA NGUOI HOI, nen mot hoi thoai
 *     cua giam doc nam ngay trong danh sach cua nhan vien;
 *   - gioi han 20 phien la gioi han CHUNG, nen vai nguoi dung cung luc se day
 *     lich su cua nhau ra ngoai.
 *
 * `ON DELETE CASCADE`: xoa mot tai khoan thi hoi thoai rieng cua ho di theo —
 * day la du lieu ca nhan, khong phai du lieu nghiep vu can giu lai de doi chieu.
 *
 * Phien cu (truoc v41) duoc gan cho QUAN TRI HE THONG. Phien chat co tu v37,
 * truoc khi co nhieu tai khoan (v38), nen moi phien cu deu do tai khoan quan
 * tri dau tien tao ra. Lui ve `MIN(id)` neu khong tim thay ai giu vi tri do —
 * mot phien vo chu se khong hien ra voi bat ky ai va cung khong xoa duoc.
 */

ALTER TABLE ai_chat_sessions
  ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

UPDATE ai_chat_sessions
   SET user_id = COALESCE(
         (SELECT MIN(up.user_id) FROM user_positions up
            JOIN positions p ON p.id = up.position_id
           WHERE p.code = 'system_admin'),
         (SELECT MIN(id) FROM users))
 WHERE user_id IS NULL;

/* Danh sach phien luon la "cua toi, moi nhat truoc" — mot chi muc phuc hop cho
   dung hinh dang truy van do, thay cho chi muc chi theo updated_at cua v37. */
DROP INDEX IF EXISTS idx_ai_chat_sessions_updated;
CREATE INDEX idx_ai_chat_sessions_user ON ai_chat_sessions(user_id, updated_at DESC);
