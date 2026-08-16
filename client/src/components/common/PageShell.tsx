import type { HTMLAttributes, ReactNode } from 'react';

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
    <div {...props} className={`${WIDTHS[width]} ${SPACING[spacing]} p-4 sm:p-6 ${className}`} />
  );
}

export function PageHeader({
  title,
  description,
  actions,
  align = 'start',
  className = '',
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  align?: 'start' | 'center';
  className?: string;
}) {
  return (
    <header
      className={`${actions ? `flex flex-wrap justify-between gap-4 ${align === 'center' ? 'items-center' : 'items-start'}` : ''} ${className}`}
    >
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-semibold tracking-tight text-tr-text">{title}</h1>
        {description && <p className="mt-1 text-sm text-tr-muted">{description}</p>}
      </div>
      {actions}
    </header>
  );
}
