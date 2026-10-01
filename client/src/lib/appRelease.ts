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
export const APP_UPDATED_AT = '2026-10-01';

export const RELEASE_NOTES: readonly ReleaseNote[] = [
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
