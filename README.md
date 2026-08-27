# WorkFlow — Quản lý công việc cá nhân + CRM khách hàng B2B

Ứng dụng web chạy local, một người dùng (không đăng nhập, không tính năng cộng tác).
Kết hợp bảng Kanban kiểu Trello với CRM bán hàng B2B, giao diện tiếng Việt.

Giao diện và thao tác mô phỏng Trello, **mặc định chế độ tối**: phông nền bảng đổi được, cột và thẻ theo tông Trello, menu popover cho mọi thiết lập.

## Tính năng

- **Bảng công việc (Kanban)** — bảng → danh sách → thẻ, kéo thả đầy đủ; thẻ có mô tả, ngày bắt đầu, hạn hoàn thành, mức ưu tiên, việc cần làm (checklist), nhãn, ảnh bìa màu.
- **Người phụ trách** — mỗi công việc giao được cho một người thuộc **bất kỳ tổ chức nào**: nhân sự công ty bạn, nhân sự khách hàng, đối tác hay nhà cung cấp. Đây là **trục riêng**, không nằm trong nhóm liên kết CRM: một việc *về* khách hàng A hoàn toàn có thể *do* nhân sự công ty bạn làm — nếu gộp hai trục lại, mọi task giao nội bộ sẽ bị chặn vì quy tắc "cùng một khách hàng". Lọc theo người trên bảng, trang Công việc và Tổng quan; nhóm theo người; chip màu theo loại tổ chức để nhìn thẻ là biết việc đang ở "bên mình" hay "bên khách".
- **Tổ chức & nhân sự** — sổ danh bạ dùng chung với CRM: `customers` chứa cả *công ty tôi*, *đối tác*, *nhà cung cấp* bên cạnh khách hàng, phân biệt bằng cột `org_kind`. Chỉ `customer` mới vào pipeline / doanh thu / báo cáo CRM. Đánh dấu **"Đây là tôi"** cho một người để có bộ lọc *Việc của tôi*; tắt **"Đang hoạt động"** khi ai đó nghỉ việc — họ biến mất khỏi ô giao việc mà lịch sử công việc vẫn còn.
- **Vòng đời công việc** — thay cho một ô đánh dấu xong/chưa: *Chưa bắt đầu · Đang làm · Chờ khách phản hồi · Bị chặn (kèm lý do) · Chờ duyệt · Hoàn thành*. Phân biệt được "đang chờ ai đó" với "chưa ai đụng đến" mới biết nên nhắc ai. Có **người duyệt** tách khỏi người làm, và **việc lặp lại** (ngày/tuần/tháng/quý) tự sinh bản kế tiếp khi đánh dấu hoàn thành — bản mới bắt đầu lại từ cột đầu quy trình.
- **Cột Kanban khai báo nghĩa vòng đời** — mỗi cột chọn được nó *nghĩa là* trạng thái nào (menu cột › *Cột này nghĩa là…*). Kéo thẻ vào cột có ánh xạ sẽ đặt trạng thái, và đổi trạng thái sẽ kéo thẻ về đúng cột — hai chiều, luôn khớp. Cột không ánh xạ ("Kho ý tưởng", "Theo khách"…) vẫn dùng bình thường để xếp thẻ mà không đụng vòng đời. Nhờ vậy giữ được tự do bố cục kiểu Trello trong khi vòng đời chỉ có **một nguồn sự thật**.
- **Cần nhắc** — màn hình gom việc quá hạn, sắp đến hạn trong 3 ngày, đang bị chặn hoặc chờ khách, **nhóm theo người phụ trách**, kèm "đã nhắc N lần · lần cuối X ngày trước". Ứng dụng **không tự gửi tin** (chạy local, không SMTP/Zalo API): nó soạn sẵn nội dung bằng AI với ba giọng văn, rồi bạn copy / mở `zalo.me` / mở `mailto:`, sau đó bấm ghi vào **nhật ký nhắc**.
- **Trung tâm thông báo** — biểu tượng chuông trên thanh trên gộp bốn nguồn (nhắc hẹn, sự kiện lịch, công việc đến hạn, cảnh báo CRM/hệ thống từ AI) thành một hộp thư, nhóm theo Quá hạn / Hôm nay / Sắp tới / Cập nhật, lọc theo loại, tách Chưa đọc / Đã đọc. Mỗi mục đánh dấu đọc, hoãn (30 phút hoặc 9h sáng hôm sau) hoặc bấm **Hoàn thành** ngay tại chỗ — tự cập nhật lại đúng nhắc hẹn / sự kiện / thẻ liên quan mà không cần mở màn hình gốc.
- **Đẩy thông báo & sao lưu qua Telegram** (tùy chọn) — *Cài đặt → Telegram*: dán Chat ID và Bot Token (mã hóa như API key AI), bật riêng từng loại tin (việc đến hạn, nhắc hẹn, đổi người phụ trách) để bot tự đẩy trong tối đa 5 phút, có nút gửi thử. Cùng chỗ đó bật **sao lưu định kỳ**: chọn chu kỳ 6h/12h/24h/3 ngày/1 tuần, hệ thống tự gửi nguyên file SQLite qua Telegram đúng hạn kể cả khi không ai mở máy, kèm nút gửi ngay và mốc lần gửi gần nhất/kế tiếp.
- **Dự án** — lớp gom bên trên bảng và công việc: chủ dự án, khách hàng, **ngày kế hoạch đặt cạnh ngày thực tế**, ngân sách, và **sức khỏe xanh/vàng/đỏ tính khi đọc** (đỏ khi quá hạn kế hoạch hoặc có việc bị chặn; vàng khi có việc quá hạn, hoặc đã tiêu quá 80% quỹ thời gian mà chưa xong 60% việc). Nhân sự dự án **suy ra từ người phụ trách các công việc**, không phải danh sách thành viên khai báo tay. Xóa dự án không xóa công việc bên trong.

  Quan hệ ba tầng rõ vai trò: **dự án** là đơn vị *cam kết* (ngày, ngân sách, chủ, sức khỏe), **bảng** là *không gian làm việc* theo quy trình và thuộc 0–1 dự án, **công việc** là đơn vị *hành động*. Một việc thuộc dự án của **bảng chứa nó** — không có ô "dự án" riêng trên thẻ, nên không thể có việc mang dự án A mà nằm trong bảng của dự án B. Muốn đổi dự án của một việc thì chuyển nó sang bảng khác. Dự án xem được bằng **Cây công việc · Lịch · Dòng thời gian (Gantt) · Bảng tính**, đúng bốn dạng như một bảng.
