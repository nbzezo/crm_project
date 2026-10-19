Nút ghi âm có trong cả **Ghi chú họp** lẫn **Ghi chú nhanh**. Ghi trực tiếp từ micro, nghe lại, rồi
để AI chuyển thành chữ.

## Các bước

1. Bấm nút ghi âm, cho phép trình duyệt dùng micro.
2. Nói. Bấm dừng khi xong.
3. **Nghe lại** để chắc chắn bản ghi dùng được.
4. Bản ghi được lưu như một **tài liệu đính kèm** bình thường.
5. Chọn cách chuyển thành chữ:
   - **Chuyển nguyên văn** — AI gõ lại đúng những gì nghe được
   - **Một mẫu tóm tắt** — theo mẫu quản trị cấu hình ở *Cài đặt → Trợ lý AI*
6. Văn bản chèn ngay vào ghi chú đang mở.

![Thanh công cụ ghi âm sau khi ghi xong: trình nghe lại, nút Lưu ghi âm, ô chọn kiểu xử lý và nút Chuyển văn bản](/guide/img/ghi-am-cong-cu.png)

## Chọn model

Model dùng cho việc này đặt riêng ở *Cài đặt → Ghi âm → văn bản*. AI đọc thẳng tệp âm thanh, không
qua một bước chuyển chữ trung gian.

## Khi báo lỗi

> **Lưu ý** Mọi lỗi phía nhà cung cấp AI đều hiện ra ngoài thành cùng một mã lỗi chung. Để biết
> nguyên nhân thật, mở bảng usage ở trang **Trợ lý AI** và đọc cột mã lỗi của lần gọi vừa rồi.

Những nguyên nhân hay gặp:

| Dấu hiệu | Thường là |
|---|---|
| Lỗi ngay khi bấm chuyển | Chưa cấu hình API key, hoặc model đã chọn không đọc được âm thanh |
| Lỗi với bản ghi dài | Vượt giới hạn kích thước của nhà cung cấp — ghi thành nhiều đoạn ngắn |
| Không bật được micro | Trình duyệt đang chặn quyền micro cho trang này |

## Liên quan

- [Ghi chú họp](/huong-dan?bai=ghi-chu-hop)
- [Ghi chú nhanh](/huong-dan?bai=ghi-chu-nhanh)
- [Trợ lý AI](/huong-dan?bai=tro-ly-ai)
