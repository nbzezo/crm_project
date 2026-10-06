import clientPackage from '../../package.json';

export interface ReleaseNote {
  version: string;
  date: string;
  title: string;
  changes: readonly string[];
}

/**
 * Thông tin phát hành hiển thị trong Cài đặt > Giới thiệu.
 *
 * Số phiên bản hiện tại lấy từ package.json để bản build và màn hình luôn cùng
 * một nguồn. Khi phát hành, cập nhật ngày và thêm ghi chú mới ở đầu danh sách.
 */
export const APP_VERSION = clientPackage.version;
export const APP_UPDATED_AT = '2026-10-06';

export const RELEASE_NOTES: readonly ReleaseNote[] = [
  {
    version: '1.28.2',
    date: '2026-10-06',
    title: 'Tệp tải lên và ghi chú nhanh theo đúng phạm vi xem',
    changes: [
      'Kho tệp nay theo phạm vi dữ liệu: bạn thấy tệp do mình tải lên, và tệp gắn với khách hàng, người liên hệ, cơ hội, hợp đồng, báo giá, công việc, ghi chú hay trang tài liệu mà bạn được xem. Trước đây ai mở được màn hình Tài liệu cũng tải được mọi tệp.',
      'Tải xuống, tải ZIP, sửa thông tin, xoá, khôi phục và chia sẻ link một tệp đều kiểm tra phạm vi này. Trợ lý AI chỉ đọc nội dung những tệp bạn được xem.',
      'Tệp tải lên từ bản này ghi lại người tải lên. Tệp cũ không gắn với bản ghi nào vẫn hiện như trước.',
      'Ghi chú nhanh: mở, sửa, ghim, lưu trữ, xoá một ghi chú của người khác bằng đường dẫn trực tiếp nay bị chặn (trước đây chỉ danh sách là được lọc). Danh sách thẻ gợi ý cũng chỉ lấy từ ghi chú của bạn.',
    ],
  },
  {
    version: '1.28.1',
    date: '2026-10-06',
    title: 'Trang tài liệu theo đúng phạm vi xem; xoá vĩnh viễn từ Thùng rác',
    changes: [
      'Trang tài liệu nay theo phạm vi dữ liệu như Cơ hội, Khách hàng: bạn chỉ thấy trang của mình, và trang gắn với Cơ hội / Dự án / Khách hàng mà bạn được xem. Trước đây ai mở được màn hình Tài liệu cũng đọc được mọi trang.',
      'Biên bản họp gắn với một cơ hội vẫn hiện cho mọi người cùng làm cơ hội đó, kể cả khi đồng nghiệp viết; trang riêng (không gắn gì) chỉ người viết thấy. Sửa hoặc xoá trang gắn với một bản ghi cần quyền sửa bản ghi đó.',
      'Tóm tắt AI, viết bằng AI và chia sẻ link một trang cũng kiểm tra phạm vi này trước khi chạy.',
      'Thùng rác của tab Trang tài liệu có thêm nút Xoá vĩnh viễn: xoá hẳn trang cùng tệp đính kèm (ví dụ ghi âm) khỏi máy chủ, sau khi xác nhận.',
    ],
  },
  {
    version: '1.28.0',
    date: '2026-10-06',
    title: 'Trang Tài liệu: tìm và lọc ở một chỗ',
    changes: [
      'Hai tab Trang tài liệu và Tệp tải lên dùng chung một thanh công cụ: ô tìm, bộ lọc, Đang dùng / Thùng rác. Từ khoá được giữ khi đổi tab, và mỗi tab báo số kết quả ở tab kia (ví dụ "Có 3 tệp tải lên khớp…") để bấm sang ngay.',
      'Tab Trang tài liệu: tìm theo tiêu đề và nội dung (gõ không dấu vẫn ra), lọc theo mẫu, theo nơi gắn (Cơ hội, Dự án, Trang riêng) và khách hàng, kèm số lượng; sắp xếp theo ngày sửa hoặc ngày họp; danh sách nhóm theo Hôm nay / 7 ngày qua / Cũ hơn và tải dần khi cuộn.',
      'Trang tài liệu đã xoá nằm trong Thùng rác và khôi phục được; xoá trong trình soạn có nút Hoàn tác.',
      'Mở một trang tài liệu nay ghi lên địa chỉ: nút Back của trình duyệt quay về danh sách, F5 hay gửi link vẫn mở đúng trang.',
      'Tab Tệp tải lên: bảng gọn còn 6 cột nên laptop không phải cuộn ngang, có nhãn loại tệp (PDF, DOCX…); sửa thông tin, tạo công việc, xoá gom vào menu "⋯". Trên điện thoại, mỗi thẻ có nút tải xuống, chia sẻ và menu.',
      'Nút Tạo trang / Tải tệp lên luôn ở cuối hàng tab; số trang và số tệp hiện ngay trên tab.',
    ],
  },
  {
    version: '1.27.0',
    date: '2026-10-06',
    title: 'Hồ sơ cấu hình: mang cấu hình giữa các bản cài',
    changes: [
      'Cài đặt → Hồ sơ cấu hình (mới): tải toàn bộ cấu hình nghiệp vụ (danh mục, quy trình bán hàng, chấm điểm, bàn giao, triển khai, vị trí và quyền) về một tệp JSON, không kèm dữ liệu khách hàng nào.',
      'Nhập hồ sơ ở bản cài khác: chọn tệp là hệ thống chạy thử ngay và liệt kê những gì sẽ thêm, cập nhật, cần lưu ý; bấm Áp dụng mới ghi. Hồ sơ không xoá gì: mục không có trong hồ sơ mà chưa có dữ liệu thì được ẩn, đang có dữ liệu thì giữ nguyên.',
      'Kèm hai hồ sơ mẫu "Phần mềm B2B" và "Phân phối thiết bị" để dựng nhanh bản cài cho khách mới; quản trị máy chủ có thể áp hồ sơ bằng lệnh config:apply.',
    ],
  },
  {
    version: '1.26.0',
    date: '2026-10-06',
    title: 'Tự cấu hình quy trình bán hàng',
    changes: [
      'Cài đặt → Quy trình bán hàng (mới): thêm giai đoạn (chọn vị trí chèn), đổi tên, đổi màu, sắp xếp lại các giai đoạn của pipeline. Kanban, thanh giai đoạn ở trang cơ hội, Tổng quan và Báo cáo tự theo cấu hình mới.',
      'Mỗi giai đoạn tự đặt xác suất gợi ý, cổng điểm BANT tối thiểu, có bắt buộc đã gặp người duyệt ngân sách hay không, có theo dõi PoC hay không, và số ngày tối đa được nằm ở giai đoạn đó (vượt quá thì thẻ cơ hội báo cảnh báo).',
      'Ẩn một giai đoạn còn cơ hội thì phải chọn giai đoạn nhận các cơ hội đó; mỗi lần chuyển được ghi vào nhật ký thay đổi của cơ hội. Giai đoạn đã từng dùng chỉ ẩn được, dùng lại được bất cứ lúc nào; giai đoạn chưa từng dùng thì xoá hẳn được.',
      'Thành công và Thất bại là giai đoạn hệ thống: luôn đứng cuối, đổi tên và màu được, không ẩn hay xoá được, xác suất cố định 100% / 0%. Chuyển sang Thất bại vẫn không bao giờ bị cổng điểm chặn.',
      'Cổng giai đoạn chuyển từ Cài đặt → Chấm điểm cơ hội sang Cài đặt → Quy trình bán hàng, đặt ngay trên từng giai đoạn.',
    ],
  },
  {
    version: '1.25.1',
    date: '2026-10-06',
    title: 'Chuẩn bị cho quy trình bán hàng tự cấu hình',
    changes: [
      'Giai đoạn cơ hội (Tiềm năng → Thành công/Thất bại) nay được lưu như dữ liệu cấu hình thay vì viết cứng trong chương trình, cùng tên, màu, xác suất và cổng điểm như cũ. Đây là bước chuẩn bị để bản sau cho phép tự thêm, đổi tên, sắp xếp giai đoạn.',
      'Không có gì thay đổi về cách dùng: số liệu Tổng quan, Báo cáo, Sức khỏe pipeline, Khách hàng đã được đối chiếu và giữ nguyên.',
      'Các danh sách "cần chú ý" trên Tổng quan (quá ngày chốt, giá trị lớn, sự kiện sắp tới…) nay có thứ tự cố định khi hai cơ hội bằng nhau, không còn đổi chỗ giữa các lần mở.',
      'Bản xuất CSV cơ hội hiện tên giai đoạn thay vì mã.',
    ],
  },
  {
    version: '1.25.0',
    date: '2026-10-06',
    title: 'Ngành nghề, quy mô, nguồn thành danh mục chọn',
    changes: [
      'Ngành nghề, Quy mô, Nguồn của khách hàng và Nguồn của cơ hội nay là ô chọn từ danh mục, sửa được ở Cài đặt → Danh mục, thay cho ô gõ tự do dễ sai chính tả.',
      'Khi cập nhật, các cách viết khác nhau của cùng một giá trị (khác dấu, khác hoa thường, thừa khoảng trắng như "CNTT", "cntt ") được gom về một tên, nên báo cáo và bộ lọc theo ngành không còn bị tách nhóm. Các giá trị chỉ gần giống nhau thì quản trị viên tự Gộp.',
      'Đổi tên một ngành/nguồn trong danh mục sẽ đổi luôn trên mọi khách hàng, cơ hội đang dùng, và tìm kiếm khách hàng theo tên ngành mới vẫn ra.',
      'Tra cứu công ty bằng AI điền ngành khớp với danh mục (không phân biệt dấu); khách hàng tạo từ tệp hợp đồng mang ngành lạ thì ngành đó được tự thêm vào danh mục để rà lại sau.',
      'Nguồn "Hợp đồng" của khách hàng và "Gia hạn hợp đồng" của cơ hội là mục hệ thống: đổi tên được, hệ thống tự gán theo tên mới.',
    ],
  },
  {
    version: '1.24.0',
    date: '2026-10-06',
    title: 'Tự sửa danh mục: lý do thất bại, loại tương tác, loại tài liệu',
    changes: [
      'Cài đặt → Danh mục (mới): quản trị viên tự thêm, đổi tên, sắp xếp, ẩn/hiện các mục của Lý do thất bại, Loại tương tác và Loại tài liệu, không cần chờ bản cập nhật.',
      'Mỗi mục hiện số bản ghi đang dùng. Mục còn dữ liệu không xoá được mà phải Gộp vào mục khác: mọi cơ hội, tương tác, tài liệu mang mục cũ chuyển sang mục mới, và lần đổi lý do thất bại được ghi vào nhật ký thay đổi của cơ hội.',
      'Mục bị ẩn biến khỏi ô chọn nhưng bản ghi cũ vẫn hiện đúng tên và vẫn sửa được. Mục "Khác" (và loại tài liệu "Hợp đồng") là mục hệ thống: đổi tên được, không ẩn hay xoá được.',
      'AI đọc tài liệu chọn loại tài liệu theo danh mục đang bật; bản xuất CSV cơ hội hiện tên lý do thất bại thay vì mã.',
    ],
  },
  {
    version: '1.23.1',
    date: '2026-10-06',
    title: 'Sao lưu không làm đầy ổ đĩa, gửi Telegram được dữ liệu lớn',
    changes: [
      'Bản sao lưu gửi qua Telegram được nén gzip (nhỏ hơn 3–5 lần). Tệp nhận được có đuôi .db.gz: giải nén rồi đổi tên thành app.db để khôi phục.',
      'Nếu bản nén vẫn vượt giới hạn 50 MB của Telegram, Cài đặt báo lỗi rõ ràng kèm gợi ý dùng sao lưu Google Drive, thay vì lỗi khó hiểu.',
      'Máy chủ chỉ giữ 10 bản sao lưu mới nhất, bản cũ hơn tự xoá. Trước đây mỗi lần sao lưu (kể cả lần gửi Telegram) để lại một bản đầy đủ, ổ đĩa đầy dần.',
      'Xuất toàn bộ dữ liệu (JSON) được ghi dần thay vì dựng cả tệp trong bộ nhớ: máy chủ không còn nguy cơ hết RAM khi dữ liệu lớn, và người khác vẫn dùng bình thường trong lúc xuất.',
    ],
  },
  {
    version: '1.23.0',
    date: '2026-10-06',
    title: 'Trang Doanh thu mở được khi có hàng chục nghìn dòng',
    changes: [
      'Bảng doanh thu hiện dần từng 200 dòng khi cuộn, thay vì vẽ cả nghìn dòng một lúc làm treo trình duyệt. Dòng Tổng cộng cuối bảng vẫn tính trên toàn bộ dữ liệu.',
      'Ô "Cơ cấu doanh thu theo nhóm" chỉ tải số tổng đã tính sẵn thay vì chi tiết từng dòng, nên màn Tổng của Doanh thu tải nhẹ hơn hẳn.',
      'Bảng so sánh với năm trước (màn Nền) và bảng chi tiết KPI theo tháng cũng hiện dần khi cuộn.',
      'Chế độ Kanban của màn Công việc hiện 50 thẻ đầu mỗi cột, bấm "Hiện thêm" để xem tiếp.',
    ],
  },
  {
    version: '1.22.0',
    date: '2026-10-06',
    title: 'Báo cáo mở tức thì, nút Làm mới số liệu',
    changes: [
      'Tổng quan, Báo cáo, Sức khỏe pipeline và Doanh thu (Tổng hợp, KPI) giữ số liệu tối đa 5 phút: mở lại trong 5 phút là hiện ngay thay vì chờ tính lại.',
      'Các màn này ghi "Số liệu lúc HH:mm" kèm nút Làm mới để tính lại ngay khi cần. Thay đổi do chính bạn vừa làm luôn hiện ngay; thay đổi của người khác hiện sau tối đa 5 phút hoặc khi bấm Làm mới.',
      'Huy hiệu số việc trên menu và cột trái màn Công việc nhẹ hơn hẳn, không còn làm chậm máy chủ khi nhiều người cùng dùng.',
      'Mở thẻ việc, tạo việc và các ô chọn khách hàng nhanh hơn: chỉ tải tên khách hàng thay vì cả bộ số liệu của từng khách.',
      'Danh sách Bảng mở nhanh hơn nhiều khi có nhiều bảng và nhiều việc.',
      'Màn KPI doanh thu chỉ tải chi tiết của tháng đang mở, thay vì cả năm.',
    ],
  },
  {
    version: '1.21.0',
    date: '2026-10-05',
    title: 'Công việc và Tài liệu tải dần khi cuộn',
    changes: [
      'Màn Công việc chỉ tải việc đang mở và việc xong trong 30 ngày gần nhất. Việc xong cũ hơn tự tải thêm từng đợt khi cuộn xuống cuối danh sách, hoặc bấm "Tải việc đã xong cũ hơn 30 ngày".',
      'Danh sách dài được hiện dần từng 300 dòng khi cuộn, nên màn Công việc mở ngay cả khi có hàng chục nghìn việc thay vì làm treo trình duyệt.',
      'Số đếm ở cột trái màn Công việc và huy hiệu "Cần theo dõi" trên menu được tính sẵn ở máy chủ: các trang không còn phải tải cả danh sách việc chỉ để đếm.',
      'Thư viện Tài liệu hiện 200 tài liệu mới nhất, cuộn xuống để xem thêm. Mở tài liệu từ một liên kết vẫn tìm và tô sáng đúng tài liệu đó.',
      'Ô chọn người phụ trách mở nhanh hơn khi danh bạ lớn: hiện 200 người đầu, gõ tên để tìm trong toàn bộ danh bạ.',
    ],
  },
  {
    version: '1.20.1',
    date: '2026-10-05',
    title: 'Danh sách lớn mở nhanh hơn nhiều',
    changes: [
      'Các màn Cơ hội, Tổng quan, Khách hàng, Hợp đồng và Báo giá mở nhanh hơn rõ rệt khi dữ liệu nhiều: thử với 5.000 khách hàng và 15.000 cơ hội, màn Cơ hội từ hơn 6 phút còn dưới 1 giây, Khách hàng từ 41 giây còn dưới 1 giây.',
      'Trang danh sách Bảng không còn chậm dần khi có nhiều bảng và nhiều việc.',
      'Dữ liệu gửi về trình duyệt được nén, nên các trang nhiều dòng (Công việc, Doanh thu, Lịch) tải nhanh hơn, nhất là qua mạng di động.',
      'Màn Doanh thu không còn báo lỗi khi số dòng dịch vụ vượt khoảng 32.000.',
      'Trong lúc một người mở danh sách lớn, những người khác ít bị chờ theo hơn hẳn.',
    ],
  },
  {
    version: '1.20.0',
    date: '2026-10-05',
    title: 'Nghe nhạc ngay trên màn làm việc, lưu link yêu thích',
    changes: [
      'Thanh trên có nút Nhạc (biểu tượng tai nghe), cạnh nút Ghi chú nhanh: dán link YouTube, Spotify hoặc radio để nghe trong lúc làm việc, hoặc chọn âm thanh tạo sẵn (Đàn lofi, Mưa, Sóng biển, Tập trung). Trên điện thoại, mở từ menu tài khoản → Nhạc.',
      'Khi đang phát, nút hiện vạch sóng nhạc và tên bài, kèm nút ■ để dừng ngay không cần mở bảng.',
      'Màn chờ và màn làm việc dùng chung một trình phát: bật nhạc ở màn chờ rồi mở khóa vẫn nghe tiếp, khóa màn hình giữa chừng cũng không ngắt. Đóng bảng Nhạc hay chuyển trang nhạc vẫn chạy; đăng xuất thì nhạc tắt.',
      'Đang nghe bài hợp ý thì bấm "Lưu yêu thích". Danh sách Yêu thích lưu theo tài khoản nên đổi máy, đổi trình duyệt vẫn còn (tối đa 50 link). Bấm để phát lại, bấm thùng rác để bỏ.',
      'Các link đã lưu trên máy này ở màn chờ trước đây được tự chuyển vào Yêu thích của tài khoản.',
    ],
  },
  {
    version: '1.19.0',
    date: '2026-10-05',
    title: 'Lọc bảng doanh thu theo khách hàng và công nợ',
    changes: [
      'Tiêu đề cột "Khách hàng" trong bảng doanh thu có nút lọc: tìm theo tên (gõ không dấu cũng được), tích chọn một hoặc nhiều khách. Thanh lọc hiện tên khách đang lọc, bấm × để bỏ.',
      'Thanh lọc có thêm ô chọn Loại hợp đồng (Mới / Mở rộng) và Thời hạn hợp đồng.',
      'Ô "Chỉ dòng còn công nợ" giữ lại các dòng còn tiền đã xuất hoá đơn mà khách chưa trả; dải phễu và các con số tổng cũng tính theo.',
      'Bấm tiêu đề cột Doanh thu để sắp xếp lớn → nhỏ, nhỏ → lớn, rồi về thứ tự mặc định. Khi bật "Nhóm theo khách hàng", các nhóm xếp theo tổng doanh thu của khách.',
      'Lọc theo khách hàng, loại và thời hạn hợp đồng áp dụng cho cả màn KPI và file mẫu nhập Excel.',
    ],
  },
  {
    version: '1.18.0',
    date: '2026-10-05',
    title: 'Chọn giờ nhắc ngay khi tạo việc',
    changes: [
      'Form "Tạo công việc" có thêm ô "Nhắc lúc" cạnh Hạn hoàn thành: chọn nhanh 15 phút nữa, 1 giờ nữa, 9:00 sáng mai, 9:00 ngày hạn, hoặc tự chọn giờ.',
      'Ô thêm việc đầu danh sách Công việc được làm lại: một ô nhập lớn, bên dưới là các nút Ưu tiên, Hạn, Nhắc lúc gọn trên một hàng thay cho ba hàng rời rạc.',
      'Ô này cũng hiểu ngày giờ như Ctrl + J: gõ "chiều mai gửi báo giá" là tự đặt hạn ngày mai và nhắc 14:00 (ghi "tự hiểu"); bấm vào nút Hạn hay Nhắc để chọn lại, hoặc "Không phải ngày giờ" để bỏ.',
      'Thêm xong ô vẫn mở để gõ việc tiếp theo; "Chi tiết…" mang theo cả hạn và giờ nhắc sang form đầy đủ.',
    ],
  },
  {
    version: '1.17.0',
    date: '2026-10-05',
    title: 'Thêm việc nhanh bằng một dòng',
    changes: [
      'Nhấn Ctrl + J ở bất kỳ màn nào (hoặc chọn "Thêm việc nhanh" trong nút Tạo nhanh) rồi gõ một dòng như "mai 9h gọi anh Nam": nhấn Enter là có việc "Gọi anh Nam", hạn ngày mai, nhắc lúc 9:00.',
      'Hiểu được: hôm nay, mai, mốt, thứ 2 đến chủ nhật (kèm "tuần sau"), ngày 15/10, giờ 9h, 9h30, 14:00, buổi sáng/trưa/chiều/tối, và "30 phút nữa", "sau 2 tiếng", "3 ngày nữa". Gõ có dấu hay không dấu đều được.',
      'Gõ tới đâu thấy ngay tên việc và giờ nhắc tới đó. App hiểu nhầm một cụm thành ngày giờ thì bấm "Không phải ngày giờ" để giữ nguyên cả dòng làm tên việc.',
      'Shift + Enter để tạo rồi gõ tiếp việc khác. Việc mới giao cho bạn và vào danh sách mặc định.',
      'Sửa: popup nhắc việc (1.16.0) bật trễ 7 tiếng vì máy chủ đang chạy giờ quốc tế (UTC). Máy chủ nay dùng giờ Việt Nam, nên nhắc qua Telegram, việc quá hạn và giờ tạo bản ghi cũng đúng giờ.',
    ],
  },
  {
    version: '1.16.0',
    date: '2026-10-05',
    title: 'Nhắc việc đúng giờ bằng popup giữa màn hình',
    changes: [
      'Mỗi việc có thêm mục "Nhắc lúc" ngay dưới Ngày: chọn nhanh 15 phút nữa, 1 giờ nữa, 9:00 sáng mai, 9:00 ngày hạn, hoặc tự chọn ngày giờ. Một việc đặt được nhiều lần nhắc và bỏ từng lần khi không cần.',
      'Đến giờ, lời nhắc bật lên giữa màn hình kèm một tiếng chuông nhỏ: bấm Xong việc, Tắt nhắc, Mở việc, hoặc nhắc lại sau 10 phút, 30 phút, 1 giờ, sáng mai. Đóng popup cũng là nhắc lại sau 10 phút, nên không lỡ tay làm mất lời nhắc.',
      'Nhiều việc nhắc cùng lúc thì popup hiện thành danh sách: mỗi dòng có Xong, Tắt, Hoãn, Mở riêng, và có nút Hoãn tất cả, Tắt tất cả để xử lý một lần.',
      'Chỉ bật lời nhắc của chính bạn. Việc đã hoàn thành thì không nhắc nữa. Khi màn hình đang khóa, lời nhắc chờ đến lúc mở khóa.',
      'Thông báo trên máy tính (nếu đã bật ở chuông thông báo) giờ báo đúng lúc đến giờ, thay vì báo ngay khi lịch hẹn còn mấy ngày nữa mới tới.',
      'Sửa: ô chọn ngày và giờ bị tràn khung, ô ngày co lại chỉ còn biểu tượng lịch.',
    ],
  },
  {
    version: '1.15.0',
    date: '2026-10-04',
    title: 'Xóa cơ hội, tự chọn những gì xóa theo',
    changes: [
      'Trang chi tiết cơ hội có thêm nút Xóa (trong menu Thao tác khác).',
      'Hộp xác nhận liệt kê mọi thứ gắn với cơ hội: tài liệu, trang tài liệu, báo giá, hợp đồng, công việc, hoạt động, nhắc việc. Đánh dấu mục nào thì mục đó xóa cùng; mục không đánh dấu được giữ lại, chỉ bỏ liên kết với cơ hội và gắn về khách hàng.',
      'Mục đang dùng chung hiện rõ "Còn gắn với: Hợp đồng…, Báo giá…, Dự án…" để cân nhắc trước khi xóa. Hợp đồng còn dòng doanh thu tham chiếu thì không chọn xóa được.',
      'Tài liệu và trang tài liệu chọn xóa sẽ vào Thùng rác, khôi phục được. Báo giá, hợp đồng, công việc, hoạt động, nhắc việc chọn xóa thì xóa hẳn.',
      'Sửa: trước đây xóa cơ hội sẽ xóa luôn trang tài liệu (cùng tài liệu đính kèm của trang) và nhắc việc mà không hỏi; nay chỉ xóa khi bạn chọn.',
    ],
  },
  {
    version: '1.14.2',
    date: '2026-10-04',
    title: 'Nút thu gọn thanh điều hướng dễ nhận ra hơn',
    changes: [
      'Nút thu gọn thanh điều hướng chuyển xuống góc dưới, cạnh nút tùy chỉnh menu, và dùng biểu tượng thanh bên để không nhầm với nút thu gọn của panel Công việc.',
      'Khi đã thu gọn, nút mở rộng cũng nằm ở góc dưới, đúng chỗ cũ.',
      'Phím tắt Ctrl + B để thu gọn hoặc mở rộng thanh điều hướng (không ảnh hưởng khi đang gõ chữ).',
      'Sửa: nút thu gọn cũ bị cắt mất một nửa và đè lên tiêu đề panel bên cạnh.',
    ],
  },
  {
    version: '1.14.1',
    date: '2026-10-03',
    title: 'Nghe nhạc riêng trên màn chờ',
    changes: [
      'Nhạc study: dán link YouTube (video, danh sách phát, livestream), Spotify hoặc đường dẫn radio (.mp3) rồi bấm Phát. Link được lưu theo từng máy, đặt tên gợi nhớ để chọn lại nhanh, xóa khi không cần.',
      'Đóng bảng Nhạc study thì nhạc vẫn phát tiếp; mở khóa hoặc đăng xuất thì nhạc tắt. Tên bài hiện ngay trên thanh dưới.',
      'Âm thanh tạo sẵn (đàn lofi, mưa, sóng biển, tập trung) vẫn còn cho lúc không có mạng.',
      'Sửa: chữ mô tả trong bảng Nhạc study bị tràn ra ngoài ô.',
    ],
  },
  {
    version: '1.14.0',
    date: '2026-10-03',
    title: 'Khóa màn hình với màn chờ thư giãn',
    changes: [
      'Nút 🔒 cạnh chuông thông báo (hoặc phím Ctrl + Shift + L) khóa màn hình ngay khi rời bàn. Trên điện thoại: menu tài khoản → Khóa ngay.',
      'Màn chờ để nghỉ mắt: tên app góc trái, đồng hồ có giây, thứ ngày tháng kèm âm lịch và thẻ "Chào mừng trở lại" bên phải. Không hiện việc hay thông báo nào.',
      'Nền màn chờ: dùng ảnh của bạn (tải lên trong menu tài khoản → Khóa màn hình & màn chờ, chỉ lưu trên máy) hoặc một trong sáu khung cảnh chuyển động chậm: Cực quang, Hoàng hôn, Đêm sao, Biển, Rừng sương, Tối giản. Đổi cảnh ngay trên màn chờ bằng nút góc phải; có nút toàn màn hình.',
      'Thanh tiện ích dưới màn chờ: Đếm ngược (5/15/25/50 phút hoặc tự nhập, chuông báo khi hết giờ), Nhạc study (đàn lofi, mưa, sóng biển, tiếng ồn nâu, tạo ngay trên máy, không cần mạng) và Lịch âm / dương theo tháng.',
      'Mã mở khóa 4–6 số, không bắt buộc. Chưa đặt mã thì bấm hoặc gõ phím bất kỳ là vào lại. Đặt, đổi hoặc tắt mã trong menu tài khoản; mã dùng chung trên mọi máy bạn đăng nhập.',
      'Quên mã: bấm "Quên mã?" để nhận lại đúng mã đang dùng qua email tài khoản (mã không đổi). Luôn có nút Đăng xuất để vào lại.',
      'Tùy chọn tự khóa sau 5 phút đến 1 giờ không dùng (mặc định tắt). Khóa ở một tab thì mọi tab cùng khóa; tải lại trang vẫn giữ khóa. Đang gõ dở gì vẫn còn nguyên khi mở khóa.',
      'Nút chọn giao diện (Sáng/Tối…) chuyển vào menu tài khoản trên mọi màn hình.',
      'Bỏ mục Trợ lý AI ở thanh điều hướng: dùng nút ✨ Trợ lý AI nhanh trên thanh trên cùng (điện thoại: nút Tạo → Trợ lý AI).',
    ],
  },
  {
    version: '1.13.1',
    date: '2026-10-03',
    title: 'Sửa mục Giao diện trong menu tài khoản trên điện thoại',
    changes: [
      'Điện thoại: mở lại menu tài khoản sau khi đã đổi giao diện, bấm "Giao diện" giờ mở đúng danh sách lựa chọn. Trước đây danh sách còn mở sẵn từ lần trước nên lần bấm đó lại thu nó vào.',
    ],
  },
  {
    version: '1.13.0',
    date: '2026-10-03',
    title: 'Trợ lý AI nhanh từ mọi màn hình, hiểu bản ghi đang xem',
    changes: [
      'Nút ✨ Trợ lý AI trên thanh trên cùng (hoặc phím Ctrl + /) mở khung trò chuyện trượt từ cạnh phải, hỏi ngay tại màn đang xem mà không phải chuyển sang trang Trợ lý AI. Trên điện thoại mở từ nút Tạo → Trợ lý AI (cạnh Ghi nhanh), khung mở toàn màn hình.',
      'Mở trợ lý khi đang xem một khách hàng hoặc cơ hội: khung chat hiện nhãn "Đang xem …", trợ lý đọc hồ sơ của bản ghi đó nên hỏi "khách hàng này", "cơ hội này" là hiểu. Bấm vào nhãn để hỏi không kèm bản ghi. Gợi ý câu hỏi cũng đổi theo bản ghi, và mỗi câu hỏi ghi rõ đã hỏi về bản ghi nào.',
      'Trợ lý chỉ đọc được hồ sơ khách hàng, cơ hội nằm trong phạm vi bạn được xem.',
      'Điện thoại: nút đổi giao diện chuyển vào menu tài khoản (bấm ảnh đại diện → Giao diện), thanh trên cùng rộng chỗ hơn cho tiêu đề trang.',
      'Khung nhanh và trang Trợ lý AI dùng chung cuộc trò chuyện: bấm "Mở toàn màn hình" là sang trang lớn với đúng cuộc đang hỏi.',
      'Đóng khung khi trợ lý đang trả lời thì câu trả lời vẫn tiếp tục; mở lại thấy nguyên cuộc trò chuyện và chữ đang gõ dở.',
      'Màn Công việc: phím "/" để tìm kiếm không còn bắt nhầm Ctrl + /.',
    ],
  },
  {
    version: '1.12.0',
    date: '2026-10-03',
    title: 'Tạo khách hàng, cơ hội, dự án ngay từ màn công việc',
    changes: [
      'Ô Khách hàng, Cơ hội và Dự án trong chi tiết công việc có thêm dòng "Tạo … đầy đủ…": mở biểu mẫu đầy đủ chồng lên công việc, điền sẵn tên vừa gõ. Lưu xong bản ghi mới được gắn ngay vào công việc. Dòng "Tạo nhanh" theo tên vẫn giữ nguyên.',
      'Biểu mẫu tự điền theo công việc: cơ hội lấy khách hàng, tên việc và dự án của việc; dự án lấy khách hàng và tên cơ hội. Chỉ bắt buộc chọn khách hàng, các trường khác bổ sung sau cũng được.',
      'Việc chưa có khách hàng vẫn tạo được cơ hội: ô Khách hàng trong biểu mẫu cơ hội (và dự án) cho tạo khách hàng mới ngay bên trong, không phải thoát ra.',
      'Tạo dự án từ một việc đã gắn cơ hội thì cơ hội đó tự nối với dự án mới (nếu chưa có dự án triển khai). Việc chuyển sang luồng việc của dự án, giữ nguyên trạng thái.',
      'Việc có khách hàng nhưng chưa thuộc cơ hội hoặc dự án nào hiện một dòng gợi ý kèm nút "Tạo cơ hội" / "Tạo dự án"; bấm × để ẩn gợi ý cho riêng việc đó.',
      'Biểu mẫu Tạo việc cũng có lối tạo khách hàng và cơ hội đầy đủ như trên.',
      'Sửa biểu mẫu Tạo việc: ô Luồng việc và Cột luôn hiện đúng nơi việc sẽ được lưu (trước đây mở form lần thứ hai thì cả hai ô trống). Khi chưa chọn luồng, danh sách cột được nhóm theo tên luồng thay vì lặp lại "Cần làm, Đang làm…" không rõ của luồng nào.',
    ],
  },
  {
    version: '1.11.1',
    date: '2026-10-02',
    title: 'Sắp xếp lại các nút trong Liên kết chia sẻ',
    changes: [
      'Cài đặt → Liên kết chia sẻ: nút "Sao chép liên kết" nằm một hàng riêng, rộng hết bề ngang; ba nút Xem lượt mở, Gia hạn 7 ngày, Thu hồi chia đều một hàng bên dưới, không còn lệch hàng trên điện thoại.',
      'Liên kết tạo trước 1.11.0 hiện một ghi chú riêng giải thích vì sao không sao chép lại được, thay vì dòng chữ xen giữa các nút.',
    ],
  },
  {
    version: '1.11.0',
    date: '2026-10-02',
    title:
      'Xem lại và khôi phục công việc đã lưu trữ; sao chép lại liên kết chia sẻ; sửa tên khách hàng bị cắt',
    changes: [
      'Lưu trữ một công việc xong có thông báo kèm nút "Hoàn tác". Menu luồng việc có mục mới "Công việc đã lưu trữ" liệt kê mọi việc đã lưu trữ của luồng (cột cũ, thời điểm lưu trữ) với nút "Khôi phục" đưa việc về đúng cột cũ.',
      'Cài đặt → Liên kết chia sẻ: mỗi liên kết đang hoạt động có nút "Sao chép liên kết" để gửi lại cho khách. Áp dụng cho liên kết tạo từ bản này; liên kết tạo trước đó vẫn chỉ hiện một lần lúc tạo.',
      'Trang Bảng – Luồng việc: ô luồng việc tự cao theo nội dung, tên khách hàng dài không còn bị cắt mất. Đầu trang một luồng việc hiện tên dự án / khách hàng rộng hơn, rê chuột xem tên đầy đủ. Khung luồng việc ở Tổng quan hiện tên khách hàng trên một dòng riêng.',
    ],
  },
  {
    version: '1.10.0',
    date: '2026-10-02',
    title: 'Bảng – Luồng việc; dự án một luồng không còn bắt chọn bảng; Giai đoạn là luồng có mốc',
    changes: [
      '"Bảng công việc" đổi tên thành "Bảng – Luồng việc" (dạng ngắn "Luồng việc"). Mỗi luồng việc là một mảng công việc có quy trình riêng; các cột bên trong là các bước (trước gọi là "danh sách").',
      'Tạo dự án mới là có sẵn một luồng việc mang tên dự án — thêm công việc được ngay, không phải tạo bảng trước. Đổi tên dự án thì luồng này đổi theo.',
      'Dự án chỉ có một luồng việc: form công việc không còn ô chọn luồng, Tổng quan dự án ẩn khung luồng việc. Tab Công việc có lối "Kanban theo cột" để mở luồng đó.',
      'Tab Giai đoạn chỉ liệt kê luồng việc có mốc bàn giao. Luồng chưa có mốc nằm trong mục thu gọn để đặt mốc tại chỗ; thêm giai đoạn mới bằng tên và ngày mốc ngay trong tab.',
      'Số giai đoạn dùng để gợi ý mô hình triển khai A/B chỉ đếm luồng việc có mốc. Mô hình đã chốt không đổi.',
      'Dạng xem đổi tên cho rõ: "Kanban" trong luồng việc, "Cây việc" trong tab Công việc của dự án, "Bảng tính" ở trang Công việc.',
    ],
  },
  {
    version: '1.9.1',
    date: '2026-10-02',
    title: 'Cập nhật kiểm thử tự động theo menu mới',
    changes: [
      'Không thay đổi giao diện. Bộ kiểm thử tự động dùng tên nhóm menu mới "Bàn làm việc", giúp phát hiện lỗi sớm trước mỗi lần cập nhật.',
    ],
  },
  {
    version: '1.9.0',
    date: '2026-10-02',
    title: 'Bảng doanh thu nhóm theo khách hàng',
    changes: [
      'Khách hàng có nhiều dòng doanh thu (nhiều hợp đồng hoặc nhiều dịch vụ) được gom thành một nhóm. Dòng đầu nhóm ghi số hợp đồng, số dịch vụ và cộng sẵn doanh thu, công nợ, từng tháng của cả nhóm.',
      'Mỗi dòng trong nhóm là một cặp hợp đồng × dịch vụ: ô đầu ghi tên hợp đồng, các dòng cùng hợp đồng đứng liền nhau, dòng chưa gắn hợp đồng ghi "Không gắn hợp đồng".',
      'Nút "N dòng" bên phải tên khách hàng để mở hoặc thu gọn nhóm; các nhóm mở sẵn. Có thêm "Mở tất cả" / "Thu gọn tất cả".',
      'Cuối mỗi nhóm có "+ Thêm dòng doanh thu", mở form với khách hàng đã điền sẵn.',
      'Ô "Nhóm theo khách hàng" để bật hoặc tắt cách xem này; trình duyệt nhớ lựa chọn cho lần sau. Khách hàng chỉ có một dòng vẫn hiển thị như cũ.',
      'Nhãn trạng thái liên kết chia sẻ (Đang hoạt động / Hết hạn / Đã thu hồi) đổi màu theo giao diện sáng / tối, dễ đọc hơn ở chế độ tối.',
    ],
  },
  {
    version: '1.8.1',
    date: '2026-10-02',
    title:
      'Hiệu suất tách hai màn Của tôi / Phòng ban; Kinh doanh lên trên Dự án; Đã chia sẻ vào Cài đặt',
    changes: [
      'Thanh điều hướng: nhóm Kinh doanh xếp ngay dưới Bàn làm việc, trên nhóm Dự án.',
      'Mục "Đã chia sẻ" chuyển vào Cài đặt → Dữ liệu → Liên kết chia sẻ, cạnh Dữ liệu & sao lưu. Ai tạo được liên kết chia sẻ đều vào được mục này để xem, gia hạn hoặc thu hồi.',
      'Đường dẫn cũ /shares tự chuyển tới chỗ mới.',
      'Trang Hiệu suất tách hai màn: "Của tôi" chỉ số liệu của chính bạn; "Phòng ban" cho công ty, phòng ban và nhân sự bạn quản lý (chọn đơn vị hoặc từng người, biểu đồ so sánh, bảng theo đơn vị / cá nhân). Màn Phòng ban chỉ hiện khi bạn được xem số liệu của người khác.',
    ],
  },
  {
    version: '1.8.0',
    date: '2026-10-02',
    title: 'Báo cáo Hiệu suất cá nhân, đội nhóm, phòng ban; Báo cáo tổng ở Tổng quan',
    changes: [
      'Trang mới Hiệu suất trong nhóm Bàn làm việc: việc nhận mới, hoàn thành (so với kỳ trước), tỷ lệ đúng hạn, đang mở, quá hạn, bị chặn, số lần dời hạn, thời gian xử lý trung bình và giờ thực tế.',
      'Ô "Xem của" để chọn Của tôi, toàn bộ phạm vi hoặc một khối/phòng; bấm tên một người trong bảng để xem riêng người đó. Dòng của chính bạn có nhãn "Bạn".',
      'Biểu đồ việc hoàn thành theo tuần (đúng hạn / trễ hạn / không có hạn) và biểu đồ so sánh giữa các đơn vị hoặc thành viên; bấm một cột để đi sâu.',
      'Số liệu theo đúng phạm vi bạn được xem: nhân viên thấy của mình, trưởng phòng thấy cả phòng, giám đốc khối thấy cả khối.',
      'Tổng quan có thêm tab Báo cáo tổng (công việc và kinh doanh trên một màn). Báo cáo trong nhóm Dự án và Sức khỏe pipeline trong nhóm Kinh doanh giữ nguyên chỗ cũ.',
      'Báo cáo trong nhóm Dự án rút gọn chỉ còn dự án và công việc: số dự án đang triển khai, mốc trễ hạn, bảng tiến độ theo từng dự án (tỷ lệ hoàn thành, việc quá hạn, mốc kế tiếp, ngày kết thúc dự kiến). Số liệu bán hàng xem ở Sức khỏe pipeline hoặc Báo cáo tổng.',
      'Nhóm "Hôm nay" trên thanh điều hướng đổi tên thành "Bàn làm việc".',
      'Màn "Tất cả mục" trên điện thoại theo đúng các nhóm của thanh điều hướng; thêm Danh bạ cá nhân, Cài đặt chuyển sang mục Hệ thống riêng.',
    ],
  },
  {
    version: '1.7.0',
    date: '2026-10-02',
    title: 'Phóng to một ngày trong Lịch trình; báo khách mở liên kết qua chuông thông báo',
    changes: [
      'Lịch trình ở tab Trọng tâm (xem theo tuần): bấm vào ô một ngày, hoặc nút phóng to ở góc ô, để mở toàn bộ lịch trình ngày đó — tiêu đề hiện đầy đủ, chia theo giờ, việc trong ngày, mốc & sự kiện và khoảng trống có thể làm việc tập trung.',
      'Khi khách mở liên kết chia sẻ lần đầu, bạn nhận một thông báo trong chuông (bấm để tới khách hàng / cơ hội) thay vì một nhắc hẹn chen vào Lịch trình và Lịch.',
      'Các nhắc hẹn "Khách vừa mở liên kết" chưa xử lý trước đây được tự chuyển sang chuông thông báo.',
    ],
  },
  {
    version: '1.6.0',
    date: '2026-10-02',
    title: 'Kết quả AI ở Trọng tâm được lưu lại và tự nhắc khi đã cũ',
    changes: [
      'Phân tích AI ở tab Trọng tâm được lưu cho từng kỳ: mở lại trang, đổi máy hay xem trên điện thoại vẫn thấy, không tốn thêm lượt AI. Chỉ thay khi bạn bấm Phân tích lại.',
      'Luôn hiện thời điểm phân tích; dải vàng nhắc khi kết quả đã cũ, nói rõ lý do: bao nhiêu việc đã xong, việc mới, việc bị dời, hoặc đã quá lâu (kỳ ngày 4 giờ, kỳ tuần 1 ngày, kỳ tháng 3 ngày).',
      'Ưu tiên AI gợi ý đã làm xong được gạch đi; xong hết thì nhắc phân tích lại để có kế hoạch tiếp theo.',
      'Chấm vàng trên tab Trọng tâm khi kết quả AI của kỳ bạn hay xem đã cũ.',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-10-02',
    title: 'Hồ sơ khách hàng 360°: chăm sóc, gợi ý bán thêm và người liên hệ',
    changes: [
      'Tab Tổng quan mới trong hồ sơ khách hàng: sức khỏe khách hàng có lý do, nguy cơ mất khách (điểm 0–100), việc tiếp theo và nút nhanh Ghi tương tác / Tạo việc / Tạo cơ hội.',
      'Các bên liên quan xếp theo vai trò trong quyết định mua, cảnh báo khi thiếu người quyết định, người duyệt ngân sách, liên hệ chính hoặc chỉ có một đầu mối.',
      'Mục Sắp tới: hợp đồng, dịch vụ, báo giá sắp hết hạn; sinh nhật người liên hệ và ngày kỷ niệm hợp đồng.',
      'Doanh thu theo năm và theo dịch vụ; dòng thời gian gộp tương tác, cơ hội, đổi giai đoạn, báo giá, hợp đồng, việc đã xong và tài liệu.',
      'Gợi ý cơ hội: gia hạn hợp đồng/dịch vụ sắp hết hạn, bán chéo dịch vụ mà khách cùng ngành đang dùng, làm mới báo giá quá hạn, mở lại cơ hội thua từ 6 tháng trước. Bấm để tạo cơ hội điền sẵn, hoặc bỏ qua kèm lý do; có tỉ lệ gợi ý được nhận.',
      'Kịch bản chăm sóc sau bán: một chạm tạo nhắc hẹn ngày 7, 30, 90 sau khi chốt đơn.',
      'Hạng chăm sóc khách hàng (VIP 14 ngày, Chiến lược 21, Tiêu chuẩn 30, Ít ưu tiên 90) hoặc nhịp liên hệ riêng; khách quá nhịp hiện ở mục Cần chú ý của tab Trọng tâm và bản tin Telegram.',
      'Ngày sinh người liên hệ (gõ dd/mm hoặc dd/mm/yyyy); sinh nhật và kỷ niệm hợp đồng hiện trong tab Trọng tâm.',
      'AI chăm sóc khách hàng: đánh giá nguy cơ mất khách, gợi ý việc nên làm và soạn sẵn email hoặc tin Zalo; sửa, sao chép rồi lưu thành tương tác.',
      'Người liên hệ đưa từ Danh bạ cá nhân: người trùng ở chính khách hàng được chọn thì gắn vào người đó thay vì bị bỏ qua; người trùng ở khách hàng khác được báo rõ tên khách hàng.',
      'Danh bạ cá nhân hiện tên khách hàng mà liên hệ đã vào, bấm để mở hồ sơ và tô sáng người đó; mở người liên hệ từ ô tìm kiếm cũng đi thẳng tới đúng người.',
      'Khung xem nhanh khách hàng hiện người liên hệ.',
    ],
  },
  {
    version: '1.4.1',
    date: '2026-10-02',
    title: 'Trọng tâm hiển thị đủ lịch và nhắc hẹn',
    changes: [
      'Lịch trình ở tab Trọng tâm (chế độ Của tôi) nay hiện đủ lịch, nhắc hẹn và biên bản họp như trang Lịch, không chỉ công việc.',
      'Lịch, nhắc hẹn và biên bản họp tạo mới được ghi đúng người tạo, để màn hình theo người và phân quyền xem hoạt động chính xác.',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-10-02',
    title: 'Tab Trọng tâm: việc cần làm và điểm cần chú ý theo kỳ',
    changes: [
      'Trang Tổng quan có thêm tab Trọng tâm bên cạnh Toàn cảnh: xem theo ngày, tuần, tháng hoặc khoảng ngày tự chọn, của riêng bạn hoặc cả nhóm bạn quản lý.',
      'Gom một chỗ: việc đến hạn, nhắc hẹn, hành động cơ hội, lịch họp, mốc chốt cơ hội, hợp đồng/báo giá/dịch vụ sắp hết hạn, hạn giai đoạn và dự án.',
      'Xem theo giờ trong ngày (kèm khung giờ trống), theo cột từng ngày trong tuần, hoặc lịch tháng tô màu theo độ dày việc.',
      'Đánh dấu xong, dời hạn sang hôm nay/mai/tuần sau hoặc kéo thả sang ngày khác, có nút Hoàn tác.',
      'Mục Cần chú ý: việc bị lùi hạn nhiều lần, việc bị chặn, cơ hội lâu không tương tác, khách lâu không liên hệ, việc chưa giao, ngày quá tải, trùng lịch.',
      'Mục Đang chờ: việc người khác đang chờ bạn và việc bạn đang chờ người khác; nhìn lại kỳ so với kỳ trước, tải công việc của nhóm, KPI doanh thu tháng.',
      'AI phân tích kỳ: xếp ưu tiên, chỉ ra rủi ro, gợi ý xếp lịch vào giờ trống, việc nên giao, việc mới (duyệt rồi mới tạo) và tin nhắn soạn sẵn.',
      'Bản tin Trọng tâm qua Telegram theo ngày, sáng thứ Hai và ngày mùng 1; in hoặc lưu PDF màn Trọng tâm.',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-10-02',
    title: 'Danh bạ cá nhân và đồng bộ danh bạ Google',
    changes: [
      'Trang Danh bạ cá nhân: danh bạ điện thoại và Gmail của riêng từng nhân viên, chỉ chủ sở hữu nhìn thấy.',
      'Nạp danh bạ từ file .vcf (iPhone, Android, Outlook) hoặc .csv (Google Contacts); nạp lại không tạo bản sao.',
      'Kết nối Gmail để kéo danh bạ về (chỉ đọc, không ghi ngược lên Google), đồng bộ thủ công hoặc tự động mỗi ngày.',
      'Phát hiện liên hệ trùng số điện thoại hoặc email với CRM; chọn nhiều người để đưa vào khách hàng, hoặc liên kết với người đã có.',
      'Chia sẻ tài liệu, báo giá, hợp đồng và Trang tài liệu bằng link chỉ xem, có thể gia hạn.',
      'Chuẩn hóa tên khách hàng về dạng Viết Hoa Chữ Đầu.',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-10-02',
    title: 'Sơ đồ tổ chức và quyền xem theo cấp quản lý',
    changes: [
      'Sơ đồ tổ chức dạng cây: mỗi phòng ban, khối là một ô, hiển thị người và vị trí của từng người.',
      'Xếp người vào đơn vị, đặt trưởng đơn vị và gán vị trí ngay trên sơ đồ.',
      'Trưởng đơn vị tự động xem được dữ liệu của cả nhánh bên dưới; quyền sửa, xoá vẫn theo vị trí.',
      'Ghi chú nhanh luôn riêng tư, kể cả với cấp trên.',
      'Liệt kê những người chưa được xếp vào đơn vị nào để không bỏ sót.',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-10-01',
    title: 'Trải nghiệm mobile toàn diện',
    changes: [
      'Thiết kế lại điều hướng mobile với tabbar năm mục, menu mở rộng và luồng Tạo nhanh dạng bottom sheet.',
      'Tối ưu Kanban, Công việc, CRM, Timeline, Ghi nhanh và Trợ lý AI cho màn hình điện thoại.',
      'Chuẩn hóa modal, popover và biểu mẫu với vùng chạm tối thiểu 44 px, safe-area và bàn phím ảo.',
      'Bổ sung giao diện thẻ mobile cho dữ liệu nghiệp vụ, bộ lọc cảm ứng và thao tác luôn hiển thị không phụ thuộc hover.',
      'Tăng khả năng truy cập với focus trap, nhãn hỗ trợ, tương phản màu và kiểm thử chống tràn ngang.',
    ],
  },
  {
    version: '1.0.1',
    date: '2026-10-01',
    title: 'Cải thiện khả năng đọc giao diện',
    changes: [
      'Tăng độ tương phản của chữ phụ, placeholder và thanh điều hướng trong giao diện Sáng.',
      'Làm đường viền, trạng thái hover và mũi tên chọn rõ ràng hơn.',
      'Gộp Tài liệu và Trang tài liệu thành một mục, chia hai tab: Trang tài liệu và Tệp tải lên.',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-09-30',
    title: 'Không gian làm việc hợp nhất',
    changes: [
      'Bổ sung trang Giới thiệu với thông tin phiên bản và lịch sử thay đổi.',
      'Hợp nhất công việc dạng danh sách, Kanban và lịch trong một không gian làm việc.',
      'Bổ sung ghi chú nhanh dạng cửa sổ nổi để theo dõi thông tin khi đang làm việc.',
      'Hoàn thiện trang tài liệu với mẫu theo mục đích sử dụng và trình soạn thảo toàn màn hình.',
    ],
  },
  {
    version: '0.9.0',
    date: '2026-09-25',
    title: 'Tài liệu và trợ lý thông minh',
    changes: [
      'Thêm mẫu tài liệu theo mục đích sử dụng và trải nghiệm soạn thảo mở rộng.',
      'Trợ lý AI có thể đề xuất thêm thông tin cho công việc từ nội dung bản nháp.',
      'Đơn giản hóa thao tác tạo công việc và tự động phân loại thông tin.',
    ],
  },
  {
    version: '0.8.0',
    date: '2026-09-20',
    title: 'Tổ chức và phân quyền',
    changes: [
      'Bổ sung đăng nhập nhiều người dùng, cây đơn vị, vị trí và ma trận phân quyền.',
      'Áp dụng phạm vi dữ liệu theo người sở hữu, đơn vị và cấp quản lý.',
      'Nâng cấp Trợ lý AI thành khung trò chuyện với lịch sử riêng cho từng người dùng.',
    ],
  },
];
