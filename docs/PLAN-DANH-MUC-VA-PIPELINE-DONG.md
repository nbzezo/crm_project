# Phương án: danh mục động và pipeline cấu hình được

Nhánh: `ccr-cd146d84-w9ejer` (từ `main` @ 33efafe, bản 1.23.1, migration mới nhất v61)
Trạng thái: **thiết kế, chưa làm**.
Bối cảnh: chuẩn bị thương mại hoá theo hướng **mỗi khách hàng một bản cài riêng** (Docker), chưa làm SaaS.
Vì vậy không cần `tenant_id`; cấu hình nằm trong CSDL của từng bản cài.

---

## 1. Vì sao cần

Mỗi khách hàng mua CRM sẽ muốn quy trình bán hàng và danh mục của riêng họ. Hiện tất cả đang là
hằng số trong `packages/contracts/src/index.ts`, nhân đôi nhãn ở `client/src/i18n/vi.ts`, và một
số còn bị khoá thêm bằng `CHECK` trong CSDL. Muốn đổi một lý do thất bại cũng phải sửa mã, viết
migration và phát hành bản mới **cho đúng khách đó**. Mô hình cài riêng sẽ biến điều này thành N
nhánh mã khác nhau, và đó là thứ phải tránh bằng mọi giá.

Mục tiêu: **một mã nguồn duy nhất cho mọi khách**. Khác biệt giữa các khách chỉ nằm ở dữ liệu cấu
hình, và quản trị viên tự sửa được trên giao diện.

## 2. Hiện trạng đo được

### 2.1 Giai đoạn cơ hội

`STAGES` có 8 khoá. Khoá được lưu thẳng vào `deals.stage` (TEXT) với
`CHECK (stage IN ('lead',…,'lost'))`. Ràng buộc này được dựng lại ở v27 (`server/src/db/migrate.ts:329`).

Chỗ dùng khoá giai đoạn dưới dạng chuỗi viết cứng (không tính test, seed):

| Nơi | Số chỗ | Thực chất dùng để |
|---|---|---|
| `server/src/routes/views.ts` | 31 | `stage NOT IN ('won','lost')`, `stage = 'won'` |
| `server/src/services/focusService.ts` | 16 | như trên, cộng mục PoC |
| `server/src/routes/customers.ts` | 13 | như trên |
| `server/src/services/customerCare.ts` | 10 | như trên |
| `server/src/routes/deals.ts` | 8 | quy tắc chuyển giai đoạn |
| `server/src/services/ai/*` | 13 | như trên |
| `contracts.ts`, `cards.ts`, `crm.ts`, `scoring.ts`, `handoverService.ts`, `revenueKpi.ts` | 14 | xem bảng 2.2 |
| Client (21 tệp) | ~70 | nhãn, màu, thứ tự, bước, cột Kanban |

**Phát hiện quan trọng:** khoảng 85% số chỗ trên máy chủ chỉ hỏi một câu: *"cơ hội này đang mở,
đã thắng hay đã thua?"*. Chúng không cần biết tên giai đoạn. Phần còn lại là một số ít hành vi
gắn vào giai đoạn cụ thể:

### 2.2 Hành vi gắn vào giai đoạn cụ thể

| Giai đoạn | Hành vi | Vị trí |
|---|---|---|
| `won` | xác suất 100, ghi `closed_at`, chụp điểm, bàn giao, tạo hợp đồng, tính doanh số | `deals.ts:283`, `handoverService.ts:191`, `views.ts:1125` |
| `lost` | xác suất 0, **bắt buộc lý do**, **không bao giờ bị cổng chặn** | `deals.ts:174,355,490`, `scoring.ts:673` |
| `quoted`, `negotiating` | cổng điểm BANT tối thiểu (cấu hình ở `scoring.stage_gate`) | `scoring.ts:668` |
| `negotiating` | phủ quyết V2: chưa tiếp cận người duyệt ngân sách thì chặn | `scoring.ts:690` |
| `negotiating` | "sự kiện bắt buộc sắp tới mà chưa tới giai đoạn cuối" | `views.ts:793` |
| `poc` | các trường `poc_*`, mục PoC trong Trọng tâm | `focusService.ts:652`, `DealForm.tsx` |
| `lead` | giai đoạn mặc định khi tạo mới, kể cả cơ hội gia hạn | `deals.ts:173`, `contracts.ts:511` |
| mọi giai đoạn | xác suất mặc định `STAGE_PROBABILITY` | `deals.ts:287` |
| mọi giai đoạn | thứ tự, màu, nhãn | `client/src/i18n/vi.ts:435,1009` |

