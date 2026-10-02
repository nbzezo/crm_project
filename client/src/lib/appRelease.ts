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
export const APP_UPDATED_AT = '2026-10-02';

export const RELEASE_NOTES: readonly ReleaseNote[] = [
  {
    version: '1.8.0',
    date: '2026-10-02',
    title: 'Báo cáo Hiệu suất cá nhân, đội nhóm, phòng ban; sắp xếp lại thanh điều hướng',
    changes: [
      'Trang mới Hiệu suất (nhóm Phân tích): việc nhận mới, hoàn thành (so với kỳ trước), tỷ lệ đúng hạn, đang mở, quá hạn, bị chặn, số lần dời hạn, thời gian xử lý trung bình và giờ thực tế.',
      'Xem theo đơn vị dạng cây — Khối, Phòng, Tổ cộng dồn từ nhân sự bên dưới, mở từng cấp để xem từng người — hoặc xem bảng cá nhân và bấm tiêu đề cột để sắp xếp.',
      'Số liệu theo đúng phạm vi bạn được xem: nhân viên thấy của mình, trưởng phòng thấy cả phòng, giám đốc khối thấy cả khối.',
      'Nhóm "Hôm nay" trên thanh điều hướng đổi tên thành "Làm việc"; Báo cáo, Hiệu suất và Sức khỏe pipeline gom về nhóm mới "Phân tích".',
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
