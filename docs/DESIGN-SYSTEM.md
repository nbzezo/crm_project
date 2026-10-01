# WorkFlow UI system

Tài liệu này là nguồn tham chiếu ngắn cho các mẫu UI dùng chung. Mục tiêu là giữ trải nghiệm nhất quán, dễ truy cập và tránh sao chép markup giữa các màn hình.

## Thành phần nền tảng

- `PageShell` và `PageHeader`: khống chế chiều rộng, khoảng cách trang, tiêu đề và nhóm hành động. Trang mới không tự lặp lại `max-width` hoặc padding ngoài những ngoại lệ có chủ đích.
- `Tabs`: dùng cho điều hướng trong cùng một màn hình. Thành phần đã hỗ trợ ARIA, roving focus và các phím mũi tên, Home, End.
- `IconButton`: dùng cho thao tác chỉ có biểu tượng. Luôn truyền `label`; kích thước chạm tối thiểu 44 px trên màn hình cảm ứng và thu gọn trên desktop.
- `FormModalActions`: cặp Hủy/Lưu chuẩn cho modal biểu mẫu, bao gồm trạng thái đang lưu và chống gửi lặp.
- `TableHead`: kiểu tiêu đề bảng thống nhất. Mỗi ô tiêu đề vẫn phải có `scope="col"`.
- `Logo`: dấu hiệu nhận diện dùng chung cho topbar và trang đăng nhập. Vẽ bằng `currentColor` trên nền `--tr-primary` nên tự đúng màu ở mọi theme; không dựng lại tấm nền logo ở từng màn hình.
- `RevenueFunnelCards`, `RevenueLineActions`, `CustomerDealFields`: mẫu CRM dùng chung cho KPI doanh thu, thao tác dòng và liên kết khách hàng/cơ hội.

## Token và bảng màu

- Token giao diện và biến sáng/tối nằm trong `client/src/index.css`.
- Bảng màu nghiệp vụ dùng lại nằm trong `client/src/theme/palettes.ts`.
- Không dùng màu tùy ý qua `bg-[#…]`, `text-[#…]`, `border-[#…]` trong component.
- Dùng `rounded-compact` thay cho giá trị bo góc 3 px viết trực tiếp.
- Màu trạng thái phải mang tên theo ý nghĩa nghiệp vụ, không theo tên màu thị giác.

### Quy tắc bo góc

| Họ | Token | Dùng cho |
|---|---|---|
| Viên nang | `rounded-full` | Huy hiệu, chip trạng thái, avatar, chấm, công tắc |
| Control | `rounded-control` | Nút, điều hướng, tìm kiếm, segmented, ô nhập |
| Bên trong control | `rounded-control-inner` | Lựa chọn trong segmented và popover |
| Khung | `rounded-panel` | Panel, thẻ và cột Kanban |
| Lớp nổi | `rounded-modal` | Modal, Drawer và Popover lớn |
| Chi tiết nhỏ | `rounded-compact` | Huy hiệu ngày/đếm và thanh nhãn |

### Quy tắc màu nhấn

`--tr-primary` chỉ dành cho hành động và trạng thái đang chọn. Đỏ và vàng dành
cho trạng thái như quá hạn hoặc sắp hết hạn; vàng thương hiệu không dùng cho
nhãn trang trí.

### Quy tắc chữ

Nhãn tiếng Việt dùng kiểu viết hoa chữ đầu câu, không dùng `uppercase` hoặc
tracking giãn cách để tạo cảm giác trang trí. Ngoại lệ duy nhất là theme Đơn
sắc (xem mục dưới): chữ in hoa chỉ bật bằng CSS dưới `[data-theme='mono']`,
không bao giờ bằng class trong `.tsx`.

## Theme Đơn sắc

Bộ theme: Sáng, Tối, Ubuntu 26, Đơn sắc và Theo hệ thống. Đơn sắc
(`data-theme="mono"`) là theme nền sáng đen trắng: bản sắc nằm ở tương phản và
cấu trúc (nền đen đảo ngược, viền 1 px, tiêu đề khối in hoa hẹp), không ở màu.
Người dùng còn lưu theme cũ đã gỡ được đưa về Sáng (`REMOVED_LIGHT_THEMES` trong
`stores/themeStore.ts`).

### Móc cấu trúc

