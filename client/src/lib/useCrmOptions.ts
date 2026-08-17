import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { Customer, Deal, DealsResponse, Project } from '../types';

export function useCustomerOptions(enabled = true) {
  return useQuery({
    queryKey: ['customers', 'select'],
    queryFn: () => api.get<Customer[]>('/api/customers'),
    staleTime: 60_000,
    enabled,
  });
}

/**
 * Dự án chọn được khi liên kết từ một cơ hội.
 *
 * Không lọc theo khách hàng ở đây: dự án nội bộ (`customer_id` rỗng) là lựa chọn
 * hợp lệ cho bất kỳ cơ hội nào — máy chủ mới là nơi từ chối cặp khác khách hàng,
 * và nó nói rõ lý do. Lọc sẵn ở giao diện chỉ làm dự án "biến mất" không giải thích.
 */
export function useProjectOptions(enabled = true) {
  return useQuery({
    queryKey: ['projects', 'select'],
    queryFn: () => api.get<Project[]>('/api/projects'),
    staleTime: 60_000,
    enabled,
  });
}

export function useDealsByCustomer(customerId: string, enabled = true) {
  return useQuery({
    queryKey: ['deals', 'byCustomer', customerId],
    queryFn: () => api.get<DealsResponse>(`/api/deals?customer_id=${customerId}`),
    select: (data): Deal[] => Object.values(data.stages).flat(),
    enabled: enabled && customerId !== '',
  });
}
