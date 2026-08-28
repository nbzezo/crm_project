> **LƯU TRỮ — tài liệu lịch sử.** Đối chiếu spec ↔ mã nguồn tại thời điểm schema **v8**
> (11/08/2026). Schema hiện tại đã ở **v35**; nội dung dưới đây không còn phản ánh
> đúng hệ thống đang chạy. Giữ lại để tham khảo bối cảnh, không dùng làm căn cứ hiện hành.

# RÀ SOÁT & CẬP NHẬT BRD – QUẢN LÝ NHÃN (LABEL / TAG)

**Phiên bản BRD:** 1.0 → **1.2 (đã đối chiếu mã nguồn WorkFlow + phương án triển khai không ảnh hưởng module khác)**
**Ngày rà soát:** 11/08/2026
**Hệ thống đích:** WorkFlow — Kanban + CRM B2B cá nhân, chạy local, một người dùng, SQLite (`server/data/app.db`), schema đang ở **v8**.

> **Kết luận nhanh:** BRD 1.0 viết như một tính năng làm mới từ đầu, trong khi hệ thống **đã có module Nhãn đang chạy**. Ngoài ra 5 trong 5 nhóm nhãn đề xuất ở mục 15 **trùng chức năng với các module đã có** (Danh mục dịch vụ, Trạng thái khách hàng, Giai đoạn cơ hội, Mức ưu tiên, Next Action) — tức là vi phạm chính nguyên tắc 4.1 mà BRD tự đặt ra. Cần chuyển BRD thành **v2 của module hiện có** kèm kế hoạch nâng cấp dữ liệu, và cắt bỏ các nhãn trùng.
>
> **Bổ sung ở v1.2 — Phần G:** phương án triển khai **không ảnh hưởng module nào khác**. Toàn bộ migration chỉ thêm; bảng `card_labels` được thay bằng VIEW + INSTEAD OF trigger nên module Thẻ / Bảng / Danh sách / Dạng xem **không phải sửa dòng nào** (đã chạy thử 13/13 câu SQL trích từ mã nguồn — G1). Bốn điểm trùng lặp nghiệp vụ được xử lý bằng **quy tắc + cảnh báo mềm** (FR-TAG-39) thay vì refactor `deals.product`, `customers.status`… Lộ trình 5 bước, **bước 0 chạy xong hệ thống hành xử y hệt hiện tại**.

---

# PHẦN A – HIỆN TRẠNG HỆ THỐNG (những gì BRD chưa nhắc tới)

Module Nhãn **đã tồn tại và đang chạy**:

