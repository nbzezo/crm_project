# Tuân thủ MISRA (ánh xạ) — WorkFlow CRM

Cập nhật: 2026-11-14 · Phiên bản: 1.44.0

## 0. Phạm vi và cách gọi tên

MISRA C:2012 và MISRA C++ là bộ nguyên tắc cho **ngôn ngữ C và C++**. Dự án này không có
dòng C/C++ nào (374 `.ts`, 241 `.tsx`, 124 `.sql`), nên **không được tuyên bố là "MISRA
compliant"** — thuật ngữ đó chỉ được định nghĩa cho C, C++ và Autocode.

Tài liệu này dùng hai thứ thực sự áp dụng được:

1. **MISRA Compliance:2020** — khung đánh giá tuân thủ. Phần này *không phụ thuộc ngôn ngữ*:
   nó quy định cần có Guideline Enforcement Plan, Deviation Records, Guideline
   Recategorization Plan và Compliance Summary.
2. **Ánh xạ nguyên tắc** — các directive/rule của MISRA C:2012 được ánh xạ sang cấu trúc
   tương đương trong TypeScript/SQL, rồi enforce bằng `tsc` và ESLint.

**Phạm vi mã nguồn:** 627 file mà `npx eslint .` phủ — gồm `client/src`, `server/src`,
`packages/contracts/src`, `e2e/`, `scripts/` và các file cấu hình ở gốc. Mã test nằm
**trong** phạm vi (không miễn trừ).

## 1. Guideline Enforcement Plan

Mỗi nguyên tắc dưới đây được một công cụ kiểm tự động. Không có nguyên tắc nào chỉ dựa vào
rà soát bằng mắt.

| Nguyên tắc ánh xạ | Gốc MISRA | Công cụ | Cấu hình |
|---|---|---|---|
| Không có cảnh báo khi biên dịch | Dir 2.1 | `tsc` ×3 project | `strict: true` |
| Truy cập mảng/Record phải trong biên | Rule 18.1 | `tsc` | `noUncheckedIndexedAccess` |
| Cấm `switch` rơi tầng | Rule 16.3 | `tsc` | `noFallthroughCasesInSwitch` |
| Mọi nhánh hàm phải trả giá trị | Rule 17.4 | `tsc` | `noImplicitReturns` |
| Không có biến/tham số chết | Rule 2.x | `tsc` + ESLint | `noUnusedLocals`, `noUnusedParameters`, `@typescript-eslint/no-unused-vars` |
| Ghi đè phương thức phải tường minh | — | `tsc` | `noImplicitOverride` |
| Lỗi trong `catch` là `unknown` | Dir 4.7 | `tsc` | `useUnknownInCatchVariables` |
| Cấm kiểu `any` | Dir 1.1 | ESLint | `@typescript-eslint/no-explicit-any` |
| So sánh phải chặt | Rule 10.x | ESLint | `eqeqeq` (miễn trừ `== null`, xem D-01) |
| Giá trị trả về phải được dùng | Rule 17.7 | ESLint | `no-floating-promises`, `no-misused-promises` |
| Truy vấn SQL phải tham số hóa | Dir 4.1 | Rà soát + test | Xem §5 |
| Bảng nghiệp vụ mới phải xuất được | — | Test | `server/src/test/exportTables.test.ts` |

Lệnh chạy lại toàn bộ: xem §5.

## 2. Deviation Records

Mỗi bản ghi nêu nguyên tắc bị lệch, phạm vi, lý do, và biện pháp bù.

### D-01 — `== null` thay cho `=== null || === undefined`

- **Nguyên tắc:** Rule 10.x (so sánh chặt) · **Số chỗ:** 254
- **Lý do:** `x == null` trong TypeScript bắt **đúng** cả `null` và `undefined`, là idiom
  được ESLint hỗ trợ sẵn qua tùy chọn `{ null: 'ignore' }`. Viết chặt sẽ thành
  `x === null || x === undefined` ở 254 chỗ, dài hơn mà không an toàn hơn.
- **Bằng chứng nhất quán:** đã kiểm từng dòng nguồn của cả 254 chỗ — **254/254** đều là
  `== null`/`!= null`, không một ca so sánh lỏng nào khác. Đây là idiom có kỷ luật, không
  phải sự tùy tiện.
- **Biện pháp bù:** `eqeqeq: ['error', 'always', { null: 'ignore' }]` chặn mọi so sánh lỏng
  khác ngay tại CI.

### D-02 — `any` tại biên thư viện BlockNote

