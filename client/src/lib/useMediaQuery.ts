import { useSyncExternalStore } from 'react';

/**
 * Doc mot media query trong React.
 *
 * Dung cho cac trang co HAI bien the danh sach — bang tren man hinh rong, the
 * tren man hinh hep. Truoc day ca hai deu duoc render roi mot cai bi `hidden`
 * che di: DOM van chua ca hai, nen moi dong duoc dung HAI lan va chi phi do
 * tang tuyen tinh theo do dai danh sach. Do tren trang Khach hang: 3 hang bang
 * + 3 the cho dung 3 khach hang.
 *
 * `useSyncExternalStore` doc gia tri dong bo ngay lan render dau, nen khong co
 * canh chop tu bo cuc sai sang bo cuc dung nhu khi dung useState + useEffect.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    // Gia tri khi khong co `window`. App nay chi chay o trinh duyet, nhung
    // useSyncExternalStore van doi mot ham server snapshot.
    () => false
  );
}

/** Breakpoint `lg` cua Tailwind — moc ma cac trang danh sach doi bang <-> the. */
export const LG_QUERY = '(min-width: 1024px)';
