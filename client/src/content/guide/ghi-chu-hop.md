Ghi chú họp là biên bản soạn **trong ứng dụng**, gắn với một Cơ hội, một Dự án, cả hai, hoặc đứng
độc lập. Xem toàn bộ ở *Tài liệu → Trang tài liệu*, hoặc đúng ghi chú của một hồ sơ ngay trong tab
của hồ sơ đó.

![Tab Trang tài liệu với danh sách ghi chú họp](/guide/img/ghi-chu-hop-danh-sach.jpg)

## Soạn thảo theo khối

Trình soạn thảo làm việc theo **khối**: mỗi đoạn, mỗi mục danh sách, mỗi bảng là một khối kéo thả
được. Gõ `/` để mở danh sách khối chèn được.

## Ba thứ chèn được mà văn bản thường không có

| Gõ | Chèn gì |
|---|---|
| `/` | Danh sách khối: tiêu đề, danh sách, bảng, sơ đồ, **tham chiếu công việc** |
| `@` | Nhắc tên một **người liên hệ** |
| `/` → sơ đồ | **Sơ đồ logic** (vẽ tay) hoặc **sơ đồ tư duy** |

### Sơ đồ trong trang

Trong trang, sơ đồ chỉ hiện **bản xem** (cuộn chuột vẫn cuộn trang). Bấm **Chỉnh sửa** hoặc nhấp
đúp để mở khung vẽ **toàn màn hình**, vẽ xong bấm **Xong** để lưu.

- **Sơ đồ tư duy**: `Tab` thêm nhánh con, `Enter` thêm nhánh ngang, chuột phải để có thêm lệnh.
  Chọn **Bố cục** (toả hai bên, sang phải, sang trái, cây xuống dưới) và bảng màu ở thanh trên;
  **Tạo bằng AI** dựng sơ đồ từ nội dung trang hoặc từ mô tả bạn gõ. Xuất được **PNG** và **SVG**.
- **Dàn ý ↔ sơ đồ**: ở một danh sách gạch đầu dòng, bấm **⋮⋮** → **Chuyển thành sơ đồ tư duy**.
  Ngược lại, bấm **Chuyển thành dàn ý** trên sơ đồ. Hoàn tác bằng `Ctrl+Z`.
- **Sơ đồ logic**: chọn **Dùng mẫu…** (quy trình duyệt, chia làn theo bộ phận, sơ đồ tổ chức) để
  bắt đầu nhanh. Trong menu công cụ của khung vẽ, **Text to diagram** nhờ AI vẽ từ mô tả, **Mermaid
  to Excalidraw** dựng sơ đồ từ mã Mermaid. Thanh công cụ của khung vẽ này hiện bằng tiếng Anh.
- Chữ trên sơ đồ được đưa vào **tìm kiếm** và **Tóm tắt bằng AI**.
- Người chỉ có quyền xem trang thấy nhãn **Chỉ xem**: đọc được, không sửa được.

### Tham chiếu công việc

Gõ `/` rồi chọn tham chiếu công việc: tạo việc mới hoặc gắn một việc có sẵn. Việc đó thành một
**chip sống** trong ghi chú — luôn hiện đúng trạng thái, hạn và người phụ trách **hiện tại**, không
phải trạng thái lúc bạn viết.

> **Mẹo** Đây là cách biên bản họp không bị lạc hậu. Thay vì viết "anh A sẽ gửi báo giá trước 20/10",
> chèn thẳng công việc đó vào — tuần sau đọc lại là biết nó xong chưa.

## AI tóm tắt

Nút tóm tắt cho AI đọc cả ghi chú và trả về:

1. **Nội dung tóm tắt**
2. **Danh sách việc cần làm** — mỗi việc **chờ bạn duyệt** trước khi tạo thật

Ngoài ra có bốn thao tác viết **inline** trên đoạn đang chọn: *Viết tiếp · Sửa ngữ pháp · Viết lại ·
Rút gọn*.

## Biên bản họp tính là một lần liên hệ

Ghi chú có mục đích **Họp** và giờ họp đã qua được tính là một lần liên hệ với khách, giống một
tương tác: cột Liên hệ cuối, nhịp chăm sóc và cảnh báo "Không tương tác >14 ngày" đều thấy. Ghi chú
gắn qua cơ hội hoặc dự án thì tính cho khách của cơ hội hoặc dự án đó. Chỉ **ngày họp** được dùng;
nội dung ghi chú vẫn riêng tư như dưới đây.

## Ghi âm

Nút ghi âm nằm ngay trong trình soạn thảo — xem
[Ghi âm thành văn bản](/huong-dan?bai=ghi-am).

## Quyền riêng tư

> **Lưu ý** Ghi chú là **dữ liệu cá nhân**: theo mặc định, cấp trên **không** đọc được Ghi chú họp
> và Ghi chú nhanh của nhân viên. Tổ chức nào muốn khác thì đổi được trên giao diện phân quyền,
> nhưng mặc định là riêng tư.

## Liên quan

- [Ghi chú nhanh](/huong-dan?bai=ghi-chu-nhanh)
- [Tệp tài liệu](/huong-dan?bai=tai-lieu)
- [Trợ lý AI](/huong-dan?bai=tro-ly-ai)
