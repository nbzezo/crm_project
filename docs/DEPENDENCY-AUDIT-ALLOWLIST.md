# Nợ kỹ thuật: dependency audit allowlist

Ngày rà soát: 2026-10-31. Hết hạn: **2026-11-30**.

Allowlist này chỉ áp dụng cho 13 cảnh báo còn lại sau `npm audit fix` không breaking. Không dùng
`npm audit fix --force`; phải rà soát lại trước ngày hết hạn hoặc ngay khi upstream có bản vá tương
thích.

| Dependency gốc | Cảnh báo được chấp nhận tạm thời | Lý do và giới hạn |
| --- | --- | --- |
| `@excalidraw/excalidraw@0.18.1` | `@chevrotain/cst-dts-gen`, `@chevrotain/gast`, `@excalidraw/excalidraw`, `@excalidraw/mermaid-to-excalidraw`, `@mermaid-js/parser`, `chevrotain`, `katex`, `langium`, `lodash-es`, `mermaid`, `nanoid` | Ứng dụng chỉ import component vẽ Excalidraw; không gọi Mermaid converter hoặc các API lodash/nanoid bị nêu. npm chỉ đề xuất hạ xuống `0.17.6`, có nguy cơ hồi quy giao diện và dữ liệu sơ đồ. |
| `exceljs@4.4.0` | `exceljs`, `uuid` | Ứng dụng chỉ dùng `ExcelJS.Workbook`; không gọi UUID v3/v5/v6 với buffer do bên ngoài cung cấp. npm chỉ đề xuất hạ xuống `3.4.0`, có nguy cơ hồi quy import/export Excel. |

Điều kiện gỡ allowlist: upstream phát hành bản tương thích không còn advisory, hoặc test hồi quy xác
nhận được một bản thay thế/hạ phiên bản an toàn. Nếu code bắt đầu dùng Mermaid conversion hay UUID
trực tiếp, allowlist tương ứng mất hiệu lực ngay.
