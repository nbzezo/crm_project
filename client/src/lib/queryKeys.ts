import type { QueryClient } from '@tanstack/react-query';

/** Lam moi moi khung nhin phu thuoc vao du lieu the: kanban, bang, lich, timeline, tong quan. */
export function invalidateCardViews(queryClient: QueryClient, boardId?: number): void {
  queryClient.invalidateQueries({ queryKey: ['tasks'] });
  queryClient.invalidateQueries({ queryKey: ['calendar'] });
  queryClient.invalidateQueries({ queryKey: ['timeline'] });
  queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  queryClient.invalidateQueries({ queryKey: ['reports'] });
  if (boardId) queryClient.invalidateQueries({ queryKey: ['board', boardId] });
  else queryClient.invalidateQueries({ queryKey: ['board'] });
}

/**
 * Chi lam moi lich (va chuong nhac, vi moc nhac cua su kien duoc tinh tu no).
 *
 * Tach rieng khoi `invalidateCardViews`: mot su kien lich ca nhan khong dinh
 * toi cong viec / dong thoi gian / tong quan / bao cao, nen khong can nap lai
 * sau khoa do chi vi nguoi dung keo mot su kien.
 */
export function invalidateCalendar(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ['calendar'] });
  queryClient.invalidateQueries({ queryKey: ['reminders'] });
}

/** Lam moi bang doanh thu, danh muc dich vu va ho so khach hang lien quan. */
export function invalidateRevenueViews(queryClient: QueryClient, customerId?: number): void {
  queryClient.invalidateQueries({ queryKey: ['revenues'] });
  queryClient.invalidateQueries({ queryKey: ['services'] });
  if (customerId) queryClient.invalidateQueries({ queryKey: ['customer', customerId] });
  else queryClient.invalidateQueries({ queryKey: ['customer'] });
}

/** Lam moi cac khung nhin CRM. */
export function invalidateCrmViews(queryClient: QueryClient, customerId?: number): void {
  queryClient.invalidateQueries({ queryKey: ['customers'] });
  queryClient.invalidateQueries({ queryKey: ['deals'] });
  queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  queryClient.invalidateQueries({ queryKey: ['reports'] });
  if (customerId) queryClient.invalidateQueries({ queryKey: ['customer', customerId] });
  else queryClient.invalidateQueries({ queryKey: ['customer'] });
}
