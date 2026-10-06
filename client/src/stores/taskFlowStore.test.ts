import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../api/client';
import { flowPromptOf, useTaskFlowStore } from './taskFlowStore';

const INCOMPLETE = {
  error: 'Quy trình của trạng thái hiện tại chưa xong',
  code: 'FLOW_INCOMPLETE',
  status: 'doing',
  total: 3,
  done: 1,
  remaining: ['Cấu hình', 'Kiểm thử'],
};

function reply(status: number, body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  );
}

/** Chờ hàng đợi có `count` yêu cầu xác nhận (lớp API đẩy vào sau một vòng await). */
async function waitForSkips(count: number) {
  await vi.waitFor(() => expect(useTaskFlowStore.getState().skips).toHaveLength(count));
}

describe('Quy trình: lớp gọi API hỏi bỏ qua rồi gửi lại', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    useTaskFlowStore.setState({ skips: [], prompts: [] });
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('đồng ý bỏ qua thì gửi lại đúng yêu cầu kèm skip_flow', async () => {
    fetchMock
      .mockReturnValueOnce(reply(409, INCOMPLETE))
      .mockReturnValueOnce(reply(200, { id: 7, status: 'review', flow_prompt: null }));

    const pending = api.patch('/api/cards/7', { status: 'review' });
    await waitForSkips(1);
    expect(useTaskFlowStore.getState().skips[0].details.remaining).toEqual([
      'Cấu hình',
      'Kiểm thử',
    ]);
    useTaskFlowStore.getState().answerSkip(true);

    await expect(pending).resolves.toMatchObject({ id: 7, status: 'review' });
    const retry = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(retry).toEqual({ status: 'review', skip_flow: true });
  });

  it('giữ nguyên thì báo lỗi đã hủy, không gửi lại', async () => {
    fetchMock.mockReturnValueOnce(reply(409, INCOMPLETE));
    const pending = api.patch('/api/cards/7/move', { list_id: 3 });
    await waitForSkips(1);
    useTaskFlowStore.getState().answerSkip(false);

    const error = await pending.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).details.cancelled).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('409 khác hoặc đường dẫn không phải đổi trạng thái thì không hỏi', async () => {
    fetchMock.mockReturnValueOnce(reply(409, { error: 'Trùng', code: 'FLOW_EXISTS' }));
    await expect(api.patch('/api/cards/7', { status: 'doing' })).rejects.toBeInstanceOf(ApiError);

    fetchMock.mockReturnValueOnce(reply(409, INCOMPLETE));
    await expect(api.post('/api/deals/7/move', {})).rejects.toBeInstanceOf(ApiError);
    expect(useTaskFlowStore.getState().skips).toHaveLength(0);
  });

  it('thao tác hàng loạt: trả lời "tất cả" một lần cho mọi yêu cầu đang chờ', async () => {
    fetchMock.mockImplementation((_url: string, init: RequestInit) =>
      JSON.parse(init.body as string).skip_flow
        ? reply(200, { ok: true, flow_prompt: null })
        : reply(409, INCOMPLETE)
    );
    const all = Promise.all(
      [1, 2, 3].map((id) => api.patch(`/api/cards/${id}`, { is_done: true }))
    );
    await waitForSkips(3);
    useTaskFlowStore.getState().answerSkip(true, true);
    await expect(all).resolves.toHaveLength(3);
    expect(useTaskFlowStore.getState().skips).toHaveLength(0);
  });

  it('phản hồi có flow_prompt thì đưa vào hàng hỏi, trùng thì chỉ hỏi một lần', async () => {
    const body = { id: 9, flow_prompt: { card_id: 9, status: 'doing' } };
    fetchMock.mockReturnValueOnce(reply(200, body)).mockReturnValueOnce(reply(200, body));
    await api.patch('/api/cards/9', { status: 'doing' });
    await api.patch('/api/cards/9', { status: 'doing' });
    expect(useTaskFlowStore.getState().prompts).toEqual([{ card_id: 9, status: 'doing' }]);
  });
});

describe('flowPromptOf', () => {
  it('chỉ nhận đúng hình dạng máy chủ gửi', () => {
    expect(flowPromptOf({ flow_prompt: { card_id: 1, status: 'review' } })).toEqual({
      card_id: 1,
      status: 'review',
    });
    expect(flowPromptOf({ flow_prompt: null })).toBeNull();
    expect(flowPromptOf({})).toBeNull();
    expect(flowPromptOf(null)).toBeNull();
    expect(flowPromptOf({ flow_prompt: { status: 'review' } })).toBeNull();
  });
});
