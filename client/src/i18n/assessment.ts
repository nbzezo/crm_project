/**
 * Từ điển màn Đánh giá cơ hội theo 4 câu hỏi (v70) — khung "Opportunity Assessment".
 *
 * Như `scoring.ts`, đây là **phương pháp luận** chứ không chỉ là nhãn: tên 20 ô,
 * câu hỏi khám phá (dịch từ tài liệu gốc) và thang 0–3 của 9 tiêu chí bổ sung.
 */
import type {
  AssessmentCriterion,
  AssessmentQuestion,
  AssessmentVerdict,
  DealDecisionKind,
  WorthLevel,
} from '../types';

export const QUESTION_INFO: Record<
  AssessmentQuestion,
  { no: number; title: string; question: string; pass: string }
> = {
  need: {
    no: 1,
    title: 'Nhu cầu thật',
    question: 'Khách có nhu cầu THẬT không?',
    pass: 'Khách buộc phải hành động',
  },
  compete: {
    no: 2,
    title: 'Lợi thế',
    question: 'Ta có LỢI THẾ hơn đối thủ không?',
    pass: 'Ta có lợi thế rõ ràng',
  },
  close: {
    no: 3,
    title: 'Ký được',
    question: 'Ta có KÝ ĐƯỢC hợp đồng không?',
    pass: 'Người có quyền muốn chọn ta',
  },
  worth: {
    no: 4,
    title: 'Đáng đầu tư',
    question: 'Ký được hợp đồng thì ta được gì — có ĐÁNG bỏ công không?',
    pass: 'Rủi ro chấp nhận được, lợi ích xứng đáng',
  },
};