Component chỉ gắn class/thuộc tính trung tính; class đó chỉ có style dưới
`[data-theme='mono']`, nên ba theme còn lại không đổi.

| Móc | Gắn vào | Ở theme Đơn sắc |
|---|---|---|
| `tr-display` | `<h1>` của `PageHeader`, Dashboard, `DetailHeader`, trang không qua `PageHeader`, tên bảng, tiêu đề `Drawer`, ô tiêu đề thẻ | Archivo đậm 900, hẹp 72%, in hoa, `line-height` 1.08 |
| `tr-display-page` | Thêm cạnh `tr-display` ở `<h1>` cấp trang (`PageHeader`, Tổng quan, `DetailHeader`, chi tiết dự án) | 36 px mobile, 44 px từ `md`, 56 px từ `xl` |
| `tr-rule` | `<span aria-hidden>` ngay dưới tiêu đề | Vạch đen 32 × 2 px. Theme khác: `display: none` (luật duy nhất ngoài khối mono) |
| `tr-eyebrow` | Tiêu đề `Panel`, nhóm sidebar, nhóm công việc, "Nên ưu tiên" | 12 px, đậm 800, giãn 0.16em, in hoa |
| `tr-group-title` | Tiêu đề nhóm ở trang công việc cũ | Bỏ viền viên thuốc |
| `tr-kpi` + `data-tone` | Ô `Metric` trên Tổng quan | Tone `danger`/`warning` đảo nền đen |
| `tr-kpi-value` | Số trong `Metric` | 30 px, hẹp 80% |
| `tr-rank` | Ô số trong danh sách ưu tiên | Ô vuông đen |
| `tr-list-title` | Tên cột Kanban, cột Pipeline, nhóm Kanban công việc | 15 px in hoa hẹp; số đếm/chip con trở về kiểu thường |
| `tr-card-title` | Ô tiêu đề (`<textarea>` tự giãn) trong cửa sổ thẻ | 26 px (mobile), 36 px từ `sm` |
| `tr-modal-title` | Tiêu đề `Modal` | 24 px in hoa hẹp |
| `tr-stage-stepper` + `data-active` | Thanh giai đoạn cơ hội | Viên thuốc đánh số, bước hiện tại tô đen |
| `data-passed` | Nút các bước đã qua trong thanh giai đoạn | Dưới `md`: thanh gọn — bước đã qua là vòng đen có dấu tick, bước sau là vòng số, chỉ bước hiện tại giữ nhãn (mockup 1e) |
| `tr-kpi-grid` | Lưới KPI trên Tổng quan | Các ô dính viền thành một lưới, khe 1 px (mockup 1a/2a) |
| `tr-list` | Gốc cột Kanban (cả cột thu gọn) | Nền trắng, viền 1 px (mockup 2b) |

Thành phần dùng chung đã có class định danh (`.tr-button-*`, `.tr-modal`,
`.tr-tab`, `table > thead`, `.tr-empty-state`) được skin thẳng trong khối mono,
không cần móc mới.

### Quy tắc

- **Chữ in hoa:** chỉ trong CSS dưới `[data-theme='mono']`. `check-ui-system`
  chặn mọi `text-transform: uppercase` ở `index.css` nằm ngoài selector đó;
  trong `.tsx` vẫn cấm `uppercase`/`tracking-wide`.
- **Màu dữ liệu giữ nguyên:** nhãn, nền bảng, ưu tiên, `STAGE_COLORS`,
  `REVENUE_STAGE_COLORS`, màu cover thẻ, loại sự kiện lịch, trạng thái dịch vụ
  và chuỗi biểu đồ mang nghĩa nên không khai báo lại trong khối mono.
- **Ngoại lệ `!important`:** bước giai đoạn hiện tại đặt màu bằng style inline
  (`STAGE_COLORS`); chỉ luật `.tr-stage-stepper > button[data-active='true']`
  được dùng `!important` để tô đen.
- **`--tr-primary` là đen** trong theme này — ngoại lệ có chủ đích so với ghi chú
  ở `:root`. `--tr-danger` vẫn đỏ cho thao tác xoá và lỗi; `ErrorState` (`role="alert"`) giữ viền đỏ, không bị skin trạng thái rỗng đổi sang đen. Huy hiệu hợp đồng ≤30 ngày (`tr-badge-warn`) giữ nền nâu nhạt từ `--tr-warning`.
