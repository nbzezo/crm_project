# BRD – NÂNG CẤP TÍNH NĂNG LỊCH CÁ NHÂN

**Tên chức năng:** Lịch cá nhân  
**Tên tiếng Anh:** Personal Calendar  
**Phiên bản yêu cầu:** 2.0  
**Ngày:** 11/08/2026  
**Phạm vi:** Chỉ chức năng Calendar  
**Đối tượng sử dụng:** 01 người dùng duy nhất  
**Mức ưu tiên:** Cao  
**Giao diện hiện tại:** Dark Mode  

---

## 1. Bối cảnh

Ứng dụng hiện có màn hình Lịch dạng tháng.

Lịch hiện đang hiển thị nhiều loại thông tin như:

- Công việc.
- Nhắc hẹn.
- Hành động tiếp theo.
- Cơ hội dự kiến chốt.
- Hợp đồng đến hạn.
- Các sự kiện/công việc khác.

Giao diện hiện tại đã có:

- Chuyển tháng trước/sau.
- Nút `Hôm nay`.
- Chế độ `Tháng / Tuần / Ngày`.
- Màu phân loại sự kiện.
- Hiển thị nhiều sự kiện trong từng ngày.

Tuy nhiên trải nghiệm hiện tại còn thiên về **xem lịch** hơn là **quản lý lịch cá nhân hằng ngày**.

Mục tiêu của lần nâng cấp này là biến Calendar thành một công cụ quản lý thời gian cá nhân nhanh, trực quan và dễ thao tác.

---

## 2. Nguyên tắc phạm vi

Đây là ứng dụng **single-user**.

Vì vậy tuyệt đối **không phát triển** các chức năng:

- Lịch nhóm.
- Chia sẻ lịch.
- Xem lịch người khác.
- Phân quyền lịch.
- Manager/User.
- Phân quyền chỉnh sửa.
- Người phụ trách.
- Thành viên team.
- Multi-user calendar.
- Workload theo nhân viên.
- Lịch phòng ban.
- Phân công công việc cho người khác.

Mọi event mặc định thuộc về người đang sử dụng ứng dụng.

Không cần các trường:

```text
owner_id
assignee_id
team_id
department_id
created_by
```

trừ trường hợp database hiện tại bắt buộc phải có vì lý do kỹ thuật.

---

## 3. Mục tiêu nghiệp vụ

Calendar mới phải giúp người dùng trả lời nhanh các câu hỏi:

- Hôm nay tôi có việc gì?
- Lịch tiếp theo của tôi là gì?
- Tôi có lịch nào quá hạn?
- Tuần này tôi còn những việc gì?
- Tôi có bị trùng lịch không?
- Tôi muốn chuyển một lịch sang ngày khác như thế nào?
- Tôi muốn tạo lịch lặp lại hằng tuần như thế nào?
- Tôi muốn được nhắc trước cuộc hẹn như thế nào?

Người dùng phải có thể quản lý phần lớn lịch của mình ngay trên màn hình Calendar mà không phải chuyển sang page khác.

---

## 4. Phạm vi chức năng

Calendar cần hỗ trợ:

- Xem lịch.
- Tạo lịch.
- Sửa lịch.
- Xóa lịch.
- Hoàn thành công việc.
- Kéo thả lịch.
- Thay đổi thời lượng.
- Lịch cả ngày.
- Lịch nhiều ngày.
- Lịch lặp lại.
- Nhắc lịch.
- Tìm kiếm.
- Lọc.
- Kiểm tra trùng lịch.
- Điều hướng ngày/tháng/năm.
- Xem lịch quá hạn.
- Xem lịch sắp tới.

Không mở rộng sang nghiệp vụ CRM khác trong BRD này.

Nếu một sự kiện hiện đang liên kết với dữ liệu CRM thì chỉ giữ thông tin liên kết hiện có.

---

## 5. Định hướng UI mới

Màn hình Desktop đề xuất:

