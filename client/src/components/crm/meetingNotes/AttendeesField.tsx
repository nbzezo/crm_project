import { useState } from 'react';
import { Check, UserPlus, X } from 'lucide-react';
import { Popover, PopoverItem, usePopover } from '../../common/Popover';
import { Input, focusRing } from '../../common/ui';
import { useAssignees } from '../../tasks/AssigneePicker';
import { normalizeSearchText } from '../../../lib/text';

/**
 * Nguoi tham du hop — chip + popover tim/tick, dung lai danh ba
 * (`useAssignees`) va cach trinh bay cua EntityLabels.tsx cho mot tap Contact
 * thay vi Label. La component co, cha (MeetingNoteEditor) giu state va luu
 * cung luc voi autosave — khong tu luu rieng nhu EntityLabels.
 */
export function AttendeesField({
  value,
  onChange,
}: {
  value: number[];
  onChange: (ids: number[]) => void;
}) {
  const pop = usePopover();
  const [keyword, setKeyword] = useState('');
  const { data: assignees = [] } = useAssignees();

  const selected = assignees.filter((a) => value.includes(a.id));
  const q = normalizeSearchText(keyword.trim());
  const visible = q
    ? assignees.filter((a) => normalizeSearchText(a.full_name).includes(q))
    : assignees;

  const toggle = (id: number) => {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {selected.map((a) => (
        <span
          key={a.id}
          className="inline-flex items-center gap-1 rounded-full bg-tr-hover px-2 py-0.5 text-xs text-tr-text"
        >
          {a.full_name}
          <button
            type="button"
            onClick={() => toggle(a.id)}
            aria-label={`Bỏ ${a.full_name} khỏi người tham dự`}
            className={`rounded-full p-0.5 hover:bg-tr-panel ${focusRing}`}
          >
            <X size={10} />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={pop.toggle}
        className={`inline-flex items-center gap-1 rounded-full border border-dashed border-tr-border px-2 py-0.5 text-xs text-tr-subtle transition hover:bg-tr-hover ${focusRing}`}
      >
        <UserPlus size={12} /> {selected.length === 0 ? 'Người tham dự' : '+'}
      </button>

      <Popover open={pop.open} anchor={pop.anchor} onClose={pop.close} title="Người tham dự">
        <Input
          autoFocus
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="Tìm người…"
          className="mb-2"
        />
        <div className="max-h-64 space-y-0.5 overflow-y-auto">
          {visible.map((a) => (
            <PopoverItem
              key={a.id}
              onClick={() => toggle(a.id)}
              icon={
                value.includes(a.id) ? (
                  <Check size={14} className="shrink-0 text-tr-primary" />
                ) : (
                  <span className="w-3.5 shrink-0" />
                )
              }
            >
              {a.full_name}
            </PopoverItem>
          ))}
          {visible.length === 0 && (
            <p className="px-1 py-3 text-center text-xs text-tr-muted">
              Không tìm thấy ai phù hợp.
            </p>
          )}
        </div>
      </Popover>
    </div>
  );
}
