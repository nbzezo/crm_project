/**
 * Lỗi API kèm nguyên vẹn phần dữ liệu server gửi thêm.
 *
 * Cần cho những lỗi mà giao diện phải xử lý chứ không chỉ hiển thị: cổng giai đoạn
 * trả về yếu tố nào đang thiếu, ràng buộc rubric trả về điểm tối đa và việc cần làm.
 */
export class ApiError extends Error {
  status: number;
  details: Record<string, unknown>;
  constructor(status: number, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** Khi phan hoi loi khong phai JSON cua app (thuong la trang loi cua proxy) van noi duoc nguyen nhan. */
function fallbackMessage(status: number): string {
  switch (status) {
    case 502:
      return 'Lỗi 502: máy chủ ứng dụng không phản hồi qua proxy (đang khởi động lại, đã dừng hoặc bị lỗi). Thử lại sau ít phút; nếu lặp lại, kiểm tra log máy chủ.';
    case 503:
      return 'Lỗi 503: máy chủ tạm thời quá tải hoặc đang bảo trì. Thử lại sau ít phút.';
    case 504:
      return 'Lỗi 504: máy chủ xử lý quá lâu nên proxy ngắt kết nối (thường do tác vụ AI chạy lâu). Thử lại hoặc dùng tệp nhỏ hơn.';
    case 413:
      return 'Lỗi 413: tệp vượt quá dung lượng máy chủ cho phép.';
    default:
      return `Lỗi ${status}`;
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  /* FormData: de trinh duyet tu dat Content-Type kem boundary — tu dat se hong tep tai len. */
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const res = await fetch(url, {
    method,
    headers: body === undefined || isForm ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  if (res.status === 401) {
    // Phiên hết giữa chừng: AuthGate sẽ hiện lại màn đăng nhập.
    const { useAuthStore } = await import('../stores/authStore');
    useAuthStore.getState().markSignedOut();
  }
  if (!res.ok) {
    let message = fallbackMessage(res.status);
    let details: Record<string, unknown> = {};
    try {
      const data = (await res.json()) as { error?: string } & Record<string, unknown>;
      if (data.error) message = data.error;
      const { error: _error, ...rest } = data;
      details = rest;
    } catch {
      /* body khong phai JSON */
    }
    throw new ApiError(res.status, message, details);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  postForm: <T>(url: string, form: FormData) => request<T>('POST', url, form),
  patch: <T>(url: string, body: unknown) => request<T>('PATCH', url, body),
  put: <T>(url: string, body: unknown) => request<T>('PUT', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),
};

/** Ghep query string, bo qua cac gia tri rong. */
export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const str = search.toString();
  return str ? `?${str}` : '';
}