```text
┌─────────────────────────────────────────────────────────────┐
│ LỊCH CÁ NHÂN                              [+ Tạo lịch]      │
├─────────────────────────────────────────────────────────────┤
│ <   >   Hôm nay         THÁNG 8 2026                       │
│                                                             │
│ [Tháng] [Tuần] [Ngày] [Danh sách]                          │
│                                                             │
│ [Loại ▼] [Trạng thái ▼]              🔍 Tìm lịch...        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                         CALENDAR                            │
│                                                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

Nguyên tắc:

- Gọn.
- Dễ đọc.
- Ít nút.
- Thao tác nhanh.
- Calendar là nội dung chính.

---

## 6. Calendar full-height

Đây là vấn đề UI rõ nhất trên màn hình hiện tại.

Calendar đang chỉ sử dụng một phần màn hình và để khoảng trống rất lớn phía dưới.

Yêu cầu:

```text
Calendar Height
=
Viewport Height
-
Header
-
Toolbar
-
Padding
```

Calendar phải tự động fill phần chiều cao còn lại.

Không hard-code chiều cao theo pixel nếu không cần thiết.

Phải responsive theo kích thước màn hình.

---

## 7. Các chế độ xem

Hỗ trợ 4 chế độ:

- **Tháng:** nhìn tổng quan.
- **Tuần:** quản lý lịch theo giờ.
- **Ngày:** quản lý chi tiết trong ngày.
- **Danh sách:** xem các việc sắp tới theo thứ tự thời gian.

Thanh view:

```text
[Tháng] [Tuần] [Ngày] [Danh sách]
```

Hệ thống nên ghi nhớ view người dùng sử dụng gần nhất.

---

## 8. Month View

Giữ cấu trúc hiện tại nhưng cải tiến.

Mỗi cell ngày cần:

```text
Ngày

Event 1
Event 2
Event 3

+3 lịch khác
```

Ví dụ:

```text
11

📞 09:00 Gọi khách hàng
📅 10:30 Họp
✓ 14:00 Review tài liệu

+2 lịch khác
```

Không để event tràn khỏi cell.

Nếu một ngày có quá nhiều event, không cố hiển thị tất cả.

Click `+N lịch khác` để mở popover hiển thị toàn bộ lịch trong ngày.

---

## 9. Highlight ngày hôm nay

Ngày hiện tại phải nhận biết ngay lập tức.

Đề xuất:

```text
      11
    HÔM NAY
```

Hoặc số ngày nằm trong circle.

Không cần tô toàn bộ cell quá đậm.

---

## 10. Ngày thuộc tháng trước/sau

Trong Month View vẫn hiển thị ngày của tháng trước và tháng sau.

Yêu cầu:

- Giảm opacity.
- Vẫn đảm bảo đọc được.
- Event nếu có vẫn phải hiển thị.

---

## 11. Week View

Week View phải là time-grid.

Ví dụ:

```text
          T2       T3       T4       T5       T6

08:00

09:00     █████
          Họp

10:00

11:00              ███████
                   Review

12:00
```

Event phải thể hiện đúng:

```text
start_datetime
end_datetime
```

---

## 12. Time Range và Time Interval

Mặc định Week/Day View hiển thị:

```text
06:00 → 23:00
```

Cho phép scroll.

Mặc định time interval:

```text
30 phút
```

Kiến trúc nên cho phép mở rộng:

```text
15 phút
30 phút
60 phút
```

---

## 13. Current Time Indicator

Trong Week/Day View cần có đường chỉ thời gian hiện tại.

Ví dụ:

```text
14:35 ─────────────────────
```

Chỉ hiển thị trên ngày hiện tại.

---

## 14. Day View

Hiển thị chi tiết lịch của một ngày.

Ví dụ:

```text
Thứ Ba, 11 tháng 8

CẢ NGÀY
─────────────────────
Nộp báo cáo
─────────────────────

08:00

