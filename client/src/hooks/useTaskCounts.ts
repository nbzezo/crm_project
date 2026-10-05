import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

export interface TaskCounts {
  owned: number;
  assigned: number;
  created: number;
  watching: number;
  completed: number;
  /** Viec "Can theo doi" (cung luat voi `selectNeedsNudge`). */
  nudge: number;
  /** Trong so do, viec den han hom nay. */
  nudge_today: number;
}

/**
 * So dem cong viec tinh o may chu: thanh ben man Cong viec, huy hieu "Can theo doi"
 * tren menu va thanh tab di dong, o Tong quan. Cung queryKey nen chung mot request.
 *
 * Truoc 1.21.0 cac huy hieu nay tai ca danh sach viec ve roi dem o trinh duyet — tren
 * MOI trang, vi menu luon hien.
 */
export function useTaskCounts(options: { staleTime?: number; enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['tasks', 'counts'],
    queryFn: () => api.get<TaskCounts>('/api/views/tasks/counts'),
    staleTime: options.staleTime ?? 30_000,
    enabled: options.enabled,
  });
}
