/**
 * Từ điển module Chấm điểm cơ hội (BANT + 4P).
 *
 * Tách khỏi `vi.ts` vì nội dung ở đây là **phương pháp luận**, không phải nhãn giao diện:
 * rubric 0–3 của 8 yếu tố và bộ câu hỏi khám phá được chép nguyên văn từ spec
 * (Mục 3.2, 3.3 và Phụ lục B). Sửa ở đây là sửa cách tổ chức chấm điểm — cân nhắc kỹ.
 */
import type { Factor, Quadrant, VetoCode } from '../types';

export const FACTOR_LABELS: Record<Factor, string> = {
  budget: 'Ngân sách',
  authority: 'Quyền hạn',
  need: 'Nhu cầu',
  timeline: 'Thời gian',
  price: 'Giá cả',
  relationship: 'Thân thiết',
  fit: 'Phù hợp',
  process: 'Quy trình',
};

/** Câu hỏi cốt lõi của mỗi trục — nhắc người chấm đang trả lời câu hỏi nào. */
export const AXIS_LABELS = {
  bant: { name: 'BANT', question: 'Đây có phải cơ hội thật không?' },
  p4: { name: '4P', question: 'Nếu là thật, ta có khả năng thắng không?' },
} as const;

/** Rubric 0–3 cho từng yếu tố — chép nguyên văn Mục 3.2 và 3.3 của spec. */
export const RUBRICS: Record<Factor, [string, string, string, string]> = {
  budget: [
    'Không rõ ngân sách, hoặc khách né mọi con số.',
    'Có nêu khoảng ngân sách nhưng chưa được phê duyệt, hoặc thuộc năm tài chính sau.',
    'Ngân sách đã duyệt, biết thuộc CAPEX/OPEX, nhưng giải pháp của ta lệch >20% so với ngân sách.',
    'Ngân sách đã duyệt, đủ chi trả, biết rõ người kiểm soát ngân sách và đã trao đổi với người đó.',
  ],
  authority: [
    'Chỉ tiếp xúc một liên hệ, không biết ai duyệt.',
    'Biết tên người ký nhưng chưa tiếp xúc; chưa nắm quy trình phê duyệt.',
    'Đã lập bản đồ ≥3 vai trò trong nhóm ra quyết định, đã gặp ít nhất một người có quyền.',
    'Đã gặp economic buyer, có champion xác định được, hiểu rõ các bước phê duyệt và ngưỡng thẩm quyền.',
  ],
  need: [
    'Chỉ là *interest*; khách không mô tả được vấn đề.',
    'Mức *want*: có nhu cầu nhưng "có thì tốt", không có hậu quả nếu bỏ qua.',
    'Mức *pain*: khách nêu rõ vấn đề và hậu quả, nhưng chưa lượng hóa được bằng số.',
    'Pain đã lượng hóa (chi phí/tháng, giờ công, rủi ro tuân thủ) và khách tự thừa nhận con số đó.',
  ],
  timeline: [
    'Không có mốc thời gian, hoặc "khi nào tiện".',
    'Có mong muốn thời gian chung chung ("trong năm nay") do sales suy đoán.',
    'Có compelling event được nêu nhưng chưa xác nhận ngày cụ thể.',
    'Compelling event có ngày cụ thể, khách xác nhận, và lịch triển khai ngược đã được thống nhất.',
  ],
  price: [
    'Giá ta cao hơn đáng kể mặt bằng và không có khác biệt biện minh được; hoặc hoàn toàn không biết mặt bằng.',
    'Giá ta cao hơn, có khác biệt nhưng khách chưa công nhận giá trị đó.',
    'Giá tương đương thị trường, hoặc cao hơn nhưng khách đã công nhận giá trị khác biệt.',
    'Giá cạnh tranh và khách đã chuyển trọng tâm thảo luận từ giá sang giá trị/ROI.',
  ],
  relationship: [
    'Single-threaded qua một đầu mối, không rõ thái độ.',
    'Có 2–3 liên hệ nhưng chưa ai chủ động vận động cho ta.',
    'Có champion tự nguyện chia sẻ thông tin nội bộ; phủ được ≥50% nhóm ra quyết định.',
    'Champion chủ động vận động thay ta khi ta không có mặt; có quan hệ ở cả cấp thực thi và cấp quyết định; không có blocker nghiêm trọng.',
  ],
  fit: [
    'Yêu cầu cốt lõi nằm ngoài năng lực, cần phát triển mới.',
    'Đáp ứng được nhưng cần tùy chỉnh nặng, rủi ro triển khai cao, biên lợi nhuận bị bào mòn.',
    'Đáp ứng phần lớn out-of-the-box, tùy chỉnh ở mức chấp nhận được.',
    'Phù hợp tự nhiên; đã có case tương đương cùng ngành/quy mô để tham chiếu.',
  ],
  process: [
    'Không biết quy trình mua; hoặc phát hiện tiêu chí thầu do đối thủ soạn.',
    'Biết sơ bộ các bước nhưng không biết tiêu chí chấm.',
    'Nắm rõ các bước, tiêu chí chấm và lịch trình; tiêu chí trung lập.',
    'Nắm rõ toàn bộ và ta đã tham gia định hình tiêu chí; biết vị trí của mình so với đối thủ ở từng tiêu chí.',
  ],
};

