# Nợ kỹ thuật: chia sẻ bằng link công khai (v51)

Tính năng đã có: nút **Chia sẻ (cho phép xem)** cho tài liệu, báo giá, hợp đồng. Link công khai chỉ xem, có hạn dùng, mật khẩu, chặn tải về, cố định phiên bản, nhật ký lượt mở, thu hồi. Mã nguồn chính:
`server/src/services/shareService.ts`, `server/src/routes/shares.ts`, `server/src/routes/publicShare.ts`, `client/src/components/share/ShareButton.tsx`, `client/src/pages/PublicSharePage.tsx`.

## Chưa làm (theo thứ tự nên làm)

1. **Mở rộng sang dự án, cơ hội, khách hàng, bảng công việc, báo cáo.**
   Cột `share_links.entity_type` có `CHECK` nên cần migration **v52** thay bảng (cùng khuôn v36/v39: tắt khóa ngoại, tạo bảng mới, chép dữ liệu, `foreign_key_check`). Thêm loại mới = thêm vào `SHARE_ENTITY_TYPES`, `SHARE_RESOURCE` và nhánh trong `loadEntity()`. Với màn hình tổng hợp (báo cáo, bảng) phải quyết định trước: chụp ảnh tại thời điểm chia sẻ hay xem trực tiếp. Mỗi loại cần danh sách trường được phép hiện, vì trang công khai không bao giờ nhận bản ghi thô.
2. **Mã QR** trong hộp thoại chia sẻ. Cần thêm một thư viện nhỏ (ví dụ `qrcode-generator`) vào `client/package.json`.
3. **Gắn nút Chia sẻ vào các chỗ còn thiếu:** form sửa báo giá (`QuotationForm`, tránh mở hộp thoại chồng hộp thoại), trang chi tiết cơ hội, `DocumentMetadataDrawer`, thẻ trên bảng công việc. Hiện có ở dòng tài liệu, dòng báo giá/hợp đồng trong trang khách hàng, và menu trang Hợp đồng.
4. **Kiểm thử giao diện:** chưa có e2e Playwright cho luồng tạo link, mở `/s/<mã>`, nhập mật khẩu, thu hồi. Phần máy chủ có test (`server/src/test/shareLinks.test.ts`), giao diện mới chỉ qua typecheck và build, chưa xem bằng mắt.
5. **Kéo dài hạn / sửa link đã tạo:** hiện chỉ thu hồi rồi tạo link mới. Link không xem lại được vì CSDL chỉ giữ bản băm (cố ý), nên "gửi lại link cũ" là không thể.

## Hạn chế đã biết (chấp nhận có chủ đích, nên xem lại)

- **Nhắc theo dõi khi khách mở lần đầu** dùng bảng `reminders`, bảng này không có người sở hữu nên ai có quyền cũng thấy nhắc. Muốn nhắc riêng cho người chia sẻ cần thêm `owner_user_id` vào nhắc việc hoặc dùng trung tâm thông báo.
- **Quyền tạo link với tài liệu** chỉ kiểm quyền tính năng `documents:update`, không kiểm phạm vi dữ liệu, vì tài liệu không có người phụ trách riêng. Báo giá và hợp đồng thì kiểm cả phạm vi.
- **Mã mở khóa của link có mật khẩu** gửi qua `?a=` khi xem tệp (iframe/ảnh không đặt được header). Mã sống 1 giờ và gắn với mật khẩu hiện tại, nhưng có thể nằm trong log nginx.
- **Giới hạn tốc độ nằm trong bộ nhớ** (`server/src/lib/rateLimit.ts`), mất khi khởi động lại. Đủ vì CRM chạy một tiến trình, sẽ phải đổi nếu chạy nhiều bản.
- **Nhật ký lượt mở lưu IP và user-agent** của người ngoài. Nếu cần tuân thủ quy định dữ liệu cá nhân, nên có thời hạn xóa nhật ký và một dòng thông báo trên trang công khai.
- Ở chế độ **chỉ xem**, tệp Word/Excel/PowerPoint không xem được trực tiếp (trình duyệt không hiển thị). Muốn xem được cần chuyển sang PDF phía máy chủ.
- Mục **Đã chia sẻ** nằm trong nhóm "Dự án" của thanh bên, chưa có vị trí riêng.

## Môi trường chạy test cục bộ (không phải lỗi của tính năng)

- Máy dev thiếu gói `exceljs`, nên các test import Excel và toàn bộ server không khởi động được nếu không `npm install` lại ở thư mục gốc.
- `@workflow/contracts` trong `node_modules` có thể trỏ về một bản checkout khác của repo. Khi làm việc trong worktree, các export mới của `packages/contracts` (ví dụ `normalizeOrgName`) có thể "không tồn tại". Chạy `npm install` ở thư mục gốc của worktree hoặc dùng bản checkout chính.

## Số phiên bản schema

Đã dùng đến **v51**. Migration kế tiếp là **v52**. Khi cùng lúc có nhiều nhánh, kiểm `LATEST_VERSION` trên `origin/main` trước khi đặt số; lần này v50 bị trùng với đợt chuẩn hóa tên tổ chức và phải đổi số lúc hợp nhất.