- **Nguyên tắc:** Dir 1.1 (không dựa vào hành vi không xác định) · **Số chỗ:** 13
- **Phạm vi:** `client/src/components/crm/meetingNotes/blocks/*` — tất cả đều có dạng
  `BlockNoteEditor<any, any, any>`.
- **Lý do:** generic của `BlockNoteEditor` là bất biến (invariant), nên không thể khai báo
  kiểu cụ thể mà vẫn truyền được editor thật vào. Đây là hạn chế của thư viện, không phải
  lựa chọn của dự án.
- **Biện pháp bù:** mỗi chỗ có `// eslint-disable-next-line` **kèm comment giải thích lý do
  ngay tại chỗ**, và `no-explicit-any` ở mức `error` cho toàn bộ phần còn lại của dự án
  (0 chỗ `any` ngoài 13 chỗ này). `--report-unused-disable-directives` xác nhận không có
  directive nào bị bỏ quên.

### D-03 — Type assertion `as T`

- **Nguyên tắc:** Rule 11.3 (ép kiểu giữa kiểu không tương thích) · **Số chỗ:** 669
  (trong đó 39 là `as unknown as`)
- **Lý do:** phần lớn là thu hẹp kiểu kết quả truy vấn `better-sqlite3` (trả `unknown`) và
  kiểu dữ liệu từ thư viện ngoài. 144 assertion dư thừa đã bị **xóa** ở 1.44.0 sau khi
  compiler chứng minh chúng không đổi kiểu.
- **Biện pháp bù:** đã đo bằng `no-unnecessary-type-assertion`; hiện chỉ còn **2** chỗ bị
  rule báo là dư, và cả hai đã được **chứng minh là cần thiết** (xem R-02).

### D-04 — `test()` của `node:test` trả Promise không được `await`

- **Nguyên tắc:** Rule 17.7 (giá trị trả về phải được dùng) · **Số chỗ:** 588
- **Lý do:** `test()` của `node:test` trả về một Promise do **chính test runner** quản lý.
  Không `await` ở tầng ngoài là cách dùng đúng theo tài liệu Node. Cả 588 chỗ đều là một
  mẫu duy nhất `test('…', async () => { … })`.
- **Biện pháp bù:** khai báo chính xác qua `allowForKnownSafeCalls` cho `test`/`it`/
  `describe` **của riêng package `node:test`** — không nới lỏng rule cho hàm cùng tên ở
  nơi khác.

### D-05 — Thuộc tính JSX nhận handler trả Promise

- **Nguyên tắc:** Rule 17.7 · **Số chỗ:** 55
- **Lý do:** React bỏ qua giá trị trả về của event handler. Bọc mọi `onClick={fn}` thành
  `onClick={() => void fn()}` ở 55 chỗ chỉ thêm nhiễu mà không đổi hành vi.
- **Bằng chứng an toàn:** đã rà soát bằng AST toàn bộ handler liên quan
  (`VoiceNoteRecorder`, `Combobox`, `LoginPage`, `ResetPasswordPage`,
  `ForceChangePasswordPage`, `PublicSharePage`, `CareAssistant`, `MeetingNoteBody`) —
  **mỗi handler đều đã tự bao bằng `try/catch`** và hiển thị lỗi cho người dùng. Đúng một
  chỗ thiếu (`FollowUpPage.copy`) và đã được sửa ở 1.44.0.
- **Biện pháp bù:** `checksVoidReturn: { attributes: false }` chỉ tắt kiểm cho *thuộc tính*
  JSX. Hai dạng còn lại (`property`, `argument`) **vẫn được kiểm** và cả hai chỗ vi phạm
  đã được sửa tường minh.

### D-06 — Non-null assertion `x!`

- **Nguyên tắc:** Rule 11.3 / Dir 1.1 · **Số chỗ:** 173
- **Lý do:** dùng ở nơi bất biến đã được bảo đảm ngay trước đó nhưng compiler không suy ra
  được (ví dụ `map.get(k)!` sau khi vừa `map.set(k, …)`).
- **Biện pháp bù:** `noUncheckedIndexedAccess` (1.44.0) đã loại bỏ nhóm lớn nhất từng cần
  `!`. **Chưa được enforce tự động** — đây là khoản nợ còn lại, xem §6.

### D-07 — Đệ quy

- **Nguyên tắc:** Rule 17.2 (cấm đệ quy) · **Số chỗ:** ~9 hàm
- **Lý do:** duyệt cây (cây block tài liệu, cây đơn vị tổ chức, cây công việc) là bài toán
  đệ quy tự nhiên; viết thành vòng lặp với stack thủ công khó đọc hơn và không an toàn hơn.
