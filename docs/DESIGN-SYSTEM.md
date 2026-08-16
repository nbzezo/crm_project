# WorkFlow UI system

Tài liệu này là nguồn tham chiếu ngắn cho các mẫu UI dùng chung. Mục tiêu là giữ trải nghiệm nhất quán, dễ truy cập và tránh sao chép markup giữa các màn hình.

## Thành phần nền tảng

- `PageShell` và `PageHeader`: khống chế chiều rộng, khoảng cách trang, tiêu đề và nhóm hành động. Trang mới không tự lặp lại `max-width` hoặc padding ngoài những ngoại lệ có chủ đích.
- `Tabs`: dùng cho điều hướng trong cùng một màn hình. Thành phần đã hỗ trợ ARIA, roving focus và các phím mũi tên, Home, End.
- `IconButton`: dùng cho thao tác chỉ có biểu tượng. Luôn truyền `label`; kích thước chạm tối thiểu 44 px trên màn hình cảm ứng và thu gọn trên desktop.
- `FormModalActions`: cặp Hủy/Lưu chuẩn cho modal biểu mẫu, bao gồm trạng thái đang lưu và chống gửi lặp.
- `TableHead`: kiểu tiêu đề bảng thống nhất. Mỗi ô tiêu đề vẫn phải có `scope="col"`.
- `RevenueFunnelCards`, `RevenueLineActions`, `CustomerDealFields`: mẫu CRM dùng chung cho KPI doanh thu, thao tác dòng và liên kết khách hàng/cơ hội.

## Token và bảng màu

- Token giao diện và biến sáng/tối nằm trong `client/src/index.css`.
- Bảng màu nghiệp vụ dùng lại nằm trong `client/src/theme/palettes.ts`.
- Không dùng màu tùy ý qua `bg-[#…]`, `text-[#…]`, `border-[#…]` trong component.
- Dùng `rounded-compact` thay cho giá trị bo góc 3 px viết trực tiếp.
- Màu trạng thái phải mang tên theo ý nghĩa nghiệp vụ, không theo tên màu thị giác.

## Quy tắc tương tác

- Hành động chính dùng `Button variant="primary"`; xóa dùng tone nguy hiểm và luôn có nhãn truy cập.
- Khi đổi khách hàng trong một liên kết CRM, phải xóa lựa chọn cơ hội/hợp đồng không còn thuộc khách hàng mới.
- Tab, menu và modal phải dùng được hoàn toàn bằng bàn phím; trạng thái focus không được ẩn.
- Không chỉ dùng màu để truyền đạt trạng thái: kèm nhãn văn bản hoặc biểu tượng có mô tả.

## Kiểm tra tự động

Chạy `npm run check:ui` để chặn bo góc, màu tùy ý và bảng màu nhãn bị khai báo lặp. Lệnh này cũng nằm trong `npm run check`.
