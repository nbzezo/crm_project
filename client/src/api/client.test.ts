import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, apiTimeout, bulkFlowBlockedTitles } from './client';

const realFetch = globalThis.fetch;
const realGetTimeout = apiTimeout.getMs;

afterEach(() => {
  globalThis.fetch = realFetch;
  apiTimeout.getMs = realGetTimeout;
  vi.restoreAllMocks();
});

describe('bulkFlowBlockedTitles', () => {
  it('trả đúng tên card bị flow chặn và bỏ dữ liệu lỗi', () => {
    const error = new ApiError(409, 'blocked', {
      code: 'BULK_FLOW_INCOMPLETE',
      blocked: [{ title: 'Việc A' }, { title: 'Việc B' }, null],
    });
    expect(bulkFlowBlockedTitles(error)).toEqual(['Việc A', 'Việc B']);
    expect(bulkFlowBlockedTitles(new Error('khác'))).toEqual([]);
  });
});

describe('api cancellation', () => {
  const hangingFetch = vi.fn(
    (_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      })
  );

  it('dừng GET khi hết timeout', async () => {
    apiTimeout.getMs = 5;
    globalThis.fetch = hangingFetch as typeof fetch;
    await expect(api.get('/api/test')).rejects.toMatchObject({ status: 408 });
  });

  it('tôn trọng AbortSignal do caller truyền vào', async () => {
    globalThis.fetch = hangingFetch as typeof fetch;
    const controller = new AbortController();
    const pending = api.get('/api/test', { signal: controller.signal });
    controller.abort(new Error('user cancelled'));
    await expect(pending).rejects.toThrow('user cancelled');
  });
});
