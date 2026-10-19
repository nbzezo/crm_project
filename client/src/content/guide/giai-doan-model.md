Một dự án lớn và một dự án nhỏ không nên đi qua cùng số bước. Hệ thống giải quyết việc đó bằng hai
thứ: **giai đoạn** (luồng việc có mốc bàn giao) và **Model A/B** (mẫu dự án lớn hay nhỏ).

## Giai đoạn là gì

**Giai đoạn = luồng việc có gắn một mốc bàn giao.** Nó không phải một thực thể riêng: bạn gắn mốc
hạn cho một bảng con trong dự án, thế là bảng đó đọc lên thành "giai đoạn".

Trạng thái của giai đoạn — đúng hạn / sắp tới hạn / quá hạn — **tính khi đọc** từ mốc đó cùng các
thẻ đã xong bên trong. Không có cột nào lưu sẵn, nên không bao giờ có chuyện mốc đã dời mà trạng
thái vẫn là của hôm qua.

> **Lưu ý** Đừng nhầm với **giai đoạn của cơ hội** (stage trong pipeline bán hàng). Hai thứ trùng
> tên nhưng khác hẳn nhau: một bên là tiến độ triển khai, một bên là bước bán hàng.

## Model A và Model B

Khi tạo dự án, hệ thống **gợi ý** một trong hai mẫu:

| Mẫu | Dành cho | Số bước |
|---|---|---|
| **Model A** | Dự án lớn | 9 bước, P01 đến P09 |
| **Model B** | Dự án nhỏ | 5 bước |

Gợi ý dựa trên **4 ngưỡng** cấu hình ở *Cài đặt → Triển khai*:

- Giá trị hợp đồng
- Số ngày thực hiện
- Số giai đoạn
- Số người tham gia

## Chọn khác gợi ý

Được, nhưng **bắt buộc nhập lý do**, và lý do đó ghi vào nhật ký thay đổi của dự án.

> **Mẹo** Đây không phải thủ tục hành chính. Sáu tháng sau, khi một dự án nhỏ hóa ra phình to, dòng
> lý do đó là thứ duy nhất cho biết lúc đầu ai đã nghĩ gì.

## Đổi ngưỡng

Ngưỡng nằm ở *Cài đặt → Triển khai* và cần quyền cấu hình. Đổi ngưỡng **không** làm thay đổi các dự
án đã tạo — nó chỉ ảnh hưởng tới gợi ý cho dự án mới.

## Liên quan

- [Dự án](/huong-dan?bai=du-an)
- [Bảng và luồng việc](/huong-dan?bai=bang-luong-viec)
- [Danh mục và quy trình](/huong-dan?bai=qt-danh-muc) — nơi đổi ngưỡng