/** Tên và câu hỏi khám phá của 20 ô, theo đúng số thứ tự trong tài liệu gốc. */
export const CELL_INFO: Record<number, { label: string; questions: string[] }> = {
  1: {
    label: 'Yêu cầu / dự án rõ ràng',
    questions: [
      'Yêu cầu của khách là gì? Vấn đề và mục tiêu chính của dự án?',
      'Ai khởi xướng dự án? Ai sẽ trực tiếp làm?',
      'Dự án gắn với chiến lược kinh doanh của khách thế nào?',
    ],
  },
  2: {
    label: 'Ngân sách',
    questions: [
      'Khách đã có ngân sách cho dự án chưa? Ta có hiểu quy trình lập ngân sách của họ?',
      'Dự án này quan trọng thế nào so với các dự án khác của khách?',
      'Nếu giải pháp vượt dự kiến, họ có lấy được nguồn tiền khác? Có thể bàn thuê hoặc trả dần?',
    ],
  },
  3: {
    label: 'Người chủ dự án cấp cao',
    questions: [
      'Lãnh đạo cao nhất gắn với dự án này là ai?',
      'Ai thật sự "cầm trịch" dự án, và những người phụ tá chính là ai?',
    ],
  },
  4: {
    label: 'Sức khỏe tài chính của khách',
    questions: [
      'Sản phẩm/dịch vụ và thị trường chính của khách là gì? Khách hàng và đối thủ chính của họ?',
      'Điều gì đang thúc đẩy doanh nghiệp họ từ bên trong và bên ngoài?',
      'Xu hướng doanh thu, lợi nhuận 12 tháng qua? Họ có thanh toán đúng hạn không?',
    ],
  },
  5: {
    label: 'Hậu quả / lợi ích (sự kiện bắt buộc)',
    questions: [
      'Nếu khách không làm gì thì chuyện gì xảy ra?',
      'Có hạn chót để khách ra quyết định không? Nếu dự án chậm thì sao?',
      'Lợi ích đo được nếu xong đúng hạn là gì?',
    ],
  },
  6: {
    label: 'Công sức hợp lý',
    questions: [
      'Đội bán cần đầu tư bao nhiêu thời gian cho cơ hội này?',
      'Cần thêm nguồn lực nội bộ hoặc bên ngoài nào để giành được hợp đồng?',
      'Chi phí bán hàng dự kiến? Theo deal này thì ta bỏ lỡ deal nào (chi phí cơ hội)?',
    ],
  },
  7: {
    label: 'Giải pháp phù hợp',
    questions: [
      'Giải pháp của ta giải quyết vấn đề của khách tốt đến đâu? Khách nghĩ gì?',
      'Cần sửa đổi, bổ sung gì? Cần nguồn lực bên ngoài nào để đáp ứng yêu cầu?',
    ],
  },
  8: {
    label: 'Quy trình quyết định chính thức',
    questions: [
      'Tiêu chí quyết định của khách là gì? Quy trình chính thức ra sao?',
      'Tiêu chí nào quan trọng nhất, vì sao? Ai soạn ra các tiêu chí đó?',
    ],
  },
  9: {
    label: 'Đối thủ',
    questions: [
      'Quan hệ của ta với khách đang thế nào? Còn của từng đối thủ?',
      'Quan hệ của ai đang tạo lợi thế cho cơ hội này?',
      'So với hình mẫu đối tác lý tưởng của khách, ta và đối thủ đứng ở đâu?',
    ],
  },
  10: {
    label: 'Giá trị khác biệt',
    questions: [
      'Kết quả kinh doanh cụ thể, đo được mà ta sẽ mang lại là gì?',
      'Khách định nghĩa và đo giá trị thế nào? Ta đã lượng hóa bằng con số của khách chưa?',
      'Khách đã xác nhận giá trị đó chưa? Nó khác đối thủ ở đâu?',
    ],
  },
  11: {
    label: 'Người ủng hộ chính',
    questions: [
      'Ta có người ủng hộ chính trong khách hàng không? Họ có nói thay ta khi ta vắng mặt?',
      'Họ có bảo vệ ta trước đối thủ? Có uy tín trong tổ chức? Có báo tin cho ta?',
    ],
  },
  12: {
    label: 'Quan hệ lãnh đạo',
    questions: [
      'Lãnh đạo nào ảnh hưởng hoặc chịu ảnh hưởng bởi quyết định này?',
      'Ta đã tạo được sự tin cậy với họ thế nào?',
      'Làm sao để tiếp cận họ, và kế hoạch để được gặp lại?',
    ],
  },
  13: {
    label: 'Quyết định không chính thức',
    questions: [
      'Quyết định thực sự sẽ được đưa ra thế nào? Yếu tố chủ quan nào có thể chi phối?',
      'Những vấn đề nào không được nói ra? Ý kiến riêng của ai ta biết, ý kiến nào có trọng lượng?',
      'Người ủng hộ nội bộ nói gì? Ai muốn chọn ta?',
    ],
  },
  14: {
    label: 'Quan hệ sẵn có',
    questions: [
      'Ta đã từng làm ăn với khách này chưa?',
      'Ai trong tổ chức muốn chọn ta? Họ đã làm gì để thể hiện điều đó?',
      'Họ có sẵn lòng và đủ khả năng hành động thay ta không?',
    ],
  },
  15: {
    label: 'Kết nối người có ảnh hưởng',
    questions: [
      'Ai là người có quyền lực nhất trong quyết định này? Họ có muốn chọn ta không, vì sao?',
      'Họ có thể thay đổi tiêu chí quyết định không? Có tạo được sự cấp bách không?',
      'Nếu chưa gặp được, ta có quen ai nối được tới họ không?',
    ],
  },
  16: {
    label: 'Lợi nhuận',
    questions: [
      'Giá trị deal là bao nhiêu? Có đạt ngưỡng biên lợi nhuận của mình không?',
      'Chiết khấu ảnh hưởng tới lợi nhuận thế nào? Làm sao cải thiện lợi nhuận?',
    ],
  },
  17: {
    label: 'Cơ hội tiếp nối',
    questions: [
      'Tiềm năng kinh doanh tiếp theo với khách trong 1 năm, 3 năm tới?',
      'Dự án này có gắn với doanh thu tương lai không?',
      'Có dùng thành công này để bán cho phòng ban khác của khách không?',
    ],
  },
  18: {
    label: 'Khả năng được chọn',
    questions: [
      'Ta có uy tín với lãnh đạo không? Giải pháp của ta có độc đáo không?',
      'Họ có muốn chọn ta không?',
    ],
  },
  19: {
    label: 'Mức an toàn khi triển khai',
    questions: [
      'Ta có thể làm giải pháp thất bại theo cách nào? Phụ thuộc quan trọng nào?',
      'Khách có thể làm giải pháp thất bại theo cách nào?',
      'Nếu thất bại thì ảnh hưởng tới ta và uy tín của ta ra sao?',
    ],
  },
  20: {
    label: 'Giá trị chiến lược',
    questions: [
      'Ngoài doanh thu, cơ hội này mang lại giá trị gì cho ta?',
      'Có dùng làm khách hàng tham chiếu để bán sang công ty, thị trường khác không?',
      'Cơ hội này giúp ta cải thiện sản phẩm/dịch vụ thế nào?',
    ],
  },
};

