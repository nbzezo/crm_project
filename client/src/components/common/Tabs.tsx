import { Fragment, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { focusRing } from './ui';

interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
  icon?: ReactNode;
  /** Tiêu đề nhóm hiện ngay trên mục này. Chỉ dùng ở hướng dọc. */
  group?: string;
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
  orientation = 'horizontal',
}: {
  value: T;
  onChange: (value: T) => void;
  items: TabItem<T>[];
  ariaLabel: string;
  idPrefix: string;
  children: ReactNode;
  className?: string;
  panelClassName?: string;
  /**
   * `vertical` dùng cho màn có quá nhiều mục để xếp một hàng ngang.
   *
   * Một dải tab ngang chỉ chứa được chừng sáu mục trước khi phải cuộn, và một
   * dải cuộn không có dấu hiệu gì thì các mục phía sau coi như không tồn tại với
   * người dùng. Cột dọc có chỗ cho nhãn đầy đủ, cho tiêu đề nhóm, và trả lại
   * chiều rộng cho nội dung.
   */
  orientation?: 'horizontal' | 'vertical';
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const panelId = `${idPrefix}-panel`;
  const vertical = orientation === 'vertical';

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

  const list = (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      aria-orientation={vertical ? 'vertical' : undefined}
      className={
        vertical
          ? `tr-tabs flex flex-col gap-0.5 ${className}`
          : `tr-tabs tr-scroll flex flex-nowrap gap-1 overflow-x-auto border-b border-tr-border ${className}`
      }
    >
      {items.map((item, index) => {
        const selected = value === item.value;
        const button = (
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
            className={
              vertical
                ? `tr-tab flex min-h-[44px] w-full items-center gap-2 rounded-control px-2.5 text-left text-sm font-medium transition fine:min-h-9 ${focusRing} ${
                    selected
                      ? 'bg-tr-surface text-tr-primary'
                      : 'text-tr-subtle hover:bg-tr-hover hover:text-tr-text'
                  }`
                : `tr-tab -mb-px inline-flex min-h-[44px] shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm font-medium transition fine:min-h-0 sm:py-2 ${focusRing} ${
                    selected
                      ? 'border-tr-primary text-tr-primary'
                      : 'border-transparent text-tr-subtle hover:text-tr-text'
                  }`
            }
          >
            {item.icon}
            <span className={vertical ? 'min-w-0 truncate' : undefined}>{item.label}</span>
            {item.count ? ` (${item.count})` : ''}
          </button>
        );

        /* Tiêu đề nhóm là phần tử ANH EM của nút, không bọc nút vào một thẻ
           khác: `role="tablist"` đòi các `role="tab"` là con trực tiếp, lồng
           thêm một lớp div sẽ làm trình đọc màn hình mất quan hệ đó. */
        if (vertical && item.group) {
          return (
            <Fragment key={item.value}>
              <div
                role="presentation"
                className="mt-3 px-2.5 pb-1 text-[11px] font-semibold tracking-[0.06em] text-tr-muted uppercase first:mt-0"
              >
                {item.group}
              </div>
              {button}
            </Fragment>
          );
        }
        return button;
      })}
    </div>
  );

  const panel = (
    <div
      id={panelId}
      role="tabpanel"
      aria-labelledby={`${idPrefix}-${value}`}
      className={panelClassName}
    >
      {children}
    </div>
  );

  if (!vertical) {
    return (
      <>
        {list}
        {panel}
      </>
    );
  }

  /* Dưới md: cột nhóm xếp TRÊN nội dung thay vì quay lại kiểu cuộn ngang — màn
     hẹp chính là nơi dải tab ngang hỏng nặng nhất. */
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] md:gap-6">
      <div className="md:sticky md:top-4 md:self-start">{list}</div>
      {panel}
    </div>
  );
}
