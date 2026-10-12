# Rà soát hiệu năng, tải, bộ nhớ và khả năng mở rộng — 2026-10-12 (bản 1.37.0)

Cách làm: chạy bộ đo sẵn có `server/scripts/bench-large.mjs` ở quy mô 1x (5.000 khách, 20.000 liên hệ,
15.000 cơ hội, 120.000 việc, 80.000 tương tác, 10.000 dòng doanh thu × 24 tháng, CSDL ~107 MB), bổ sung
một pha **tải đồng thời** (`BENCH_LOAD=<số người>`) đo p50/p95, RSS, heap và độ trễ event loop; thử một
thay đổi pragma SQLite để có số đo thật; và 3 lượt Codex rà chỉ đọc (máy chủ, vận hành, client). Phát
hiện của Codex được đối chiếu với mã và số đo; những gì chưa đo được ghi rõ là ước lượng.

Lưu ý về số đo: bộ đo chạy với quyền toàn công ty (chế độ tắt xác thực) — đó là trường hợp **xấu nhất**
(giám đốc, quản trị). Nhân viên có phạm vi hẹp nhận ít dòng hơn nhiều. Pha tải chạy client ảo trong
cùng tiến trình nên RSS đo được cao hơn máy chủ thật; độ trễ event loop là của máy chủ.

---

## 1. Kết luận chính

1. **Nút thắt là dung lượng phản hồi, không phải tốc độ truy vấn.** Nhiều màn trả về *toàn bộ* dữ liệu
   rồi để trình duyệt vẽ dần. Ở 1x: `/views/tasks` (việc đang mở) **56 MB**, `/revenues/kpi` **30 MB**,
   `/views/tasks?nudge=1` **24 MB**, `/revenues/lines` **21 MB**, `/deals` **17 MB**.
   `JSON.stringify` một chuỗi 56 MB là thao tác đồng bộ trên luồng chính và cấp phát hàng trăm MB.
2. **Node một luồng + SQLite đồng bộ: một request nặng làm mọi người cùng chờ.** Pha tải 20 người dùng
   cùng mở 8 màn thường dùng trong 30 giây (đệm tắt):

   | API | p50 | p95 |
   |---|---|---|
   | `/views/tasks?done=0&recent_days=30` | 36,0 s | 37,0 s |
   | `/views/calendar` (6 tuần) | 12,5 s | 12,8 s |
   | `/views/dashboard` | 11,9 s | 11,9 s |
   | `/deals` | 10,4 s | 11,2 s |
   | `/views/tasks/counts` | 4,3 s | 4,4 s |
   | `/search` | 2,0 s | 12,5 s |
   | `/customers?fields=basic` | 1,0 s | 1,1 s |
   | `/notifications` | 0,4 s | 0,4 s |

   Độ trễ event loop tối đa **32,6 giây**; RSS đỉnh 2,2 GB (gồm phía client ảo). Với mục tiêu 100 người
   dùng, khi vài người cùng mở màn Công việc / Pipeline, cả hệ thống sẽ "đứng".
3. **Pragma SQLite đang để mặc định** (bộ đệm trang chỉ ~2 MB, `synchronous=FULL`). Thử
   `cache_size=64 MB`, `synchronous=NORMAL`, `temp_store=MEMORY`, `mmap_size=256 MB` — lần gọi đầu:

   | API | Hiện tại | Có pragma |
   |---|---|---|
   | `/views/reports` | 1.136 ms | 510 ms |
   | `/revenues/summary` | 1.540 ms | 661 ms |
   | `/revenues/kpi` | 1.966 ms | 1.145 ms |
   | `/views/tasks?done=0` | 2.049 ms | 1.284 ms |
   | `/views/tasks?done=1` | 648 ms | 127 ms |
   | `/views/calendar` | 908 ms | 506 ms |
   | `/customers` | 599 ms | 411 ms |

   Thay đổi rẻ nhất, lợi lớn nhất. Đã hoàn lại sau khi đo; chưa áp dụng.

## 2. Máy chủ — truy vấn và bộ nhớ

