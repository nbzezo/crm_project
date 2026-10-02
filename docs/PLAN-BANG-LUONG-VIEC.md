# Phương án: "Bảng – Luồng việc", ẩn bảng khi thừa, tách rõ Giai đoạn

Nhánh: `claude/project-task-board-overlap-2373f3` (tách từ `main` @ 153a301, bản 1.8.0)
Trạng thái: **đã triển khai trong 1.9.0** — Q1 dùng "Luồng việc" ở chỗ hẹp; Q2 luồng ngầm mang tên dự án; Q3 chỉ đếm luồng có mốc; Q4 giữ nguyên tên cột P01–P09

---

## 1. Cách hiểu hiện tại (trước thay đổi)

### 1.1 Mô hình dữ liệu

```
Dự án (projects, từ v17)
  └── Bảng (boards.project_id)          ← cũng chính là "Giai đoạn" (v26: boards.milestone_date)
        └── Cột (lists.status_mapping)  ← mặc định 4 cột = 4 trạng thái
              └── Công việc (cards)
```

- Mọi công việc **bắt buộc** nằm trong một cột của một bảng. Dự án là lớp đặt lên trên.
- Bảng có thể gắn dự án, gắn khách hàng, hoặc không gắn gì.
- Bảng mới luôn có 4 cột: Cần làm → `todo`, Đang làm → `doing`, Chờ duyệt → `review`,
  Hoàn thành → `done`. Kéo thẻ qua cột là đổi trạng thái.
- Bộ mẫu cột (`delivery.board_templates`) cho dự án lớn có 9 cột **P01 Khởi tạo … P09 Hoàn tất**.

### 1.2 "Giai đoạn" đang là gì

Migration v26 quyết định **không tạo bảng `phases`**: *một giai đoạn = một bảng có hạn*
(`server/src/services/deliveryService.ts` → `listPhases`). Tab **Giai đoạn** của dự án
liệt kê **mọi** bảng của dự án và cho đặt `milestone_date` ngay tại đó.

### 1.3 Vấn đề người dùng gặp

| # | Vấn đề | Chỗ thấy |
|---|---|---|
| V1 | Chữ "Bảng" không nói lên vai trò; cạnh mục "Công việc" thì trông như một nơi xem việc thứ ba | Thanh bên, nhóm Dự án |
| V2 | Dự án chỉ có 1 bảng thì bảng không thêm thông tin gì nhưng vẫn hiện khắp nơi (panel "Bảng công việc (1)", ô "Bảng" trong form, cột "Bảng" trong danh sách) | Tổng quan dự án, form tạo việc |
| V3 | Dự án mới tạo **chưa có bảng** → tab Công việc chặn nút "Thêm công việc", bắt bấm "Tạo bảng" trước | Tab Công việc của dự án |
| V4 | Mọi bảng đều bị coi là giai đoạn, kể cả bảng "Việc chung", "Hỗ trợ" không có mốc | Tab Giai đoạn |
| V5 | Chữ "Giai đoạn" mang 3 nghĩa: giai đoạn cơ hội (stage), giai đoạn dự án (bảng có hạn), và các cột P01–P09 trông cũng như giai đoạn | Pipeline, tab Giai đoạn, bảng dùng mẫu "large" |
| V6 | Chữ "Bảng" mang 2 nghĩa: board và dạng xem bảng tính (`TasksPage.tsx:594`, cột "Bảng" của `TaskTable`) | Trang Công việc |
| V7 | Dạng xem tên "Bảng" trong tab Công việc của dự án thực ra hiển thị **cây việc**, không phải Kanban | `ProjectDetailPage.tsx:205` |

---

## 2. Cách hiểu sau thay đổi

### 2.1 Định nghĩa (đưa vào `docs/GLOSSARY.md`)

| Khái niệm | Định nghĩa một câu | Trả lời câu hỏi |
|---|---|---|
| **Bảng – Luồng việc** | Một dòng công việc có **quy trình riêng** (bộ cột riêng) và **người phụ trách riêng** | "Việc này thuộc mảng nào, đi qua những bước nào?" |
| **Cột** | Một **bước** trong quy trình của luồng việc; mỗi cột gắn với một trạng thái | "Việc này đang ở bước nào?" |
| **Giai đoạn (dự án)** | Một luồng việc **có mốc bàn giao**. Không phải thực thể riêng | "Đến ngày nào phải giao xong phần nào?" |
| **Giai đoạn (cơ hội)** | Bước trong pipeline bán hàng. Không đổi | (thuộc Kinh doanh) |