### 2.3 Danh mục khác

| Danh mục | Hiện tại | Có hành vi riêng không |
|---|---|---|
| Lý do thất bại `LOST_REASONS` | hằng số, không có `CHECK` | Không (chỉ để thống kê) |
| Loại tương tác `INTERACTION_TYPES` | hằng số + `CHECK` (`migrate-v4.sql:90`) | Không |
| Loại tài liệu `DOC_TYPES` | hằng số; AI đọc tài liệu trả về khoá này | Không (chỉ cần prompt AI lấy danh sách động) |
| Ngành, quy mô, nguồn khách hàng | **chuỗi tự do** | Không |
| Nguồn cơ hội `deals.source` | chuỗi tự do | Không |
| Trạng thái hợp đồng, báo giá, dự án, công việc, doanh thu | hằng số + `CHECK` | **Có**: điều khiển vòng đời, hạn, bộ lọc |

## 3. Nguyên tắc thiết kế

1. **Khoá ổn định, nhãn đổi được.** Mỗi mục có `key` (không đổi sau khi tạo) và `label` (sửa tự
   do). Dữ liệu nghiệp vụ lưu `key`. Đổi tên không phải cập nhật hàng triệu dòng, và lịch sử, bản
   xuất, nhật ký thay đổi không bị gãy.
2. **Mã nguồn không gọi tên giai đoạn, chỉ hỏi thuộc tính.** Thay `stage = 'won'` bằng
   `stage_category = 'won'`; thay `target === 'negotiating'` bằng `stage.require_economic_buyer`.
   Đây là thay đổi cốt lõi. Làm xong thì thêm, bớt, đổi tên giai đoạn không chạm tới mã.
3. **Ba tầng mức độ tự do**, tuỳ việc danh mục có điều khiển hành vi hay không:
   - **Tầng A, danh mục thuần nhãn:** thêm, sửa, ẩn, sắp xếp, gộp tự do.
   - **Tầng B, trạng thái có hành vi:** chỉ đổi nhãn, màu, thứ tự. Không thêm, không xoá.
   - **Tầng C, pipeline:** bảng riêng vì có nhiều thuộc tính hành vi.
4. **Không xoá cứng mục đã dùng.** Ẩn (`is_active = 0`) thì mục biến khỏi ô chọn nhưng bản ghi cũ
   vẫn hiển thị đúng nhãn. Muốn bỏ hẳn thì phải **gộp** vào mục khác.
5. **CSDL vẫn giữ toàn vẹn.** Bỏ `CHECK` liệt kê cứng, thay bằng khoá ngoại tới bảng cấu hình
   (`deals.stage → pipeline_stages.key`). Không đẩy việc kiểm tra hoàn toàn lên tầng ứng dụng.
6. **Nhất quán với phong cách hiện có:** cấu hình đọc từ CSDL lúc chạy, `app_settings` cho giá trị
   đơn lẻ, bảng riêng cho danh sách. Mọi lần ghi cấu hình xoá `responseCache` (đã có `trackWrites`).

## 4. Thiết kế bước 1: Danh mục động (Picklist)

### 4.1 Lược đồ