- **Biện pháp bù:** đường dữ liệu **không tin cậy** duy nhất — `server/src/services/
  shareBlocks.ts`, xử lý cây block từ ngoài vào — có chặn độ sâu cứng `MAX_DEPTH = 8`.
  Các hàm đệ quy còn lại chạy trên dữ liệu đã do máy chủ lọc.

## 3. Guideline Recategorization Plan

### R-01 — `noPropertyAccessFromIndexSignature`: **BÁC BỎ** (disapplied)

Cờ này phát sinh **2305 lỗi** (client 101, server 2204), **toàn bộ** là TS4111 — yêu cầu
viết `obj['x']` thay cho `obj.x`. Nguồn: `process.env.WORKFLOW_*` và truy cập cột CSDL qua
index signature (`id` 284 lượt, `customer_id` 63, `status` 58).

Đây là thay đổi **thuần cú pháp, không có giá trị an toàn nào**: nó không phát hiện thêm
một trường hợp `undefined` nào mà `noUncheckedIndexedAccess` chưa phát hiện. Bác bỏ chính
thức, không phải hoãn.

### R-02 — `no-unnecessary-type-assertion`: **chỉ dùng để đo**, không bật trong config

Rule này đã được dùng một lần để xóa 144 assertion dư thừa (1.44.0) và có giá trị thật.
Nhưng nó **báo sai 2 chỗ**, đã được chứng minh bằng thực nghiệm — bỏ assertion ra thì `tsc`
báo lỗi ngay:

| Chỗ | Assertion | Lỗi khi bỏ |
|---|---|---|
| `client/src/components/guide/GuideArticleBody.tsx:56` | `` `h${level}` as 'h2'\|'h3'\|'h4' `` | TS2322 — JSX cần literal type để phân giải thẻ intrinsic |
| `client/src/lib/guideBodies.ts:18` | `as Record<string, string>` | TS2322 — `import.meta.glob` trả `Record<string, unknown>` |

Vì vậy rule **không** được bật ở `eslint.config.js` (sẽ làm CI đỏ vĩnh viễn). Khi cần dọn
assertion dư, chạy nó qua một config dò tạm và **bỏ qua hai chỗ trên**.

⚠️ Khi chạy `--fix` với rule này, **phải** đặt `linterOptions.reportUnusedDisableDirectives:
'off'`. Nếu không, `--fix` sẽ xóa luôn các comment `eslint-disable-next-line` mà nó tưởng là
dư — đúng điều đã xảy ra một lần trong quá trình làm 1.44.0 và phải hoàn nguyên.

### R-03 — Chỉ số kích thước hàm: **advisory**, không chặn CI

`max-lines-per-function` (ngưỡng 60) báo 439 chỗ và `complexity` (ngưỡng 10) báo 371 chỗ.
Ngưỡng này lấy từ chỉ số HIS cho C; áp lên component React/TSX thì vô nghĩa — một component
80 dòng JSX không "phức tạp" theo nghĩa MISRA. Hai chỉ số này chỉ dùng để tìm *outlier*.

Outlier thật thì rất ít và đã được kiểm: `max-depth > 4` chỉ **3** chỗ, `max-params > 5`
chỉ **4** chỗ. Đó mới là tín hiệu đáng tin.

## 4. Compliance Summary

| Nguyên tắc ánh xạ | Gốc MISRA | Kết quả | Ghi chú |
|---|---|---|---|
| Không cảnh báo khi biên dịch | Dir 2.1 | ✅ Đạt | `tsc` ×3 exit 0, `eslint .` exit 0 (627 file) |
| Truy cập mảng trong biên | Rule 18.1 | ✅ Đạt | `noUncheckedIndexedAccess`, 570 lỗi đã xử lý |
| `switch` không rơi tầng | Rule 16.3 | ✅ Đạt | 0 vi phạm |
| `switch` có `default` | Rule 16.4 | ✅ Đạt | 12/12 `switch` có `default` (kiểm bằng AST) |
| Mọi nhánh trả giá trị | Rule 17.4 | ✅ Đạt | `noImplicitReturns` |
| Không có mã chết | Rule 2.x | ✅ Đạt | 0 biến/tham số/import không dùng |
| Cấm `eval`/`new Function`/`var`/`with` | Rule 1.1 | ✅ Đạt | 0 chỗ |
| Không chèn HTML thô | Dir 4.1 | ✅ Đạt | 0 chỗ dùng `dangerouslySetInnerHTML` |
| Không có `catch` rỗng | Dir 4.7 | ✅ Đạt | 0 chỗ |
| SQL tham số hóa | Dir 4.1 | ✅ Đạt | Xem §5 |
| Cấm `any` | Dir 1.1 | 🟡 Deviation D-02 | 13 chỗ, một biên thư viện, có lý do tại chỗ |
| So sánh chặt | Rule 10.x | 🟡 Deviation D-01 | 254 chỗ, 100% là `== null` |
| Giá trị trả về được dùng | Rule 17.7 | 🟡 Deviation D-04, D-05 | Đã bật rule; 2 miễn trừ có căn cứ |
| Ép kiểu tương thích | Rule 11.3 | 🟡 Deviation D-03, D-06 | 669 assertion, 173 non-null |
| Cấm đệ quy | Rule 17.2 | 🟡 Deviation D-07 | Đường không tin cậy có `MAX_DEPTH` |
| Truy cập theo tên thuộc tính | — | 🔴 Bác bỏ R-01 | Thuần cú pháp, không có giá trị an toàn |