| Mức | Chỗ | Vấn đề | Hướng sửa |
|---|---|---|---|
| Cao | `routes/views.ts` `/tasks` | Việc **đang mở** không giới hạn: trả mọi việc mở trong phạm vi, ~70 cột/dòng, 8 truy vấn con mỗi thẻ (56 MB ở 1x). | Phân trang theo con trỏ cho việc mở (giống `/tasks/older`); thu gọn cột (bỏ `description`, SĐT/email/Zalo người phụ trách khỏi danh sách — chỉ màn Cần nhắc dùng). |
| Cao | `client/.../ScheduleSection.tsx` | Ô "thêm việc phụ thuộc" trong cửa sổ thẻ tải **toàn bộ** việc mở (56 MB) chỉ để lọc tên lấy 8 kết quả. | Gọi `/views/tasks?done=0&q=…&limit=20`. Sửa nhỏ, lợi rất lớn. |
| Cao | `routes/views.ts` `attachLabels` | Đọc **cả bảng** `card_labels` mỗi lần gọi danh sách việc. | Lọc `WHERE card_id IN (…)` theo lô. |
| Cao | `routes/deals.ts` `/` | Trả mọi cơ hội (17 MB), nhóm theo giai đoạn trong JS. | Kanban theo trang mỗi cột; tổng tính bằng SQL riêng. |
| Cao | `routes/views.ts` `/calendar` | Mặc định `from=1970`, `to=2999` — không truyền khoảng là quét hết. | Bắt buộc khoảng ≤ 93 ngày. |
| Cao | `routes/revenues.ts` `/lines`, `/kpi` | Tải mọi dòng × 12 tháng, ghép trong JS (21 MB, 30 MB). | Phân trang dòng; lớp B (bảng rollup doanh thu) trong kế hoạch cũ. |
| Cao | `routes/customers.ts` `/` | ~15 truy vấn con thống kê **mỗi khách**, không phân trang. | Lớp A (`customer_stats`) trong kế hoạch cũ + phân trang. |
| Cao | `routes/ai.ts` trợ lý điền việc | Nạp **toàn bộ** khách, liên hệ, cơ hội, hợp đồng, báo giá, dự án rồi lọc trong JS cho mỗi lần hỏi. | Tìm theo `LIKE` + `LIMIT` trong SQL. |
| Cao | `routes/system.ts` xuất CSV | `.all()` + dựng chuỗi CSV trong RAM. | Ghi theo luồng như `/export` JSON. |
| TB | `lib/recordAccess.ts` (1.37.0) | Lọc thẻ / bảng theo quyền gọi 1 truy vấn mỗi dòng (bảng có ngoại lệ "việc giao cho mình", việc con). | Gộp một truy vấn cho cả lô. Hiện chỉ chạy khi người xem *không* sở hữu bảng nên ảnh hưởng nhỏ. |
| TB | `services/ai/textExtract.ts` | Đọc PDF/DOCX/XLSX đồng bộ, đổi base64 trên luồng chính. | `fs.promises`; tách sang worker. |
| TB | `views.ts` báo cáo hiệu suất | Khoảng ngày không giới hạn. | Giới hạn khoảng. |

## 3. Vận hành và khả năng mở rộng

| Mức | Chỗ | Vấn đề | Hướng sửa |
|---|---|---|---|
| Cao | `db/connection.ts` | Thiếu pragma (xem 1.3). | Thêm `synchronous=NORMAL` (an toàn với WAL), `cache_size`, `temp_store`, `mmap_size`, `busy_timeout`. |
| Cao | `app.ts` + `SqliteSessionStore` | `rolling: true` → mỗi request ghi `UPDATE sessions` vào SQLite. | Chỉ gia hạn phiên khi đã quá vài phút kể từ lần trước. |
| Cao | `services/ai/automations.ts` | Bộ hẹn giờ mỗi phút chạy tuần tự các automation quét toàn bảng trên luồng chính. | Giới hạn mỗi lượt; đo thời gian; về sau tách worker. |
| TB | `lib/responseCache.ts` | Mỗi lần không trúng đệm chuyển JSON **hai lần** (một để lưu, một để gửi). `lastFreshAt` tăng không giới hạn theo số khoá. *(Đính chính: "single-flight" không cần — các route có đệm chạy đồng bộ, request trùng khoá xếp hàng và trúng đệm của request trước.)* | Dùng lại chuỗi JSON đã tạo; dọn mốc cũ. |
| TB | Docker / Node | Không đặt giới hạn bộ nhớ container hay `--max-old-space-size`; không có `healthcheck`. | Đặt giới hạn + healthcheck; cảnh báo khi RSS cao. |
| TB | `nginx.conf` | Tệp tĩnh có hash nhưng không có `Cache-Control: immutable`; timeout 300 s cho mọi API; body 30 MB cho mọi đường dẫn trong khi JSON chỉ nhận 5 MB. | Cache dài cho `/assets`; timeout và giới hạn body theo nhóm đường dẫn. |
| TB | `googleContacts.ts` | Vòng đồng bộ danh bạ 30 phút không có khoá toàn cục, có thể chồng nhau. | Cờ `scanning` như Telegram. |

