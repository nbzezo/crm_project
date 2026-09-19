# Bảng thuật ngữ

Bản rà soát UI/UX 18.09.2026 ghi nhận màn hình trộn tiếng Anh và tiếng Việt không theo
quy tắc nào, và tệ hơn: **cùng một khái niệm có hai tên**, dùng lẫn lộn trong cùng một
trang. Tài liệu này là nguồn quyết định duy nhất cho câu hỏi "gọi cái này là gì".

## Quy tắc

1. **Giữ nguyên tiếng Anh** với thuật ngữ ngành đã đi vào tên trường dữ liệu hoặc đã là
   tên riêng của một phương pháp. Dịch nửa vời sẽ làm UI lệch khỏi dữ liệu và báo cáo.
2. **Việt hoá tất cả phần còn lại.**
3. Thuật ngữ giữ tiếng Anh phải được **giải thích một lần** bằng tooltip ở nơi người dùng
   gặp đầu tiên — không bắt họ tự đoán.
4. Một khái niệm chỉ có **một** tên. Không có ngoại lệ "chỗ này gọi thế cho gọn".

## Giữ nguyên tiếng Anh

| Thuật ngữ | Vì sao giữ |
|---|---|
| **Next Action** | Đã đi vào tên trường: `next_action`, `next_action_date`, `overdue_next_action_count`, `deals_without_next_action_count`. Việt hoá ở UI mà giữ tiếng Anh ở DB/báo cáo tạo đúng kiểu lệch mà bản rà soát phàn nàn. |
| **pipeline** | Tên chuẩn của khái niệm; "đường ống bán hàng" không ai dùng. |
| **forecast** | Đi kèm cả một bộ điều kiện veto có tên riêng (V1/V2/V3). |
| **BANT**, **4P** | Tên viết tắt của phương pháp chấm điểm, không dịch được. |
| **PoC** | Proof of Concept — thuật ngữ hợp đồng/kỹ thuật đã quen. |
| **veto** | Thuật ngữ của chính mô hình forecast trong sản phẩm này. |

## Đã Việt hoá

| Tiếng Anh | Dùng trong sản phẩm |
|---|---|
| stage | Giai đoạn |
| probability | Xác suất |
| weighted | Trọng số |
| opportunity / deal | Cơ hội |
| account / customer | Khách hàng |
| contract | Hợp đồng |
| quotation | Báo giá |
| task | Công việc |
| document | Tài liệu |

## Đã sửa

| Trước | Sau | Lý do |
|---|---|---|
| "Hành động tiếp theo" *và* "Next Action" | **Next Action** | Hai tên cho cùng một thứ, có chỗ đứng cạnh nhau trong một dòng (`InteractionTimeline`: nhãn "Hành động tiếp theo", hint "Sẽ cập nhật Next Action của cơ hội"). |
| "Chế độ model" | **Mức độ chi tiết** | Thuật ngữ kỹ thuật lọt ra giao diện người dùng. Ba mức giữ nguyên nghĩa: Nhanh / Cân bằng / Suy luận. |

## Khi thêm thuật ngữ mới

Đặt chuỗi vào `client/src/i18n/vi.ts` chứ không viết thẳng vào JSX, rồi bổ sung một dòng
vào bảng trên. Nếu một khái niệm cần tên mới, sửa ở `vi.ts` là mọi nơi đổi theo — đó là lý
do tồn tại của tệp đó.