```sql
CREATE TABLE picklist_items (
  id          INTEGER PRIMARY KEY,
  list_key    TEXT NOT NULL,          -- 'lost_reason', 'interaction_type', ...
  item_key    TEXT NOT NULL,          -- khoá ổn định, không đổi sau khi tạo
  label       TEXT NOT NULL,
  color       TEXT,                   -- tuỳ chọn, mã màu trong bảng màu hiện có
  position    REAL NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  is_system   INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0,1)), -- mục mã nguồn cần, không ẩn/xoá được
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (list_key, item_key)
);
CREATE INDEX idx_picklist_list ON picklist_items(list_key, position);
```

Danh sách các `list_key` hợp lệ **khai báo trong mã**, không nằm trong CSDL, vì mỗi danh mục gắn
với một hoặc nhiều cột cụ thể và quyết định tầng tự do:

```ts
// packages/contracts/src/picklists.ts
export const PICKLISTS = {
  lost_reason:      { tier: 'A', usages: [['deals', 'lost_reason']] },
  interaction_type: { tier: 'A', usages: [['interactions', 'type']] },
  doc_type:         { tier: 'A', usages: [['documents', 'doc_type']] },
  customer_industry:{ tier: 'A', usages: [['customers', 'industry']] },
  customer_size:    { tier: 'A', usages: [['customers', 'size']] },
  customer_source:  { tier: 'A', usages: [['customers', 'source']] },
  deal_source:      { tier: 'A', usages: [['deals', 'source']] },
  // Tầng B (đợt sau): chỉ đổi nhãn, màu, thứ tự
  contract_status:  { tier: 'B', usages: [['contracts', 'status']] },
  quotation_status: { tier: 'B', usages: [['quotations', 'status']] },
} as const;
```

`usages` là nguồn sự thật cho ba việc: đếm số bản ghi đang dùng một mục, **gộp mục**, và kiểm tra
giá trị khi ghi.

Không làm bảng `picklists` riêng: thêm danh mục mới luôn đi kèm mã (cột nào dùng nó, ô nào hiển
thị), nên khai báo trong mã là đúng chỗ.

### 4.2 Kiểm tra giá trị

- Thêm `assertPicklistValue(db, listKey, value, { allowInactive })` trong `server/src/lib/validate.ts`.
  Mục **đang ẩn** vẫn hợp lệ khi bản ghi **đã mang sẵn** giá trị đó (sửa cơ hội cũ không bị lỗi),
  nhưng không hợp lệ khi đặt mới.
- Bỏ `z.enum(LOST_REASONS)` và các `z.enum` tương tự, thay bằng `z.string()` cộng lời gọi trên.
- `interactions.type` đang có `CHECK`, phải dựng lại bảng (theo đúng khuôn v27 trong `migrate.ts`).
  Không dùng khoá ngoại vì `picklist_items` dùng khoá ghép; kiểm ở tầng ứng dụng là đủ cho tầng A.

### 4.3 Dữ liệu cũ dạng chuỗi tự do (ngành, quy mô, nguồn)

Hai lựa chọn:

| | Lưu `item_key` | Lưu nhãn như hiện tại |
|---|---|---|
| Đổi tên mục | không đụng dữ liệu | phải cập nhật mọi dòng |
| Báo cáo theo nhóm | đúng | lệch khi có lỗi chính tả |
| Migration | phải ánh xạ chuỗi cũ thành khoá | không cần |

**Chọn lưu `item_key`.** Migration làm như sau:

1. Lấy các giá trị khác nhau của cột, chuẩn hoá bằng hàm bỏ dấu và chữ thường (`viSearch.ts`).
2. Mỗi nhóm trùng sau chuẩn hoá thành một mục, `label` lấy dạng xuất hiện nhiều nhất, `item_key` là
   `legacy_<n>`.
3. Cập nhật cột về `item_key`.
4. Trang cấu hình hiện nhãn "Từ dữ liệu cũ" và nút **Gộp** để quản trị viên dọn các mục gần giống
   nhau (ví dụ "CNTT" và "Công nghệ thông tin").