**Lộ trình mở rộng.** SQLite + một tiến trình Node vẫn đủ cho ~100 người dùng **nếu** mọi request thường
dùng giữ dưới ~200 ms và trả vài trăm KB. Việc nặng (xuất dữ liệu, AI quét, đọc tài liệu, tính rollup)
nên chuyển sang `worker_threads` với kết nối SQLite chỉ đọc riêng. Chỉ cần PostgreSQL khi phải chạy nhiều
bản máy chủ song song, nhiều luồng ghi đồng thời, hoặc dữ liệu vượt xa mức 2x.

## 4. Client

| Mức | Chỗ | Vấn đề | Hướng sửa |
|---|---|---|---|
| Cao | `DueReminderPopup.tsx` | Gọi máy chủ mỗi **20 giây, kể cả khi tab ẩn** (100 người = 5 request/giây nền). | Chỉ khi tab đang hiện; 60 giây. |
| Cao | `DocumentsLibrary.tsx` | Mở ô gắn liên kết tài liệu tải toàn bộ cơ hội / hợp đồng / báo giá. | Ô tìm kiếm có `limit`. |
| Cao | `BoardPage.tsx` dạng bảng | Tải mọi việc của bảng không phân trang. | Dùng chung cơ chế tải dần của màn Công việc. |
| Cao | `ListColumn.tsx`, `FeedPage.tsx` | Kanban và Bảng tin vẽ toàn bộ thẻ / bài đã tải, không ảo hoá. | Ảo hoá danh sách (`@tanstack/react-virtual`). |
| TB | `TasksWorkspace.tsx` hoạt động | Lịch sử hoạt động không giới hạn. | `limit` + tải thêm. |
| TB | `PostCard.tsx` | Dựng cây bình luận O(n²). | Gom theo `parent_id` một lần bằng `Map`. |
| Thấp | Feed / tài liệu | `invalidateQueries` quá rộng, poll điều hướng bảng tin 60 giây. | Thu hẹp khoá; chỉ poll khi tab hiện. |

Đã làm tốt: các trang tải chậm theo route (lazy), BlockNote / Excalidraw tách riêng, `staleTime` mặc
định 15 giây, màn Công việc và Tài liệu đã có tải dần.

## 5. Thứ tự đề xuất

**Đợt 1 — sửa nhanh, rủi ro thấp (1.37.1):**
1. Pragma SQLite (đã đo: nhanh hơn 30–80%).
2. `ScheduleSection` và ô liên kết tài liệu gọi tìm kiếm có `limit` thay vì tải toàn bộ.
3. `attachLabels` lọc theo lô.
4. Phiên đăng nhập chỉ gia hạn vài phút một lần.
5. Popup nhắc việc chỉ hỏi khi tab đang hiện, 60 giây.
6. `/views/calendar` bắt buộc khoảng ngày; lớp đệm bỏ chuyển JSON hai lần + dọn Map.
7. Cache dài cho tệp tĩnh ở nginx.

**Đợt 2 — thay đổi cấu trúc (1.38.0):**
1. Phân trang việc đang mở (`/views/tasks`) và thu gọn cột danh sách.
2. Kanban cơ hội theo trang mỗi cột; `/revenues/lines`, `/revenues/kpi` phân trang.
3. Lớp A (`customer_stats`) và lớp B (rollup doanh thu) theo `docs/PLAN-TINH-TRUOC-LUU-DEM.md`.
4. Ảo hoá Kanban và Bảng tin.

**Đợt 3 — tách việc nặng khỏi luồng chính:** worker cho xuất dữ liệu, AI automation, đọc tài liệu;
giới hạn bộ nhớ + healthcheck cho container; đưa pha tải đồng thời vào bộ đo định kỳ trước mỗi bản lớn.

Đo lại sau mỗi đợt bằng:

```bash
cd server && WORKFLOW_RESPONSE_CACHE=off BENCH_LOAD=20 BENCH_SECONDS=30 node --import tsx scripts/bench-large.mjs 1 /zzz
```

---

## 6. Kết quả sau 1.37.1 và 1.38.0

Cùng bộ đo: 20 người dùng ảo, 30 giây, đệm tắt, quyền toàn công ty, quy mô 1x. Vòng gọi của 1.38.0
dùng đúng cách client mới gọi (Công việc theo phần thay đổi, Pipeline 100 cơ hội mỗi cột).