09:00
████████████████
Họp

10:00
```

---

## 15. List View

Bổ sung chế độ `Danh sách`.

Ưu tiên dạng timeline:

```text
HÔM NAY · 11/08

09:00
📞 Gọi điện

10:30
📅 Họp dự án

14:00
✓ Review tài liệu


NGÀY MAI · 12/08

08:30
🔔 Nhắc việc
```

Thiết kế phải phù hợp desktop và mobile.

---

## 16. Nút tạo lịch

CTA chính:

```text
+ Tạo lịch
```

luôn hiển thị ở góc phải phần header Calendar.

---

## 17. Ba cách tạo lịch

### Cách 1
Click `+ Tạo lịch`.

### Cách 2
Click trực tiếp vào ngày trong Month View.

Ví dụ click ngày 15/08 → form mặc định ngày 15/08/2026.

### Cách 3
Kéo một khoảng thời gian trong Week/Day View.

Ví dụ kéo từ 14:00 đến 15:30 → form tự điền:

```text
Start = 14:00
End = 15:30
```

---

## 18. Quick Create

Click khoảng trống có thể mở quick form:

```text
TẠO LỊCH

Tiêu đề
____________________

14:00 – 15:00

[Lưu]

Thêm chi tiết
```

Nếu click `Thêm chi tiết` thì mở form đầy đủ.

---

## 19. Form tạo/sửa lịch

Các trường:

```text
Tiêu đề *

Loại lịch

Ngày bắt đầu *

Giờ bắt đầu

Ngày kết thúc

Giờ kết thúc

☐ Cả ngày

Mô tả

Địa điểm

Nhắc lịch

Lặp lại

Trạng thái
```

Không có:

```text
Người phụ trách
Phòng ban
Team
Assignee
Participants trong hệ thống
```

---

## 20. Side Drawer

Khi click event, không chuyển sang page khác.

Mở Side Drawer bên phải.

Ví dụ:

```text
┌────────────────────────────┐
│ HỌP KẾ HOẠCH               │
│                         ×  │
│ 📅 Cuộc họp                │
│                            │
│ 14:00 – 15:30              │
│ 11/08/2026                 │
│                            │
│ Phòng họp 2                │
│                            │
│ Nhắc trước                 │
│ 30 phút                    │
│                            │
│ Nội dung                   │
│ Review kế hoạch triển khai │
│                            │
│ [✓ Hoàn thành]             │
│                            │
│ [Sửa]              [⋮]    │
└────────────────────────────┘
```

---

## 21. Loại lịch

Các loại mặc định:

```text
Công việc
Cuộc họp
Cuộc gọi
Nhắc việc
Lịch hẹn
Deadline
Khác
```

Không hard-code logic nghiệp vụ vào loại lịch.

Mỗi loại gồm:

```text
id
name
icon
color
```

---

## 22. Icon + màu + text

Không dùng màu sắc làm cách duy nhất để phân biệt event.

Ví dụ:

```text
✓ Công việc
📅 Cuộc họp
📞 Cuộc gọi
🔔 Nhắc việc
⏰ Deadline
```

Month View:

```text
📞 09:00 · Gọi điện
```

---

## 23. Màu sắc và Dark Mode

Giữ Dark Mode hiện tại.

Yêu cầu:

- Tăng contrast chữ.
- Hạn chế màu quá chói.
- Các màu loại lịch phải phân biệt rõ.
- Text luôn đọc được.

Không hard-code color trực tiếp trong component.

Sử dụng theme/token:

```text
calendar.task
calendar.meeting
calendar.call
calendar.reminder
calendar.deadline
```

---

## 24. Drag & Drop – Month View

Cho phép kéo event từ ngày này sang ngày khác.

Ví dụ:

```text
11/08
   ↓
