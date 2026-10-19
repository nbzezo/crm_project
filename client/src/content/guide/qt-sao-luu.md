Toàn bộ dữ liệu nằm trong **một tệp cơ sở dữ liệu** cộng với **thư mục tệp tải lên**. Sao lưu nghĩa
là giữ bản sao của cả hai.

![Cài đặt → Sao lưu](/guide/img/cai-dat-sao-luu.jpg)

## Sao lưu một chạm

Nút **Sao lưu ngay** tạo một bản sao an toàn của cơ sở dữ liệu ngay trên máy chủ. An toàn kể cả khi
có người đang dùng hệ thống.

> **Cảnh báo** Bản sao này nằm **cùng một ổ đĩa** với dữ liệu gốc. Nó cứu bạn khỏi lỗi thao tác,
> **không** cứu bạn khỏi hỏng ổ hay mất máy chủ. Vì vậy hãy bật thêm một trong hai cách dưới đây.

## Sao lưu ra ngoài máy chủ

| Cách | Gồm gì | Cấu hình ở |
|---|---|---|
| **Telegram** | Chỉ cơ sở dữ liệu | *Cài đặt → Telegram* |
| **Google Drive** | Cơ sở dữ liệu **và tệp tải lên** | *Cài đặt → Dữ liệu & sao lưu* |

### Google Drive

Theo lịch (mặc định mỗi ngày), hệ thống nén cơ sở dữ liệu và đẩy vào thư mục
`WorkFlow CRM — Sao lưu/database/`, **giữ 14 bản gần nhất** (chỉnh được), rồi đẩy mọi **tệp tải lên
mới** vào `files/`.

- Tệp đã lên thì không tải lại.
- Tệp bị xóa khỏi hệ thống **không** bị xóa khỏi Drive.
- Hệ thống chỉ xin quyền hẹp: nó thấy và sửa được **các tệp do chính nó tạo**, không đọc được phần
  còn lại của Drive.
- Nút **Khôi phục tệp bị mất** tải lại các tệp cần mà không còn trên máy chủ; chỉ thêm tệp thiếu,
  không ghi đè tệp đang có.

> **Cảnh báo** Bản sao chứa toàn bộ dữ liệu khách hàng và mật khẩu đã băm. Dùng tài khoản Google
> **của công ty**, bật xác minh 2 bước, và không chia sẻ thư mục sao lưu.

## Khôi phục khi mất máy chủ

Việc này **làm tay**, cố ý không có nút trên giao diện: thay tệp cơ sở dữ liệu đang chạy từ web sẽ
làm mất dữ liệu của mọi người kể từ lúc sao lưu.

1. Dựng lại hệ thống trên máy mới, **chưa cho người dùng vào**. Dừng ứng dụng.
2. Tải bản sao mới nhất trong `WorkFlow CRM — Sao lưu/database/`, giải nén và đặt vào thư mục dữ
   liệu.
3. Tải toàn bộ thư mục `files/` trên Drive về thư mục dữ liệu, giữ nguyên tên tệp.
4. Khởi động lại.

> **Lưu ý** Mật khẩu SMTP, API key AI và token Google trong cơ sở dữ liệu được mã hóa bằng một
> **khóa nằm trong thư mục dữ liệu**, và khóa đó **không** có trong bản sao lưu. Mất khóa thì sau
> khi khôi phục phải nhập lại các cấu hình đó. Nên tự cất riêng một bản của khóa này.

## Hồ sơ cấu hình

![Cài đặt → Hồ sơ cấu hình](/guide/img/cai-dat-ho-so-cau-hinh.jpg)

Xuất **toàn bộ cấu hình** — danh mục, pipeline, chấm điểm, bàn giao, triển khai, vị trí & quyền —
thành một tệp JSON, rồi nhập lại ở bản cài khác.

- **Luôn chạy thử trước** rồi mới áp dụng thật.
- Hồ sơ khớp theo khóa và **không xóa gì**: mục không có trong hồ sơ mà chưa có dữ liệu thì bị ẩn,
  không bị xóa.

Đây là cách dựng một bản cài cho công ty mới mà không phải khai lại từ đầu.

## Liên quan

- [Xuất dữ liệu](/huong-dan?bai=xuat-du-lieu) — khác sao lưu, xem bảng so sánh ở cuối bài đó
- [Email, Telegram và Google Drive](/huong-dan?bai=qt-ket-noi)
- [Danh mục và quy trình](/huong-dan?bai=qt-danh-muc)
