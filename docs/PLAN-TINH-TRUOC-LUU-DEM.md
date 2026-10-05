# Phương án: tính trước và lưu đệm cho báo cáo, danh sách nặng

Nhánh: `claude/crm-stability-performance-eval-618dc9` (từ `main` @ cad9336, bản 1.20.0)
Trạng thái: **đã chốt hướng; đợt 0 (1.20.1) và đợt 1 (1.21.0) đã xong** (quyết định ở mục 6, kết quả đợt 1 ở mục 7). Bước chuẩn bị (chỉ mục v60, nén gzip, chia lô `IN`, sửa `/boards`) đã làm trong 1.20.1.

---

## 1. Vì sao cần

Đo trên CSDL thử dựng bằng chính các migration: 5.000 khách, 20.000 liên hệ, 15.000 cơ hội,
120.000 việc, 80.000 tương tác, 240.000 ô doanh thu, khoảng 250 MB.

| API | 1.20.0 | 1.20.1 (có chỉ mục) | Dữ liệu trả về |
|---|---|---|---|
| `/deals` | 379 s | 0,4 s | 17,5 MB |
| `/views/dashboard` | 217 s | 0,4 s | 0,6 MB |
| `/customers` | 41 s | 0,6 s | 4,5 MB |
| `/quotations` · `/contracts` | 36 s · 21 s | 0,08 s · 0,06 s | |
| `/boards` | 5,8 s | 0,2 s | |
| `/views/tasks` | 6 s | **4–6 s** | **138 MB** |
| `/views/calendar` | 2,5 s | **2–3 s** | 23 MB |
| `/revenues/comparison` · `/kpi` | 1,4 s · 1,4 s | **1,5 s · 1,5 s** | 24 MB · 32 MB |
| `/export` | | **15 s** | 328 MB, máy chủ dùng 1,7 GB RAM |

Chỉ mục đã gỡ được những chỗ tăng theo tích hai bảng. Phần còn lại tăng **tuyến tính** theo
dữ liệu, và có ba nguyên nhân mà chỉ mục không sửa được:

1. **Tính lại mọi thứ ở mỗi lần mở.** Mỗi dòng khách hàng có 16 truy vấn con, mỗi dòng việc có 8.
   Tổng quan, Báo cáo và Doanh thu cộng lại từ đầu mỗi lần ai đó mở trang.
2. **Trả về toàn bộ.** Công việc, Lịch, Doanh thu và Tài liệu không phân trang.
3. **Một luồng.** Node chạy một luồng và `better-sqlite3` là đồng bộ. Một truy vấn 5 giây làm
   **mọi người dùng khác** chờ 5 giây. Ở bản 1.20.0, trong lúc mở Khách hàng, một request khác
   gửi cùng lúc bị ngắt kết nối.

Mục tiêu: ở quy mô gấp đôi bảng trên, **mọi danh sách và báo cáo trả về dưới 300 ms (p95)**,
và **không request nào chặn luồng chính quá 200 ms**.

## 2. Ràng buộc phải giữ

- **Phạm vi dữ liệu (v40).** Mỗi người chỉ thấy bản ghi của những người mình được xem
  (`visibleContactIds`). Mọi bản tính trước hay bản lưu đệm phải lọc được theo phạm vi, hoặc
  có khoá theo phạm vi. Đây là rủi ro lớn nhất của phương án: lộ số của người khác thì tệ hơn chậm.
- **Không có lớp ghi chung.** Server có khoảng 850 câu `.prepare(`, ghi rải rác khắp các route và
  service. Cách cập nhật bản tính trước **không được dựa vào việc nhớ gọi một hàm ở từng chỗ ghi**.
- **Số theo thời gian.** "Quá hạn", "số ngày không tương tác" hay "tuổi giai đoạn" đổi theo đồng
  hồ dù dữ liệu không đổi. Chỉ lưu nguyên liệu (hạn sớm nhất, lần tương tác gần nhất), còn phép
  so với "hôm nay" thì tính lúc đọc.
