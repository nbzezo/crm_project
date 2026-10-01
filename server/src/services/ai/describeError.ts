import { z } from 'zod';
import { HttpError } from '../../lib/validate.ts';
import { AiProviderError } from './types.ts';

/**
 * Doi loi AI thanh HttpError kem MO TA CU THE (nguyen nhan + cach xu ly).
 *
 * Truoc day moi loi nha cung cap deu thanh 502. Ma 502 trung voi loi cua proxy
 * (nginx, Cloudflare...) — nhieu proxy thay than phan hoi bang trang HTML, nguoi
 * dung chi con thay "Loi 502" tro tron. Dung 424 (Failed Dependency) de bieu thi
 * "dich vu phia sau that bai", va dat nguyen nhan vao `error` de hien thang ra.
 *
 * Khong dung 401/403 cho loi key cua nha cung cap: client coi 401 la het phien
 * dang nhap cua CHINH nguoi dung va se dang xuat ho.
 */
export function describeAiError(error: unknown): HttpError | null {
  if (error instanceof z.ZodError) {
    const first = error.issues[0];
    return new HttpError(
      424,
      `AI trả về dữ liệu sai cấu trúc (${first?.path.join('.') || 'gốc'}: ${first?.message ?? 'không hợp lệ'}). Bấm "Đọc lại" để thử lần nữa; nếu lặp lại, đổi sang model khác trong Cài đặt → Trợ lý AI.`,
      { code: 'ai_bad_shape' }
    );
  }
  if (!(error instanceof AiProviderError)) return null;

  const detail = error.message;
  const code = error.code;
  const wrap = (status: number, message: string) =>
    new HttpError(status, message, { code, provider_status: error.status ?? null });

  switch (true) {
    case code === 'not_configured':
      return wrap(409, `Chưa có nhà cung cấp AI sẵn sàng. ${detail}`);
    case code === 'token_quota' || code === 'cost_quota':
      return wrap(
        409,
        `${detail}. Tăng giới hạn trong Cài đặt → Trợ lý AI hoặc chờ sang ngày mới; trong lúc đó bạn nhập tay.`
      );
    case code === 'capability_missing':
      return wrap(424, `${detail} Với hợp đồng scan/ảnh cần model đọc được tệp (Gemini, Claude…).`);
    case code === 'timeout':
      return wrap(
        424,
        'AI không phản hồi trong 120 giây. Hợp đồng quá dài hoặc nhà cung cấp đang chậm — thử lại, hoặc cắt bớt trang rồi tải lại.'
      );
    case code === 'network_error':
      return wrap(
        424,
        'Máy chủ không kết nối được tới nhà cung cấp AI (lỗi mạng/DNS/tường lửa). Kiểm tra mạng của máy chủ và API Base URL trong Cài đặt → Trợ lý AI.'
      );
    case code === 'invalid_json':
      return wrap(
        424,
        'AI trả về nội dung không phải JSON hợp lệ sau 2 lần thử. Bấm "Đọc lại", hoặc chọn model khác.'
      );
    case error.status === 401 || error.status === 403:
      return wrap(
        424,
        `Nhà cung cấp AI từ chối (HTTP ${error.status}): API key sai, hết hạn hoặc không có quyền dùng model này. Chi tiết: ${detail}`
      );
    case error.status === 404:
      return wrap(
        424,
        `Model AI không tồn tại hoặc đã bị gỡ (HTTP 404). Vào Cài đặt → Trợ lý AI → "Đồng bộ model" rồi chọn lại. Chi tiết: ${detail}`
      );
    case error.status === 413:
      return wrap(
        424,
        `Tệp quá lớn so với giới hạn của nhà cung cấp AI (HTTP 413). Chi tiết: ${detail}`
      );
    case error.status === 429:
      return wrap(
        424,
        `Nhà cung cấp AI giới hạn tốc độ hoặc hết hạn mức (HTTP 429). Chờ ít phút rồi thử lại, hoặc kiểm tra gói/quota của API key. Chi tiết: ${detail}`
      );
    case error.status !== undefined && error.status >= 500:
      return wrap(
        424,
        `Nhà cung cấp AI đang lỗi tạm thời (HTTP ${error.status}). Thử lại sau ít phút. Chi tiết: ${detail}`
      );
    default:
      return wrap(424, `AI không xử lý được yêu cầu (${code}): ${detail}`);
  }
}
