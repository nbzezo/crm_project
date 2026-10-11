import type { QuickQuestion, QuickVerdict } from '../types';

export const QUICK_QUESTION_TEXT: Record<QuickQuestion, { text: string; hint: string }> = {
  need: {
    text: 'Khách có vấn đề thật sự cần giải quyết không?',
    hint: 'Biết vấn đề có đủ cấp thiết để khách hành động hay chưa.',
  },
  budget: {
    text: 'Khách đã có (hoặc chắc chắn sẽ có) tiền cho việc này chưa?',
    hint: 'Ngân sách cho biết việc này có thể đi đến hợp đồng hay không.',
  },
  deadline: {
    text: 'Khách có hạn chót buộc phải xong không?',
    hint: 'Hạn chót giúp mình biết khi nào khách cần quyết định.',
  },
  decision_maker: {
    text: 'Bạn đã nói chuyện trực tiếp với người duyệt chi chưa?',
    hint: 'Gặp đúng người giúp mình biết ai có thể chấp thuận.',
  },
  supporter: {
    text: 'Bên khách có người ủng hộ mình, chịu báo tin cho mình không?',
    hint: 'Một người trong nhóm khách sẽ giúp mình hiểu tình hình và cơ hội.',
  },
  fit: {
    text: 'Giải pháp của mình đáp ứng được yêu cầu chính của khách không?',
    hint: 'Cần chắc rằng giải pháp giải quyết đúng điều khách cần.',
  },
  advantage: {
    text: 'Mình có điểm hơn hẳn đối thủ mà khách công nhận không?',
    hint: 'Điểm khác biệt được khách công nhận giúp mình có lý do được chọn.',
  },
  process: {
    text: 'Bạn có biết khách sẽ chọn nhà cung cấp thế nào, ai thật sự quyết không?',
    hint: 'Hiểu cách khách chọn giúp mình chuẩn bị đúng người và đúng việc.',
  },
  profit: {
    text: 'Ký được hợp đồng này có lãi đủ không?',
    hint: 'Cần biết công sức bỏ ra có xứng đáng với lợi ích nhận lại.',
  },
  future: {
    text: 'Sau hợp đồng này còn việc tiếp theo hoặc lợi ích lâu dài không?',
    hint: 'Cơ hội có thể đáng theo đuổi hơn nếu mở ra giá trị lâu dài.',
  },
};
export const QUICK_GROUP_LABELS = {
  real: 'Nhu cầu của khách',
  edge: 'Lợi thế của mình',
  worth: 'Có đáng làm không',
} as const;
export const QUICK_VERDICT_INFO: Record<
  QuickVerdict,
  { label: string; advice: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }
> = {
  go: {
    label: 'Nên theo — dồn sức',
    advice: 'Tập trung gặp đúng người, chốt bước tiếp theo và dành nguồn lực phù hợp.',
    tone: 'success',
  },
  clarify: {
    label: 'Cần tìm hiểu thêm',
    advice: 'Làm rõ các câu còn bỏ ngỏ trước khi dành thêm nhiều nguồn lực.',
    tone: 'warning',
  },
  build_edge: {
    label: 'Khách cần thật, mình chưa có lợi thế',
    advice: 'Tìm cách tạo điểm khác biệt mà khách thấy rõ trước khi đi tiếp.',
    tone: 'warning',
  },
  keep_warm: {
    label: 'Mình có lợi thế, khách chưa sẵn sàng',
    advice: 'Giữ liên hệ và giúp khách chuẩn bị đến lúc có thể quyết định.',
    tone: 'neutral',
  },
  stop_no_need: {
    label: 'Nên dừng — khách chưa có nhu cầu thật',
    advice: 'Hỏi lại khi vấn đề trở nên cấp thiết hơn thay vì tiếp tục dồn thời gian.',
    tone: 'danger',
  },
  stop_not_worth: {
    label: 'Nên dừng — ký được cũng không đáng',
    advice: 'Dừng để bảo vệ thời gian và lợi nhuận; chỉ quay lại khi điều kiện thay đổi.',
    tone: 'danger',
  },
  not_started: {
    label: 'Chưa đánh giá',
    advice: 'Trả lời nhanh 10 câu để biết cơ hội này nên tập trung đến đâu.',
    tone: 'neutral',
  },
};
export const QUICK_ACTION_TEXT: Record<QuickQuestion, { unsure: string; no: string }> = {
  need: {
    unsure: 'Hỏi khách vấn đề này đang gây mất gì và khi nào cần xử lý.',
    no: 'Hẹn lại khi khách xác nhận vấn đề cần giải quyết.',
  },
  budget: {
    unsure: 'Hỏi ngân sách đã duyệt hay nguồn tiền dự kiến.',
    no: 'Xác nhận điều kiện có ngân sách trước khi báo giá.',
  },
  deadline: {
    unsure: 'Hỏi mốc nào khiến khách bắt buộc phải xong.',
    no: 'Tìm hiểu điều gì có thể thúc đẩy khách ra quyết định.',
  },
  decision_maker: {
    unsure: 'Hỏi đầu mối xem ai là người duyệt chi và xin một buổi gặp.',
    no: 'Đặt lịch gặp người duyệt chi trong tuần này.',
  },
  supporter: {
    unsure: 'Hỏi ai bên khách có thể báo tin và giúp mình tiếp cận.',
    no: 'Tìm một người bên khách sẵn sàng giới thiệu mình vào cuộc trao đổi.',
  },
  fit: {
    unsure: 'Xác nhận yêu cầu chính và phần giải pháp còn thiếu.',
    no: 'Nói rõ phần mình chưa đáp ứng và đề xuất hướng xử lý.',
  },
  advantage: {
    unsure: 'Hỏi khách tiêu chí nào khiến họ chọn mình thay vì đối thủ.',
    no: 'Tìm một điểm khác biệt có thể chứng minh bằng kết quả thực tế.',
  },
  process: {
    unsure: 'Vẽ lại các bước chọn nhà cung cấp và người tham gia.',
    no: 'Xin khách giới thiệu quy trình và những người có quyền quyết.',
  },
  profit: {
    unsure: 'Tính lại công sức, chi phí và lợi ích trước khi cam kết.',
    no: 'Trao đổi để thu hẹp phạm vi hoặc dừng cơ hội không có lãi.',
  },
  future: {
    unsure: 'Hỏi nhu cầu tiếp theo sau hợp đồng đầu tiên.',
    no: 'Đánh giá lại mức đầu tư nếu chỉ có một hợp đồng nhỏ.',
  },
};
export const ANSWER_LABELS = { yes: 'Có', unsure: 'Chưa rõ', no: 'Không' } as const;