Ghi bảng ánh xạ cũ → mới vào `entity_change_log` để rollback và đối chiếu được.

### 4.4 API

```
GET    /api/picklists                      → { [list_key]: Item[] }  (đọc một lần khi mở app)
POST   /api/picklists/:list                → tạo mục (sinh item_key từ nhãn, bỏ dấu, chống trùng)
PATCH  /api/picklists/:list/:id            → đổi nhãn, màu, ẩn/hiện
PUT    /api/picklists/:list/order          → sắp xếp
POST   /api/picklists/:list/:id/merge      → { into_id } gộp: cập nhật mọi `usages`, rồi xoá mục
GET    /api/picklists/:list/:id/usage      → số bản ghi đang dùng (hiện trước khi gộp/ẩn)
```

Quyền: đọc theo đăng nhập; ghi theo `settings.app` / `update` (đã có trong `PERMISSION_RESOURCES`).
Gộp chạy trong một transaction và ghi `entity_change_log`.

### 4.5 Giao diện

- **Cài đặt → Danh mục** (thẻ mới): cột trái là danh sách các danh mục, cột phải là các mục kéo thả
  sắp xếp được, sửa nhãn tại chỗ, chọn màu, công tắc ẩn/hiện, số bản ghi đang dùng, menu Gộp vào….
- Hook `useCrmConfig()` (React Query, `staleTime: Infinity`, xoá cache khi lưu cấu hình) cung cấp
  `picklist(listKey)` và `pickLabel(listKey, key)`. Nhãn của khoá lạ hiện nguyên khoá, không vỡ.
- Thay `t.lostReason[x]`, `t.interactionType[x]`, `t.docType[x]`, `LOST_REASON_ORDER`… trong
  `vi.ts` bằng hook trên. Nhãn mặc định chuyển vào migration seed.
- Ô ngành, quy mô, nguồn ở form khách hàng đổi từ ô gõ tự do sang ô chọn có tìm kiếm, kèm
  "+ Thêm mục mới" ngay trong ô cho người có quyền.
- Prompt AI đọc tài liệu (`routes/ai.ts`) lấy danh sách `doc_type` đang bật thay vì `DOC_TYPES`.

## 5. Thiết kế bước 2: Pipeline cấu hình được

### 5.1 Lược đồ

```sql
CREATE TABLE pipelines (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  position   REAL NOT NULL DEFAULT 0
);

CREATE TABLE pipeline_stages (
  id            INTEGER PRIMARY KEY,
  pipeline_id   INTEGER NOT NULL REFERENCES pipelines(id),
  key           TEXT NOT NULL UNIQUE,   -- khoá toàn cục, không đổi; deals.stage trỏ vào đây
  label         TEXT NOT NULL,
  category      TEXT NOT NULL CHECK (category IN ('open','won','lost')),
  position      REAL NOT NULL,
  color         TEXT,
  probability   INTEGER NOT NULL CHECK (probability BETWEEN 0 AND 100),
  is_active     INTEGER NOT NULL DEFAULT 1,
  -- Thuộc tính hành vi, thay cho việc mã nguồn gọi tên giai đoạn:
  gate_bant_min           INTEGER,      -- NULL = không có cổng; thay scoring.stage_gate
  require_economic_buyer  INTEGER NOT NULL DEFAULT 0,  -- phủ quyết V2 (hiện chỉ 'negotiating')
  track_poc               INTEGER NOT NULL DEFAULT 0,  -- hiện khối PoC, đưa vào Trọng tâm
  max_days_in_stage       INTEGER,      -- cảnh báo "nằm quá lâu", NULL = dùng STALE_DAYS chung
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
```

Quy tắc bất biến (kiểm ở API, có test):

- Mỗi pipeline có **đúng một** giai đoạn `won` và **đúng một** `lost`. Hai giai đoạn này đổi được
  nhãn và màu, **không xoá, không đổi `category`**. Xác suất cố định 100 và 0.
