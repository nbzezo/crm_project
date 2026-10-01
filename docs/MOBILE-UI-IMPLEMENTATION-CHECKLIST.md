# Checklist triển khai UI/UX mobile

Cập nhật: 2026-10-01. Tài liệu này là checklist thực thi; hướng dẫn gốc nằm ở
`C:\Users\tuand\Downloads\HUONG-DAN-CODEX-MOBILE.md`.

## Trạng thái

- `[x]` Đã triển khai và đã qua typecheck/UI guard.
- `[~]` Đã triển khai một phần, còn hạng mục nghiệm thu hoặc phạm vi phụ.
- `[ ]` Chưa triển khai.

## Đợt 1 — sửa nhanh

- [x] Task 1 — Kanban giữ cuộn native; MouseSensor/TouchSensor tách riêng; `touch-none` chỉ ở tay nắm.
- [x] Task 2 — Search dialog mobile full-screen, input dùng `tr-field-control`, nút Hủy, hàng kết quả tối thiểu 44px.
- [x] Task 3 — `viewport-fit=cover`, safe-area tokens, `useViewportInsets` và theo dõi bàn phím ảo.
- [x] Task 4 — Đã bỏ `uppercase`/`tracking-wide` trong toàn bộ TSX và thêm UI guard ngăn tái xuất hiện.
- [x] Task 5 — `kbd` chỉ hiện với `fine` pointer.

## Đợt 2 — khung điều hướng mobile

- [x] Task 6 — Tabbar 5 mục, badge, sheet Tạo nhanh, keyboard inset; Sidebar/MoreSheet dùng chung `navConfig.ts` và các sheet mobile dùng `BottomSheet` chung.
- [~] Task 7 — Topbar có title/search mobile và ẩn ở trang bảng; còn nghiệm thu avatar/chuông trên nhiều kích thước.
- [x] Task 8 — Popover tự đổi thành sheet trên màn cảm ứng hẹp, focus trap, safe-area.
- [~] Task 9 — Modal chung và CardModal full-screen dưới `sm`; còn rà tất cả modal tùy biến.
- [x] Task 10 — Header Tổng quan và KPI mobile gọn, cảnh báo quá hạn.

## Đợt 3 — Kanban mobile

- [~] Task 11 — BoardView/Pipeline snap ngang, bỏ snap khi kéo, chỉ báo cột; chưa thử kéo-thả trên máy thật.
- [x] Task 12 — Segmented dạng xem mobile, dock chỉ desktop.
- [x] Task 13 — Tên bảng/cột tĩnh trên cảm ứng, đổi tên qua menu.
- [x] Task 14 — `boardScrim` theo độ sáng; unit test toàn bộ màu nền đạt tương phản 4.5:1.
- [~] Task 15 — E2E mobile 5/5 ca đạt (tabbar/sheet, chống tràn, Topbar 44px, Settings, đổi tên cột); ca hồi quy desktop dự án–công việc cũng đạt. Chưa chạy trọn desktop suite và nghiệm thu máy thật; runner vẫn treo khi dừng server sau khi test đạt.

## Đợt 4 — theo mockup 1d–1f

- [x] Task 16 — Sheet Tất cả mục có nhóm, quyền, badge, bảng ghim, theme; dùng chung `navConfig.ts` và `BottomSheet`.
- [x] Task 17 — Tổng quan mobile: ngày/quá hạn, KPI, khuyến nghị, chevron.
- [~] Task 18 — Header bảng đặc màu, quay lại, thông tin phụ, menu chuyển cột; còn nghiệm thu thẻ và thao tác kéo.
- [~] Task 19 — Filter sheet có ô tìm, chip, xóa lọc và số thẻ khớp; còn rà UX tất cả nhóm lọc.
- [x] Task 20 — Tìm kiếm trống hiện 5 mục gần đây, lưu/xóa localStorage.

## Đợt 5 — lỗi dùng chung toàn app

