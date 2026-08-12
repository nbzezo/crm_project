# WorkFlow — Quản lý công việc cá nhân + CRM khách hàng B2B

Ứng dụng web chạy local, một người dùng (không đăng nhập, không tính năng cộng tác).
Kết hợp bảng Kanban kiểu Trello với CRM bán hàng B2B, giao diện tiếng Việt.

Giao diện và thao tác mô phỏng Trello, **mặc định chế độ tối**: phông nền bảng đổi được, cột và thẻ theo tông Trello, menu popover cho mọi thiết lập.

## Tính năng

- **Bảng công việc (Kanban)** — bảng → danh sách → thẻ, kéo thả đầy đủ; thẻ có mô tả, ngày bắt đầu, hạn hoàn thành, mức ưu tiên, việc cần làm (checklist), nhãn, ảnh bìa màu.
- **Thiết lập động kiểu Trello**:
  - *Bảng*: đổi phông nền (10 màu đơn + 6 chuyển sắc), đổi tên tại chỗ, gắn sao (bảng gắn sao hiện ở thanh bên), lưu trữ, xóa.
  - *Danh sách*: đổi tên tại chỗ, sao chép cả danh sách kèm thẻ, sắp xếp thẻ (ngày tạo / hạn / tên / ưu tiên), thu gọn thành cột dọc, xóa.
  - *Giao diện*: Sáng / Tối / Theo hệ thống — đổi ở nút mặt trăng trên thanh trên, ghi nhớ giữa các lần mở.
  - *Thẻ*: cửa sổ theo bố cục Trello mới — chip danh sách ở góc trái (bấm để chuyển danh sách), vòng tròn đánh dấu hoàn thành cạnh tiêu đề, hàng nút Thêm / Ngày / Ưu tiên / Khách hàng, và cột **Nhận xét và hoạt động** bên phải để ghi chú tiến độ. Menu `···` có Di chuyển, Sao chép, Lưu trữ, Xóa.
  - *Bộ lọc thẻ ngay trên bảng*: từ khóa (không dấu), trạng thái, hạn (quá hạn / hôm nay / 7 ngày tới / không có ngày), mức ưu tiên, nhãn, khách hàng — kèm số bộ lọc đang bật.
  - Nút bật/tắt hiện tên trên nhãn (thanh màu ↔ có chữ), giống Trello.
- **Khách hàng B2B (Account)** — hồ sơ công ty (tên viết tắt, MST, ngành, quy mô, nguồn, trạng thái Tiềm năng/Khách hàng/Ngừng hợp tác), cảnh báo trùng khi tạo mới.
- **Người liên hệ (Contact)** — chức vụ, phòng ban, Zalo, LinkedIn, vai trò trong quyết định mua, mức độ quan hệ.
- **Cơ hội bán hàng (Opportunity)** — pipeline 7 giai đoạn (Tiềm năng → Đang tiếp cận → Đang trao đổi → Gửi báo giá → Đàm phán → Thành công / Thất bại), xác suất tự gợi ý theo giai đoạn, **Next Action + ngày thực hiện**, nhu cầu, đối thủ, nguồn. Kéo sang Thất bại **bắt buộc chọn lý do**; chốt Thành công thì nhập giá trị thật và tạo hợp đồng ngay.
- **Chấm điểm cơ hội (BANT + 4P)** — mỗi cơ hội có trang riêng với 8 yếu tố chấm 0–3 trên hai trục: **BANT** (đây có phải cơ hội thật không) và **4P** (ta có khả năng thắng không). Điểm ≥ 1 **bắt buộc có bằng chứng**, và bằng chứng lấy thẳng từ *Lịch sử tương tác* hoặc *Tài liệu* của chính cơ hội đó — chọn xong thì điểm được đánh dấu *đã xác thực*. Điểm cao nhất của mỗi yếu tố còn bị ràng buộc bởi dữ liệu có thật: không có sự kiện bắt buộc được khách xác nhận thì không chấm Thời gian 3 điểm được, chưa gặp người duyệt ngân sách thì Quyền hạn tối đa 2. Hai tổng điểm quyết định **ô ma trận** (Theo đuổi / Tái định hình / Nuôi dưỡng / Loại bỏ) và ba **quy tắc phủ quyết** loại deal khỏi forecast bất kể tổng điểm. Ghi xong một cuộc gọi, hệ thống hỏi luôn *"cuộc trao đổi này thay đổi yếu tố nào?"*. Kèm nhóm ra quyết định (vai trò, thái độ, champion, ai chưa được tiếp xúc), sự kiện bắt buộc kèm **lịch triển khai ngược**, và đối thủ (ai đang cung cấp, ai đã tham gia soạn tiêu chí thầu).
  - **Cổng giai đoạn**: mặc định phải đạt BANT ≥ 7 để sang *Gửi báo giá*, ≥ 9 và đã tiếp cận người duyệt ngân sách để sang *Đàm phán*. Bị chặn thì thẻ bật về cột cũ kèm danh sách yếu tố đang thiếu; ghi đè được nhưng **lý do là bắt buộc** và được lưu vào lịch sử. Kéo sang *Thất bại* không bao giờ bị chặn.
  - **Sức khỏe pipeline** — ma trận phân tán toàn bộ cơ hội trên hai trục, và hai con số forecast đặt cạnh nhau: theo giai đoạn (như cũ) và đã lọc theo phủ quyết + tuổi điểm. **Chênh lệch giữa chúng là mức thổi phồng pipeline.** Kèm *phiên rà soát* đi qua từng deal quá hạn để giữ / chấm lại / đóng.
  - Điểm chất lượng **không bao giờ ghi đè xác suất theo giai đoạn** — hai chỉ số được phép khác nhau, đó chính là phép đo.
