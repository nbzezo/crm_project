Xác suất theo giai đoạn chỉ nói cơ hội đang ở **đâu**. Đánh giá trả lời câu hỏi khác: cơ hội này có
**thật** không, và ta có **lợi thế** không. Hai con số đó được phép khác nhau — chính chỗ khác nhau
là thứ đáng xem.

![Tab Đánh giá của một cơ hội ở chế độ Cơ bản](/guide/img/danh-gia-tab.jpg)

## Hai chế độ

Nút **Cơ bản / Nâng cao** ở góc trên bên phải trang chi tiết cơ hội.

| Chế độ | Dùng khi |
|---|---|
| **Cơ bản** | Đánh giá nhanh **10 câu hỏi**, trả lời Có / Chưa rõ / Không |
| **Nâng cao** | Chấm điểm đầy đủ **BANT + 4P**, mỗi yếu tố 0–3 điểm, có bằng chứng |

Chế độ Cơ bản là cách vào cửa: đi hết 10 câu mất vài phút, và đã đủ để biết cơ hội có đáng theo
không. Chuyển sang Nâng cao khi cơ hội lớn, hoặc khi cần đưa vào forecast.

## Chế độ Cơ bản

Màn hình đi từng câu một (`Câu 1/10`), mỗi câu có tiêu đề nhóm (ví dụ *Nhu cầu của khách*), câu hỏi,
một dòng giải thích, và ba lựa chọn **Có · Chưa rõ · Không**. Mỗi câu thêm được ghi chú, hoặc
**Bỏ qua** để quay lại sau.

Thẻ tóm tắt ở trên luôn hiện tình trạng dạng `0 Có · 10 Chưa rõ · 0 Không`.

## Chế độ Nâng cao: BANT và 4P

8 yếu tố, chấm 0–3, trên **hai trục**:

| Trục | Trả lời câu hỏi |
|---|---|
| **BANT** | Đây có phải cơ hội thật không (ngân sách, quyền hạn, nhu cầu, thời gian) |
| **4P** | Ta có lợi thế không |

### Bằng chứng là bắt buộc

Điểm **từ 1 trở lên bắt buộc có bằng chứng**, và bằng chứng lấy thẳng từ *Lịch sử tương tác* hoặc
*Tài liệu* của chính cơ hội đó. Chọn xong thì điểm được đánh dấu **đã xác thực**.

Ngoài ra điểm tối đa còn bị ràng buộc bởi dữ liệu có thật:

- Chưa có sự kiện bắt buộc được khách xác nhận → không chấm Thời gian 3 điểm được.
- Chưa gặp người duyệt ngân sách → Quyền hạn tối đa 2.

> **Lưu ý** Đây là chỗ nhiều người thấy vướng nhất, và nó cố ý vướng. Một điểm số ai cũng tự cho
> được thì không đo được gì cả.

### Ô ma trận

Hai tổng điểm quyết định cơ hội rơi vào ô nào:

**Theo đuổi · Tái định hình · Nuôi dưỡng · Loại bỏ**

### Quy tắc phủ quyết

Ba quy tắc loại một cơ hội khỏi forecast **bất kể tổng điểm**. Cơ hội bị phủ quyết hiện dải cảnh báo
đỏ ngay trên thẻ ở pipeline.

## Cổng giai đoạn

Mặc định:

| Chuyển sang | Yêu cầu |
|---|---|
| **Gửi báo giá** | BANT ≥ 7 |
| **Đàm phán** | BANT ≥ 9 **và** đã tiếp cận người duyệt ngân sách |

Bị chặn thì thẻ bật về cột cũ kèm danh sách yếu tố đang thiếu. **Ghi đè được**, nhưng lý do là bắt
buộc và được lưu vào lịch sử.

Kéo sang **Thất bại** không bao giờ bị chặn.

## Những phần đi kèm

- **Người liên quan** — vai trò trong quyết định, thái độ, ai là champion, ai chưa được tiếp xúc.
- **Sự kiện bắt buộc** — một mốc khách đã xác nhận, kèm **lịch triển khai ngược** tính lùi từ mốc đó.
- **Đối thủ** — ai đang cung cấp, ai đã tham gia soạn tiêu chí thầu.

Sau khi ghi một cuộc gọi, hệ thống hỏi luôn *"cuộc trao đổi này thay đổi yếu tố nào?"* để điểm không
bị cũ đi.

> **Cảnh báo** Điểm chất lượng **không bao giờ ghi đè xác suất theo giai đoạn**. Nếu bạn thấy một cơ
> hội ở giai đoạn cao mà điểm BANT thấp, đó không phải lỗi hiển thị — đó là cảnh báo.

## Liên quan

- [Sức khỏe pipeline](/huong-dan?bai=suc-khoe-pipeline) — đọc hai con số forecast
- [Lịch sử tương tác](/huong-dan?bai=lich-su-tuong-tac) — nguồn bằng chứng
