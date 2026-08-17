import { useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Plus, Search } from 'lucide-react';
import { Popover, PopoverItem } from './Popover';
import { focusRing } from './ui';
import { normalizeSearchText } from '../../lib/text';

export interface ComboboxOption {
  id: number;
  label: string;
  sublabel?: string;
}

/**
 * O chon co tim kiem, thay cho `<select>` khi danh sach dai hoac kho tim bang mat.
 *
 * `<select>` native de bi trinh duyet ve popup theo mau sang mac dinh, chu
 * tren nen sang lan vao nhau kho doc trong giao dien toi — vu do dung Popover
 * (da theo mau giao dien) thay vi option cua trinh duyet.
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder = '— Chọn —',
  searchPlaceholder = 'Tìm kiếm…',
  emptyText = 'Không tìm thấy kết quả.',
  ariaLabel,
  className = '',
  triggerClassName,
  allowClear = true,
  disabled = false,
  onQuickCreate,
  quickCreateLabel,
}: {
  value: number | '';
  onChange: (value: number | '') => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  ariaLabel?: string;
  className?: string;
  triggerClassName?: string;
  /** Tat khi truong bat buoc co gia tri — an dong "bo chon" dau danh sach. */
  allowClear?: boolean;
  disabled?: boolean;
  /** Khi co, cho phep tao nhanh mot ban ghi moi tu chinh o tim kiem — khong roi khoi form. */
  onQuickCreate?: (query: string) => Promise<ComboboxOption>;
  quickCreateLabel?: (query: string) => string;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const open = anchor !== null;

  const selected = options.find((o) => o.id === value);

  const filtered = useMemo(() => {
    const q = normalizeSearchText(query.trim());
    if (!q) return options;
    return options.filter(
      (o) =>
        normalizeSearchText(o.label).includes(q) ||
        (o.sublabel && normalizeSearchText(o.sublabel).includes(q))
    );
  }, [options, query]);

  const close = () => {
    setAnchor(null);
    setQuery('');
    setCreateError(null);
  };

  const select = (id: number | '') => {
    onChange(id);
    close();
  };

  const handleQuickCreate = async () => {
    const trimmed = query.trim();
    if (!onQuickCreate || !trimmed || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await onQuickCreate(trimmed);
      select(created.id);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Không tạo được.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        disabled={disabled}
        onClick={() => setAnchor((prev) => (prev ? null : triggerRef.current))}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={
          triggerClassName ??
          `flex w-full items-center justify-between gap-1.5 rounded-control border border-tr-border bg-tr-list px-3 py-2 text-left text-sm outline-none transition hover:border-tr-primary/20 focus-visible:border-tr-primary disabled:cursor-not-allowed disabled:bg-tr-hover disabled:text-tr-muted disabled:hover:border-tr-border ${focusRing} ${className}`
        }
      >
        <span className={`truncate ${selected ? 'text-tr-text' : 'text-tr-muted'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={14} className="shrink-0 text-tr-muted" />
      </button>

      <Popover
        open={open}
        anchor={anchor}
        onClose={close}
        title={ariaLabel ?? placeholder}
        width={288}
      >
        <div className="sticky -top-3 z-10 -mx-3 -mt-3 bg-tr-panel px-3 pb-2 pt-3">
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-tr-muted"
            />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setCreateError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filtered.length > 0) select(filtered[0].id);
              }}
              placeholder={searchPlaceholder}
              className="w-full rounded-control border border-tr-border bg-tr-list py-1.5 pl-8 pr-2 text-sm text-tr-text outline-none focus:border-tr-primary"
            />
          </div>
        </div>

        <div className="space-y-0.5">
          {allowClear && (
            <PopoverItem
              onClick={() => select('')}
              icon={
                value === '' ? (
                  <Check size={14} className="shrink-0 text-tr-primary" />
                ) : (
                  <span className="w-3.5 shrink-0" />
                )
              }
            >
              <span className={value === '' ? 'text-tr-primary' : 'text-tr-muted'}>
                {placeholder}
              </span>
            </PopoverItem>
          )}
          {filtered.map((o) => (
            <PopoverItem
              key={o.id}
              onClick={() => select(o.id)}
              icon={
                o.id === value ? (
                  <Check size={14} className="shrink-0 text-tr-primary" />
                ) : (
                  <span className="w-3.5 shrink-0" />
                )
              }
            >
              <span className="truncate">
                {o.label}
                {o.sublabel && <span className="text-tr-muted"> · {o.sublabel}</span>}
              </span>
            </PopoverItem>
          ))}
          {onQuickCreate && query.trim() && (
            <button
              type="button"
              onClick={handleQuickCreate}
              disabled={creating}
              className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-sm text-tr-primary transition hover:bg-tr-hover disabled:opacity-60"
            >
              <Plus size={14} className="shrink-0" />
              {creating
                ? 'Đang tạo…'
                : (quickCreateLabel?.(query.trim()) ?? `Tạo mới "${query.trim()}"`)}
            </button>
          )}
          {filtered.length === 0 && !(onQuickCreate && query.trim()) && (
            <p className="px-1 py-3 text-center text-xs text-tr-muted">{emptyText}</p>
          )}
          {createError && <p className="px-2 pb-1 text-xs text-tr-danger">{createError}</p>}
        </div>
      </Popover>
    </>
  );
}
