import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Tag } from 'lucide-react';
import { api } from '../../api/client';
import { Input, focusRing } from '../common/ui';
import { Popover, usePopover } from '../common/Popover';
import { contrastInk, foldText } from '../../lib/format';
import { t } from '../../i18n/vi';
import type { Label, LabelEntity } from '../../types';

/** Khoa truy van dung chung cho moi cho gan nhan cua mot ban ghi. */
export function labelLinksKey(entityType: LabelEntity, entityId: number) {
  return ['label-links', entityType, entityId] as const;
}

/**
 * Nhan cua tat ca ban ghi thuoc mot loai, dang { entity_id: Label[] }.
 *
 * Dung cho danh sach (Khach hang, Co hoi): mot truy van cho ca trang, thay vi
 * them cot nhan vao API cua tung module.
 */
export function useLabelMap(entityType: LabelEntity) {
  const { data } = useQuery({
    queryKey: ['label-links', entityType, 'map'],
    queryFn: () => api.get<Record<string, Label[]>>(`/api/labels/links/${entityType}`),
  });
  return data ?? {};
}

/** Nhan cua mot ban ghi lay tu ban do o tren (tra ve mang rong neu chua co). */
export function labelsOf(map: Record<string, Label[]>, id: number): Label[] {
  return map[String(id)] ?? [];
}

/**
 * Gan/go nhan cho mot ban ghi bat ky (Account, Opportunity, Contact, Contract).
 *
 * Dung dung mot luong voi the Kanban: hien badge + nut "+ Nhãn", bam mo popover,
 * tick la xong — dung 3 thao tac theo nguyen tac UX muc 20 cua BRD (AC-TAG-19).
 */
export function EntityLabels({
  entityType,
  entityId,
  onChanged,
}: {
  entityType: LabelEntity;
  entityId: number;
  onChanged?: () => void;
}) {
  const pop = usePopover();
  const queryClient = useQueryClient();

  const { data: labels = [] } = useQuery({
    queryKey: labelLinksKey(entityType, entityId),
    queryFn: () => api.get<Label[]>(`/api/labels/links/${entityType}/${entityId}`),
  });

  const save = useMutation({
    mutationFn: (ids: number[]) =>
      api.put<Label[]>(`/api/labels/links/${entityType}/${entityId}`, { label_ids: ids }),
    onSuccess: (rows) => {
      queryClient.setQueryData(labelLinksKey(entityType, entityId), rows);
      queryClient.invalidateQueries({ queryKey: ['labels'] });
      onChanged?.();
    },
  });

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {labels.map((label) => (
        <button
          key={label.id}
          type="button"
          onClick={pop.toggle}
          title={label.group_name ? `${label.group_name} / ${label.name}` : label.name}
          className={`max-w-[14rem] truncate rounded-md px-2 py-0.5 text-xs font-medium transition hover:brightness-110 ${focusRing}`}
          style={{ backgroundColor: label.color, color: contrastInk(label.color) }}
        >
          {label.name}
        </button>
      ))}
      <button
        type="button"
        onClick={pop.toggle}
        className={`inline-flex items-center gap-1 rounded-md border border-dashed border-tr-border px-2 py-0.5 text-xs text-tr-subtle transition hover:bg-tr-hover ${focusRing}`}
      >
        <Tag size={12} /> {labels.length === 0 ? t.card.labels : '+'}
      </button>

      <LabelSelectPopover
        pop={pop}
        scope={entityType}
        selectedIds={labels.map((l) => l.id)}
        onToggle={(id) => {
          const ids = labels.map((l) => l.id);
          save.mutate(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
        }}
      />
    </span>
  );
}

/**
 * Popover chon nhan: nhom cha lam tieu de (khong tick duoc — BR-TAG-13),
 * nhan con la dong tick duoc. Tim kiem khong dau dung foldText co san.
 */
export function LabelSelectPopover({
  pop,
  scope,
  selectedIds,
  onToggle,
  title,
}: {
  pop: ReturnType<typeof usePopover>;
  scope?: LabelEntity;
  selectedIds: number[];
  onToggle: (id: number) => void;
  title?: string;
}) {
  const [keyword, setKeyword] = useState('');

  const { data: labels = [] } = useQuery({
    queryKey: ['labels', 'pick', scope ?? 'all'],
    queryFn: () => api.get<Label[]>(`/api/labels${scope ? `?scope=${scope}` : ''}`),
    enabled: pop.open,
  });

  const q = foldText(keyword.trim());
  const visible = q
    ? labels.filter((l) => foldText(l.name).includes(q) || foldText(l.group_name ?? '').includes(q))
    : labels;

  const groups: { name: string; items: Label[] }[] = [];
  for (const label of visible) {
    const name = label.group_name ?? '—';
    const last = groups[groups.length - 1];
    if (last && last.name === name) last.items.push(label);
    else groups.push({ name, items: [label] });
  }

  return (
    <Popover open={pop.open} anchor={pop.anchor} onClose={pop.close} title={title ?? t.card.labels}>
      <Input
        autoFocus
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder={t.labels.searchPlaceholder}
        className="mb-2"
      />
      {visible.length === 0 && (
        <p className="py-2 text-sm text-tr-muted">
          {labels.length === 0 ? t.labels.emptyForScope : t.labels.noResults}
        </p>
      )}
      <div className="space-y-2">
        {groups.map((group) => (
          <div key={group.name}>
            <p className="mb-1 text-xs font-semibold tracking-wide text-tr-muted uppercase">
              {group.name}
            </p>
            <div className="space-y-1">
              {group.items.map((label) => {
                const active = selectedIds.includes(label.id);
                return (
                  <button
                    key={label.id}
                    type="button"
                    onClick={() => onToggle(label.id)}
                    aria-pressed={active}
                    className={`flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-sm font-medium transition ${focusRing}`}
                    style={{
                      backgroundColor: label.color,
                      color: contrastInk(label.color),
                      opacity: active ? 1 : 0.75,
                    }}
                  >
                    <span className="flex-1 truncate">{label.name}</span>
                    {active && <span aria-hidden="true">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Popover>
  );
}