- **Giai đoạn dự án & phân loại quy mô (Model A/B)** — mỗi bảng con trong một Dự án gắn được một **mốc hạn** (đọc là "giai đoạn"); đúng hạn / sắp tới hạn / quá hạn tính khi đọc từ mốc đó cùng các thẻ đã xong bên trong, không có cột lưu riêng. Khi tạo dự án, hệ thống tự **gợi ý** đi theo mẫu Model A (dự án lớn, 9 bước P01–P09) hay Model B (dự án nhỏ, 5 bước) theo 4 ngưỡng cấu hình được ở *Cài đặt → Triển khai* (giá trị hợp đồng, số ngày, số giai đoạn, số người); chọn khác gợi ý bắt buộc **nhập lý do**, ghi vào nhật ký thay đổi.
- **Sổ rủi ro (Risk Register)** — một sổ dùng chung cho 4 loại mục: Rủi ro, Vấn đề, Yêu cầu thay đổi (Change Request), Quyết định — mỗi mục có mức nghiêm trọng, trạng thái Mở / Đang xử lý / Đã đóng, người phụ trách, hạn xử lý và kết luận khi đóng. Danh sách tự sắp theo độ khẩn và tô nổi mục quá hạn.
- **Bàn giao sau khi chốt & cảnh báo SLA** — *Cài đặt → Bàn giao* khai báo được **nhiều mẫu checklist khác nhau theo loại giải pháp** (không còn một mẫu chung cho mọi hợp đồng) cùng một hạn SLA tính bằng ngày. Cơ hội **Thành công** mà chưa bàn giao xong sau khi hết SLA tự sinh cảnh báo trên Tổng quan / Cần nhắc, mức độ tăng lên **nghiêm trọng** khi trễ gấp đôi SLA.
- **Trượt hạn & khối lượng** — hạn **lần đầu tiên** được chốt làm mốc và không bao giờ ghi đè; mỗi lần dời hạn ghi một dòng lịch sử kèm lý do, nên "việc này đã bị dời hạn 4 lần" trở thành con số đọc được. Kèm ước lượng / giờ đã dùng, mốc quan trọng, và **phụ thuộc finish-to-start** (chặn vòng lặp, vẽ đường nối trên Dòng thời gian, cảnh báo khi việc sau đã tới ngày bắt đầu mà việc trước chưa xong).
- **Thiết lập động kiểu Trello**:
  - *Bảng*: đổi phông nền (10 màu đơn + 6 chuyển sắc), đổi tên tại chỗ, gắn sao (bảng gắn sao hiện ở thanh bên), lưu trữ, xóa.
  - *Danh sách*: đổi tên tại chỗ, sao chép cả danh sách kèm thẻ, sắp xếp thẻ (ngày tạo / hạn / tên / ưu tiên), thu gọn thành cột dọc, xóa.
  - *Giao diện*: Sáng / Tối / Theo hệ thống — đổi ở nút mặt trăng trên thanh trên, ghi nhớ giữa các lần mở.
  - *Thẻ*: cửa sổ theo bố cục Trello mới — chip danh sách ở góc trái (bấm để chuyển danh sách), vòng tròn đánh dấu hoàn thành cạnh tiêu đề, hàng nút Thêm / Ngày / Ưu tiên / Khách hàng, và cột **Nhận xét và hoạt động** bên phải để ghi chú tiến độ. Menu `···` có Di chuyển, Sao chép, Lưu trữ, Xóa.
  - *Bộ lọc thẻ ngay trên bảng*: từ khóa (không dấu), trạng thái, hạn (quá hạn / hôm nay / 7 ngày tới / không có ngày), mức ưu tiên, nhãn, khách hàng — kèm số bộ lọc đang bật.
  - Nút bật/tắt hiện tên trên nhãn (thanh màu ↔ có chữ), giống Trello.