**Tổng:** 10 Đạt · 5 Deviation có hồ sơ · 1 Bác bỏ có lý do · 0 vi phạm không có hồ sơ.

## 5. Cách chạy lại kiểm tra

```bash
# Biên dịch (ba project)
cd client && npx tsc --noEmit -p tsconfig.json
cd server && npx tsc --noEmit -p tsconfig.json
cd packages/contracts && npx tsc --noEmit -p tsconfig.json

# Lint toàn bộ 627 file
npx eslint .

# Test
cd server && node scripts/run-tests.mjs      # 596 test
cd client && npx vitest run                  # 233 test
```

⚠️ **`npx eslint .` giờ mất ~47 giây** (trước đây vài giây), vì `no-floating-promises` và
`no-misused-promises` cần dựng chương trình TypeScript đầy đủ. Nếu thêm pre-commit hook,
hãy cân nhắc chỉ chạy lint đầy đủ ở pre-push và CI.

**Về SQL:** 112 truy vấn dùng template literal có `${}`. Đã rà soát: tất cả đều an toàn —
giá trị luôn đi qua tham số `?`, còn phần nội suy chỉ là (a) chuỗi placeholder `?,?,?` sinh
từ độ dài mảng, (b) đoạn SQL hằng (`PUBLIC_SELECT`), (c) tên bảng/cột lấy từ **map hằng
đóng** (ví dụ `RELATION_TABLES` trong `quickNoteService.ts`), (d) số đã kẹp biên
(`Math.max(1, Math.min(limit, 100))` trong `contextBuilder.ts`). Khi thêm truy vấn mới, giữ
đúng bốn dạng này.

**6 file nằm ngoài mọi `tsconfig`** (`playwright.config.ts`, `client/vite.config.ts`,
`e2e/*.ts`, `scripts/guide-shots/*.ts`) được khai báo trong `projectService.allowDefaultProject`
ở `eslint.config.js`. Nếu thiếu khai báo này, `npx eslint .` sẽ báo lỗi parse và các rule
cần thông tin kiểu sẽ **im lặng bỏ qua** chúng.

## 6. Khoản nợ còn lại

Những việc đã đo nhưng **chưa** làm, kèm chi phí thực tế:

| Việc | Chi phí đo được | Vì sao hoãn |
|---|---|---|
| `exactOptionalPropertyTypes` | 264 lỗi | Buộc phân biệt `{a?: string}` với `{a: string \| undefined}`; va chạm nặng với props React và toán tử spread. Chi phí cao, lợi ích mỏng. |
| Enforce `no-non-null-assertion` | 173 chỗ | D-06 chưa có cổng chặn tự động. Nên làm sau khi khảo sát xem bao nhiêu chỗ còn thật sự cần. |
| Logger tập trung | 116 lệnh `console.*` | `server/src/lib/` chưa có `logger.ts`. Không thuộc nguyên tắc MISRA nào nhưng ảnh hưởng khả năng chẩn đoán production. |
| Tách file lớn | 13 file > 1200 dòng | Lớn nhất `server/src/routes/feed.ts`. Xem R-03: chỉ là advisory. |

## 7. Giới hạn của tài liệu này

Đây là đánh giá theo bộ nguyên tắc **ánh xạ** do chính dự án định nghĩa, không phải đánh giá
MISRA chính thức. Không có cơ quan nào chứng nhận nó, và việc ánh xạ rule C sang TypeScript
là lựa chọn kỹ thuật, không phải tiêu chuẩn. Nếu cần tuân thủ MISRA thật cho một thành phần
nào đó, thành phần đó phải được viết bằng C/C++ và kiểm bằng công cụ MISRA chuyên dụng
(Cppcheck + MISRA addon, PC-lint Plus, Polyspace).
