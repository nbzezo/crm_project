# Kế hoạch: Quy trình theo trạng thái của công việc

Trạng thái: **bản nháp chờ duyệt** · Dự kiến phát hành 1.29.0 · Migration v66 (`main` đang ở v65)

## 1. Điều người dùng muốn

- Khi tạo công việc hoặc khi công việc **vào một trạng thái**, hệ thống hỏi có thêm quy trình
  cho trạng thái đó không. Có thể bỏ qua, dùng **mẫu của trạng thái**, hoặc tự nhập các bước.
- Các bước làm **lần lượt**: bước trước xong thì bước sau mới mở.
- Xong bước cuối thì công việc **tự chuyển** sang trạng thái kế tiếp.
- Đổi trạng thái khi quy trình chưa xong thì hệ thống báo các bước còn dở, người dùng
  **xác nhận bỏ qua** mới được đổi.
- Mỗi trạng thái có **một mẫu mặc định**. Ví dụ Đang làm có mẫu A, Chờ duyệt có mẫu B.

## 2. Đặt quy trình ở đâu trong mô hình hiện có

| Tầng | Cố định hay động | Vai trò |
|---|---|---|
| Trạng thái lõi (`CARD_STATUSES`, 6 giá trị) | Cố định | Báo cáo, `is_done`, nhắc việc. **Không đổi** |
| Cột của luồng việc (`lists.status_mapping`) | Động | Vị trí trên kanban, gắn với một trạng thái lõi. **Không đổi** |
| **Quy trình** (mới) | Động, theo từng công việc | Danh sách bước bên trong một trạng thái của một công việc |

Quy trình nằm bên trong công việc, không thay vị trí cột. Vì vậy không có hai nơi lưu cùng một thông tin.
Chặn đổi trạng thái chỉ là **cảnh báo có xác nhận**, nên bất biến `is_done ⇔ done` và toàn bộ
truy vấn báo cáo vẫn đúng.

Quy trình **gắn với trạng thái lõi**, không gắn với cột. Kéo thẻ giữa hai cột cùng trạng thái
"Đang làm" thì không bị chặn và không hỏi.

### Tên gọi (cần chốt)

GLOSSARY hiện ghi Cột là "một **bước** trong **quy trình** của luồng việc", nên trùng chữ.
Đề xuất:
- Tính năng mới gọi là **Quy trình**, đơn vị là **bước**. Trên thẻ hiển thị "Đang làm · 2/4".
- Sửa định nghĩa Cột trong GLOSSARY thành "một cột của luồng việc, gắn với một trạng thái".

## 3. Dữ liệu (migration v66)

```sql
-- Mot quy trinh cua mot cong viec trong mot trang thai.
CREATE TABLE card_flows (
  id INTEGER PRIMARY KEY,
  card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  status TEXT NOT NULL,                 -- trang thai loi ma quy trinh thuoc ve
  from_template INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  created_by_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  completed_at TEXT,                    -- di het buoc
  skipped_at TEXT,                      -- roi trang thai khi chua xong, co xac nhan
  skipped_by_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  UNIQUE (card_id, status)
);

CREATE TABLE card_flow_steps (
  id INTEGER PRIMARY KEY,
  flow_id INTEGER NOT NULL REFERENCES card_flows(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  position REAL NOT NULL,
  done_at TEXT,
  done_by_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL
);
CREATE INDEX idx_card_flows_card ON card_flows(card_id);
CREATE INDEX idx_card_flow_steps_flow ON card_flow_steps(flow_id, position);
```

**Mẫu** lưu ở khóa cài đặt `task_flow.templates`, giống cách `handover.templates` đang làm:

```json
{
  "doing":  { "steps": ["Khảo sát", "Cấu hình", "Kiểm thử"], "next_status": "review", "ask": "always" },
  "review": { "steps": ["Gửi duyệt", "Sửa theo góp ý"],      "next_status": "done",   "ask": "always" }
}
```

- `next_status` là trạng thái tự chuyển tới khi xong bước cuối. Mặc định: todo → doing,
  doing → review, review → done, waiting_customer → doing, blocked → doing.
  Nếu luồng việc không có cột nào mang trạng thái đích thì chuyển thẳng sang `done`.
- `ask` có ba giá trị: `always` (luôn hỏi, mặc định), `auto` (tự áp mẫu, không hỏi), `never`.
  Giá trị này để tránh hỏi mãi ở những trạng thái không cần quy trình.
- Trạng thái `done` không có quy trình.

**Công tắc tính năng** là khóa cài đặt `task_flow.enabled`, mặc định **tắt** khi nâng cấp. Bản cài
đang chạy sẽ không bị đổi hành vi cho đến khi quản trị bật. Khi tắt:
- Không hỏi, không chặn đổi trạng thái, không tự chuyển, ẩn mọi mục Quy trình trên giao diện.
- Dữ liệu quy trình đã có **được giữ nguyên**. Bật lại thì hiện như cũ.
- Báo cáo không phụ thuộc công tắc, vì báo cáo vẫn tính theo trạng thái.

