Một khái niệm chỉ có **một** tên. Bảng dưới đây là nguồn quyết định duy nhất cho câu hỏi "gọi cái
này là gì".

## Giữ nguyên tiếng Anh

Những từ này không dịch, vì dịch sẽ làm giao diện lệch khỏi tên trường dữ liệu và khỏi báo cáo.

| Thuật ngữ | Nghĩa |
|---|---|
| **Next Action** | Bước tiếp theo của một cơ hội, kèm ngày thực hiện |
| **pipeline** | Toàn bộ cơ hội đang chạy, xếp theo giai đoạn |
| **forecast** | Dự báo doanh thu, kèm bộ điều kiện phủ quyết |
| **BANT** | Bốn yếu tố đo cơ hội có thật không: ngân sách, quyền hạn, nhu cầu, thời gian |
| **4P** | Bốn yếu tố đo ta có lợi thế không |
| **PoC** | Proof of Concept — bản chạy thử để chứng minh giải pháp |
| **veto** | Quy tắc phủ quyết, loại một cơ hội khỏi forecast bất kể điểm số |

## Tên dùng trong sản phẩm

| Hay gọi là | Trong sản phẩm là |
|---|---|
| Weighted pipeline | **Pipeline có trọng số** |
| AI Brief | **Tóm tắt AI** |
| HĐ sắp hết hạn | **Hợp đồng sắp hết hạn** |
| Follow-up | **Theo dõi lại** |
| Proposal | **Đề xuất** |
| stage | **Giai đoạn** |
| probability | **Xác suất** |
| opportunity / deal | **Cơ hội** |
| account / customer | **Khách hàng** |
| contract | **Hợp đồng** |
| quotation | **Báo giá** |
| task | **Công việc** |
| document | **Tài liệu** |

## Luồng việc, cột, giai đoạn, quy trình

Bốn khái niệm hay bị lẫn. Ranh giới giữa chúng:

| Khái niệm | Tên hiển thị | Chia việc theo |
|---|---|---|
| board | **Bảng – Luồng việc** (chỗ hẹp gọi là **Luồng việc**) | **Mảng** công việc |
| list | **Cột** | **Trạng thái**, bên trong một luồng |
| phase | **Giai đoạn** | Luồng việc **có mốc bàn giao** |
| card_flow | **Quy trình**, đơn vị là **bước** | Phần việc của **một trạng thái**, bên trong **một công việc** |

Một dự án chỉ có một luồng thì luồng đó là **ngầm** — không bắt người dùng chọn.

> **Cảnh báo** **Giai đoạn** của *cơ hội* (stage trong pipeline bán hàng) là khái niệm của phần Kinh
> doanh, không liên quan gì đến giai đoạn của dự án.

## Nhắc, đôn đốc, sự kiện, mốc (1.42.0)

Mỗi khái niệm một tên, để chữ "nhắc" hay "sự kiện" không còn chỉ nhiều thứ khác nhau:

| Tên hiển thị | Là gì | Tên cũ |
|---|---|---|
| **Nhắc hẹn** | Lời nhắc gửi cho **chính bạn** vào một giờ: nhắc hẹn, nhắc của sự kiện lịch, nhắc của ghi chú nhanh — đều bật cùng một popup | Nhắc việc |
| **Đôn đốc** | Bạn nhắc **người khác** làm việc của họ, có nhật ký số lần | Nhắc người khác |
| **Sự kiện** | Một mục trên **Lịch** của bạn | |
| **Sự kiện nhóm** | Bài đăng loại sự kiện trên **Bảng tin**, có trả lời tham gia | Sự kiện |
| **Mốc thúc đẩy** | Ràng buộc **của khách** buộc họ phải quyết định trước một ngày (phần chấm điểm cơ hội) | Sự kiện bắt buộc |
| **Giai đoạn bán hàng** | Mục Cài đặt cấu hình các giai đoạn của pipeline | Quy trình bán hàng |
| **Nội bộ & đối tác** | Danh bạ các tổ chức không phải khách hàng: công ty mình, đối tác, nhà cung cấp | Tổ chức & nhân sự |

"Quy trình" từ nay chỉ dùng cho các **bước** bên trong một công việc (xem bảng trên). "Sơ đồ tổ chức"
trong Cài đặt là cây phòng ban của công ty mình, khác với danh bạ *Nội bộ & đối tác*.

## Trạng thái công việc

| Khái niệm | Nghĩa |
|---|---|
| **Trạng thái** | Một mục trong danh sách phẳng do quản trị cấu hình |
| **Ý nghĩa** | Thuộc tính của trạng thái: Chưa bắt đầu · Đang thực hiện · Chờ bên ngoài · Bị chặn · Chờ duyệt · Hoàn thành |

Ý nghĩa là **thuộc tính**, không phải một nhóm chứa các trạng thái khác — đừng gọi nó là "nhóm trạng
thái".

## Dạng xem

| Dạng dữ liệu | Tên hiển thị |
|---|---|
| board | **Kanban** (trong luồng việc), **Cây việc** (tab Công việc của dự án) |
| table | **Bảng tính** — không gọi là "Bảng", để khỏi trùng với luồng việc |

## Ngôn ngữ dùng cho kết quả bán hàng

Dùng **thành công / thất bại**, **có lợi thế**, **được chọn**, **ký được hợp đồng**. Không dùng
"thắng/thua".

## Liên quan

- [Hệ thống gồm những gì](/huong-dan?bai=bat-dau)
- [Cột, trạng thái và quy trình](/huong-dan?bai=cot-va-quy-trinh)
