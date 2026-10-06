import {
  Bot,
  CircleDot,
  Database,
  Download,
  FileJson,
  GanttChartSquare,
  Info,
  LayoutGrid,
  ListChecks,
  ListOrdered,
  Mail,
  Network,
  PackageOpen,
  Send,
  Share2,
  ShieldCheck,
  Tag,
  Target,
  Users,
  Workflow,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { PermissionKey } from './permissions';

/*
 * Danh muc cac trang Cai dat (1.32.0).
 *
 * Nhom theo CAU HOI nguoi dung mang toi chu khong theo bang du lieu: "ai duoc lam
 * gi", "co hoi di qua pipeline the nao", "viec va du an qua nhung buoc nao", "he
 * thong noi voi dau", "du lieu co an toan khong". Moi nhom toi da bon muc — ban
 * truoc nhom "Quy trinh" om bay muc tron CRM, du an va cong viec.
 *
 * Tach ra khoi SettingsPage de o tim Ctrl+K cung tim duoc cai dat ma khong keo ca
 * trang Cai dat (va moi man con cua no) vao goi chinh.
 *
 * `group` phai lien tuc theo thu tu mang — tieu de nhom chi ve o muc dau tien.
 */
export type SettingsTab =
  | 'overview'
  | 'users'
  | 'org'
  | 'positions'
  | 'pipeline'
  | 'scoring'
  | 'handover'
  | 'taskStatuses'
  | 'taskFlow'
  | 'delivery'
  | 'labels'
  | 'picklists'
  | 'email'
  | 'telegram'
  | 'ai'
  | 'backup'
  | 'export'
  | 'profile'
  | 'shares'
  | 'about';

export interface SettingsTabDef {
  key: SettingsTab;
  label: string;
  /** Mot dong mo ta hien duoi tieu de trang. */
  description: string;
  /** Tu khoa phu cho o tim — ten khoi con, tu dong nghia, ten dich vu. */
  keywords: string;
  icon: LucideIcon;
  group: string;
  permission?: PermissionKey;
  /** Hien khi co MOT trong cac quyen nay (thay cho `permission`). */
  permissionAny?: PermissionKey[];
}

export const SETTINGS_GROUPS = {
  start: 'Bắt đầu',
  org: 'Tổ chức & quyền',
  sales: 'Bán hàng',
  work: 'Công việc & triển khai',
  shared: 'Dùng chung',
  integration: 'Kết nối',
  data: 'Dữ liệu & bảo mật',
  system: 'Hệ thống',
} as const;

export const SETTINGS_TABS: SettingsTabDef[] = [
  {
    key: 'overview',
    label: 'Tổng quan',
    description: 'Trạng thái các kết nối, sao lưu và những việc cần chú ý.',
    keywords: 'tổng quan trạng thái cảnh báo cần chú ý',
    icon: LayoutGrid,
    group: SETTINGS_GROUPS.start,
  },
  {
    key: 'users',
    label: 'Người dùng',
    description: 'Tài khoản đăng nhập. Người mới nhận thư mời và tự đặt mật khẩu.',
    keywords: 'tài khoản mời thư mời mật khẩu khoá đăng xuất đăng nhập nhân viên',
    icon: Users,
    group: SETTINGS_GROUPS.org,
    permission: 'admin.users:read',
  },
  {
    key: 'org',
    label: 'Sơ đồ tổ chức',
    description: 'Cây đơn vị (công ty, khối, phòng, tổ) và người phụ trách từng đơn vị.',
    keywords: 'đơn vị phòng ban khối tổ trưởng phòng loại đơn vị cây',
    icon: Network,
    group: SETTINGS_GROUPS.org,
    permission: 'admin.org:read',
  },
  {
    key: 'positions',
    label: 'Vị trí & phân quyền',
    description: 'Mỗi vị trí là một bộ quyền; người giữ vị trí nhận đúng bộ quyền đó.',
    keywords: 'quyền phân quyền vai trò role ma trận phạm vi',
    icon: ShieldCheck,
    group: SETTINGS_GROUPS.org,
    permission: 'admin.positions:read',
  },

  {
    key: 'pipeline',
    label: 'Quy trình bán hàng',
    description: 'Các giai đoạn một cơ hội đi qua trên Kanban và điều kiện vào từng giai đoạn.',
    keywords: 'giai đoạn pipeline kanban bant cổng xác suất poc cơ hội',
    icon: Workflow,
    group: SETTINGS_GROUPS.sales,
    permission: 'settings.app:read',
  },
  {
    key: 'scoring',
    label: 'Chấm điểm cơ hội',
    description: 'Ngưỡng của bộ chấm điểm BANT + 4P và báo cáo thắng/thua.',
    keywords: 'bant 4p điểm forecast phản biện quá hạn',
    icon: Target,
    group: SETTINGS_GROUPS.sales,
    permission: 'settings.app:read',
  },
  {
    key: 'handover',
    label: 'Bàn giao',
    description: 'Hồ sơ cần đủ trước khi chuyển cơ hội đã thắng cho đội triển khai.',
    keywords: 'checklist sla bàn giao hồ sơ delivery',
    icon: PackageOpen,
    group: SETTINGS_GROUPS.sales,
    permission: 'settings.app:read',
  },

  {
    key: 'taskStatuses',
    label: 'Trạng thái công việc',
    description: 'Danh sách trạng thái ở ô Trạng thái của mọi công việc và ý nghĩa của chúng.',
    keywords: 'trạng thái công việc màu hoàn thành đang làm chờ duyệt',
    icon: CircleDot,
    group: SETTINGS_GROUPS.work,
    permission: 'settings.app:read',
  },
  {
    key: 'taskFlow',
    label: 'Quy trình công việc',
    description: 'Các bước mẫu khi công việc vào từng trạng thái.',
    keywords: 'quy trình bước mẫu công việc',
    icon: ListOrdered,
    group: SETTINGS_GROUPS.work,
    permission: 'settings.app:read',
  },
  {
    key: 'delivery',
    label: 'Triển khai dự án',
    description: 'Ngưỡng phân loại dự án lớn/nhỏ và bộ cột mẫu cho luồng việc triển khai.',
    keywords: 'triển khai dự án mô hình a b cột mẫu ngưỡng',
    icon: GanttChartSquare,
    group: SETTINGS_GROUPS.work,
    permission: 'settings.app:read',
  },

  {
    key: 'labels',
    label: 'Nhãn',
    description: 'Nhãn hai cấp dùng chung cho công việc, khách hàng, cơ hội, liên hệ và hợp đồng.',
    keywords: 'nhãn tag nhóm nhãn gộp',
    icon: Tag,
    group: SETTINGS_GROUPS.shared,
    permission: 'settings.app:read',
  },
  {
    key: 'picklists',
    label: 'Danh mục',
    description: 'Danh sách giá trị trong các ô chọn khắp ứng dụng.',
    keywords:
      'danh mục lý do thất bại nguồn khách hàng ngành nghề quy mô loại tài liệu loại tương tác nguồn cơ hội',
    icon: ListChecks,
    group: SETTINGS_GROUPS.shared,
    permission: 'settings.app:read',
  },

  {
    key: 'email',
    label: 'Email',
    description: 'Hộp thư gửi thư mời, đặt lại mật khẩu và thông báo.',
    keywords: 'email smtp gmail outlook microsoft thư google',
    icon: Mail,
    group: SETTINGS_GROUPS.integration,
    permission: 'settings.email:read',
  },
  {
    key: 'telegram',
    label: 'Telegram',
    description: 'Thông báo việc đến hạn, nhắc hẹn và giao việc vào nhóm Telegram.',
    keywords: 'telegram bot token chat id thông báo',
    icon: Send,
    group: SETTINGS_GROUPS.integration,
    permission: 'settings.telegram:read',
  },
  {
    key: 'ai',
    label: 'Trợ lý AI',
    description: 'Nhà cung cấp AI, model theo tác vụ, ghi âm và tìm kiếm web.',
    keywords: 'ai gemini claude deepseek 9router model api key ghi âm tìm web prompt',
    icon: Bot,
    group: SETTINGS_GROUPS.integration,
    permission: 'settings.ai:read',
  },

  {
    key: 'backup',
    label: 'Sao lưu',
    description: 'Một bản sao lưu, gửi tới nhiều nơi: máy chủ, Telegram và Google Drive.',
    keywords: 'sao lưu backup google drive khôi phục telegram định kỳ',
    icon: Database,
    group: SETTINGS_GROUPS.data,
    permission: 'data.export:export',
  },
  {
    key: 'export',
    label: 'Xuất dữ liệu',
    description: 'Tải dữ liệu nghiệp vụ dưới dạng JSON hoặc CSV mở bằng Excel.',
    keywords: 'xuất export csv excel json tải dữ liệu',
    icon: Download,
    group: SETTINGS_GROUPS.data,
    permission: 'data.export:export',
  },
  {
    key: 'profile',
    label: 'Hồ sơ cấu hình',
    description: 'Đóng gói cấu hình nghiệp vụ thành một tệp để chép sang bản cài khác.',
    keywords: 'hồ sơ cấu hình nhập xuất json profile',
    icon: FileJson,
    group: SETTINGS_GROUPS.data,
    permission: 'settings.app:read',
  },
  {
    key: 'shares',
    label: 'Liên kết chia sẻ',
    description: 'Các liên kết công khai đang mở; thu hồi hoặc gia hạn tại đây.',
    keywords: 'liên kết chia sẻ link công khai thu hồi gia hạn',
    icon: Share2,
    group: SETTINGS_GROUPS.data,
    permissionAny: ['documents:update', 'quotations:update', 'contracts:update'],
  },

  {
    key: 'about',
    label: 'Giới thiệu',
    description: 'Phiên bản đang chạy và lịch sử thay đổi.',
    keywords: 'giới thiệu phiên bản lịch sử thay đổi release',
    icon: Info,
    group: SETTINGS_GROUPS.system,
  },
];

/** Ten tab cu van dung duoc trong lien ket da gui va trong URL may chu tra ve. */
export const SETTINGS_TAB_ALIASES: Record<string, SettingsTab> = {
  data: 'backup',
};

export function resolveSettingsTab(raw: string | null): SettingsTab | null {
  if (!raw) return null;
  return SETTINGS_TAB_ALIASES[raw] ?? (raw as SettingsTab);
}

export function visibleSettingsTabs(
  allowed: (key: PermissionKey | undefined) => boolean
): SettingsTabDef[] {
  return SETTINGS_TABS.filter((item) =>
    item.permissionAny ? item.permissionAny.some((key) => allowed(key)) : allowed(item.permission)
  );
}

/** Bo dau va chu hoa de "sao luu" khop "Sao lưu", "dong" khop "Đóng". */
export function foldVietnamese(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

/**
 * Loc cac trang cai dat theo cum tu nguoi dung go. Moi tu phai co mat trong ten,
 * nhom, mo ta hoac tu khoa; ket qua khop ten dung len truoc.
 */
export function searchSettings(tabs: SettingsTabDef[], term: string): SettingsTabDef[] {
  const words = foldVietnamese(term).split(/\s+/).filter(Boolean);
  if (words.length === 0) return tabs;
  const scored = tabs
    .map((tab) => {
      const name = foldVietnamese(tab.label);
      const haystack = foldVietnamese(
        `${tab.label} ${tab.group} ${tab.description} ${tab.keywords}`
      );
      if (!words.every((word) => haystack.includes(word))) return null;
      const score = words.every((word) => name.includes(word)) ? 0 : 1;
      return { tab, score };
    })
    .filter((entry): entry is { tab: SettingsTabDef; score: number } => entry !== null);
  return scored.sort((a, b) => a.score - b.score).map((entry) => entry.tab);
}
