import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import { createQuickTask } from './quickTask';

vi.mock('../api/client', () => ({ api: { post: vi.fn() } }));
const post = vi.mocked(api.post);

beforeEach(() => post.mockReset());

describe('createQuickTask', () => {
  it('giữ lỗi tạo việc để giao diện không xóa draft', async () => {
    post.mockRejectedValueOnce(new Error('mất mạng'));
    await expect(
      createQuickTask({ title: 'Gọi khách', priority: 'medium', due_date: null })
    ).rejects.toThrow('mất mạng');
  });

  it('việc đã tạo vẫn thành công khi riêng lời nhắc lỗi', async () => {
    post
      .mockResolvedValueOnce({ id: 7, title: 'Gọi khách' })
      .mockRejectedValueOnce(new Error('lỗi nhắc'));
    await expect(
      createQuickTask(
        { title: 'Gọi khách', priority: 'medium', due_date: null },
        '2026-11-01 09:00'
      )
    ).resolves.toMatchObject({ card: { id: 7 }, reminderFailed: true });
  });
});