- Có ít nhất một giai đoạn `open`. Giai đoạn `open` đầu tiên theo `position` là **giai đoạn bắt
  đầu** (thay `'lead'` viết cứng khi tạo mới và khi tạo cơ hội gia hạn).
- `category` **không đổi** sau khi tạo. Nhờ vậy cột phi chuẩn hoá ở 5.2 không bao giờ lệch.
- `key` sinh từ nhãn (bỏ dấu, `snake_case`, chống trùng), không đổi.

**Một pipeline hay nhiều?** Đợt này giao diện chỉ có **một pipeline**. Bảng `pipelines` và cột
`pipeline_id` vẫn tạo sẵn vì rẻ và tránh phải dựng lại bảng sau. Pipeline của một cơ hội suy ra từ
giai đoạn của nó (`key` duy nhất toàn cục), nên `deals` **không cần** cột `pipeline_id`. Khi cần
pipeline riêng cho gia hạn hay cho từng dòng sản phẩm thì chỉ thêm giao diện.

### 5.2 Thay đổi bảng `deals`

1. Dựng lại bảng (khuôn v27): bỏ `CHECK (stage IN …)`, thêm
   `stage TEXT NOT NULL REFERENCES pipeline_stages(key)`. Khoá ngoại tới cột `UNIQUE` hợp lệ trong
   SQLite, và `foreign_keys = ON` đã bật (`connection.ts`).
2. Thêm cột phi chuẩn hoá `stage_category TEXT NOT NULL CHECK (stage_category IN ('open','won','lost'))`
   cùng chỉ mục `(stage_category, stage_entered_at)`.
3. Giữ `stage_category` đồng bộ bằng **trigger**, không dựa vào việc nhớ gọi hàm ở từng chỗ ghi
   (cùng lý do với `PLAN-TINH-TRUOC-LUU-DEM.md` mục 2):

```sql
CREATE TRIGGER trg_deals_stage_category_ins AFTER INSERT ON deals BEGIN
  UPDATE deals SET stage_category =
    (SELECT category FROM pipeline_stages WHERE key = NEW.stage) WHERE id = NEW.id;
END;
CREATE TRIGGER trg_deals_stage_category_upd AFTER UPDATE OF stage ON deals BEGIN
  UPDATE deals SET stage_category =
    (SELECT category FROM pipeline_stages WHERE key = NEW.stage) WHERE id = NEW.id;
END;
```

Vì sao phi chuẩn hoá thay vì `JOIN pipeline_stages` ở mọi truy vấn: khoảng 60 truy vấn chỉ cần
đổi một mệnh đề `WHERE`, không phải thêm `JOIN`, và vẫn dùng chỉ mục được. Đây là thay đổi cơ học,
dễ rà và dễ test.

### 5.3 Thay mã nguồn

| Hiện tại | Sau |
|---|---|
| `d.stage NOT IN ('won','lost')` | `d.stage_category = 'open'` |
| `stage = 'won'` / `'lost'` | `stage_category = 'won'` / `'lost'` |
| `isClosed(stage)` (`crm.ts:35`) | `stageOf(db, key).category !== 'open'` |
| `STAGE_PROBABILITY[stage]` (`deals.ts:287`) | `stageOf(db, key).probability` |
| `settings.stageGate[target]` (`scoring.ts:668`) | `stageOf(db, target).gate_bant_min` |
| `target === 'negotiating' && v2_no_economic` (`scoring.ts:690`) | `stage.require_economic_buyer && …` |
| `x.stage NOT IN ('negotiating')` (`views.ts:793`) | giai đoạn chưa phải `open` cuối cùng theo `position` |
| mục PoC (`focusService.ts:652`), khối PoC ở `DealForm` | `stage.track_poc` |
| `'lead'` khi tạo (`deals.ts:173`, `contracts.ts:511`) | `startStage(db, pipelineId)` |
| `z.enum(STAGES)` (`deals.ts:38`) | `z.string()` + kiểm tồn tại và `is_active` |
| `for (const stage of STAGES)` (`deals.ts:143`) | duyệt `pipeline_stages` theo `position` |
| `isClosed` khi ghi `closed_at`, chụp điểm, bàn giao | theo `category` |

