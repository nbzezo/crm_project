Hệ thống đăng nhập bằng **email**. Không ai tạo mật khẩu cho bạn: người quản trị tạo tài khoản rồi
gửi một **thư mời**, bạn tự đặt mật khẩu qua liên kết trong thư. Nhờ vậy không ai biết mật khẩu của
người khác, kể cả quản trị.

![Màn hình đăng nhập với ô email, ô mật khẩu và liên kết Quên mật khẩu](/guide/img/dang-nhap-man-hinh.jpg)

## Lần đầu vào hệ thống

1. Mở thư mời trong hộp thư của bạn, bấm liên kết trong thư.
2. Đặt mật khẩu (tối thiểu 8 ký tự) rồi xác nhận lại.
3. Hệ thống đưa bạn vào thẳng trang Tổng quan.

Liên kết trong thư mời **dùng một lần**. Nếu nó hết hiệu lực hoặc bạn làm mất thư, nhờ quản trị bấm
**Gửi lại thư mời** ở *Cài đặt → Người dùng*.

## Quên mật khẩu

Bấm **Quên mật khẩu** ở màn đăng nhập, nhập email, rồi mở liên kết trong thư. Liên kết dùng một lần
và hết hiệu lực sau **60 phút**.

> **Lưu ý** Màn hình luôn trả về cùng một câu trả lời dù email có tồn tại hay không. Đó là cố ý: nếu
> nó nói "email này không có tài khoản" thì bất kỳ ai cũng dùng được màn hình đó để dò xem địa chỉ
> nào đang có tài khoản trong hệ thống.

Nếu không nhận được thư, hỏi quản trị xem *Cài đặt → Email* đã khai báo SMTP chưa. Khi chưa khai
báo, hệ thống in liên kết ra log của máy chủ và màn *Người dùng* hiện liên kết để quản trị gửi tay.

## Đổi mật khẩu

*Cài đặt → Tài khoản*: nhập mật khẩu hiện tại rồi nhập mật khẩu mới hai lần.

Nếu nghi ngờ có người khác đang dùng tài khoản của bạn, nhờ quản trị bấm **Đăng xuất khỏi mọi thiết
bị** — mọi phiên đang mở ở mọi máy đều bị hủy.

## Khóa màn hình

Khi rời chỗ mà không muốn đăng xuất hẳn, bấm biểu tượng khóa trên thanh trên (trên điện thoại nằm
trong menu tài khoản). Màn hình chuyển sang màn chờ và phải nhập **PIN** mới vào lại được.

- PIN đặt ở *Cài đặt → Tài khoản*.
- Quên PIN thì bấm **Gửi lại PIN qua email** ngay trên màn chờ.
- Khóa màn hình **không** thay cho đăng xuất: phiên vẫn còn. Dùng ở máy của bạn, đừng dùng ở máy
  dùng chung.

## Lỗi hay gặp

| Hiện tượng | Nguyên nhân thường gặp |
|---|---|
| "Email hoặc mật khẩu không đúng" dù chắc chắn đúng | Tài khoản cũ có thể vẫn đang đăng nhập bằng *tên đăng nhập*; nhờ quản trị gán email cho tài khoản |
| Vừa đăng nhập đã bị đẩy ra | Trình duyệt đang chặn cookie của trang, hoặc đồng hồ máy lệch nhiều |
| Không bấm được liên kết trong thư | Liên kết đã dùng rồi, hoặc đã quá 60 phút |
| Liên kết trong thư trỏ về một địa chỉ lạ | Quản trị chưa khai **Địa chỉ ứng dụng** ở *Cài đặt → Email* |
