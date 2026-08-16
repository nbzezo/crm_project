import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { Customer, Deal, DealsResponse } from '../types';

export function useCustomerOptions(enabled = true) {
  return useQuery({
    queryKey: ['customers', 'select'],
    queryFn: () => api.get<Customer[]>('/api/customers'),
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