13/08
```

Khi drop:

- Cập nhật ngày bắt đầu/kết thúc tương ứng.
- Giữ nguyên giờ.

---

## 25. Drag & Drop – Week/Day View

Cho phép kéo event sang giờ khác.

Ví dụ ban đầu:

```text
09:00 – 10:30
```

Kéo sang 14:00:

```text
14:00 – 15:30
```

Giữ nguyên duration.

---

## 26. Resize Event

Week/Day View cho phép kéo cạnh dưới event để thay đổi thời lượng.

Ví dụ:

```text
14:00 – 15:00
```

kéo xuống:

```text
14:00 – 16:00
```

→ cập nhật `end_datetime`.

---

## 27. Undo

Sau Drag/Resize/Delete nên hiển thị:

```text
✓ Đã cập nhật lịch

[Hoàn tác]
```

Undo giúp giảm rủi ro thao tác nhầm.

---

## 28. Lịch cả ngày

Checkbox:

```text
☐ Cả ngày
```

Khi chọn:

- Ẩn hoặc disable giờ.
- Event xuất hiện ở All-day area.

---

## 29. Event nhiều ngày

Calendar phải hỗ trợ event kéo dài nhiều ngày.

Ví dụ:

```text
15/08 08:00
→
17/08 17:00
```

Month View phải hiển thị event kéo dài xuyên các ngày.

---

## 30. Nhắc lịch

Cho phép:

```text
Không nhắc
5 phút trước
10 phút trước
15 phút trước
30 phút trước
1 giờ trước
2 giờ trước
1 ngày trước
Tùy chỉnh
```

Phase 1 chỉ cần hỗ trợ một reminder/event.

Kiến trúc dữ liệu nên cho phép mở rộng nhiều reminder sau này.

---

## 31. Notification nhắc lịch

Nếu ứng dụng hiện đã có notification system thì tái sử dụng.

Không xây notification engine mới nếu không cần thiết.

Ví dụ:

```text
Sắp đến lịch

Họp kế hoạch

14:00 – còn 30 phút
```

---

## 32. Lịch lặp lại

Hỗ trợ:

```text
Không lặp
Hàng ngày
Hàng tuần
Hàng tháng
Hàng năm
Tùy chỉnh
```

Custom recurrence:

```text
Lặp lại mỗi [2] tuần

☑ Thứ 2
☐ Thứ 3
☑ Thứ 4
☐ Thứ 5
☑ Thứ 6

Kết thúc:
○ Không bao giờ
○ Vào ngày
○ Sau X lần
```

---

## 33. Chỉnh sửa event lặp

Khi sửa hoặc xóa recurring event:

```text
Bạn muốn áp dụng cho:

○ Chỉ lịch này
○ Lịch này và các lịch sau
○ Toàn bộ chuỗi
```

---

## 34. Trạng thái

Đơn giản hóa thành:

```text
Chưa hoàn thành
Hoàn thành
Đã hủy
```

`Quá hạn` không cần lưu thành status độc lập.

Quá hạn là trạng thái tính toán.

---

## 35. Logic quá hạn

Event được coi là quá hạn nếu:

```text
end_datetime < current_datetime
AND status != completed
AND status != cancelled
```

Với All-day event:

```text
event_date < today
```

---

## 36. Hiển thị quá hạn

Ví dụ:

```text
⚠ 09:00 · Nộp báo cáo

QUÁ HẠN
```

Không chỉ sử dụng màu đỏ.

---

## 37. Hoàn thành nhanh

Đối với event dạng Công việc:

Hover có checkbox:

```text
☐ Review báo cáo
```

Click:

```text
☑ Review báo cáo
```

→ cập nhật Completed ngay mà không cần mở form.

---

## 38. Event đã hoàn thành

Event completed:

- Giảm opacity.
- Có dấu ✓.
- Có thể gạch nhẹ title.
- Không xóa khỏi Calendar.

---

## 39. Xóa Event

Menu `⋮` gồm:

```text
Sửa
Nhân bản
Xóa
```

Khi Delete:

```text
Bạn có chắc muốn xóa lịch này?

