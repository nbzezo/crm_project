# Hướng dẫn cho tác tử được giao việc (Codex và các CLI khác)

Bạn đang làm một việc nhỏ do Claude giao, trong một worktree riêng. Claude sẽ đọc lại toàn bộ
thay đổi, chạy kiểm tra rồi mới đưa vào nhánh chính. Dự án là WorkFlow CRM (Node/TypeScript,
`server/` + `client/` + `packages/`). Quy ước chung nằm trong `CLAUDE.md`.

## Tuyệt đối không

- Không `git commit`, `git push`, `git merge`, `git rebase`, `git stash`, không tạo hay xóa nhánh.
  Chỉ sửa file; Claude lo phần git.
- Không thêm hay sửa migration (`server/src/db/migrate*.sql`, `migrate.ts`, `rollback.ts`).
  Đẩy `main` là deploy thẳng lên production và migration tự chạy.
- Không tăng số phiên bản, không sửa `RELEASE_NOTES` / `APP_UPDATED_AT`, `package-lock.json`.
- Không đọc, in ra hay sửa `.env*`, `server/data/`, bản sao lưu, token, khóa API.
- Không `npm install` / thêm thư viện. `node_modules` là liên kết tới repo chính, chỉ dùng để chạy.
- Không sửa file ngoài phạm vi đặc tả nêu. Thấy cần sửa thêm thì ghi vào báo cáo, đừng tự làm.

## Cách làm

- Bắt chước mã xung quanh: cách đặt tên, mật độ chú thích, kiểu import. Chuỗi giao diện bằng tiếng Việt.
- Kiểm tra trước khi báo xong (chạy phần liên quan tới thay đổi):
  - Máy chủ: `cd server && node scripts/run-tests.mjs`
  - Giao diện: `cd client && npx tsc --noEmit -p tsconfig.json && npx vitest run`
  - Lint: `npx eslint client/src server/src`
- Không chạy được kiểm tra nào thì ghi rõ lý do, đừng bỏ qua im lặng.

## Báo cáo cuối cùng (tin nhắn cuối)

Ngắn gọn, tiếng Việt:
1. Đã làm gì, danh sách file đã sửa.
2. Kiểm tra đã chạy và kết quả (đạt / lỗi, trích dòng lỗi nếu có).
3. Điểm chưa chắc chắn hoặc việc còn lại cho Claude quyết.
