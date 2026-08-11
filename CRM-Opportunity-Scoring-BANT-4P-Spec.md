# Đặc tả tính năng CRM: Module Đánh giá & Chấm điểm Cơ hội B2B (BANT + 4P)

**Phiên bản:** 1.0
**Trạng thái:** Draft để triển khai
**Mục đích của tài liệu:** Vừa là tài liệu phương pháp luận cho đội kinh doanh, vừa là bản đặc tả kỹ thuật đủ chi tiết để dùng làm đầu vào cho Claude (hoặc bất kỳ đội phát triển nào) xây dựng module.

---

## 0. HƯỚNG DẪN SỬ DỤNG TÀI LIỆU NÀY VỚI CLAUDE

Tài liệu được thiết kế để tự chứa (self-contained). Khi cần Claude thực hiện, dùng các mẫu yêu cầu sau:

| Việc cần làm | Mẫu câu yêu cầu |
|---|---|
| Dựng giao diện | "Dựa trên spec đính kèm, build màn hình `S-02 Opportunity Scorecard` bằng React + Tailwind, dữ liệu mock theo Phụ lục A." |
| Viết logic tính điểm | "Cài đặt `scoring engine` theo Mục 3, ngôn ngữ TypeScript, có unit test cho toàn bộ quy tắc phủ quyết ở Mục 3.5." |
| Sinh schema CSDL | "Sinh migration PostgreSQL cho mô hình dữ liệu Mục 2, kèm index và ràng buộc." |
| Chấm điểm 1 deal thật | "Đây là ghi chú cuộc gọi với khách hàng X. Áp rubric Mục 3.2 và 3.3, chấm điểm từng yếu tố, nêu rõ yếu tố nào thiếu bằng chứng, đưa ra khuyến nghị theo ma trận Mục 3.4." |
| Rà soát pipeline | "Đây là file CSV pipeline. Chấm điểm toàn bộ, sắp theo ma trận, chỉ ra deal nào đang bị thổi phồng và deal nào nên rút." |

**Nguyên tắc bắt buộc khi Claude chấm điểm:** không suy đoán. Yếu tố nào không có bằng chứng trích dẫn được từ dữ liệu đầu vào thì chấm 0 và đánh dấu `unverified`, không chấm theo cảm nhận tích cực.

---

## 1. PHƯƠNG PHÁP LUẬN

### 1.1 Hai câu hỏi khác nhau

| Trục | Câu hỏi cốt lõi | Đối tượng đánh giá |
|---|---|---|
| **BANT** | Đây có phải cơ hội thật không? | Khách hàng |
| **4P** | Nếu là thật, ta có khả năng thắng không? | Vị thế của ta |

BANT xác nhận cơ hội **tồn tại**. 4P xác định cơ hội **thuộc về ai**. Pipeline chỉ dùng BANT sẽ đầy những deal thật nhưng thuộc về đối thủ.

### 1.2 BANT — Đánh giá cơ hội

- **Budget (Ngân sách):** đã duyệt hay mới dự kiến; thuộc năm tài chính nào; CAPEX hay OPEX; ai giữ hầu bao.
- **Authority (Quyền hạn):** bản đồ nhóm ra quyết định — người ký (economic buyer), người dùng cuối (user buyer), người thẩm định kỹ thuật (technical buyer), người ủng hộ nội bộ (champion).
- **Need (Nhu cầu):** phân biệt *pain* (đau, phải xử lý) / *want* (muốn) / *interest* (tò mò). Chỉ *pain* tạo giao dịch. Phải lượng hóa được thiệt hại của việc không làm gì.
- **Timeline (Thời gian):** không hỏi "khi nào mua" mà tìm **compelling event** — sự kiện bắt buộc phải xong trước: hợp đồng cũ hết hạn, hạn kiểm toán, ra mắt sản phẩm, quy định có hiệu lực.

### 1.3 4P — Đánh giá khả năng thắng

