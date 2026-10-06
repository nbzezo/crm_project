import { useQuery, type QueryClient } from '@tanstack/react-query';
import type { CardFlow, CardStatus, FlowStatus, TaskFlowSettings } from '@workflow/contracts';
import { api } from '../../api/client';
import { invalidateCardViews } from '../../lib/queryKeys';

export const TASK_FLOW_SETTINGS_KEY = ['task-flow-settings'] as const;

/**
 * Cấu hình Quy trình (v66). Lỗi (vd tài khoản không có quyền Công việc) coi như
 * tính năng tắt — thà không hiện gì còn hơn hiện nút bấm vào là lỗi.
 */
export function useTaskFlowSettings() {
  const query = useQuery({
    queryKey: TASK_FLOW_SETTINGS_KEY,
    queryFn: () => api.get<TaskFlowSettings>('/api/task-flows/settings'),
    staleTime: 5 * 60_000,
    retry: false,
  });
  return { settings: query.data ?? null, enabled: query.data?.enabled === true };
}

export interface FlowMutationResult {
  flow: CardFlow | null;
  advanced_to: CardStatus | null;
}

export const taskFlowApi = {
  create: (cardId: number, status: FlowStatus, steps?: string[]) =>
    api.post<FlowMutationResult>(`/api/task-flows/cards/${cardId}`, { status, steps }),
  remove: (flowId: number) => api.del<FlowMutationResult>(`/api/task-flows/${flowId}`),
  addStep: (flowId: number, content: string) =>
    api.post<FlowMutationResult>(`/api/task-flows/${flowId}/steps`, { content }),
  tick: (stepId: number, done: boolean) =>
    api.patch<FlowMutationResult>(`/api/task-flows/steps/${stepId}`, { done }),
  rename: (stepId: number, content: string) =>
    api.patch<FlowMutationResult>(`/api/task-flows/steps/${stepId}`, { content }),
  removeStep: (stepId: number) => api.del<FlowMutationResult>(`/api/task-flows/steps/${stepId}`),
};

/** Quy trình đổi thì tiến độ trên thẻ, danh sách và có thể cả trạng thái đều đổi. */
export function refreshAfterFlowChange(queryClient: QueryClient, cardId: number): void {
  queryClient.invalidateQueries({ queryKey: ['card', cardId] });
  invalidateCardViews(queryClient);
}

/** Mỗi dòng một bước; bỏ dòng trống. */
export function parseSteps(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
