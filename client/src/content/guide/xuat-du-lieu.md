*Cài đặt → Xuất dữ liệu* lấy dữ liệu nghiệp vụ ra khỏi hệ thống dưới dạng **JSON** hoặc **CSV**.

![Cài đặt → Xuất dữ liệu với hai khối JSON và CSV](/guide/img/cai-dat-xuat-du-lieu.jpg)

## Toàn bộ dữ liệu (JSON)

Một tệp JSON chứa **mọi bảng dữ liệu nghiệp vụ**. Dùng khi bạn muốn lưu trữ một bản đầy đủ, hoặc
chuyển sang hệ thống khác.

## Từng loại dữ liệu (CSV)

Mở được bằng Excel. Có sẵn các nút:

| Tệp | Gồm những gì đáng chú ý |
|---|---|
| **Khách hàng** | Hồ sơ công ty |
| **Người liên hệ** | Kèm vai trò trong quyết định mua |
| **Cơ hội** | Kèm cột điểm BANT / 4P, ô ma trận, cờ phủ quyết, và chi tiết chấm điểm từng yếu tố kèm bằng chứng |
| **Hợp đồng** | Giá trị, hiệu lực, trạng thái |
| **Công việc** | Kèm người phụ trách, dự án, **hạn ban đầu**, **số lần dời hạn**, giờ ước lượng |
| **Doanh thu theo tháng** | Bảng 12 tháng |

Riêng trang [Doanh thu](/huong-dan?bai=doanh-thu) còn có nút **Xuất CSV** của chính bộ lọc đang xem
— tiện hơn khi bạn chỉ cần một phần.

> **Lưu ý** Tệp xuất ra chứa dữ liệu khách hàng thật. Hãy cất nó như cất một bản sao lưu: không gửi
> qua kênh công khai, không để trên máy dùng chung.

## Quyền

Cần quyền **xuất dữ liệu**. Người không có quyền này sẽ không thấy mục Xuất dữ liệu trong Cài đặt.

## Khác gì sao lưu

| | Xuất dữ liệu | [Sao lưu](/huong-dan?bai=qt-sao-luu) |
|---|---|---|
| Ra cái gì | JSON / CSV để đọc và xử lý | Bản sao cơ sở dữ liệu để **khôi phục lại hệ thống** |
| Gồm tệp đính kèm | Không | Có, nếu sao lưu lên Google Drive |
| Dùng khi | Phân tích, chuyển hệ thống | Mất máy chủ, hỏng dữ liệu |