- **Price (Giá cả):** khoảng cách giữa giá ta buộc phải bán và mặt bằng đối thủ/kỳ vọng khách. Cao hơn đáng kể mà không có khác biệt giải thích được = đã thua.
- **Thân thiết (Quan hệ):** *chiều sâu* (có champion thực sự vận động nội bộ thay ta không) và *chiều rộng* (phủ được bao nhiêu người, hay chỉ single-threaded qua một đầu mối).
- **Phù hợp (Fit):** tách bạch phù hợp tự nhiên (out-of-the-box) và phù hợp nhờ tùy chỉnh (tốn chi phí, rủi ro triển khai, bào mòn biên lợi nhuận).
- **Quy trình (Process):** nắm được quy trình mua thật, tiêu chí chấm thầu, và quan trọng nhất — **ai đã ảnh hưởng đến bộ tiêu chí đó**. Nếu tiêu chí viết theo đặc tính đối thủ, ta đang làm quân xanh.

---

## 2. MÔ HÌNH DỮ LIỆU

### 2.1 `opportunity` (mở rộng entity sẵn có)

| Trường | Kiểu | Mô tả |
|---|---|---|
| `id` | uuid | PK |
| `account_id` | uuid | FK khách hàng |
| `owner_id` | uuid | Sales phụ trách |
| `stage` | enum | Giai đoạn pipeline |
| `amount` | decimal | Giá trị dự kiến |
| `currency` | char(3) | Mặc định VND |
| `expected_close_date` | date | Ngày dự kiến chốt |
| `bant_total` | int | 0–12, tính tự động |
| `p4_total` | int | 0–12, tính tự động |
| `quadrant` | enum | `PURSUE` / `RESHAPE` / `NURTURE` / `DISQUALIFY` |
| `veto_flags` | jsonb | Danh sách quy tắc phủ quyết đang bật |
| `forecast_eligible` | bool | Tự động false nếu có veto |
| `score_updated_at` | timestamptz | Lần chấm gần nhất |
| `score_staleness_days` | int | Tính từ `score_updated_at` |

### 2.2 `opportunity_score_item`

Mỗi cơ hội có đúng 8 bản ghi (4 BANT + 4 P).

| Trường | Kiểu | Mô tả |
|---|---|---|
| `id` | uuid | PK |
| `opportunity_id` | uuid | FK |
| `axis` | enum | `BANT` / `P4` |
| `factor` | enum | `BUDGET`,`AUTHORITY`,`NEED`,`TIMELINE`,`PRICE`,`RELATIONSHIP`,`FIT`,`PROCESS` |
| `score` | int | 0–3 |
| `evidence` | text | Bằng chứng bắt buộc khi score ≥ 1 |
| `evidence_source_type` | enum | `CALL`,`EMAIL`,`MEETING`,`DOCUMENT`,`CRM_NOTE` |
| `evidence_source_id` | uuid | Trỏ tới hoạt động gốc |
| `verified` | bool | True khi có `evidence_source_id` hợp lệ |
| `scored_by` | uuid | Người chấm |
| `scored_at` | timestamptz | |

**Ràng buộc:** `CHECK (score = 0 OR (evidence IS NOT NULL AND length(evidence) >= 20))` — không cho chấm điểm khống.

### 2.3 `buying_committee_member`

| Trường | Kiểu | Mô tả |
|---|---|---|
| `opportunity_id` | uuid | FK |
| `contact_id` | uuid | FK |
| `role` | enum | `ECONOMIC`,`TECHNICAL`,`USER`,`CHAMPION`,`BLOCKER`,`INFLUENCER` |
| `stance` | enum | `SUPPORTER`,`NEUTRAL`,`OPPOSED`,`UNKNOWN` |
| `last_contact_at` | timestamptz | Dùng tính chiều rộng quan hệ |
| `influence_level` | int | 1–5 |

### 2.4 `compelling_event`

| Trường | Kiểu |
|---|---|
| `opportunity_id` | uuid |
| `description` | text |
| `event_type` | enum: `CONTRACT_EXPIRY`,`REGULATORY`,`AUDIT`,`PRODUCT_LAUNCH`,`FISCAL_DEADLINE`,`OTHER` |
| `event_date` | date |
| `confirmed_by_customer` | bool |

### 2.5 `competitor_position`

| Trường | Kiểu |
|---|---|
| `opportunity_id` | uuid |
| `competitor_id` | uuid |
| `incumbent` | bool |
| `shaped_requirements` | bool — **đối thủ có tham gia soạn tiêu chí không** |
| `estimated_price_position` | enum: `LOWER`,`SIMILAR`,`HIGHER`,`UNKNOWN` |

### 2.6 `score_history`