- **Báo giá (Quotation)** — mã, phiên bản tự tăng, hiệu lực, 6 trạng thái, đính kèm tệp.
- **Hợp đồng (Contract) & Gia hạn** — giá trị, ngày ký/hiệu lực, trạng thái, đếm ngược ngày còn lại, danh sách sắp hết hạn theo mốc 30/60/90 ngày và nút tạo cơ hội gia hạn.
- **Doanh thu khách hàng hiện hữu (Revenue)** — bảng 12 tháng theo từng dòng *khách hàng × dịch vụ*: AM, loại hợp đồng (Mới / Mở rộng), thời hạn (Lâu dài / Ngắn hạn / Dùng thử), tình trạng sử dụng. Mỗi tháng là **một khoản tiền có trạng thái**, chuyển tiếp theo vòng đời **Dự kiến → Đã đối soát → Đã xuất hóa đơn → Đã thanh toán** (tiền không nhân đôi giữa các bước). Đối soát có thể sửa lại số tiền — ví dụ dự kiến 100k, đối soát thực tế 95k — hệ thống giữ số dự kiến ban đầu để báo chênh lệch. Gõ số ngay trên ô, bấm chấm màu trong ô để chuyển trạng thái, bấm tiêu đề tháng để chuyển trạng thái cả cột, hoặc mở bảng 12 tháng (dự kiến / thực tế / trạng thái / ghi chú). Có tổng theo dòng, theo tháng, cả năm, phễu lũy kế theo trạng thái, tỷ lệ thu tiền và biểu đồ cột chồng theo trạng thái.
- **Danh mục dịch vụ (Service)** — CRM tự quản lý danh sách dịch vụ (mã, nhóm, đơn giá tham khảo, ngừng cung cấp); hồ sơ khách hàng có tab *Dịch vụ sử dụng* để gán dịch vụ và xem doanh thu của riêng khách đó.
- **Tài liệu (Document)** — tải lên PDF/Word/Excel/PowerPoint/ảnh (tối đa 25 MB), gắn với khách hàng / cơ hội / hợp đồng / báo giá, tìm kiếm không dấu.
- **Lịch sử tương tác** — 9 loại (Gọi, Email, Gặp mặt, Demo, Proposal, Follow-up, Ghi chú, Zalo, Khác), có kết quả và tạo luôn công việc tiếp theo.
- **Nhắc hẹn** gắn với thẻ / khách hàng / cơ hội.
- **Nhiều cách xem công việc**: Kanban · Lịch · Dòng thời gian · Báo cáo (biểu đồ). Trang *Công việc* có hai chế độ trong cùng một màn hình — **Dạng cây** (việc cha–con, thêm nhanh, nhóm theo) và **Dạng bảng** (sắp xếp theo cột kiểu bảng tính).
- **Đổi dạng xem ngay trong bảng**: ở mỗi bảng công việc, chip cạnh tên bảng và thanh dock dưới đáy chuyển giữa Bảng / Lịch / Dòng thời gian / Bảng tính mà **không rời khỏi bảng** — dữ liệu chỉ của bảng đó, dạng xem lưu trong URL nên F5 hay chia sẻ link vẫn giữ nguyên.
- **Việc cha – việc con** — mỗi công việc có thể chứa việc con (một cấp). Trang *Công việc* là bảng cây: bấm mũi tên để mở/thu việc con, bấm tên để sửa tại chỗ, đổi ưu tiên / ngày bắt đầu / hạn / khách hàng ngay trên dòng, thêm việc mới hoặc việc con trực tiếp, xóa có xác nhận. Bảng kanban ẩn việc con và hiện huy hiệu `x/y` trên thẻ cha; cửa sổ thẻ có mục *Việc con* riêng.
- **Tìm kiếm không dấu** (gõ "vinh phat" ra "Vĩnh Phát") — nhấn `Ctrl + K`.
- **Tổng quan (Dashboard)** — 6 chỉ số đầu trang (cơ hội đang mở, tổng pipeline, **weighted pipeline** = Σ giá trị × xác suất, dự kiến chốt tháng này, việc quá hạn, HĐ sắp hết hạn); việc cần làm theo Quá hạn / Hôm nay / Ngày mai / 7 ngày tới; **cơ hội cần chú ý** (quá ngày chốt, chưa có Next Action, quá hạn Next Action, không tương tác > 14 ngày); và **chất lượng cơ hội** (đang bị chặn khỏi forecast, điểm quá hạn, rơi vào ô Tái định hình, sự kiện bắt buộc trong 14 ngày, giai đoạn cao mà BANT thấp).
- **AI Copilot đa nhà cung cấp** — cấu hình Gemini, Claude và DeepSeek trong *Cài đặt*; API tự đọc danh sách model/capability, chọn model nhanh–cân bằng–suy luận và fallback khi provider lỗi. Có AI Brief ở Dashboard/khách hàng/cơ hội, chuẩn hóa ghi chú tương tác, hỏi đáp CRM + tài liệu, hành động luôn cần duyệt, quota/token/chi phí, RAG tài liệu và automation cảnh báo chủ động.
- **Sao lưu** một chạm, xuất dữ liệu JSON và **xuất CSV** (khách hàng, người liên hệ, cơ hội kèm cột điểm BANT/4P/ô/veto, chi tiết chấm điểm từng yếu tố kèm bằng chứng, hợp đồng, công việc, doanh thu theo tháng) mở được bằng Excel.