- **Chỉ một tiến trình, một CSDL.** Không thêm Redis hay dịch vụ ngoài; deploy vẫn là một container
  `app` cộng `nginx`.

## 3. Phương án: bốn lớp

### Lớp A — Bảng số liệu tổng hợp, cập nhật bằng trigger và hàng đợi "bẩn"

Áp dụng cho các cột phụ của Khách hàng, Cơ hội và Công việc.

```
customer_stats(customer_id PK, open_deal_count, deal_count, open_task_count,
               total_won_vnd, open_pipeline_vnd, active_contract_count,
               last_activity_at, next_task_id, next_task_due, next_reminder_id, next_reminder_due,
               next_deal_id, next_deal_action_date, deals_without_next_action_count,
               earliest_open_task_due, earliest_next_action_date, refreshed_at)
deal_stats(deal_id PK, last_activity_at, quotation_count, contract_count, handover_count,
           v1_no_event, v2_no_economic, v3_shaped, refreshed_at)
card_stats(card_id PK, watcher_count, nudge_count, last_nudged_at, checklist_total,
           checklist_done, subtask_total, subtask_done, slip_count, refreshed_at)
stats_dirty(kind TEXT, id INTEGER, PRIMARY KEY(kind, id)) WITHOUT ROWID
```

**Cách giữ cho đúng:**

1. **Trigger SQLite** trên các bảng con (`deals`, `cards`, `interactions`, `reminders`,
   `contracts`, `quotations`, `deal_handover_items`, `checklist_items`, `task_watchers`,
   `task_nudges`, `card_due_changes`, `deal_events`, `deal_committee`, `deal_competitors`)
   chỉ làm một việc: `INSERT OR IGNORE INTO stats_dirty` cho bản ghi cha bị ảnh hưởng. Với UPDATE
   đổi cha (ví dụ chuyển cơ hội sang khách khác), trigger đánh dấu **cả cha cũ lẫn cha mới**.
   Trigger nằm trong CSDL nên bắt được mọi đường ghi, kể cả đường thêm sau này, nhập Excel và
   khôi phục.
2. **Làm sạch lúc đọc.** Trước khi trả danh sách, endpoint gọi `flushStats(kind)`: lấy các id
   trong `stats_dirty`, tính lại bằng đúng các truy vấn con hiện có (đã có chỉ mục, mỗi dòng dưới
   1 ms), ghi vào `*_stats`, xoá khỏi hàng đợi, tất cả trong một transaction. Thường mỗi lần chỉ
   vài chục dòng bẩn.
3. **Lưới an toàn.** Mỗi đêm dựng lại toàn bộ `*_stats` (vài giây), và có nút
   "Tính lại số liệu" trong Cài đặt → Hệ thống. Thêm một test so khớp: chạy kịch bản ghi ngẫu
   nhiên, rồi so `*_stats` với truy vấn gốc, phải trùng 100%.
4. **Phạm vi không đổi.** `*_stats` là cột phụ gắn với từng bản ghi. Danh sách vẫn lọc phạm vi trên
   bảng gốc như hiện nay rồi `LEFT JOIN` sang stats, nên không có rủi ro lộ dữ liệu mới.

Kết quả dự kiến: `/customers` từ 16 truy vấn con mỗi dòng còn 1 lần JOIN, `/views/tasks` từ 8
còn 1. Đây là lớp đáng giá nhất và an toàn nhất, nên làm trước.

### Lớp B — Bảng tổng doanh thu theo tháng (rollup)

Áp dụng cho Doanh thu: `/summary`, `/kpi`, `/comparison`, và các ô doanh thu trên Tổng quan.

