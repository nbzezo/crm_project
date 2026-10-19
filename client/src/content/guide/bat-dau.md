WorkFlow là hai phần mềm ghép vào một: **quản lý công việc** kiểu bảng Kanban, và **CRM** theo dõi
khách hàng từ lúc là cơ hội đến lúc thu được tiền. Hai phần dùng chung một sổ danh bạ và chung một
hệ thống phân quyền, nên một việc gắn được với một khách hàng mà không phải nhập lại gì.

## Hai trục của hệ thống

Mọi thứ trong hệ thống nằm trên một trong hai trục dưới đây. Biết một màn hình thuộc trục nào là
hiểu được nó dùng để làm gì.

**Trục công việc — ai làm gì, đến khi nào**

| Tầng | Là gì | Trả lời câu hỏi |
|---|---|---|
| **Dự án** | Đơn vị cam kết: có ngày, có ngân sách, có chủ dự án | Chúng ta hứa gì với ai |
| **Bảng – Luồng việc** | Không gian làm việc theo một quy trình, thuộc 0 hoặc 1 dự án | Việc chạy qua những bước nào |
| **Cột** | Một cột của luồng việc, gắn với một trạng thái | Việc đang ở đâu |
| **Công việc** | Đơn vị hành động, giao cho một người | Hôm nay tôi phải làm gì |

**Trục kinh doanh — tiền đi từ đâu đến đâu**

| Tầng | Là gì |
|---|---|
| **Khách hàng** | Hồ sơ một công ty, kèm những người liên hệ bên trong |
| **Cơ hội** | Một lần có thể bán được gì đó, đi qua các giai đoạn của pipeline |
| **Báo giá** | Con số đã gửi cho khách, có phiên bản và hiệu lực |
| **Hợp đồng** | Cam kết đã ký, có ngày hiệu lực và ngày hết hạn |
| **Doanh thu** | Tiền thực tế theo từng tháng, cho từng dịch vụ |

Hai trục gặp nhau ở hai chỗ: một **công việc** gắn được vào một khách hàng hoặc một cơ hội, và một
**cơ hội thành công** sinh ra hợp đồng rồi sinh ra các dòng doanh thu.

> **Lưu ý** Một công việc thuộc dự án của **bảng chứa nó**; trên thẻ không có ô "dự án" riêng. Muốn
> đổi dự án của một việc thì chuyển việc đó sang bảng khác.

## Người phụ trách là một trục riêng

Mỗi công việc giao cho **một người**, và người đó thuộc tổ chức nào cũng được: nhân sự công ty bạn,
nhân sự khách hàng, đối tác hay nhà cung cấp.

Trục này cố ý **không** trùng với nhóm liên kết CRM. Một việc *về* khách hàng A hoàn toàn có thể
*do* nhân sự công ty bạn làm. Chip màu trên thẻ cho biết việc đang ở "bên mình" hay "bên khách".

## Bạn thấy được những gì

Hệ thống có hai lớp chặn độc lập:

1. **Theo tính năng** — bạn vào được những màn hình nào. Không có quyền thì mục đó không hiện trên
   thanh bên.
2. **Theo từng bản ghi** — trong một màn hình, bạn thấy những dòng nào. Mỗi khách hàng, cơ hội,
   bảng và dòng doanh thu có một **người phụ trách**; hồ sơ hiện ra với người đó và với cấp trên của
   họ trong cây đơn vị.

Vì vậy hai người mở cùng một màn hình có thể thấy số dòng khác nhau — đó là thiết kế, không phải
lỗi. Chi tiết ở [Tổ chức, vị trí và phân quyền](/huong-dan?bai=qt-phan-quyen).

> **Mẹo** Việc giao cho bạn thì **luôn** mở được, kể cả khi nó nằm trên bảng của người khác. Phân
> quyền không chặn đường làm việc bình thường.

## Đọc tiếp

- [Đăng nhập và mật khẩu](/huong-dan?bai=dang-nhap) — lần đầu vào hệ thống
- [Đi lại trong ứng dụng](/huong-dan?bai=giao-dien-chung) — thanh bên, tìm kiếm, thông báo
- [Thuật ngữ](/huong-dan?bai=thuat-ngu) — một khái niệm chỉ có một tên
