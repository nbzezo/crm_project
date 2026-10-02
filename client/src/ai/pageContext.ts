import { useQuery } from '@tanstack/react-query';
import { matchPath } from 'react-router';
import { api } from '../api/client';
import type { Customer, Deal } from '../types';
import type { AiPageContext } from './types';

/**
 * Ban ghi dang xem, doc tu duong dan khi mo bang Tro ly nhanh.
 *
 * Chi hai loai co ho so ngu canh day du o may chu (buildCustomerContext /
 * buildDealContext) — them loai moi thi them ca builder lan kiem quyen o
 * routes/ai.ts truoc, roi moi them duong dan o day.
 */
export function pageContextOf(pathname: string): AiPageContext | null {
  const customer = matchPath('/customers/:customerId', pathname);
  if (customer) return idContext('customer', customer.params.customerId);
  const deal = matchPath('/deals/:dealId', pathname);
  if (deal) return idContext('deal', deal.params.dealId);
  return null;
}

function idContext(type: AiPageContext['type'], raw: string | undefined): AiPageContext | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? { type, id } : null;
}

export const PAGE_CONTEXT_NOUN: Record<AiPageContext['type'], string> = {
  customer: 'Khách hàng',
  deal: 'Cơ hội',
};

/** Goi y cau hoi khi dang xem mot ban ghi — thay cho goi y chung chung. */
export const PAGE_CONTEXT_SUGGESTIONS: Record<AiPageContext['type'], string[]> = {
  customer: [
    'Tóm tắt tình hình khách hàng này.',
    'Khách hàng này có rủi ro gì cần lưu ý?',
    'Bước tiếp theo nên làm với khách hàng này là gì?',
    'Hợp đồng và cơ hội nào của khách này cần chú ý?',
  ],
  deal: [
    'Đánh giá khả năng chốt cơ hội này.',
    'Cơ hội này đang thiếu thông tin gì?',
    'Đề xuất bước tiếp theo cho cơ hội này.',
    'Ai trong hội đồng mua cần tiếp cận thêm?',
  ],
};

/**
 * Ten ban ghi de hien tren nhan "Dang xem". Dung DUNG query key va endpoint
 * cua trang chi tiet (CustomerDetailPage / DealDetailPage), nen khi bang mo tu
 * chinh trang do thi doc tu bo nho dem, khong ton them request nao.
 */
export function usePageContextLabel(context: AiPageContext | null): string | null {
  const customer = useQuery({
    queryKey: ['customer', context?.id],
    queryFn: () => api.get<Customer>(`/api/customers/${context!.id}/full`),
    enabled: context?.type === 'customer',
  });
  const deal = useQuery({
    queryKey: ['deal', context?.id, 'full'],
    queryFn: () => api.get<Deal>(`/api/deals/${context!.id}`),
    enabled: context?.type === 'deal',
  });
  if (!context) return null;
  const name = context.type === 'customer' ? customer.data?.name : deal.data?.title;
  return name?.trim() || `${PAGE_CONTEXT_NOUN[context.type]} #${context.id}`;
}
