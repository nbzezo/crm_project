Trang Tổng quan trả lời một câu hỏi: **hôm nay có gì cần tôi để ý**. Nó không phải báo cáo — mọi ô
trên trang đều bấm được để đi tới đúng danh sách đằng sau con số.

![Trang Tổng quan với dải chỉ số và các ô Cần bạn xử lý, Nhắc hẹn](/guide/img/tong-quan.jpg)

## Ba tab của trang

| Tab | Nhìn vào |
|---|---|
| **Toàn cảnh** | Hôm nay: việc cần xử lý, nhắc hẹn, pipeline |
| **Trọng tâm** | Một kỳ bạn chọn (tuần, tháng, quý) đã làm được gì |
| **Báo cáo tổng** | Số liệu gộp của cả hệ thống |

Góc trên bên phải có ngày hiện tại, nút **AI Brief** (nhờ AI tóm tắt tình hình) và nút làm mới.

## Dải chỉ số

| Ô | Nghĩa là |
|---|---|
| **Việc hôm nay** | Số việc đến hạn hôm nay, kèm số đã xong |
| **Quá hạn** | Việc đã qua hạn, kèm "cũ nhất N ngày" |
| **Nhắc người khác** | Số việc đang nằm ở người khác cần bạn nhắc |
| **Pipeline** | Tổng giá trị cơ hội đang mở, kèm **giá trị có trọng số** |

> **Lưu ý** Tổng pipeline và pipeline **có trọng số** (cộng giá trị × xác suất) được phép chênh nhau
> nhiều. Khoảng chênh đó chính là phép đo: nó cho biết phần lớn giá trị đang ở giai đoạn sớm hay
> giai đoạn muộn.

Số liệu ghi rõ **thời điểm tính**; bấm nút làm mới để tính lại ngay.

## Cần bạn xử lý

Ô này có hai tầng:

1. **Nên ưu tiên** — ba việc hệ thống xếp lên đầu, đánh số 1-2-3.
2. Dải lọc **Quá hạn · Hôm nay · Ngày mai · 7 ngày tới**, mỗi nút kèm số lượng.

Danh sách chỉ gồm việc trong phạm vi bạn thấy được, nên hai người sẽ thấy hai danh sách khác nhau.

## Nhắc hẹn

Chia **Đã lỡ** và **Sắp tới**, mỗi dòng ghi thời điểm và hồ sơ liên quan (khách hàng hoặc cơ hội).
Mục đã lỡ hiện bằng màu cảnh báo.

## Việc theo người phụ trách

Sắp theo **số việc quá hạn giảm dần**, và dòng **Chưa giao** luôn nằm trong danh sách — việc không
có ai phụ trách là rủi ro lớn nhất, nên nó không được phép trôi mất.

## Cơ hội theo giai đoạn

Dải cột ngang cho từng giai đoạn của pipeline, kèm **tổng giá trị** và **số cơ hội**. Bấm
**Mở pipeline** để sang [Cơ hội bán hàng](/huong-dan?bai=co-hoi).

## Cơ hội cần chú ý và chất lượng cơ hội

Kéo xuống dưới còn hai ô nữa, gom các dấu hiệu một cơ hội đang có vấn đề:

- Quá ngày chốt dự kiến, **chưa có Next Action**, quá hạn Next Action, không tương tác hơn 14 ngày
- Đang **bị chặn khỏi forecast**, điểm đánh giá đã quá hạn, rơi vào ô **Tái định hình**, có sự kiện
  bắt buộc trong 14 ngày, hoặc **giai đoạn cao mà điểm BANT thấp**

Ý nghĩa từng dấu hiệu ở [Đánh giá cơ hội](/huong-dan?bai=danh-gia-co-hoi).

## Vì sao con số ở đây khác trang Báo cáo

Tổng quan tính **tại thời điểm bạn mở trang**, trong phạm vi dữ liệu của bạn. Trang
[Báo cáo](/huong-dan?bai=bao-cao) tính theo **một kỳ bạn chọn**. Hai cách tính khác nhau nên hai con
số được phép khác nhau; đừng dùng con số này để đối chiếu con số kia.
