import type { ReactNode } from 'react';
import { ArrowLeft, MoreHorizontal } from 'lucide-react';
import { Link } from 'react-router';
import { Popover, usePopover } from '../common/Popover';
import { focusRing } from '../common/ui';

export interface DetailHeaderAction {
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  onClick: () => void;
}

export function DetailHeader({
  backTo,
  backLabel,
  breadcrumbs,
  title,
  badges,
  labels,
  meta,
  primaryAction,
  supportingAction,
  secondaryActions = [],
}: {
  backTo: string;
  backLabel: string;
  breadcrumbs?: ReactNode;
  title: ReactNode;
  badges?: ReactNode;
  labels?: ReactNode;
  meta?: ReactNode;
  primaryAction: ReactNode;
  supportingAction?: ReactNode;
  secondaryActions?: DetailHeaderAction[];
}) {
  const menu = usePopover();

  return (
    <header className="mb-4">
      {breadcrumbs && <div className="max-md:hidden">{breadcrumbs}</div>}
      <div className="mt-2 flex flex-wrap items-start gap-3">
        <Link
          to={backTo}
          aria-label={backLabel}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-tr-muted hover:bg-tr-hover fine:h-8 fine:w-8 ${focusRing}`}
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </Link>

        <div className="min-w-0 flex-1 max-md:order-2 max-md:basis-full">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="tr-display min-w-0 text-xl font-semibold text-tr-text">{title}</h1>
            {badges}
          </div>
          <span className="tr-rule" aria-hidden="true" />
          {labels}
          {meta && (
            <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-tr-muted md:flex md:flex-wrap md:gap-4">
              {meta}
            </div>
          )}
        </div>

        <div className="flex w-full items-center gap-2 max-md:order-3 md:w-auto md:shrink-0">
          <div className="min-w-0 flex-1 md:flex-none">{primaryAction}</div>
          {supportingAction}
          {secondaryActions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              className={`hidden min-h-11 items-center gap-1.5 rounded-control px-3 text-sm font-medium transition hover:bg-tr-hover fine:min-h-8 md:inline-flex ${
                action.danger ? 'text-tr-danger' : 'text-tr-text'
              } ${focusRing}`}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
          {secondaryActions.length > 0 && (
            <>
              <button
                type="button"
                onClick={menu.toggle}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-tr-muted hover:bg-tr-hover md:hidden ${focusRing}`}
                aria-label="Thao tác khác"
                aria-expanded={menu.open}
              >
                <MoreHorizontal size={20} aria-hidden="true" />
              </button>
              <Popover open={menu.open} onClose={menu.close} anchor={menu.anchor} title="Thao tác">
                <div className="space-y-1">
                  {secondaryActions.map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      onClick={() => {
                        menu.close();
                        action.onClick();
                      }}
                      className={`flex min-h-11 w-full items-center gap-2 rounded-control px-3 text-left text-sm hover:bg-tr-hover ${
                        action.danger ? 'text-tr-danger' : 'text-tr-text'
                      } ${focusRing}`}
                    >
                      {action.icon}
                      {action.label}
                    </button>
                  ))}
                </div>
              </Popover>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
