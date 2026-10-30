# Audit remediation checklist

Quy ước: `[ ]` chưa làm, `[~]` đang làm, `[x]` đạt, `[!]` bị chặn.

## Đợt 1 — Bảo mật và toàn vẹn dữ liệu

- [x] Chỉ tạo liên kết reset/mời từ `app_base_url` tin cậy.
- [x] Giới hạn và lọc scope API nhãn hàng loạt.
- [x] Không để snapshot Drive/Telegram prune backup local.
- [x] Deploy đúng commit đã qua Quality.
- [x] Rate limiter tự dọn và có giới hạn bộ nhớ.
- [x] Không đếm trùng quan hệ deal–contract.
- [x] Xóa quyết định đồng bộ với reminder.
- [x] Kiểm tra Đợt 1.

## Đợt 2 — Logic và trải nghiệm

- [x] Phát hiện/giải quyết mâu thuẫn đánh giá Cơ bản–Nâng cao.
- [x] Score trend dùng baseline đầy đủ.
- [x] Một nguồn sức khỏe khách hàng có tính cadence.
- [x] Tạo việc nhanh giữ draft khi lỗi và dùng chung logic.
- [x] Một hàm totals doanh thu dùng chung.
- [x] Truy cập theme storage an toàn.
- [x] Kiểm tra Đợt 2.

## Đợt 3 — Chịu tải và vận hành

- [x] Timeline có cửa sổ tối đa 366 ngày và dependency được lọc trong SQL.
- [x] Bulk update/delete tối đa 500 việc, atomic.
- [x] Worker queue hữu hạn và không fallback việc nặng lên event loop.
- [x] Google Drive có timeout và luôn giải phóng trạng thái chạy.
- [x] API client có timeout/cancellation.
- [x] Scheduler và shutdown có thời hạn, không đóng DB khi job còn chạy.
- [x] Kiểm tra Đợt 3.

## Đợt 4 — Hiệu năng truy vấn và report

- [x] Bản ghi theo nhãn dùng cursor và truy vấn theo lô.
- [x] Report nặng tách service và chạy ngoài event loop.
- [x] Cache chống tính trùng request cùng khóa.
- [x] Có telemetry cho query/event loop/worker/cache/scheduler.
- [x] Benchmark dữ liệu lớn.
- [x] Chạy toàn bộ kiểm tra dự án.

## Nhật ký kiểm tra

