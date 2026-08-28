import type {
  CalEventStatus,
  CalEventType,
  ContractKind,
  ContractTerm,
  InteractionType,
  Priority,
  RevenueStage,
  ServiceStatus,
  Stage,
} from '../types';

export { STAGE_PROBABILITY } from '@workflow/contracts';

export const t = {
  app: {
    name: 'WorkFlow',
    tagline: 'Quản lý công việc & khách hàng',
  },
  nav: {
    dashboard: 'Tổng quan',
    boards: 'Bảng công việc',
    projects: 'Dự án',
    customers: 'Khách hàng',
    pipeline: 'Cơ hội bán hàng',
    pipelineHealth: 'Sức khỏe pipeline',
    contracts: 'Hợp đồng',
    revenue: 'Doanh thu',
    documents: 'Tài liệu',
    calendar: 'Lịch',
    timeline: 'Dòng thời gian',
    reports: 'Báo cáo',
    tasks: 'Công việc',
    followUp: 'Theo dõi tiến độ',
    orgDirectory: 'Tổ chức & nhân sự',
    ai: 'Trợ lý AI',
    notes: 'Ghi chú',
    quickNotes: 'Ghi chú nhanh',
    settings: 'Cài đặt',
    groupWork: 'Công việc',
    groupSales: 'CRM & tổ chức',
    groupInsights: 'Phân tích & công cụ',
  },
  common: {
    add: 'Thêm',
    save: 'Lưu',
    cancel: 'Hủy',
    close: 'Đóng',
    delete: 'Xóa',
    edit: 'Sửa',
    search: 'Tìm kiếm',
    loading: 'Đang tải…',
    error: 'Đã xảy ra lỗi',
    empty: 'Chưa có dữ liệu',
    all: 'Tất cả',
    none: 'Không có',
    confirmDelete: 'Bạn có chắc muốn xóa?',
    yes: 'Đồng ý',
    no: 'Không',
    today: 'Hôm nay',
    overdue: 'Quá hạn',
    done: 'Hoàn thành',
    open: 'Đang mở',
    optional: 'không bắt buộc',
    saving: 'Đang lưu…',
    saveError: 'Lưu không thành công. Vui lòng thử lại.',
    loadError: 'Không tải được dữ liệu.',
    retry: 'Thử lại',
    required: 'Trường này là bắt buộc',
    undo: 'Hoàn tác',
    selectCustomer: '— chọn khách hàng —',
    selectPlaceholder: '— chọn —',
    unsavedTitle: 'Thoát mà không lưu?',
    unsavedBody: 'Bạn có thay đổi chưa được lưu. Đóng lại sẽ mất những thay đổi này.',
    discard: 'Bỏ thay đổi',
    keepEditing: 'Tiếp tục sửa',
    clearFilter: 'Xóa bộ lọc',
    selected: 'đã chọn',
    selectAll: 'Chọn tất cả',
    clearSelection: 'Bỏ chọn',
    openMenu: 'Mở menu điều hướng',
    closeMenu: 'Đóng menu điều hướng',
  },
  auth: {
    signInTitle: 'Đăng nhập WorkFlow',
    signInSubtitle: 'Nhập tài khoản để tiếp tục',
    username: 'Tên đăng nhập',
    password: 'Mật khẩu',
    signIn: 'Đăng nhập',
    signingIn: 'Đang đăng nhập…',
    signOut: 'Đăng xuất',
    signInFailed: 'Sai tên đăng nhập hoặc mật khẩu',
    sessionExpired: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại',
    changePassword: 'Đổi mật khẩu',
    currentPassword: 'Mật khẩu hiện tại',
    newPassword: 'Mật khẩu mới',
    newPasswordHint: 'Ít nhất 8 ký tự',
    passwordChanged: 'Đã đổi mật khẩu',
  },
  routeError: {
    /* Loi tai chunk: hay gap nhat khi deploy ban moi trong luc tab dang mo — ban
       cu tro toi file .js da bi thay the. Nguoi dung chi can tai lai trang. */
    staleTitle: 'Ứng dụng vừa được cập nhật',
    staleBody:
      'Phiên bản bạn đang mở không còn khớp với máy chủ. Tải lại trang để dùng bản mới nhất; dữ liệu đã lưu không bị ảnh hưởng.',
    crashTitle: 'Trang này gặp lỗi',
    crashBody:
      'Không hiển thị được nội dung. Bạn có thể tải lại trang, hoặc quay về Tổng quan rồi thử lại.',
    notFoundTitle: 'Không tìm thấy trang',
    notFoundBody: 'Đường dẫn này không tồn tại hoặc đã được đổi. Hãy chọn một mục ở thanh bên.',
    reload: 'Tải lại trang',
    home: 'Về Tổng quan',
    details: 'Chi tiết kỹ thuật',
  },
  priority: {
    low: 'Thấp',
    medium: 'Trung bình',
    high: 'Cao',
    urgent: 'Khẩn cấp',
  } as Record<Priority, string>,
  /** 7 giai đoạn pipeline theo BRD mục 9. */
  stage: {
    lead: 'Tiềm năng',
    approaching: 'Đang tiếp cận',
    discussing: 'Đang trao đổi',
    poc: 'PoC / Thử nghiệm',
    quoted: 'Gửi báo giá',
    negotiating: 'Đàm phán',
    won: 'Thành công',
    lost: 'Thất bại',
  } as Record<Stage, string>,
  interactionType: {
    call: 'Gọi điện',
    email: 'Email',
    meeting: 'Gặp mặt',
    demo: 'Demo',
    proposal: 'Proposal',
    followup: 'Follow-up',
    note: 'Ghi chú',
    zalo: 'Zalo',
    other: 'Khác',
  } as Record<InteractionType, string>,
  /** FR-OPP-07 — danh sách lý do thua bắt buộc chọn. */
  lostReason: {
    price: 'Giá cao',
    competitor: 'Có đối thủ tốt hơn',
    no_budget: 'Không có ngân sách',
    project_stopped: 'Dừng dự án',
    solution_mismatch: 'Không phù hợp giải pháp',
    requirement_unmet: 'Không đáp ứng yêu cầu',
    no_contact: 'Không liên hệ được',
    bad_timing: 'Thời điểm chưa phù hợp',
    self_build: 'Khách hàng tự triển khai',
    other: 'Khác',
  } as Record<string, string>,
  accountStatus: {
    prospect: 'Tiềm năng',
    customer: 'Khách hàng',
    inactive: 'Ngừng hợp tác',
  } as Record<string, string>,
  contractStatus: {
    draft: 'Nháp',
    signing: 'Đang ký',
    active: 'Đang hiệu lực',
    expired: 'Hết hạn',
    terminated: 'Đã chấm dứt',
  } as Record<string, string>,
  quotationStatus: {
    draft: 'Nháp',
    sent: 'Đã gửi',
    reviewing: 'Khách đang xem xét',
    revision: 'Yêu cầu chỉnh sửa',
    accepted: 'Chấp nhận',
    rejected: 'Từ chối',
  } as Record<string, string>,
  docType: {
    proposal: 'Proposal',
    quotation: 'Báo giá',
    contract: 'Hợp đồng',
    nda: 'NDA',
    meeting_minute: 'Biên bản họp',
    requirement: 'Yêu cầu khách hàng',
    profile: 'Hồ sơ năng lực',
    other: 'Khác',
  } as Record<string, string>,
  /** Doanh thu khách hàng hiện hữu. */
  revenue: {
    title: 'Doanh thu khách hàng hiện hữu',
    subtitle: 'Theo dõi kế hoạch, đối soát, hóa đơn và thu tiền.',
    line: 'Dòng doanh thu',
    newLine: 'Thêm doanh thu',
    service: 'Dịch vụ sử dụng',
    services: 'Danh mục dịch vụ',
    am: 'AM',
    contractKind: 'Loại hợp đồng',
    contractTerm: 'Thời hạn HĐ.',
    status: 'Tình trạng hợp đồng',
    total: 'Doanh thu',
    grandTotal: 'Tổng doanh thu',
    year: 'Năm',
    month: 'Tháng',
    enterMonths: 'Nhập doanh thu 12 tháng',
    noLines:
      'Chưa có dòng doanh thu nào. Thêm khách hàng đang sử dụng dịch vụ để bắt đầu theo dõi.',
    noResults: 'Không tìm thấy dữ liệu phù hợp',
    collectRate: 'Tỷ lệ thu tiền',
    remaining: 'Còn phải thu',
    stage: 'Trạng thái doanh thu',
    amount: 'Doanh thu thực tế',
    forecast: 'Dự kiến ban đầu',
    variance: 'Chênh lệch so với dự kiến',
    setStageForMonth: 'Chuyển trạng thái cả tháng',
    guide: 'Nhập doanh thu theo tháng · Bấm trạng thái để cập nhật tiến độ',
    guideFlow: 'Dự kiến → Đối soát → Xuất hóa đơn → Đã thu tiền',
    searchPlaceholder: 'Tìm khách hàng…',
  },
  /** Giai đoạn của một khoản doanh thu — chuyển tiếp, không cộng dồn thành nhiều khoản. */
  revenueStage: {
    forecast: 'Dự kiến',
    reconciled: 'Đã đối soát',
    invoiced: 'Đã xuất hóa đơn',
    paid: 'Đã thanh toán',
  } as Record<string, string>,
  revenueStageShort: {
    forecast: 'Dự kiến',
    reconciled: 'Đối soát',
    invoiced: 'Đã XHĐ',
    paid: 'Đã TT',
  } as Record<string, string>,
  /** Tổng lũy kế theo phễu: đã thanh toán thì đương nhiên đã đối soát và đã XHĐ. */
  revenueFunnel: {
    amount: 'Tổng doanh thu',
    reconciled: 'Đã đối soát',
    invoiced: 'Đã xuất hóa đơn',
    paid: 'Đã thu tiền',
  } as Record<string, string>,
  /** Chú thích ngắn cho KPI lũy kế — giải thích một khoản "đã XHĐ" cũng tính cả khoản đã thu tiền. */
  revenueFunnelHint: {
    reconciled: 'Bao gồm các khoản đã chuyển sang các bước sau đối soát.',
    invoiced: 'Bao gồm các khoản đã xuất hóa đơn hoặc đã thanh toán.',
  } as Record<string, string>,
  contractKind: {
    new: 'Mới',
    expansion: 'Mở rộng',
  } as Record<string, string>,
  contractTerm: {
    long: 'Lâu dài',
    short: 'Ngắn hạn',
    trial: 'Dùng thử',
    other: 'Khác',
  } as Record<string, string>,
  serviceStatus: {
    using: 'Đang sử dụng',
    pending: 'Chờ triển khai',
    paused: 'Tạm dừng',
    stopped: 'Đã ngừng',
  } as Record<string, string>,
  service: {
    name: 'Tên dịch vụ',
    code: 'Mã dịch vụ',
    category: 'Nhóm dịch vụ',
    unit: 'Đơn vị tính',
    defaultPrice: 'Đơn giá tham khảo',
    active: 'Đang cung cấp',
    newService: 'Thêm dịch vụ',
    manage: 'Quản lý dịch vụ',
    noServices: 'Chưa có dịch vụ nào trong danh mục.',
    inUse: 'đang dùng',
  },
  buyingRole: {
    decision_maker: 'Người quyết định',
    economic_buyer: 'Người duyệt ngân sách',
    influencer: 'Người ảnh hưởng',
    technical: 'Kỹ thuật',
    procurement: 'Mua hàng',
    finance: 'Tài chính',
    legal: 'Pháp chế',
    user: 'Người dùng cuối',
    other: 'Khác',
  } as Record<string, string>,
  relationship: {
    excellent: 'Rất tốt',
    good: 'Tốt',
    normal: 'Bình thường',
    new: 'Chưa tiếp cận',
    difficult: 'Không thuận lợi',
  } as Record<string, string>,
  board: {
    newBoard: 'Tạo bảng mới',
    boardName: 'Tên bảng',
    addList: 'Thêm danh sách',
    listName: 'Tên danh sách',
    addCard: 'Thêm thẻ',
    cardTitle: 'Tiêu đề thẻ',
    archived: 'Đã lưu trữ',
    archive: 'Lưu trữ',
    unarchive: 'Bỏ lưu trữ',
    linkedCustomer: 'Khách hàng liên quan',
    noBoards: 'Chưa có bảng nào. Tạo bảng đầu tiên để bắt đầu.',
  },
  card: {
    description: 'Mô tả',
    descriptionPlaceholder: 'Thêm mô tả chi tiết hơn…',
    startDate: 'Ngày bắt đầu',
    dueDate: 'Hạn hoàn thành',
    priority: 'Mức độ ưu tiên',
    customer: 'Khách hàng',
    deal: 'Cơ hội bán hàng',
    labels: 'Nhãn',
    checklist: 'Việc cần làm',
    addChecklistItem: 'Thêm mục',
    markDone: 'Đánh dấu hoàn thành',
    markUndone: 'Bỏ đánh dấu hoàn thành',
    addReminder: 'Thêm nhắc hẹn',
    deleteCard: 'Xóa thẻ',
    inList: 'trong danh sách',
    assignee: 'Người phụ trách',
    unassigned: 'Chưa giao',
    mine: 'Việc của tôi',
  },

  /**
   * Vòng đời công việc (v16).
   *
   * `waiting_customer` và `blocked` là lý do tồn tại của danh sách này: việc đang
   * chờ bên ngoài không phải việc bị bỏ quên, và phân biệt được mới biết nhắc ai.
   */
  cardStatus: {
    todo: 'Chưa bắt đầu',
    doing: 'Đang làm',
    waiting_customer: 'Chờ khách phản hồi',
    blocked: 'Bị chặn',
    review: 'Chờ duyệt',
    done: 'Hoàn thành',
  } as Record<string, string>,

  projectStatus: {
    planning: 'Đang lập kế hoạch',
    active: 'Đang triển khai',
    on_hold: 'Tạm dừng',
    done: 'Đã hoàn thành',
    cancelled: 'Đã hủy',
  } as Record<string, string>,

  /** Sức khỏe dự án — tính khi đọc, không bao giờ lưu (xem projectService.ts). */
  projectHealth: {
    unknown: 'Chưa đủ dữ liệu',
    green: 'Đúng kế hoạch',
    amber: 'Cần theo dõi',
    red: 'Có rủi ro',
  } as Record<string, string>,

  /** Sổ rủi ro của dự án (v26) — một bảng cho bốn loại. */
  riskKind: {
    risk: 'Rủi ro',
    issue: 'Vấn đề',
    change: 'Đề nghị thay đổi',
    decision: 'Quyết định',
  } as Record<string, string>,

  riskSeverity: {
    low: 'Thấp',
    medium: 'Trung bình',
    high: 'Cao',
  } as Record<string, string>,

  riskStatus: {
    open: 'Đang mở',
    mitigating: 'Đang xử lý',
    closed: 'Đã đóng',
  } as Record<string, string>,

  /** Hai mô hình quản lý triển khai của đặc tả 6.2. */
  deliveryModel: {
    A: 'Mô hình A — bảng dự án riêng',
    B: 'Mô hình B — bảng triển khai chung',
  } as Record<string, string>,

  /** Trạng thái mốc của một giai đoạn — suy ra khi đọc. */
  milestoneState: {
    none: 'Chưa đặt mốc',
    done: 'Đã xong',
    overdue: 'Trễ hạn',
    due_soon: 'Sắp đến hạn',
    on_track: 'Đúng tiến độ',
  } as Record<string, string>,

  nudgeChannel: {
    zalo: 'Zalo',
    email: 'Email',
    call: 'Gọi điện',
    meeting: 'Gặp mặt',
    other: 'Khác',
  } as Record<string, string>,

  /** Loại tổ chức trong sổ danh bạ — chỉ `customer` nằm trong pipeline CRM. */
  orgKind: {
    own: 'Công ty tôi',
    customer: 'Khách hàng',
    partner: 'Đối tác',
    vendor: 'Nhà cung cấp',
  } as Record<string, string>,
  customer: {
    newCustomer: 'Thêm khách hàng',
    name: 'Tên công ty',
    taxCode: 'Mã số thuế',
    industry: 'Ngành nghề',
    address: 'Địa chỉ',
    website: 'Website',
    phone: 'Điện thoại',
    email: 'Email',
    status: 'Trạng thái',
    active: 'Đang hợp tác',
    inactive: 'Ngừng hợp tác',
    notes: 'Ghi chú',
    contacts: 'Người liên hệ',
    info: 'Thông tin',
    deals: 'Cơ hội',
    interactions: 'Lịch sử tương tác',
    tasks: 'Công việc',
    totalWon: 'Đã chốt',
    openPipeline: 'Đang theo đuổi',
    noCustomers: 'Chưa có khách hàng nào.',
    shortName: 'Tên viết tắt',
    size: 'Quy mô',
    source: 'Nguồn',
    duplicateWarning: 'Có thể trùng với khách hàng đã có:',
    duplicateHint: 'Tên hoặc website tương tự vẫn có thể lưu; mã số thuế trùng sẽ bị chặn.',
    revenue: 'Doanh thu',
  },
  contact: {
    fullName: 'Họ và tên',
    title: 'Chức vụ',
    primary: 'Liên hệ chính',
    zalo: 'Zalo',
    addContact: 'Thêm người liên hệ',
  },
  deal: {
    newDeal: 'Thêm cơ hội',
    title: 'Tên cơ hội',
    value: 'Giá trị (VNĐ)',
    expectedClose: 'Dự kiến chốt',
    lostReason: 'Lý do thất bại',
    stage: 'Giai đoạn',
    notes: 'Ghi chú',
    noDeals: 'Chưa có cơ hội nào.',
  },
  contract: {
    newContract: 'Thêm hợp đồng',
    name: 'Tên hợp đồng',
    number: 'Số hợp đồng',
    relatedDeal: 'Cơ hội liên quan',
    paymentTerms: 'Điều khoản thanh toán',
    signDate: 'Ngày ký',
    startDate: 'Ngày bắt đầu',
    endDate: 'Ngày kết thúc',
  },
  quotation: {
    newQuotation: 'Thêm báo giá',
    code: 'Mã báo giá',
    quoteDate: 'Ngày báo giá',
    validUntil: 'Hiệu lực đến',
    versionHint: 'Báo giá mới của cùng cơ hội sẽ tự tăng phiên bản',
  },
  interaction: {
    newInteraction: 'Ghi nhận tương tác',
    occurredAt: 'Thời điểm',
    summary: 'Nội dung',
    relatedContact: 'Người liên hệ',
    relatedDeal: 'Cơ hội liên quan',
    noInteractions: 'Chưa có tương tác nào được ghi nhận.',
  },
  reminder: {
    reminders: 'Nhắc hẹn',
    newReminder: 'Tạo nhắc hẹn',
    dueAt: 'Thời điểm nhắc',
    note: 'Ghi chú',
    noReminders: 'Không có nhắc hẹn nào sắp tới.',
    markDone: 'Đánh dấu đã xong',
  },
  calendar: {
    month: 'Tháng',
    week: 'Tuần',
    day: 'Ngày',
    list: 'Danh sách',
    /** Chu giai — mo ta tung nguon su kien dang hien tren lich. */
    legendTasks: 'Công việc (màu theo mức ưu tiên)',
    legendNextAction: 'Hành động tiếp theo của cơ hội',
    legendDealClose: 'Cơ hội — dự kiến chốt',
    legendContractEnd: 'Hợp đồng — ngày hết hạn',
    moreEvents: 'lịch khác',
    /** Nhan loai cho tung nguon su kien. */
    sourceCard: 'Công việc',
    sourceReminder: 'Nhắc hẹn',
    sourceNextAction: 'Hành động tiếp theo',
    sourceDealClose: 'Cơ hội — dự kiến chốt',
    sourceContractEnd: 'Hợp đồng — hết hạn',
    /** Ngan keo chi tiet. */
    openCard: 'Mở thẻ công việc',
    openDeal: 'Mở cơ hội',
    openContract: 'Mở danh sách hợp đồng',
    derivedNote: 'Lịch này sinh ra từ dữ liệu khác — sửa tại chính nguồn của nó.',
    noSource: 'Nhắc hẹn này không gắn với thẻ nào.',
    fieldType: 'Loại',
    fieldTime: 'Thời gian',
    fieldDate: 'Ngày',
    fieldRelated: 'Liên quan',
    allDay: 'Cả ngày',
    emptyDay: 'Không có lịch trong ngày này.',
    /** Tao / sua lich ca nhan. */
    create: 'Tạo lịch',
    newEvent: 'Tạo lịch mới',
    editEvent: 'Sửa lịch',
    quickCreate: 'TẠO LỊCH',
    moreDetail: 'Thêm chi tiết',
    fieldTitle: 'Tiêu đề',
    fieldStart: 'Bắt đầu',
    fieldEnd: 'Kết thúc',
    fieldLocation: 'Địa điểm',
    fieldDescription: 'Mô tả',
    fieldReminder: 'Nhắc lịch',
    fieldStatus: 'Trạng thái',
    noReminder: 'Không nhắc',
    minutesBefore: 'phút trước',
    hoursBefore: 'giờ trước',
    dayBefore: '1 ngày trước',
    conflictTitle: 'Thời gian này đang có lịch:',
    conflictKeep: 'Vẫn lưu',
    created: 'Đã tạo lịch',
    updated: 'Đã cập nhật lịch',
    deleted: 'Đã xóa lịch',
    completed: 'Đã hoàn thành',
    confirmDelete: 'Bạn có chắc muốn xóa lịch này?',
  },
  /** Loai lich ca nhan (bang calendar_events). */
  calendarType: {
    task: 'Công việc',
    meeting: 'Cuộc họp',
    call: 'Cuộc gọi',
    reminder: 'Nhắc việc',
    appointment: 'Lịch hẹn',
    deadline: 'Deadline',
    other: 'Khác',
  } as Record<CalEventType, string>,
  calendarStatus: {
    pending: 'Chưa hoàn thành',
    done: 'Hoàn thành',
    cancelled: 'Đã hủy',
  } as Record<CalEventStatus, string>,
  timeline: {
    groupByBoard: 'Theo bảng',
    groupByCustomer: 'Theo khách hàng',
    zoomWeek: 'Tuần',
    zoomMonth: 'Tháng',
    zoomQuarter: 'Quý',
    unscheduled: 'Chưa xếp lịch',
    noItems: 'Chưa có công việc nào có ngày bắt đầu hoặc hạn hoàn thành.',
  },
  table: {
    showing: 'Hiển thị',
    tasks: 'công việc',
    filterText: 'Lọc theo tên…',
    status: 'Trạng thái',
  },
  reports: {
    thisMonth: 'Tháng này',
    thisQuarter: 'Quý này',
    sixMonths: '6 tháng',
    custom: 'Tùy chọn',
    completedByWeek: 'Công việc hoàn thành theo tuần',
    openByPriority: 'Công việc đang mở theo ưu tiên',
    pipelineByStage: 'Giá trị pipeline theo giai đoạn',
    wonByMonth: 'Doanh thu chốt thành công theo tháng',
    interactionsByType: 'Tương tác theo loại',
    topCustomers: 'Khách hàng đóng góp nhiều nhất',
    winRate: 'Tỷ lệ thắng',
    openPipeline: 'Pipeline đang mở',
    dueThisWeek: 'Đến hạn tuần này',
  },
  settings: {
    pageTitle: 'Cài đặt',
    pageSubtitle: 'Cấu hình nhãn, chấm điểm cơ hội, trợ lý AI và dữ liệu hệ thống',
    tabLabels: 'Nhãn',
    tabScoring: 'Chấm điểm cơ hội',
    tabHandover: 'Bàn giao',
    tabDelivery: 'Triển khai',
    tabAi: 'Trợ lý AI',
    tabTelegram: 'Telegram',
    tabData: 'Dữ liệu & sao lưu',
    tabAccount: 'Tài khoản',
    scoringTitle: 'Chấm điểm cơ hội (BANT + 4P)',
    backup: 'Sao lưu & xuất dữ liệu',
    backupChoiceHint: 'Chọn tải bản sao lưu về máy hoặc gửi trực tiếp vào nhóm Telegram.',
    backupDownload: 'Tải về máy',
    backupSendTelegram: 'Gửi qua Telegram',
    backupTelegramNotReady: 'Chưa cấu hình Telegram (xem tab Telegram) để gửi sao lưu',
    backupList: 'Các bản sao lưu',
    exportJson: 'Xuất dữ liệu JSON',
    exportCsv: 'Xuất CSV (mở bằng Excel)',
    manageLabels: 'Quản lý nhãn',
    labelName: 'Tên nhãn',
    dataLocation: 'Dữ liệu được lưu tại server/data/app.db',
    sampleData: 'Dữ liệu mẫu',
  },
  /** Quản lý nhãn 2 cấp (BRD Nhãn v1.2). */
  labels: {
    group: 'Nhóm nhãn',
    newGroup: 'Nhóm mới',
    newLabel: 'Nhãn mới',
    inGroup: 'Thuộc nhóm',
    name: 'Tên nhãn',
    color: 'Màu',
    description: 'Mô tả',
    scope: 'Áp dụng cho',
    scopeAll: 'Mọi đối tượng',
    status: 'Trạng thái',
    active: 'Đang dùng',
    inactive: 'Vô hiệu hóa',
    used: 'bản ghi',
    usedNone: 'chưa dùng',
    searchPlaceholder: 'Tìm nhãn…',
    noResults: 'Không có nhãn nào khớp.',
    emptyForScope: 'Chưa có nhãn nào dùng được ở đây.',
    empty: 'Chưa có nhãn nào. Tạo một nhóm rồi thêm nhãn con vào đó.',
    addChild: 'Thêm nhãn vào nhóm này',
    moveTo: 'Chuyển sang nhóm',
    merge: 'Gộp vào nhãn khác',
    mergeInto: 'Gộp vào',
    mergeHint: 'Mọi bản ghi đang dùng nhãn này sẽ chuyển sang nhãn đích, nhãn này bị xóa.',
    viewRecords: 'Xem bản ghi đang dùng',
    deleteUsed: 'Nhãn đang được dùng',
    deleteUsedBody: (n: number) =>
      `Nhãn này đang gắn ở ${n} bản ghi. Nên vô hiệu hóa thay vì xóa — dữ liệu cũ vẫn giữ được nhãn.`,
    deleteAnyway: 'Gỡ khỏi tất cả rồi xóa',
    deactivate: 'Vô hiệu hóa',
    duplicate: 'Trong nhóm này đã có nhãn cùng tên (không phân biệt dấu và chữ hoa/thường).',
    conflictTitle: 'Trùng với trường nghiệp vụ',
    conflictBody: (field: string, value: string) =>
      `Tên nhãn trùng với ${field}: “${value}”. Nên lọc theo trường đó thay vì tạo nhãn — nếu không, số liệu theo trường và theo nhãn sẽ lệch nhau.`,
    createAnyway: 'Vẫn tạo nhãn',
    systemGroupHint: 'Nhóm mặc định cho nhãn cũ và nhãn tạo nhanh.',
    filterAnd: 'VÀ',
    filterOr: 'HOẶC',
    filterMode: 'Cách ghép nhiều nhãn',
    filterAndHint: 'Bản ghi phải có tất cả nhãn đã chọn',
    filterOrHint: 'Bản ghi có ít nhất một nhãn đã chọn',
  },
  labelEntity: {
    card: 'Công việc',
    customer: 'Khách hàng',
    deal: 'Cơ hội',
    contact: 'Người liên hệ',
    contract: 'Hợp đồng',
  } as Record<'card' | 'customer' | 'deal' | 'contact' | 'contract', string>,
  search: {
    placeholder: 'Tìm thẻ, khách hàng, cơ hội…',
    hint: 'Nhấn Ctrl+K để tìm kiếm',
    noResults: 'Không tìm thấy kết quả nào.',
    cards: 'Thẻ công việc',
    customers: 'Khách hàng',
    deals: 'Cơ hội',
  },
};