/** Ô suy ra từ dữ liệu: giải thích cách tính để người dùng biết sửa ở đâu. */
export const DERIVED_INFO: Record<string, string> = {
  existing_relationship:
    'Tự tính từ lịch sử mua: chưa từng mua = yếu; đã có 1 cơ hội thành công hoặc hợp đồng = khá; từ 2 trở lên = mạnh.',
  influence:
    'Tự tính từ tab Nhóm quyết định: có người ảnh hưởng 4–5/5 đang Ủng hộ/Mentor = mạnh; vẫn còn người ảnh hưởng lớn chống lại = khá; chưa có ai ảnh hưởng lớn ủng hộ = yếu.',
  win_likelihood:
    'Tự tính từ điểm 4P (lợi thế so với đối thủ): dưới 7 = yếu; 7–8 = khá; từ 9 trở lên = mạnh.',
};

export const CRITERION_LABELS: Record<AssessmentCriterion, string> = {
  profit: 'Lợi nhuận',
  follow_on: 'Cơ hội tiếp nối',
  strategic: 'Giá trị chiến lược',
  resources: 'Công sức hợp lý',
  delivery_risk: 'Mức an toàn khi triển khai',
  financial_health: 'Sức khỏe tài chính khách',
  unique_value: 'Giá trị khác biệt',
  exec_relationship: 'Quan hệ lãnh đạo',
  informal_decision: 'Quyết định không chính thức',
};

/** Thang 0–3 của 9 tiêu chí bổ sung. 0 luôn là "chưa biết". */
export const CRITERION_RUBRICS: Record<AssessmentCriterion, [string, string, string, string]> = {
  profit: [
    'Chưa tính biên lợi nhuận.',
    'Biên dưới ngưỡng của mình, hoặc khách ép chiết khấu sâu.',
    'Biên đạt ngưỡng.',
    'Biên vượt ngưỡng; khách trả theo giá trị, không ép giá.',
  ],
  follow_on: [
    'Chưa biết.',
    'Deal một lần, không thấy gì tiếp theo.',
    'Có khả năng mở rộng hoặc gia hạn trong 1–3 năm.',
    'Đã thấy rõ dự án/doanh thu tiếp theo, khách đã nhắc tới.',
  ],
  strategic: [
    'Chưa đánh giá.',
    'Không có giá trị gì ngoài doanh thu.',
    'Mở được phòng ban/khu vực mới, hoặc giúp cải thiện sản phẩm.',
    'Khách hàng tham chiếu — mở được cả ngành hoặc thị trường mới.',
  ],
  resources: [
    'Chưa ước lượng công sức.',
    'Tốn nhiều công, chi phí bán hàng lớn so với giá trị, kéo người khỏi deal khác.',
    'Công sức vừa phải, không ảnh hưởng deal khác.',
    'Ít công sức: có sẵn mẫu, sẵn đội, chi phí bán hàng thấp.',
  ],
  delivery_risk: [
    'Chưa đánh giá rủi ro.',
    'Rủi ro cao: phụ thuộc lớn, khách thiếu năng lực hoặc cam kết, thất bại sẽ hại uy tín.',
    'Có rủi ro nhưng kiểm soát được.',
    'Rủi ro thấp; đã làm thành công dự án tương tự.',
  ],
  financial_health: [
    'Chưa tìm hiểu.',
    'Tài chính yếu: làm ăn thua lỗ, nợ đọng, hay trả chậm.',
    'Ổn định.',
    'Mạnh, đang tăng trưởng, thanh toán tốt.',
  ],
  unique_value: [
    'Chưa xác định được giá trị khác biệt.',
    'Có điểm khác nhưng chưa gắn với kết quả kinh doanh của khách.',
    'Đã lượng hóa giá trị bằng con số của khách.',
    'Khách đã xác nhận giá trị và công nhận đối thủ không có.',
  ],
  exec_relationship: [
    'Chưa biết lãnh đạo nào liên quan.',
    'Biết lãnh đạo nhưng chưa tiếp xúc.',
    'Đã gặp, tiếp xúc sơ lược hoặc vài lần.',
    'Quan hệ tin cậy, gặp lại được, lãnh đạo chia sẻ ưu tiên với ta.',
  ],
  informal_decision: [
    'Không biết quyết định thật sự diễn ra thế nào.',
    'Biết sơ bộ, chưa biết ý kiến riêng của người có trọng lượng.',
    'Biết ai thật sự quyết và yếu tố chủ quan nào quan trọng.',
    'Nắm rõ; người có trọng lượng muốn chọn ta và báo tin cho ta.',
  ],
};

