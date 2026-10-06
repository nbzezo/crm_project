/** Bảng màu nhãn duy nhất cho mọi điểm tạo/sửa nhãn. */
export const LABEL_PALETTE = [
  '#4bce97',
  '#f5cd47',
  '#fea362',
  '#f87168',
  '#9f8fef',
  '#579dff',
  '#6cc3e0',
  '#94c748',
  '#e774bb',
  '#8590a2',
] as const;

/** Màu đánh dấu bảng yêu thích — dùng chung ở danh sách và chi tiết bảng. */
export const STAR_COLOR = '#f2d600';

/**
 * Màu hiện sẵn trong ô chọn màu của trạng thái chưa có màu riêng (v67). Ô
 * `<input type="color">` bắt buộc có một giá trị; chọn xám trung tính để không
 * nhầm là trạng thái đã được tô màu.
 */
export const STATUS_COLOR_PLACEHOLDER = LABEL_PALETTE[9];
