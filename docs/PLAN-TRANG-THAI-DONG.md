# Kế hoạch: Trạng thái công việc cấu hình được

Dự kiến phát hành 1.30.0 · Migration v67 (`main` đang ở v66, bản 1.29.1)

## 1. Điều người dùng muốn

Ô **Trạng thái** của công việc (Task) không còn cố định 6 giá trị. Quản trị tự cấu hình
danh sách: thêm, đổi tên, đổi màu, sắp thứ tự, ẩn. Danh sách **phẳng**, dùng chung cho mọi
công việc — không có tầng "nhóm" (phần chia nhỏ một trạng thái đã là việc của Quy trình).

Mỗi trạng thái có một thuộc tính **Ý nghĩa với hệ thống**, chọn một trong:

| Ý nghĩa | Hệ thống dùng để |
|---|---|
| Chưa bắt đầu | Việc mới vào trạng thái đầu tiên có ý nghĩa này |
| Đang thực hiện | Mặc định cho trạng thái thường |
| Chờ bên ngoài | Hiện ở màn Cần theo dõi, nhắc người khác |
| Bị chặn | Ghi lý do và thời điểm bị chặn |
| Chờ duyệt | Hiện cho người duyệt |
| Hoàn thành | Tính là xong: báo cáo, việc lặp lại, tiến độ dự án |

Luật: luôn có ít nhất một trạng thái **Chưa bắt đầu** và một **Hoàn thành** đang dùng.

## 2. Dữ liệu (migration v67)

- Bảng mới `task_statuses(key, label, color, kind, position, is_active, is_builtin)`.
  `kind` là ý nghĩa ở trên (6 giá trị cũ). Sáu trạng thái hiện có được chèn sẵn với **khóa
  trùng giá trị cũ** (`todo`, `doing`, …) và `is_builtin = 1` — không xóa được, chỉ ẩn.
- `cards.status_key` (mới) = trạng thái cụ thể. `cards.status` **giữ nguyên** và mang
  `kind` của trạng thái đó, nên ~80 truy vấn báo cáo/nhắc việc/`is_done` không phải sửa.
  Thẻ cũ để `status_key` trống: trạng thái hiệu lực là `COALESCE(status_key, status)` —
  đúng trạng thái dựng sẵn cùng khóa.
- `lists.status_mapping` và `card_flows.status` lưu **khóa** trạng thái. Bảng `card_flows`
  được dựng lại để bỏ CHECK 5 giá trị.
- Mẫu quy trình (`task_flow.templates`) theo khóa trạng thái.
- Đổi ý nghĩa của trạng thái đang có việc dùng: bị từ chối. Ẩn trạng thái đang có việc
  dùng: phải chọn trạng thái để chuyển các việc đó sang.

## 3. Quay lui

Điểm quay lui đã tạo **trước khi** viết code:

- Mã nguồn: tag git `rollback/truoc-trang-thai-dong` tại bản 1.29.1 (commit `8798cb6`).
- CSDL: `migrate-v67-rollback.sql`, có test. Trạng thái tự tạo được quy về trạng thái
  dựng sẵn cùng ý nghĩa; quy trình của trạng thái tự tạo bị bỏ.

Các bước khi cần quay lui production:

1. Quay CSDL về v66 (script tự sao lưu `app.db` trước khi chạy):
   `npm run db:rollback --workspace server -- 66`
2. Đưa mã về bản cũ và deploy: `git revert` các commit 1.30.0 trên `main` (hoặc đẩy lại
   tag `rollback/truoc-trang-thai-dong`), rồi đẩy `main`.

Phải quay CSDL **trước** khi chạy mã cũ: mã 1.29.1 không biết cột `status_key`, còn bảng
`card_flows` v67 không có CHECK — mã cũ vẫn chạy được, nhưng trạng thái tự tạo sẽ hiện sai.

## 4. Thay đổi kèm theo

- Máy chủ: `setCardStatus` nhận khóa trạng thái; API `/api/task-statuses`; kéo thẻ, đổi
  trạng thái, tạo/sao chép việc, việc lặp lại, chuông thông báo, Quy trình theo khóa.
- Giao diện: Cài đặt → Quy trình công việc có thêm phần **Trạng thái công việc**; mọi ô
  chọn/chip trạng thái, cột kanban, nhóm theo trạng thái đọc danh sách động.
- Xuất dữ liệu (`EXPORT_TABLES`), hồ sơ cấu hình, ngữ cảnh AI (tên trạng thái).
- Đổi luật của 1.29: xong bước cuối thì chuyển đúng sang trạng thái đích kể cả khi luồng
  việc không có cột cho nó (thẻ nằm yên ở cột cũ). Trước đây nhảy thẳng sang Hoàn thành —
  với trạng thái tự tạo (thường không có cột) điều đó đóng nhầm việc.