- **Khách hàng B2B (Account)** — hồ sơ công ty (tên viết tắt, MST, ngành, quy mô, nguồn, trạng thái Tiềm năng/Khách hàng/Ngừng hợp tác), cảnh báo trùng khi tạo mới.
- **Người liên hệ (Contact)** — chức vụ, phòng ban, Zalo, LinkedIn, vai trò trong quyết định mua, mức độ quan hệ.
- **Cơ hội bán hàng (Opportunity)** — pipeline 8 giai đoạn (Tiềm năng → Đang tiếp cận → Đang trao đổi → **PoC / Thử nghiệm** → Gửi báo giá → Đàm phán → Thành công / Thất bại), xác suất tự gợi ý theo giai đoạn, **Next Action + ngày thực hiện**, nhu cầu, đối thủ, nguồn, và **tuổi giai đoạn** (số ngày đã nằm ở giai đoạn hiện tại, tính từ lần chuyển gần nhất). Kéo sang Thất bại **bắt buộc chọn lý do**; chốt Thành công thì nhập giá trị thật và tạo hợp đồng ngay. Cờ **Tạm dừng** (kèm lý do, ngày hẹn xem lại) gắn thêm vào bất kỳ giai đoạn nào thay vì là một giai đoạn riêng, vì một cơ hội dừng lại vẫn đang nằm ở một chỗ cụ thể trong pipeline. Trang chi tiết cơ hội có thêm **thanh giai đoạn bấm chuyển trực tiếp** (không cần vào Kanban), dải nút nhanh nhảy tới tab điểm số / tài liệu / bàn giao, và khung nhật ký hoạt động cho ghi chú nhanh một dòng ngay cạnh mà không cần mở hồ sơ khách hàng.
- **Chấm điểm cơ hội (BANT + 4P)** — mỗi cơ hội có trang riêng với 8 yếu tố chấm 0–3 trên hai trục: **BANT** (đây có phải cơ hội thật không) và **4P** (ta có khả năng thắng không). Điểm ≥ 1 **bắt buộc có bằng chứng**, và bằng chứng lấy thẳng từ *Lịch sử tương tác* hoặc *Tài liệu* của chính cơ hội đó — chọn xong thì điểm được đánh dấu *đã xác thực*. Điểm cao nhất của mỗi yếu tố còn bị ràng buộc bởi dữ liệu có thật: không có sự kiện bắt buộc được khách xác nhận thì không chấm Thời gian 3 điểm được, chưa gặp người duyệt ngân sách thì Quyền hạn tối đa 2. Hai tổng điểm quyết định **ô ma trận** (Theo đuổi / Tái định hình / Nuôi dưỡng / Loại bỏ) và ba **quy tắc phủ quyết** loại deal khỏi forecast bất kể tổng điểm. Ghi xong một cuộc gọi, hệ thống hỏi luôn *"cuộc trao đổi này thay đổi yếu tố nào?"*. Kèm nhóm ra quyết định (vai trò, thái độ, champion, ai chưa được tiếp xúc), sự kiện bắt buộc kèm **lịch triển khai ngược**, và đối thủ (ai đang cung cấp, ai đã tham gia soạn tiêu chí thầu).
  - **Cổng giai đoạn**: mặc định phải đạt BANT ≥ 7 để sang *Gửi báo giá*, ≥ 9 và đã tiếp cận người duyệt ngân sách để sang *Đàm phán*. Bị chặn thì thẻ bật về cột cũ kèm danh sách yếu tố đang thiếu; ghi đè được nhưng **lý do là bắt buộc** và được lưu vào lịch sử. Kéo sang *Thất bại* không bao giờ bị chặn.
  - **Sức khỏe pipeline** — ma trận phân tán toàn bộ cơ hội trên hai trục, và hai con số forecast đặt cạnh nhau: theo giai đoạn (như cũ) và đã lọc theo phủ quyết + tuổi điểm. **Chênh lệch giữa chúng là mức thổi phồng pipeline.** Kèm *phiên rà soát* đi qua từng deal quá hạn để giữ / chấm lại / đóng.
  - Điểm chất lượng **không bao giờ ghi đè xác suất theo giai đoạn** — hai chỉ số được phép khác nhau, đó chính là phép đo.
