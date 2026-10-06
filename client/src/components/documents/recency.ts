/**
 * Nhom danh sach theo moc thoi gian cho thu vien trang: Hom nay / 7 ngay qua /
 * Cu hon. `keyOf` tra chuoi ngay gio SQLite (`YYYY-MM-DD HH:MM:SS`, gio dia
 * phuong) — so sanh theo phan NGAY nen khong vuong mui gio.
 */
export interface RecencyGroup<T> {
  key: 'today' | 'week' | 'older';
  label: string;
  items: T[];
}

const LABELS: Record<RecencyGroup<unknown>['key'], string> = {
  today: 'Hôm nay',
  week: '7 ngày qua',
  older: 'Cũ hơn',
};

function dayString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function groupByRecency<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  now: Date = new Date()
): RecencyGroup<T>[] {
  const today = dayString(now);
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 6);
  const weekStart = dayString(weekAgo);

  const groups: RecencyGroup<T>[] = [];
  for (const item of items) {
    const day = keyOf(item).slice(0, 10);
    const key = day >= today ? 'today' : day >= weekStart ? 'week' : 'older';
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      // Danh sach da sap moi nhat truoc nen nhom chi doi theo mot chieu.
      group = groups.find((g) => g.key === key) ?? { key, label: LABELS[key], items: [] };
      if (!groups.includes(group)) groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}