export const PRIORITY_ORDER: Priority[] = ['urgent', 'high', 'medium', 'low'];
export const STAGE_ORDER: Stage[] = [
  'lead',
  'approaching',
  'discussing',
  'poc',
  'quoted',
  'negotiating',
  'won',
  'lost',
];
export const OPEN_STAGES: Stage[] = STAGE_ORDER.filter((s) => s !== 'won' && s !== 'lost');

export const LOST_REASON_ORDER = [
  'price',
  'competitor',
  'no_budget',
  'project_stopped',
  'solution_mismatch',
  'requirement_unmet',
  'no_contact',
  'bad_timing',
  'self_build',
  'other',
];

export const CONTRACT_STATUS_ORDER = ['draft', 'signing', 'active', 'expired', 'terminated'];
export const QUOTATION_STATUS_ORDER = [
  'draft',
  'sent',
  'reviewing',
  'revision',
  'accepted',
  'rejected',
];
export const DOC_TYPE_ORDER = [
  'proposal',
  'quotation',
  'contract',
  'nda',
  'meeting_minute',
  'requirement',
  'profile',
  'other',
];
export const REVENUE_STAGE_ORDER: RevenueStage[] = ['forecast', 'reconciled', 'invoiced', 'paid'];
export const CONTRACT_KIND_ORDER: ContractKind[] = ['new', 'expansion'];
export const CONTRACT_TERM_ORDER: ContractTerm[] = ['long', 'short', 'trial', 'other'];
export const SERVICE_STATUS_ORDER: ServiceStatus[] = ['using', 'pending', 'paused', 'stopped'];