- **Báo giá (Quotation)** — mã, phiên bản tự tăng, hiệu lực, 6 trạng thái, đính kèm tệp.
- **Hợp đồng (Contract) & Gia hạn** — giá trị, ngày ký/hiệu lực, trạng thái, đếm ngược ngày còn lại, danh sách sắp hết hạn theo mốc 30/60/90 ngày và nút tạo cơ hội gia hạn.
- **Doanh thu khách hàng hiện hữu (Revenue)** — bảng 12 tháng theo từng dòng *khách hàng × dịch vụ*: AM, loại hợp đồng (Mới / Mở rộng), thời hạn (Lâu dài / Ngắn hạn / Dùng thử), tình trạng sử dụng. Mỗi tháng là **một khoản tiền có trạng thái**, chuyển tiếp theo vòng đời **Dự kiến → Đã đối soát → Đã xuất hóa đơn → Đã thanh toán** (tiền không nhân đôi giữa các bước). Đối soát có thể sửa lại số tiền — ví dụ dự kiến 100k, đối soát thực tế 95k — hệ thống giữ số dự kiến ban đầu để báo chênh lệch. Gõ số ngay trên ô, bấm chấm màu trong ô để chuyển trạng thái, bấm tiêu đề tháng để chuyển trạng thái cả cột, hoặc mở bảng 12 tháng (dự kiến / thực tế / trạng thái / ghi chú). Có tổng theo dòng, theo tháng, cả năm, phễu lũy kế theo trạng thái, tỷ lệ thu tiền và biểu đồ cột chồng theo trạng thái.
- **Danh mục dịch vụ (Service)** — CRM tự quản lý danh sách dịch vụ (mã, nhóm, đơn giá tham khảo, ngừng cung cấp); hồ sơ khách hàng có tab *Dịch vụ sử dụng* để gán dịch vụ và xem doanh thu của riêng khách đó.
- **Tài liệu (Document)** — tải lên PDF/Word/Excel/PowerPoint/ảnh (tối đa 25 MB), gắn với khách hàng / cơ hội / hợp đồng / báo giá, tìm kiếm không dấu.
- **Ghi chú họp (Meeting Notes)** — soạn thảo dạng block (BlockNote) gắn với một Cơ hội, một Dự án, cả hai, hoặc **độc lập không gắn gì**. Ngoài văn bản còn chèn được **sơ đồ logic** (vẽ tay kiểu Excalidraw) và **sơ đồ tư duy** (Tab để thêm nhánh con, Enter để thêm nhánh ngang) ngay trong nội dung, gõ `@` để nhắc tên người liên hệ, và gõ `/` để chèn **tham chiếu một công việc** — tạo task mới hoặc gắn việc có sẵn thành một chip sống, luôn hiện đúng trạng thái / hạn / người phụ trách hiện tại. AI tóm tắt thành nội dung + danh sách việc cần làm (mỗi việc chờ duyệt trước khi tạo thật) và bốn thao tác viết inline (Viết tiếp, Sửa ngữ pháp, Viết lại, Rút gọn) trên đoạn đang chọn. Xem toàn bộ ghi chú của mọi Cơ hội/Dự án ở trang *Ghi chú*, hoặc đúng ghi chú của một hồ sơ ngay trong tab riêng ở trang chi tiết.
- **Ghi chú nhanh (Quick Notes)** — bảng ghi chú kiểu Google Keep/sổ tay dán giấy: ghim, lưu trữ, thùng rác, gắn nhãn, đặt **nhắc hẹn**, kéo-thả sắp xếp tay, chọn 1 trong 12 màu, đính kèm tệp, và gắn được vào Khách hàng / Người liên hệ / Cơ hội / Dự án hoặc để rời. Chuyển thành **Công việc** hoặc một **Ghi chú họp mới** khi cần mà vẫn giữ nguyên bản gốc.
- **Ghi âm nhanh & chuyển thành văn bản bằng AI** — nút ghi âm có trong cả Ghi chú họp lẫn Ghi chú nhanh: ghi trực tiếp từ micro, nghe lại, lưu như một tài liệu đính kèm bình thường, rồi chọn **chuyển nguyên văn** hoặc một **mẫu tóm tắt tự cấu hình** (*Cài đặt → Trợ lý AI*) để AI (hiện qua Gemini, đọc audio trực tiếp) trả về văn bản chèn ngay vào ghi chú.
- **Lịch sử tương tác** — 9 loại (Gọi, Email, Gặp mặt, Demo, Proposal, Follow-up, Ghi chú, Zalo, Khác), có kết quả và tạo luôn công việc tiếp theo.
- **Nhắc hẹn** gắn với thẻ / khách hàng / cơ hội.
- **Nhiều cách xem công việc**: Kanban · Lịch · Dòng thời gian · Báo cáo (biểu đồ). Trang *Công việc* có hai chế độ trong cùng một màn hình — **Dạng cây** (việc cha–con, thêm nhanh, nhóm theo) và **Dạng bảng** (sắp xếp theo cột kiểu bảng tính).
- **Đổi dạng xem ngay trong bảng**: ở mỗi bảng công việc, chip cạnh tên bảng và thanh dock dưới đáy chuyển giữa Bảng / Lịch / Dòng thời gian / Bảng tính mà **không rời khỏi bảng** — dữ liệu chỉ của bảng đó, dạng xem lưu trong URL nên F5 hay chia sẻ link vẫn giữ nguyên.
- **Việc cha – việc con** — mỗi công việc có thể chứa việc con (một cấp). Trang *Công việc* là bảng cây: bấm mũi tên để mở/thu việc con, bấm tên để sửa tại chỗ, đổi ưu tiên / ngày bắt đầu / hạn / khách hàng ngay trên dòng, thêm việc mới hoặc việc con trực tiếp, xóa có xác nhận. Bảng kanban ẩn việc con và hiện huy hiệu `x/y` trên thẻ cha; cửa sổ thẻ có mục *Việc con* riêng.
- **Tìm kiếm không dấu** (gõ "vinh phat" ra "Vĩnh Phát") — nhấn `Ctrl + K`.
- **Tổng quan (Dashboard)** — thêm ô *Việc theo người phụ trách* (sắp theo số việc quá hạn giảm dần, dòng "Chưa giao" luôn đứng đầu vì đó là rủi ro lớn nhất); 6 chỉ số đầu trang (cơ hội đang mở, tổng pipeline, **weighted pipeline** = Σ giá trị × xác suất, dự kiến chốt tháng này, việc quá hạn, HĐ sắp hết hạn); việc cần làm theo Quá hạn / Hôm nay / Ngày mai / 7 ngày tới; **cơ hội cần chú ý** (quá ngày chốt, chưa có Next Action, quá hạn Next Action, không tương tác > 14 ngày); và **chất lượng cơ hội** (đang bị chặn khỏi forecast, điểm quá hạn, rơi vào ô Tái định hình, sự kiện bắt buộc trong 14 ngày, giai đoạn cao mà BANT thấp).
- **Tạo công việc từ mọi module** — một biểu mẫu duy nhất, mở từ Topbar, chi tiết cơ hội, hồ sơ khách hàng, người liên hệ, hợp đồng, báo giá, tài liệu, cột Kanban và trang Công việc. Tạo từ Cơ hội thì Khách hàng và Người liên hệ tự điền theo chuỗi sở hữu (báo giá/hợp đồng → cơ hội → khách hàng → người liên hệ); liên kết chéo khách hàng bị chặn ngay.
- **AI Copilot đa nhà cung cấp** — cấu hình Gemini, Claude và DeepSeek trong *Cài đặt*; API tự đọc danh sách model/capability, chọn model nhanh–cân bằng–suy luận và fallback khi provider lỗi. Có AI Brief ở Dashboard/khách hàng/cơ hội, chuẩn hóa ghi chú tương tác, hỏi đáp CRM + tài liệu, hành động luôn cần duyệt, quota/token/chi phí, RAG tài liệu và automation cảnh báo chủ động.
- **Soạn công việc nhanh bằng AI** — ở trang *Trợ lý AI*: dán nguyên một đoạn nội dung lộn xộn (tin nhắn, email, nội dung ghi âm đã chuyển chữ…), AI viết lại thành một task đầy đủ (tiêu đề, mô tả, mức ưu tiên, ngày bắt đầu/hạn, checklist, liên kết CRM kèm độ tin cậy) rồi mở sẵn biểu mẫu tạo việc để bạn duyệt/sửa và tự tay lưu — AI không bao giờ lưu thẳng. Khác với mục **AI hỗ trợ nhập liệu** ngay dưới đây ở chỗ đây là một **điểm vào riêng** từ một đoạn nháp thô, không cần đã có sẵn task nào đang mở.
- **AI hỗ trợ nhập liệu** — gõ nội dung công việc rồi bấm *Gợi ý bằng AI* để điền nốt hạn, ưu tiên, việc cần làm và liên kết CRM; tải tài liệu lên rồi bấm *Đọc bằng AI* để rút metadata từ nội dung PDF/DOCX/XLSX. Cả hai chỉ điền vào ô đang trống và luôn chờ người dùng duyệt trước khi lưu.
- **Báo cáo theo người** — bảng thông lượng và khối lượng theo người phụ trách (hoàn thành trong kỳ, đang mở, quá hạn, việc đến hạn tuần này kèm số giờ ước lượng — hiện dấu `≥` khi chưa phải việc nào cũng có ước lượng, vì một tổng cộng dồn từ dữ liệu thiếu là một tổng sai), và biểu đồ **phân bố số lần dời hạn**.
- **Sao lưu** một chạm, xuất dữ liệu JSON và **xuất CSV** (khách hàng, người liên hệ, cơ hội kèm cột điểm BANT/4P/ô/veto, chi tiết chấm điểm từng yếu tố kèm bằng chứng, hợp đồng, công việc kèm người phụ trách / dự án / hạn ban đầu / số lần dời hạn / giờ ước lượng, doanh thu theo tháng) mở được bằng Excel.