Thêm vào migration:
- `migrate-v66.sql` và `migrate-v66-rollback.sql`, một dòng trong `rollback.ts`, `LATEST_VERSION = 66`.
- `card_flows` và `card_flow_steps` đưa vào `EXPORT_TABLES` (`server/src/routes/system.ts`).
- `task_flow.templates` đưa vào hồ sơ cấu hình (`configProfile.ts`) để chuyển được giữa các bản cài.

## 4. Luật nghiệp vụ (máy chủ)

Toàn bộ nằm trong `cardService.ts`, đi qua `setCardStatus` vì đây là đường ghi duy nhất của trạng thái.

0. **Mọi luật dưới đây chỉ chạy khi `task_flow.enabled` bật.** Tắt thì công việc chạy như trước.
1. **Chặn khi rời trạng thái.** Nếu trạng thái mới khác trạng thái cũ, và quy trình của trạng thái
   cũ còn bước chưa xong, máy chủ trả **409 `FLOW_INCOMPLETE`** kèm danh sách bước còn lại.
   Nếu yêu cầu gửi `skip_flow: true` thì cho qua và ghi `skipped_at` / `skipped_by`.
   - Kiểm tra cho: `PATCH /cards/:id` (status, is_done), `PATCH /cards/:id/move`,
     `POST /notifications/:key/complete`.
   - Không kiểm tra khi quản trị đổi `status_mapping` của cả cột (`lists.ts`). Đó là cấu hình lại,
     không phải thao tác trên từng công việc.
2. **Bước tuần tự.** Chỉ tick được bước đầu tiên chưa xong. Bỏ tick được bước cuối cùng đã xong.
3. **Tự chuyển.** Tick bước cuối thì ghi `completed_at` và gọi `setCardStatus(next_status)` trong
   cùng transaction. Thẻ tự sang cột tương ứng, việc lặp lại vẫn sinh bản kế tiếp nếu chuyển sang `done`.
   Sau khi tự chuyển, trạng thái mới được xử lý **như mọi lần vào trạng thái**: hỏi, tự áp mẫu hoặc
   bỏ qua theo `ask` của trạng thái mới. Nhờ vậy quy trình nối tiếp nhau thành chuỗi, ví dụ
   Đang làm (3 bước) → Chờ duyệt (2 bước) → Hoàn thành.
4. **Vào lại trạng thái cũ** (ví dụ mở lại công việc) thì dùng lại quy trình đã có, giữ tiến độ và
   xóa `skipped_at`.
5. **Mẫu `ask = auto`**: máy chủ tự tạo quy trình từ mẫu ngay khi công việc vào trạng thái đó.
6. **Việc lặp lại, sao chép thẻ, sao chép cột**: chép các quy trình sang bản mới, đặt mọi bước về chưa xong.

## 5. Giao diện

- **Form tạo việc**: thêm mục "Quy trình" xuất hiện theo trạng thái của cột đang chọn. Mục này có
  ô "Thêm quy trình" và ô nhập mỗi dòng một bước, điền sẵn mẫu, giống ô Checklist hiện có.
- **Hỏi khi vào trạng thái**: sau khi đổi trạng thái thành công trên một công việc (hộp chi tiết, kéo
  kanban, đổi trạng thái ở tab Công việc), nếu trạng thái mới chưa có quy trình và mẫu đặt `ask = always`,
  hiện hộp nhỏ: "Thêm quy trình cho Chờ duyệt? **Dùng mẫu (3 bước)** · **Tự tạo** · **Bỏ qua**".
  Thao tác hàng loạt, lịch, trợ lý AI thì không hỏi.
- **Xác nhận bỏ qua**: một hook dùng chung `useStatusChangeGuard` bắt lỗi `FLOW_INCOMPLETE`, hiện
  "Còn 2/4 bước chưa xong: Kiểm thử, Bàn giao. Vẫn chuyển?", rồi gửi lại với `skip_flow: true`.
  Thao tác hàng loạt chỉ hỏi một lần cho cả nhóm. Áp dụng cho các chỗ đang đổi trạng thái:
  `CardModal`, `BoardView` (kéo thả), `CardModalPopovers`, `TaskWorkspaceList`, `TaskWorkspaceKanban`,
  `TaskTree`, `TaskTable` (kể cả hàng loạt), `SubtaskSection`, `CalendarView`, `useFocusActions`,
  chuông thông báo.
- **Hộp chi tiết công việc**: mục "Quy trình · Đang làm" nằm trên Checklist. Các bước có thứ tự, chỉ
  bước kế tiếp tick được, thêm, sửa, xóa, kéo đổi thứ tự được. Có nút "Bỏ quy trình". Quy trình
  của các trạng thái đã qua thu gọn ở dưới, ghi rõ "đã xong" hoặc "bỏ qua 2 bước".
