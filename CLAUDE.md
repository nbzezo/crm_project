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

Claude vẫn viết mã; Codex chỉ thay phần "chân tay" khối lượng lớn. Chia việc theo số liệu đo ngày
2026-10-06: chi phí chính của Claude là **số lượt** (mỗi lượt đọc lại toàn bộ ngữ cảnh), không phải số dòng.

- **Claude tự làm:** thiết kế, máy chủ/CSDL/migration, phân quyền/bảo mật, lỗi khó, phát hành, git;
  việc nhỏ hoặc nằm trong phần mã vừa đọc (tự làm hết trong 1–2 lượt thì rẻ hơn giao); sửa lại
  khi Codex bị chặn hoặc kiểm tra trượt.
- **Giao Codex:** việc nhiều file, lặp lại, đặc tả rõ, có test giữ cửa, mà tự làm sẽ tốn từ khoảng
  3 lượt trở lên (phải đọc nhiều file chưa quen, sửa hàng loạt, viết test theo mẫu, chạy test dài).

1. Commit phần đang làm (Codex chỉ thấy `HEAD`), viết đặc tả vào file trong scratchpad: mục tiêu,
   file được sửa, điều kiện xong, kiểm tra cần chạy. Việc có sửa mã thì đặc tả phải nêu sẵn các
   trường hợp test (Codex tự viết test cho mã của chính nó thì test đạt chưa chắc mã đúng).
2. **Một lệnh, một lượt:**
   `pwsh scripts/codex.ps1 go -Slug <ten> -Spec <file> -Allow '<mẫu,...>' -Message '<commit>'`
   - chạy `codex exec` trong worktree `.codex-worktrees/<phiên>--<ten>` (sandbox `workspace-write`,
     Codex đọc `AGENTS.md`: không git, không migration, không tăng phiên bản);
   - chặn file cấm và file ngoài `-Allow`, chép vào worktree hiện tại, chạy tsc, vitest, test máy
     chủ (nếu đụng `server/`), eslint, prettier;
   - đạt thì tự commit và dọn. **Không đọc diff khi đạt.** Trượt hoặc bị chặn thì worktree Codex được
     giữ lại: lúc đó mới đọc diff, giao lại hoặc tự sửa (`run`/`apply`/`status` dùng riêng được).
3. Khi người dùng báo đóng phiên: `pwsh scripts/codex.ps1 clean` dọn worktree, nhánh và log Codex
   **của phiên này**. Việc còn thay đổi chưa apply thì bị bỏ qua và báo lại; chỉ thêm `-Force` khi
   người dùng đồng ý bỏ. Không dùng `-AllSessions` khi các phiên khác còn chạy.
4. Worktree dùng chung `node_modules` của repo chính: test máy chủ báo thiếu export từ
   `@workflow/contracts` thì build lại contracts ở repo chính (`npm run build -w @workflow/contracts`).

### Gỡ bỏ quy trình Codex (khi thấy không hiệu quả)

1. Dọn mọi việc Codex còn lại (đóng các phiên đang dùng Codex trước):
   `pwsh scripts/codex.ps1 clean -AllSessions -Force`, rồi xóa thư mục `.codex-worktrees/` ở gốc repo chính.
2. Xóa `scripts/codex.ps1`, `AGENTS.md`, mục "Giao việc cho Codex" (cả phần gỡ bỏ này) trong `CLAUDE.md`
   và dòng `.codex-worktrees/` trong `.gitignore`. Phát hành bản vá như mọi lần đẩy `main`.
3. Xóa bộ nhớ của Claude: file `codex-delegation-workflow.md` và dòng tương ứng trong `MEMORY.md` ở
   `C:\Users\tuand\.claude\projects\C--X1-Gen7---Document-Clone-Trello\memory\`.
   (Hoặc chỉ cần nói với Claude "gỡ quy trình Codex", Claude làm cả ba bước.)
Không cần gỡ Codex CLI; quy trình này không đổi cấu hình nào của Codex (`~/.codex`).
