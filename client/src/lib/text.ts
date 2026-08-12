/** Bo dau + ha chu thuong de tim kiem khong phan biet dau, hoa/thuong. */
export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('vi');
}