/** Màu tình trạng dịch vụ — dùng chung bảng doanh thu và hồ sơ khách hàng. */
export const SERVICE_STATUS_COLORS: Record<ServiceStatus, string> = {
  using: '#0ca30c',
  pending: '#579dff',
  paused: '#eda100',
  stopped: '#8590a2',
};

/**
 * Màu 4 giai đoạn doanh thu: cùng sắc xanh đậm dần theo vòng đời tiền
 * (dự kiến → đối soát → xuất hóa đơn), riêng "đã thanh toán" dùng xanh lá kết quả.
 */
export const REVENUE_STAGE_COLORS: Record<RevenueStage, string> = {
  forecast: '#9ec5f4',
  reconciled: '#3987e5',
  invoiced: '#7c6fd6',
  paid: '#0ca30c',
};

/** Nền nhạt của ô doanh thu theo giai đoạn — đủ tương phản để đọc chữ đen. */
export const REVENUE_STAGE_TINTS: Record<RevenueStage, string> = {
  forecast: 'transparent',
  reconciled: 'rgba(57, 135, 229, 0.12)',
  invoiced: 'rgba(124, 111, 214, 0.16)',
  paid: 'rgba(12, 163, 12, 0.16)',
};

export const ACCOUNT_SIZES = ['SME', 'Mid-market', 'Enterprise'];
export const ACCOUNT_SOURCES = [
  'Giới thiệu',
  'Sự kiện / Hội chợ',
  'LinkedIn',
  'Website',
  'Gọi lạnh',
  'Đối tác',
  'Khác',
];
/** Gợi ý hành động tiếp theo (FR-OPP-05). */
export const NEXT_ACTIONS = [
  'Gọi khách hàng',
  'Gửi báo giá',
  'Gửi proposal',
  'Hẹn meeting',
  'Follow-up',
  'Chỉnh báo giá',
  'Gửi hợp đồng',
];

