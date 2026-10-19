Một **cơ hội** là một lần bạn có thể bán được gì đó cho một khách hàng. Nó đi qua các **giai đoạn**
của pipeline, và mỗi giai đoạn có một xác suất gợi ý.

![Pipeline dạng Kanban với các cột giai đoạn và thẻ cơ hội](/guide/img/co-hoi-pipeline.jpg)

## Màn hình pipeline

Dải chỉ số đầu trang: **Cơ hội đang mở · Tổng pipeline · Pipeline có trọng số · Chờ bàn giao**.

Hai dạng xem, đổi ở góc phải:

- **Pipeline** — Kanban, mỗi cột là một giai đoạn, chân cột có **Tổng** và **Trọng số**.
- **Danh sách** — bảng, tiện khi so sánh nhiều cơ hội.

Mỗi thẻ hiện tên cơ hội, giá trị, **xác suất**, khách hàng, người phụ trách và ngày chốt dự kiến.
Thẻ đang bị chặn khỏi dự báo hiện một dải cảnh báo màu đỏ ngay trên thẻ.

## Các giai đoạn

Mặc định có 8 giai đoạn:

Tiềm năng → Đang tiếp cận → Đang trao đổi → **PoC / Thử nghiệm** → Gửi báo giá → Đàm phán →
Thành công / Thất bại

Danh sách này **cấu hình được** ở *Cài đặt → Quy trình bán hàng*: đổi tên, màu, thứ tự, xác suất gợi
ý và số ngày tối đa cho mỗi giai đoạn. Thành công và Thất bại là giai đoạn hệ thống, không xóa được.

## Chuyển giai đoạn

Kéo thẻ sang cột khác, hoặc dùng **thanh giai đoạn** ngay trên trang chi tiết cơ hội (không cần vào
Kanban).

- Kéo sang **Thất bại** thì **bắt buộc chọn lý do**.
- Chốt **Thành công** thì nhập giá trị thật và tạo hợp đồng ngay tại đó.
- Một số giai đoạn có **cổng** chặn: phải đạt điểm BANT tối thiểu mới qua được. Xem
  [Đánh giá cơ hội](/huong-dan?bai=danh-gia-co-hoi).

## Next Action

**Next Action** là bước tiếp theo bạn sẽ làm, kèm **ngày thực hiện**. Đây là ô quan trọng nhất của
một cơ hội: cơ hội không có Next Action sẽ nổi lên ở trang Tổng quan như một dấu hiệu bị bỏ rơi.

## Tạm dừng

Cờ **Tạm dừng** gắn thêm vào bất kỳ giai đoạn nào, kèm **lý do** và **ngày hẹn xem lại**.

> **Lưu ý** Tạm dừng cố ý **không** phải một giai đoạn riêng. Một cơ hội dừng lại vẫn đang nằm ở một
> chỗ cụ thể trong pipeline; biến nó thành giai đoạn sẽ làm mất thông tin đó.

## Tuổi giai đoạn

Mỗi cơ hội hiện số ngày đã nằm ở giai đoạn hiện tại, tính từ lần chuyển gần nhất. Quá số ngày tối đa
mà quản trị khai cho giai đoạn đó thì cơ hội bị đánh dấu là đang chững.

## Trang chi tiết cơ hội

![Trang chi tiết một cơ hội với thanh giai đoạn và cột Hoạt động](/guide/img/co-hoi-chi-tiet.jpg)

Đầu trang có giá trị, xác suất, ngày dự kiến chốt và huy hiệu tình trạng đánh giá. Dưới đó là
**thanh giai đoạn** bấm chuyển trực tiếp, rồi bốn thẻ tóm tắt **Đánh giá nhanh · Người liên quan ·
Tài liệu · Bàn giao**.

Các tab: Tổng quan · Đánh giá · Người liên quan · Thông tin · Trang tài liệu · Bàn giao.

Cột **Hoạt động** bên phải cho ghi một dòng ghi chú nhanh (Enter để gửi, Shift+Enter xuống dòng) mà
không phải mở hồ sơ khách hàng; bấm **Ghi nhận đầy đủ** khi muốn ghi một tương tác có loại và kết
quả.

## Liên quan

- [Đánh giá cơ hội](/huong-dan?bai=danh-gia-co-hoi)
- [Sức khỏe pipeline](/huong-dan?bai=suc-khoe-pipeline)
- [Báo giá và hợp đồng](/huong-dan?bai=bao-gia-hop-dong)