Bản ghi append-only mọi thay đổi điểm để phục vụ phân tích xu hướng và kiểm toán: `opportunity_id`, `factor`, `old_score`, `new_score`, `changed_by`, `changed_at`, `reason`.

---

## 3. CÔNG CỤ CHẤM ĐIỂM (SCORING ENGINE)

### 3.1 Thang điểm

Mỗi yếu tố chấm **0–3**. Mỗi trục tối đa **12 điểm**.

| Điểm | Ý nghĩa chung |
|---|---|
| 0 | Không có thông tin, hoặc thông tin tiêu cực rõ ràng |
| 1 | Có dấu hiệu nhưng chưa được khách hàng xác nhận |
| 2 | Đã được xác nhận, còn khoảng trống |
| 3 | Đã xác thực đầy đủ, có bằng chứng ghi nhận được |

### 3.2 Rubric BANT

**BUDGET**
- 0 — Không rõ ngân sách, hoặc khách né mọi con số.
- 1 — Có nêu khoảng ngân sách nhưng chưa được phê duyệt, hoặc thuộc năm tài chính sau.
- 2 — Ngân sách đã duyệt, biết thuộc CAPEX/OPEX, nhưng giải pháp của ta lệch >20% so với ngân sách.
- 3 — Ngân sách đã duyệt, đủ chi trả, biết rõ người kiểm soát ngân sách và đã trao đổi với người đó.

**AUTHORITY**
- 0 — Chỉ tiếp xúc một liên hệ, không biết ai duyệt.
- 1 — Biết tên người ký nhưng chưa tiếp xúc; chưa nắm quy trình phê duyệt.
- 2 — Đã lập bản đồ ≥3 vai trò trong nhóm ra quyết định, đã gặp ít nhất một người có quyền.
- 3 — Đã gặp economic buyer, có champion xác định được, hiểu rõ các bước phê duyệt và ngưỡng thẩm quyền.

**NEED**
- 0 — Chỉ là *interest*; khách không mô tả được vấn đề.
- 1 — Mức *want*: có nhu cầu nhưng "có thì tốt", không có hậu quả nếu bỏ qua.
- 2 — Mức *pain*: khách nêu rõ vấn đề và hậu quả, nhưng chưa lượng hóa được bằng số.
- 3 — *Pain* đã lượng hóa (chi phí/tháng, giờ công, rủi ro tuân thủ) và khách tự thừa nhận con số đó.

**TIMELINE**
- 0 — Không có mốc thời gian, hoặc "khi nào tiện".
- 1 — Có mong muốn thời gian chung chung ("trong năm nay") do sales suy đoán.
- 2 — Có compelling event được nêu nhưng chưa xác nhận ngày cụ thể.
- 3 — Compelling event có ngày cụ thể, khách xác nhận, và lịch triển khai ngược (backward plan) đã được thống nhất.

### 3.3 Rubric 4P

**PRICE**
- 0 — Giá ta cao hơn đáng kể mặt bằng và không có khác biệt biện minh được; hoặc hoàn toàn không biết mặt bằng.
- 1 — Giá ta cao hơn, có khác biệt nhưng khách chưa công nhận giá trị đó.
- 2 — Giá tương đương thị trường, hoặc cao hơn nhưng khách đã công nhận giá trị khác biệt.
- 3 — Giá cạnh tranh và khách đã chuyển trọng tâm thảo luận từ giá sang giá trị/ROI.

**RELATIONSHIP (Thân thiết)**
- 0 — Single-threaded qua một đầu mối, không rõ thái độ.
- 1 — Có 2–3 liên hệ nhưng chưa ai chủ động vận động cho ta.
- 2 — Có champion tự nguyện chia sẻ thông tin nội bộ; phủ được ≥50% nhóm ra quyết định.
- 3 — Champion chủ động vận động thay ta khi ta không có mặt; có quan hệ ở cả cấp thực thi và cấp quyết định; không có blocker nghiêm trọng.

**FIT (Phù hợp)**
- 0 — Yêu cầu cốt lõi nằm ngoài năng lực, cần phát triển mới.
- 1 — Đáp ứng được nhưng cần tùy chỉnh nặng, rủi ro triển khai cao, biên lợi nhuận bị bào mòn.
- 2 — Đáp ứng phần lớn out-of-the-box, tùy chỉnh ở mức chấp nhận được.
- 3 — Phù hợp tự nhiên; đã có case tương đương cùng ngành/quy mô để tham chiếu.