/**
 * F-05 — bộ câu hỏi khám phá, chép nguyên văn Phụ lục B.
 * Hiện ra cho yếu tố đang ≤ 1 điểm: biết cần hỏi gì để nâng điểm.
 */
export const DISCOVERY_QUESTIONS: Record<Factor, string[]> = {
  budget: [
    'Ngân sách này đã được phê duyệt chưa, hay còn chờ kỳ lập kế hoạch?',
    'Thuộc năm tài chính nào?',
    'Ai là người ký duyệt khoản chi này?',
    'Nếu chi phí vượt dự kiến 20%, quy trình xử lý ra sao?',
  ],
  authority: [
    'Ngoài anh/chị, còn ai tham gia đánh giá?',
    'Lần gần nhất công ty mua giải pháp tương tự, quy trình phê duyệt diễn ra thế nào?',
    'Ai sẽ là người ký hợp đồng cuối cùng?',
    'Có ai trong tổ chức có thể phản đối phương án này không?',
  ],
  need: [
    'Vấn đề này đang gây ra chi phí bao nhiêu mỗi tháng?',
    'Nếu năm nay không làm gì thì hậu quả cụ thể là gì?',
    'Ai trong tổ chức chịu ảnh hưởng nặng nhất?',
    'Trước đây đã thử cách nào chưa và vì sao chưa hiệu quả?',
  ],
  timeline: [
    'Vì sao lại là thời điểm này mà không phải sáu tháng nữa?',
    'Có sự kiện nào bắt buộc phải hoàn thành trước không?',
    'Ngày cụ thể là ngày nào?',
    'Để kịp mốc đó, khi nào cần ký hợp đồng?',
  ],
  price: [
    'Anh/chị đang so sánh với mức đầu tư nào?',
    'Ngoài giá, tiêu chí nào quan trọng trong quyết định?',
    'Nếu giá cao hơn nhưng rút ngắn thời gian triển khai một nửa, điều đó có ý nghĩa gì với anh/chị?',
  ],
  relationship: [
    'Ai sẽ trình bày phương án này trong cuộc họp nội bộ?',
    'Tôi có thể hỗ trợ anh/chị chuẩn bị tài liệu thuyết phục ban lãnh đạo không?',
    'Anh/chị đánh giá phương án của chúng tôi thế nào so với các lựa chọn khác?',
  ],
  fit: [
    'Đâu là yêu cầu bắt buộc và đâu là mong muốn?',
    'Có ràng buộc nào về hệ thống hiện tại phải tích hợp không?',
    'Quy trình nào bắt buộc không được thay đổi?',
  ],
  process: [
    'Các bước từ nay đến khi ký gồm những gì?',
    'Bộ tiêu chí đánh giá do bộ phận nào soạn?',
    'Có nhà cung cấp nào đã tham gia tư vấn xây dựng yêu cầu không?',
    'Đã có đơn vị nào demo trước chúng tôi chưa?',
  ],
};

/** Câu phản biện bắt buộc cho trục 4P ở deal lớn (F-13). */
export const CHALLENGE_PROMPTS: Record<Factor, string> = {
  price: 'Nếu đối thủ giảm 15%, khách có còn chọn ta không? Căn cứ nào cho câu trả lời đó?',
  relationship:
    'Champion đã nói gì với ai khi ta không có mặt? Làm sao ta biết điều đó là thật?',
  fit: 'Yêu cầu nào ta đang cho là "đáp ứng được" mà thật ra chưa ai kiểm chứng?',
  process:
    'Nếu tiêu chí chấm được viết lại ngày mai, ta còn ở vị trí này không? Ai đang giữ bút?',
  budget: '',
  authority: '',
  need: '',
  timeline: '',
};

/* ---------- Ô ma trận ---------- */

export const QUADRANT_LABELS: Record<Quadrant, string> = {
  pursue: 'Theo đuổi',
  reshape: 'Tái định hình',
  nurture: 'Nuôi dưỡng',
  disqualify: 'Loại bỏ',
};

/** Quy ước màu thống nhất toàn hệ thống (Mục 5 của spec). */
export const QUADRANT_COLORS: Record<Quadrant, string> = {
  pursue: '#0ca30c',
  reshape: '#e8a33d',
  nurture: '#3987e5',
  disqualify: '#8993a4',
};