**Ranh giới một câu:** *Luồng việc chia việc theo **mảng**; Giai đoạn là luồng việc được
gắn thêm **mốc thời gian**; Cột chia việc theo **bước** bên trong một luồng.*

Hệ quả:

- Mọi giai đoạn đều là luồng việc, nhưng **không phải** luồng việc nào cũng là giai đoạn.
  Luồng "Việc chung" không đặt mốc thì không hiện ở tab Giai đoạn.
- Các cột P01–P09 của mẫu "large" là **bước**, không phải giai đoạn. Một dự án lớn có thể có
  2 giai đoạn (Đợt 1, Đợt 2), mỗi đợt đều đi qua P01→P09.
- Giữ nguyên nguyên tắc của v26: **không tạo bảng `phases`**, không cần migration.

### 2.2 Tên hiển thị

| Chỗ | Trước | Sau |
|---|---|---|
| Thanh bên, tiêu đề trang `/boards` | Bảng công việc | **Bảng – Luồng việc** |
| Ô chọn trong form công việc, cột trong danh sách, bộ lọc, nhóm theo | Bảng | **Luồng việc** (dạng ngắn, xem câu hỏi Q1) |
| Nút tạo | Tạo bảng mới | Tạo luồng việc |
| Panel ở Tổng quan dự án | Bảng công việc (n) | Luồng việc (n) |
| Tab Giai đoạn | Giai đoạn & mốc bàn giao (tất cả bảng) | Giai đoạn & mốc bàn giao (chỉ luồng có mốc) |
| Dạng xem Kanban theo cột (`BOARD_VIEWS`) | Bảng | **Kanban** |
| Dạng xem trong tab Công việc của dự án đang render `TaskTree` | Bảng | **Cây việc** |
| Dạng xem bảng tính ở trang Công việc (`TasksPage.tsx:594`) | Bảng | **Bảng tính** (khớp với `BOARD_VIEWS`) |
| Cột trong bảng | Danh sách / Thêm danh sách | Cột / Thêm cột |

Tên kỹ thuật (`boards`, `lists`, quyền `boards:read`, đường dẫn `/boards`) **giữ nguyên**,
chỉ đổi chữ hiển thị qua `client/src/i18n/vi.ts` và `client/src/i18n/permissions.ts`.

---

## 3. Ẩn bảng khi không thêm gì

### 3.1 Quy tắc

> Một dự án có **đúng 1 luồng việc đang hoạt động** thì luồng việc đó là **ngầm**:
> người dùng làm việc với dự án, không cần biết đến luồng việc.

Không xét bộ cột: nếu cột đã sửa thì người dùng vẫn thấy chúng ở dạng xem Kanban, chỉ không phải
*chọn* luồng nào.

Bảng **không thuộc dự án** (bảng của khách hàng, bảng nội bộ) **luôn hiện**, vì ở đó bảng chính
là đơn vị tổ chức duy nhất.

### 3.2 Trước / sau theo từng màn hình

| Màn hình | Trước | Sau (dự án có 1 luồng việc) | Sau (dự án có ≥ 2 luồng việc) |
|---|---|---|---|
| **Tạo dự án** | Không tạo bảng. Dự án rỗng, không thêm việc được | **Tự tạo 1 luồng việc** tên = tên dự án, 4 cột mặc định (hoặc theo bộ mẫu nếu đã phân loại) | — |
| **Tab Công việc của dự án** | Không có bảng thì chặn "Thêm công việc" | "Thêm công việc" thêm thẳng vào luồng ngầm | Hiện thêm bộ lọc / nhóm theo luồng việc |
| **Form tạo/sửa công việc** | Luôn có ô "Bảng" | Chọn dự án là tự chọn luồng ngầm; **ẩn** ô luồng việc, chỉ còn ô Cột (bước) | Hiện ô "Luồng việc", chỉ liệt kê luồng của dự án đó |
| **Tổng quan dự án** | Panel "Bảng công việc (1)" | **Ẩn panel**; thay bằng link nhỏ "Mở Kanban theo cột" | Panel "Luồng việc (n)" |
| **Tab Giai đoạn** | Liệt kê bảng duy nhất, trạng thái "chưa đặt mốc" | Nếu chưa đặt mốc: "Dự án chưa chia giai đoạn" + nút **Chia giai đoạn** (tạo luồng thứ hai, đặt mốc) | Chỉ liệt kê luồng **có mốc**; luồng chưa có mốc nằm trong mục thu gọn "Luồng chưa đặt mốc (n)" để đặt nhanh |
| **Danh sách việc (`/tasks`, cột / nhóm theo)** | Cột "Bảng" luôn có | Việc thuộc dự án có 1 luồng: ô luồng việc **để trống**, không lặp tên dự án | Hiện tên luồng việc |
| **Trang `/boards`** | Liệt kê mọi bảng | Vẫn liệt kê (đây là chỗ quản lý), có ghi chú "luồng ngầm của dự án X" | Như cũ |

