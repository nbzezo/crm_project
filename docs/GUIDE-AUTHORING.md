# Viết tài liệu hướng dẫn trong ứng dụng

Trang **Hướng dẫn** (`/huong-dan`, 1.40.0) là tài liệu người dùng đọc ngay trong ứng dụng. Nội dung
nằm trong mã nguồn chứ không trong CSDL, nên sửa nó là một pull request như mọi thay đổi khác.

## Nội dung nằm ở đâu

| Thứ | Ở đâu |
|---|---|
| Danh mục bài (tên, tóm tắt, từ khoá, chương, icon, quyền) | `client/src/lib/guideNav.ts` |
| Thân bài | `client/src/content/guide/<slug>.md` |
| Ảnh | `client/public/guide/img/<ten>.jpg` hoặc `.png` |
| Nạp Markdown + tìm toàn văn | `client/src/lib/guideBodies.ts` |
| Giao diện trang | `client/src/pages/GuidePage.tsx` |
| Vẽ Markdown | `client/src/components/guide/GuideArticleBody.tsx` |
| Chốt chặn | `client/src/lib/guideNav.test.ts` |

Metadata để trong catalog TS chứ không để frontmatter trong `.md` — như vậy không phải thêm một bộ
đọc YAML chỉ để biết tên một bài, và TypeScript bắt được lỗi gõ sai chương hay quyền.

## Thêm một bài

1. Thêm một mục vào `GUIDE_ARTICLES` trong `client/src/lib/guideNav.ts`.
   - `slug` không dấu, chỉ `a-z0-9-`; đây cũng là tên file `.md` và giá trị `?bai=`.
   - Đặt mục **cạnh các bài cùng chương**: tiêu đề chương chỉ vẽ ở bài đầu tiên của chương, nên hai
     cụm rời nhau sẽ làm mục lục hiện một tiêu đề hai lần (có test bắt).
   - `permissionAny` chỉ dùng cho bài quản trị; bỏ trống thì ai cũng đọc được.
2. Tạo `client/src/content/guide/<slug>.md`.
3. Nếu bài cần ảnh, xem phần dưới.
4. `cd client && npx vitest run src/lib/guideNav.test.ts`.

## Quy ước viết

- Tiếng Việt có dấu, giọng hướng dẫn trực tiếp: *bấm*, *mở*, *chọn*.
- Theo đúng tên gọi trong `docs/GLOSSARY.md`. Không dùng "thắng/thua".
- Mở bài bằng **một đoạn nói bài này giải quyết việc gì**, không mở bằng tiêu đề.
- Bố cục quen thuộc: việc này để làm gì → vào từ đâu → từng bước → ô/nút nghĩa là gì → lưu ý →
  liên quan.
- Bảng dùng cho "cột này nghĩa là gì"; danh sách đánh số dùng cho các bước.
- Liên kết sang bài khác bằng đường dẫn tuyệt đối: `[Công việc](/huong-dan?bai=cong-viec)`.

### Khối lưu ý

Trích dẫn Markdown biến thành khối màu, giọng lấy từ **từ in đậm đầu tiên**:

```markdown
> **Lưu ý** Câu giải thích một điều dễ hiểu nhầm.
> **Mẹo** Cách dùng hiệu quả hơn.
> **Cảnh báo** Việc không hoàn tác được, hoặc có thể làm mất dữ liệu.
```

## Ảnh

Ảnh **chụp tự động**, không chép tay vào thư mục. Bộ chụp nằm ở `scripts/guide-shots/`.

```bash
npm run guide:shots
```

Lệnh này dọn một thư mục dữ liệu riêng trong temp, chạy `npm run seed`, bật máy chủ và client ở cổng
riêng (3102 / 5175), đăng nhập bằng một tài khoản chỉ tồn tại trong lần chạy đó, rồi chụp toàn bộ
danh sách trong `scripts/guide-shots/shots.ts` vào `client/public/guide/img/`.

Vì vậy ảnh **không bao giờ chứa dữ liệu khách hàng thật** của máy dev.

### Thêm một ảnh

1. Thêm một mục vào `SHOTS` trong `scripts/guide-shots/shots.ts`:

   ```ts
   { name: 'ten-anh', route: '/duong-dan' }                      // cả khung nhìn, .jpg
   { name: 'ten-anh', route: '/duong-dan', clip: 'selector', type: 'png' }  // cắt một phần, .png
   { name: 'ten-anh', route: '/duong-dan', prepare: (page) => page.click('...') }
   ```

   Quy ước: ảnh cả màn hình dùng `jpeg` (~100 KB), ảnh cắt nhỏ dùng `png` cho chữ nét. Phần tử cao
   hơn 800px thì đặt thêm `viewport` để chụp đủ.

2. Chụp lại đúng ảnh đó:

   ```bash
   npx playwright test -c scripts/guide-shots/playwright.config.ts --grep "ten-anh"
   ```

3. Chèn vào bài. **`alt` chính là lời chú thích hiện dưới ảnh**, nên viết thành câu:

   ```markdown
   ![Trang Hợp đồng với khối Sắp hết hạn và bảng hợp đồng](/guide/img/ten-anh.jpg)
   ```

### Khi giao diện đổi

Chạy lại `npm run guide:shots` để chụp toàn bộ. **Giữ nguyên tên ảnh** khi chỉ thay nội dung: bản
Docker chép ảnh vào volume `client-dist` mà không xoá, nên ảnh đổi tên sẽ để lại bản cũ nằm lại trên
production cho tới khi xoá volume thủ công.

## Những gì test bắt được

`client/src/lib/guideNav.test.ts` chặn các lỗi mà `tsc` không thấy:

- Bài có trong danh mục mà thiếu file `.md`, hoặc file `.md` không có trong danh mục
- Thân bài rỗng hoặc quá ngắn
- Các bài cùng chương bị tách rời nhau
- Chương không có bài nào
- Ảnh được nhắc trong bài mà **không có thật**, hoặc nằm ngoài `/guide/img/`
- Ảnh đã chụp mà **không bài nào dùng** (rác)
- Ảnh thiếu lời chú thích (`alt` quá ngắn)
- Tìm không dấu không ra bài, và bài bị khoá theo quyền vẫn lọt ra

## Nút trợ giúp theo ngữ cảnh

`ROUTE_TO_ARTICLE` trong `guideNav.ts` ánh xạ đường dẫn → bài. Thêm một màn hình mới thì thêm một
dòng vào đó; đường dẫn chưa khai báo sẽ mở bài mở đầu. Khớp theo tiền tố, tiền tố dài thắng
(`/pipeline-health` không rơi vào `/pipeline`).
