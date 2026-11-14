import { flowIncompleteOf, flowPromptOf, useTaskFlowStore } from '../stores/taskFlowStore';

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

/**
 * Đổi trạng thái công việc đi qua Quy trình (v66) ở MỘT chỗ duy nhất.
 *
 * Máy chủ trả 409 `FLOW_INCOMPLETE` khi rời một trạng thái có quy trình đang dở:
 * hỏi người dùng rồi gửi lại với `skip_flow: true`. Phản hồi thành công mang
 * `flow_prompt` khi việc vừa vào trạng thái cần hỏi quy trình: đẩy vào hàng đợi
 * để `TaskFlowDialogs` hỏi. Đặt ở đây để mọi chỗ đổi trạng thái — kể cả những
 * chỗ thêm sau này — tự có hành vi đúng.
 */
const FLOW_GUARDED = /^\/api\/(cards\/\d+(\/move)?|notifications\/[^/]+\/complete)$/;

export interface ApiRequestOptions {
  signal?: AbortSignal;
}

export const apiTimeout = { getMs: 30_000, mutationMs: 120_000, longMs: 5 * 60_000 };

async function request<T>(
  method: string,
  url: string,
  body?: unknown,
  options?: ApiRequestOptions
): Promise<T> {
  const guarded =
    (method === 'PATCH' || method === 'POST') &&
    FLOW_GUARDED.test(url) &&
    body !== null &&
    typeof body === 'object' &&
    !(typeof FormData !== 'undefined' && body instanceof FormData);
  try {
    const data = await send<T>(method, url, body, options);
    notifyFlowPrompt(data);
    return data;
  } catch (error) {
    if (!guarded || !(error instanceof ApiError) || error.status !== 409) throw error;
    const details = flowIncompleteOf(error.details);
    if (!details) throw error;
    const skip = await useTaskFlowStore.getState().askSkip(details);
    if (!skip) {
      throw new ApiError(409, 'Đã giữ nguyên trạng thái', { ...error.details, cancelled: true });
    }
    const data = await send<T>(method, url, { ...body, skip_flow: true }, options);
    notifyFlowPrompt(data);
    return data;
  }
}

/** Người dùng tự chọn "Giữ nguyên trạng thái" — không phải lỗi, đừng báo đỏ. */
export function isUserCancelled(error: unknown): boolean {
  return error instanceof ApiError && error.details.cancelled === true;
}

/** Tên các việc chặn một thao tác bulk vì còn quy trình dở. */
export function bulkFlowBlockedTitles(error: unknown): string[] {
  if (!(error instanceof ApiError) || error.details.code !== 'BULK_FLOW_INCOMPLETE') return [];
  const blocked = error.details.blocked;
  if (!Array.isArray(blocked)) return [];
  return blocked.flatMap((item) =>
    item && typeof item === 'object' && typeof item.title === 'string' ? [item.title] : []
  );
}

function notifyFlowPrompt(data: unknown): void {
  const prompt = flowPromptOf(data);
  if (prompt) useTaskFlowStore.getState().pushPrompt(prompt);
}

async function send<T>(
  method: string,
  url: string,
  body?: unknown,
  options?: ApiRequestOptions
): Promise<T> {
  /* FormData: de trinh duyet tu dat Content-Type kem boundary — tu dat se hong tep tai len. */
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const isLong = isForm || /\/ai(?:\/|-|$)/.test(url);
  const timeoutMs = isLong
    ? apiTimeout.longMs
    : method === 'GET'
      ? apiTimeout.getMs
      : apiTimeout.mutationMs;
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = options?.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined || isForm ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (timeout.aborted && !options?.signal?.aborted) {
      throw new ApiError(408, `Yêu cầu quá thời gian chờ (${Math.round(timeoutMs / 1000)} giây)`);
    }
    throw error;
  }
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
  get: <T>(url: string, options?: ApiRequestOptions) => request<T>('GET', url, undefined, options),
  post: <T>(url: string, body?: unknown, options?: ApiRequestOptions) =>
    request<T>('POST', url, body ?? {}, options),
  postForm: <T>(url: string, form: FormData, options?: ApiRequestOptions) =>
    request<T>('POST', url, form, options),
  patch: <T>(url: string, body: unknown, options?: ApiRequestOptions) =>
    request<T>('PATCH', url, body, options),
  put: <T>(url: string, body: unknown, options?: ApiRequestOptions) =>
    request<T>('PUT', url, body, options),
  del: <T>(url: string, body?: unknown, options?: ApiRequestOptions) =>
    request<T>('DELETE', url, body, options),
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