```
revenue_rollup(year, period, revenue_group, service_id, customer_id, owner_contact_id,
               am_user_id, contract_kind, contract_term, line_status,
               amount_vnd, forecast_vnd, stage_forecast_vnd, stage_reconciled_vnd,
               stage_invoiced_vnd, stage_paid_vnd, line_count,
               PRIMARY KEY (year, period, revenue_group, service_id, customer_id,
                            owner_contact_id, am_user_id, contract_kind, contract_term, line_status))
```

- Mỗi ô `service_revenues` thuộc đúng một dòng rollup. Nhóm Mới / Mở rộng / Nền phụ thuộc
  mốc (anchor) của dòng dịch vụ, nên khi mốc đổi thì cả dòng dịch vụ bị đánh dấu bẩn.
- Cập nhật cũng dùng trigger cộng hàng đợi bẩn theo `line_id`. Khi làm sạch: trừ phần cũ, cộng
  phần mới của dòng đó, hoặc đơn giản hơn là xoá rồi dựng lại các ô rollup mà dòng đó chạm tới.
- **Phạm vi:** `owner_contact_id` là một chiều của bảng, nên truy vấn có phạm vi chỉ việc
  `WHERE owner_contact_id IN (visible)` rồi `SUM`. Số dòng rollup chỉ vài nghìn, nhỏ hơn hàng
  trăm lần dữ liệu gốc.
- Bộ lọc nào không có trong các chiều (ví dụ lọc theo danh sách khách cụ thể, hoặc chỉ dòng còn
  công nợ) thì **quay về đường tính trực tiếp như hiện nay**. Đường cũ vẫn giữ nguyên làm chuẩn để
  test so khớp.
- `/revenues/lines` (bảng chi tiết từng dòng) không rollup được; xem Lớp D.

### Lớp C — Lưu đệm kết quả trong bộ nhớ, khoá theo phạm vi và "đời dữ liệu"

Áp dụng cho các màn tổng hợp đọc nhiều, ghi ít: `/views/dashboard`, `/views/reports`,
`/views/pipeline-health`, `/views/performance`, `/focus`, và `/revenues/summary` khi đi đường
trực tiếp.

- **Khoá đệm** = đường dẫn + query đã chuẩn hoá + **dấu vân tay phạm vi** (hash của danh sách
  `visibleContactIds`, hoặc `all`) + id người xem khi màn có cột "của tôi" + **đời dữ liệu**.
- **Đời dữ liệu** = `SELECT total_changes()` trên kết nối dùng chung. Ứng dụng chỉ mở một kết nối,
  nên mọi INSERT/UPDATE/DELETE từ bất kỳ route, job nền hay trigger nào đều làm số này tăng.
  Không cần nhớ gọi "xoá đệm" ở từng chỗ ghi; dữ liệu đổi là khoá đổi.
- **Hạn dùng** 5 phút cho các số phụ thuộc đồng hồ (quá hạn, hôm nay), có nút Làm mới (mục 6). Giới hạn LRU khoảng
  200 mục / 50 MB.
- Hai người cùng phạm vi dùng chung kết quả. Khác phạm vi thì khác khoá, nên không thể lộ số.
- Có header `X-Cache: hit|miss` và một test bắt buộc: hai người khác phạm vi gọi cùng một URL thì
  nhận số khác nhau, và một lần ghi bất kỳ thì lần đọc sau là `miss`.

### Lớp D — Không chặn luồng chính

- **Phân trang và lọc mặc định** cho `/views/tasks`, `/views/calendar`, `/documents` và
  `/revenues/lines`. Mặc định lấy việc trong 30 ngày, cũ hơn thì tải dần khi cuộn (mục 6); Lịch chỉ lấy khoảng
  đang xem. Giao diện dùng `useInfiniteQuery` và danh sách ảo hoá (`@tanstack/react-virtual`).
  Công việc từ 138 MB xuống còn vài trăm KB mỗi trang.