## Yêu cầu

- Node.js 22 trở lên (đã kiểm thử trên Node 24)
- Windows / macOS / Linux

## Cài đặt và chạy

```bash
npm install
npm run dev
```

Mở http://localhost:5173 — API chạy ở cổng 3001, Vite tự chuyển tiếp `/api`.

> Nếu npm chặn install script của `better-sqlite3` (npm 12 trở lên), chạy:
> `npm install-scripts approve better-sqlite3 esbuild && npm install`

### Nạp dữ liệu mẫu (tùy chọn)

```bash
npm run seed
```

Chỉ chạy khi cơ sở dữ liệu còn trống. Tạo 3 khách hàng, 6 cơ hội, 3 bảng và 15 thẻ mẫu.

## Kiểm tra chất lượng

```bash
npm run format:check # định dạng
npm run lint         # quy tắc code
npm run typecheck    # TypeScript cho contract, API và UI
npm test             # unit/integration/migration tests
npm run build        # production build + ngân sách bundle
npm run test:e2e     # Chromium desktop và mobile
npm run check        # toàn bộ quality gate ở trên
```

Lần đầu chạy E2E cần cài Chromium bằng `npx playwright install chromium`. Bộ test dùng một thư mục
riêng trong thư mục tạm của hệ điều hành, tự làm sạch trước mỗi lần chạy và không chạm vào dữ liệu
phát triển.