`stageOf()` đọc từ một bản đệm trong bộ nhớ, xoá khi ghi cấu hình. Bảng chỉ có vài chục dòng, nên
không thêm truy vấn nào cho mỗi request.

**Chặn tái phạm:** thêm test quét mã nguồn máy chủ, báo lỗi khi xuất hiện lại chuỗi
`'won'`, `'lost'`, `'negotiating'`… trong SQL hay so sánh, ngoài một danh sách cho phép (migration,
seed, test). Cách làm giống `client/scripts/check-ui-system.mjs`.

### 5.4 Thêm, ẩn, xoá, sắp xếp giai đoạn

| Thao tác | Quy tắc |
|---|---|
| Thêm | chỉ `category = 'open'`; chèn vào vị trí bất kỳ trước `won/lost` |
| Đổi nhãn, màu, xác suất, cổng, cờ | tự do; **không** cập nhật lại xác suất của cơ hội hiện có (người dùng có thể đã sửa tay) |
| Sắp xếp | kéo thả; `won` và `lost` luôn ở cuối |
| Ẩn | giai đoạn còn cơ hội thì phải chọn **giai đoạn đích**; chuyển hết sang đó trong một transaction, có ghi `entity_change_log` và lý do "Cấu hình pipeline". Cơ hội đã đóng giữ nguyên |
| Xoá cứng | chỉ khi chưa từng có cơ hội nào, kể cả trong `entity_change_log` / `deal_score_history`; còn lại thì chỉ ẩn |

Chuyển hàng loạt khi ẩn **không** đi qua cổng điểm, vì đây là thao tác quản trị chứ không phải
người bán tự đánh giá. Nhật ký ghi rõ để báo cáo trượt giai đoạn không bị hiểu sai.

### 5.5 Dữ liệu ban đầu và chuyển cấu hình cũ

Migration chèn đúng 8 giai đoạn hiện có với **cùng khoá**, nên `deals.stage` không phải đổi:

| key | category | probability | gate_bant_min | require_economic_buyer | track_poc |
|---|---|---|---|---|---|
| lead | open | 10 | | | |
| approaching | open | 20 | từ `scoring.stage_gate` nếu có | | |
| discussing | open | 40 | từ `scoring.stage_gate` nếu có | | |
| poc | open | 50 | | | 1 |
| quoted | open | 60 | 7 (hoặc giá trị đã lưu) | | |
| negotiating | open | 80 | 9 (hoặc giá trị đã lưu) | 1 | |
| won | won | 100 | | | |
| lost | lost | 0 | | | |

Nhãn và màu lấy từ `vi.ts` / `STAGE_COLORS`. Sau migration, khoá `scoring.stage_gate` trong
`app_settings` thôi được đọc; giữ lại một bản phát hành rồi mới xoá, để rollback vẫn có giá trị.

### 5.6 API

```
GET    /api/pipelines                         → pipelines kèm stages (gộp vào GET /api/crm-config)
POST   /api/pipelines/:id/stages              → thêm giai đoạn
PATCH  /api/pipelines/:id/stages/:stageId     → sửa thuộc tính
PUT    /api/pipelines/:id/stages/order        → sắp xếp
POST   /api/pipelines/:id/stages/:stageId/archive  { move_to_stage_id } → ẩn, chuyển cơ hội
GET    /api/deals                             → giữ dạng { stages: {key: Deal[]}, totals },
                                                thêm `stage_order: key[]` để client không tự xếp
```

Gộp `GET /api/picklists` và `GET /api/pipelines` thành **`GET /api/crm-config`**: một request lúc
mở app, client dùng chung qua `useCrmConfig()`.

