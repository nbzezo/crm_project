# RÀ SOÁT & CẬP NHẬT SPEC – CHẤM ĐIỂM CƠ HỘI B2B (BANT + 4P)

**Phiên bản spec:** 1.0 → **1.1 (đã đối chiếu mã nguồn WorkFlow)**
**Tài liệu gốc:** [CRM-Opportunity-Scoring-BANT-4P-Spec.md](../CRM-Opportunity-Scoring-BANT-4P-Spec.md)
**Ngày rà soát:** 11/08/2026
**Hệ thống đích:** WorkFlow — Kanban + CRM B2B cá nhân, chạy local, **một người dùng, không đăng nhập**, SQLite (`server/data/app.db`), schema đang ở **v9**.

> **Kết luận nhanh:** Phương pháp luận của spec (Mục 1 và 3) **đúng và nên giữ nguyên 100%** — tách BANT khỏi 4P, bằng chứng bắt buộc, không suy đoán, không tự cộng điểm theo giai đoạn, veto độc lập tổng điểm. Vấn đề nằm ở **lớp hiện thực**:
>
> 1. Spec viết cho hệ thống doanh nghiệp nhiều người dùng (PostgreSQL, `uuid`, `jsonb`, `owner_id`, 4 vai trò, peer review). WorkFlow là app local một người, SQLite, khóa `INTEGER`. **3/10 tính năng (F-04 override, F-09, Mục 6) mất chỗ dựa phân quyền** — phải viết lại, không bỏ ý tưởng.
> 2. **Bốn khái niệm trong spec đã có sẵn trong hệ thống dưới tên khác** (vai trò mua, quan hệ, đối thủ, staleness). Làm mới sẽ tạo nguồn sự thật thứ hai — đúng lỗi mà [BRD Nhãn v1.2](./BRD-Quan-ly-nhan-v1.1.md) đã chỉ ra ở Phần B.
> 3. **Sáu cột trong Mục 2 là dữ liệu dẫn xuất** đang bị lưu thành cột — lặp lại lỗi `label_level` (C7 của BRD Nhãn).
> 4. **Lỗ hổng nặng nhất: rubric và mô hình dữ liệu không ràng buộc lẫn nhau.** Chấm TIMELINE = 3 mà không cần tồn tại bản ghi `compelling_event` nào. Không có ràng buộc này thì nguyên tắc "không suy đoán" ở Mục 0 chỉ là lời khuyên.
>
> Phần E liệt kê **9 tính năng chưa có trong spec** cần bổ sung — không phải để làm to hơn, mà vì thiếu chúng thì rubric không thể được chấm đúng (ví dụ TIMELINE = 3 đòi "lịch triển khai ngược" nhưng không tính năng nào tạo ra nó).

---

# PHẦN A – HIỆN TRẠNG HỆ THỐNG (spec chưa nhắc tới)