## Yêu cầu

- Node.js 22 trở lên (đã kiểm thử trên Node 24)
- Windows / macOS / Linux

## Cài đặt và chạy

```bash
npm install
npm run dev
```

Mở http://localhost:5173 — API chạy ở cổng 3001, Vite tự chuyển tiếp `/api`.

> Nếu npm chặn install script của `better-sqlite3` (npm 12 trở lên), chạy:
> `npm install-scripts approve better-sqlite3 esbuild && npm install`

> Trên Windows, `Start-WorkFlow.ps1` là launcher: tự chạy `npm run dev` nếu API/client chưa bật, đợi
> tới khi sẵn sàng rồi mở trình duyệt — tạo shortcut trỏ vào file này để khởi động bằng một cú nhấp.

### Nạp dữ liệu mẫu (tùy chọn)

```bash
npm run seed
```

Chỉ chạy khi cơ sở dữ liệu còn trống. Tạo 3 khách hàng, 6 cơ hội, 3 bảng và 15 thẻ mẫu.

## Kiểm tra chất lượng

```bash
npm run format:check # định dạng
npm run lint         # quy tắc code
npm run typecheck    # TypeScript cho contract, API và UI
npm test             # unit/integration/migration tests
npm run build        # production build + ngân sách bundle
npm run test:e2e     # Chromium desktop và mobile
npm run check        # toàn bộ quality gate ở trên
```

