# AI Copilot — kiến trúc và vận hành

## Phạm vi đã triển khai

### Giai đoạn 1 — nền tảng và trải nghiệm theo ngữ cảnh

- Gemini, Anthropic Claude và DeepSeek qua adapter riêng; không phụ thuộc SDK của provider.
- API key cấu hình từ UI, mã hóa AES-256-GCM tại server.
- Đồng bộ model trực tiếp từ Models API và lưu capability chuẩn hóa.
- Ba profile model: nhanh, cân bằng, suy luận.
- AI Brief cho Dashboard, hồ sơ khách hàng và cơ hội.
- Chuyển ghi chú tương tác tự do thành summary, result, Next Action và ngày thực hiện.

### Giai đoạn 2 — hành động an toàn và kiểm soát vận hành

- Gateway fallback qua các provider đang sẵn sàng.
- Quota token/ngày, ngân sách/ngày, log độ trễ, lỗi và chi phí ước tính.
- Đơn giá input/output token do quản trị cấu hình vì giá provider thay đổi theo thời gian.
- AI chỉ tạo `ai_action_proposals`. Hành động tạo task/reminder/interaction hoặc cập nhật Next Action
  chỉ chạy sau request duyệt riêng của người dùng; payload được kiểm tra lại bằng Zod và chạy trong
  transaction.
- Feedback và request ID phục vụ đánh giá chất lượng prompt/model.

### Giai đoạn 3 — RAG, hỏi đáp và automation

- Tệp text/Markdown/CSV/JSON/XML/HTML tối đa 5 MB được chia đoạn và lập chỉ mục FTS5 local.
- Định dạng nhị phân chưa có bộ trích xuất nội dung được lập chỉ mục bằng metadata. Có thể thêm parser
  PDF/DOCX sau mà không đổi API truy xuất.
- Tài liệu có `confidentiality = confidential` không xuất hiện trong kết quả RAG gửi tới LLM.
- Trang *Trợ lý AI* hỏi kết hợp CRM và tài liệu, hiển thị nguồn và đề xuất action cần duyệt.
- Automation pipeline risk, Next Action quá hạn, hợp đồng sắp hết hạn và daily brief chạy định kỳ,
  chỉ tạo notification; không tự sửa dữ liệu CRM.

## Luồng bảo mật

```mermaid
flowchart LR
  UI["React UI"] -->|"/api/ai"| API["Express + Zod"]
  API --> GW["AI gateway\nquota + fallback + audit"]
  GW --> SECRET["AES-256-GCM secret store"]
  GW --> GEMINI["Gemini"]
  GW --> CLAUDE["Claude"]
  GW --> DEEPSEEK["DeepSeek"]
  API --> PROPOSAL["Action proposal\npending"]
  PROPOSAL -->|"User approve"| CRM[("SQLite CRM")]
```

- Base URL phải là HTTPS, ngoại trừ localhost dùng cho phát triển/test.
- Key không ghi log, không xuất JSON và client chỉ nhận bốn ký tự cuối.
- Nếu không có `WORKFLOW_AI_MASTER_KEY`, server tạo `.ai-master.key` với quyền file hạn chế trong
  `WORKFLOW_DATA_DIR`. Sao lưu/di chuyển key này cùng thư mục dữ liệu nếu muốn giữ cấu hình provider.
- Nội dung đưa vào prompt được chọn theo allowlist, giới hạn kích thước và bỏ tài liệu mật.
- Không hiển thị chain-of-thought của model; chỉ dùng nội dung trả lời cuối.

## Giới hạn có chủ đích

- Ứng dụng hiện là local-first một người dùng, chưa có RBAC. Không mở API ra Internet trước khi bổ
  sung đăng nhập, CSRF/rate limit và phân quyền admin cho cấu hình provider.
- Chi phí chỉ là ước tính khi đã cấu hình đơn giá trên mỗi triệu token.
- RAG hiện ưu tiên dữ liệu text. PDF/DOCX dùng metadata cho tới khi có parser được kiểm chứng và giới
  hạn tài nguyên.
