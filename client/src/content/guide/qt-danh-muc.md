Mỗi bản cài là một công ty khác nhau nhưng dùng chung một mã nguồn. Khác biệt nằm ở **dữ liệu cấu
hình** — sửa trên giao diện, không cần lập trình.

## Danh mục

![Cài đặt → Danh mục với danh sách Lý do thất bại](/guide/img/cai-dat-danh-muc.jpg)

*Cài đặt → Danh mục* chứa các danh sách giá trị xuất hiện trong ô chọn khắp ứng dụng:

Lý do thất bại · Loại tương tác · Loại tài liệu · Ngành nghề khách hàng · Quy mô khách hàng ·
Nguồn khách hàng · Nguồn cơ hội

Với mỗi mục bạn **thêm, đổi tên, sắp xếp (mũi tên lên xuống), ẩn** (bỏ tích *Đang dùng*) hoặc
**gộp** sang mục khác. Bên cạnh mỗi dòng ghi **số bản ghi đang dùng** nó.

> **Lưu ý** Mục còn dữ liệu **không xóa hẳn được** — chỉ ẩn hoặc gộp. Nếu xóa được, các bản ghi cũ
> sẽ trỏ vào một giá trị không còn tồn tại, và báo cáo lịch sử sẽ thủng một mảng.

**Gộp** chuyển mọi bản ghi sang mục khác rồi bỏ mục cũ — dùng khi phát hiện hai mục trùng nghĩa
("Giá cao" và "Giá chưa tốt").

Mọi thay đổi lưu ngay và có hiệu lực với mọi người.

## Quy trình bán hàng

![Cài đặt → Quy trình bán hàng với các giai đoạn](/guide/img/cai-dat-quy-trinh-ban-hang.jpg)

Thêm / đổi tên / đổi màu / sắp xếp / ẩn giai đoạn. Mỗi giai đoạn khai được:

| Thuộc tính | Dùng để |
|---|---|
| **Xác suất gợi ý** | Tự điền khi cơ hội vào giai đoạn này |
| **Cổng BANT tối thiểu** | Chặn chuyển sang giai đoạn này nếu điểm chưa đủ |
| **Phải gặp người duyệt ngân sách** | Thêm một điều kiện cho cổng |
| **Theo dõi PoC** | Đánh dấu giai đoạn thử nghiệm |
| **Số ngày tối đa** | Quá số này thì cơ hội bị coi là đang chững |

**Thành công** và **Thất bại** là giai đoạn hệ thống, không xóa được.

> **Mẹo** Mã nguồn **không gọi tên giai đoạn** mà hỏi thuộc tính của nó. Nên bạn đổi tên "Gửi báo
> giá" thành "Trình phương án" là mọi logic vẫn chạy đúng.

## Trạng thái công việc

![Cài đặt → Trạng thái công việc](/guide/img/cai-dat-trang-thai-viec.jpg)

Danh sách trạng thái phẳng; mỗi trạng thái chọn một **ý nghĩa** (Chưa bắt đầu · Đang thực hiện ·
Chờ bên ngoài · Bị chặn · Chờ duyệt · Hoàn thành). Báo cáo và nhắc việc đọc **ý nghĩa**, không đọc
tên — xem [Cột, trạng thái và quy trình](/huong-dan?bai=cot-va-quy-trinh).

## Các mục cấu hình khác

| Mục | Khai gì |
|---|---|
| **Chấm điểm cơ hội** | Trọng số và ngưỡng của BANT / 4P, quy tắc phủ quyết |
| **Bàn giao** | SLA và bộ mẫu checklist — xem [Bàn giao và SLA](/huong-dan?bai=ban-giao) |
| **Quy trình công việc** | Mẫu các bước cho từng trạng thái công việc |
| **Triển khai dự án** | Bốn ngưỡng gợi ý Model A/B — xem [Giai đoạn và Model A/B](/huong-dan?bai=giai-doan-model) |
| **Nhãn** | Nhãn hai cấp dùng trên thẻ công việc |

## Liên quan

- [Sao lưu và hồ sơ cấu hình](/huong-dan?bai=qt-sao-luu) — mang toàn bộ cấu hình này sang bản cài khác