- **Worker thread chỉ đọc** cho việc nặng hiếm khi chạy: `/export`, `/export/:entity.csv`, dựng
  lại `*_stats` ban đêm, ngữ cảnh AI. Worker mở kết nối `readonly` riêng; chế độ WAL cho phép đọc
  song song với luồng chính. `/export` ghi JSON theo kiểu stream ra file tạm rồi trả file, không
  dựng chuỗi 328 MB trong RAM.
- **Theo dõi:** middleware ghi log mọi request trên 1 s và mọi truy vấn trên 200 ms (kèm
  `EXPLAIN QUERY PLAN`, như bộ đo đã dùng), xem được trong Cài đặt → Hệ thống.

## 4. Thứ tự triển khai

| Đợt | Nội dung | Migration | Kết quả đo được |
|---|---|---|---|
| **0** (1.20.1, xong) | Chỉ mục v60, gzip, chia lô `IN`, sửa `/boards` | v60 | bảng ở mục 1 |
| **1** (1.21.0, xong) | Bộ đo cố định trong repo (`server/scripts/bench-large.mjs`), log request chậm, Công việc 30 ngày + tải dần, vẽ dần 300 dòng, số đếm và huy hiệu tính ở máy chủ, Tài liệu theo trang. Lịch vốn đã tải theo khoảng ngày nên không đổi | — | xem mục 7 |
| **2** | Lớp A: `customer_stats`, `deal_stats`, `card_stats`, trigger, `stats_dirty`, test so khớp | v61 | Khách hàng / Cơ hội / Công việc dưới 150 ms |
| **3** | Lớp C: đệm cho Tổng quan, Báo cáo, Trọng tâm | — | lần mở thứ hai dưới 20 ms |
| **4** | Lớp B: `revenue_rollup` cho Tổng hợp / KPI / So sánh; phân trang `/revenues/lines` | v62 | Doanh thu dưới 300 ms |
| **5** | Worker cho xuất dữ liệu và dựng lại ban đêm; nén bản sao lưu Telegram và tự xoá bản cũ | — | xuất dữ liệu không quá 200 MB RAM, sao lưu dưới 50 MB |

Mỗi đợt là một bản phát hành riêng, có rollback riêng, và phải chạy lại bộ đo ở quy mô 1× và 2×
trước khi đẩy `main`.

## 5. Rủi ro và cách chặn

| Rủi ro | Cách chặn |
|---|---|
| Số tổng hợp lệch với dữ liệu gốc (sót trigger) | Test so khớp chạy kịch bản ghi ngẫu nhiên; dựng lại mỗi đêm; nút tính lại; `refreshed_at` để soi |
| Lộ số giữa các phạm vi qua đệm | Phạm vi nằm trong khoá; test hai người khác phạm vi; Lớp A/B vẫn lọc trên bảng gốc hoặc theo chiều `owner_contact_id` |
| Trigger làm chậm thao tác ghi | Trigger chỉ ghi một dòng vào `stats_dirty` (dưới 0,05 ms); không tính toán trong trigger |
| Nhập Excel hàng loạt làm hàng đợi bẩn phình to | `flushStats` có giới hạn mỗi lần (ví dụ 2.000 id); phần còn lại để job nền làm |
| Migration thêm trigger lên production | Migration chỉ tạo bảng và trigger, rồi đánh dấu tất cả là bẩn; việc dựng số chạy sau khi khởi động, không chặn khởi động |
| Đệm giữ số cũ khi sửa CSDL ngoài ứng dụng (thay `app.db` từ bản sao lưu, sửa bằng `sqlite3`) | Thay `app.db` bắt buộc khởi động lại container nên đệm mất; sửa tay thì tối đa 5 phút hoặc bấm Làm mới; `*_stats` dựng lại bằng nút tính lại |

## 6. Đã quyết (2026-10-05)

