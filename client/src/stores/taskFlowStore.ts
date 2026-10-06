import { create } from 'zustand';
import type { FlowIncompleteDetails, FlowStatus } from '@workflow/contracts';

/**
 * Hai hàng đợi của Quy trình theo trạng thái (v66), dùng chung cho mọi chỗ đổi
 * trạng thái công việc.
 *
 * Có khoảng mười một chỗ trong giao diện đổi trạng thái (hộp chi tiết, kéo thả
 * kanban, bảng, cây, lịch, Trọng tâm, chuông, thao tác hàng loạt...). Thay vì sửa
 * từng chỗ, lớp gọi API (`api/client.ts`) bắt lỗi `FLOW_INCOMPLETE` và trường
 * `flow_prompt` rồi đẩy vào đây; `TaskFlowDialogs` hiển thị lần lượt. Là hàng đợi
 * vì thao tác hàng loạt sinh nhiều yêu cầu cùng lúc — hộp thoại cho chọn "tất cả".
 */

interface SkipRequest {
  id: number;
  details: FlowIncompleteDetails;
  resolve: (skip: boolean) => void;
}

export interface FlowPrompt {
  card_id: number;
  status: FlowStatus;
}

interface TaskFlowState {
  skips: SkipRequest[];
  prompts: FlowPrompt[];
  askSkip: (details: FlowIncompleteDetails) => Promise<boolean>;
  answerSkip: (skip: boolean, all?: boolean) => void;
  pushPrompt: (prompt: FlowPrompt) => void;
  dropPrompt: (all?: boolean) => void;
}

let nextId = 1;

export const useTaskFlowStore = create<TaskFlowState>((set, get) => ({
  skips: [],
  prompts: [],
  askSkip: (details) =>
    new Promise<boolean>((resolve) => {
      set((s) => ({ skips: [...s.skips, { id: nextId++, details, resolve }] }));
    }),
  answerSkip: (skip, all = false) => {
    const { skips } = get();
    const answered = all ? skips : skips.slice(0, 1);
    for (const request of answered) request.resolve(skip);
    set({ skips: skips.slice(answered.length) });
  },
  pushPrompt: (prompt) =>
    set((s) =>
      // Cùng một việc và trạng thái thì chỉ hỏi một lần.
      s.prompts.some((p) => p.card_id === prompt.card_id && p.status === prompt.status)
        ? s
        : { prompts: [...s.prompts, prompt] }
    ),
  dropPrompt: (all = false) => set((s) => ({ prompts: all ? [] : s.prompts.slice(1) })),
}));

/** Lỗi 409 của máy chủ khi rời một trạng thái có quy trình đang dở. */
export function flowIncompleteOf(details: Record<string, unknown>): FlowIncompleteDetails | null {
  return details.code === 'FLOW_INCOMPLETE' ? (details as unknown as FlowIncompleteDetails) : null;
}

/** Trường `flow_prompt` máy chủ gắn vào phản hồi khi việc vừa vào trạng thái cần hỏi. */
export function flowPromptOf(data: unknown): FlowPrompt | null {
  if (data === null || typeof data !== 'object') return null;
  const prompt = (data as { flow_prompt?: unknown }).flow_prompt;
  if (prompt === null || typeof prompt !== 'object') return null;
  const { card_id, status } = prompt as Partial<FlowPrompt>;
  return typeof card_id === 'number' && typeof status === 'string' ? { card_id, status } : null;
}
