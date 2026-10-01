# Phương án: Gán vị trí/quyền khi tạo người dùng + Kết nối nhanh Gmail/Outlook

Nhánh: `claude/trusting-fermat-tc9nu9` (tách từ `main` @ 72ac344)

## 1. Hiện trạng

### 1.1 Thêm người dùng mới — CHƯA chọn vị trí / phân quyền

- Form "Thêm người dùng" (`client/src/components/settings/UserSettings.tsx`) chỉ có:
  Email, Họ tên, Gắn với người trong sổ danh bạ.
- `POST /api/users` (`server/src/routes/users.ts`) chỉ nhận `email`, `full_name`,
  `username`, `contact_id`.
- Backend ĐÃ có API gán vị trí: `GET/PUT /api/positions/assignments/:userId`
  (`server/src/routes/positions.ts`), có kiểm tra `assertAdminRemains()` và
  `bumpPermissionsVersion()` — nhưng **không màn hình nào gọi tới**.
- Ma trận quyền mặc định là CẤM (v39: không có dòng = `none`). Hệ quả: tài khoản
  mới kích hoạt xong đăng nhập vào gần như bị 403 mọi chức năng, và quản trị viên
  không có cách gán vị trí từ giao diện.
- Đơn vị (phòng/khối) không nằm trên user mà ở `contacts.org_unit_id` — chỉ xếp
  được từ màn Danh bạ (`ContactList.tsx` → `POST /api/org-units/members`).

### 1.2 Cấu hình email — CHƯA có kết nối nhanh Gmail/Outlook

- `EmailSettings.tsx` + `emailService.ts` chỉ là SMTP thuần (host, port,
  STARTTLS/TLS, username, password mã hoá bằng `encryptSecret`).
- Không có preset nhà cung cấp, không có OAuth2. Muốn dùng Gmail phải tự nhập
  `smtp.gmail.com:587` + App Password (bắt buộc bật 2FA). Outlook/Microsoft 365
  phải nhập `smtp.office365.com:587`, và Microsoft đang tắt dần Basic Auth SMTP
  cho tenant doanh nghiệp → nhiều tenant sẽ không gửi được.

## 2. Phương án cập nhật

### Giai đoạn A — Vị trí & quyền khi tạo / sửa người dùng (ưu tiên cao)

**Backend**
1. `createSchema` của `POST /api/users` thêm:
   - `positions: [{ position_id, scope_unit_id?, is_primary? }]` (tối đa 20, không trùng).
   - `org_unit_id?` — chỉ áp dụng khi có `contact_id`; ghi vào `contacts.org_unit_id`.
2. Tách logic ghi `user_positions` trong `routes/positions.ts` thành service
   `setUserPositions(userId, rows)` (trong `services/auth/orgService.ts`) để
   `users.ts` và `positions.ts` dùng chung — một nguồn duy nhất, giữ nguyên
   `assertAdminRemains()` + `bumpPermissionsVersion()`.
3. Tạo user + gán vị trí + xếp đơn vị chạy trong **một transaction**; gửi thư mời
   chạy SAU khi commit (lỗi SMTP không được làm mất tài khoản đã tạo).
4. `listUsers()` trả thêm `positions` (tên vị trí, cờ chính) và `org_unit_name`
   để bảng hiển thị.
5. Quyền: tạo user cần `admin.users:update`; gán vị trí giữ nguyên yêu cầu quyền
   `admin.positions:update`, xếp đơn vị cần `admin.org:update` — kiểm tra đủ để người chỉ quản lý
   tài khoản không tự nâng quyền cho người khác.
6. Cảnh báo (không chặn) khi tạo user không có vị trí nào: trả `warnings: ['no_position']`.

**Frontend**
1. Form "Thêm người dùng": thêm
   - Multi-select **Vị trí** (từ `GET /api/positions`), chọn 1 vị trí chính.
   - Select **Đơn vị** (từ `GET /api/org-units`), bật khi đã chọn người trong danh bạ.
   - Ô tuỳ chọn "Kiêm nhiệm đơn vị khác" (`scope_unit_id`) — ẩn trong mục "Nâng cao".
   - Xem trước quyền (read-only) của vị trí đã chọn, dùng `GET /api/positions/:id/permissions`.
