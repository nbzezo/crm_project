# Hướng dẫn dự án WorkFlow CRM

## Mỗi lần phát hành phải cập nhật phiên bản và mô tả

Mọi cập nhật đẩy lên `main` đều phải kèm một bản phát hành mới, giống release note trên GitHub.
Bản phát hành hiển thị ở **Cài đặt → Giới thiệu**.

Trước khi đẩy, làm đủ cả ba việc:

1. **Tăng số phiên bản** (semver) ở bốn chỗ, luôn cùng một số:
   - `package.json` (gốc), `client/package.json`
   - `package-lock.json`: dòng `version` ở đầu file, trong khối `""` và trong khối `"client"`
2. **Thêm ghi chú ở ĐẦU danh sách `RELEASE_NOTES`** trong `client/src/lib/appRelease.ts`:
   `version`, `date` (YYYY-MM-DD), `title` ngắn, `changes` là các gạch đầu dòng bằng tiếng Việt
   mô tả điều người dùng thấy được. Cập nhật `APP_UPDATED_AT` thành cùng ngày.
3. **Nêu rõ trong tin nhắn commit** số phiên bản mới, và nếu có migration thì số migration.

Quy ước tăng số: tính năng mới → tăng số giữa (1.3.0 → 1.4.0); sửa lỗi hoặc chỉnh nhỏ →
tăng số cuối (1.3.0 → 1.3.1); thay đổi phá vỡ → tăng số đầu.

Nếu `main` có thêm commit từ nơi khác trước khi đẩy, hợp nhất `main` trước rồi lấy số phiên bản
kế tiếp, gộp ghi chú của các thay đổi chưa có trong `RELEASE_NOTES`.

## Migration CSDL

- Migration chạy tự động khi máy chủ khởi động; đẩy `main` là deploy thẳng lên production.
- Trước khi thêm `migrate-vNN.sql`, kiểm tra `LATEST_VERSION` trong `server/src/db/migrate.ts` **trên
  `main` mới nhất** (`git fetch`), vì nhiều nhánh có thể cùng lấy một số.
- Mỗi migration kèm `migrate-vNN-rollback.sql` và một dòng trong `server/src/db/rollback.ts`.
- Bảng dữ liệu nghiệp vụ mới phải có trong `EXPORT_TABLES` (`server/src/routes/system.ts`); bảng
  riêng tư hoặc chứa token thì khai báo trong `NON_BUSINESS` ở `server/src/test/exportTables.test.ts`,
  kèm lý do.

## Chạy kiểm tra

- Máy chủ: `cd server && node scripts/run-tests.mjs`
- Giao diện: `cd client && npx tsc --noEmit -p tsconfig.json && npx vitest run`
- Lint: `npx eslint client/src server/src`