[Hủy] [Xóa]
```

Sau đó cung cấp Undo nếu kiến trúc cho phép.

---

## 40. Nhân bản Event

Cho phép Duplicate.

Duplicate event phải mở form mới với dữ liệu copy.

Không copy:

```text
id
created_at
updated_at
```

---

## 41. Tìm kiếm

Có ô:

```text
🔍 Tìm lịch...
```

Search tối thiểu theo:

```text
title
description
location
```

Yêu cầu:

- Không reload toàn page.
- Có debounce search.

---

## 42. Bộ lọc

Vì chỉ có một user nên chỉ cần:

```text
[Loại ▼]
[Trạng thái ▼]
```

Không có:

```text
Người phụ trách
Team
Phòng ban
Owner
```

Filter loại hỗ trợ multi-select.

Filter trạng thái:

```text
Tất cả
Chưa hoàn thành
Hoàn thành
Quá hạn
Đã hủy
```

---

## 43. Legend có thể click

Legend hiện tại không nên chỉ để giải thích.

Ví dụ:

```text
● Công việc
● Nhắc việc
● Deadline
```

Click một loại để bật/tắt event tương ứng.

Đồng bộ với filter Loại.

---

## 44. Tooltip

Hover event hiển thị:

```text
Họp kế hoạch

11/08/2026

14:00 – 15:30

📅 Cuộc họp

Nhắc trước 30 phút
```

Không đưa quá nhiều dữ liệu vào Tooltip.

---

## 45. Kiểm tra trùng lịch

Khi tạo hoặc đổi lịch nếu overlap với event khác:

```text
⚠ Thời gian này đang có lịch:

14:00 – 15:00
Họp kế hoạch
```

Cho phép:

```text
[Vẫn lưu]
[Chọn giờ khác]
```

Đây chỉ là cảnh báo, không block người dùng.

---

## 46. Nút Hôm nay

`Hôm nay` phải hoạt động theo view hiện tại:

```text
Month → tháng hiện tại
Week → tuần hiện tại
Day → ngày hiện tại
List → scroll về hôm nay
```

---

## 47. Month/Year Picker

Tiêu đề:

```text
Tháng 8 năm 2026
```

phải click được.

Khi click mở:

```text
2026

Tháng 1   Tháng 2   Tháng 3
Tháng 4   Tháng 5   Tháng 6
Tháng 7  [Tháng 8] Tháng 9
Tháng 10  Tháng 11  Tháng 12
```

Cho phép đổi năm.

Không bắt người dùng click `< >` nhiều lần.

---

## 48. Mini Calendar

Không bắt buộc ở Month View.

Có thể dùng trong Week/Day View.

Đưa vào P1 nếu UI hiện tại không phù hợp.

---

## 49. Empty State

Nếu ngày không có lịch:

```text
Không có lịch trong ngày này.

+ Tạo lịch
```

---

## 50. Loading

Không flash màn hình trắng.

Sử dụng Calendar Skeleton theo layout hiện tại.

---

## 51. Error Handling

Nếu Save thất bại:

```text
Không thể lưu lịch.

Vui lòng thử lại.
```

Form không được tự đóng.

Dữ liệu người dùng đã nhập phải được giữ lại.

---

## 52. Toast

Các thao tác thành công:

```text
✓ Đã tạo lịch
✓ Đã cập nhật lịch
✓ Đã chuyển lịch
✓ Đã hoàn thành
✓ Đã xóa lịch
```

Toast ngắn, không làm gián đoạn thao tác.

---

## 53. Keyboard Shortcut – P1

Có thể hỗ trợ:

```text
C = Tạo lịch
T = Hôm nay
M = Tháng
W = Tuần
D = Ngày
L = Danh sách
Esc = Đóng modal/drawer
```

Không trigger shortcut khi người dùng đang nhập text.

---

## 54. Responsive

### Desktop
Hỗ trợ đầy đủ:

```text
Month
Week
Day
List
```

### Tablet
Giảm padding và toolbar.

### Mobile
Ưu tiên:

```text
Ngày
Danh sách
```

Không cố giữ toàn bộ desktop Month Grid trên màn hình nhỏ.

---

## 55. Data Model đề xuất

Claude phải kiểm tra schema hiện tại trước khi sửa.

Model mục tiêu tối thiểu:

```text
CalendarEvent