- **Remap cục bộ phải lặp `--color-tr-*`:** Tailwind v4 tính `--color-tr-*` một
  lần ở `:root`, nên khi đổi token trên phần tử con (`.tr-bento-dark`,
  `.tr-kpi[data-tone]`) phải khai cả `--tr-*` lẫn `--color-tr-*`.
- **Tương phản:** `check-contrast` đo mọi theme, gồm các cặp chữ trên nền đặc
  (`--tr-on-primary`/`--tr-primary`, huy hiệu hạn, mục nav đang chọn). Trượt thì
  chỉnh giá trị token, không hạ ngưỡng.

### Theme có font riêng

Font riêng của theme khai trong `client/src/lib/themeFonts.ts` (`FONT_URLS`) và
được `applyTheme` tải bằng `<link>` khi theme bật lần đầu; các theme khác không
phải tải. Font phải có dải tiếng Việt U+1EA0–1EF9 (Archivo có), nếu không chữ có
dấu bị trộn font. Đặt `--font-sans` trong khối theme, giữ Plus Jakarta Sans làm
dự phòng.

## Cửa sổ thẻ

- Hộp thoại trên `lg`: tiêu đề trải hết bề ngang; cột trái là nhãn, mô tả, các mục rồi nhận xét; cột phải (`aside` "Thuộc tính thẻ", nền `--tr-surface`) là Trạng thái, Ưu tiên, Ngày, Người phụ trách, Dự án, Khách hàng và nút Lưu trữ/Xoá.
- Dưới `lg` và ở dạng drawer: một cột, thuộc tính xếp "nhãn — giá trị" ngay dưới tiêu đề; Lưu trữ/Xoá chỉ nằm trong menu "Thao tác khác".
- Tiêu đề là `<textarea>` tự giãn: Enter lưu (không xuống dòng), dán nhiều dòng được gộp thành một.

## Quy tắc tương tác

- Hành động chính dùng `Button variant="primary"`; xóa dùng tone nguy hiểm và luôn có nhãn truy cập.
- Khi đổi khách hàng trong một liên kết CRM, phải xóa lựa chọn cơ hội/hợp đồng không còn thuộc khách hàng mới.
- Tab, menu và modal phải dùng được hoàn toàn bằng bàn phím; trạng thái focus không được ẩn.
- Không chỉ dùng màu để truyền đạt trạng thái: kèm nhãn văn bản hoặc biểu tượng có mô tả.

## Mobile

- Dưới `md`, điều hướng chính dùng `MobileTabBar` với năm vị trí; chiều cao nội dung lấy từ `--tr-tabbar-h` và mép dưới lấy từ `--tr-safe-bottom`.
- Khi bàn phím ảo mở, `useViewportInsets` cập nhật `--tr-vvh` và `--tr-keyboard-inset`. Thanh nhập dính đáy phải dùng các biến này, không dùng chiều cao viewport cố định.
- Menu và bộ lọc neo bằng `Popover` tự chuyển thành bottom sheet trên màn hình hẹp có con trỏ coarse. Sheet độc lập dùng `BottomSheet`; cả hai phải khóa cuộn nền, bẫy focus và tôn trọng safe-area.
- Modal dưới `sm` chiếm toàn màn hình. Header/điều khiển đóng phải luôn thấy; phần thân là vùng cuộn riêng.
- Control tương tác có vùng chạm tối thiểu 44 × 44 px trên thiết bị cảm ứng. Có thể thu nhỏ bằng biến thể `fine:` cho chuột.
- Không ẩn thao tác chỉ bằng hover. Nếu desktop cần giao diện gọn, dùng `hoverable:opacity-0` và giữ trạng thái mặc định nhìn thấy trên cảm ứng.
- Tên bảng, cột hoặc thẻ là văn bản tĩnh trên cảm ứng; thao tác đổi tên đi qua menu để tránh tự bật bàn phím. Desktop vẫn có thể sửa trực tiếp.
- Kanban mobile dùng cột snap ngang theo viewport; `touch-action: none` chỉ đặt trên tay nắm kéo, không đặt trên toàn thẻ hoặc vùng cuộn.

## Kiểm tra tự động

Chạy `npm run check:ui` để chặn bo góc, màu tùy ý và bảng màu nhãn bị khai báo lặp. Lệnh này cũng nằm trong `npm run check`.