**PROCESS (Quy trình)**
- 0 — Không biết quy trình mua; hoặc phát hiện tiêu chí thầu do đối thủ soạn.
- 1 — Biết sơ bộ các bước nhưng không biết tiêu chí chấm.
- 2 — Nắm rõ các bước, tiêu chí chấm và lịch trình; tiêu chí trung lập.
- 3 — Nắm rõ toàn bộ và **ta đã tham gia định hình tiêu chí**; biết vị trí của mình so với đối thủ ở từng tiêu chí.

### 3.4 Ma trận quyết định

```
                    4P thấp (0–6)              4P cao (7–12)
                 ┌──────────────────────┬──────────────────────┐
BANT cao (7–12)  │  ⚠ RESHAPE           │  ✅ PURSUE           │
                 │  Cân nhắc/Đổi luật   │  Theo đuổi tối đa    │
                 ├──────────────────────┼──────────────────────┤
BANT thấp (0–6)  │  ❌ DISQUALIFY       │  🌱 NURTURE          │
                 │  Loại bỏ             │  Nuôi dưỡng          │
                 └──────────────────────┴──────────────────────┘
```

| Ô | Hành động hệ thống đề xuất |
|---|---|
| **PURSUE** | Dồn nguồn lực, đưa lãnh đạo vào cuộc, đẩy nhanh tiến độ. Cho phép đưa vào forecast. |
| **RESHAPE** | Deal thật nhưng ta không ở vị thế thắng. Chỉ theo nếu tái định hình được tiêu chí, bắt tay đối tác, hoặc tấn công điểm yếu đối thủ. Nếu không → rút, tránh làm quân xanh. Bắt buộc có review của quản lý trước khi tiếp tục. |
| **NURTURE** | Có quan hệ và phù hợp nhưng khách chưa sẵn sàng. Chuyển sang chuỗi nuôi dưỡng, hỗ trợ khách xây business case và giành ngân sách kỳ sau. Gỡ khỏi forecast kỳ hiện tại. |
| **DISQUALIFY** | Chuyển sang danh sách marketing tự động, không tiêu tốn giờ sales. |

### 3.5 Quy tắc phủ quyết (Veto Rules)

Áp dụng **bất kể tổng điểm**. Khi bật, hệ thống đặt `forecast_eligible = false` và hiển thị cảnh báo đỏ trên scorecard.

| Mã | Điều kiện kỹ thuật | Thông điệp |
|---|---|---|
| `V1_NO_COMPELLING_EVENT` | Không có bản ghi `compelling_event` với `confirmed_by_customer = true` | "Không có sự kiện bắt buộc — deal sẽ trượt kỳ. Không đưa vào forecast." |
| `V2_NO_ECONOMIC_BUYER` | Không có `buying_committee_member` với `role = ECONOMIC` và `last_contact_at IS NOT NULL` | "Chưa tiếp cận người có quyền chi tiền — đây là cuộc trò chuyện, chưa phải cơ hội." |
| `V3_COMPETITOR_SHAPED` | Tồn tại `competitor_position.shaped_requirements = true` | "Tiêu chí do đối thủ định hình — cân nhắc rút, trừ khi có đường vòng chiến lược." |

### 3.6 Quy tắc bổ sung

- **Suy giảm theo thời gian (staleness):** nếu `score_updated_at` cũ hơn 30 ngày, gắn nhãn `STALE`, hiển thị điểm màu xám, loại khỏi báo cáo forecast cho tới khi chấm lại.
- **Điểm chưa xác thực:** yếu tố có `verified = false` được hiển thị riêng; hệ thống tính thêm chỉ số `confidence = (số yếu tố verified / 8)`.
- **Không tự động cộng dồn theo stage:** điểm không tăng chỉ vì deal chuyển giai đoạn. Chỉ hoạt động thực tế mới làm thay đổi điểm.

---

## 4. DANH SÁCH TÍNH NĂNG

### F-01 — Scorecard cơ hội
**User story:** Là sales, tôi muốn chấm điểm 8 yếu tố cho một cơ hội để biết nên đầu tư thời gian hay không.
**Acceptance criteria:**
- Hiển thị 8 yếu tố thành 2 nhóm BANT / 4P, mỗi yếu tố có bộ chọn 0–3 kèm mô tả rubric hiện ra khi hover.
- Không cho lưu điểm ≥1 nếu ô bằng chứng dưới 20 ký tự.
- Cho phép đính kèm hoạt động nguồn (cuộc gọi/email/tài liệu) làm bằng chứng; khi có nguồn, tự đặt `verified = true`.
- Tổng điểm mỗi trục và ô ma trận cập nhật tức thời (không cần reload).

