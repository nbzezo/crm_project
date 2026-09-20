import type { PermissionAction, PermissionResource, PermissionScope } from '@workflow/contracts';

/*
 * Nhan tieng Viet cho danh muc quyen.
 *
 * Tach khoi packages/contracts theo dung quy uoc dang co: ma nam o contracts
 * (client va server phai doc cung mot danh sach), nhan nam o client/src/i18n —
 * giong cach i18n/scoring.ts doi voi SCORE_FACTORS.
 */

export const RESOURCE_LABELS: Record<PermissionResource, string> = {
  customers: 'Khách hàng',
  contacts: 'Người liên hệ',
  deals: 'Cơ hội bán hàng',
  contracts: 'Hợp đồng',
  quotations: 'Báo giá',
  revenues: 'Doanh thu',
  services: 'Danh mục dịch vụ',
  projects: 'Dự án',
  boards: 'Bảng công việc',
  tasks: 'Công việc',
  documents: 'Tài liệu',
  notes: 'Ghi chú',
  interactions: 'Lịch sử tương tác',
  'report.sales': 'Báo cáo bán hàng',
  'report.revenue': 'Báo cáo doanh thu',
  'report.tasks': 'Báo cáo công việc',
  'report.projects': 'Báo cáo dự án',
  'admin.users': 'Quản trị người dùng',
  'admin.org': 'Sơ đồ tổ chức',
  'admin.positions': 'Vị trí & phân quyền',
  'settings.app': 'Cài đặt chung',
  'settings.ai': 'Cài đặt AI',
  'settings.email': 'Cài đặt email',
  'settings.telegram': 'Cài đặt Telegram',
  'data.export': 'Sao lưu & xuất dữ liệu',
  ai: 'Trợ lý AI',
  ar: 'Công nợ',
};

/** Ghi chú cho những mục dễ hiểu nhầm. Để trống thì không hiện gì. */
export const RESOURCE_HINTS: Partial<Record<PermissionResource, string>> = {
  'report.sales':
    'Xem số liệu tổng hợp. Khác với quyền mở từng cơ hội — một người có thể xem được con số của cả khối mà không mở được từng hồ sơ.',
  'data.export': 'Tải toàn bộ cơ sở dữ liệu về máy. Chỉ nên giao cho người thật sự cần sao lưu.',
  ar: 'Chưa có màn hình — để sẵn cho module công nợ đầy đủ (hoá đơn, phiếu thu, tuổi nợ).',
};

export const ACTION_LABELS: Record<PermissionAction, string> = {
  read: 'Xem',
  create: 'Thêm',
  update: 'Sửa',
  delete: 'Xoá',
  export: 'Xuất',
};

export const SCOPE_LABELS: Record<PermissionScope, string> = {
  none: 'Không',
  own: 'Của mình',
  unit: 'Đơn vị',
  subtree: 'Cả cây đơn vị',
  all: 'Toàn công ty',
};

export const SCOPE_HINTS: Record<PermissionScope, string> = {
  none: 'Không dùng được chức năng này.',
  own: 'Chỉ những bản ghi do chính người đó phụ trách.',
  unit: 'Bản ghi của người trong đúng đơn vị mình ngồi, không tính đơn vị cấp dưới.',
  subtree: 'Đơn vị mình ngồi và mọi đơn vị cấp dưới — đây là thứ tạo nên phân cấp.',
  all: 'Toàn bộ dữ liệu công ty.',
};

export const RESOURCE_GROUP_LABELS: Record<string, string> = {
  crm: 'Khách hàng & bán hàng',
  revenue: 'Doanh thu',
  work: 'Công việc & dự án',
  reports: 'Báo cáo',
  admin: 'Quản trị',
  settings: 'Cấu hình',
};
