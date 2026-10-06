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

## Giao việc cho Codex (chạy local)

Việc **khối lượng lớn, lặp lại, dễ kiểm chứng** thì Claude giao cho Codex CLI, còn Claude giữ phần
khó và việc duyệt. Ví dụ việc nên giao: viết test theo mẫu, sửa lint hàng loạt, đổi tên/thay chuỗi
nhiều file, chuỗi giao diện, dữ liệu mẫu, chạy test dài và tóm tắt lỗi.
Claude tự làm: thiết kế, migration, phân quyền/bảo mật, lỗi khó, phát hành, mọi thao tác git.
Việc chỉ vài dòng thì tự làm, giao còn chậm hơn.

1. Commit phần đang làm (Codex chỉ thấy `HEAD`), viết đặc tả vào file trong scratchpad: mục tiêu,
   file được sửa, điều kiện xong, kiểm tra cần chạy.
2. `pwsh scripts/codex.ps1 run -Slug <ten> -Spec <file>`: tạo worktree `.codex-worktrees/<phiên>--<ten>`,
   chạy `codex exec` sandbox `workspace-write`, in báo cáo và `diff --stat`. Chạy ngầm nếu lâu.
   Codex đọc `AGENTS.md` (không git, không migration, không tăng phiên bản).
3. Claude đọc toàn bộ diff trong worktree đó. Đạt thì `pwsh scripts/codex.ps1 apply -Slug <ten>`
   (đưa vào worktree hiện tại, đã stage), rồi tự chạy kiểm tra ở trên và commit. Không đạt thì
   giao lại kèm lý do hoặc tự sửa.
4. Khi người dùng báo đóng phiên: `pwsh scripts/codex.ps1 clean` dọn worktree, nhánh và log Codex
   **của phiên này**. Việc còn thay đổi chưa apply thì bị bỏ qua và báo lại; chỉ thêm `-Force` khi
   người dùng đồng ý bỏ. Không dùng `-AllSessions` khi các phiên khác còn chạy.