| Thành phần | Vị trí | Hiện trạng |
| --- | --- | --- |
| Bảng `labels` | [schema.sql:91-95](../server/src/db/schema.sql#L91-L95) | Chỉ có `id`, `name`, `color`. Phẳng, không cấp bậc, không mô tả, không trạng thái. |
| Bảng `card_labels` | [schema.sql:97-101](../server/src/db/schema.sql#L97-L101) | **Chỉ gắn được cho Thẻ (card)**. Không có Account / Opportunity / Contract / Document. |
| API nhãn | [labels.ts](../server/src/routes/labels.ts) | GET / POST / PATCH / DELETE. **DELETE xóa thẳng, không cảnh báo, không đếm bản ghi đang dùng.** |
| Gắn nhãn cho thẻ | [cards.ts:415-429](../server/src/routes/cards.ts#L415-L429) | `PUT /api/cards/:id/labels` — ghi đè toàn bộ tập nhãn. |
| Màn quản lý nhãn | [SettingsPage.tsx](../client/src/pages/SettingsPage.tsx) | Cài đặt → danh sách phẳng, tạo nhãn với **8 màu cố định**, xóa. Không sửa tên/màu tại chỗ, không đếm số bản ghi. |
| Lọc theo nhãn | [BoardView.tsx:53](../client/src/components/kanban/BoardView.tsx#L53) | Đã có, nhưng **chỉ logic OR** (`f.labelIds.some(...)`). Chỉ áp dụng trong bảng Kanban. |
| Hiển thị nhãn | [CardItem.tsx](../client/src/components/kanban/CardItem.tsx), `uiStore.showLabelText` | Badge trên thẻ + nút bật/tắt hiện tên nhãn (thanh màu ↔ có chữ), màu chữ tự tương phản qua `contrastInk`. |

**Hệ quả với BRD:**

1. Mục 14 (Mô hình dữ liệu) đề xuất bảng `Label` + `Label Mapping` **mới hoàn toàn** → nếu làm đúng như vậy sẽ có **hai hệ thống nhãn song song**. Phải viết lại thành **migration v9** từ `labels`/`card_labels` hiện có, **giữ nguyên `label_id`** để nhãn đang gắn trên thẻ không mất.
2. FR-TAG-17 (màn quản lý nhãn) **không phải làm mới** — là nâng cấp màn Cài đặt đã có.
3. FR-TAG-21/22 (lọc theo nhãn) **đã có một phần** — phần làm mới thực sự là logic **AND** và mở lọc nhãn sang trang Khách hàng / Cơ hội.
4. BRD thiếu toàn bộ **yêu cầu tương thích ngược**: nhãn cũ đi về đâu trong cấu trúc 2 cấp, API `PUT /api/cards/:id/labels` có còn không.

---

# PHẦN B – PHÂN TÍCH TRÙNG LẶP VỚI CÁC MODULE KHÁC

Mức độ: 🔴 trùng nặng (phải sửa BRD) · 🟠 trùng vừa (phải đặt ranh giới) · 🟡 trùng khái niệm (chỉ cần thống nhất UX)

## B1. 🔴 Nhóm nhãn "Sản phẩm" ⟷ Danh mục dịch vụ + `deals.product`

Hệ thống **đã có hai chỗ** lưu sản phẩm/dịch vụ:

- Bảng `services` — mã, nhóm, đơn vị, đơn giá tham khảo, ngừng cung cấp ([migrate-v7.sql:7](../server/src/db/migrate-v7.sql#L7)), có màn *Danh mục dịch vụ*.
- `customer_services` + `service_revenues` — doanh thu 12 tháng **tính theo dịch vụ**.
- `deals.product TEXT` — trường sản phẩm trên Cơ hội ([migrate-v4.sql:45](../server/src/db/migrate-v4.sql#L45)).

BRD mục 15.3 đề xuất nhãn `Sản phẩm → BPO / CRM / AI Bot / SIP Trunk` — **đúng bằng danh mục dịch vụ**. Nếu triển khai sẽ có **3 nguồn sự thật** về sản phẩm; báo cáo doanh thu theo dịch vụ và bộ lọc theo nhãn sẽ ra hai con số khác nhau, không ai biết số nào đúng.

**Xử lý bắt buộc:** Bỏ nhóm nhãn "Sản phẩm". Thay bằng: chuẩn hóa `deals.product` (text tự do) thành khóa ngoại `service_id → services`, và cho phép **lọc Cơ hội theo dịch vụ**. Nhãn chỉ được dùng cho các đặc điểm *chưa có trường nào phụ trách*, ví dụ `Upsell`, `Cross-sell`, `POC`.

## B2. 🔴 Nhóm nhãn "Khách hàng" ⟷ `customers.status`

`customers.status ∈ (prospect, customer, inactive)` ([migrate-v4.sql:18](../server/src/db/migrate-v4.sql#L18)) — giao diện hiển thị *Tiềm năng / Khách hàng / Ngừng hợp tác*.

Nhóm nhãn đề xuất `Khách hàng → VIP / Tiềm năng / Khách hiện hữu / Khách cũ / Đối tác`: **3 trên 5 nhãn trùng thẳng với `status`**.

**Xử lý:** Giữ lại **VIP** và **Đối tác** (thật sự là thuộc tính bổ sung, một khách có thể vừa là khách hàng vừa là đối tác). Bỏ *Tiềm năng / Khách hiện hữu / Khách cũ*.

## B3. 🔴 Nhóm nhãn "Theo dõi" ⟷ `deals.stage` + `lost_reason`

`deals.stage` đã có 7 giai đoạn `lead → approaching → discussing → quoted → negotiating → won/lost`.

- Nhãn `Chờ báo giá` / `Chờ khách phản hồi` ≈ stage `quoted` / `discussing`.
- Nhãn `Tạm dừng` ≈ trạng thái cần bổ sung vào pipeline, không phải nhãn.
- **Mục 1 của chính BRD** còn nêu ví dụ nhãn `Đang báo giá` — vi phạm trực tiếp nguyên tắc 4.1 mà BRD tự viết ở mục sau.

**Xử lý:** Bỏ *Chờ báo giá*, *Chờ khách phản hồi*, *Đang báo giá*. Giữ *Cần xử lý ngay* (xem thêm B5).

## B4. 🔴 "Công việc → Quan trọng / Gấp" ⟷ `cards.priority`

`cards.priority ∈ (low, medium, high, urgent)` đã có, đã hiển thị trên thẻ, đã có trong bộ lọc bảng.

**Xử lý:** Bỏ *Quan trọng*, *Gấp*. Giữ *Follow-up / Báo giá / Hợp đồng / Meeting* — đây là **loại công việc**, hiện chưa có trường nào phụ trách, nên hợp lệ.

## B5. 🟠 "Cần follow-up" + auto-tag ⟷ Next Action & Dashboard "Cơ hội cần chú ý"

`deals.next_action` + `next_action_date` đã có; Dashboard đã tự tính 4 nhóm cảnh báo: quá ngày chốt, chưa có Next Action, quá hạn Next Action, **không tương tác > 14 ngày**.

Mục 19 của BRD đề xuất rule tự động: *"14 ngày chưa Activity → tự động gắn Cần follow-up"* — **trùng đúng logic Dashboard đang chạy**. Tệ hơn: nhãn là dữ liệu tĩnh, Dashboard tính động → khi khách phản hồi lại, Dashboard hết cảnh báo nhưng nhãn vẫn còn → **hai màn hình nói ngược nhau**.

**Xử lý:** Cấm auto-tag cho mọi điều kiện Dashboard đã tính. Auto-tag chỉ dành cho tiêu chí chưa có nơi nào phụ trách (ví dụ `Deal lớn` theo giá trị). Nhãn *Cần follow-up* thủ công thì vẫn giữ được, nhưng phải nêu rõ trong tài liệu: nó là **đánh dấu chủ quan của người dùng**, không phải cảnh báo hệ thống.

## B6. 🟠 Nhãn cha–con ⟷ Trường thông tin tùy chỉnh (`card_fields` kiểu `select`)

`card_fields` ([migrate.ts:21-38](../server/src/db/migrate.ts#L21-L38)) đã cho phép tạo trường tùy chỉnh theo bảng, kiểu `text / number / date / select / checkbox`, `select` có danh sách `options`, cờ `show_on_card`.

**Nhãn cha + nhãn con ≈ tên trường select + danh sách option.** Hai cơ chế làm cùng một việc → người dùng sẽ không biết nên tạo trường hay tạo nhãn, và dữ liệu phân loại bị chia đôi.

**Ranh giới bắt buộc ghi vào BRD:**

| | Trường tùy chỉnh (select) | Nhãn |
| --- | --- | --- |
| Số giá trị | Chọn 1 | Gắn nhiều |
| Phạm vi | Trong 1 bảng công việc | Xuyên module (Account, Opportunity, Task…) |
| Mục đích | Nhập liệu có cấu trúc, có thể bắt buộc | Đánh dấu nhanh, nhận diện bằng màu, lọc |
| Vị trí | Trong biểu mẫu chi tiết | Badge trên thẻ/dòng, gắn trong 2–3 thao tác |

**Quy tắc:** một tiêu chí phân loại **chỉ được tồn tại ở một trong hai**. Nếu tiêu chí "chọn 1 trong N" và cần bắt buộc → dùng trường select, không dùng nhãn.

## B7. 🟠 "Mức độ quan tâm: Nóng / Ấm / Lạnh" ⟷ `deals.probability`

Cơ hội đã có xác suất tự gợi ý theo giai đoạn (10 → 100). Nóng/Ấm/Lạnh là cách nói khác của cùng một thứ.

**Xử lý:** Nhóm này **chỉ áp dụng cho Account và Contact** (chưa có xác suất). **Cấm áp dụng cho Opportunity** — thiết lập bằng phạm vi áp dụng của nhãn (FR-TAG-30 bên dưới).

## B8. 🟡 Nhãn cho Tài liệu ⟷ `documents.doc_type` + liên kết sẵn có

`documents` đã có `doc_type` và đã liên kết trực tiếp tới customer / contact / deal / contract / quotation / card. Gắn thêm nhãn tạo lớp phân loại thứ ba với giá trị thấp.

**Xử lý:** Đưa Document ra khỏi phạm vi, cân nhắc lại sau khi nhãn ổn định.

## B9. 🟡 FR-TAG-28 "Nhãn yêu thích" ⟷ `boards.is_starred`

Hệ thống đã dùng khái niệm **gắn sao** cho Bảng. Không trùng dữ liệu nhưng phải dùng **cùng thuật ngữ và cùng biểu tượng ★** để giao diện nhất quán — không đặt tên mới "yêu thích".

## B10. 🟡 FR-TAG-19 "Tìm kiếm nhãn" ⟷ Tìm kiếm không dấu (Ctrl+K, `search_text`)

Hệ thống đã có helper bỏ dấu và cột `search_text` trên customers / deals / cards / services.

**Xử lý:** Tìm nhãn phải **dùng lại** helper bỏ dấu, không viết mới. Đồng thời phải quyết định (BRD 1.0 chưa nói): **tên nhãn có được đưa vào `search_text` của bản ghi** để Ctrl+K gõ "VIP" ra được khách hàng không? → Có, xem FR-TAG-36.

### Bảng tổng hợp trùng lặp

| # | Hạng mục trong BRD | Module đã có | Mức | Quyết định |
| --- | --- | --- | --- | --- |
| B1 | Nhóm "Sản phẩm" | `services`, `customer_services`, `deals.product` | 🔴 | Bỏ khỏi nhãn, chuẩn hóa thành `service_id` |
| B2 | Nhóm "Khách hàng" | `customers.status` | 🔴 | Chỉ giữ VIP, Đối tác |
| B3 | Nhóm "Theo dõi" | `deals.stage`, `lost_reason` | 🔴 | Bỏ 3 nhãn trùng stage |
| B4 | "Quan trọng / Gấp" | `cards.priority` | 🔴 | Bỏ 2 nhãn |
| B5 | Auto-tag "Cần follow-up" | Next Action + Dashboard | 🟠 | Cấm auto-tag trùng Dashboard |
| B6 | Nhãn cha–con | `card_fields` kiểu select | 🟠 | Đặt ranh giới rõ, một tiêu chí một cơ chế |
| B7 | Nóng / Ấm / Lạnh | `deals.probability` | 🟠 | Giới hạn phạm vi Account/Contact |
| B8 | Nhãn cho Document | `documents.doc_type` | 🟡 | Ngoài phạm vi |
| B9 | Nhãn yêu thích | `boards.is_starred` | 🟡 | Dùng chung thuật ngữ "gắn sao" |
| B10 | Tìm kiếm nhãn | `search_text` không dấu | 🟡 | Dùng lại helper hiện có |

---

# PHẦN C – MÂU THUẪN & LỖ HỔNG TRONG BRD 1.0

| # | Vị trí | Vấn đề | Hướng chốt |
| --- | --- | --- | --- |
| C1 | Mục 1 & 15 vs 4.1 | Chính BRD nêu nhãn `Đang báo giá`, `Tiềm năng`, `Quan trọng` — vi phạm nguyên tắc "nhãn không thay trường nghiệp vụ" | Sửa danh sách ví dụ theo Phần B |
| C2 | Mục 6 | "Khuyến nghị nhãn cha không gắn trực tiếp" — chỉ là khuyến nghị, mô hình không chặn | **Rule cứng:** nhãn cấp 1 không gắn được vào bản ghi (BR-TAG-13) |
| C3 | FR-TAG-23 | "Hệ thống **có thể** trả về…" — mơ hồ, không test được | Chốt: lọc nhãn cha = OR toàn bộ nhãn con |
| C4 | FR-TAG-14 vs FR-TAG-16 | Vừa khuyến nghị Inactive thay xóa, vừa cho xóa nhãn đang dùng | Chốt: nhãn đang dùng **không xóa được**; chỉ Inactive, hoặc "Gỡ khỏi N bản ghi rồi xóa" (2 bước, có hoàn tác) |
| C5 | BR-TAG-02 | Chưa quy định trùng tên ở **cấp 1**; chưa quy định so trùng có bỏ dấu/hoa-thường không | So trùng theo tên **đã bỏ dấu + thường + gộp khoảng trắng**: "Tiềm năng" ≡ "tiem nang" ≡ "TIỀM NĂNG" |
| C6 | BR-TAG-03 | Cho trùng tên khác nhóm, nhưng badge chỉ hiện tên → người dùng không phân biệt được | Khi tên bị trùng ở nhóm khác, badge hiển thị `Nhóm / Tên`; tooltip luôn có tên nhóm |
| C7 | Mục 14 | `label_level` **dư thừa** — suy được từ `parent_id`, dễ lệch dữ liệu | Bỏ cột |
| C8 | Mục 14 | `Label Mapping` thiếu ràng buộc duy nhất → BR-TAG-07 không có gì bảo đảm | `PRIMARY KEY (label_id, entity_type, entity_id)` |
| C9 | Mục 14 | `entity_id` đa hình → **không có khóa ngoại**; xóa Cơ hội sẽ để lại liên kết mồ côi, làm sai số đếm ở FR-TAG-18 | Bổ sung **trigger dọn liên kết** cho từng bảng (xem D3) |
| C10 | FR-TAG-01 | "Đối tượng áp dụng" là **nhiều giá trị** nhưng để trong 1 trường của bảng Label; chưa nói nhãn con có kế thừa của cha không, đổi phạm vi khi đã có liên kết vi phạm thì sao | Lưu JSON; **nhãn con kế thừa phạm vi của cha**; thu hẹp phạm vi → cảnh báo số liên kết sẽ vi phạm, giữ nguyên dữ liệu cũ |
| C11 | FR-TAG-09 | Tạo nhanh nhãn không chọn cha → sinh nhãn rác, phá vỡ cấu trúc 2 cấp | Nhãn tạo nhanh vào nhóm mặc định **"Chưa phân nhóm"** |
| C12 | FR-TAG-13 | Chuyển nhãn con sang cha khác — chưa xử lý khi cha mới đã có nhãn trùng tên | Chặn, gợi ý **gộp nhãn** (FR-TAG-31) |
| C13 | FR-TAG-16 | Chưa nói nhãn **cha** Inactive thì con thế nào | Cha Inactive → cả nhóm ẩn khỏi menu gắn nhãn; dữ liệu cũ giữ nguyên |
| C14 | FR-TAG-18 | "Số bản ghi" — tổng hay tách theo loại? Nhãn cha có cộng dồn con không? | Hiện **tổng**, hover tách theo loại đối tượng; nhãn cha = **số bản ghi phân biệt** của các con (không cộng trùng) |
| C15 | FR-TAG-20 | `sort_order` chưa nói phạm vi | Sắp xếp **trong nhóm**; nhóm có thứ tự riêng |
| C16 | Toàn BRD | Không có **giới hạn** nào: độ dài tên, số nhãn/bản ghi, tổng số nhãn | Tên ≤ 30 ký tự; ≤ 10 nhãn/bản ghi (chặn ở API); cảnh báo mềm khi > 100 nhãn |
| C17 | Toàn BRD | **Thiếu hẳn chức năng Gộp nhãn** — thao tác dọn dẹp cần nhất khi nhãn phình to | Bổ sung FR-TAG-31 |
| C18 | FR-TAG-10/11 | Gắn/gỡ hàng loạt không có hoàn tác, trong khi hệ thống đã có cơ chế undo ([undo.ts](../client/src/lib/undo.ts)) | Bổ sung FR-TAG-33 |
| C19 | Toàn BRD | Không nhắc **Sao lưu / Xuất JSON / Xuất CSV** — hệ thống đã có | Bổ sung FR-TAG-35 |
| C20 | Toàn BRD | Có khái niệm ngầm về người dùng/phân quyền, nhưng hệ thống **chạy local, một người, không đăng nhập** | Ghi rõ: không có nhãn riêng theo người dùng, không phân quyền |
| C21 | Mục 20 | "2–3 thao tác" chưa có cách đo | AC đo bằng số lần bấm: mở menu → tick → xong = 3 |
| C22 | Toàn BRD | Không có yêu cầu về khả năng đọc màu | Dùng lại `contrastInk`; **màu không được là tín hiệu duy nhất** — dùng lại nút bật/tắt hiện tên nhãn đã có |

---

# PHẦN D – YÊU CẦU BỔ SUNG

## D1. Yêu cầu chức năng bổ sung

**FR-TAG-30 – Phạm vi áp dụng theo loại đối tượng**
Mỗi nhãn cấp 1 khai báo danh sách loại đối tượng áp dụng (rỗng = mọi loại). Menu gắn nhãn ở màn hình nào chỉ hiện nhãn hợp lệ với loại đối tượng đó. Nhãn con kế thừa phạm vi của cha. Thu hẹp phạm vi khi đã có liên kết vi phạm: hệ thống cảnh báo số lượng, **không tự xóa liên kết cũ**, và các liên kết đó chỉ còn gỡ được thủ công.

**FR-TAG-31 – Gộp nhãn**
Chọn nhãn A, chọn "Gộp vào" nhãn B: mọi liên kết của A chuyển sang B (bỏ qua bản ghi đã có B), A bị xóa. Hiển thị trước khi xác nhận: *"Gộp 'Kh tiềm năng' (12 bản ghi) vào 'Tiềm năng' (35 bản ghi) → 'Tiềm năng' còn 44 bản ghi (3 bản ghi có cả hai)."* Chỉ gộp được hai nhãn cùng cấp.

**FR-TAG-32 – Nhóm mặc định "Chưa phân nhóm"**
Hệ thống luôn có một nhãn cha hệ thống *Chưa phân nhóm*, không xóa/đổi tên được, chứa nhãn tạo nhanh và toàn bộ nhãn cũ sau khi nâng cấp dữ liệu. Màn quản lý nhãn hiển thị gợi ý sắp xếp lại khi nhóm này có > 10 nhãn.

**FR-TAG-33 – Hoàn tác thao tác hàng loạt**
Gắn/gỡ nhãn hàng loạt và gộp nhãn phải hoàn tác được trong 8 giây theo cơ chế toast đã có ([undo.ts](../client/src/lib/undo.ts)).

**FR-TAG-34 – Giới hạn kỹ thuật**
Tên nhãn 1–30 ký tự. Tối đa **10 nhãn/bản ghi**, chặn ở tầng API kèm thông báo. Cảnh báo mềm khi tổng số nhãn vượt 100.

**FR-TAG-35 – Sao lưu và xuất dữ liệu**
Nhãn và liên kết nhãn nằm trong Sao lưu / Xuất JSON. Xuất CSV (khách hàng, cơ hội, công việc) bổ sung cột **Nhãn** — các nhãn nối bằng dấu `;`, dạng `Nhóm / Tên`.

**FR-TAG-36 – Nhãn trong tìm kiếm tổng**
Tên nhãn được ghi vào `search_text` của bản ghi (đã bỏ dấu) để `Ctrl + K` gõ "vip" ra được khách hàng gắn nhãn VIP. Đổi tên hoặc gỡ nhãn phải cập nhật lại `search_text` của các bản ghi liên quan.

**FR-TAG-37 – Tương thích ngược**
`label_id` hiện có **không đổi**. `PUT /api/cards/:id/labels` giữ nguyên đường dẫn và hành vi. Toàn bộ nhãn cũ vào nhóm *Chưa phân nhóm*, trạng thái Active, phạm vi = mọi loại.

**FR-TAG-38 – Hiệu năng đếm số bản ghi**
FR-TAG-18 phải tính bằng **một truy vấn gộp** cho cả cây nhãn (`GROUP BY label_id`), không truy vấn theo từng nhãn.

## D2. Business rule bổ sung

- **BR-TAG-13** – Nhãn cấp 1 (nhãn cha) **không gắn được** vào bản ghi; chỉ nhãn cấp 2 mới gắn được. (Thay cho "khuyến nghị" ở mục 6.)
- **BR-TAG-14** – So trùng tên theo dạng chuẩn hóa: bỏ dấu, chữ thường, gộp khoảng trắng. Áp dụng cho cả nhãn cha (toàn cục) và nhãn con (trong cùng cha).
- **BR-TAG-15** – Nhãn cha Inactive → toàn bộ nhãn con ẩn khỏi menu gắn nhãn; dữ liệu đã gắn giữ nguyên.
- **BR-TAG-16** – Không xóa được nhãn đang có liên kết; phải Inactive, hoặc gỡ hết liên kết rồi xóa.
- **BR-TAG-17** – Xóa bản ghi (thẻ, khách hàng, cơ hội…) phải xóa liên kết nhãn tương ứng.
- **BR-TAG-18** – Một bản ghi tối đa 10 nhãn.
- **BR-TAG-19** – Nhãn không được trùng vai trò với trường nghiệp vụ đã có: `customers.status`, `deals.stage`, `deals.probability`, `deals.next_action`, `cards.priority`, `services`, `documents.doc_type`. Danh sách này là **checklist bắt buộc** khi duyệt nhãn mới.
- **BR-TAG-20** – Không tạo rule tự động gắn nhãn cho điều kiện mà Dashboard đã tính sẵn.

## D3. Mô hình dữ liệu cập nhật — migration v9

Thay thế mục 14 của BRD 1.0. **Nâng cấp bảng `labels` hiện có**, không tạo bảng mới song song.

> **Nguyên tắc (v1.2):** toàn bộ migration chỉ **thêm**. Không đổi cấu trúc bảng của bất kỳ module nào khác. Bảng `card_labels` **không bị xóa** mà được thay bằng VIEW + INSTEAD OF trigger, nên 7 vị trí đang dùng `card_labels` trong `cards.ts` / `lists.ts` / `boards.ts` / `views.ts` / `seed.ts` / `system.ts` **chạy y nguyên, không phải sửa dòng nào** (xem Phần G).

```sql
-- v9: nang cap Nhan len 2 cap + gan duoc cho nhieu loai doi tuong
ALTER TABLE labels ADD COLUMN parent_id    INTEGER REFERENCES labels(id);
ALTER TABLE labels ADD COLUMN description  TEXT    NOT NULL DEFAULT '';
ALTER TABLE labels ADD COLUMN status       TEXT    NOT NULL DEFAULT 'active'
  CHECK (status IN ('active','inactive'));
ALTER TABLE labels ADD COLUMN scope        TEXT    NOT NULL DEFAULT '[]';  -- JSON, [] = moi loai
ALTER TABLE labels ADD COLUMN is_starred   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE labels ADD COLUMN position     REAL    NOT NULL DEFAULT 0;
ALTER TABLE labels ADD COLUMN name_norm    TEXT    NOT NULL DEFAULT '';   -- ten da bo dau, chu thuong
ALTER TABLE labels ADD COLUMN is_system    INTEGER NOT NULL DEFAULT 0;    -- nhom "Chua phan nhom"

-- Khong co cot label_level: cap suy ra tu parent_id (NULL = cap 1).
-- Chan cap 3: kiem tra o tang API — cha duoc chon phai co parent_id IS NULL.
CREATE UNIQUE INDEX idx_labels_unique ON labels(IFNULL(parent_id, 0), name_norm);
CREATE INDEX idx_labels_parent ON labels(parent_id, position);

CREATE TABLE label_links (
  label_id    INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  entity_type TEXT    NOT NULL CHECK (entity_type IN ('card','customer','deal','contact','contract')),
  entity_id   INTEGER NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (label_id, entity_type, entity_id)          -- BR-TAG-07
);
CREATE INDEX idx_label_links_entity ON label_links(entity_type, entity_id);

-- Nhom he thong + chuyen toan bo nhan cu vao nhom do (giu nguyen label_id)
INSERT INTO labels (name, color, name_norm, is_system, position)
  VALUES ('Chưa phân nhóm', '#8993a4', 'chua phan nhom', 1, 999);
UPDATE labels
   SET parent_id = (SELECT id FROM labels WHERE is_system = 1)
 WHERE is_system = 0;

-- Chuyen lien ket the sang bang moi, roi thay bang cu bang VIEW cung ten
INSERT INTO label_links (label_id, entity_type, entity_id)
SELECT label_id, 'card', card_id FROM card_labels;
DROP TABLE card_labels;

CREATE VIEW card_labels AS
  SELECT entity_id AS card_id, label_id FROM label_links WHERE entity_type = 'card';

-- INSTEAD OF trigger: moi cau INSERT/DELETE cu vao card_labels van chay dung
CREATE TRIGGER trg_card_labels_insert INSTEAD OF INSERT ON card_labels BEGIN
  INSERT OR IGNORE INTO label_links (label_id, entity_type, entity_id)
    VALUES (NEW.label_id, 'card', NEW.card_id);
END;
CREATE TRIGGER trg_card_labels_delete INSTEAD OF DELETE ON card_labels BEGIN
  DELETE FROM label_links
   WHERE entity_type = 'card' AND entity_id = OLD.card_id AND label_id = OLD.label_id;
END;

-- C9: entity_id da hinh nen khong co khoa ngoai — phai don bang trigger
-- (dong thoi thay cho ON DELETE CASCADE ma bang card_labels cu dang co)
CREATE TRIGGER trg_label_links_card AFTER DELETE ON cards BEGIN
  DELETE FROM label_links WHERE entity_type = 'card' AND entity_id = OLD.id;
END;
CREATE TRIGGER trg_label_links_customer AFTER DELETE ON customers BEGIN
  DELETE FROM label_links WHERE entity_type = 'customer' AND entity_id = OLD.id;
END;
CREATE TRIGGER trg_label_links_deal AFTER DELETE ON deals BEGIN
  DELETE FROM label_links WHERE entity_type = 'deal' AND entity_id = OLD.id;
END;
CREATE TRIGGER trg_label_links_contact AFTER DELETE ON contacts BEGIN
  DELETE FROM label_links WHERE entity_type = 'contact' AND entity_id = OLD.id;
END;
CREATE TRIGGER trg_label_links_contract AFTER DELETE ON contracts BEGIN
  DELETE FROM label_links WHERE entity_type = 'contract' AND entity_id = OLD.id;
END;
```

**Ràng buộc còn giữ được:** `label_links.label_id` vẫn có khóa ngoại tới `labels` (ON DELETE CASCADE), nên gắn nhãn không tồn tại vẫn bị chặn như trước. `entity_id` đa hình nên không có khóa ngoại — đó là lý do phải có 5 trigger dọn liên kết.

## D4. Hợp đồng API

| Phương thức | Đường dẫn | Ghi chú |
| --- | --- | --- |
| GET | `/api/labels?tree=1&scope=deal&counts=1` | Trả cây 2 cấp, lọc theo phạm vi, kèm số bản ghi (FR-TAG-38) |
| POST | `/api/labels` | Chặn cấp 3, chặn trùng `name_norm`, tự sinh `name_norm` |
| PATCH | `/api/labels/:id` | Đổi tên/màu/mô tả/cha/phạm vi/trạng thái; đổi cha phải kiểm tra trùng tên (C12) |
| DELETE | `/api/labels/:id` | 409 kèm `{ used_count }` nếu đang dùng (BR-TAG-16) |
| POST | `/api/labels/:id/merge` | `{ target_id }` (FR-TAG-31) |
| GET | `/api/labels/:id/records?entity_type=` | Mở dữ liệu từ nhãn (FR-TAG-24) |
| PUT | `/api/:entity/:id/labels` | `{ label_ids }`, giữ nguyên `/api/cards/:id/labels` |
| POST | `/api/labels/bulk` | `{ action: 'add'\|'remove', label_ids, entity_type, entity_ids }` (FR-TAG-10/11) |

Thông báo lỗi giữ đúng quy ước hiện tại của server: **tiếng Việt không dấu** (ví dụ `'Ten nhan khong duoc de trong'`, xem [labels.ts:9](../server/src/routes/labels.ts#L9)); chuỗi giao diện có dấu nằm ở [i18n/vi.ts](../client/src/i18n/vi.ts).

## D5. Danh sách nhãn khởi tạo sau khi cắt trùng

Thay thế mục 15 của BRD 1.0:

```text
Khách hàng            (Account, Contact)
├── VIP
├── Đối tác
└── Khách rủi ro

Mức độ quan hệ        (Account, Contact — KHÔNG áp dụng Opportunity, xem B7)
├── Nóng
├── Ấm
└── Lạnh

Đặc điểm cơ hội       (Opportunity)
├── Deal lớn
├── Upsell
├── Cross-sell
├── POC / Dùng thử
└── Cạnh tranh gắt

Loại công việc        (Task)
├── Follow-up
├── Báo giá
├── Hợp đồng
└── Meeting
```

Đã bỏ so với BRD 1.0: nhóm **Sản phẩm** (→ Danh mục dịch vụ), *Tiềm năng / Khách hiện hữu / Khách cũ* (→ `customers.status`), nhóm **Theo dõi** (→ `deals.stage` + Next Action), *Quan trọng / Gấp* (→ `cards.priority`).

## D6. Acceptance criteria bổ sung

- **AC-TAG-09 – Không gắn được nhãn cha:** Cho nhãn cha "Khách hàng" — khi mở menu gắn nhãn trên một Account — nhãn cha hiển thị dạng tiêu đề nhóm, không tick được.
- **AC-TAG-10 – Trùng tên bỏ dấu:** Cho nhóm "Khách hàng" đã có "Tiềm năng" — khi tạo nhãn "tiem nang" trong cùng nhóm — hệ thống báo trùng và từ chối.
- **AC-TAG-11 – Xóa nhãn đang dùng:** Cho nhãn VIP gắn ở 12 bản ghi — khi bấm Xóa — hệ thống báo *"Nhãn 'VIP' đang được dùng ở 12 bản ghi"* và chỉ cho chọn **Vô hiệu hóa** hoặc **Gỡ khỏi 12 bản ghi rồi xóa**; không xóa thẳng.
- **AC-TAG-12 – Xóa nhãn cha còn con:** Cho "Sản phẩm" còn 4 nhãn con — khi bấm Xóa — hệ thống từ chối và đề nghị chuyển hoặc xóa nhãn con trước.
- **AC-TAG-13 – Gộp nhãn:** Cho "Kh tiềm năng" (12 bản ghi) và "Tiềm năng" (35 bản ghi), 3 bản ghi có cả hai — khi gộp — "Tiềm năng" còn **44** bản ghi và "Kh tiềm năng" biến mất.
- **AC-TAG-14 – Vô hiệu hóa:** Cho nhãn "Hot" ở trạng thái Inactive — khi mở menu gắn nhãn — "Hot" không xuất hiện; bản ghi đã gắn vẫn hiện badge "Hot".
- **AC-TAG-15 – Lọc AND:** Cho 10 Account có VIP, 6 có BFSI, 4 có cả hai — khi lọc VIP **AND** BFSI — kết quả đúng **4**.
- **AC-TAG-16 – Giới hạn 10 nhãn:** Cho bản ghi đã có 10 nhãn — khi gắn nhãn thứ 11 — API từ chối và giao diện báo giới hạn.
- **AC-TAG-17 – Xóa bản ghi dọn liên kết:** Cho Cơ hội gắn 3 nhãn — khi xóa Cơ hội — số đếm của cả 3 nhãn giảm 1, không còn liên kết mồ côi.
- **AC-TAG-18 – Nâng cấp dữ liệu:** Cho cơ sở dữ liệu v8 có 5 nhãn và 40 liên kết thẻ — sau khi chạy migration v9 — vẫn đúng 5 nhãn (cùng `label_id`) nằm trong nhóm *Chưa phân nhóm* và đủ 40 liên kết `entity_type='card'`.
- **AC-TAG-19 – Tốc độ thao tác:** Từ thẻ/bản ghi, gắn xong một nhãn có sẵn trong **tối đa 3 lần bấm** (mở menu → tick → đóng).
- **AC-TAG-20 – Hoàn tác hàng loạt:** Sau khi gắn nhãn cho 20 bản ghi, bấm **Hoàn tác** trong 8 giây — cả 20 bản ghi trở lại như cũ.

---

# PHẦN E – MVP ĐIỀU CHỈNH THEO HIỆN TRẠNG

MVP ở BRD 1.0 quá rộng và lặp lại phần đã có. Đề xuất chia lại:

**Giai đoạn 1 – Nền tảng dữ liệu (bắt buộc trước tất cả)**
1. Migration v9: `parent_id`, `status`, `description`, `scope`, `position`, `name_norm`, `label_links`, view `card_labels` + INSTEAD OF trigger, 5 trigger dọn liên kết, nhóm *Chưa phân nhóm* (FR-TAG-37, AC-TAG-18).
2. **Không sửa mã nguồn module Thẻ** — xem Phần G1.

**Giai đoạn 2 – MVP người dùng thấy được**
3. Màn *Cài đặt → Quản lý nhãn* dạng cây: tạo/sửa/xóa/vô hiệu hóa, chọn màu, mô tả, đếm số bản ghi, tìm kiếm không dấu (nâng cấp [SettingsPage.tsx](../client/src/pages/SettingsPage.tsx)).
4. Nhãn cha–con 2 cấp + chặn cấp 3 + chặn trùng tên bỏ dấu + phạm vi áp dụng.
5. Gắn/gỡ nhãn cho **Account** và **Opportunity** (Task đã có sẵn).
6. Lọc theo nhãn **AND/OR** trong bảng công việc ([BoardView.tsx:53](../client/src/components/kanban/BoardView.tsx#L53)) và thêm bộ lọc nhãn ở trang Khách hàng, Cơ hội.
7. Mở dữ liệu từ nhãn (FR-TAG-24) — rẻ, giá trị cao.
8. Giới hạn 10 nhãn/bản ghi, tên ≤ 30 ký tự.

**Giai đoạn 3**
9. Gộp nhãn (FR-TAG-31), gắn/gỡ hàng loạt + hoàn tác, kéo thả sắp xếp, gắn sao, nhãn gần đây (lưu ở `uiStore`, không cần bảng), nhãn cho Contact/Contract, cột Nhãn trong xuất CSV.

**Giai đoạn 4 (cân nhắc lại trước khi làm)**
10. Rule tự động gắn nhãn — chỉ cho tiêu chí Dashboard chưa tính (BR-TAG-20). Gợi ý nhãn bằng AI: chưa đủ dữ liệu để có ích, để sau.

**Đưa ra khỏi phạm vi:** nhãn cho Tài liệu (B8), nhãn theo người dùng / phân quyền (hệ thống một người dùng, C20).

---

# PHẦN F – VIỆC CẦN QUYẾT TRƯỚC KHI CHỐT

1. **Nhãn cha có gắn trực tiếp được không (C2):** đề xuất **không** — chốt luôn để khỏi sửa mô hình sau. *Quyết định này nằm hoàn toàn trong module nhãn, không ảnh hưởng ai.*
2. **Nhãn hiện là toàn cục** (dùng chung mọi bảng), khác Trello (nhãn theo từng bảng). Giữ toàn cục và quản lý bằng nhóm + phạm vi áp dụng — xác nhận đúng ý không?
3. **Chuẩn hóa `deals.product` → `service_id` (B1):** đây là việc **duy nhất** đụng module khác. Đề xuất **tách hẳn ra khỏi dự án nhãn**, làm riêng khi nào cần siết báo cáo doanh thu. Trước mắt xử lý bằng cảnh báo mềm (FR-TAG-39).
4. **Nhãn vào `search_text` (FR-TAG-36):** đề xuất **hoãn** — xem G4.

---

# PHẦN G – PHƯƠNG ÁN TRIỂN KHAI KHÔNG ẢNH HƯỞNG MODULE KHÁC

## G0. Năm nguyên tắc cách ly

1. **Chỉ thêm, không sửa.** Mọi thay đổi CSDL là `CREATE` mới hoặc `ALTER TABLE labels ADD COLUMN`. Không đổi/xóa cột của bảng thuộc module khác.
2. **Mọi API cũ giữ nguyên đường dẫn và hành vi.** Chức năng mới đi bằng route mới.
3. **Hành vi mặc định của giao diện cũ không đổi.** Tính năng mới luôn ở dạng tùy chọn người dùng tự bật (ví dụ AND/OR mặc định vẫn là OR như hiện tại).
4. **Chống trùng lặp bằng quy tắc, không bằng refactor.** Không đụng `deals.product`, `customers.status`, `deals.stage`, `cards.priority`, `card_fields`.
5. **Mỗi bước có đường lui.** Muốn quay lại chỉ cần bỏ view + trigger và tái tạo bảng `card_labels` từ `label_links`.

## G1. `card_labels`: giữ nguyên bằng VIEW + INSTEAD OF trigger — **đã kiểm chứng**

`card_labels` đang được dùng ở **7 vị trí thuộc 6 tệp**: [cards.ts:102](../server/src/routes/cards.ts#L102), [cards.ts:381-384](../server/src/routes/cards.ts#L381-L384), [cards.ts:421-429](../server/src/routes/cards.ts#L421-L429), [lists.ts:99](../server/src/routes/lists.ts#L99), [lists.ts:121](../server/src/routes/lists.ts#L121), [boards.ts:95](../server/src/routes/boards.ts#L95), [views.ts:34](../server/src/routes/views.ts#L34), [seed.ts:336](../server/src/db/seed.ts#L336), [system.ts:25](../server/src/routes/system.ts#L25).

Thay bảng bằng **view cùng tên + INSTEAD OF trigger** (SQL ở D3) thì toàn bộ câu lệnh cũ chạy nguyên vẹn — kể cả `INSERT OR IGNORE` và `DELETE ... WHERE card_id = ?` (xóa nhiều dòng, không có `label_id`).

Đã dựng lại schema thu nhỏ và chạy đúng các câu SQL trích từ mã nguồn — **13/13 trường hợp đạt**:

| Kiểm chứng | Kết quả |
| --- | --- |
| `SELECT l.* … JOIN card_labels` (cards.ts:102, :429) | ✅ |
| `SELECT cl.card_id, cl.label_id FROM card_labels cl` (boards.ts:95) | ✅ |
| `SELECT card_id, label_id FROM card_labels` (views.ts:34) | ✅ |
| `INSERT OR IGNORE INTO card_labels` — sao chép thẻ (cards.ts:384, lists.ts:99) | ✅ |
| `INSERT OR IGNORE` chạy lại lần 2, không lỗi trùng khóa | ✅ |
| `DELETE FROM card_labels WHERE card_id = ?` rồi gắn lại (cards.ts:421) | ✅ |
| Không ảnh hưởng nhãn của thẻ khác | ✅ |
| Xóa thẻ → tự dọn liên kết (thay `ON DELETE CASCADE`) | ✅ |
| Xóa danh sách → cascade xuống thẻ → dọn liên kết | ✅ |
| Gắn nhãn cho Account/Opportunity trong cùng bảng mới | ✅ |
| Đếm số bản ghi mỗi nhãn bằng 1 truy vấn `GROUP BY` (FR-TAG-38) | ✅ |
| Xóa nhãn → dọn liên kết ở mọi loại đối tượng | ✅ |
| `SELECT * FROM card_labels` cho xuất JSON (system.ts:135) | ✅ |

> Kịch bản kiểm chứng nằm ở thư mục tạm của phiên làm việc (`scratchpad/test-view.mjs`); nên chuyển thành test hồi quy trong repo khi bắt tay làm.

**Đánh đổi cần biết:** view khiến `card_labels` thành dữ liệu dẫn xuất — nếu sau này thêm `label_links` vào danh sách xuất JSON thì liên kết thẻ sẽ xuất hiện hai lần trong tệp xuất (một lần ở `card_labels`, một lần ở `label_links`). Vô hại vì chức năng chỉ xuất, không nhập lại ([system.ts:135](../server/src/routes/system.ts#L135)), nhưng phải ghi chú cho người đọc tệp xuất.

## G2. Bảng ảnh hưởng theo tệp

| Mức | Tệp | Việc |
| --- | --- | --- |
| 🟢 **Tạo mới** | `server/src/db/migrate-v9.sql` | Toàn bộ migration |
| 🟢 **Tạo mới** | `client/src/components/common/LabelPicker.tsx`, `LabelChips.tsx` | Hai thành phần dùng chung cho mọi màn hình |
| 🟡 **Thêm 1–2 dòng** | [migrate.ts](../server/src/db/migrate.ts) | `LATEST_VERSION = 9` + một khối `if (current === 8)` theo đúng khuôn có sẵn |
| 🟡 **Thêm 1 dòng** | [system.ts:25](../server/src/routes/system.ts#L25) | Thêm `'label_links'` vào `TABLES` (FR-TAG-35) |
| 🟠 **Mở rộng trong module nhãn** | [labels.ts](../server/src/routes/labels.ts), [SettingsPage.tsx](../client/src/pages/SettingsPage.tsx) | Viết thêm; route/khối cũ giữ nguyên |
| 🟠 **Chèn thêm, không đổi logic cũ** | `CustomerDetailPage`, `CustomersPage`, `PipelinePage`, `DealForm` | Chèn `<LabelChips>` / `<LabelPicker>` và một mục lọc |
| 🟠 **Thêm nhánh, mặc định giữ nguyên** | [BoardFilter.tsx](../client/src/components/kanban/BoardFilter.tsx), [BoardView.tsx:53](../client/src/components/kanban/BoardView.tsx#L53) | Thêm nút VÀ/HOẶC; **mặc định HOẶC** đúng như hiện tại |
| 🟠 **Chỉ thêm chuỗi/kiểu** | [i18n/vi.ts](../client/src/i18n/vi.ts), [types.ts](../client/src/types.ts) | Thêm khóa mới, trường mới để tùy chọn |
| ⚪ **Không đụng** | `cards.ts`, `lists.ts`, `boards.ts`, `views.ts`, `seed.ts`, `CardModal.tsx`, `CardItem.tsx` | Chạy y nguyên nhờ G1 |
| ⚪ **Không đụng** | `services.ts`, `revenues.ts`, `contracts.ts`, `quotations.ts`, `documents.ts`, `cardFields.ts`, `customers.ts`, `deals.ts` | Không có thay đổi nào |

Tức là **không một module nghiệp vụ nào (Dịch vụ, Doanh thu, Hợp đồng, Báo giá, Tài liệu, Trường tùy chỉnh) bị chạm tới**.

## G3. Xử lý 4 điểm trùng lặp mà không refactor module khác

| Trùng lặp | Cách "sạch" (có refactor) | **Cách không ảnh hưởng — chọn cách này** |
| --- | --- | --- |
| B1 Sản phẩm | `deals.product` → `service_id` | Không tạo nhóm nhãn Sản phẩm. Màn tạo nhãn **đọc chỉ đọc** `services.name` để cảnh báo mềm |
| B2 `customers.status` | — | Từ điển tên bị trùng → cảnh báo mềm |
| B3 `deals.stage` | Thêm stage "Tạm dừng" | Không thêm gì; cảnh báo mềm |
| B4 `cards.priority` | — | Cảnh báo mềm |
| B6 `card_fields` select | — | Ghi bảng ranh giới (B6) vào tài liệu + hiện gợi ý ngay trong màn tạo nhãn |

**FR-TAG-39 – Cảnh báo trùng trường nghiệp vụ (bổ sung ở v1.2)**
Khi tạo hoặc đổi tên nhãn, hệ thống so tên (đã bỏ dấu) với từ điển:

- `services.name` — truy vấn chỉ đọc, không sửa gì của module Dịch vụ;
- danh sách tĩnh: trạng thái khách hàng, 7 giai đoạn cơ hội, 4 mức ưu tiên, `doc_type` (lấy từ [i18n/vi.ts](../client/src/i18n/vi.ts), không đụng CSDL).

Nếu trùng → cảnh báo **mềm**, không chặn:

```text
Tên nhãn "CRM" trùng với Dịch vụ đã có trong danh mục.
Nên lọc theo Dịch vụ thay vì tạo nhãn — nếu không, số liệu doanh thu và số liệu theo nhãn sẽ lệch nhau.

[ Vẫn tạo nhãn ]   [ Hủy ]
```

Chọn cảnh báo mềm thay vì chặn cứng vì có ngoại lệ hợp lệ (ví dụ nhãn `Meeting` là loại công việc, khác hoàn toàn dịch vụ tên `Meeting`), và chặn cứng sẽ khiến người dùng đi vòng bằng cách đặt tên méo mó.

## G4. Yêu cầu phải hoãn vì không thể làm mà không đụng module khác

| Yêu cầu | Vì sao đụng | Xử lý |
| --- | --- | --- |
| FR-TAG-36 – nhãn vào `search_text` | Phải sửa `buildSearchText` và mọi chỗ ghi `search_text` của customers / deals / cards; đổi tên nhãn phải ghi lại hàng loạt bản ghi | **Hoãn.** Thay thế rẻ hơn ở giai đoạn 3: `Ctrl + K` thêm nhóm kết quả *Nhãn* bằng một truy vấn riêng trên `label_links` — chỉ chạm 1 tệp, không đổi dữ liệu |
| Cột **Nhãn** trong xuất CSV | Sửa hàm xuất trong `system.ts` | Giai đoạn 3, thuần cộng thêm cột |
| Auto-tag theo điều kiện (mục 19 BRD 1.0) | Phải bám vào dữ liệu của Cơ hội/Hoạt động, dễ chọi với Dashboard (B5) | **Không làm ở dự án này** |
| Nhãn cho Tài liệu | Trùng `doc_type` (B8) | Ngoài phạm vi |

## G5. Lộ trình 5 bước — mỗi bước dừng lại được

| Bước | Nội dung | Sau bước này người dùng thấy gì | Đường lui |
| --- | --- | --- | --- |
| **0** | Chạy migration v9, chưa động vào giao diện | **Không thấy gì thay đổi** — mọi thứ chạy y như cũ | Tái tạo `card_labels` từ `label_links` |
| **1** | Mở rộng API nhãn (cây, phạm vi, đếm, gộp); route cũ nguyên vẹn | Chưa thấy gì | Bỏ route mới |
| **2** | Màn *Cài đặt → Quản lý nhãn* dạng cây: cha–con, màu, mô tả, Inactive, số bản ghi, tìm kiếm, FR-TAG-39 | Quản lý nhãn tốt hơn; nhãn trên thẻ không đổi | Trả lại khối cũ ở `SettingsPage` |
| **3** | Gắn/gỡ nhãn cho **Account** và **Opportunity** + lọc theo nhãn ở hai trang đó + mở dữ liệu từ nhãn | Nhãn dùng được cho CRM | Ẩn thành phần vừa chèn |
| **4** | Lọc VÀ/HOẶC, gộp nhãn, hàng loạt + hoàn tác, gắn sao, nhãn gần đây, cột Nhãn trong CSV | Tiện ích nâng cao | Từng mục độc lập |

**Bước 0 là bước quan trọng nhất**: sau khi chạy, hệ thống phải hành xử **giống hệt trước đó**. Đó là bằng chứng phương án không ảnh hưởng module khác.

## G6. Kiểm thử hồi quy tối thiểu sau bước 0

Chạy `npm run dev` rồi kiểm đủ 9 mục — tất cả phải hoạt động y như trước:

1. Mở một thẻ có nhãn → nhãn hiển thị đủ.
2. Gắn thêm nhãn, gỡ nhãn trên thẻ → lưu đúng sau khi tải lại trang.
3. **Sao chép thẻ** → bản sao mang đúng bộ nhãn ([cards.ts:381-386](../server/src/routes/cards.ts#L381-L386)).
4. **Sao chép cả danh sách kèm thẻ** → nhãn theo sang đủ ([lists.ts:99-121](../server/src/routes/lists.ts#L99-L121)).
5. Bộ lọc nhãn trên bảng Kanban → vẫn logic HOẶC, số bộ lọc đang bật đúng.
6. Bốn dạng xem (Bảng / Lịch / Dòng thời gian / Bảng tính) → nhãn hiện đúng ([views.ts:34](../server/src/routes/views.ts#L34)).
7. Xóa một thẻ → không còn liên kết mồ côi: `SELECT COUNT(*) FROM label_links WHERE entity_type='card' AND entity_id NOT IN (SELECT id FROM cards)` phải bằng 0.
8. Xóa một nhãn ở màn Cài đặt → biến mất khỏi mọi thẻ.
9. **Sao lưu ngay** + **Xuất dữ liệu JSON** → chạy được, `card_labels` trong tệp xuất đủ số dòng như trước khi nâng cấp.

Kèm theo: chạy `npm run seed` trên CSDL trống để chắc chắn [seed.ts:336](../server/src/db/seed.ts#L336) vẫn ghi được nhãn qua view.

---

# PHẦN H – TRẠNG THÁI TRIỂN KHAI (đã chạy ngày 11/08/2026)

Toàn bộ Phần G đã được thực hiện. Cơ sở dữ liệu đã ở **schema v9**; 4 nhãn cũ giữ nguyên `label_id` 1–4, nằm trong nhóm *Chưa phân nhóm* (id 5), 5 liên kết thẻ chuyển sang `label_links` đầy đủ.

## H1. Đã làm

| Bước | Nội dung | Tệp |
| --- | --- | --- |
| 0 | Migration v9: 8 cột mới cho `labels`, bảng `label_links`, view `card_labels` + 2 INSTEAD OF trigger, 5 trigger dọn liên kết, nhóm *Chưa phân nhóm* | [migrate-v9.sql](../server/src/db/migrate-v9.sql) (mới), [migrate.ts](../server/src/db/migrate.ts) |
| 0 | Điền `name_norm` (bỏ dấu) ở TypeScript rồi mới tạo chỉ mục duy nhất; tự đổi tên nếu dữ liệu cũ có nhãn trùng trong cùng nhóm | `fillLabelNameNorm` trong [migrate.ts](../server/src/db/migrate.ts) |
| 1 | API nhãn đầy đủ: cây, phạm vi, đếm 1 truy vấn, gộp, mở bản ghi, cảnh báo trùng, gắn nhãn đa đối tượng, hàng loạt | [labels.ts](../server/src/routes/labels.ts) |
| 2 | Màn *Cài đặt → Quản lý nhãn* dạng cây: tạo/sửa/xóa/vô hiệu hóa, 12 màu, mô tả, phạm vi, số bản ghi, tìm kiếm không dấu, gộp nhãn, mở bản ghi | [LabelManager.tsx](../client/src/components/labels/LabelManager.tsx) (mới) |
| 3 | Gắn/gỡ nhãn cho **Account** (hồ sơ khách hàng) và **Opportunity** (biểu mẫu cơ hội); nhãn hiện trên danh sách Khách hàng và card Pipeline | [EntityLabels.tsx](../client/src/components/labels/EntityLabels.tsx), [LabelChips.tsx](../client/src/components/labels/LabelChips.tsx) (mới) |
| 3 | Lọc theo nhãn ở trang Khách hàng và Cơ hội | [LabelFilter.tsx](../client/src/components/labels/LabelFilter.tsx) (mới) |
| 4 | Lọc VÀ/HOẶC trên bảng Kanban — **mặc định HOẶC**, đúng hành vi cũ | [BoardFilter.tsx](../client/src/components/kanban/BoardFilter.tsx), [BoardView.tsx](../client/src/components/kanban/BoardView.tsx) |

**Yêu cầu đã hiện thực:** FR-TAG-01…19, 21…27, 30, 31, 32, 34, 37, 38, 39 · BR-TAG-01…20.

## H2. Mức chạm vào module khác — đúng như cam kết Phần G

- **Không sửa dòng nào**: `cards.ts`, `lists.ts`, `views.ts`, `CardModal.tsx`, `CardItem.tsx`, và toàn bộ module Dịch vụ / Doanh thu / Hợp đồng / Báo giá / Tài liệu / Trường tùy chỉnh.
- **Thêm 1 dòng**: [system.ts](../server/src/routes/system.ts) — `'label_links'` vào danh sách xuất JSON.
- **Sửa 1 truy vấn, giữ nguyên hành vi**: [boards.ts:118](../server/src/routes/boards.ts#L118) — lọc ra nhãn gắn được để nhóm nhãn không lọt vào bộ lọc bảng.
- **Sửa phần khởi tạo nhãn của seed**: [seed.ts:23-41](../server/src/db/seed.ts#L23-L41) — nhãn mẫu nay nằm trong nhóm *Loại công việc* thay vì phẳng. Bắt buộc phải sửa vì cấu trúc 2 cấp; đây là chỗ duy nhất ngoài dự kiến của Phần G.
- **Chèn thêm, không đổi logic cũ**: `CustomersPage`, `CustomerDetailPage`, `PipelinePage`, `DealCard`, `DealForm`, `SettingsPage`, `BoardFilter`, `uiStore`, `i18n/vi.ts`, `types.ts`.

## H3. Kết quả kiểm thử

| Bộ kiểm thử | Kết quả |
| --- | --- |
| Hồi quy bước 0 trên API thật (G6: đọc/gắn/gỡ nhãn thẻ, sao chép thẻ, sao chép danh sách, bảng, dạng xem, xuất JSON, liên kết mồ côi) | **10/10 đạt** |
| Nghiệm thu API nhãn theo AC (AC-TAG-01, 02, 03, 09, 10, 11, 12, 13, 14, 16; BR-TAG-03; FR-TAG-10, 11, 24, 30, 39) | **21/21 đạt** |
| Đường cài đặt mới: schema trống → v9 + seed | **6/6 đạt** |
| `tsc --noEmit` client và server, `npm run build` | Sạch |
| Chụp màn hình thật: Cài đặt, Khách hàng, Hồ sơ khách hàng, Pipeline | Hiển thị đúng |

Dữ liệu nhãn dùng để chụp màn hình đã được xóa sạch — cơ sở dữ liệu trở lại đúng trạng thái trước khi kiểm thử.

## H4. Còn lại cho giai đoạn sau

- Giao diện gắn/gỡ nhãn **hàng loạt** — API `POST /api/labels/bulk` đã có và đã kiểm thử, chưa có nút trên danh sách — kèm hoàn tác (FR-TAG-33).
- Gắn sao nhãn (FR-TAG-28), nhãn gần đây (FR-TAG-29), kéo thả sắp xếp (FR-TAG-20).
- Nhãn cho **Contact** và **Contract**: API đã hỗ trợ, chưa gắn vào giao diện.
- Cột **Nhãn** trong xuất CSV (FR-TAG-35 phần CSV); nhãn vào `search_text` (FR-TAG-36 — vẫn hoãn theo G4).
- Chuyển các kịch bản kiểm thử đang nằm ở thư mục tạm thành test hồi quy trong repo.
