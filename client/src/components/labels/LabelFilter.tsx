import { useQuery } from '@tanstack/react-query';
import { Tag } from 'lucide-react';
import { api } from '../../api/client';
import { Popover, usePopover } from '../common/Popover';
import { focusRing } from '../common/ui';
import { contrastInk } from '../../lib/format';
import { t } from '../../i18n/vi';
import type { Label, LabelEntity } from '../../types';

/** Cach ghep nhieu nhan khi loc (FR-TAG-22). Mac dinh 'or' — giu dung hanh vi cu. */
export type LabelMatchMode = 'or' | 'and';

export interface LabelFilterState {
  ids: number[];
  mode: LabelMatchMode;
}

export const EMPTY_LABEL_FILTER: LabelFilterState = { ids: [], mode: 'or' };

/**
 * FR-TAG-21/22: bo ban ghi khong khop bo loc nhan.
 * - or  : co it nhat mot nhan da chon
 * - and : co du moi nhan da chon
 */
export function matchLabelFilter(labelIds: number[], filter: LabelFilterState): boolean {
  if (filter.ids.length === 0) return true;
  return filter.mode === 'and'
    ? filter.ids.every((id) => labelIds.includes(id))
    : filter.ids.some((id) => labelIds.includes(id));
}

/** Nut loc theo nhan dung chung cho trang Khach hang, Co hoi… */
export function LabelFilter({
  scope,
  value,
  onChange,
}: {
  scope: LabelEntity;
  value: LabelFilterState;
  onChange: (next: LabelFilterState) => void;
}) {
  const pop = usePopover();
  const { data: labels = [] } = useQuery({
    queryKey: ['labels', 'pick', scope],
    queryFn: () => api.get<Label[]>(`/api/labels?scope=${scope}`),
  });

  const selected = labels.filter((l) => value.ids.includes(l.id));

  return (
    <>
      <button
        type="button"
        onClick={pop.toggle}
        className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-control border border-tr-border bg-tr-panel px-3 py-1.5 text-sm text-tr-text transition hover:bg-tr-hover fine:min-h-[32px] ${focusRing}`}
      >
        <Tag size={15} />
        {t.card.labels}
        {value.ids.length > 0 && (
          <span className="rounded bg-tr-primary px-1.5 text-xs text-tr-on-primary">
            {value.ids.length}
          </span>
        )}
      </button>

      <Popover open={pop.open} anchor={pop.anchor} onClose={pop.close} title={t.card.labels}>
        {labels.length === 0 ? (
          <p className="py-2 text-sm text-tr-muted">{t.labels.emptyForScope}</p>
        ) : (
          <>
            <LabelModeToggle
              mode={value.mode}
              disabled={value.ids.length < 2}
              onChange={(mode) => onChange({ ...value, mode })}
            />
            <div className="mt-2 space-y-1">
              {labels.map((label) => {
                const active = value.ids.includes(label.id);
                return (
                  <button
                    key={label.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      onChange({
                        ...value,
                        ids: active
                          ? value.ids.filter((x) => x !== label.id)
                          : [...value.ids, label.id],
                      })
                    }
                    className={`flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-sm font-medium transition ${focusRing}`}
                    style={{
                      backgroundColor: label.color,
                      color: contrastInk(label.color),
                      opacity: active ? 1 : 0.7,
                    }}
                  >
                    <span className="flex-1 truncate">
                      {label.group_name ? `${label.group_name} / ` : ''}
                      {label.name}
                    </span>
                    {active && <span aria-hidden="true">✓</span>}
                  </button>
                );
              })}
            </div>
            {value.ids.length > 0 && (
              <button
                type="button"
                onClick={() => onChange(EMPTY_LABEL_FILTER)}
                className={`mt-2 w-full rounded-control px-2 py-1.5 text-sm text-tr-subtle transition hover:bg-tr-hover ${focusRing}`}
              >
                {t.common.clearFilter}
              </button>
            )}
          </>
        )}
      </Popover>

      {selected.length > 0 && (
        <span className="text-xs text-tr-muted">
          {selected.map((l) => l.name).join(value.mode === 'and' ? ' + ' : ' / ')}
        </span>
      )}
    </>
  );
}

/**
 * Nut chuyen VA / HOAC.
 *
 * Mac dinh luon la HOAC — dung hanh vi bo loc truoc day — nen mo bo loc cu
 * len khong thay gi khac; VA la lua chon nguoi dung tu bat.
 */
export function LabelModeToggle({
  mode,
  onChange,
  disabled,
}: {
  mode: LabelMatchMode;
  onChange: (mode: LabelMatchMode) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-tr-muted">{t.labels.filterMode}</span>
      <div className="ml-auto inline-flex overflow-hidden rounded-control border border-tr-border">
        {(['or', 'and'] as LabelMatchMode[]).map((value) => (
          <button
            key={value}
            type="button"
            disabled={disabled}
            aria-pressed={mode === value}
            title={value === 'and' ? t.labels.filterAndHint : t.labels.filterOrHint}
            onClick={() => onChange(value)}
            className={`px-2 py-1 text-xs font-medium transition disabled:opacity-50 ${
              mode === value
                ? 'bg-tr-primary text-tr-on-primary'
                : 'bg-tr-panel text-tr-subtle hover:bg-tr-hover'
            } ${focusRing}`}
          >
            {value === 'and' ? t.labels.filterAnd : t.labels.filterOr}
          </button>
        ))}
      </div>
    </div>
  );
}