/**
 * Bang mau muc uu tien — da kiem dinh CVD (all-pairs, nen trang):
 * CVD ΔE nho nhat 9.1, normal-vision 22.9. Luon di kem nhan chu, khong dua vao mau don doc.
 */
/**
 * Mau nhan trang thai — dung cho ColorBadge (tu chon muc den/trang cho du tuong phan).
 * Truoc day ba trang khai bao rieng ba ban sao gan giong nhau, sua mot cho la lech.
 */
export const ACCOUNT_STATUS_COLORS: Record<string, string> = {
  prospect: '#579dff',
  customer: '#0ca30c',
  inactive: '#8590a2',
};

export const CONTRACT_STATUS_COLORS: Record<string, string> = {
  draft: '#8590a2',
  signing: '#579dff',
  active: '#0ca30c',
  expired: '#eda100',
  terminated: '#d03b3b',
};

export const QUOTATION_STATUS_COLORS: Record<string, string> = {
  draft: '#8590a2',
  sent: '#579dff',
  reviewing: '#6cc3e0',
  revision: '#eda100',
  accepted: '#0ca30c',
  rejected: '#d03b3b',
};

export const PRIORITY_COLORS: Record<Priority, string> = {
  urgent: '#d03b3b',
  high: '#eda100',
  /* Truoc day la '#2a78d6'. Mau do roi dung vao dai chet: voi muc den chi dat
     4,46:1 va voi muc trang 4,42:1 — khong lua chon nao qua duoc 4,5:1, nen huy
     hieu "Trung binh" truot AA (axe bat duoc sau khi bat tag WCAG 2.2).
     Da ha do sang tu 50,2% xuong 48,7% va giu nguyen tong mau 212,8 do lan do
     bao hoa 68%, nen phan kiem dinh mu mau cua bang mau khong bi anh huong.
     Gio dat 4,67:1 voi muc trang. */
  medium: '#2874d0',
  low: '#1baf7a',
};