Client kiểm tra ngân sách JavaScript ban đầu sau mỗi production build. Ngưỡng hiện tại là 260 KiB
gzip; các trang nặng, lịch, biểu đồ, kéo thả và cửa sổ thẻ được tải theo nhu cầu.

## Build và chạy production

```bash
npm run build
npm start
```

Lệnh `npm start` chạy API đã biên dịch ở cổng 3001. Phục vụ thư mục `client/dist` bằng web server
tĩnh và chuyển tiếp `/api` tới API. Có thể xem thử artifact client tại local bằng:

```bash
npm run preview -w client -- --host 127.0.0.1
```

Server hỗ trợ các biến môi trường sau:

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `PORT` | `3001` | Cổng HTTP của API |
| `WORKFLOW_DATA_DIR` | `server/data` | Thư mục chứa DB mặc định, file tải lên và backup |
| `WORKFLOW_DB_PATH` | `<WORKFLOW_DATA_DIR>/app.db` | Đường dẫn SQLite cụ thể; dùng `:memory:` cho test |
| `WORKFLOW_AI_MASTER_KEY` | Khóa cài đặt trong `<WORKFLOW_DATA_DIR>/.ai-master.key` | Khóa AES-256 mã hóa API key AI; production nên cấp secret 32 byte dạng base64/hex |

Khi dừng bằng `SIGINT`/`SIGTERM`, API ngừng nhận kết nối mới, đóng HTTP server rồi đóng SQLite.
Migration chạy tự động và theo thứ tự khi mở DB.

### Cấu hình AI Copilot

Mở **Cài đặt → Trợ lý AI đa nhà cung cấp**, nhập API key cho Gemini, Claude hoặc DeepSeek rồi bấm
**Lưu & nhận diện model**. Browser không gọi trực tiếp provider và API key không được trả về client.
Khi triển khai production, nên cấp `WORKFLOW_AI_MASTER_KEY` bằng secret manager; nếu không, ứng dụng
tạo khóa riêng cho lần cài đặt trong thư mục dữ liệu. Xem thiết kế và giới hạn tại
[docs/AI-COPILOT.md](docs/AI-COPILOT.md).

## Dữ liệu và sao lưu

- Toàn bộ dữ liệu nằm trong một file SQLite: `server/data/app.db`.
- Nút **Sao lưu ngay** trong mục *Cài đặt* tạo bản sao an toàn (dùng `db.backup()`, đúng cả khi bật WAL) vào `server/data/backups/`.
- Nút **Xuất dữ liệu JSON** tải toàn bộ bảng về dạng JSON.
- Muốn chuyển sang máy khác: copy cả thư mục `server/data/`.
- Nếu cấu hình `WORKFLOW_DATA_DIR`, hãy sao lưu toàn bộ thư mục đã cấu hình. Không chỉ copy file
  `app.db`, vì tài liệu tải lên nằm trong `files/` và các bản backup nằm trong `backups/`.

## Cấu trúc

```
├── packages/contracts/ Contract và schema dùng chung cho API/UI
├── server/             Express + better-sqlite3 (cổng 3001)
│   └── src/
│       ├── db/        schema.sql, migrate, seed
│       ├── lib/       vị trí kéo thả, tìm kiếm bỏ dấu, kiểm tra dữ liệu
│       ├── services/  transaction và quy tắc nghiệp vụ nhiều bước
│       └── routes/    parse HTTP, gọi service, trả response
├── client/             React 19 + Vite + Tailwind 4 (cổng 5173)
    └── src/
        ├── components/  kanban, crm, timeline, dùng chung
        ├── pages/       14 trang
        └── i18n/vi.ts   toàn bộ chuỗi giao diện
└── e2e/                Luồng Playwright desktop/mobile trên production build
```

Xem thêm [tài liệu kiến trúc](docs/ARCHITECTURE.md).