Lần đầu chạy E2E cần cài Chromium bằng `npx playwright install chromium`. Bộ test dùng một thư mục
riêng trong thư mục tạm của hệ điều hành, tự làm sạch trước mỗi lần chạy và không chạm vào dữ liệu
phát triển.

Client kiểm tra ngân sách JavaScript ban đầu sau mỗi production build. Ngưỡng hiện tại là 260 KiB
gzip; các trang nặng, lịch, biểu đồ, kéo thả và cửa sổ thẻ được tải theo nhu cầu.

## Build và chạy production

```bash
npm run build
npm start
```

Lệnh `npm start` chạy API đã biên dịch ở cổng 3001. Phục vụ thư mục `client/dist` bằng web server
tĩnh và chuyển tiếp `/api` tới API. Có thể xem thử artifact client tại local bằng:

```bash
npm run preview -w client -- --host 127.0.0.1
```

Server hỗ trợ các biến môi trường sau:

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `PORT` | `3001` | Cổng HTTP của API |
| `WORKFLOW_DATA_DIR` | `server/data` | Thư mục chứa DB mặc định, file tải lên và backup |
| `WORKFLOW_DB_PATH` | `<WORKFLOW_DATA_DIR>/app.db` | Đường dẫn SQLite cụ thể; dùng `:memory:` cho test |
| `WORKFLOW_AI_MASTER_KEY` | Khóa cài đặt trong `<WORKFLOW_DATA_DIR>/.ai-master.key` | Khóa AES-256 mã hóa API key AI; production nên cấp secret 32 byte dạng base64/hex |