id
title
description
event_type
start_datetime
end_datetime
all_day
location
status
reminder_minutes
recurrence_rule
recurrence_parent_id
created_at
updated_at
```

Không cần:

```text
owner_id
assignee_id
team_id
department_id
participants_user_ids
permission
```

Nếu các trường trên đã tồn tại trong hệ thống cũ, không cần xóa nếu gây ảnh hưởng lớn.

Chỉ không phát triển nghiệp vụ dựa trên chúng.

---

## 56. Event Type Model

Nếu hệ thống cho phép cấu hình:

```text
CalendarEventType

id
name
icon
color
sort_order
active
```

Nếu hiện tại loại event đang hard-code và việc refactor lớn, Claude phải báo cáo trước khi thay đổi.

---

## 57. API

Claude phải kiểm tra API hiện tại.

Không tạo endpoint mới nếu API cũ đã đáp ứng.

Mô hình tối thiểu:

```text
GET /calendar/events
POST /calendar/events
GET /calendar/events/:id
PUT /calendar/events/:id
DELETE /calendar/events/:id
```

Query tối thiểu:

```text
start
end
type
status
keyword
```

Không cần:

```text
owner
assignee
team
user_id
department
```

---

## 58. Fetch data theo range

Không load toàn bộ event trong database.

Month View:

```text
visibleStart
→
visibleEnd
```

Week View:

```text
weekStart
→
weekEnd
```

Day View:

```text
dayStart
→
dayEnd
```

List View dùng pagination hoặc load theo range.

---

## 59. Optimistic Update

Với:

```text
Drag
Resize
Complete
```

nếu kiến trúc cho phép, ưu tiên Optimistic UI.

Flow:

1. UI cập nhật ngay.
2. Gọi API.
3. API thành công → giữ nguyên.
4. API lỗi → rollback vị trí cũ + báo lỗi.

---

## 60. P0 – Phải làm

1. Calendar full-height.
2. Cải thiện Month View.
3. Week View.
4. Day View.
5. List View.
6. Highlight Today.
7. Quick Create.
8. Form tạo/sửa.
9. Side Drawer.
10. Drag & Drop.
11. Resize.
12. All-day.
13. Multi-day event.
14. Loại lịch + icon.
15. Trạng thái.
16. Quá hạn.
17. Complete nhanh.
18. Search.
19. Filter.
20. Tooltip.
21. Reminder cơ bản.
22. Conflict warning.
23. Month/Year Picker.
24. Loading/Error/Toast.
25. Responsive.

---

## 61. P1 – Giai đoạn sau

- Recurring Event.
- Custom recurrence.
- Chỉnh một/toàn chuỗi.
- Multiple reminders.
- Mini Calendar.
- Duplicate Event.
- Undo nâng cao.
- Keyboard Shortcut.
- Ghi nhớ filter/view gần nhất.

---

## 62. Không làm trong đợt này

Không triển khai:

```text
Lịch nhóm
Team Calendar
Manager Calendar
Share Calendar
Permission Calendar
Workload
Assign Task
AI Schedule Assistant
Google Calendar Sync
Microsoft Outlook Sync
Meeting Room Booking
Resource Booking
Video Meeting
Chat
CRM workflow
```

---

## 63. Acceptance Criteria

### AC01 – Full Height
Calendar sử dụng phần chiều cao còn lại của viewport và không còn khoảng trống lớn phía dưới.

### AC02 – Month
Người dùng xem được event toàn tháng.

### AC03 – Week
Người dùng xem được event đúng vị trí theo giờ và duration.

### AC04 – Day
Người dùng xem chi tiết một ngày.

### AC05 – List
Người dùng xem event sắp tới dạng danh sách/timeline.

### AC06 – Create
Có thể tạo event mà không rời khỏi Calendar.

### AC07 – Quick Create
Click ngày hoặc time slot có thể tạo lịch nhanh.

### AC08 – Edit
Click event có thể xem và chỉnh sửa.

### AC09 – Drag Date
Có thể kéo event sang ngày khác.

### AC10 – Drag Time
Có thể kéo event sang thời gian khác.

### AC11 – Resize
Có thể chỉnh duration bằng resize.

### AC12 – All Day
Tạo và hiển thị đúng All-day event.

### AC13 – Multi-day
Hiển thị đúng event kéo dài nhiều ngày.

### AC14 – Reminder
Lưu và kích hoạt reminder theo logic hệ thống hiện tại.

### AC15 – Today
Ngày hôm nay nhận biết rõ ràng.

### AC16 – Overdue
Event quá hạn chưa hoàn thành được nhận biết rõ.

### AC17 – Complete
Có thể hoàn thành task nhanh.

### AC18 – Search
Search title/description/location hoạt động.

### AC19 – Filter
Có thể lọc loại/trạng thái.

### AC20 – Conflict
Cảnh báo khi lịch bị overlap.

### AC21 – Dark Mode
Không phá Dark Mode hiện tại.

### AC22 – Responsive
Không vỡ UI trên desktop/tablet/mobile.

### AC23 – Performance
Đổi tháng/tuần/ngày không reload toàn page.

---

## 64. Yêu cầu Claude khảo sát source trước khi code

**Claude không được bắt đầu rewrite ngay.**

Đầu tiên phải đọc toàn bộ source liên quan đến:

```text
Calendar
Event
Task
Reminder
Notification
Theme
API
Database
```

Sau đó báo cáo hiện trạng.

---

## 65. Báo cáo hiện trạng Claude phải trả về

Trước khi implementation, Claude phải trả lại:

1. Framework frontend hiện tại.
2. Calendar library hiện tại.
3. Các component Calendar hiện có.
4. Event model/schema hiện tại.
5. API Calendar/Event hiện tại.
6. Reminder/notification hiện tại.
7. Các chức năng BRD đã có.
8. Các chức năng chưa có.
9. Các vấn đề UI hiện tại.
10. Các vấn đề code/technical debt.
11. Rủi ro khi triển khai.
12. Đề xuất cách tận dụng code hiện có.

---

## 66. Gap Analysis

Claude lập bảng:

| Requirement | Hiện tại | Gap | Đề xuất |
|---|---|---|---|
| Month View | Có | Cần cải thiện | Refactor |
| Week View | Kiểm tra | ... | ... |
| Day View | Kiểm tra | ... | ... |
| List View | Kiểm tra | ... | ... |
| Drag & Drop | Kiểm tra | ... | ... |
| Resize | Kiểm tra | ... | ... |
| Reminder | Kiểm tra | ... | ... |
| Recurrence | Kiểm tra | ... | ... |

Không giả định chức năng chưa có nếu chưa kiểm tra source.

---

## 67. Implementation Plan

### Phase 1 – Foundation
- Layout.
- Calendar height.
- Data normalization.
- Month/Week/Day/List.

### Phase 2 – Core Interaction
- Create.
- Edit.
- Drawer.
- Drag.
- Resize.
- Complete.
- Delete.

### Phase 3 – Productivity
- Search.
- Filter.
- Reminder.
- Conflict.
- Month picker.
- UX polish.

### Phase 4 – Recurrence
Chỉ thực hiện sau khi core calendar hoạt động ổn định.

---

## 68. Yêu cầu Claude liệt kê file trước khi sửa

Trước khi code, cung cấp:

```text
Files sẽ sửa
Files sẽ tạo mới
Database migration nếu có
API thay đổi nếu có
Component tái sử dụng
Component cần refactor
```

Không tạo hàng loạt component mới nếu component hiện tại có thể mở rộng.

---

## 69. Nguyên tắc code

Claude phải tuân thủ:

- Không rewrite toàn bộ Calendar nếu không cần.
- Ưu tiên tái sử dụng calendar library hiện tại.
- Nếu calendar library hiện tại đáp ứng Drag/Resize/Recurring thì tận dụng API chuẩn của library.
- Không thêm thư viện Calendar mới trước khi đánh giá library hiện tại.
- Không hard-code dữ liệu demo vào production code.
- Không hard-code ngày hiện tại.
- Không hard-code user.
- Không xây permission/multi-user.
- Không xây team/member.
- Không mở rộng sang CRM workflow.
- Không phá API hiện tại nếu không cần.
- Không thay đổi DB lớn chỉ để phục vụ UI.
- Database migration phải backward-compatible.
- Giữ nguyên Dark Mode.
- Tuân thủ design system hiện tại.
- Tất cả action phải có loading/error state hợp lý.
- Sau mỗi phase phải build/test.

---

## 70. Test Case bắt buộc

Claude phải kiểm tra ít nhất:

- Event 30 phút.
- Event nhiều giờ.
- Event cả ngày.
- Event qua ngày.
- Event nhiều ngày.
- Hai event cùng giờ.
- Nhiều event trong một ngày.
- Event quá hạn.
- Event hoàn thành.
- Drag sang ngày khác.
- Drag sang tháng khác.
- Resize dài hơn.
- Resize ngắn hơn.
- Tạo lịch cuối tháng.
- Tạo lịch đầu năm/cuối năm.
- Reminder.
- Recurring Event.
- Dark Mode.
- Màn hình nhỏ.
- API lỗi khi save.
- API lỗi khi drag.
- Double click nhanh.
- Timezone.

---

## 71. Timezone

Calendar phải sử dụng timezone nhất quán.

Không tự ý convert datetime giữa:

```text
UTC
Local Time
Browser Time
```

Claude phải kiểm tra cách ứng dụng hiện tại đang xử lý timezone trước.

Đặc biệt kiểm tra:

```text
00:00
23:59
All-day event
Event qua ngày
```

---

## 72. Definition of Done

Một phase chỉ được coi là hoàn thành nếu:

- Build thành công.
- Không có console error mới.
- Không phá chức năng Calendar cũ.
- Create hoạt động.
- Edit hoạt động.
- Delete hoạt động.
- Data refresh đúng.
- Dark Mode đúng.
- Responsive không vỡ.
- Loading/Error state hoạt động.
- Không có hard-coded test data.
- Các case chính đã được test.

---

# CHỈ ĐẠO CUỐI CÙNG CHO CLAUDE

> Đây là ứng dụng dành cho **một người dùng cá nhân duy nhất**. Không xây dựng bất kỳ chức năng multi-user, team, manager, assignee, permission hay sharing nào.
>
> Mục tiêu của lần nâng cấp là biến màn hình Calendar hiện tại thành một **Personal Calendar** có UX tốt: xem nhanh, tạo nhanh, chỉnh sửa nhanh, kéo thả, resize, reminder, recurrence, search và filter.
>
> Hãy ưu tiên cải tiến trên kiến trúc/code hiện tại thay vì rewrite.
>
> Trước khi code phải khảo sát source, lập Gap Analysis và Implementation Plan. Chỉ sau đó mới bắt đầu implementation.
>
> **Không mở rộng scope sang CRM.**

## Thứ tự ưu tiên triển khai

1. Calendar full màn hình.
2. Cải thiện Month View.
3. Hoàn thiện Week/Day/List.
4. Quick Create + Drawer.
5. Drag & Drop + Resize.
6. Reminder.
7. Search/Filter.
8. Overdue/Complete.
9. Recurrence.