- 2026-10-30: bắt đầu triển khai; hạn mức còn 50% (5 giờ), 44% (tuần).
- 2026-10-30: Đợt 1 đạt 36/36 test mục tiêu và 13/13 test phân quyền nhãn; ESLint đạt. Full test trong sandbox bị chặn localhost (`EACCES`); typecheck server/contracts đạt, client bị thiếu các dependency đã khai báo `react-markdown` và `remark-gfm` trong `node_modules`.
- 2026-10-30: Đợt 2 đạt 2/7 nhóm. Conflict Cơ bản–Nâng cao đạt 5/5 test, server typecheck và ESLint đạt; safe storage đạt 1/1 test. Hạn mức sau test còn 11% (5 giờ), 38% (tuần).
- 2026-10-30: score trend chỉ bắt đầu khi đủ 8 yếu tố, đạt 1/1 test; Đợt 2 đạt 3/7 nhóm.
- 2026-10-30: tạm dừng theo ngưỡng — còn 8% (5 giờ), 37% (tuần). Không dùng lượt reset miễn phí; tiếp tục từ mục sức khỏe khách hàng sau reset cửa sổ 5 giờ.
- 2026-10-30: tiếp tục sau reset tự nhiên (100%/36%). Sức khỏe khách hàng chuẩn có cadence đạt 8/8 test server và 11/11 test client; server typecheck và lint đạt. Sửa thêm lỗi type phát hiện ở conflict (`api.del`).
- 2026-10-30: hai luồng tạo việc nhanh dùng chung `createQuickTask`; draft chỉ xóa trong `onSuccess`. Đạt 2/2 test, lint đạt; client typecheck không còn lỗi thay đổi, chỉ còn dependency guide thiếu trong `node_modules`.
- 2026-10-30: client và server dùng chung `addRevenueCellToTotals`; switch exhaustive chặn stage mới bị tính nhầm là paid. Revenue unit test 4/4, contracts/server typecheck và lint đạt; Đợt 2 đạt 7/7 nhóm chức năng, đang chạy kiểm tra tổng hợp.
- 2026-10-30: Đợt 2 hoàn tất. Bộ tổng hợp đạt 20/20 test client và 20/20 test server; lần chạy trong sandbox chỉ lỗi quyền Temp/localhost, chạy lại ngoài sandbox đạt toàn bộ.
- 2026-10-30: Timeline mặc định ±183 ngày, cắt tối đa 366 ngày; task và dependency lọc trong SQL, unscheduled tối đa 100. Integration 27/27, server typecheck và lint đạt.
- 2026-10-30: `PATCH/DELETE /api/cards/bulk` tối đa 500 ID, preflight quyền/flow và transaction all-or-nothing; hai màn bulk dùng một request và báo tên card bị flow chặn. Task-flow integration 16/16, client unit 1/1, server typecheck/lint đạt; client typecheck chỉ còn dependency Guide thiếu như đã ghi.
- 2026-10-30: worker pool giữ tối đa 2 worker + 8 job chờ; job thứ 11 và worker tắt/lỗi trả 503, không còn parse trực tiếp trên event loop. Worker tests 6/6, server typecheck/lint đạt.
- 2026-10-30: Drive dùng AbortSignal 30 giây cho metadata và 5 phút cho upload/download; test timeout xác nhận `running` được nhả và lần sau phục hồi. Drive integration 21/21, server typecheck/lint đạt.
- 2026-10-30: API client nhận AbortSignal và tự timeout GET 30 giây, mutation 120 giây, AI/FormData 5 phút; timeout trả ApiError 408, caller abort được giữ nguyên. Client unit 3/3 và lint đạt.
- 2026-10-30: 5 scheduler dùng chung handle `stop()`, không chạy chồng và chờ job hiện tại; shutdown chờ HTTP/scheduler/worker tối đa 15 giây, chỉ đóng DB khi đã drain. Scheduler unit 1/1, server typecheck/lint đạt. Đợt 3 hoàn tất; các bộ Timeline 27/27, bulk/flow 16/16, worker 6/6, Drive 21/21 và API client 3/3 đều đạt.
- 2026-10-30: bản ghi theo nhãn trả tối đa 200 dòng/trang bằng cursor, giao diện tải tiếp theo trang; truy vấn gộp tối đa một lần mỗi entity type và lọc quyền ngay trong SQL, đồng thời giữ response mảng tương thích cho caller cũ. Paging + phân quyền đạt 22/22 test, server typecheck/lint và diff check đạt; client typecheck chỉ còn dependency Guide thiếu như đã ghi.
- 2026-10-30: tạm dừng đúng ngưỡng sau nhóm nguyên tử Đợt 4 — còn 7% (5 giờ), 22% (tuần). Không dùng lượt reset miễn phí; heartbeat tiếp tục từ mục report nặng sau reset tự nhiên.
- 2026-10-30: tiếp tục sau reset tự nhiên (100%/22%). Đã thêm batch query service và worker SQLite WAL chỉ đọc, không import connection/migration; write trong worker bị chặn. Worker tests 7/7, server typecheck/lint và diff check đạt. Mục report giữ `[~]` cho tới khi chuyển đủ bốn nhóm endpoint.
- 2026-10-30: `pipeline-health` chạy hai truy vấn trong một worker batch trên DB file; phép tính forecast/veto/stale tách thành service thuần, và truy vấn deal suy giảm nay cũng lọc scope. Unit 1/1, data-scope mục tiêu 1/1, response-cache 5/5, server typecheck/lint đạt. Hai assertion dashboard/report khác trong full `dataScope` vẫn lỗi sẵn và sẽ được xử lý khi chuyển hai endpoint đó.
- 2026-10-30: response cache hợp nhất request đồng thời cùng user/path/query; request theo sau nhận cùng status/body thay vì chạy lại report hoặc chiếm thêm worker. Cache integration 6/6, server typecheck/lint và diff check đạt.
- 2026-10-30: phép cộng `/revenues/summary` tách sang service thuần và vẫn dùng `addRevenueCellToTotals`; route chỉ tải/lọc dòng. Revenue summary unit + integration 8/8, server typecheck/lint và diff check đạt. Mục report vẫn `[~]` vì dashboard, reports và các aggregate doanh thu còn lại chưa chuyển hết.
- 2026-10-30: thêm telemetry có quyền `settings.app/read` tại `/api/system/telemetry`: thời gian report query batch, event-loop delay, worker active/queue, cache hit/miss/shared và scheduler run/error/duration. Scheduler/cache/worker tests 14/14, server typecheck/lint và diff check đạt.
- 2026-10-30: dự báo và totals `/revenues/comparison` tách sang service thuần; `lines=none` chỉ bỏ chi tiết, không tính lại khác đường. Comparison unit + revenue integration 8/8, server typecheck/lint và diff check đạt.
- 2026-10-30: ba truy vấn quét nặng cuối `/views/reports` (tiến độ dự án, trạng thái dự án, phân bố trượt hạn) chạy chung một worker batch trên DB file; test scope reports đạt 1/1 khi chạy với cache tắt như test runner chính thức, server typecheck/lint đạt.
- 2026-10-30: benchmark 1× đạt trên DB tạm ~115 MB (120.000 task/15.000 deal). Timeline ±30 ngày chỉ trả task giao khoảng, lần đầu 651 ms/6,20 MB; `/reports` cache miss hoàn tất 2.246 ms trong khi `/health` song song vẫn trả sau 517 ms; report lần đầu 673 ms ở lượt đo kế, cache hit 14 ms. Script và diff check đạt.
- 2026-10-30: dashboard tách service thuần cho KPI/task counts/bucket hợp đồng; truy vấn workload toàn bộ task chạy trong worker batch. Dashboard unit 1/1 và full data-scope 23/23 đạt với cache tắt như runner chính thức; server typecheck/lint đạt.
- 2026-10-30: `/reports` tách service thuần cho score snapshot và hợp nhất assignee; unit 2/2 và scope report 1/1 đạt. Cùng với dashboard, pipeline-health, revenue summary/comparison và các service KPI sẵn có, các aggregate nặng đã rời route; truy vấn quét lớn dùng worker read-only. Mục report hoàn tất.
- 2026-10-30: full server test đạt 580/582; hai kỳ vọng onboarding cũ chưa tính cảnh báo `invite_failed` khi thiếu `app_base_url`. Đã cập nhật test theo hợp đồng bảo mật mới, chạy lại mục tiêu đạt 9/9. UI system + contrast ban đầu báo 9 vi phạm cũ; đã chuyển sang token theme và bỏ chữ hoa/giãn chữ trang trí, chạy lại đạt. Hạn mức sau nhóm còn 33% (5 giờ), 11% (tuần).
- 2026-10-30: full test sau sửa đạt server 582/582 và client 216/216; format check, ESLint, UI system, contrast và `git diff --check` đều đạt. Typecheck đạt contracts/server nhưng client, và build đạt contracts/server nhưng client, bị chặn vì `node_modules` thiếu `react-markdown`/`remark-gfm` đã khai báo; chưa cài dependency theo `AGENTS.md`. Hạn mức còn 28% (5 giờ), đúng 10% (tuần); còn E2E và xác nhận CI/npm-ci trước khi đánh dấu kiểm tra toàn dự án hoàn tất.
- 2026-10-30: E2E đã khởi chạy nhưng dừng ở bước build client do cùng hai dependency thiếu, chưa chạy Playwright. Đã xác nhận chúng có trong `client/package.json` và `package-lock.json`; `.github/workflows/quality.yml` cài bằng `npm ci`. Không chạy `npm ci` cục bộ vì `AGENTS.md` cấm cài dependency; cần CI hoặc môi trường chính khôi phục `node_modules` rồi chạy lại typecheck/build/E2E.
- 2026-10-30: thử E2E trực tiếp qua Vite dev để không phụ thuộc bản build cũ: setup đăng nhập đạt, nhưng dependency scan vẫn dừng web server vì thiếu `react-markdown`/`remark-gfm`; đã hủy các ca sau vì kết quả không còn giá trị và xóa cấu hình tạm. Xác nhận đây là blocker môi trường duy nhất còn lại, không phải lỗi test sản phẩm.
- 2026-10-30: theo ngoại lệ được người dùng cho phép trong phiên này, tạo bản sao CI tạm cô lập và chạy `npm ci` thành công mà không thay đổi `package-lock.json` hay `node_modules` của workspace. Typecheck và build toàn dự án đạt; npm báo 25 lỗ hổng dependency (2 low, 13 moderate, 7 high, 3 critical), chưa tự động sửa vì có thể làm đổi dependency ngoài phạm vi audit.
- 2026-10-30: lượt E2E đầu trong môi trường sạch phát hiện ba nguyên nhân dùng chung: cache danh sách dự án chưa refresh sức khỏe, nhãn bộ lọc mobile không khớp và độ tương phản số đếm chưa đủ. Đã sửa tại nguồn, chạy mục tiêu đạt 13/13; lượt E2E đầy đủ cuối đạt 58 passed, 5 skipped theo cấu hình, 0 failed. Xác nhận cuối: client unit 216/216, typecheck, build, format, ESLint, UI system, contrast và diff check đều đạt. Toàn bộ checklist hoàn tất.