- **Thẻ kanban, danh sách công việc**: nhãn "2/4" cạnh trạng thái. Cột "Tiến độ" lấy theo quy trình
  đang chạy, không có thì lấy theo checklist như hiện nay.
- **Cài đặt → Quy trình**: trên cùng là công tắc **Bật quy trình cho công việc**. Bên dưới, mỗi trạng
  thái có danh sách bước, trạng thái tự chuyển tới và cách hỏi. Màn này làm theo khuôn `HandoverSettings`.

## 6. Rà soát các tính năng liên quan

| Tính năng | Ảnh hưởng | Việc cần làm |
|---|---|---|
| Báo cáo hiệu suất (`/views/performance`) | Số liệu tính theo `is_done`/`completed_at`, không sai | Thêm chỉ số **"Hoàn thành bỏ qua quy trình"** cho từng người |
| Báo cáo tổng, Dashboard (`/views/reports`, `/dashboard`) | Không đổi | Không làm. Bộ đệm 5 phút vẫn đúng vì số đếm không đổi nghĩa |
| Tiến độ dự án (`progress_pct`) | Tính theo số việc xong, không đổi | Không làm trong bản này |
| Cột Tiến độ ở tab Công việc (`views.ts`) | Đang chỉ dựa checklist | Ưu tiên quy trình đang chạy |
| Trọng tâm (AI + bản tin Telegram) | AI không biết công việc đang ở bước nào | Đưa "bước hiện tại, n/m" vào dữ liệu gửi AI |
| Trợ lý AI nhanh | Như trên | Đưa quy trình vào ngữ cảnh công việc đang xem |
| Nhật ký công việc (`task_activity`) | Thiếu sự kiện mới | Thêm `step_done`, `flow_completed`, `flow_skipped`; cập nhật kiểu `TaskActivity` ở client và nhãn hiển thị |
| Việc lặp lại, sao chép thẻ, sao chép cột | Sẽ mất quy trình | Chép quy trình, đặt lại chưa xong (mục 4.6) |
| Đổi `status_mapping` của cột | Có thể đổi trạng thái hàng loạt | Không chặn, ghi rõ trong code |
| Sao lưu, xuất dữ liệu, hồ sơ cấu hình | Thiếu bảng và mẫu mới | `EXPORT_TABLES` và `configProfile.ts` (mục 3) |
| Xóa, lưu trữ công việc | Không đổi | `ON DELETE CASCADE` lo phần xóa |
| Quyền | Không có quyền mới | Tick bước theo quyền sửa công việc; sửa mẫu theo quyền cài đặt |
| Bàn giao deal, checklist, việc con | Không đổi | Không làm |

## 7. Kiểm thử

- Máy chủ: chặn 409 và `skip_flow`, tick sai thứ tự bị từ chối, tự chuyển ở bước cuối (kể cả sang
  `done` có việc lặp lại), vào lại trạng thái giữ tiến độ, `ask = auto`, sao chép và việc lặp lại chép
  quy trình, kéo giữa hai cột cùng trạng thái không bị chặn, migration và rollback v66, `exportTables.test.ts`.
- Giao diện: `tsc`, `vitest` cho hook xác nhận và hàm tính tiến độ.

## 8. Thứ tự làm

1. Migration v66, `cardService` (luật chặn, bước, tự chuyển), API, test máy chủ.
2. Hộp chi tiết công việc, form tạo việc, hook xác nhận cho mọi chỗ đổi trạng thái.
3. Cài đặt mẫu, hộp hỏi khi vào trạng thái.
4. Mục 6: nhãn tiến độ, nhật ký, báo cáo hiệu suất, ngữ cảnh AI, sao chép và việc lặp lại.
5. Phát hành 1.29.0 theo CLAUDE.md: phiên bản ở 4 chỗ, `RELEASE_NOTES`, commit nêu migration v66.

## 9. Quyết định

1. Đã chốt: tên gọi **Quy trình**, sửa định nghĩa Cột trong GLOSSARY (mục 2).
2. Đã chốt: mẫu chung cho mọi luồng việc theo trạng thái lõi. Mẫu riêng cho từng luồng việc để đợt sau.
3. Đã chốt: tự chuyển xong thì xử lý trạng thái mới như mọi lần vào trạng thái (mục 4.3).
4. Đã chốt: tùy chọn `ask` (luôn hỏi, tự áp mẫu, không hỏi) cho từng trạng thái. Mặc định Đang làm
   và Chờ duyệt luôn hỏi, các trạng thái còn lại không hỏi.
5. Đã chốt: công tắc bật/tắt toàn bộ tính năng (mục 3), mặc định tắt khi nâng cấp.
