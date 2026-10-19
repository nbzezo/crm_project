Trước khi gọi quản trị, thử các mục dưới đây — phần lớn sự cố nằm ở nhóm đầu tiên và không phải
lỗi hệ thống.

## "Tôi không thấy dữ liệu mà đồng nghiệp thấy"

Gần như luôn là **phạm vi dữ liệu**, không phải lỗi.

1. Hồ sơ đó có **người phụ trách** là ai? Bạn chỉ thấy hồ sơ của mình và của cấp dưới trong cây đơn
   vị.
2. Trong màn hình đang mở còn **bộ lọc** nào bật không? Nút lọc hiện số bộ lọc đang bật.
3. Nếu bạn cần quyền rộng hơn, nhờ quản trị xem lại vị trí của bạn ở *Cài đặt → Vị trí & phân
   quyền* — xem [Tổ chức, vị trí và phân quyền](/huong-dan?bai=qt-phan-quyen).

> **Lưu ý** Bản ghi ngoài phạm vi trả về **"không tìm thấy"** chứ không phải "không có quyền". Nên
> một đường link đồng nghiệp gửi có thể mở ra trang không tìm thấy — đó là thiết kế.

## "Bảng của tôi trống trơn"

Kiểm tra theo thứ tự: bộ lọc trên bảng → cột có bị thu gọn không → thẻ có bị **lưu trữ** không. Thẻ
lưu trữ khôi phục được từ menu bảng.

## "Giờ hiển thị lệch 7 tiếng"

Báo quản trị: đó là dấu hiệu máy chủ đang chạy múi giờ UTC thay vì giờ Việt Nam. Đây là lỗi cấu
hình máy chủ, không phải lỗi tài khoản của bạn.

## "Tôi không nhận được thư mời / thư đặt lại mật khẩu"

1. Kiểm tra hộp thư rác.
2. Liên kết chỉ **dùng một lần** và hết hạn sau **60 phút** — nhờ quản trị gửi lại.
3. Nếu liên kết trỏ về một địa chỉ lạ, quản trị chưa khai **Địa chỉ ứng dụng** ở *Cài đặt → Email*.
4. Nếu công ty chưa cấu hình SMTP, quản trị lấy liên kết ngay trên màn hình *Người dùng* và gửi tay.

## "Tính năng AI báo lỗi"

Mở trang **Trợ lý AI → tab Sử dụng** và đọc **mã lỗi** của lần gọi gần nhất. Mọi lỗi phía nhà cung
cấp đều hiện ra ngoài thành một mã chung, nên bảng này là chỗ duy nhất thấy nguyên nhân thật.

| Thường gặp | Cách xử lý |
|---|---|
| Chưa cấu hình API key | Quản trị nhập key ở *Cài đặt → Trợ lý AI* |
| Hết quota | Chờ chu kỳ sau, hoặc nâng hạn mức với nhà cung cấp |
| Tệp quá lớn | Chia nhỏ tệp hoặc bản ghi âm |
| Model không đọc được âm thanh | Đổi model ở *Cài đặt → Ghi âm → văn bản* |

## "Không bật được micro"

Trình duyệt đang chặn quyền micro cho trang này. Mở phần quyền của trang trong trình duyệt và cho
phép micro, rồi tải lại trang.

## "Không tải được tệp lên"

Giới hạn là **25 MB** mỗi tệp, và chỉ nhận các định dạng tài liệu, ảnh, âm thanh và ZIP thông
thường. Tệp lớn hơn thì nén lại hoặc chia nhỏ.

## "Trang chậm"

- Các màn hình nặng (doanh thu, báo cáo, tổng quan) được **tính trước và lưu đệm**; đầu trang ghi
  rõ thời điểm tính. Bấm **Làm mới** để tính lại.
- Nếu chậm kéo dài ở mọi màn hình, báo quản trị kèm **thời điểm** gặp chậm.

## "Số ở Tổng quan khác số ở Báo cáo"

Không phải lỗi. Tổng quan tính **tại thời điểm mở trang**; Báo cáo tính theo **kỳ bạn chọn**. Hai
cách tính khác nhau thì hai con số được phép khác nhau.

## Vẫn chưa xong

Khi báo cho quản trị, kèm ba thứ này sẽ nhanh hơn hẳn:

1. **Đường dẫn** của trang đang mở (sao chép từ thanh địa chỉ).
2. **Thời điểm** xảy ra.
3. Ảnh chụp màn hình, kèm **nguyên văn** thông báo lỗi nếu có.