| Khái niệm trong spec | Đã có trong WorkFlow | Vị trí |
| --- | --- | --- |
| `opportunity.amount`, `expected_close_date`, `stage` | `deals.value_vnd`, `won_value_vnd`, `expected_close_date`, 7 giai đoạn | [migrate-v4.sql:40-66](../server/src/db/migrate-v4.sql#L40-L66) |
| `buying_committee_member.role` | `contacts.buying_role` — **9 giá trị**, có `economic_buyer`, `technical`, `user`, `influencer` | [migrate-v4.sql:36](../server/src/db/migrate-v4.sql#L36), [i18n/vi.ts:213](../client/src/i18n/vi.ts#L213) |
| Chiều sâu quan hệ | `contacts.relationship` — 5 mức (Rất tốt → Không thuận lợi) | [i18n/vi.ts:224](../client/src/i18n/vi.ts#L224) |
| `evidence_source_type/id` | `interactions` — 9 loại, có `result`, gắn được vào deal; `documents` gắn vào deal | [migrate-v4.sql:84-100](../server/src/db/migrate-v4.sql#L84-L100) |
| `competitor_position` | `deals.competitor` — **TEXT tự do**, không có danh mục đối thủ | [migrate-v4.sql:58](../server/src/db/migrate-v4.sql#L58) |
| Pain / Need | `deals.need` — TEXT tự do | [migrate-v4.sql:57](../server/src/db/migrate-v4.sql#L57) |
| `score_staleness_days` | `STALE_DAYS = 14` — "cơ hội nguội" theo **hoạt động**, không phải theo điểm | [crm.ts:91](../server/src/lib/crm.ts#L91) |
| Forecast | `weighted_pipeline = Σ value × probability`, `probability` **tự đặt theo giai đoạn** | [crm.ts:15](../server/src/lib/crm.ts#L15), [views.ts:276-290](../server/src/routes/views.ts#L276-L290) |
| F-07 Cảnh báo | Dashboard *Cơ hội cần chú ý* — 4 nhóm tính động | [views.ts:293-320](../server/src/routes/views.ts#L293-L320) |
| F-10 Win/loss | `win_rate` ở Báo cáo + `LOST_REASONS` **10 giá trị** | [crm.ts:31](../server/src/lib/crm.ts#L31), [ReportsPage.tsx:47](../client/src/pages/ReportsPage.tsx#L47) |
| Biểu đồ F-02, F-05 | `recharts` đã có trong dự án (ScatterChart dùng được ngay) | [client/package.json](../client/package.json) |
| `score_history` append-only | **Chưa có gì tương đương** — hệ thống không có bảng nhật ký thay đổi nào | — |
| Mục 6 Phân quyền | **Không có.** Không đăng nhập, không `user`, không `owner_id` | [README.md:3](../README.md#L3) |

**Hệ quả với spec:**

1. **Mục 2 phải viết lại theo quy ước SQLite của repo**: khóa `INTEGER PRIMARY KEY`, ngày là `TEXT 'YYYY-MM-DD'`, tiền là `INTEGER` VND, mốc thời gian là `datetime('now','localtime')` ([schema.sql:1-3](../server/src/db/schema.sql#L1-L3)). Không có `uuid`, `jsonb`, `timestamptz`, `decimal`, `currency`.
2. Migration phải theo khuôn có sẵn: một tệp `migrate-v10.sql` + một khối `if (current === 9)` trong [migrate.ts](../server/src/db/migrate.ts) (`LATEST_VERSION` hiện là 9).
3. Spec **không có mục tương thích ngược**: `probability`, weighted pipeline và Dashboard đang chạy sẽ nói ngược với ô ma trận nếu không xử lý (xem B1).
4. `owner_id`, `scored_by`, `changed_by`, `currency`, và toàn bộ Mục 6 **bỏ khỏi mô hình** — giữ lại chỉ tạo cột luôn NULL.

---

# PHẦN B – TRÙNG LẶP VỚI MODULE ĐÃ CÓ

Mức độ: 🔴 trùng nặng (phải sửa spec) · 🟠 trùng vừa (phải đặt ranh giới) · 🟡 trùng khái niệm (thống nhất UX)

## B1. 🔴 `bant_total` / `p4_total` / `quadrant` ⟷ `deals.probability` + weighted pipeline

`probability` hiện **tự đặt theo giai đoạn**: `lead 10 → approaching 20 → discussing 40 → quoted 60 → negotiating 80` ([crm.ts:15](../server/src/lib/crm.ts#L15)), áp cứng mỗi lần đổi stage ([deals.ts:161-170](../server/src/routes/deals.ts#L161-L170)). Đây **chính xác là thứ Mục 3.6 của spec cấm**: *"Điểm không tăng chỉ vì deal chuyển giai đoạn"*.

Nếu thêm điểm mà không xử lý `probability`, một cơ hội sẽ mang hai chỉ số chất lượng mâu thuẫn: Dashboard báo weighted pipeline 4,2 tỷ trong khi ma trận nói một nửa pipeline nằm ở ô NURTURE.

**Xử lý (không refactor module nào):**

- Giữ `probability` nguyên vẹn, **đổi cách gọi** trong giao diện: "xác suất theo giai đoạn" — đây đúng là *forecast truyền thống* mà F-08 lấy làm số thứ nhất.
- Điểm BANT/4P là số thứ hai. **F-08 chính là chỗ hai con số gặp nhau**: chênh lệch = mức thổi phồng pipeline. Đây là lý do tồn tại của F-08, phải ghi rõ vào spec.
- **Cấm** để điểm BANT tự sửa `probability`. Nếu làm, ta lại vi phạm 3.6 theo chiều ngược lại và mất luôn phép đo chênh lệch.

## B2. 🔴 `buying_committee_member` ⟷ `contacts.buying_role` + `contacts.relationship`

Hệ thống **đã có 9 vai trò mua** ở cấp người liên hệ. Tạo bảng mới mang enum riêng (`ECONOMIC/TECHNICAL/USER/CHAMPION/BLOCKER/INFLUENCER`) sẽ có **hai từ điển vai trò mua song song** — người dùng nhập một chỗ, hệ thống chấm điểm đọc chỗ kia.

Ba khoảng trống thật sự của hệ thống hiện tại: (a) vai trò gắn với **khách hàng**, không gắn với **từng cơ hội**; (b) không có **thái độ** (stance); (c) không có mức ảnh hưởng.

**Xử lý:**

- Bảng nối `deal_committee(deal_id, contact_id, …)` **không chứa enum vai trò riêng**. Vai trò đọc từ `contacts.buying_role`; thêm `role_override` (NULL = kế thừa) cho trường hợp một người giữ vai trò khác ở cơ hội cụ thể.
- **Ánh xạ vai trò (bắt buộc ghi vào spec):** `ECONOMIC` ← `economic_buyer` \| `decision_maker`; `TECHNICAL` ← `technical`; `USER` ← `user`; `INFLUENCER` ← `influencer` \| `procurement` \| `finance` \| `legal`.
- **`CHAMPION` và `BLOCKER` trong spec là thái độ, không phải chức năng.** Một economic buyer hoàn toàn có thể đồng thời là champion — enum phẳng của spec không mô tả được điều đó. Tách thành `stance ∈ supporter/neutral/opposed/unknown` + cờ `is_champion`.
- **`last_contact_at` không lưu** — tính từ `interactions` (mốc gần nhất của contact đó). Lưu là bịa nguồn sự thật thứ hai, đúng lỗi B5 của BRD Nhãn (nhãn tĩnh nói ngược Dashboard động).
- `contacts.relationship` (cấp người, 5 mức) **khác** 4P RELATIONSHIP (cấp cơ hội, đo chiều sâu + chiều rộng). Giữ cả hai; màn chấm điểm hiển thị `relationship` của các thành viên như **dữ liệu tham chiếu**, tuyệt đối không tự quy ra điểm.

## B3. 🔴 `competitor_position` ⟷ `deals.competitor` (TEXT tự do)

Spec giả định có danh mục đối thủ (`competitor_id`). Hệ thống không có, và tạo mới sẽ lặp đúng lỗi B1 của BRD Nhãn (`deals.product` tự do vs danh mục Dịch vụ).

**Xử lý (rẻ, hợp hệ thống một người dùng):** **không tạo danh mục đối thủ**. Bảng `deal_competitors(deal_id, name, name_norm, incumbent, shaped_requirements, price_position)` — tên vẫn là text, chuẩn hóa bằng helper bỏ dấu đã có ([viSearch.ts](../server/src/lib/viSearch.ts)) để gợi ý tên đã nhập trước đó. Ba trường quyết định (`incumbent`, `shaped_requirements`, `price_position`) là **thứ duy nhất** mà veto V3 và rubric PRICE cần. `deals.competitor` giữ nguyên, migration chép giá trị hiện có sang dòng đầu.

## B4. 🟠 `compelling_event` ⟷ `next_action_date` + `expected_close_date`

Không trùng dữ liệu nhưng **trùng chỗ nhập**: người dùng sẽ gõ ngày sự kiện vào Next Action.

**Ranh giới bắt buộc ghi vào spec:** Next Action = việc **của ta**, có thể dời tùy ý. Compelling event = ràng buộc **của khách**, dời được thì không phải compelling event. Thêm kiểm tra mềm: `expected_close_date` phải ≤ `event_date`; lệch thì cảnh báo, không chặn.

## B5. 🟠 Staleness 30 ngày ⟷ `STALE_DAYS = 14`

Hai ngưỡng "nguội" khác nhau sẽ xuất hiện trên cùng một màn hình cơ hội.

**Xử lý:** không đổi 14 (Dashboard đang dùng). Đặt tên phân biệt rõ trong giao diện: **"Nguội tương tác (14 ngày)"** ≠ **"Điểm quá hạn (30 ngày)"**, và đưa cả hai vào cùng một chỗ cấu hình để người dùng thấy chúng là hai thứ.

## B6. 🟠 F-07 Cảnh báo ⟷ Dashboard *Cơ hội cần chú ý*

Bài học B5 của BRD Nhãn: cảnh báo mới phải **tính động trong cùng endpoint** [views.ts:293](../server/src/routes/views.ts#L293), thêm nhóm vào đối tượng `attention` sẵn có. **Không** dựng hàng đợi thông báo lưu trữ riêng — điểm thay đổi thì thông báo cũ sẽ nói ngược Dashboard.

Nhóm mới đề xuất: `score_stale` (điểm quá 30 ngày), `veto` (đang có cờ phủ quyết), `reshape` (vừa rơi vào ô RESHAPE), `event_near` (compelling event trong 14 ngày mà stage chưa tới `negotiating`).

## B7. 🟠 Ô DISQUALIFY ⟷ `stage = 'lost'` + `LOST_REASONS`

F-07 đề xuất tự đóng deal DISQUALIFY sau 14 ngày, nhưng "đóng" trong hệ thống này là chuyển `stage = 'lost'` và **bắt buộc có `lost_reason`** ([deals.ts:92](../server/src/routes/deals.ts#L92)).

**Xử lý:** hộp thoại xác nhận **điền sẵn** `lost_reason` suy từ yếu tố thấp nhất (bảng ánh xạ ở E — F-16), người dùng vẫn phải bấm xác nhận. Không tự đóng.

## B8. 🟡 `quadrant` / `veto` **không được** làm nhãn

BRD Nhãn có checklist BR-TAG-19 liệt kê các trường nghiệp vụ mà nhãn không được trùng vai trò. **Bổ sung vào checklist đó:** ô ma trận, cờ veto, và 8 yếu tố chấm điểm. Nếu không, sẽ có người tạo nhãn "PURSUE" và hai màn hình nói ngược nhau.

## B9. 🟡 Mục 6 Phân quyền ⟷ hệ thống một người dùng

Đúng kết luận C20 của BRD Nhãn: không đăng nhập, không vai trò.

- Bỏ toàn bộ Mục 6, bỏ `owner_id` / `scored_by` / `changed_by`.
- **F-09 Peer Review mất chỗ dựa** — nhưng vấn đề nó giải quyết (4P là phần thiên kiến lạc quan nặng nhất) là có thật và không biến mất khi chỉ có một người. Thay bằng cơ chế khác, xem **F-13** ở Phần E.
- F-04 override: giữ, nhưng là **tự xác nhận có lý do bắt buộc**, ghi vào lịch sử. Giá trị nằm ở dấu vết để lại, không ở việc ai duyệt.

### Bảng tổng hợp trùng lặp

| # | Hạng mục trong spec | Module đã có | Mức | Quyết định |
| --- | --- | --- | --- | --- |
| B1 | `quadrant`, tổng điểm | `deals.probability`, weighted pipeline | 🔴 | Hai chỉ số song song; chênh lệch = F-08. Cấm điểm sửa `probability` |
| B2 | `buying_committee_member` | `contacts.buying_role`, `relationship` | 🔴 | Bảng nối, kế thừa vai trò; tách stance khỏi role; `last_contact_at` tính động |
| B3 | `competitor_position` | `deals.competitor` | 🔴 | Không tạo danh mục đối thủ; bảng `deal_competitors` giữ tên text |
| B4 | `compelling_event` | `next_action_date` | 🟠 | Ranh giới "việc của ta" ≠ "ràng buộc của khách" |
| B5 | Staleness 30 ngày | `STALE_DAYS = 14` | 🟠 | Hai tên gọi phân biệt, một chỗ cấu hình |
| B6 | F-07 Cảnh báo | Dashboard `attention` | 🟠 | Thêm nhóm tính động, cấm hàng đợi thông báo |
| B7 | Tự đóng DISQUALIFY | `stage='lost'` + `lost_reason` | 🟠 | Điền sẵn lý do, vẫn cần xác nhận |
| B8 | Ô ma trận | Module Nhãn | 🟡 | Thêm vào checklist BR-TAG-19 |
| B9 | Mục 6 Phân quyền | Hệ thống một người | 🟡 | Bỏ; F-09 → F-13 |

---

# PHẦN C – MÂU THUẪN & LỖ HỔNG TRONG SPEC 1.0

| # | Vị trí | Vấn đề | Hướng chốt |
| --- | --- | --- | --- |
| C1 | Mục 2.1 | **6 cột là dữ liệu dẫn xuất bị lưu:** `quadrant`, `veto_flags`, `forecast_eligible`, `score_staleness_days`, và cả `axis` ở 2.2 (suy được từ `factor`). Lặp lỗi `label_level` (C7 BRD Nhãn) | Chỉ lưu `bant_total`, `p4_total`, `score_updated_at`. Bốn thứ còn lại tính khi đọc qua VIEW. Giữ 2 tổng vì cần lọc/sắp xếp ở danh sách |
| C2 | Mục 2.2 | *"Mỗi cơ hội có đúng 8 bản ghi"* — **không nói sinh lúc nào**, không nói ai tính lại tổng | Sinh **lười** (chỉ khi chấm). Yếu tố thiếu = 0/chưa xác thực. Tổng luôn tính trên đủ 8 yếu tố. Tính lại tổng ngay trong giao dịch ghi điểm |
| C3 | Mục 2.2 | Ràng buộc `score = 0 OR length(evidence) >= 20` **chặn nhầm**: điểm 0 do *"thông tin tiêu cực rõ ràng"* (3.1) là điểm **cần bằng chứng nhất** nhưng lại không được phép ghi | Cho phép evidence ở mọi mức điểm; ràng buộc độ dài chỉ áp cho `score ≥ 1`. Ghi rõ 20 ký tự là gờ giảm tốc, không phải kiểm soát chất lượng |
| C4 | F-06 vs Mục 2.2 | F-06 nói điểm AI ở trạng thái `suggested`, **mô hình dữ liệu không có cột trạng thái nào** → không lưu được đề xuất | Thêm `status ∈ suggested \| confirmed`. Tổng điểm **chỉ tính trên `confirmed`** |
| C5 | Mục 2.2 | `verified = true khi có evidence_source_id hợp lệ` — không nói **xóa hoạt động gốc** thì sao. `interactions` xóa thật ([interactions.ts:152](../server/src/routes/interactions.ts#L152)) | Trigger đặt lại `verified = 0`, ghi lịch sử với lý do. Đúng lỗi liên kết mồ côi C9 của BRD Nhãn |
| C6 | Mục 3.6 | `confidence = verified / 8` **sai lệch hai chiều**: 8 yếu tố đều chấm 1 và có nguồn → confidence 1.0 dù deal rất yếu; deal tốt còn 2 yếu tố chưa gặp khách bị phạt hai lần (điểm thấp + confidence thấp) | `confidence = verified / số yếu tố đã chấm (score ≥ 1)`, hiển thị kèm **"đã chấm n/8"**. Hai con số, không gộp |
| C7 | Mục 3.2, 3.3 vs Mục 2 | **Lỗ hổng nặng nhất: rubric không ràng buộc với dữ liệu.** Chấm TIMELINE = 3 mà không cần tồn tại `compelling_event` nào; AUTHORITY = 3 mà không cần thành viên `ECONOMIC`; PROCESS = 3 mà không có gì về tiêu chí thầu. Nguyên tắc "không suy đoán" ở Mục 0 chỉ còn là lời khuyên | Bộ **BR-SCR-01…06** ở D2, **chặn cứng ở tầng API** |
| C8 | Mục 3.5 | V1 gần trùng với TIMELINE ≤ 2, V2 gần trùng AUTHORITY ≤ 1 — không sai (veto là bộ lọc forecast, độc lập tổng điểm) nhưng người đọc sẽ tưởng là hai kiểm tra khác nhau | Ghi rõ quan hệ; giao diện chỉ đúng **một chỗ để sửa** (tạo compelling event / thêm thành viên), không bắt sửa hai nơi |
| C9 | Mục 3.5 | **V3 cộng đôi:** PROCESS = 0 đã ghi *"phát hiện tiêu chí thầu do đối thủ soạn"* → deal đã rơi 4P thấp → đã vào RESHAPE. V1/V2 nói về *deal có tồn tại không* (chặn forecast là đúng bản chất); V3 nói về *vị thế* — thứ trục 4P đã đo | **Việc cần quyết (G1).** Đề xuất: V3 xuống mức *cảnh báo bắt buộc rà soát*, không tự chặn forecast |
| C10 | Mục 3.4 | Ngưỡng 7 tạo vách đứng: 6 → 7 lật ô, cảnh báo F-07 sẽ rung lắc mỗi lần sửa một yếu tố | Hiển thị khoảng cách tới ranh giới ("BANT 7/12 — cách ranh giới 1 điểm"). Cảnh báo "rơi vào RESHAPE" chỉ bắn khi lệch ≥ 2 điểm hoặc giữ nguyên ô qua 2 lần chấm |
| C11 | Mục 3.1 | Trọng số bằng nhau (BUDGET nặng ngang NEED) là một **quyết định**, spec không nói ra | Ghi rõ: MVP trọng số 1 vì minh bạch và chưa có dữ liệu. F-10 chỉ được hiệu chỉnh **ngưỡng**; không đổi trọng số cho tới khi có ≥ 30 deal đã chốt, nếu không là khớp nhiễu |
| C12 | F-10 | Cần "điểm tại thời điểm chốt" nhưng không nói lấy ở đâu; dựng lại từ `score_history` là suy diễn ngược | Chụp `score_snapshot` (JSON) ngay khi chuyển `won/lost`. Điểm của deal đã chốt **khóa, chỉ đọc** |
| C13 | Mục 2.6 | `score_history` *"append-only, không cho xóa"* mâu thuẫn với xóa cơ hội — hệ thống xóa thật ([deals.ts:285](../server/src/routes/deals.ts#L285)) | Xóa cơ hội thì cascade xóa cả lịch sử. App một người dùng, không có nghĩa vụ kiểm toán. Ghi rõ để khỏi tranh cãi khi code |
| C14 | F-04 | Ngưỡng mặc định *"chuyển sang giai đoạn đề xuất/POC yêu cầu BANT ≥ 7"* — **không có giai đoạn nào tên như vậy** trong 7 stage đang chạy | Ánh xạ: `quoted` cần BANT ≥ 7; `negotiating` cần BANT ≥ 9 **và** không có veto V2. Các stage khác không chặn |
| C15 | F-04 | Chặn chuyển giai đoạn, nhưng Pipeline chuyển bằng **kéo thả** ([PipelinePage.tsx:158](../client/src/pages/PipelinePage.tsx#L158)) — spec không nói UX khi bị chặn | Vẫn cho kéo; API trả 409, giao diện hoàn tác lạc quan + toast nêu **chính xác yếu tố nào đang thiếu** và nút mở scorecard |
| C16 | F-04 | Override "kèm lý do bắt buộc" — không có vai trò quản lý | Tự xác nhận, lý do bắt buộc, ghi lịch sử (xem B9) |
| C17 | F-04 | Không loại trừ `won/lost` — nếu chặn cả hai chiều thì **không đóng được deal xấu**, phản tác dụng hoàn toàn | Cổng chỉ áp cho các giai đoạn tiến lên. `lost` không bao giờ bị chặn |
| C18 | Toàn spec | Không có quy tắc cho **deal gia hạn** (`deals.is_renewal = 1`) — BUDGET/AUTHORITY/FIT gần như biết trước từ hợp đồng cũ | Vẫn chấm đủ 8 yếu tố, nhưng cho phép bằng chứng là **số hợp đồng đang chạy**. Nếu không, sẽ không ai chấm deal gia hạn và chúng lọt khỏi mọi cảnh báo |
| C19 | Toàn spec | Không có **giới hạn** nào: độ dài evidence, số thành viên, số đối thủ, một hay nhiều compelling event | evidence ≤ 1000 ký tự; ≤ 20 thành viên; ≤ 5 đối thủ; nhiều sự kiện nhưng **đúng một** `is_primary` |
| C20 | Toàn spec | Không nhắc **Sao lưu / Xuất JSON / Xuất CSV** — hệ thống đã có ([system.ts:10](../server/src/routes/system.ts#L10)). Đúng lỗi C19 của BRD Nhãn | 5 bảng mới vào `TABLES`; CSV cơ hội thêm cột `BANT`, `4P`, `Ô`, `Veto`; thêm một mục xuất *chi tiết 8 yếu tố* |
| C21 | Mục 0 vs F-06 | Mục 0 là **quy trình làm việc với Claude bên ngoài sản phẩm**; F-06 lại là tính năng **trong** sản phẩm, mà app chạy local và không có bất kỳ hạ tầng AI nào (không khóa API, không cấu hình mạng) | Giữ Mục 0 làm phụ lục quy trình. F-06 phải nêu rõ đường đi kỹ thuật (khóa API người dùng tự nhập ở Cài đặt, gọi trực tiếp từ server) — hoặc lùi khỏi lộ trình cho tới khi quyết |
| C22 | Mục 4 | **Không có acceptance criteria cho chính bộ máy tính điểm** (tổng, ô, veto, staleness, confidence) — thứ dễ sai nhất và không nhìn thấy bằng mắt | Bộ **AC-SCR-01…14** ở D5 |
| C23 | Phụ lục A | `recommended_actions` xuất hiện trong JSON mẫu nhưng **không tính năng nào (F-01…F-10) sinh ra nó** | Thành **F-15** ở Phần E |
| C24 | Mục 3.2 TIMELINE = 3 | Đòi *"lịch triển khai ngược đã được thống nhất"* nhưng **không tính năng nào tạo ra lịch đó** | Thành **F-14** ở Phần E |

---

# PHẦN D – YÊU CẦU BỔ SUNG

## D1. Yêu cầu chức năng bổ sung

**FR-SCR-30 – Sinh yếu tố lười, tính tổng trong giao dịch**
Không sinh sẵn 8 bản ghi khi tạo cơ hội. Mỗi lần ghi một yếu tố, cùng giao dịch đó tính lại `bant_total`, `p4_total`, `score_updated_at` và ghi một dòng lịch sử. Yếu tố chưa có = 0, chưa xác thực.

**FR-SCR-31 – Trạng thái đề xuất**
`status ∈ suggested | confirmed`. Điểm `suggested` hiển thị nhạt kèm nhãn nguồn, **không cộng vào tổng**, không kích hoạt cổng giai đoạn. Xác nhận là một thao tác một chạm.

**FR-SCR-32 – Bằng chứng gắn với hoạt động có thật**
Chọn nguồn từ danh sách `interactions`/`documents` **của chính cơ hội đó**. Chọn xong tự điền trích đoạn vào ô bằng chứng và đặt `verified = 1`. Nguồn bị xóa → `verified` về 0, ghi lịch sử lý do *"nguon bang chung da bi xoa"*.

**FR-SCR-33 – Cổng giai đoạn theo 7 stage thật**
Cấu hình ngưỡng theo từng stage đích. Mặc định: `quoted` cần BANT ≥ 7; `negotiating` cần BANT ≥ 9 và không veto V2. `won` không chặn. `lost` **không bao giờ** chặn. Bị chặn → 409 kèm danh sách yếu tố thiếu; giao diện hoàn tác kéo thả và mở scorecard đúng yếu tố đó.

**FR-SCR-34 – Ô ma trận và veto tính khi đọc**
Ô, cờ veto, `forecast_eligible`, tuổi điểm đều tính qua VIEW `deal_scorecard`. Không cột lưu, không tác vụ nền, không lệch dữ liệu.

**FR-SCR-35 – Khóa điểm khi chốt**
Chuyển sang `won/lost` thì chụp `score_snapshot` (JSON đủ 8 yếu tố + tổng + ô + veto) và khóa scorecard chỉ đọc. Mở lại deal (won/lost → stage mở) thì mở khóa và ghi lịch sử.

**FR-SCR-36 – Giới hạn kỹ thuật**
evidence 20–1000 ký tự khi `score ≥ 1`; ≤ 20 thành viên nhóm quyết định; ≤ 5 đối thủ; đúng một compelling event `is_primary`.

**FR-SCR-37 – Sao lưu, xuất dữ liệu**
5 bảng mới vào `TABLES` của [system.ts:10](../server/src/routes/system.ts#L10). CSV cơ hội thêm 4 cột (`BANT`, `4P`, `Ô`, `Veto`). Thêm một mục xuất *Chi tiết chấm điểm* (mỗi dòng một yếu tố kèm bằng chứng).

**FR-SCR-38 – Chuỗi giao diện**
Toàn bộ nhãn tiếng Việt vào [i18n/vi.ts](../client/src/i18n/vi.ts) (khóa `scoring.*`). Thông báo lỗi phía server giữ đúng quy ước hiện tại: **tiếng Việt không dấu**.

## D2. Business rule bổ sung — ràng buộc chéo rubric ⟷ dữ liệu (vá C7)

Đây là phần làm cho nguyên tắc "không suy đoán" có hiệu lực kỹ thuật. Tất cả **chặn cứng ở API**, thông báo nêu đúng việc cần làm.

| Mã | Quy tắc | Chặn khi |
| --- | --- | --- |
| **BR-SCR-01** | `TIMELINE = 3` đòi tồn tại `deal_events` có `event_date IS NOT NULL` **và** `confirmed = 1` | Không có → tối đa chấm 2 |
| **BR-SCR-02** | `TIMELINE = 2` đòi tồn tại `deal_events` bất kỳ | Không có → tối đa 1 |
| **BR-SCR-03** | `AUTHORITY = 3` đòi có thành viên vai trò `ECONOMIC` **và** có ít nhất một `interaction` với người đó | Không có → tối đa 2 |
| **BR-SCR-04** | `AUTHORITY = 2` đòi ≥ 3 thành viên có vai trò khác nhau | Không đủ → tối đa 1 |
| **BR-SCR-05** | `RELATIONSHIP ≥ 2` đòi có thành viên `is_champion = 1, stance = supporter`; `= 2` đòi thêm phủ ≥ 50% số thành viên có tương tác trong 30 ngày | Không đủ → tối đa 1 |
| **BR-SCR-06** | `PROCESS = 0` **bắt buộc** khi tồn tại `deal_competitors.shaped_requirements = 1`; `PROCESS = 3` đòi ghi rõ ta đã tham gia định hình tiêu chí trong ô bằng chứng | Trái → chặn |
| **BR-SCR-07** | `PRICE ≥ 1` đòi ít nhất một `deal_competitors.price_position ≠ 'unknown'` — không biết mặt bằng thì theo rubric là 0 | Không có → ép 0 |
| **BR-SCR-08** | `NEED = 3` đòi ô bằng chứng chứa **con số** (chi phí/tháng, giờ công, rủi ro) — kiểm tra có chữ số | Không có → tối đa 2 |
| **BR-SCR-09** | Tổng chỉ cộng yếu tố `confirmed`. `suggested` không vào tổng, không mở cổng giai đoạn |  |
| **BR-SCR-10** | Điểm của deal `won/lost` chỉ đọc |  |
| **BR-SCR-11** | Mọi thay đổi điểm, mọi override cổng giai đoạn ghi `deal_score_history`; xóa cơ hội thì cascade xóa lịch sử (C13) |  |
| **BR-SCR-12** | Điểm BANT/4P **không được** ghi vào `deals.probability` dưới bất kỳ hình thức nào (B1) |  |

> **Ghi chú phương pháp:** BR-SCR-01…08 không phải là siết cho vui. Chúng biến rubric từ *bản mô tả* thành *ràng buộc*. Không có chúng, hệ thống chấm điểm B2B nào cũng trượt về cùng một kết cục: mọi deal đều 9–10 điểm trước kỳ báo cáo.

## D3. Mô hình dữ liệu — migration v10 (SQLite, chỉ thêm)

Thay thế Mục 2 của spec. Theo đúng khuôn migration hiện có: một tệp `migrate-v10.sql` + khối `if (current === 9)` trong [migrate.ts](../server/src/db/migrate.ts), `LATEST_VERSION = 10`.

```sql
-- v10: cham diem co hoi BANT + 4P. Chi them bang/cot moi, khong sua bang module khac.

/* ---------- 8 yeu to cham diem (sinh luoi, PK chan trung) ---------- */
CREATE TABLE deal_scores (
  deal_id     INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  factor      TEXT NOT NULL CHECK (factor IN
                ('budget','authority','need','timeline','price','relationship','fit','process')),
  score       INTEGER NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 3),
  status      TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('suggested','confirmed')),
  evidence    TEXT NOT NULL DEFAULT '',
  source_type TEXT CHECK (source_type IN ('interaction','document','manual')),
  source_id   INTEGER,
  verified    INTEGER NOT NULL DEFAULT 0,
  scored_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (deal_id, factor),
  -- C3: diem 0 duoc phep co bang chung (thong tin tieu cuc ro rang)
  CHECK (score = 0 OR length(evidence) >= 20),
  CHECK (length(evidence) <= 1000)
);
-- Khong co cot 'axis': suy tu factor (4 yeu to dau la BANT).

/* ---------- Nhom ra quyet dinh: bang noi, KHONG lap enum vai tro (B2) ---------- */
CREATE TABLE deal_committee (
  deal_id       INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  contact_id    INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  role_override TEXT,          -- NULL = ke thua contacts.buying_role
  stance        TEXT NOT NULL DEFAULT 'unknown'
                CHECK (stance IN ('supporter','neutral','opposed','unknown')),
  is_champion   INTEGER NOT NULL DEFAULT 0,
  influence     INTEGER NOT NULL DEFAULT 3 CHECK (influence BETWEEN 1 AND 5),
  note          TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (deal_id, contact_id)
);
-- last_contact_at KHONG luu: tinh tu interactions (B2).

/* ---------- Su kien bat buoc ---------- */
CREATE TABLE deal_events (
  id          INTEGER PRIMARY KEY,
  deal_id     INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL CHECK (event_type IN
                ('contract_expiry','regulatory','audit','product_launch','fiscal_deadline','other')),
  description TEXT NOT NULL,
  event_date  TEXT,                              -- 'YYYY-MM-DD'
  confirmed   INTEGER NOT NULL DEFAULT 0,        -- khach da xac nhan
  is_primary  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_deal_events_deal ON deal_events(deal_id, is_primary DESC);

/* ---------- Doi thu theo co hoi: khong tao danh muc doi thu (B3) ---------- */
CREATE TABLE deal_competitors (
  id                  INTEGER PRIMARY KEY,
  deal_id             INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  name_norm           TEXT NOT NULL DEFAULT '',  -- dien o TypeScript, giong fillLabelNameNorm
  incumbent           INTEGER NOT NULL DEFAULT 0,
  shaped_requirements INTEGER NOT NULL DEFAULT 0,
  price_position      TEXT NOT NULL DEFAULT 'unknown'
                      CHECK (price_position IN ('lower','similar','higher','unknown'))
);
CREATE INDEX idx_deal_competitors_deal ON deal_competitors(deal_id);
-- Chuyen doi thu dang nam o deals.competitor sang dong dau tien; cot cu GIU NGUYEN.
INSERT INTO deal_competitors (deal_id, name)
SELECT id, trim(competitor) FROM deals
 WHERE competitor IS NOT NULL AND trim(competitor) <> '';

/* ---------- Nhat ky thay doi diem ---------- */
CREATE TABLE deal_score_history (
  id         INTEGER PRIMARY KEY,
  deal_id    INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  factor     TEXT NOT NULL,          -- hoac 'stage_gate_override'
  old_score  INTEGER,
  new_score  INTEGER,
  reason     TEXT NOT NULL DEFAULT '',
  changed_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_deal_score_history ON deal_score_history(deal_id, changed_at);

/* ---------- Chi 4 cot them vao deals: khong luu du lieu dan xuat (C1) ---------- */
ALTER TABLE deals ADD COLUMN bant_total       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE deals ADD COLUMN p4_total         INTEGER NOT NULL DEFAULT 0;
ALTER TABLE deals ADD COLUMN score_updated_at TEXT;
ALTER TABLE deals ADD COLUMN score_snapshot   TEXT;   -- JSON chup luc chot (C12)

/* ---------- O ma tran, veto, tuoi diem: TINH KHI DOC ---------- */
CREATE VIEW deal_scorecard AS
SELECT
  d.id AS deal_id, d.bant_total, d.p4_total,
  CASE WHEN d.bant_total >= 7 AND d.p4_total >= 7 THEN 'pursue'
       WHEN d.bant_total >= 7                     THEN 'reshape'
       WHEN d.p4_total   >= 7                     THEN 'nurture'
       ELSE 'disqualify' END AS quadrant,
  CASE WHEN d.score_updated_at IS NULL THEN NULL
       ELSE CAST(julianday(date('now','localtime'))
                 - julianday(date(d.score_updated_at)) AS INTEGER) END AS score_age_days,
  (SELECT COUNT(*) FROM deal_events e
    WHERE e.deal_id = d.id AND e.confirmed = 1 AND e.event_date IS NOT NULL) = 0 AS v1_no_event,
  (SELECT COUNT(*) FROM deal_committee m
     JOIN contacts c ON c.id = m.contact_id
    WHERE m.deal_id = d.id
      AND COALESCE(m.role_override, c.buying_role) IN ('economic_buyer','decision_maker')
      AND EXISTS (SELECT 1 FROM interactions i
                   WHERE i.deal_id = d.id AND i.contact_id = m.contact_id)) = 0 AS v2_no_economic,
  (SELECT COUNT(*) FROM deal_competitors k
    WHERE k.deal_id = d.id AND k.shaped_requirements = 1) > 0 AS v3_shaped
FROM deals d;
```

**`forecast_eligible`** = `NOT v1_no_event AND NOT v2_no_economic AND score_age_days <= 30` (và `AND NOT v3_shaped` nếu chốt V3 là veto cứng — xem G1). Tính ở tầng route để một chỗ duy nhất quyết định, không rải điều kiện khắp SQL.

**Cascade:** mọi bảng mới đều `ON DELETE CASCADE` theo `deals`, nên xóa cơ hội là sạch — không cần trigger dọn như module Nhãn (ở đó `entity_id` đa hình nên mới phải dùng trigger).

## D4. Hợp đồng API

| Phương thức | Đường dẫn | Ghi chú |
| --- | --- | --- |
| GET | `/api/deals/:id/scorecard` | 8 yếu tố + 2 tổng + ô + veto + confidence + "đã chấm n/8" + câu hỏi gợi ý cho yếu tố ≤ 1 |
| PUT | `/api/deals/:id/scores/:factor` | `{ score, evidence, source_type, source_id, status, reason }` — nơi thi hành BR-SCR-01…08 |
| POST | `/api/deals/:id/scores/:factor/confirm` | `suggested` → `confirmed` (FR-SCR-31) |
| GET/POST/PATCH/DELETE | `/api/deals/:id/committee` | Gợi ý contact của khách hàng chưa có trong nhóm |
| GET/POST/PATCH/DELETE | `/api/deals/:id/events` | Đặt `is_primary` là thao tác riêng |
| GET/POST/PATCH/DELETE | `/api/deals/:id/competitors` | Gợi ý tên đã nhập qua `name_norm` |
| GET | `/api/deals/:id/score-history` | F-18 |
| GET | `/api/views/matrix?stage=&industry=&min_value=` | F-02 |
| GET | `/api/views/pipeline-health` | F-08: forecast theo giai đoạn ⟷ forecast đã lọc ⟷ chênh lệch |
| PATCH | `/api/deals/:id/move` | **Bổ sung** kiểm tra cổng giai đoạn; 409 `{ blocked_by: [...] }`; `?override=1&reason=` |

Thông báo lỗi giữ quy ước: **tiếng Việt không dấu** (ví dụ `'Chua co su kien bat buoc duoc khach xac nhan'`).

## D5. Acceptance criteria cho bộ máy tính điểm (vá C22)

- **AC-SCR-01 – Tổng:** BANT 3+2+3+1 và 4P 2+1+3+1 → `bant_total = 9`, `p4_total = 7`, ô = **PURSUE**.
- **AC-SCR-02 – Ranh giới:** BANT 7, 4P 6 → **RESHAPE**. BANT 6, 4P 7 → **NURTURE**. Cả hai đúng 7 → **PURSUE**.
- **AC-SCR-03 – Sinh lười:** cơ hội mới chưa chấm gì → scorecard trả 8 yếu tố điểm 0, `bant_total = 0`, ô **DISQUALIFY**, `score_updated_at = null`, **không** có dòng nào trong `deal_scores`.
- **AC-SCR-04 – Bằng chứng:** chấm BUDGET = 2 với ô bằng chứng 12 ký tự → API từ chối. 25 ký tự → nhận. Chấm 0 với bằng chứng bất kỳ độ dài → nhận (C3).
- **AC-SCR-05 – BR-SCR-01:** cơ hội không có `deal_events` xác nhận → chấm TIMELINE = 3 bị từ chối, thông báo nêu đúng việc "tao su kien bat buoc". Tạo sự kiện có ngày + `confirmed = 1` → chấm lại được.
- **AC-SCR-06 – BR-SCR-06:** đặt `shaped_requirements = 1` cho một đối thủ → PROCESS bị ép về 0 và không chấm lên được cho tới khi bỏ cờ.
- **AC-SCR-07 – Veto:** deal BANT 11 / 4P 11 nhưng không có compelling event xác nhận → ô vẫn **PURSUE**, `forecast_eligible = false`, viền đỏ ở ma trận. **Veto không đổi ô.**
- **AC-SCR-08 – Suggested:** ghi NEED = 3 với `status = 'suggested'` → `bant_total` **không đổi**; xác nhận → tổng tăng 3 và có một dòng lịch sử.
- **AC-SCR-09 – Xác thực rụng:** chấm BUDGET = 2 lấy nguồn từ một `interaction`, rồi xóa hoạt động đó → `verified` về 0, điểm giữ nguyên, có dòng lịch sử ghi lý do.
- **AC-SCR-10 – Cổng giai đoạn:** deal BANT 5 kéo từ `discussing` sang `quoted` → API trả 409, thẻ bật về cột cũ, toast nêu yếu tố thiếu. Override kèm lý do → chuyển được, có dòng `stage_gate_override` trong lịch sử. Kéo sang `lost` **không bao giờ** bị chặn (C17).
- **AC-SCR-11 – Chốt và khóa:** chuyển sang `won` → `score_snapshot` có đủ 8 yếu tố + ô + veto; mọi lời gọi ghi điểm sau đó trả 409.
- **AC-SCR-12 – Không chạm `probability`:** chấm đủ 8 yếu tố 3 điểm cho deal ở `lead` → `probability` vẫn là **10**, weighted pipeline không đổi (BR-SCR-12).
- **AC-SCR-13 – Sao lưu:** sau khi chấm, **Xuất dữ liệu JSON** chứa đủ 5 bảng mới; CSV cơ hội có 4 cột điểm.
- **AC-SCR-14 – Xóa cơ hội:** xóa deal đã chấm → không còn dòng nào ở cả 5 bảng (`SELECT COUNT(*) … WHERE deal_id NOT IN (SELECT id FROM deals)` = 0).

---

# PHẦN E – TÍNH NĂNG CHƯA CÓ, CẦN BỔ SUNG VÀO SPEC

Chín tính năng dưới đây **không có trong Mục 4** của spec. Bảy trong số đó không phải "thêm cho nhiều" — thiếu chúng thì chính rubric của spec không thể chấm đúng.

### F-11 – Lấy bằng chứng thẳng từ Lịch sử tương tác *(bắt buộc — vá lỗ hổng lớn nhất của F-01)*

**Vì sao:** Mục 0 yêu cầu "không suy đoán, phải trích dẫn được". F-01 chỉ nói "cho phép đính kèm hoạt động nguồn" mà không mô tả luồng. Không có luồng này, `verified` sẽ luôn bằng 0 và cả chỉ số confidence trở nên vô nghĩa.

**Acceptance:** trong scorecard, mỗi yếu tố có nút *Chọn bằng chứng* → mở danh sách `interactions` + `documents` **của chính cơ hội đó**, sắp theo thời gian, tìm không dấu. Chọn xong: trích đoạn tóm tắt tự điền vào ô bằng chứng (vẫn sửa được), `verified = 1`, hiện chip *Gọi điện · 03/08* bấm được để mở hoạt động gốc.

### F-12 – Chấm điểm ngay sau khi ghi hoạt động *(bắt buộc — thi hành Mục 3.6)*

**Vì sao:** Mục 3.6 nói *"chỉ hoạt động thực tế mới làm thay đổi điểm"*. Nếu chấm điểm là một màn hình riêng phải chủ động vào, người dùng sẽ chấm dồn một lần trước kỳ báo cáo — đúng hành vi mà cả module này sinh ra để ngăn.

**Acceptance:** sau khi lưu một `interaction` gắn với cơ hội, hiện một dải hỏi *"Cuộc trao đổi này thay đổi yếu tố nào?"* với 8 chip; bấm chip mở ngay ô chấm, bằng chứng **điền sẵn** hoạt động vừa ghi. Bỏ qua được, không chặn.

### F-13 – Tự phản biện thay cho Peer Review *(thay F-09, xem B9)*

**Vì sao:** F-09 đúng về chẩn đoán (4P là phần thiên kiến lạc quan nặng nhất) nhưng cần hai người. Hệ thống một người dùng vẫn cần một cơ chế chống tự huyễn hoặc.

**Acceptance:** với cơ hội có `value_vnd` vượt ngưỡng cấu hình, mỗi yếu tố **4P** chấm ≥ 2 phải trả lời một câu phản biện bắt buộc (ví dụ RELATIONSHIP: *"Champion đã nói gì với ai khi ta không có mặt? Làm sao biết?"*). Câu trả lời lưu chung với bằng chứng. Thêm cơ chế **chấm mù lại**: sau 14 ngày, hệ thống mời chấm lại 4P mà **ẩn điểm cũ**, rồi hiện song song hai lần chấm và làm nổi yếu tố lệch ≥ 2 — giữ đúng tinh thần "lấy giá trị thấp hơn" của F-09.

### F-14 – Lịch triển khai ngược từ compelling event *(bắt buộc — vá C24)*

**Vì sao:** rubric TIMELINE = 3 đòi *"lịch triển khai ngược đã được thống nhất"*, nhưng không tính năng nào tạo ra nó — nên điểm 3 sẽ được chấm dựa trên trí nhớ.

**Acceptance:** từ `event_date`, sinh các mốc lùi (ký hợp đồng, chốt kỹ thuật, gửi báo giá, quyết định ngân sách) theo mẫu sửa được, tạo thành **thẻ công việc + nhắc hẹn** — dùng lại module Thẻ và Nhắc hẹn đã có, không dựng lịch riêng. Mốc nào rơi vào quá khứ thì cảnh báo ngay: đó là bằng chứng deal sẽ trượt kỳ.

### F-15 – Đề xuất hành động theo yếu tố yếu nhất *(bắt buộc — vá C23)*

**Vì sao:** `recommended_actions` có trong Phụ lục A nhưng không tính năng nào sinh ra. Đây cũng là cầu nối duy nhất giữa điểm số và `deals.next_action` đã có.

**Acceptance:** scorecard đề xuất tối đa 3 hành động theo thứ tự: (1) yếu tố đang bị veto chặn, (2) yếu tố ≤ 1 có đòn bẩy lớn nhất (chênh lệch tới mức tiếp theo), (3) yếu tố quá hạn xác thực. Mỗi đề xuất có nút **"Đặt làm Next Action"** ghi thẳng vào `deals.next_action` + `next_action_date`. Không tự ghi đè khi đã có Next Action.

### F-16 – Đối chiếu lý do thua với yếu tố thấp nhất *(mở rộng F-10)*

**Vì sao:** hệ thống đã có 10 `LOST_REASONS`. Ghép chúng với `score_snapshot` là cách **rẻ nhất để kiểm chứng rubric bằng dữ liệu thật của chính tổ chức** — đúng mục tiêu F-10 nhưng cụ thể và làm được ngay.

Ánh xạ kiểm chứng: `price` → PRICE · `no_budget` → BUDGET · `bad_timing` → TIMELINE · `competitor` → PROCESS/PRICE · `no_contact` → AUTHORITY/RELATIONSHIP · `solution_mismatch`, `requirement_unmet` → FIT · `project_stopped` → NEED/TIMELINE · `self_build` → NEED/FIT.

**Acceptance:** bảng chéo *lý do thua × yếu tố thấp nhất lúc chốt*. Ô nào lệch (thua vì giá mà PRICE lúc đó chấm 3) là **bằng chứng rubric đang được chấm sai**, không phải rubric sai — hiển thị đúng thông điệp đó.

### F-17 – Phiên rà soát pipeline định kỳ

**Vì sao:** Mục 0 liệt kê "Rà soát pipeline" như một use case, nhưng nó không thành tính năng nào. Đây là thứ biến module từ *biểu mẫu phải điền* thành *thói quen*.

**Acceptance:** một luồng đi qua từng cơ hội có điểm quá 30 ngày hoặc có veto, mỗi màn một cơ hội với 3 lựa chọn: *Giữ nguyên* / *Chấm lại* / *Chuyển sang Thất bại*. Kết thúc phiên tóm tắt: bao nhiêu deal đổi ô, bao nhiêu rời forecast, chênh lệch pipeline trước/sau.

### F-18 – Đường điểm theo thời gian

**Vì sao:** `deal_score_history` sẽ có dữ liệu nhưng không màn hình nào đọc. F-07 cảnh báo "một yếu tố giảm ≥ 2 bậc" mà không có chỗ nào nhìn thấy diễn biến.

**Acceptance:** sparkline BANT và 4P trên scorecard; danh sách *"đang tụt điểm"* trên Pipeline Health (deal có tổng giảm trong 30 ngày gần nhất). Dùng `recharts` đã có.

### F-19 – Cảnh báo lệch giữa giai đoạn và điểm

**Vì sao:** đây là phép đo trực tiếp của thứ mà cả module sinh ra để chống. Rẻ và giá trị cao.

**Acceptance:** cờ *"Deal ở giai đoạn Đàm phán nhưng BANT 4"* — điều kiện: `probability` (theo stage) ≥ 60 mà `bant_total` ≤ 6. Hiện ở Dashboard như một nhóm `attention` mới (B6) và là một cột ở Pipeline Health.

---

# PHẦN F – LỘ TRÌNH ĐIỀU CHỈNH THEO HIỆN TRẠNG

Lộ trình 3 phase của spec (Mục 8) xếp F-02 và F-04 vào MVP nhưng bỏ quên toàn bộ lớp bằng chứng — mà không có bằng chứng thì điểm là con số bịa. Xếp lại:

**Giai đoạn 1 – Nền + vòng chấm điểm khép kín (MVP thật)**
1. Migration v10, VIEW `deal_scorecard`, 5 bảng mới vào `TABLES` (FR-SCR-37).
2. Bộ máy tính điểm + **BR-SCR-01…12** ở tầng API, kèm test cho toàn bộ AC-SCR.
3. **F-01** Scorecard + **F-11** bằng chứng từ hoạt động + **F-12** chấm ngay sau khi ghi hoạt động.
4. Nhóm quyết định (**F-03** rút gọn: danh sách + thái độ + champion, chưa cần sơ đồ), sự kiện bắt buộc, đối thủ — vì BR-SCR-01…07 phụ thuộc chúng.
5. Veto V1, V2 + **F-04** cổng giai đoạn theo 7 stage thật (C14, C15, C17).

*Sau giai đoạn 1, một cơ hội đã có thể được chấm đúng phương pháp. Đây là ranh giới đúng của MVP.*

**Giai đoạn 2 – Nhìn toàn pipeline**
6. **F-02** ma trận (ScatterChart), **F-08** Pipeline Health = chênh lệch hai forecast (B1), **F-19** cảnh báo lệch giai đoạn.
7. **F-07** cảnh báo — thêm nhóm vào `attention` của Dashboard (B6), không dựng thông báo riêng.
8. **F-15** đề xuất hành động → Next Action, **F-05** bộ câu hỏi khám phá (Phụ lục B đã viết sẵn, chỉ cần đưa vào giao diện).
9. Cột `BANT / 4P / Ô / Veto` ở danh sách Cơ hội + xuất CSV.

**Giai đoạn 3 – Kỷ luật và học từ dữ liệu**
10. **F-14** lịch triển khai ngược, **F-17** phiên rà soát, **F-18** đường điểm, **F-13** tự phản biện.
11. **F-10** + **F-16** win/loss theo điểm — **chỉ có ý nghĩa khi đã có ≥ 30 deal chốt** (C11); trước mốc đó chỉ hiển thị số đếm, không đưa khuyến nghị hiệu chỉnh ngưỡng.

**Giai đoạn 4 – cân nhắc lại trước khi làm**
12. **F-06** chấm điểm bằng AI — chỉ sau khi chốt G3 (đường đi khóa API). Cho tới lúc đó, use case này vẫn làm được **bên ngoài sản phẩm** theo Mục 0, dán kết quả vào scorecard.

**Đưa ra khỏi phạm vi:** Mục 6 phân quyền, F-09 nguyên bản (→ F-13), danh mục đối thủ dùng chung (B3), `currency`/đa tiền tệ.

---

# PHẦN G – VIỆC CẦN QUYẾT TRƯỚC KHI CHỐT

1. **V3 là veto cứng hay cảnh báo? (C9)** — Đề xuất: **cảnh báo bắt buộc rà soát**, không chặn forecast. Lý do: PROCESS = 0 đã kéo deal vào ô RESHAPE rồi; chặn thêm là phạt hai lần cho cùng một dữ kiện. V1/V2 khác bản chất — chúng nói deal **chưa tồn tại**, nên chặn forecast là đúng. *(Đây là quyết định phương pháp luận, không phải kỹ thuật — cần bạn chốt.)*
2. **`probability` có bị điểm chi phối không? (B1)** — Đề xuất: **không**, và giữ nguyên hành vi tự đặt theo giai đoạn. Toàn bộ giá trị của F-08 nằm ở chỗ hai con số **được phép** khác nhau.
3. **F-06 và khóa API (C21)** — App chạy local, không có hạ tầng gọi mô hình. Ba lựa chọn: (a) người dùng tự nhập khóa ở Cài đặt, server gọi trực tiếp; (b) không làm trong app, dùng quy trình Mục 0 rồi dán vào scorecard; (c) bỏ hẳn F-06. Đề xuất **(b)** cho tới khi có nhu cầu thật.
4. **Ngưỡng cổng giai đoạn (C14)** — Đề xuất `quoted` ≥ 7, `negotiating` ≥ 9 + không veto V2. Cần bạn xác nhận vì nó thay đổi thói quen kéo thả hằng ngày ngay từ ngày đầu.
5. **Deal gia hạn (C18)** — Chấm đủ 8 yếu tố hay miễn BUDGET/AUTHORITY/FIT khi `is_renewal = 1`? Đề xuất: **chấm đủ**, nhưng chấp nhận hợp đồng đang chạy làm bằng chứng — nếu miễn, deal gia hạn sẽ biến mất khỏi mọi cảnh báo.
6. **Ngưỡng giá trị cho F-13** — bao nhiêu VND thì bắt buộc phản biện 4P? Cần một con số phù hợp quy mô deal thực tế của bạn.

---

# PHẦN H – TRẠNG THÁI TRIỂN KHAI (đã chạy ngày 11/08/2026)

Toàn bộ giai đoạn 1–3 đã được thực hiện. Cơ sở dữ liệu đang ở **schema v10**.

**Bốn quyết định đã chốt trước khi làm:** phạm vi = toàn bộ giai đoạn 1–3 (trừ F-06 AI) · scorecard đặt ở **trang Cơ hội mới `/deals/:id`** · **V3 chỉ cảnh báo**, không chặn forecast (đúng khuyến nghị ở C9/G1) · cổng giai đoạn **bật mặc định** `quoted ≥ 7`, `negotiating ≥ 9` + không veto V2.

## H1. Đã làm

| Bước | Nội dung | Tệp |
| --- | --- | --- |
| 0 | Migration v10: 5 bảng mới + `app_settings`, 4 cột thêm vào `deals`, VIEW `deal_scorecard` (ô ma trận + 3 cờ veto + tuổi điểm), chuyển `deals.competitor` sang `deal_competitors` kèm `name_norm` | [migrate-v10.sql](../server/src/db/migrate-v10.sql) (mới), [migrate.ts](../server/src/db/migrate.ts) |
| 1 | Bộ máy tính điểm: trần điểm theo dữ liệu (BR-SCR-01…08), tổng chỉ cộng `confirmed`, veto, confidence, cổng giai đoạn, chụp điểm khi chốt | [scoring.ts](../server/src/lib/scoring.ts) (mới), [crm.ts](../server/src/lib/crm.ts) |
| 1 | API đầy đủ: scorecard, ghi/xác nhận điểm, nguồn bằng chứng, nhóm quyết định, sự kiện, đối thủ, lịch sử, lịch triển khai ngược, cấu hình | [scoring.ts](../server/src/routes/scoring.ts) (mới) |
| 1 | `HttpError` mang payload để 409/422 nói rõ việc cần làm | [validate.ts](../server/src/lib/validate.ts), [index.ts](../server/src/index.ts) |
| 2 | Trang Cơ hội `/deals/:id` với 4 tab + Scorecard 8 yếu tố + chọn bằng chứng từ hoạt động (F-01, F-11, F-05) | [DealDetailPage.tsx](../client/src/pages/DealDetailPage.tsx), [Scorecard.tsx](../client/src/components/crm/Scorecard.tsx), [EvidencePicker.tsx](../client/src/components/crm/EvidencePicker.tsx) (mới) |
| 2 | Rubric 0–3 và bộ câu hỏi khám phá chép nguyên văn Mục 3.2/3.3 và Phụ lục B | [i18n/scoring.ts](../client/src/i18n/scoring.ts) (mới) |
| 3 | Nhóm ra quyết định, sự kiện bắt buộc, đối thủ + 3 cảnh báo phủ (F-03, F-14) | [CommitteePanel.tsx](../client/src/components/crm/CommitteePanel.tsx) (mới) |
| 4 | Cổng giai đoạn: 409 kèm yếu tố thiếu, hoàn tác kéo thả, ghi đè kèm lý do bắt buộc | [deals.ts](../server/src/routes/deals.ts), [PipelinePage.tsx](../client/src/pages/PipelinePage.tsx) |
| 5 | Dải "cuộc trao đổi này thay đổi yếu tố nào?" sau khi ghi hoạt động (F-12); nút *Đặt làm Next Action* (F-15) | [ScoringPrompt.tsx](../client/src/components/crm/ScoringPrompt.tsx) (mới), [InteractionTimeline.tsx](../client/src/components/crm/InteractionTimeline.tsx) |
| 6 | Ma trận cơ hội, Sức khỏe pipeline, 5 nhóm cảnh báo mới trên Tổng quan, cột điểm trên thẻ + CSV | [PipelineHealthPage.tsx](../client/src/pages/PipelineHealthPage.tsx), [OpportunityMatrix.tsx](../client/src/components/crm/OpportunityMatrix.tsx) (mới), [views.ts](../server/src/routes/views.ts), [system.ts](../server/src/routes/system.ts) |
| 7 | Phiên rà soát (F-17), đường điểm theo thời gian (F-18), phản biện 4P cho deal lớn (F-13) | [ReviewSession.tsx](../client/src/components/crm/ReviewSession.tsx) (mới), `ScoreTrend` trong Scorecard |
| 8 | Thắng/thua theo ô ma trận + bảng chéo lý do thua × yếu tố yếu nhất (F-10, F-16) | [ReportsPage.tsx](../client/src/pages/ReportsPage.tsx), [views.ts](../server/src/routes/views.ts) |
| — | Mục *Cài đặt → Chấm điểm cơ hội*: ngưỡng cổng, tuổi điểm, chế độ V3, ngưỡng phản biện, cỡ mẫu win/loss | [ScoringSettings.tsx](../client/src/components/crm/ScoringSettings.tsx) (mới) |

**Đã hiện thực:** F-01…F-05, F-07, F-08, F-10…F-19 · BR-SCR-01…12 · FR-SCR-30…38.
**Chưa làm:** F-06 (chấm điểm bằng AI) — ngoài phạm vi theo quyết định G3, quy trình Mục 0 vẫn dùng được bên ngoài sản phẩm.

## H2. Mức chạm vào module khác

- **Chỉ thêm, không sửa cấu trúc**: mọi thay đổi CSDL là `CREATE` mới hoặc `ALTER TABLE deals ADD COLUMN`. Không đụng bảng của module nào khác.
- **Không sửa dòng nào**: toàn bộ module Nhãn, Dịch vụ, Doanh thu, Hợp đồng, Báo giá, Trường tùy chỉnh, Bảng/Danh sách/Thẻ.
- **Thêm dòng, giữ nguyên hành vi cũ**: `deals.ts` (join thêm VIEW vào `DEAL_SELECT`, gọi cổng giai đoạn trước khi đổi stage), `views.ts` (thêm nhóm vào `attention` sẵn có), `system.ts` (6 bảng vào danh sách xuất, 4 cột vào CSV cơ hội), `interactions.ts` / `documents.ts` (gỡ dấu xác thực khi xóa nguồn).
- **`deals.probability` không bị chạm** — có test riêng khẳng định điều này (AC-SCR-12).
- **Đổi hành vi có chủ ý, cần biết**: bấm thẻ ở Pipeline nay mở trang chi tiết thay vì mở modal sửa nhanh; modal sửa nhanh vẫn còn ở nút *Sửa*.

## H3. Kết quả kiểm thử

| Bộ kiểm thử | Kết quả |
| --- | --- |
| Migration v10 — đường cài mới (0 → 10) và đường nâng cấp trên bản sao `app.db` thật (9 → 10) | **Đạt** — dữ liệu cũ nguyên vẹn, `foreign_key_check` sạch, 2 đối thủ chuyển đúng kèm `name_norm` |
| Nghiệm thu engine theo AC-SCR-01…14 ([scoring.test.ts](../server/src/lib/scoring.test.ts), `npm run test -w server`) | **19/19 đạt** |
| Kiểm thử API thật: module chấm điểm + hồi quy bước 0 | **64/64 đạt** |
| `tsc --noEmit` client và server, `npm run build` | Sạch |

Dữ liệu dùng để kiểm thử đã được xóa sạch — cơ sở dữ liệu trở lại đúng trạng thái trước khi kiểm thử (3 khách hàng, 7 cơ hội, không dòng mồ côi ở cả 5 bảng mới).

## H4. Còn lại cho giai đoạn sau

- **F-06 chấm điểm bằng AI** — chờ quyết định G3 về đường đi khóa API.
- **Chấm mù lại sau 14 ngày** (nửa sau của F-13): phần câu phản biện bắt buộc đã chạy; phần so sánh song song hai lần chấm chưa làm.
- Chuyển kịch bản kiểm thử API đang nằm ở thư mục tạm thành test hồi quy trong repo.
- Bộ câu hỏi khám phá hiện cố định theo spec; chưa cho admin cấu hình theo ngành/dòng sản phẩm (phần sau của F-05).