2. Bảng người dùng: thêm cột "Vị trí" và "Đơn vị"; nút **Sửa vị trí** mở dialog
   gọi `PUT /api/positions/assignments/:userId`.
3. Chuỗi i18n mới trong `client/src/i18n/vi.ts` (`t.users.positions`, ...).

**Kiểm thử**
- Server: tạo user kèm vị trí → `loadPermissions` đúng; vị trí trùng → 400;
  bỏ vị trí admin cuối cùng → bị chặn; người không có `admin.positions` → 403.
- E2E (Playwright): tạo user với vị trí "Nhân viên", kích hoạt, đăng nhập, thấy đúng menu.

### Giai đoạn B — Preset Gmail / Outlook (nhanh, ít rủi ro)

1. `EmailSettings.tsx` thêm hàng nút **Gmail / Outlook – Microsoft 365 / Outlook.com / Tuỳ chỉnh**
   tự điền:
   | Nhà cung cấp | Host | Port | Bảo mật |
   |---|---|---|---|
   | Gmail / Google Workspace | smtp.gmail.com | 587 | STARTTLS |
   | Microsoft 365 | smtp.office365.com | 587 | STARTTLS |
   | Outlook.com / Hotmail | smtp-mail.outlook.com | 587 | STARTTLS |
2. Khi chọn preset: `username` = `from_email`, hiển thị hướng dẫn tạo **App Password**
   kèm link (Google: myaccount.google.com/apppasswords; Microsoft: bật SMTP AUTH cho hộp thư).
3. Bắt lỗi thường gặp từ nodemailer và dịch sang tiếng Việt dễ hiểu
   (`535 5.7.8` Gmail sai App Password; `5.7.139 SmtpClientAuthentication is disabled` Microsoft).
4. Lưu `provider` (`custom|gmail|microsoft|outlook`) — migration v47 thêm cột
   `email_settings.provider TEXT NOT NULL DEFAULT 'custom'` (+ file rollback).

### Giai đoạn C — Đăng nhập OAuth2 ("Kết nối với Google / Microsoft")

Cần khi tenant Microsoft 365 đã tắt Basic Auth, hoặc công ty không cho dùng App Password.

1. Migration: `email_settings` thêm `auth_type ('password'|'oauth2')`,
   `oauth_client_id`, `oauth_client_secret_*` (mã hoá), `oauth_refresh_token_*` (mã hoá),
   `oauth_tenant` (Microsoft), `oauth_account`.
2. Route mới:
   - `GET /api/email/oauth/:provider/start` → redirect tới trang đồng ý
     (Google scope `https://mail.google.com/`; Microsoft scope
     `https://outlook.office.com/SMTP.Send offline_access`), có `state` chống CSRF lưu theo phiên.
   - `GET /api/email/oauth/:provider/callback` → đổi code lấy refresh token, lưu mã hoá.
3. `createTransport` dùng `auth: { type: 'OAuth2', user, clientId, clientSecret, refreshToken }`
   (nodemailer hỗ trợ sẵn, tự làm mới access token). Với Microsoft dùng `accessUrl`
   theo tenant.
4. Quản trị viên phải tự tạo OAuth client (Google Cloud Console / Azure App Registration)
   và khai báo redirect URI = `{app_base_url}/api/email/oauth/{provider}/callback`
   → màn cài đặt hiển thị sẵn URI này để copy.
5. Nút "Ngắt kết nối" xoá refresh token; `last_error` hiển thị khi token bị thu hồi.

## 3. Thứ tự đề xuất

1. **A** (chặn người dùng mới dùng được hệ thống — làm trước).
2. **B** (1–2 ngày, giải quyết 80% nhu cầu Gmail/Outlook cá nhân và Workspace).
3. **C** khi có khách hàng dùng Microsoft 365 đã tắt SMTP AUTH.
