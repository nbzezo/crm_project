import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { focusRing } from './ui';

export interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
  icon?: ReactNode;
}

export function Tabs<T extends string>({
  value,
  onChange,
  items,
  ariaLabel,
  idPrefix,
  children,
  className = '',
  panelClassName = '',
}: {
  value: T;
  onChange: (value: T) => void;
  items: TabItem<T>[];
  ariaLabel: string;
  idPrefix: string;
  children: ReactNode;
  className?: string;
  panelClassName?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const panelId = `${idPrefix}-panel`;

  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, nextIndex: number) => {
    event.preventDefault();
    const next = items[nextIndex];
    if (!next) return;
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons?.[nextIndex]?.focus();
    onChange(next.value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'Home') return moveFocus(event, 0);
    if (event.key === 'End') return moveFocus(event, items.length - 1);
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      return moveFocus(event, (index + 1) % items.length);
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      return moveFocus(event, (index - 1 + items.length) % items.length);
    }
  };

  return (
    <>
      <div
        ref={listRef}
        role="tablist"
        aria-label={ariaLabel}
        className={`flex flex-wrap gap-1 border-b border-tr-border ${className}`}
      >
        {items.map((item, index) => {
          const selected = value === item.value;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              id={`${idPrefix}-${item.value}`}
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(item.value)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`-mb-px inline-flex min-h-[44px] items-center gap-1.5 border-b-2 px-3 text-sm font-medium transition sm:min-h-0 sm:py-2 ${focusRing} ${
                selected
                  ? 'border-tr-primary text-tr-primary'
                  : 'border-transparent text-tr-subtle hover:text-tr-text'
              }`}
            >
              {item.icon}
              {item.label}
              {item.count ? ` (${item.count})` : ''}
            </button>
          );
        })}
      </div>

      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={`${idPrefix}-${value}`}
        className={panelClassName}
      >
        {children}
      </div>
    </>
  );
}