Khi dừng bằng `SIGINT`/`SIGTERM`, API ngừng nhận kết nối mới, đóng HTTP server rồi đóng SQLite.
Migration chạy tự động và theo thứ tự khi mở DB.

### Cấu hình AI Copilot

Mở **Cài đặt → Trợ lý AI đa nhà cung cấp**, nhập API key cho Gemini, Claude hoặc DeepSeek rồi bấm
**Lưu & nhận diện model**. Browser không gọi trực tiếp provider và API key không được trả về client.
Khi triển khai production, nên cấp `WORKFLOW_AI_MASTER_KEY` bằng secret manager; nếu không, ứng dụng
tạo khóa riêng cho lần cài đặt trong thư mục dữ liệu. Xem thiết kế và giới hạn tại
[docs/AI-COPILOT.md](docs/AI-COPILOT.md).

## Dữ liệu và sao lưu

- Toàn bộ dữ liệu nằm trong một file SQLite: `server/data/app.db`.
- Nút **Sao lưu ngay** trong mục *Cài đặt* tạo bản sao an toàn (dùng `db.backup()`, đúng cả khi bật WAL) vào `server/data/backups/`.
- Nút **Xuất dữ liệu JSON** tải toàn bộ bảng về dạng JSON.
- Muốn chuyển sang máy khác: copy cả thư mục `server/data/`.
- Nếu cấu hình `WORKFLOW_DATA_DIR`, hãy sao lưu toàn bộ thư mục đã cấu hình. Không chỉ copy file
  `app.db`, vì tài liệu tải lên nằm trong `files/` và các bản backup nằm trong `backups/`.

## Cấu trúc

```
├── packages/contracts/ Contract và schema dùng chung cho API/UI
├── server/             Express + better-sqlite3 (cổng 3001)
│   └── src/
│       ├── db/        schema.sql, migrate, seed
│       ├── lib/       vị trí kéo thả, tìm kiếm bỏ dấu, kiểm tra dữ liệu
│       ├── services/  transaction và quy tắc nghiệp vụ nhiều bước
│       └── routes/    parse HTTP, gọi service, trả response
├── client/             React 19 + Vite + Tailwind 4 (cổng 5173)
    └── src/
        ├── components/  kanban, crm, timeline, dùng chung
        ├── pages/       22 trang
        └── i18n/vi.ts   toàn bộ chuỗi giao diện
└── e2e/                Luồng Playwright desktop/mobile trên production build
```

Xem thêm [tài liệu kiến trúc](docs/ARCHITECTURE.md).