### 5.7 Giao diện

- **Cài đặt → Quy trình bán hàng** (thẻ mới, thay phần cổng giai đoạn đang nằm ở
  `ScoringSettings.tsx`): danh sách giai đoạn kéo thả, mỗi dòng có nhãn, màu, xác suất, cổng BANT,
  hai công tắc *Yêu cầu đã gặp người duyệt ngân sách* và *Theo dõi PoC*, số ngày tối đa, số cơ hội
  đang ở giai đoạn đó. Xem trước pipeline ngay bên dưới.
- Kanban (`PipelinePage`), `DealStageStepper`, `DealCard`, `DealForm`, biểu đồ Tổng quan, Sức khoẻ
  pipeline, Báo cáo: thay `STAGE_ORDER`, `OPEN_STAGES`, `STAGE_COLORS`, `t.stage[…]` bằng dữ liệu từ
  `useCrmConfig()`.
- Kiểu `Stage` trong `@workflow/contracts` đổi từ union 8 chuỗi sang `type StageKey = string`. Mất
  kiểm tra kiểu ở các chỗ so sánh trực tiếp, nhưng đó chính là những chỗ phải bỏ (5.3). Trình biên
  dịch sẽ chỉ ra toàn bộ danh sách cần sửa ngay khi đổi kiểu.
- AI: `contextBuilder` và prompt dùng nhãn giai đoạn lấy từ cấu hình, không dùng khoá.

## 6. Chia đợt phát hành

Mỗi đợt là một bản phát hành độc lập, chạy được trên production và rollback được. Số migration phải
kiểm lại `LATEST_VERSION` trên `main` mới nhất ngay trước khi làm (hiện là 61).

| Đợt | Bản | Migration | Nội dung | Người dùng thấy gì | Ước lượng |
|---|---|---|---|---|---|
| 1 | 1.24.0 | v62 | `picklist_items`; chuyển lý do thất bại, loại tương tác, loại tài liệu; dựng lại `interactions` bỏ `CHECK`; thẻ Cài đặt → Danh mục | sửa được 3 danh mục | 3–4 ngày |
| 2 | 1.25.0 | v63 | ngành, quy mô, nguồn KH, nguồn cơ hội thành picklist; ánh xạ dữ liệu cũ; tính năng Gộp | ô chọn thay ô gõ tự do, dọn dữ liệu trùng | 2–3 ngày |
| 3 | 1.25.1 | v64 | `pipelines`, `pipeline_stages`, `deals.stage_category` + trigger; thay ~60 truy vấn sang `stage_category`; test chặn tái phạm. **Không đổi hành vi** | không thấy gì (tái cấu trúc thuần) | 3–4 ngày |
| 4 | 1.26.0 | v65 | dựng lại `deals` với khoá ngoại; chuyển cổng/V2/PoC sang thuộc tính giai đoạn; API và thẻ Cài đặt → Quy trình bán hàng; client đọc giai đoạn động | thêm, đổi tên, sắp xếp, ẩn giai đoạn | 5–7 ngày |
| 5 | 1.27.0 | — | xuất/nhập **hồ sơ cấu hình** (JSON) cho từng khách | triển khai khách mới bằng một tệp | 1–2 ngày |

Tách đợt 3 khỏi đợt 4 có chủ đích: đợt 3 thay hàng loạt truy vấn mà kết quả **phải giống hệt**.
So số liệu Tổng quan, Báo cáo, Doanh thu trước và sau trên bản sao dữ liệu thật là cách kiểm chắc
nhất. Gộp với thay đổi hành vi thì không còn so được.

### 6.1 Hồ sơ cấu hình (đợt 5), cần cho mô hình cài riêng

Mỗi khách là một bản cài, nên cần cách mang cấu hình giữa các bản cài mà không sửa tay:

