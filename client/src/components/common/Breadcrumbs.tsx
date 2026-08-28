import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { focusRing } from './ui';

export interface Crumb {
  label: string;
  /** Bo trong o muc cuoi — do la trang hien tai, khong tro di dau. */
  to?: string;
}

/**
 * Duong dan phan cap cho cac man hinh sau ba tang.
 *
 * Truoc day moi trang chi tiet chi co mot mui ten quay lai. Hai van de:
 * tren trang Khach hang va Co hoi do la mot lien ket CHI CO ICON, khong co ten
 * truy cap nao — trinh doc man hinh chi doc duoc "link"; va no khong cho biet
 * dang dung o dau trong chuoi Khach hang → Ho so → Co hoi.
 *
 * Muc cuoi khong phai lien ket va mang `aria-current="page"`: no la noi dang
 * dung, khong phai cho de bam toi.
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Đường dẫn phân cấp">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-tr-muted">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1">
              {index > 0 && (
                <ChevronRight size={13} className="shrink-0 text-tr-muted/70" aria-hidden="true" />
              )}
              {last || !item.to ? (
                <span
                  aria-current={last ? 'page' : undefined}
                  className="max-w-[22rem] truncate font-medium text-tr-subtle"
                  title={item.label}
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  to={item.to}
                  className={`max-w-[16rem] truncate rounded-compact hover:text-tr-primary hover:underline ${focusRing}`}
                  title={item.label}
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
