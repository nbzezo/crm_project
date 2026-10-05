import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from './ui';

/**
 * Moc "tai them" o cuoi danh sach dai (1.21.0).
 *
 * Tu goi `onLoadMore` khi moc lot vao vung nhin (cach 400px truoc khi cham day), va
 * goi tiep khi trang vua tai xong ma moc VAN con trong vung nhin — danh sach ngan
 * hon man hinh van tai den khi day man hoac het du lieu. Luon kem mot nut bam that
 * cho ban phim, trinh doc man hinh va trinh duyet khong co IntersectionObserver.
 */
export function LoadMoreSentinel({
  hasMore,
  loading,
  onLoadMore,
  label,
  endLabel,
  progress,
}: {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  /** Chu tren nut, vd "Tải việc đã xong cũ hơn 30 ngày". */
  label: string;
  /** Hien khi da het, vd "Đã hiện hết việc cũ". Bo trong thi khong hien gi. */
  endLabel?: string;
  /**
   * Doi moi khi vua tai/ve them xong ma `loading` khong doi (vd ve dan tren may) —
   * de moc goi tiep neu van con nam trong vung nhin.
   */
  progress?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  /* Moi lan moc LOT VAO vung nhin chi tu tai mot dot. Neu tai xong ma moc van dung
     yen trong vung nhin (dong moi roi vao nhom dang thu gon, hoac bi bo loc an di)
     thi dung lai cho nguoi dung bam — khong am tham tai het hang tram trang. */
  const armed = useRef(true);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const isVisible = entries.some((entry) => entry.isIntersecting);
        if (!isVisible) armed.current = true;
        setVisible(isVisible);
      },
      { rootMargin: '400px 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !hasMore || loading || !armed.current) return;
    armed.current = false;
    onLoadMore();
  }, [visible, hasMore, loading, onLoadMore]);

  /* Sau mot dot ve them tren may (`progress` doi, `loading` khong doi), `visible` con
     la gia tri CU: IntersectionObserver chi bao lai khi trang thai doi, va chi sau mot
     khung hinh. Goi tiep ngay theo `visible` cu se ve lien tuc den het danh sach. Do
     lai vi tri that o khung hinh ke tiep — moi khung hinh toi da mot dot. */
  useEffect(() => {
    if (progress === undefined) return;
    const frame = requestAnimationFrame(() => {
      const node = ref.current;
      if (!node || !hasMore || loading) return;
      const rect = node.getBoundingClientRect();
      if (rect.top < window.innerHeight + 400 && rect.bottom > -400) onLoadMore();
    });
    return () => cancelAnimationFrame(frame);
  }, [progress]);

  return (
    <div ref={ref} className="flex min-h-12 items-center justify-center py-3">
      {loading ? (
        <span role="status" className="inline-flex items-center gap-2 text-sm text-tr-muted">
          <Loader2 size={15} className="animate-spin" aria-hidden="true" />
          Đang tải thêm…
        </span>
      ) : hasMore ? (
        <Button variant="ghost" size="sm" onClick={onLoadMore}>
          {label}
        </Button>
      ) : endLabel ? (
        <span className="text-xs text-tr-muted">{endLabel}</span>
      ) : null}
    </div>
  );
}
