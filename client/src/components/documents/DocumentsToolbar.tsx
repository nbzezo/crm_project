import { useRef, type ReactNode } from 'react';
import { Search, Trash2, X } from 'lucide-react';
import { Input, focusRing } from '../common/ui';

export type LibraryView = 'active' | 'trash';

/**
 * Thanh cong cu DUNG CHUNG cua hai tab trang Tai lieu (1.28.0): o tim, cac bo
 * loc rieng tung tab (`children`), nut Dang dung / Thung rac. Truoc day tab
 * Trang khong co thanh nao, tab Tep co thanh rieng — hai tab trong nhu hai trang.
 *
 * Tu khoa thuoc trang (hub giu tren URL `?q=`) nen doi tab van giu nguyen.
 */
export function DocumentsToolbar({
  term,
  onTermChange,
  placeholder,
  view,
  onViewChange,
  children,
}: {
  term: string;
  onTermChange: (value: string) => void;
  placeholder: string;
  view: LibraryView;
  onViewChange: (view: LibraryView) => void;
  children?: ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-panel border border-tr-border bg-tr-panel p-3 shadow-sm">
      <div className="relative w-full sm:w-72">
        <Search
          size={15}
          aria-hidden="true"
          className="absolute top-1/2 left-2.5 -translate-y-1/2 text-tr-muted"
        />
        <Input
          ref={inputRef}
          value={term}
          onChange={(event) => onTermChange(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="pr-9 pl-8"
        />
        {term && (
          <button
            type="button"
            onClick={() => {
              onTermChange('');
              inputRef.current?.focus();
            }}
            aria-label="Xoá từ khoá"
            className={`absolute top-1/2 right-1 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-control text-tr-muted hover:bg-tr-hover hover:text-tr-text ${focusRing}`}
          >
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      {children}
      <div
        className="ml-auto flex rounded-full border border-tr-border bg-tr-surface p-1"
        role="group"
        aria-label="Vị trí tài liệu"
      >
        <button
          type="button"
          aria-pressed={view === 'active'}
          onClick={() => onViewChange('active')}
          className={`rounded-full px-3 py-1 text-xs font-medium transition ${focusRing} ${view === 'active' ? 'bg-tr-primary text-tr-on-primary' : 'text-tr-subtle hover:bg-tr-hover'}`}
        >
          Đang dùng
        </button>
        <button
          type="button"
          aria-pressed={view === 'trash'}
          onClick={() => onViewChange('trash')}
          className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition ${focusRing} ${view === 'trash' ? 'bg-tr-primary text-tr-on-primary' : 'text-tr-subtle hover:bg-tr-hover'}`}
        >
          <Trash2 size={12} aria-hidden="true" /> Thùng rác
        </button>
      </div>
    </div>
  );
}

/** Dai goi y: tu khoa nay co ket qua o tab kia — bam de chuyen, giu tu khoa. */
export function CrossTabHint({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-control border border-tr-primary/30 bg-tr-primary/10 px-3 py-1.5 text-sm font-semibold text-tr-primary hover:bg-tr-primary/15 ${focusRing}`}
    >
      {children}
    </button>
  );
}
