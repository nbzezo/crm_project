import {
  BarChart3,
  BellRing,
  BookA,
  BookOpen,
  BookUser,
  CalendarDays,
  CircleDollarSign,
  ClipboardCheck,
  Columns3,
  Compass,
  DatabaseBackup,
  Download,
  FileSignature,
  FileText,
  Filter,
  FolderKanban,
  FolderOpen,
  GanttChartSquare,
  Gauge,
  Handshake,
  HeartPulse,
  History,
  Keyboard,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  Mail,
  MessagesSquare,
  Mic,
  Milestone,
  Network,
  Share2,
  ShieldAlert,
  Sparkles,
  SquareKanban,
  StickyNote,
  Target,
  Trello,
  UserCog,
  Users,
  Wand2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { PermissionKey } from './permissions';
import { foldVietnamese } from './settingsNav';

/*
 * Danh muc bai huong dan su dung (1.40.0).
 *
 * Cung khuon voi lib/settingsNav.ts: mot catalog co kieu cho metadata, than bai
 * nam trong file .md rieng. Metadata o day chu khong phai frontmatter trong .md
 * vi nhu vay khong phai them mot bo doc YAML chi de biet ten mot bai.
 *
 * Tach khoi GuidePage de o tim Ctrl+K tim duoc bai huong dan ma khong keo ca
 * trang huong dan (va toan bo noi dung Markdown) vao goi chinh.
 *
 * `chapter` phai lien tuc theo thu tu mang — tieu de chuong chi ve o bai dau tien.
 */

export const GUIDE_CHAPTERS = {
  start: 'Bắt đầu',
  daily: 'Bàn làm việc',
  boards: 'Bảng – Luồng việc',
  projects: 'Dự án',
  crm: 'Khách hàng & Cơ hội',
  docs: 'Tài liệu & ghi chú',
  ai: 'Trợ lý AI',
  reports: 'Báo cáo',
  admin: 'Quản trị',
  reference: 'Tra cứu nhanh',
} as const;

export interface GuideArticle {
  /** Khong dau, khong khoang trang — cung la ten file .md va gia tri `?bai=`. */
  slug: string;
  title: string;
  /** Mot dong hien duoi tieu de bai va trong ket qua tim kiem. */
  summary: string;
  /** Tu khoa phu cho o tim — tu dong nghia, ten cu, ten nut tren man hinh. */
  keywords: string;
  icon: LucideIcon;
  chapter: string;
  /** Hien khi co MOT trong cac quyen nay; bo trong thi ai cung doc duoc. */
  permissionAny?: PermissionKey[];
}

export const GUIDE_ARTICLES: GuideArticle[] = [
  {
    slug: 'bat-dau',
    title: 'Hệ thống gồm những gì',
    summary: 'Bức tranh chung và cách các phần ghép với nhau.',
    keywords: 'bắt đầu giới thiệu tổng quan khái niệm dự án bảng công việc khách hàng cơ hội',
    icon: Compass,
    chapter: GUIDE_CHAPTERS.start,
  },
  {
    slug: 'dang-nhap',
    title: 'Đăng nhập và mật khẩu',
    summary: 'Vào hệ thống, quên mật khẩu, đổi mật khẩu và khóa màn hình.',
    keywords: 'đăng nhập mật khẩu quên thư mời email khóa màn hình pin đăng xuất',
    icon: BookOpen,
    chapter: GUIDE_CHAPTERS.start,
  },
  {
    slug: 'giao-dien-chung',
    title: 'Đi lại trong ứng dụng',
    summary: 'Thanh bên, thanh trên, tìm kiếm nhanh, thông báo và chế độ sáng tối.',
    keywords:
      'thanh bên sidebar thanh trên topbar tìm kiếm ctrl k chuông thông báo giao diện tối sáng',
    icon: LayoutDashboard,
    chapter: GUIDE_CHAPTERS.start,
  },
  {
    slug: 'tong-quan',
    title: 'Trang Tổng quan',
    summary: 'Sáu chỉ số đầu trang và các ô cảnh báo nghĩa là gì.',
    keywords: 'tổng quan dashboard chỉ số pipeline weighted việc quá hạn cơ hội cần chú ý',
    icon: Gauge,
    chapter: GUIDE_CHAPTERS.start,
  },

  {
    slug: 'bang-tin',
    title: 'Bảng tin và nhóm',
    summary: 'Đăng bài, bình luận, đính kèm và nhóm làm việc.',
    keywords: 'bảng tin feed bài viết bình luận nhóm ảnh đính kèm xem trước link',
    icon: MessagesSquare,
    chapter: GUIDE_CHAPTERS.daily,
  },
  {
    slug: 'cong-viec',
    title: 'Công việc',
    summary: 'Dạng cây và dạng bảng tính, việc con, trạng thái, người duyệt, việc lặp lại.',
    keywords:
      'công việc task dạng cây bảng tính việc con trạng thái người phụ trách người duyệt lặp lại hạn',
    icon: ListChecks,
    chapter: GUIDE_CHAPTERS.daily,
  },
  {
    slug: 'nhac-nguoi-khac',
    title: 'Nhắc người khác',
    summary: 'Gom việc quá hạn, đang chờ, và ghi nhật ký đã nhắc ai lúc nào.',
    keywords: 'nhắc người khác follow up theo dõi quá hạn chờ khách bị chặn nhật ký nhắc zalo',
    icon: BellRing,
    chapter: GUIDE_CHAPTERS.daily,
  },
  {
    slug: 'lich-nhac-hen',
    title: 'Lịch và nhắc hẹn',
    summary: 'Xem việc theo lịch, đặt nhắc hẹn và popup nhắc đúng giờ.',
    keywords: 'lịch calendar nhắc hẹn reminder popup đến hạn sự kiện',
    icon: CalendarDays,
    chapter: GUIDE_CHAPTERS.daily,
  },
  {
    slug: 'hieu-suat',
    title: 'Bàn làm việc và Hiệu suất',
    summary: 'Màn hình gom việc trong ngày và thước đo khối lượng của từng người.',
    keywords: 'hiệu suất bàn làm việc thông lượng khối lượng trọng tâm ưu tiên hôm nay',
    icon: BarChart3,
    chapter: GUIDE_CHAPTERS.daily,
  },
  {
    slug: 'danh-ba-ca-nhan',
    title: 'Danh bạ cá nhân',
    summary: 'Sổ liên hệ riêng của bạn, nhập từ Google hoặc từ tệp.',
    keywords: 'danh bạ cá nhân liên hệ google nhập csv vcard',
    icon: BookUser,
    chapter: GUIDE_CHAPTERS.daily,
  },

  {
    slug: 'bang-luong-viec',
    title: 'Bảng và luồng việc',
    summary: 'Tạo bảng, thêm cột, kéo thả thẻ, đổi phông nền.',
    keywords: 'bảng board luồng việc cột danh sách thẻ kéo thả phông nền lưu trữ gắn sao kanban',
    icon: Trello,
    chapter: GUIDE_CHAPTERS.boards,
  },
  {
    slug: 'the-cong-viec',
    title: 'Cửa sổ thẻ',
    summary: 'Mọi thứ bên trong một thẻ: ngày, ưu tiên, nhãn, việc cần làm, đính kèm, nhận xét.',
    keywords:
      'thẻ card mô tả ngày hạn ưu tiên nhãn checklist việc cần làm đính kèm nhận xét hoạt động',
    icon: SquareKanban,
    chapter: GUIDE_CHAPTERS.boards,
  },
  {
    slug: 'cot-va-quy-trinh',
    title: 'Cột, trạng thái và quy trình',
    summary: 'Cho cột một ý nghĩa, và chia một trạng thái thành các bước.',
    keywords: 'cột nghĩa là trạng thái ánh xạ quy trình bước card flow vòng đời',
    icon: Columns3,
    chapter: GUIDE_CHAPTERS.boards,
  },
  {
    slug: 'loc-va-dang-xem',
    title: 'Bộ lọc và bốn dạng xem',
    summary: 'Lọc thẻ ngay trên bảng, và chuyển giữa Bảng, Lịch, Dòng thời gian, Bảng tính.',
    keywords: 'bộ lọc filter dạng xem kanban lịch dòng thời gian bảng tính chuyển dạng xem',
    icon: Filter,
    chapter: GUIDE_CHAPTERS.boards,
  },

  {
    slug: 'du-an',
    title: 'Dự án',
    summary: 'Ngày kế hoạch cạnh ngày thực tế, ngân sách, và sức khỏe xanh vàng đỏ.',
    keywords: 'dự án project chủ dự án ngân sách sức khỏe kế hoạch thực tế nhân sự',
    icon: FolderKanban,
    chapter: GUIDE_CHAPTERS.projects,
  },
  {
    slug: 'giai-doan-model',
    title: 'Giai đoạn và Model A/B',
    summary: 'Gắn mốc bàn giao cho từng luồng việc, và chọn mẫu dự án lớn hay nhỏ.',
    keywords: 'giai đoạn mốc bàn giao model a model b p01 p09 ngưỡng triển khai lý do',
    icon: Milestone,
    chapter: GUIDE_CHAPTERS.projects,
  },
  {
    slug: 'so-rui-ro',
    title: 'Sổ rủi ro',
    summary: 'Một sổ cho rủi ro, vấn đề, yêu cầu thay đổi và quyết định.',
    keywords: 'sổ rủi ro risk register vấn đề issue change request quyết định nghiêm trọng',
    icon: ShieldAlert,
    chapter: GUIDE_CHAPTERS.projects,
  },
  {
    slug: 'dong-thoi-gian',
    title: 'Dòng thời gian và phụ thuộc',
    summary: 'Gantt, việc trước việc sau, và con số trượt hạn.',
    keywords:
      'dòng thời gian gantt phụ thuộc finish to start trượt hạn dời hạn ước lượng mốc quan trọng',
    icon: GanttChartSquare,
    chapter: GUIDE_CHAPTERS.projects,
  },

  {
    slug: 'khach-hang',
    title: 'Khách hàng và người liên hệ',
    summary: 'Hồ sơ công ty, người liên hệ, và sổ danh bạ dùng chung.',
    keywords:
      'khách hàng account công ty người liên hệ contact tổ chức nhân sự đối tác nhà cung cấp mst',
    icon: Users,
    chapter: GUIDE_CHAPTERS.crm,
  },
  {
    slug: 'co-hoi',
    title: 'Cơ hội bán hàng',
    summary: 'Pipeline, giai đoạn, Next Action, tạm dừng và cách chốt.',
    keywords: 'cơ hội deal opportunity pipeline giai đoạn stage next action xác suất tạm dừng',
    icon: Target,
    chapter: GUIDE_CHAPTERS.crm,
  },
  {
    slug: 'danh-gia-co-hoi',
    title: 'Đánh giá cơ hội',
    summary: 'BANT và 4P, bằng chứng bắt buộc, cổng giai đoạn, chế độ Cơ bản và Nâng cao.',
    keywords:
      'đánh giá chấm điểm bant 4p bằng chứng ô ma trận phủ quyết veto cổng giai đoạn cơ bản nâng cao',
    icon: ClipboardCheck,
    chapter: GUIDE_CHAPTERS.crm,
  },
  {
    slug: 'suc-khoe-pipeline',
    title: 'Sức khỏe pipeline',
    summary: 'Hai con số forecast đặt cạnh nhau, và phiên rà soát.',
    keywords: 'sức khỏe pipeline forecast thổi phồng ma trận phân tán phiên rà soát',
    icon: HeartPulse,
    chapter: GUIDE_CHAPTERS.crm,
  },
  {
    slug: 'lich-su-tuong-tac',
    title: 'Lịch sử tương tác',
    summary: 'Ghi lại mọi lần trao đổi và tạo luôn việc tiếp theo.',
    keywords: 'lịch sử tương tác gọi email gặp mặt demo proposal follow up zalo kết quả',
    icon: History,
    chapter: GUIDE_CHAPTERS.crm,
  },
  {
    slug: 'bao-gia-hop-dong',
    title: 'Báo giá và hợp đồng',
    summary: 'Phiên bản báo giá, hiệu lực hợp đồng và đếm ngược gia hạn.',
    keywords: 'báo giá quotation hợp đồng contract phiên bản hiệu lực gia hạn hết hạn 30 60 90',
    icon: FileSignature,
    chapter: GUIDE_CHAPTERS.crm,
  },
  {
    slug: 'doanh-thu',
    title: 'Doanh thu',
    summary: 'Bảng 12 tháng, vòng đời của một khoản tiền và các bộ lọc.',
    keywords:
      'doanh thu revenue 12 tháng dự kiến đối soát xuất hóa đơn thanh toán công nợ am dịch vụ',
    icon: CircleDollarSign,
    chapter: GUIDE_CHAPTERS.crm,
  },
  {
    slug: 'ban-giao',
    title: 'Bàn giao và SLA',
    summary: 'Checklist sau khi chốt, và cảnh báo khi quá hạn bàn giao.',
    keywords: 'bàn giao handover checklist sla cảnh báo nghiêm trọng sau khi chốt',
    icon: Handshake,
    chapter: GUIDE_CHAPTERS.crm,
  },

  {
    slug: 'tai-lieu',
    title: 'Tệp tài liệu',
    summary: 'Tải lên, gắn vào hồ sơ và tìm không dấu.',
    keywords: 'tài liệu document tệp tải lên pdf word excel đính kèm loại tài liệu 25 mb',
    icon: FolderOpen,
    chapter: GUIDE_CHAPTERS.docs,
  },
  {
    slug: 'ghi-chu-hop',
    title: 'Ghi chú họp',
    summary: 'Soạn thảo theo khối, chèn sơ đồ, nhắc tên và gắn công việc.',
    keywords: 'ghi chú họp meeting notes blocknote sơ đồ logic tư duy mindmap nhắc tên tóm tắt ai',
    icon: FileText,
    chapter: GUIDE_CHAPTERS.docs,
  },
  {
    slug: 'ghi-chu-nhanh',
    title: 'Ghi chú nhanh',
    summary: 'Sổ tay dán giấy: ghim, nhãn, màu, nhắc hẹn và chuyển thành việc.',
    keywords: 'ghi chú nhanh quick notes ghim nhãn màu thùng rác lưu trữ chuyển thành công việc',
    icon: StickyNote,
    chapter: GUIDE_CHAPTERS.docs,
  },
  {
    slug: 'ghi-am',
    title: 'Ghi âm thành văn bản',
    summary: 'Ghi từ micro rồi để AI chuyển thành chữ hoặc tóm tắt theo mẫu.',
    keywords: 'ghi âm micro voice to text chuyển nguyên văn tóm tắt mẫu gemini',
    icon: Mic,
    chapter: GUIDE_CHAPTERS.docs,
  },
  {
    slug: 'chia-se-link',
    title: 'Chia sẻ link công khai',
    summary: 'Cho người ngoài xem một tài liệu, báo giá hay hợp đồng mà không cần tài khoản.',
    keywords: 'chia sẻ link công khai share token chỉ xem thu hồi hết hạn qr',
    icon: Share2,
    chapter: GUIDE_CHAPTERS.docs,
  },

  {
    slug: 'tro-ly-ai',
    title: 'Trợ lý AI',
    summary: 'Bảng chat nhanh, hỏi đáp dữ liệu và soạn việc từ một đoạn nháp.',
    keywords: 'trợ lý ai copilot chat hỏi đáp crm soạn việc nhanh tóm tắt brief quota',
    icon: Sparkles,
    chapter: GUIDE_CHAPTERS.ai,
  },
  {
    slug: 'ai-nhap-lieu',
    title: 'AI hỗ trợ nhập liệu',
    summary: 'Gợi ý điền nốt một biểu mẫu, và đọc tài liệu để rút thông tin.',
    keywords: 'ai gợi ý điền tự động đọc tài liệu rút metadata duyệt trước khi lưu',
    icon: Wand2,
    chapter: GUIDE_CHAPTERS.ai,
  },

  {
    slug: 'bao-cao',
    title: 'Báo cáo',
    summary: 'Báo cáo công việc, báo cáo theo người và báo cáo riêng của từng nhóm.',
    keywords: 'báo cáo report biểu đồ thông lượng theo người kỳ báo cáo trọng tâm',
    icon: BarChart3,
    chapter: GUIDE_CHAPTERS.reports,
  },
  {
    slug: 'xuat-du-lieu',
    title: 'Xuất dữ liệu',
    summary: 'Lấy dữ liệu ra CSV hoặc JSON để mở bằng Excel.',
    keywords: 'xuất dữ liệu export csv json excel tải về',
    icon: Download,
    chapter: GUIDE_CHAPTERS.reports,
  },

  {
    slug: 'qt-nguoi-dung',
    title: 'Người dùng và thư mời',
    summary: 'Tạo tài khoản, gửi lại thư mời, khóa và mở khóa.',
    keywords: 'quản trị người dùng tài khoản thư mời khóa mở khóa đăng xuất mọi thiết bị',
    icon: UserCog,
    chapter: GUIDE_CHAPTERS.admin,
    permissionAny: ['admin.users:read'],
  },
  {
    slug: 'qt-phan-quyen',
    title: 'Tổ chức, vị trí và phân quyền',
    summary: 'Cây đơn vị, ma trận quyền, năm mức phạm vi và cách bàn giao dữ liệu.',
    keywords:
      'phân quyền sơ đồ tổ chức đơn vị vị trí ma trận phạm vi của mình cây toàn công ty kiêm nhiệm',
    icon: Network,
    chapter: GUIDE_CHAPTERS.admin,
    permissionAny: ['admin.org:read', 'admin.positions:read'],
  },
  {
    slug: 'qt-danh-muc',
    title: 'Danh mục và quy trình',
    summary: 'Sửa giai đoạn bán hàng, trạng thái công việc và các danh mục mà không cần lập trình.',
    keywords:
      'danh mục picklist quy trình bán hàng giai đoạn trạng thái công việc nhãn gộp ẩn chấm điểm bàn giao triển khai',
    icon: FolderKanban,
    chapter: GUIDE_CHAPTERS.admin,
    permissionAny: ['settings.app:read'],
  },
  {
    slug: 'qt-ket-noi',
    title: 'Email, Telegram và Google Drive',
    summary: 'Khai báo SMTP, bật đẩy tin qua bot và sao lưu ra ngoài máy chủ.',
    keywords:
      'email smtp telegram bot chat id google drive oauth sao lưu đẩy thông báo địa chỉ ứng dụng',
    icon: Mail,
    chapter: GUIDE_CHAPTERS.admin,
    permissionAny: ['settings.email:read', 'settings.telegram:read', 'settings.ai:read'],
  },
  {
    slug: 'qt-sao-luu',
    title: 'Sao lưu và hồ sơ cấu hình',
    summary: 'Sao lưu một chạm, khôi phục, và chuyển cấu hình sang bản cài khác.',
    keywords: 'sao lưu backup khôi phục hồ sơ cấu hình profile json xuất nhập liên kết chia sẻ',
    icon: DatabaseBackup,
    chapter: GUIDE_CHAPTERS.admin,
    permissionAny: ['settings.app:read', 'data.export:export'],
  },

  {
    slug: 'phim-tat',
    title: 'Phím tắt',
    summary: 'Toàn bộ phím tắt có trong hệ thống.',
    keywords: 'phím tắt shortcut ctrl k ctrl b bàn phím',
    icon: Keyboard,
    chapter: GUIDE_CHAPTERS.reference,
  },
  {
    slug: 'thuat-ngu',
    title: 'Thuật ngữ',
    summary: 'Một khái niệm chỉ có một tên — bảng tra tên gọi trong sản phẩm.',
    keywords:
      'thuật ngữ từ điển glossary next action pipeline bant 4p poc veto giai đoạn luồng việc',
    icon: BookA,
    chapter: GUIDE_CHAPTERS.reference,
  },
  {
    slug: 'khac-phuc-su-co',
    title: 'Khắc phục sự cố',
    summary: 'Những lỗi hay gặp và cách tự xử lý trước khi gọi quản trị.',
    keywords: 'lỗi sự cố không thấy dữ liệu không có quyền ai lỗi không gửi được email chậm',
    icon: LifeBuoy,
    chapter: GUIDE_CHAPTERS.reference,
  },
];

export function visibleGuideArticles(
  allowed: (key: PermissionKey | undefined) => boolean
): GuideArticle[] {
  return GUIDE_ARTICLES.filter(
    (article) => !article.permissionAny || article.permissionAny.some((key) => allowed(key))
  );
}

export function resolveGuideSlug(raw: string | null, articles: GuideArticle[]): string | null {
  if (!raw) return null;
  return articles.some((article) => article.slug === raw) ? raw : null;
}

export function articleMeta(article: GuideArticle): string {
  return foldVietnamese(
    `${article.title} ${article.chapter} ${article.summary} ${article.keywords}`
  );
}

/**
 * Tim bai theo TEN va TU KHOA, khong cham than bai.
 *
 * Day la ban dung cho Ctrl+K: o tim toan cuc nam trong goi chinh, nen no khong
 * duoc phep keo toan bo noi dung Markdown vao theo. Trang Huong dan dung ban
 * quet ca than bai trong lib/guideBodies.ts.
 */
export function searchGuideMeta(articles: GuideArticle[], term: string): GuideArticle[] {
  const words = foldVietnamese(term).split(/\s+/).filter(Boolean);
  if (words.length === 0) return articles;
  const scored: { article: GuideArticle; score: number }[] = [];
  for (const article of articles) {
    const meta = articleMeta(article);
    if (!words.every((word) => meta.includes(word))) continue;
    const title = foldVietnamese(article.title);
    scored.push({ article, score: words.every((word) => title.includes(word)) ? 0 : 1 });
  }
  return scored.sort((a, b) => a.score - b.score).map((entry) => entry.article);
}

/*
 * Nut "?" tren thanh tren mo dung bai cua man hinh dang xem.
 *
 * Khop theo doan dau cua duong dan (dai truoc ngan sau), nen /deals/12 va
 * /customers/3 deu co bai cua minh ma khong phai liet ke tung id.
 */
export const ROUTE_TO_ARTICLE: { prefix: string; slug: string }[] = [
  { prefix: '/feed', slug: 'bang-tin' },
  { prefix: '/tasks', slug: 'cong-viec' },
  { prefix: '/follow-up', slug: 'nhac-nguoi-khac' },
  { prefix: '/calendar', slug: 'lich-nhac-hen' },
  { prefix: '/performance', slug: 'hieu-suat' },
  { prefix: '/my-contacts', slug: 'danh-ba-ca-nhan' },
  { prefix: '/boards', slug: 'bang-luong-viec' },
  { prefix: '/timeline', slug: 'dong-thoi-gian' },
  { prefix: '/projects', slug: 'du-an' },
  { prefix: '/customers', slug: 'khach-hang' },
  { prefix: '/org-directory', slug: 'khach-hang' },
  { prefix: '/pipeline-health', slug: 'suc-khoe-pipeline' },
  { prefix: '/pipeline', slug: 'co-hoi' },
  { prefix: '/deals', slug: 'co-hoi' },
  { prefix: '/contracts', slug: 'bao-gia-hop-dong' },
  { prefix: '/revenue', slug: 'doanh-thu' },
  { prefix: '/documents', slug: 'tai-lieu' },
  { prefix: '/ai', slug: 'tro-ly-ai' },
  { prefix: '/reports', slug: 'bao-cao' },
  { prefix: '/settings', slug: 'qt-danh-muc' },
];

export const GUIDE_HOME_SLUG = 'bat-dau';

export function articleForRoute(pathname: string): string {
  const match = ROUTE_TO_ARTICLE.filter(
    (entry) => pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`)
  ).sort((a, b) => b.prefix.length - a.prefix.length)[0];
  return match?.slug ?? GUIDE_HOME_SLUG;
}