### F-02 — Ma trận cơ hội (Opportunity Matrix)
**User story:** Là quản lý bán hàng, tôi muốn nhìn toàn bộ pipeline trên một ma trận 2 trục để phân bổ nguồn lực.
**Acceptance criteria:**
- Biểu đồ phân tán 2 trục (X = 4P, Y = BANT), kích thước điểm tỉ lệ với `amount`.
- Lọc theo owner, giai đoạn, kỳ đóng, ngành, quy mô deal.
- Click vào một điểm mở scorecard tương ứng.
- Deal có veto flag hiển thị viền đỏ bất kể vị trí.

### F-03 — Bản đồ nhóm ra quyết định
**User story:** Là sales, tôi muốn thấy mình đang phủ được ai và thiếu ai.
**Acceptance criteria:**
- Sơ đồ hiển thị thành viên theo vai trò và thái độ (màu: xanh = supporter, xám = neutral, đỏ = opposed, gạch chéo = unknown).
- Cảnh báo "Single-threaded" khi chỉ có 1 liên hệ được tiếp xúc trong 30 ngày.
- Cảnh báo "Chưa có champion" khi không có thành viên `role = CHAMPION` và `stance = SUPPORTER`.
- Hiển thị rõ ô trống cho vai trò `ECONOMIC` nếu chưa xác định.

### F-04 — Cổng sàng lọc theo giai đoạn (Stage Gate)
**User story:** Là giám đốc kinh doanh, tôi muốn deal không thể nhảy giai đoạn khi chưa đủ điều kiện.
**Acceptance criteria:**
- Cấu hình được ngưỡng điểm tối thiểu cho mỗi giai đoạn (mặc định: chuyển sang giai đoạn đề xuất/POC yêu cầu BANT ≥ 7).
- Chặn chuyển giai đoạn khi chưa đạt, hiển thị chính xác yếu tố nào đang thiếu.
- Cho phép quản lý ghi đè (override) kèm lý do bắt buộc; ghi vào `score_history`.

### F-05 — Bộ câu hỏi khám phá gợi ý
**User story:** Là sales mới, tôi muốn biết cần hỏi gì để nâng điểm yếu tố đang thấp.
**Acceptance criteria:**
- Với mỗi yếu tố có điểm ≤1, hệ thống hiển thị 3–5 câu hỏi gợi ý tương ứng (xem Phụ lục B).
- Câu hỏi cấu hình được theo ngành/dòng sản phẩm bởi admin.

### F-06 — Chấm điểm hỗ trợ bởi AI
**User story:** Là sales, tôi muốn hệ thống đọc ghi chú cuộc gọi và đề xuất điểm để tôi khỏi nhập thủ công.
**Acceptance criteria:**
- Nhận đầu vào là transcript/ghi chú, trả về đề xuất điểm cho từng yếu tố **kèm trích dẫn nguyên văn đoạn làm căn cứ**.
- Yếu tố không tìm được căn cứ → đề xuất 0 và ghi `insufficient evidence`, tuyệt đối không suy đoán.
- Đề xuất luôn ở trạng thái `suggested`, chỉ trở thành điểm chính thức khi người dùng xác nhận.
- Hiển thị rõ ràng nhãn phân biệt điểm do AI đề xuất và điểm do người xác nhận.

### F-07 — Cảnh báo & tự động hóa
**Acceptance criteria:**
- Thông báo khi: điểm quá hạn 30 ngày; điểm một yếu tố giảm ≥2 bậc; deal vào ô RESHAPE; veto flag mới bật; compelling event đến gần trong 14 ngày mà deal chưa ở giai đoạn cuối.
- Deal ở ô DISQUALIFY quá 14 ngày không hoạt động → tự động đề xuất đóng, cần một cú click xác nhận của owner.
- Deal vào ô NURTURE → tự động gỡ khỏi forecast kỳ hiện tại và gợi ý gán vào chiến dịch nuôi dưỡng.

