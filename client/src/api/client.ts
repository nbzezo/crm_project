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

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) {
    // Phiên hết giữa chừng: AuthGate sẽ hiện lại màn đăng nhập.
    const { useAuthStore } = await import('../stores/authStore');
    useAuthStore.getState().markSignedOut();
  }
  if (!res.ok) {
    let message = `Lỗi ${res.status}`;
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