- `GET /api/system/config-profile` xuất picklist, pipeline, cổng điểm, mẫu bàn giao, mẫu Model A/B
  và vị trí/quyền thành một tệp JSON có `schema_version`.
- `POST /api/system/config-profile` (hoặc `npm run config:apply -- profile.json` khi khởi tạo) nhập
  theo `key`: có thì cập nhật, chưa có thì thêm, **không bao giờ xoá**.
- Lưu vài hồ sơ mẫu theo ngành trong `docs/profiles/` (ví dụ *Phần mềm B2B*, *Phân phối thiết bị*)
  làm điểm khởi đầu khi bán.

## 7. Ràng buộc phải giữ

- **Phạm vi dữ liệu (v40):** cấu hình là toàn cục, không phụ thuộc phạm vi. Mọi truy vấn sửa ở đợt 3
  vẫn phải giữ nguyên `dealScope(req)` đang có.
- **Lưu đệm báo cáo (v61):** ghi cấu hình là một lần ghi, `trackWrites` đã xoá `responseCache`. Bản
  đệm `stageOf()` trong bộ nhớ cũng phải xoá cùng lúc.
- **Sao lưu và xuất dữ liệu:** `picklist_items`, `pipelines`, `pipeline_stages` là dữ liệu nghiệp vụ,
  phải thêm vào `EXPORT_TABLES` (`server/src/routes/system.ts`). Khôi phục bản xuất **trước** v62
  phải tự sinh cấu hình mặc định.
- **Rollback:** mỗi migration có `migrate-vNN-rollback.sql` và một dòng trong `rollback.ts`. Rollback
  v65 phải dựng lại `CHECK` cũ, và **từ chối chạy** nếu đang có cơ hội ở giai đoạn ngoài 8 khoá
  gốc (báo rõ cần chuyển chúng về đâu), thay vì làm hỏng ràng buộc.
- **Kiểm tra:** test tích hợp cho từng quy tắc bất biến ở 5.1 và 5.4; test migration trên CSDL dựng
  từ v61 với dữ liệu mẫu, so tổng số liệu trước và sau.

## 8. Ngoài phạm vi (để sau)

- Trạng thái tầng B (hợp đồng, báo giá, dự án, công việc): chỉ đổi nhãn, làm khi có khách yêu cầu.
- Nhiều pipeline trên giao diện, quy tắc riêng cho từng pipeline.
- Trường tùy biến cho khách hàng, cơ hội, hợp đồng (bước 3 của bản đánh giá). Picklist ở đây sẽ là
  nền cho kiểu trường `select` của bước đó.
- Danh sách yếu tố chấm điểm BANT/4P cấu hình được.
- Đa ngôn ngữ cho nhãn cấu hình (`label` hiện là tiếng Việt; khi cần thì thêm `label_i18n` JSON).

## 9. Rủi ro

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Đợt 3 sửa sai một truy vấn làm lệch forecast hoặc doanh số | Cao | so số liệu trên bản sao dữ liệu thật trước khi đẩy; test quét chuỗi; không đổi hành vi trong cùng đợt |
| Dựng lại bảng `deals` lớn làm khởi động lâu | Trung bình | đã làm ở v27; đo thời gian trên CSDL 15.000 cơ hội trong `PLAN-TINH-TRUOC-LUU-DEM.md` trước khi phát hành |
| Ánh xạ ngành/nguồn cũ gom sai | Thấp | chỉ gom khi trùng sau chuẩn hoá; còn lại để quản trị viên tự Gộp; có nhật ký ánh xạ |
| Khách đổi pipeline giữa chừng làm báo cáo theo giai đoạn trong quá khứ khó đọc | Trung bình | khoá không đổi, ẩn chứ không xoá; báo cáo lịch sử hiện nhãn kèm "(đã ẩn)" |
| Mất kiểm tra kiểu khi `Stage` thành `string` | Thấp | chính là mục tiêu; test chặn tái phạm thay cho kiểm tra kiểu |
