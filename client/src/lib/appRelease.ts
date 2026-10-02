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