1. **Độ trễ của Tổng quan / Báo cáo: chấp nhận số cũ tới 5 phút**, nhưng phải có nút **Làm mới**
   lấy số mới ngay. Lớp C vì vậy dùng hạn dùng 5 phút thay cho 60 giây. Khoá đệm vẫn kèm đời dữ
   liệu (`total_changes()`), nên thường số đổi ngay khi có người ghi. Mốc 5 phút chỉ là trần cho
   các số phụ thuộc đồng hồ. Nút Làm mới gửi `?fresh=1`: máy chủ bỏ qua đệm, tính lại, rồi ghi
   đè mục đệm của phạm vi đó. Màn hình hiện "Cập nhật lúc HH:mm" lấy từ thời điểm tính.
   Giới hạn `fresh=1` tối đa một lần mỗi 10 giây cho mỗi người, để nút không thành đường làm treo
   máy chủ.
2. **Màn Công việc: mặc định hiện việc trong 30 ngày** (chưa xong, hoặc xong / cập nhật trong
   30 ngày gần nhất). Việc cũ hơn **tải dần khi cuộn** xuống cuối danh sách, theo trang 200 dòng,
   phân trang bằng con trỏ (`due_date`, `id`) chứ không dùng `OFFSET`.
3. **Quy mô: 100 nhân viên sale.** Ước tính sau 12 tháng: khoảng 10.000 khách, 40.000 liên hệ,
   30.000 cơ hội, 250.000 việc, 150.000 tương tác, 20.000 dòng dịch vụ (480.000 ô doanh thu),
   tức **mức 2×** của bộ đo. Ngoài lượng dữ liệu, cần tính cả **tải đồng thời**: 100 người mở sẵn
   ứng dụng thì chuông thông báo (60 giây) và nhắc việc (20 giây) đã tạo khoảng 7 request mỗi
   giây chạy nền. Các request đó chỉ vài chục ms nên không sao, **trừ khi** có một request khác
   chiếm luồng vài giây: cả 100 người cùng chờ. Vì vậy mục tiêu "không request nào chặn luồng
   chính quá 200 ms" là bắt buộc, không chỉ là mong muốn, và bộ đo phải có thêm phần giả lập
   100 người dùng đồng thời.

## 7. Kết quả đợt 1 (1.21.0)

Đo bằng `server/scripts/bench-large.mjs` ở mức 1×, mỗi request chạy riêng:

| Request | 1.20.1 | 1.21.0 |
|---|---|---|
| Thanh bên màn Công việc (trước: tải mọi việc để đếm) | 5 s · 139 MB | 0,14 s · dưới 1 KB |
| Huy hiệu "Cần theo dõi" trên mọi trang | tải mọi việc đang mở | 0,14 s · dưới 1 KB |
| Tab Hoàn thành | 5 s · 139 MB | 0,16 s · 3,6 MB |
| Một trang việc xong cũ hơn 30 ngày | — | 0,1 s · 0,23 MB |
| Thư viện Tài liệu | 0,3 s · 12 MB, cộng 27 MB danh sách phụ | 0,05 s · 0,12 MB |

Thử trên trình duyệt với 48.000 việc đang mở: trước đây màn Công việc treo trình duyệt. Nguyên nhân
chính không phải dữ liệu mà là mỗi dòng dựng lại danh sách 20.000 người cho ô "người phụ trách".
Giờ danh sách lựa chọn dựng một lần dùng chung, và danh sách việc vẽ dần từng 300 dòng.

**Còn lại:** tab "Đang mở" của người xem toàn công ty vẫn trả về mọi việc đang mở (1,7 s · 55 MB với
48.000 việc). Lớp A (bảng `card_stats`) và rút gọn cột trả về sẽ xử lý tiếp. Chế độ Kanban chưa vẽ
dần. Mỗi ô chọn khách hàng vẫn tải `/api/customers` đầy đủ (4,4 MB ở mức 1×); nên có một API danh sách
rút gọn chỉ gồm id và tên.