- [x] Task 21 — Đã rà các nút hover-only, giữ thao tác luôn hiện trên cảm ứng và thêm UI guard ngăn `opacity-0 + group-hover` không có biến thể pointer.
- [x] Task 22 — Input/select/textarea và BlockNote tối thiểu 16px trên cảm ứng.
- [~] Task 23 — Nhiều control đã 44px; chưa hoàn tất quét tự động toàn app.
- [~] Task 24 — Một số nhãn đã đưa ra màn chi tiết; còn rà tooltip chỉ dùng hover.
- [x] Task 25 — Tabs ngang và Settings dạng danh sách → panel trên mobile.
- [~] Task 26 — Toast tránh tabbar và một số nhãn đã dọn; còn rà toàn app.

## Đợt 6 — Công việc và cửa sổ thẻ

- [x] Task 27 — Sidebar ẩn dưới `lg`, có selector phạm vi mobile, truy cập nhanh và header gọn.
- [x] Task 28 — Task list mobile dạng thẻ, nhóm thu gọn, nhấn giữ 400ms để chọn nhiều, action bar tránh tabbar.
- [x] Task 29 — Search toàn hàng, filter/sort/group trong sheet, chip lựa chọn và footer mobile.
- [~] Task 30 — Kanban/Lịch/TaskTree/TaskTable có biến thể mobile; còn kiểm tra cấp thụt lề và DnD trên máy thật.
- [~] Task 31 — Card modal full-screen, header cố định, thân cuộn, composer hoạt động dính đáy; còn nghiệm thu bàn phím ảo.
- [x] Task 32 — Segmented Chi tiết/Hoạt động, nút 44px với vòng hoàn thành 20px.

## Đợt 7 — CRM

- [x] Task 33 — Deal/Customer dùng chung `DetailHeader`; tiêu đề/meta xếp lại trên mobile và thao tác phụ nằm trong menu 44px.
- [x] Task 34 — Stepper cuộn ngang, nút 44px, tự căn giữa giai đoạn hiện tại.
- [x] Task 35 — Pipeline column snap theo viewport; mobile mặc định danh sách và lựa chọn dạng xem được lưu localStorage.
- [x] Task 36 — Revenue list 12 tháng, modal nhập mobile và menu trang chuyển trạng thái hàng loạt theo tháng.
- [~] Task 37 — OrgDirectory/Reports và Cơ hội/Báo giá/Hợp đồng/Dịch vụ trong Customer detail có thẻ mobile; các bảng ma trận Settings/thư viện tài liệu giữ cuộn nội bộ và còn nghiệm thu.

## Đợt 8 — phần còn lại

- [x] Task 38 — Gantt mobile có label 136px, hàng 44px, ẩn resize, zoom week và nút ẩn/hiện nhãn; khi ẩn, tên việc hiện trên thanh.
- [~] Task 39 — Quick Notes full-screen, một ghi chú một lúc, chip/danh sách mobile, tắt kéo/resize; còn nghiệm thu nhiều ghi chú.
- [~] Task 40 — Mindmap có toolbar cảm ứng theo API v5, Flowchart giới hạn chiều cao; còn nghiệm thu thao tác trên máy thật.
- [x] Task 41 — Assistant có composer theo keyboard inset, vùng chạm 44px, thao tác hội thoại luôn hiện trên cảm ứng và sao chép từng câu trả lời.
- [x] Task 42 — Login/Quên mật khẩu/Reset Password có safe-area, input phù hợp mobile và nút hiện/ẩn mật khẩu 44px.
- [x] Task 43 — BoardMenu full-screen, nút 44px; thẻ bảng có thao tác luôn hiện trên cảm ứng.

## Kiểm tra đã chạy

- [x] `npm run typecheck -w client`
- [x] `npm run check:ui`
- [x] `git diff --check`
- [x] `npm run lint` (sau khi loại cache E2E khỏi phạm vi ESLint)
- [x] `npm test -w client` — 45/45
- [x] `npm run build -w client`
- [x] Prettier các file TypeScript/TSX đã sửa
- [ ] `npm run format && npm run check` toàn repo (chưa chạy vì còn file đánh giá riêng của người dùng)
- [~] E2E mobile mới: 5/5 ca chạy đạt; ca desktop dự án–công việc đạt. Runner treo lúc dừng server, chưa xác nhận toàn bộ desktop suite
- [ ] Thử tay 360×780, 375×812, 390×844 và máy thật iPhone/Android
- [ ] Rà desktop 1440px và 4 theme