### 3.3 Dự án đang có sẵn

- Dự án **chưa có bảng nào**: giữ nút tạo bảng như hiện tại, đổi chữ thành "Bắt đầu" (tạo luồng
  ngầm ở lần thêm việc đầu tiên). **Không** dùng migration để tạo bảng hàng loạt trên production.
- Dự án có 1 bảng: tự áp quy tắc 3.1, không đụng dữ liệu.

---

## 4. Thay đổi kéo theo ở nghiệp vụ

| Chỗ | Trước | Sau | Ghi chú |
|---|---|---|---|
| `listPhases` (`deliveryService.ts`) | Mọi bảng của dự án | Chỉ bảng có `milestone_date`; trả thêm danh sách bảng chưa có mốc riêng | |
| `phase_count` trong phân loại mô hình A/B (`deliveryService.ts:151`) | Đếm **mọi** bảng đang hoạt động | Đếm bảng **có mốc** | ⚠ Làm thay đổi gợi ý A/B cho dự án có nhiều bảng chưa đặt mốc. Chỉ đổi *gợi ý*, không đổi kết quả đã chốt. Xem Q3 |
| `POST /api/projects` | Không tạo bảng | Tạo 1 bảng trong cùng transaction, dùng `DEFAULT_LISTS` hoặc bộ mẫu theo phân loại | Không có migration |
| Sức khỏe dự án / báo cáo | Dựa trên công việc và mốc | Không đổi | |

---

## 5. Phạm vi công việc

1. **i18n và tên gọi:** `vi.ts`, `permissions.ts`, `BoardViews.tsx`, `TasksPage.tsx`, `TaskTable.tsx`,
   `TaskTree.tsx`, `TaskFormDialog.tsx`, `CardModal.tsx`, `ProjectDetailPage.tsx`, `BoardsPage.tsx`,
   `BoardPage.tsx`; cập nhật `docs/GLOSSARY.md`.
2. **Ẩn luồng ngầm:** helper `isImplicitBoard(project)` ở client; áp vào form, Tổng quan, tab Công việc, tab Giai đoạn.
3. **Server:** tự tạo bảng khi tạo dự án; `listPhases` và `phase_count` theo định nghĩa mới; test
   cho cả hai.
4. **Phát hành:** bản **1.9.0** (thay đổi hành vi người dùng thấy). Ghi chú phát hành trong
   `appRelease.ts`. Không có migration.

---

## 6. Câu hỏi cần bạn chốt

- **Q1. Tên ngắn.** "Bảng – Luồng việc" dài với ô form và tiêu đề cột. Đề xuất: dùng đủ ở thanh bên
  và tiêu đề trang, dùng **"Luồng việc"** ở mọi chỗ hẹp. Quy tắc 4 của GLOSSARY ("một khái niệm
  một tên") vẫn đúng vì đây là một tên với một dạng rút gọn. Đồng ý không?
- **Q2. Tên luồng ngầm** khi tự tạo: tên dự án (đề xuất), hay "Việc chung"?
- **Q3. `phase_count`.** Đếm theo định nghĩa mới (chỉ luồng có mốc), hay giữ cách đếm cũ để gợi ý
  A/B không đổi?
- **Q4. Cột P01–P09.** Giữ nguyên tên, hay đổi tiền tố P → B (Bước) cho khỏi nhầm với giai đoạn?
  Đổi chỉ áp cho bảng mới tạo từ mẫu, không sửa bảng đang có.

## 7. Rủi ro

- Không có số liệu sử dụng thật: chưa biết bao nhiêu dự án có ≥ 2 bảng không đặt mốc. Những dự
  án đó sẽ thấy tab Giai đoạn **ngắn đi**. Đề xuất chạy truy vấn đếm trên bản sao dữ liệu trước khi đẩy.
- Người đã quen chữ "Bảng" cần một dòng trong ghi chú phát hành giải thích tên mới.