| | Ban đầu | 1.37.1 | 1.38.0 |
|---|---|---|---|
| Công việc (p50) | 36,0 s | 32,1 s | 1,4–2,2 s |
| Pipeline (p50) | 10,4 s | 11,7 s | 1,7–3,3 s |
| Lịch (p50) | 12,5 s | 13,5 s | ~5 s |
| Request xử lý được trong 30 s | 160 | 160 | 320 |
| Event loop bị chặn tối đa | 32,6 s | 28,3 s | 7–10 s |
| RSS đỉnh (gồm client ảo) | 2,2 GB | 2,5 GB | 0,7–1,2 GB |

Gọi riêng từng API: Lịch 520 → 209 ms; danh sách Khách hàng (lần sau lần đầu) 165–178 ms.
Các lỗi "fetch failed" từng thấy trong pha tải là do client ảo dùng lại kết nối keep-alive mà
máy chủ đã đóng sau 5 giây im lặng; nới `keepAliveTimeout` trong bộ đo thì 0 lỗi. Thực tế nginx
mở kết nối mới tới app cho mỗi request nên không gặp.

Phần còn lại là thông lượng thô: mỗi "lượt" 8 màn tốn ~1,2 giây CPU máy chủ ở quyền toàn công ty;
20 người bấm liên tục thì xếp hàng. Thực tế lớp đệm 5 phút theo người dùng (tắt trong bộ đo) và nhân
viên có phạm vi hẹp làm con số này nhỏ hơn nhiều.

**Đã cân nhắc, chưa làm (kèm lý do):**
- **Lớp B (rollup doanh thu):** tổng doanh thu có đệm và sau pragma chỉ ~0,66 s lần đầu; KPI đã tải
  chi tiết theo kỳ (`entries=none` + `entries_period`). Lợi ích nhỏ so với rủi ro hai đường tính.
- **Phân trang `/revenues/lines`:** màn Doanh thu ít người dùng (admin doanh thu, quản lý), tổng các
  cột đang tính ở client từ toàn bộ dòng — đổi sang phân trang là thay đổi lớn về hành vi.
- **Ảo hoá Kanban:** cột đã giới hạn 50 thẻ từ 1.23.0. Bảng tin dùng `content-visibility: auto`
  thay vì thêm thư viện ảo hoá.
- **Trợ lý AI điền việc** vẫn nạp danh sách tên để dò trong câu; chi phí nhỏ so với thời gian gọi AI.

Bước tiếp theo nếu cần thêm: đưa Tổng quan / đếm việc sang bảng số liệu tính trước (cùng cơ chế
`stats_dirty` của lớp A), và cân nhắc nhiều tiến trình đọc khi số người dùng vượt ~100.

## 7. Đợt 1.38.1 — chỉ mục và truy vấn tổng hợp (migration v75)

Đo bằng `server/scripts/db-profile.mjs` (thời gian từng câu SQL của mỗi API, chỉ mục thừa, dung lượng,
chi phí ghi) trên CSDL thử 1x giữ lại bằng `BENCH_KEEP=1`. Đối chiếu kết quả trước/sau bằng
`server/scripts/db-compare.mjs`: mọi API giống hệt, trừ thứ tự các việc cùng hạn ở Tổng quan (trước đây
không xác định, nay cố định theo mã việc).

- Ghi đã rẻ (8–12 câu, dưới 10 ms gồm trigger v73/v74) — không cần làm gì.
- v75: chỉ mục một phần phủ cho việc mở `idx_cards_open_due`, việc xong theo `completed_at`
  `idx_cards_done_completed`; bỏ 6 chỉ mục trùng/tiền tố. `idx_calendar_events_remind` giữ (chỉ mục một phần).
- Bỏ bọc `substr()/date()` khi so ngày với hằng; tách tổng hợp mở/xong để dùng chỉ mục một phần.
- SQL thuần (1 lần gọi): đếm việc 151 → ~82 ms, Báo cáo 472 → ~265–311 ms, danh sách "cần nhắc" 772 → 338 ms.
  Tải 20 người: đếm việc p50 3,3 → 1,8 s; event loop chặn lâu nhất 9,3 → 5,8 s.
- Phát hiện kèm: bốn danh sách việc của Tổng quan thiếu lọc phạm vi (đã sửa + test trong `dataScope.test.ts`).
- Đã thử, không áp dụng: `ANALYZE`/`PRAGMA optimize` (kết quả lẫn lộn: bảng việc nhanh, tìm kiếm chậm đi);
  đổi `period LIKE` của doanh thu (chỉ ~4 ms — chi phí doanh thu nằm ở ghép ô tháng và 30 MB phản hồi, cần lớp B).
- Còn lại: Tổng quan vẫn ~220 ms vì ~25 câu (phần lớn là cơ hội) — ứng viên tiếp theo cho số liệu tính sẵn.
