import type { HTMLAttributes, ReactNode } from 'react';
import { useMatches } from 'react-router';

type PageWidth = 'default' | 'wide' | 'content' | 'narrow';
type PageSpacing = 'none' | 'sm' | 'md' | 'lg';

const WIDTHS: Record<PageWidth, string> = {
  default: '',
  wide: 'mx-auto w-full max-w-[112rem]',
  content: 'mx-auto w-full max-w-[1400px]',
  narrow: 'mx-auto w-full max-w-4xl',
};

const SPACING: Record<PageSpacing, string> = {
  none: '',
  sm: 'space-y-3',
  md: 'space-y-4',
  lg: 'space-y-5',
};

export function PageShell({
  width = 'default',
  spacing = 'md',
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  width?: PageWidth;
  spacing?: PageSpacing;
}) {
  return (
    /* pb-24: nut "Tạo nhanh" ghim co dinh o goc duoi phai (56px + le) va truoc
       day de len dong cuoi bang Khach hang, panel Hoat dong, va the "Cần bạn xử
       lý" tren mobile. Chua chan cho san o day de moi trang dung PageShell deu
       cuon het duoc noi dung. */
    <div
      {...props}
      className={`${WIDTHS[width]} ${SPACING[spacing]} p-4 pb-24 sm:p-6 sm:pb-28 ${className}`}
    />
  );
}

/**
 * Tieu de trang dung chung. Bo `title` thi tu lay ten tu `handle.title` cua
 * route dang mo — cung mot nguon voi sidebar va document.title, nen khong the
 * lech nhau nhu truoc.
 */
export function PageHeader({
  title,
  description,
  actions,
  align = 'start',
  className = '',
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  align?: 'start' | 'center';
  className?: string;
}) {
  const matches = useMatches();
  const routeTitle = [...matches]
    .reverse()
    .map((match) => (match.handle as { title?: string } | undefined)?.title)
    .find(Boolean);

  return (
    <header
      className={`${actions ? `flex flex-wrap justify-between gap-4 ${align === 'center' ? 'items-center' : 'items-start'}` : ''} ${className}`}
    >
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-semibold tracking-tight text-tr-text">
          {title ?? routeTitle}
        </h1>
        {description && <p className="mt-1 text-sm text-tr-muted">{description}</p>}
      </div>
      {actions}
    </header>
  );
}