### F-08 — Forecast dựa trên chất lượng
**User story:** Là giám đốc, tôi muốn forecast phản ánh chất lượng deal chứ không chỉ giai đoạn.
**Acceptance criteria:**
- Tách hai chỉ số: forecast theo giai đoạn truyền thống và forecast đã lọc theo veto rule + staleness.
- Hiển thị chênh lệch giữa hai con số như một chỉ số "mức độ thổi phồng pipeline".
- Cho phép xuất Excel/CSV kèm toàn bộ điểm thành phần.

### F-09 — Phản biện điểm 4P (Peer Review)
**Bối cảnh:** 4P là phần dễ bị thiên kiến lạc quan nhất.
**Acceptance criteria:**
- Deal có `amount` vượt ngưỡng cấu hình bắt buộc có người thứ hai (quản lý) chấm độc lập trục 4P.
- Hệ thống hiển thị song song hai bảng điểm và làm nổi bật yếu tố lệch ≥2 điểm.
- Điểm chính thức lấy giá trị thấp hơn cho tới khi hai bên thống nhất.

### F-10 — Phân tích win/loss theo điểm
**Acceptance criteria:**
- Đối chiếu điểm tại thời điểm chốt với kết quả thắng/thua để tính tỉ lệ thắng theo từng ô ma trận.
- Báo cáo yếu tố nào tương quan mạnh nhất với thắng lợi trong dữ liệu thực tế của tổ chức.
- Đề xuất hiệu chỉnh ngưỡng stage gate dựa trên dữ liệu (gợi ý, không tự động áp dụng).

---

## 5. MÀN HÌNH

| Mã | Màn hình | Nội dung chính |
|---|---|---|
| S-01 | Danh sách cơ hội | Thêm cột `BANT`, `4P`, `Quadrant` (badge màu), `Veto`, `Stale` |
| S-02 | Opportunity Scorecard | 8 yếu tố, bằng chứng, tổng điểm, ô ma trận, danh sách veto đang bật, nút "Chấm lại" |
| S-03 | Opportunity Matrix | Biểu đồ phân tán toàn pipeline (F-02) |
| S-04 | Buying Committee Map | Sơ đồ nhóm ra quyết định (F-03) |
| S-05 | Pipeline Health | Chênh lệch forecast, tỉ trọng 4 ô, phân bố staleness |
| S-06 | Admin | Cấu hình rubric, ngưỡng stage gate, bộ câu hỏi, ngưỡng peer review |

**Quy ước màu (thống nhất toàn hệ thống):** PURSUE = xanh lá, RESHAPE = hổ phách, NURTURE = xanh dương, DISQUALIFY = xám, Veto = đỏ.

---

## 6. PHÂN QUYỀN

| Vai trò | Quyền |
|---|---|
| Sales | Chấm điểm deal mình phụ trách, xem ma trận của mình |
| Quản lý nhóm | Chấm phản biện, override stage gate, xem toàn nhóm |
| Giám đốc kinh doanh | Xem toàn bộ, xem báo cáo win/loss |
| Admin | Cấu hình rubric, ngưỡng, câu hỏi |

Mọi thay đổi điểm và override đều ghi vào `score_history` (append-only, không cho xóa).

---

## 7. PHI MỤC TIÊU (Non-goals)

- Không tự động chấm điểm mà không có người xác nhận.
- Không thay thế các khung sâu hơn (MEDDIC, Challenger) cho deal enterprise phức tạp — module này là lớp sàng lọc và phân bổ nguồn lực.
- Không dùng điểm số làm KPI đánh giá cá nhân sales, vì sẽ tạo động cơ thổi phồng điểm và phá hỏng toàn bộ giá trị của hệ thống.

---

## 8. LỘ TRÌNH TRIỂN KHAI

| Giai đoạn | Phạm vi |
|---|---|
| Phase 1 (MVP) | F-01, F-02, F-04, mô hình dữ liệu Mục 2, veto rules |
| Phase 2 | F-03, F-05, F-07, F-08 |
| Phase 3 | F-06 (AI), F-09, F-10 |

---

## PHỤ LỤC A — Cấu trúc JSON mẫu

