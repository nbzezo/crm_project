import { useLayoutEffect, useRef, useState } from 'react';

/** Khoang trong giua cac the (px). Phai khop `gap-x-3` cua luoi ghi chu. */
export const MASONRY_GUTTER = 12;

/**
 * Cho mot the biet no chiem bao nhieu "dong" trong luoi masonry.
 *
 * VAN DE: luoi thuong (`grid-template-columns` + `items-start`) van xep theo
 * HANG — chieu cao mot hang bang the CAO NHAT trong hang do. Mot ghi chu dai
 * lam ca hang do phinh ra, va cac the ben canh de lai mot vung trong lon ben
 * duoi ma khong the co ghi chu nao lap vao.
 *
 * CACH LAM: dat `grid-auto-rows: 1px` roi cho moi the `grid-row-end: span
 * <chieu cao>`. Luc nay "hang" khong con la mot dai ngang nua — moi the chi
 * chiem dung so pixel no can, nen the tiep theo dien vao cot nao con trong
 * truoc. Do chinh la masonry, ma van la CSS Grid that: khong tinh toa do bang
 * JS, khong dinh vi tuyet doi, keo-tha cua dnd-kit van do duoc vi tri that.
 *
 * KHONG dung `grid-auto-flow: dense`: dense cho phep mot the NHAY LEN tren mot
 * the dung truoc no de bit lo, tuc la thu tu nhin thay khac thu tu that. Bang
 * nay cho keo-tha de sap xep tay, nen thu tu phai la thu nguoi dung tin duoc.
 *
 * Do bang `offsetHeight` chu khong phai `getBoundingClientRect()`: luc keo,
 * dnd-kit dat `transform` (co the kem `scale`) len the, ma rect thi tinh ca
 * bien dang do con `offsetHeight` thi khong.
 *
 * LUU Y: luoi phai giu `items-start`. Neu the bi keo gian cho day o luoi thi
 * chieu cao do duoc lai bang chinh span vua dat — moi lan do span lai lon them,
 * thanh mot vong lap khong dung.
 */
export function useMasonrySpan(enabled: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [span, setSpan] = useState<number | null>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!enabled || !node) {
      setSpan(null);
      return;
    }
    /* Do ngay trong layout effect (truoc khi ve) de khong co mot khung hinh
       dau tien cao 1px roi moi giat ve dung cho. */
    const measure = () => setSpan(node.offsetHeight + MASONRY_GUTTER);
    measure();
    /* The cao len khi anh/tag tai xong, khi doi be ngang cua so, hoac khi
       nguoi dung vua sua noi dung — do lai thay vi giu so cu. */
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled]);

  return { ref, span };
}