export const QUADRANT_ACTIONS: Record<Quadrant, string> = {
  pursue: 'Dồn nguồn lực, đẩy nhanh tiến độ. Được phép đưa vào forecast.',
  reshape:
    'Deal thật nhưng ta không ở vị thế thắng. Chỉ theo nếu tái định hình được tiêu chí, bắt tay đối tác, hoặc tấn công điểm yếu đối thủ. Nếu không — rút, tránh làm quân xanh.',
  nurture:
    'Có quan hệ và phù hợp nhưng khách chưa sẵn sàng. Chuyển sang chuỗi nuôi dưỡng, gỡ khỏi forecast kỳ hiện tại.',
  disqualify: 'Chuyển sang danh sách marketing tự động, không tiêu tốn giờ sales.',
};

/* ---------- Veto ---------- */

export const VETO_LABELS: Record<VetoCode, { title: string; message: string }> = {
  V1_NO_COMPELLING_EVENT: {
    title: 'Không có sự kiện bắt buộc',
    message: 'Deal sẽ trượt kỳ. Không đưa vào forecast.',
  },
  V2_NO_ECONOMIC_BUYER: {
    title: 'Chưa tiếp cận người có quyền chi tiền',
    message: 'Đây là cuộc trò chuyện, chưa phải cơ hội.',
  },
  V3_COMPETITOR_SHAPED: {
    title: 'Tiêu chí do đối thủ định hình',
    message: 'Cân nhắc rút, trừ khi có đường vòng chiến lược.',
  },
};

/**
 * Việc cần làm để gỡ trần điểm của một yếu tố (BR-SCR-01…08).
 * Mỗi mục chỉ đúng một chỗ để sửa — không bắt người dùng đoán.
 */
export const BLOCKED_REASONS: Record<string, { text: string; tab: 'committee' | 'score' }> = {
  event_missing: {
    text: 'Chưa có sự kiện bắt buộc nào. Tạo sự kiện để chấm Thời gian trên 1 điểm.',
    tab: 'committee',
  },
  event_unconfirmed: {
    text: 'Sự kiện bắt buộc chưa được khách xác nhận ngày cụ thể — tối đa 2 điểm.',
    tab: 'committee',
  },
  economic_buyer_missing: {
    text: 'Chưa gặp người duyệt ngân sách — tối đa 2 điểm.',
    tab: 'committee',
  },
  committee_thin: {
    text: 'Chưa lập bản đồ đủ 3 vai trò trong nhóm ra quyết định — tối đa 1 điểm.',
    tab: 'committee',
  },
  single_threaded: {
    text: 'Đang single-threaded qua một đầu mối. Thêm người vào nhóm ra quyết định.',
    tab: 'committee',
  },
  champion_missing: {
    text: 'Chưa có champion nào ở trạng thái ủng hộ — tối đa 1 điểm.',
    tab: 'committee',
  },
  coverage_thin: {
    text: 'Chưa tiếp xúc quá nửa nhóm ra quyết định trong 30 ngày — tối đa 1 điểm.',
    tab: 'committee',
  },
  blocker_present: {
    text: 'Còn người phản đối có ảnh hưởng lớn — tối đa 2 điểm.',
    tab: 'committee',
  },
  competitor_shaped: {
    text: 'Đối thủ đã tham gia soạn tiêu chí → theo rubric, Quy trình bắt buộc bằng 0.',
    tab: 'committee',
  },
  price_unknown: {
    text: 'Chưa biết mặt bằng giá của đối thủ nào → theo rubric, Giá cả bằng 0.',
    tab: 'committee',
  },
  pain_not_quantified: {
    text: 'Bằng chứng chưa có con số lượng hóa — tối đa 2 điểm.',
    tab: 'score',
  },
};

/* ---------- Nhóm ra quyết định ---------- */

export const STANCE_LABELS: Record<string, string> = {
  supporter: 'Ủng hộ',
  neutral: 'Trung lập',
  opposed: 'Phản đối',
  unknown: 'Chưa rõ',
};

export const STANCE_COLORS: Record<string, string> = {
  supporter: '#0ca30c',
  neutral: '#8993a4',
  opposed: '#e04b3a',
  unknown: '#5e6c84',
};

export const EVENT_TYPE_LABELS: Record<string, string> = {
  contract_expiry: 'Hợp đồng cũ hết hạn',
  regulatory: 'Quy định có hiệu lực',
  audit: 'Hạn kiểm toán',
  product_launch: 'Ra mắt sản phẩm',
  fiscal_deadline: 'Hạn năm tài chính',
  other: 'Khác',
};

export const PRICE_POSITION_LABELS: Record<string, string> = {
  lower: 'Thấp hơn ta',
  similar: 'Tương đương',
  higher: 'Cao hơn ta',
  unknown: 'Chưa rõ',
};

export const RECOMMENDATION_TEXT = {
  veto: (title: string) => `Gỡ điều kiện chặn forecast: ${title.toLowerCase()}.`,
  lift_factor: (factor: Factor) =>
    `Nâng điểm ${FACTOR_LABELS[factor]} — đây là yếu tố có đòn bẩy lớn nhất hiện nay.`,
  reverify: (factor: Factor) =>
    `Xác thực lại ${FACTOR_LABELS[factor]} bằng một hoạt động có thật.`,
};
