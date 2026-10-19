Ba kết nối ra ngoài, mỗi cái giải một việc khác nhau: **Email** để gửi thư mời và đặt lại mật khẩu,
**Telegram** để đẩy thông báo, **Google Drive** để có một bản sao lưu nằm ngoài máy chủ.

## Email (SMTP)

![Cài đặt → Email](/guide/img/cai-dat-email.jpg)

Khai báo máy chủ SMTP của công ty. Mật khẩu SMTP được **mã hóa** như API key AI.

> **Lưu ý** Chạy sau proxy hoặc tên miền riêng thì phải khai **Địa chỉ ứng dụng**. Để trống thì liên
> kết trong thư được suy từ header của request, và có thể trỏ vào tên container — người nhận bấm
> vào sẽ không mở được.

Chưa cấu hình SMTP thì hệ thống vẫn chạy: liên kết thư mời được in ra log máy chủ và hiện trên màn
hình *Người dùng* để gửi tay.

## Telegram

![Cài đặt → Telegram với kết nối bot và danh sách loại thông báo](/guide/img/cai-dat-telegram.jpg)

### Kết nối bot

1. Tạo bot qua **@BotFather** trên Telegram để lấy **Bot Token**.
2. Lấy **Chat ID** bằng cách nhắn cho **@userinfobot**.
3. Dán cả hai vào đây, bật **Gửi thông báo qua Telegram**.
4. Bấm **Gửi tin thử** để xác nhận.

Bot Token được **mã hóa tại máy chủ**. Tắt công tắc thì không gửi tin nào nữa nhưng **cấu hình vẫn
được giữ**.

### Chọn loại thông báo

Bật/tắt riêng từng loại:

- **Việc đến hạn và quá hạn** — tóm tắt các việc sắp đến hạn hoặc đã trễ
- **Nhắc hẹn cá nhân** — theo giờ hẹn của từng người
- **Khi được giao việc mới** — gửi ngay khi có người giao việc
- **Bảng tin nhóm** — khi được nhắc tên, có thông báo mới, có bình luận vào bài của bạn, hoặc bài
  chờ bạn duyệt

Bot đẩy tin trong vòng tối đa 5 phút.

### Sao lưu qua Telegram

Cùng màn hình này bật **sao lưu định kỳ**: chọn chu kỳ **6h / 12h / 24h / 3 ngày / 1 tuần**, hệ
thống tự gửi nguyên tệp cơ sở dữ liệu qua Telegram, kèm nút gửi ngay và mốc lần gửi gần nhất / kế
tiếp.

> **Cảnh báo** Bản sao lưu này chứa **toàn bộ dữ liệu khách hàng** và mật khẩu đã băm. Chỉ gửi vào
> một kênh Telegram riêng tư do công ty kiểm soát.

## Google Drive

*Cài đặt → Dữ liệu & sao lưu → Sao lưu lên Google Drive* đẩy bản sao ra ngoài máy chủ. Xem chi tiết
ở [Sao lưu và hồ sơ cấu hình](/huong-dan?bai=qt-sao-luu).

Cần một **OAuth client của Google** (loại Web application) có bật **Google Drive API**, và thêm
Redirect URI của phần sao lưu vào client đó. Nhớ đặt Publishing status là **In production** — để
*Testing* thì Google thu hồi quyền sau 7 ngày.

## Trợ lý AI

*Cài đặt → Trợ lý AI*: nhập API key cho Gemini, Claude, DeepSeek hoặc 9Router rồi bấm **Lưu & nhận
diện model**. Trình duyệt **không** gọi thẳng nhà cung cấp và API key không bao giờ được trả về
phía client.

## Liên quan

- [Người dùng và thư mời](/huong-dan?bai=qt-nguoi-dung)
- [Sao lưu và hồ sơ cấu hình](/huong-dan?bai=qt-sao-luu)
- [Trợ lý AI](/huong-dan?bai=tro-ly-ai)
