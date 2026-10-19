Phân quyền có **hai lớp**, và hiểu được chúng là hiểu được gần hết phần quản trị:

1. **Theo tính năng** — vào được màn hình nào, làm được thao tác gì.
2. **Theo từng bản ghi** — trong màn hình đó, thấy những dòng nào.

## Cây đơn vị

![Cài đặt → Sơ đồ tổ chức](/guide/img/cai-dat-so-do-to-chuc.jpg)

*Cài đặt → Sơ đồ tổ chức* dựng cây đơn vị: `Công ty → Trung tâm → Khối → Phòng → Tổ → …`, **sâu bao
nhiêu cấp cũng được**.

> **Lưu ý** *Loại đơn vị* chỉ là nhãn hiển thị và cũng tự thêm được. Nó **không** quyết định quyền.

## Vị trí và ma trận quyền

![Cài đặt → Vị trí & phân quyền với ma trận nhóm chức năng × thao tác](/guide/img/cai-dat-vi-tri-quyen.jpg)

*Cài đặt → Vị trí & phân quyền*: mỗi **vị trí** là một bộ quyền; người giữ vị trí nhận đúng bộ quyền
đó. Thêm, **nhân bản rồi sửa**, hoặc xóa vị trí. Bảy vị trí cài sẵn chỉ là mẫu.

Ma trận là **nhóm chức năng × thao tác → phạm vi**. Mỗi ô chọn một trong năm mức:

| Phạm vi | Thấy / làm được với |
|---|---|
| **Không** | Không gì cả |
| **Của mình** | Bản ghi mình phụ trách |
| **Đơn vị** | Bản ghi của đơn vị mình |
| **Cả cây đơn vị** | Đơn vị mình và **mọi đơn vị cấp dưới** |
| **Toàn công ty** | Tất cả |

**"Cả cây đơn vị" chính là thứ tạo nên phân cấp.** Một Trưởng phòng và một Giám đốc Khối dùng chung
luật đó, chỉ khác điểm xuất phát trong cây.

> **Mẹo** CEO, Giám đốc Trung tâm, Giám đốc Khối, Trưởng phòng **không phải bốn loại vị trí khác
> nhau** — chúng là cùng một loại "quản lý đơn vị", đặt ở độ sâu khác nhau. Thêm một cấp thứ năm chỉ
> là thêm một nhánh trong cây.

## Gán nhiều vị trí

Một người giữ nhiều vị trí thì phạm vi lấy **mức rộng hơn** — thêm một vị trí không bao giờ làm ai
mất quyền.

Ô **kiêm nhiệm** cho phép phụ trách thêm một đơn vị khác mà vẫn giữ đơn vị gốc. Đây cũng là cách ủy
quyền khi sếp nghỉ.

## Hiệu lực ngay

Đổi một ô là **request kế tiếp** của người đó đã theo quyền mới — không cần đăng xuất, không chờ hết
phiên. Hệ thống cố ý không lưu đệm quyền.

## Hai rào chắn

- Không thể bỏ quyền của **người quản trị cuối cùng**.
- Không xóa được vị trí đang có người giữ, hay đơn vị còn người.

## Phân quyền dữ liệu

Mỗi **khách hàng, cơ hội, bảng công việc và dòng doanh thu** có một **người phụ trách**. Hồ sơ hiện
ra với người đó và với **cấp trên của họ trong cây đơn vị**; người ở đơn vị khác không thấy.

Đổi ô *Người phụ trách* trên biểu mẫu chính là **bàn giao**.

### Ba luật không hiển nhiên

1. **Việc giao cho bạn thì luôn mở được**, kể cả khi nó nằm trên bảng của người khác. Phân quyền
   không được phép chặn đường làm việc bình thường.
2. **Ghi chú là dữ liệu cá nhân** — cấp trên không đọc được Ghi chú nhanh / Ghi chú họp của nhân
   viên. Đổi lại được trên giao diện nếu tổ chức thực sự muốn vậy.
3. **Bản ghi ngoài phạm vi trả về "không tìm thấy"**, không phải "không có quyền". Phân biệt hai
   thứ đó sẽ biến việc dò id thành cách xem ai đang có dữ liệu gì.

> **Lưu ý** Trợ lý AI cũng chỉ đọc trong phạm vi của người đang hỏi. Không có lớp này thì một câu
> hỏi bình thường là moi được dữ liệu phòng khác, mà không màn hình nào làm lộ ra.

## Liên quan

- [Người dùng và thư mời](/huong-dan?bai=qt-nguoi-dung)
- [Hệ thống gồm những gì](/huong-dan?bai=bat-dau)
