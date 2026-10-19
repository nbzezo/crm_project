Dòng thời gian (Gantt) vẽ công việc theo trục ngày: việc nào kéo dài bao lâu, việc nào chồng lên
nhau, và việc nào phải xong trước việc nào.

![Trang Dòng thời gian với các việc vẽ theo trục ngày](/guide/img/dong-thoi-gian.jpg)

## Đọc biểu đồ

- Mỗi việc là một dải từ **ngày bắt đầu** đến **hạn hoàn thành**. Việc chỉ có hạn thì vẽ thành một
  vạch ở đúng ngày đó.
- **Đường nối** giữa hai dải là một quan hệ phụ thuộc.
- **Mốc quan trọng** vẽ thành một dấu riêng, không phải một dải.

## Phụ thuộc finish-to-start

Khai "việc B chỉ bắt đầu sau khi việc A xong":

1. Mở việc B.
2. Thêm phụ thuộc, chọn việc A.

Hệ thống **chặn vòng lặp** — không khai được A chờ B trong khi B đang chờ A. Khi việc sau đã tới
ngày bắt đầu mà việc trước chưa xong, hệ thống **cảnh báo**.

> **Lưu ý** Phụ thuộc là một lời mô tả thực tế, không phải một cái khóa. Hệ thống cảnh báo nhưng
> không cấm bạn làm việc B — có những lúc đời thật phải chạy song song.

## Trượt hạn

Đây là phần quan trọng nhất của màn hình này.

- **Hạn đầu tiên** bạn đặt được chốt làm mốc và **không bao giờ bị ghi đè**.
- Mỗi lần dời hạn ghi một dòng lịch sử, **kèm lý do**.
- Nhờ vậy "việc này đã bị dời hạn 4 lần" là một con số, không phải cảm giác.

Phân bố số lần dời hạn xem ở [Bàn làm việc và Hiệu suất](/huong-dan?bai=hieu-suat).

## Ước lượng và giờ đã dùng

Mỗi việc có **ước lượng** (giờ) và **giờ đã dùng**. Hai con số này nuôi cột khối lượng tuần ở trang
Hiệu suất.

> **Mẹo** Nếu không có thói quen ước lượng mọi việc, hãy ước lượng *một phần* — hệ thống hiện dấu
> `≥` ở các tổng để nói rõ con số là sàn dưới, nên dữ liệu thiếu vẫn dùng được mà không gây hiểu lầm.

## Dòng thời gian của một bảng

Ngoài trang chung này, mỗi bảng và mỗi dự án có dạng xem Dòng thời gian của riêng nó — xem
[Bộ lọc và bốn dạng xem](/huong-dan?bai=loc-va-dang-xem).