```json
{
  "opportunity_id": "b1f2...",
  "account_name": "Công ty ABC",
  "amount": 1850000000,
  "currency": "VND",
  "expected_close_date": "2026-11-30",
  "scores": {
    "BANT": {
      "BUDGET":    { "score": 2, "verified": true,  "evidence": "Chị Hoa (GĐ Tài chính) xác nhận ngân sách 2 tỷ đã duyệt trong kế hoạch OPEX 2026." },
      "AUTHORITY": { "score": 2, "verified": true,  "evidence": "Đã gặp GĐ Tài chính và Trưởng phòng CNTT; chưa tiếp cận Tổng giám đốc là người ký cuối." },
      "NEED":      { "score": 3, "verified": true,  "evidence": "Khách tự tính thiệt hại 180 triệu/tháng do quy trình đối soát thủ công." },
      "TIMELINE":  { "score": 1, "verified": false, "evidence": "Sales suy đoán khách muốn xong trong quý 4, chưa có xác nhận." }
    },
    "P4": {
      "PRICE":        { "score": 2, "verified": true,  "evidence": "Giá ta cao hơn đối thủ X khoảng 12%, khách công nhận giá trị module đối soát tự động." },
      "RELATIONSHIP": { "score": 1, "verified": true,  "evidence": "Có 3 liên hệ nhưng chưa ai chủ động vận động nội bộ." },
      "FIT":          { "score": 3, "verified": true,  "evidence": "Đáp ứng out-of-the-box; đã có case tương đương ở doanh nghiệp cùng ngành, cùng quy mô." },
      "PROCESS":      { "score": 1, "verified": false, "evidence": "Biết có hội đồng thẩm định nhưng chưa rõ bộ tiêu chí chấm." }
    }
  },
  "bant_total": 8,
  "p4_total": 7,
  "quadrant": "PURSUE",
  "confidence": 0.75,
  "veto_flags": ["V1_NO_COMPELLING_EVENT"],
  "forecast_eligible": false,
  "recommended_actions": [
    "Xác định và để khách xác nhận sự kiện bắt buộc (compelling event) — đây là điều kiện chặn forecast.",
    "Tiếp cận Tổng giám đốc để nâng AUTHORITY lên 3.",
    "Xác định bộ tiêu chí chấm thầu và tìm cách tham gia định hình."
  ]
}
```

## PHỤ LỤC B — Câu hỏi khám phá theo yếu tố

**Budget:** Ngân sách này đã được phê duyệt chưa, hay còn chờ kỳ lập kế hoạch? Thuộc năm tài chính nào? Ai là người ký duyệt khoản chi này? Nếu chi phí vượt dự kiến 20%, quy trình xử lý ra sao?

**Authority:** Ngoài anh/chị, còn ai tham gia đánh giá? Lần gần nhất công ty mua giải pháp tương tự, quy trình phê duyệt diễn ra thế nào? Ai sẽ là người ký hợp đồng cuối cùng? Có ai trong tổ chức có thể phản đối phương án này không?

**Need:** Vấn đề này đang gây ra chi phí bao nhiêu mỗi tháng? Nếu năm nay không làm gì thì hậu quả cụ thể là gì? Ai trong tổ chức chịu ảnh hưởng nặng nhất? Trước đây đã thử cách nào chưa và vì sao chưa hiệu quả?

**Timeline:** Vì sao lại là thời điểm này mà không phải sáu tháng nữa? Có sự kiện nào bắt buộc phải hoàn thành trước không? Ngày cụ thể là ngày nào? Để kịp mốc đó, khi nào cần ký hợp đồng?

**Price:** Anh/chị đang so sánh với mức đầu tư nào? Ngoài giá, tiêu chí nào quan trọng trong quyết định? Nếu giá cao hơn nhưng rút ngắn thời gian triển khai một nửa, điều đó có ý nghĩa gì với anh/chị?

**Relationship:** Ai sẽ trình bày phương án này trong cuộc họp nội bộ? Tôi có thể hỗ trợ anh/chị chuẩn bị tài liệu thuyết phục ban lãnh đạo không? Anh/chị đánh giá phương án của chúng tôi thế nào so với các lựa chọn khác?

**Fit:** Đâu là yêu cầu bắt buộc và đâu là mong muốn? Có ràng buộc nào về hệ thống hiện tại phải tích hợp không? Quy trình nào bắt buộc không được thay đổi?

**Process:** Các bước từ nay đến khi ký gồm những gì? Bộ tiêu chí đánh giá do bộ phận nào soạn? Có nhà cung cấp nào đã tham gia tư vấn xây dựng yêu cầu không? Đã có đơn vị nào demo trước chúng tôi chưa?