/** Giai doan ban hang: 3 buoc dang mo dung thang mau xanh dam dan, chot dung mau trang thai. */
export const STAGE_COLORS: Record<Stage, string> = {
  lead: '#cde2fb',
  approaching: '#9ec5f4',
  discussing: '#6da7ec',
  /* Chen giữa 'discussing' và 'quoted' trên cùng một dải xanh — thang màu phải
     đọc được như một tiến trình, không phải một bảng màu ngẫu nhiên. */
  poc: '#4f95e8',
  quoted: '#3987e5',
  negotiating: '#1c5cab',
  won: '#0ca30c',
  lost: '#d03b3b',
};

/** Mau bieu do mot chuoi so lieu (truc mang danh tinh, khong phai mau). */
export const CHART_PRIMARY = '#2a78d6';

/** Cac o mau phan loai theo thu tu co dinh — da kiem dinh cho 5 slot dau. */
export const CATEGORICAL_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'];

/* `CHART_INK` da bi bo: mau luoi/truc/nhan cua recharts nay dat bang token trong
   index.css (khoi `.recharts-*`) de doi theo tung theme. */

/** Co hoi bi veto chan khoi forecast — dung cho ColorBadge o trang chi tiet co hoi. */
export const VETO_BADGE_COLOR = '#e04b3a';

/** Doi thu da tham gia soan tieu chi — canh bao muc vua trong hoi dong mua hang. */
export const SHAPED_REQUIREMENTS_COLOR = '#e8a33d';
