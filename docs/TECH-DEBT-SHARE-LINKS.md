# Nợ kỹ thuật: chia sẻ bằng link công khai (v51, v52)

Tính năng đã có: nút **Chia sẻ (cho phép xem)** cho **tài liệu (tệp tải lên), trang tài liệu, báo giá, hợp đồng**. Link công khai chỉ xem, có hạn dùng (gia hạn được), mật khẩu, chặn tải về, cố định phiên bản, nhật ký lượt mở (giữ 180 ngày), thu hồi. Mã nguồn chính:
`server/src/services/shareService.ts`, `server/src/services/shareBlocks.ts`, `server/src/routes/shares.ts`, `server/src/routes/publicShare.ts`, `client/src/components/share/ShareButton.tsx`, `client/src/pages/PublicSharePage.tsx`.

## Chưa làm (theo thứ tự nên làm)

1. **Mở rộng sang dự án, cơ hội, khách hàng, bảng công việc, báo cáo.**
   Từ v52 cột `share_links.entity_type` **không còn CHECK**, nên thêm loại mới **không cần migration**: thêm vào `SHARE_ENTITY_TYPES`, `SHARE_RESOURCE` và một nhánh trong `loadEntity()` (và nhánh lấy khách hàng/cơ hội cho nhắc việc trong `publicShare.ts`). Với màn hình tổng hợp (báo cáo, bảng) phải quyết định trước: chụp ảnh lúc chia sẻ hay xem trực tiếp. Mỗi loại cần danh sách trường được phép hiện; trang công khai không bao giờ nhận bản ghi thô.
2. **Mã QR** trong hộp thoại chia sẻ. Cần thêm một thư viện nhỏ (ví dụ `qrcode-generator`) vào `client/package.json`.
3. **Khối tùy chỉnh của trang tài liệu chưa hiện ra ngoài.** Sơ đồ (flowchart), mindmap, ảnh, tệp nhúng trong trang hiện chỉ hiện dòng "(Nội dung này chỉ xem được trong CRM)". Muốn hiện cần bộ vẽ chỉ-đọc riêng cho từng khối (`shareBlocks.ts` + `PublicSharePage.tsx`); mindmap có thể đổi sang danh sách lồng nhau, sơ đồ cần xuất SVG.
4. **Gắn nút Chia sẻ vào các chỗ còn thiếu:** form sửa báo giá (`QuotationForm`, tránh mở hộp thoại chồng hộp thoại), ngăn thuộc tính tài liệu (`DocumentMetadataDrawer`), danh sách trang trong `MeetingNotesPanel`. Hiện có ở: dòng tài liệu, đầu trình soạn trang, dòng báo giá/hợp đồng trong trang khách hàng, menu trang Hợp đồng.
5. **Kiểm thử giao diện:** chưa có e2e Playwright cho luồng tạo link, mở `/s/<mã>`, nhập mật khẩu, thu hồi. Phần máy chủ có test (`server/src/test/shareLinks.test.ts`), giao diện mới chỉ qua typecheck và build, chưa xem bằng mắt.

## Hạn chế đã biết (chấp nhận có chủ đích, nên xem lại)

- **Nhắc theo dõi khi khách mở lần đầu** dùng bảng `reminders`, bảng này không có người sở hữu nên ai có quyền cũng thấy nhắc. Muốn nhắc riêng cho người chia sẻ cần thêm `owner_user_id` vào nhắc việc hoặc dùng trung tâm thông báo.
- **Quyền tạo link với tài liệu và trang tài liệu** chỉ kiểm quyền tính năng (`documents:update`, `notes:update`), không kiểm phạm vi dữ liệu, vì hai loại này hiện không được lọc theo phạm vi ở các route của chúng. Báo giá và hợp đồng thì kiểm cả phạm vi. Nếu sau này trang tài liệu được lọc theo `owner_contact_id`, phải thêm kiểm phạm vi ở `assertEntityAccess()` trong `shares.ts`.
- **Mã mở khóa của link có mật khẩu** gửi qua `?a=` khi xem tệp (iframe/ảnh không đặt được header). Mã sống 1 giờ và gắn với mật khẩu hiện tại, nhưng có thể nằm trong log nginx. Cách sửa gọn: tải tệp bằng `fetch` kèm header rồi hiện qua `blob:` URL.
- **Giới hạn tốc độ nằm trong bộ nhớ** (`server/src/lib/rateLimit.ts`), mất khi khởi động lại. Đủ vì CRM chạy một tiến trình, sẽ phải đổi nếu chạy nhiều bản.
- **Nhật ký lượt mở lưu IP và user-agent** của người ngoài. Đã có thời hạn 180 ngày (dọn khi có người tạo link mới) và dòng thông báo trên trang công khai. Chưa có cấu hình thời hạn trong Cài đặt.
- Ở chế độ **chỉ xem**, tệp Word/Excel/PowerPoint không xem được trực tiếp (trình duyệt không hiển thị). Muốn xem được cần chuyển sang PDF phía máy chủ.
- Link **không xem lại được** sau khi tạo (CSDL chỉ giữ bản băm, cố ý). Quên link thì tạo link mới và thu hồi link cũ.
- Mục **Đã chia sẻ** nằm trong nhóm "Dự án" của thanh bên, chưa có vị trí riêng.

## Môi trường chạy test cục bộ (không phải lỗi của tính năng)

- Máy dev thiếu gói `exceljs`, nên các test import Excel và toàn bộ server không khởi động được nếu không `npm install` lại ở thư mục gốc.
- `@workflow/contracts` trong `node_modules` có thể trỏ về một bản checkout khác của repo. Khi làm việc trong worktree, các export mới của `packages/contracts` (ví dụ `normalizeOrgName`) có thể "không tồn tại". Chạy `npm install` ở thư mục gốc của worktree hoặc dùng bản checkout chính.

## Số phiên bản schema

Đã dùng đến **v52**. Migration kế tiếp là **v53**. Khi cùng lúc có nhiều nhánh, kiểm `LATEST_VERSION` trên `origin/main` trước khi đặt số; v50 từng bị trùng với đợt chuẩn hóa tên tổ chức và phải đổi số lúc hợp nhất.
