import type { QueryClient } from '@tanstack/react-query';

/** Lam moi moi khung nhin phu thuoc vao du lieu the: kanban, bang, lich, timeline, tong quan. */
export function invalidateCardViews(queryClient: QueryClient, boardId?: number): void {
  queryClient.invalidateQueries({ queryKey: ['notifications'] });
  queryClient.invalidateQueries({ queryKey: ['tasks'] });
  queryClient.invalidateQueries({ queryKey: ['calendar'] });
  queryClient.invalidateQueries({ queryKey: ['timeline'] });
  queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  queryClient.invalidateQueries({ queryKey: ['reports'] });
  /* Chi tiet va danh sach du an deu tinh lai cong viec, tien do, suc khoe va
     nhan su tu cards. Thieu hai key nay lam PATCH da thanh cong nhung tab Du an
     van hien gia tri cu (ro nhat o cot Nguoi phu trach). */
  queryClient.invalidateQueries({ queryKey: ['project'] });
  queryClient.invalidateQueries({ queryKey: ['projects'] });
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
  queryClient.invalidateQueries({ queryKey: ['notifications'] });
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
  // Trang To chuc & nhan su doc danh sach rieng ('orgs') — thieu dong nay thi tao/sua
  // cong ty/doi tac/nha cung cap khong lam moi duoc bang o trang do.
  queryClient.invalidateQueries({ queryKey: ['orgs'] });
  queryClient.invalidateQueries({ queryKey: ['deals'] });
  queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  queryClient.invalidateQueries({ queryKey: ['reports'] });
  if (customerId) queryClient.invalidateQueries({ queryKey: ['customer', customerId] });
  else queryClient.invalidateQueries({ queryKey: ['customer'] });
}
