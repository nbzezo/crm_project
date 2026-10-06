import type { QueryClient, QueryKey } from '@tanstack/react-query';

/*
 * Nut "Lam moi" cho cac man tong hop co luu dem 5 phut o may chu (1.22.0).
 *
 * `refetch()` thuong chi nhan lai ban dem. `refreshFresh` danh dau ca mot nhom query
 * (theo phan tu dau cua queryKey) roi tai lai; trong luc do moi queryFn cua nhom dung
 * `freshUrl` se gan them `fresh=1` de may chu tinh lai ngay.
 */
const pending = new Set<string>();

export async function refreshFresh(queryClient: QueryClient, root: string): Promise<void> {
  pending.add(root);
  try {
    await queryClient.refetchQueries({ queryKey: [root], type: 'active' });
  } finally {
    pending.delete(root);
  }
}

/** Gan `fresh=1` vao URL neu nhom cua query dang duoc yeu cau lam moi. */
export function freshUrl(url: string, queryKey: QueryKey): string {
  if (!pending.has(String(queryKey[0]))) return url;
  return `${url}${url.includes('?') ? '&' : '?'}fresh=1`;
}

/** Truong `computed_at` may chu gan vao phan hoi co luu dem (khong co trong type goc). */
export function computedAtOf(data: unknown): string | undefined {
  if (data === null || typeof data !== 'object') return undefined;
  const value = (data as { computed_at?: unknown }).computed_at;
  return typeof value === 'string' ? value : undefined;
}
