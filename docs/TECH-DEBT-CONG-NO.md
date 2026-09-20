# Nợ kỹ thuật: module công nợ đầy đủ

Đợt phân cấp quản lý (v38–v40) **chỉ phân quyền trên dữ liệu doanh thu sẵn có**. Đây là ghi chép về
phần còn thiếu, để khi làm tiếp không phải khảo sát lại từ đầu.

## Hiện có gì

`service_revenues` lưu mỗi tháng của mỗi dòng *khách hàng × dịch vụ* là **một khoản tiền có trạng
thái**: `forecast → reconciled → invoiced → paid`. Tiền không nhân đôi giữa các bước — một ô nằm ở
đúng một trạng thái.

Từ đó suy ra được **công nợ** = tổng các ô đang dừng ở `invoiced`. Đó là tiền đã xuất hoá đơn mà
khách chưa trả. Hàm `receivable()` trong [client/src/lib/revenue.ts](../client/src/lib/revenue.ts)
tính con số này, hiển thị thành cột *Công nợ* trên trang Doanh thu.

> Đừng nhầm với *"còn phải thu"* trên dải phễu (`amount − paid`): số đó gộp cả phần **chưa** xuất hoá
> đơn, tức là tiền mình chưa có quyền đòi. Hai con số trả lời hai câu hỏi khác nhau và đều đúng.

## Thiếu gì

| Thiếu | Vì sao cần | Chặn điều gì |
|---|---|---|
| Bảng `invoices` (số hoá đơn, ngày phát hành, **hạn thanh toán**, giá trị, VAT) | Một trạng thái `invoiced` trên ô doanh thu tháng không mang được số hoá đơn lẫn hạn trả | Không đối chiếu được với kế toán, không biết khoản nào **quá hạn** |
| Bảng `payments` (phiếu thu, ngày thu, số tiền, đối chiếu nhiều hoá đơn) | Hiện một ô chỉ chuyển nguyên trạng thái sang `paid` | **Thu một phần** không mô tả được — khách trả 60% thì hệ thống chỉ có hai lựa chọn sai |
| **Tuổi nợ** 0–30 / 31–60 / 61–90 / >90 ngày | Là cách duy nhất phân biệt nợ bình thường với nợ xấu | Không tính được nếu không có hạn thanh toán trên từng hoá đơn |
| Nhắc thu nợ tự động | Nối vào scheduler Telegram/email sẵn có | — |

Thứ tự phụ thuộc rõ ràng: **`invoices` trước**, vì `payments` và tuổi nợ đều cần hạn thanh toán do nó
mang. Làm tuổi nợ trước sẽ phải bịa hạn từ ngày xuất hoá đơn cộng một con số cố định — một con số
trông có vẻ đúng nhưng không khớp hợp đồng nào.

## Phần đã chừa sẵn

Resource **`ar`** đã nằm trong danh mục quyền
([packages/contracts/src/permissions.ts](../packages/contracts/src/permissions.ts)) với đủ năm thao
tác, và vị trí *Admin doanh thu & công nợ* đã được cấp `ar` ở mức Toàn công ty. Khi làm module này,
màn hình mới gắn vào `requireResource('ar')` là chạy — **không cần migration quyền**, không phải cấu
hình lại cho các vị trí đã có.

Ma trận phân quyền trên giao diện đã hiện dòng *Công nợ* kèm ghi chú "Chưa có màn hình", nên người
quản trị biết nó tồn tại mà chưa dùng được.

## Quyết định đã ghi nhận

Người dùng chốt ngày 2026-09-20: đợt phân cấp **chỉ phân quyền trên dữ liệu sẵn có**, module công nợ
đầy đủ để lại làm sau. Lý do: khối lượng của nó ngang phần phân quyền, gộp vào sẽ kéo dài đáng kể một
đợt vốn đã lớn.
