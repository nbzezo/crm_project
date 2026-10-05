import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { TaskRow } from '../types';

/**
 * Danh sach viec "Can theo doi" cho trang Theo doi.
 *
 * May chu loc san (`nudge=1`, cung luat voi `selectNeedsNudge`). Huy hieu tren menu
 * va o Tong quan chi can con so nen dung `useTaskCounts`, khong tai danh sach nay.
 */
export function useFollowUpTasks() {
  return useQuery({
    queryKey: ['tasks', 'follow-up'],
    queryFn: () => api.get<TaskRow[]>('/api/views/tasks?done=0&nudge=1'),
  });
}