export const LEVEL_LABELS = { unknown: 'Chưa biết', weak: 'Yếu', strong: 'Mạnh' } as const;

export const WORTH_LEVEL_LABELS: Record<WorthLevel, string> = {
  unknown: 'Chưa đủ dữ liệu',
  low: 'Thấp',
  medium: 'Vừa',
  high: 'Cao',
};

export const VERDICT_INFO: Record<
  AssessmentVerdict,
  { label: string; advice: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }
> = {
  pursue: {
    label: 'Theo đuổi',
    advice: 'Nhu cầu thật, ta có lợi thế và đáng làm. Dồn nguồn lực, đẩy nhanh tiến độ.',
    tone: 'success',
  },
  win_not_worth: {
    label: 'Có lợi thế nhưng chưa đáng làm',
    advice:
      'Cân nhắc đàm phán lại điều kiện (giá, phạm vi, thanh toán) hoặc rút để giữ nguồn lực cho deal tốt hơn.',
    tone: 'warning',
  },
  reshape: {
    label: 'Tái định hình',
    advice:
      'Nhu cầu thật nhưng ta chưa có lợi thế. Chỉ theo nếu đổi được tiêu chí, bắt tay đối tác hoặc đánh vào điểm yếu đối thủ.',
    tone: 'warning',
  },
  reshape_invest: {
    label: 'Đáng đầu tư để giành lợi thế',
    advice:
      'Nhu cầu thật và rất đáng giá nhưng ta chưa có lợi thế. Đáng bỏ công đổi tiêu chí, nâng quan hệ lãnh đạo, tìm đối tác.',
    tone: 'warning',
  },
  withdraw: {
    label: 'Nên rút',
    advice: 'Ta không có lợi thế, mà ký được cũng không đáng. Rút sớm, tránh làm quân xanh.',
    tone: 'danger',
  },
  nurture: {
    label: 'Nuôi dưỡng',
    advice:
      'Có quan hệ và phù hợp nhưng khách chưa sẵn sàng. Giữ liên lạc, theo dõi sự kiện bắt buộc.',
    tone: 'neutral',
  },
  nurture_strategic: {
    label: 'Nuôi dưỡng — khách chiến lược',
    advice:
      'Khách chưa sẵn sàng nhưng rất đáng giá. Giữ quan hệ đều đặn ở cấp lãnh đạo, sẵn sàng khi có sự kiện bắt buộc.',
    tone: 'neutral',
  },
  deprioritize: {
    label: 'Hạ ưu tiên',
    advice: 'Chưa sẵn sàng và cũng không đáng. Giữ liên lạc tối thiểu, không tốn giờ bán hàng.',
    tone: 'danger',
  },
  disqualify: {
    label: 'Loại',
    advice: 'Chưa thấy nhu cầu thật lẫn lợi thế của ta. Đưa về danh sách marketing.',
    tone: 'danger',
  },
};

export const DECISION_LABELS: Record<DealDecisionKind, string> = {
  pursue: 'Theo đuổi',
  pause: 'Tạm dừng',
  withdraw: 'Rút',
};

export const DECISION_COLORS: Record<DealDecisionKind, string> = {
  pursue: '#0ca30c',
  pause: '#d18b00',
  withdraw: '#e04b3a',
};
