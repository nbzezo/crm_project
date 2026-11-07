Trang **Công việc** là danh sách mọi việc bạn thấy được, bất kể nó nằm trên bảng nào. Dùng trang này
khi bạn muốn nhìn theo *người* và *hạn*; dùng [bảng – luồng việc](/huong-dan?bai=bang-luong-viec)
khi bạn muốn nhìn theo *quy trình*.

![Trang Công việc ở dạng Danh sách với việc cha và việc con](/guide/img/cong-viec-cay.jpg)

## Chọn phạm vi ở cột bên trái

| Phạm vi | Gồm |
|---|---|
| **Đang mở** | Việc chưa xong mà bạn liên quan |
| **Được giao** | Việc giao cho bạn |
| **Tôi đã tạo** | Việc bạn tạo ra, kể cả giao cho người khác |
| **Đang theo dõi** | Việc bạn bấm theo dõi |
| **Hoàn thành** | Việc đã xong |
| **Hoạt động** | Dòng thay đổi gần đây trên các việc |

Dưới phạm vi là các **dạng xem đã lưu**: lưu lại bộ lọc, cách nhóm và cột đang dùng để mở lại sau.

## Ba dạng xem trong cùng một màn hình

| Dạng | Mạnh ở |
|---|---|
| **Danh sách** | Việc cha – việc con, sắp xếp, chọn cột hiển thị, chọn nhiều việc để đổi hàng loạt |
| **Kanban** | Kéo thả giữa các cột theo cách nhóm đang chọn |
| **Lịch** | Xem việc theo ngày hạn |

Cả ba dùng chung cách **nhóm**: theo hạn, trạng thái, ưu tiên, người phụ trách, luồng việc, khách
hàng, hoặc không nhóm. Ở dạng Danh sách, bấm mũi tên để mở hoặc thu việc con, bấm vào tên để sửa
tại chỗ.

> **Mẹo** Kanban ở đây gom việc từ **mọi** luồng. Muốn xem các bước của **một** quy trình thì mở
> luồng việc đó trên trang Bảng – Luồng việc.

## Vòng đời của một công việc

Thay cho một ô đánh dấu xong/chưa, mỗi việc có một **trạng thái**:

| Trạng thái | Nghĩa là |
|---|---|
| **Chưa bắt đầu** | Chưa ai đụng đến |
| **Đang làm** | Có người đang làm |
| **Chờ khách phản hồi** | Đang chờ bên ngoài, không phải lỗi của ta |
| **Bị chặn** | Không làm tiếp được, **kèm lý do** |
| **Chờ duyệt** | Đã làm xong, đang chờ người duyệt |
| **Hoàn thành** | Xong |

> **Mẹo** Phân biệt "đang chờ ai đó" với "chưa ai đụng đến" mới biết nên nhắc ai. Đó là lý do danh
> sách này dài hơn một ô tích.

Danh sách trạng thái do quản trị cấu hình ở *Cài đặt → Trạng thái công việc*, nhưng mỗi trạng thái
luôn mang một **ý nghĩa** trong bảng trên — đó là thứ báo cáo và nhắc việc đọc.

## Người phụ trách và người duyệt

- **Người phụ trách**: một người, thuộc tổ chức nào cũng được.
- **Người duyệt**: tách khỏi người làm. Khi việc chuyển sang *Chờ duyệt*, người duyệt là người phải
  hành động tiếp.
- Tắt **Đang hoạt động** cho một người (khi họ nghỉ việc) thì họ biến mất khỏi ô giao việc, nhưng
  lịch sử công việc của họ vẫn còn nguyên.

## Việc cha – việc con

Mỗi việc chứa được việc con, **một cấp**. Bảng Kanban ẩn việc con và hiện huy hiệu `x/y` trên thẻ
cha; cửa sổ thẻ có mục *Việc con* riêng.

## Việc lặp lại

Đặt chu kỳ ngày / tuần / tháng / quý. Khi bạn đánh dấu **Hoàn thành**, hệ thống tự sinh bản kế tiếp,
và bản mới **bắt đầu lại từ cột đầu** của quy trình.

## Hạn, trượt hạn và khối lượng

- Hạn **lần đầu tiên** được chốt làm mốc và không bao giờ bị ghi đè.
- Mỗi lần dời hạn ghi một dòng lịch sử **kèm lý do**, nên "việc này đã bị dời hạn 4 lần" trở thành
  một con số đọc được.
- Có **ước lượng** và **giờ đã dùng**, và **mốc quan trọng** để đánh dấu việc không được trượt.

Chi tiết ở [Dòng thời gian và phụ thuộc](/huong-dan?bai=dong-thoi-gian).

## Nhắc lúc

Ngoài hạn hoàn thành, một việc còn đặt được **Nhắc lúc** — một thời điểm cụ thể để hệ thống bật
popup giữa màn hình. Xem [Lịch và nhắc hẹn](/huong-dan?bai=lich-nhac-hen).

## Tạo việc từ mọi nơi

Cùng một biểu mẫu tạo việc mở được từ thanh trên, chi tiết cơ hội, hồ sơ khách hàng, người liên hệ,
hợp đồng, báo giá, tài liệu, cột Kanban và trang này. Tạo từ một cơ hội thì Khách hàng và Người liên
hệ **tự điền** theo chuỗi sở hữu (báo giá/hợp đồng → cơ hội → khách hàng → người liên hệ).

> **Cảnh báo** Liên kết chéo khách hàng bị chặn ngay khi nhập: không gắn được một việc vào cơ hội
> của khách hàng A và người liên hệ của khách hàng B.
