import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Search } from 'lucide-react';
import { api, qs } from '../../api/client';
import { t } from '../../i18n/vi';
import { formatVND } from '../../lib/format';
import { useUiStore } from '../../stores/uiStore';
import { useDialog } from './useDialog';
import { focusRing } from './ui';
import type { Priority, Stage } from '../../types';

interface SearchResults {
  cards: {
    id: number;
    title: string;
    priority: Priority;
    board_name: string;
    customer_name: string | null;
  }[];
  customers: { id: number; name: string; industry: string | null; phone: string | null }[];
  contacts: {
    id: number;
    customer_id: number;
    full_name: string;
    title: string | null;
    customer_name: string;
  }[];
  deals: { id: number; title: string; stage: Stage; value_vnd: number; customer_name: string }[];
  contracts: {
    id: number;
    name: string;
    number: string | null;
    customer_name: string;
    end_date: string | null;
  }[];
  documents: { id: number; name: string; doc_type: string; customer_name: string | null }[];
}

export function SearchBox() {
  const open = useUiStore((s) => s.searchOpen);
  const setOpen = useUiStore((s) => s.setSearchOpen);
  const openCard = useUiStore((s) => s.openCard);
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const id = setTimeout(() => setDebounced(term), 250);
    return () => clearTimeout(id);
  }, [term]);

  // Escape do useDialog xu ly (chi dong lop tren cung); o day chi mo bang Ctrl/Cmd+K.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [setOpen]);

  const { data } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => api.get<SearchResults>(`/api/search${qs({ q: debounced })}`),
    enabled: open && debounced.trim().length > 0,
  });

  const close = () => {
    setOpen(false);
    setTerm('');
  };
  const closeRef = useRef(close);
  closeRef.current = close;
  const panelRef = useRef<HTMLDivElement>(null);
  useDialog({ open, onClose: () => closeRef.current(), containerRef: panelRef });

  const total = data ? Object.values(data).reduce((n, list) => n + list.length, 0) : 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`tr-search-trigger flex h-11 w-full max-w-lg items-center gap-2 rounded-full border border-tr-border bg-tr-panel px-3 text-sm text-tr-muted shadow-sm transition hover:border-tr-primary/20 hover:text-tr-text sm:h-8 ${focusRing}`}
      >
        <Search size={15} aria-hidden="true" />
        <span className="flex-1 truncate text-left">{t.search.placeholder}</span>
        <kbd className="hidden rounded-full border border-tr-border bg-tr-list px-2 py-0.5 text-[10px] text-tr-muted sm:inline">
          Ctrl K
        </kbd>
      </button>

      {open && (
        <div
          className="tr-anim-fade fixed inset-0 z-50 flex items-start justify-center bg-tr-overlay p-4 pt-16 sm:pt-24"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={t.search.placeholder}
            className="tr-search-dialog tr-anim-pop w-full max-w-xl overflow-hidden rounded-modal bg-tr-panel shadow-2xl"
          >
            <div className="flex items-center gap-2 border-b border-tr-border px-4">
              <Search size={17} className="text-tr-muted" aria-hidden="true" />
              <input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder={t.search.placeholder}
                aria-label={t.search.placeholder}
                className="w-full bg-transparent py-3.5 text-sm text-tr-text outline-none"
              />
            </div>

            <div className="tr-scroll max-h-96 overflow-y-auto" role="listbox" aria-label="Kết quả">
              {total > 0 && (
                <p className="sr-only" aria-live="polite">
                  {`${total} kết quả`}
                </p>
              )}
              {debounced && total === 0 && (
                <p className="px-4 py-8 text-center text-sm text-tr-muted">{t.search.noResults}</p>
              )}

              {data && data.cards.length > 0 && (
                <Group title={t.search.cards}>
                  {data.cards.map((c) => (
                    <Row
                      key={c.id}
                      onClick={() => {
                        openCard(c.id);
                        close();
                      }}
                      primary={c.title}
                      secondary={[c.board_name, c.customer_name].filter(Boolean).join(' · ')}
                    />
                  ))}
                </Group>
              )}

              {data && data.customers.length > 0 && (
                <Group title={t.search.customers}>
                  {data.customers.map((c) => (
                    <Row
                      key={c.id}
                      onClick={() => {
                        navigate(`/customers/${c.id}`);
                        close();
                      }}
                      primary={c.name}
                      secondary={[c.industry, c.phone].filter(Boolean).join(' · ')}
                    />
                  ))}
                </Group>
              )}

              {data && data.contacts?.length > 0 && (
                <Group title="Người liên hệ">
                  {data.contacts.map((c) => (
                    <Row
                      key={c.id}
                      onClick={() => {
                        navigate(`/customers/${c.customer_id}?contact=${c.id}`);
                        close();
                      }}
                      primary={c.full_name}
                      secondary={[c.title, c.customer_name].filter(Boolean).join(' · ')}
                    />
                  ))}
                </Group>
              )}

              {data && data.deals.length > 0 && (
                <Group title={t.search.deals}>
                  {data.deals.map((d) => (
                    <Row
                      key={d.id}
                      onClick={() => {
                        navigate(`/deals/${d.id}`);
                        close();
                      }}
                      primary={d.title}
                      secondary={`${d.customer_name} · ${t.stage[d.stage]} · ${formatVND(d.value_vnd)}`}
                    />
                  ))}
                </Group>
              )}

              {data && data.contracts?.length > 0 && (
                <Group title="Hợp đồng">
                  {data.contracts.map((c) => (
                    <Row
                      key={c.id}
                      onClick={() => {
                        navigate(`/contracts?focus=${c.id}`);
                        close();
                      }}
                      primary={c.name}
                      secondary={[c.customer_name, c.number && `Số ${c.number}`]
                        .filter(Boolean)
                        .join(' · ')}
                    />
                  ))}
                </Group>
              )}

              {data && data.documents?.length > 0 && (
                <Group title="Tài liệu">
                  {data.documents.map((d) => (
                    <Row
                      key={d.id}
                      onClick={() => {
                        navigate(`/documents?focus=${d.id}`);
                        close();
                      }}
                      primary={d.name}
                      secondary={[t.docType[d.doc_type], d.customer_name]
                        .filter(Boolean)
                        .join(' · ')}
                    />
                  ))}
                </Group>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-1">
      <div className="px-4 py-1 text-2xs font-semibold tracking-wide text-tr-muted uppercase">
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({
  primary,
  secondary,
  onClick,
}: {
  primary: string;
  secondary?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={false}
      onClick={onClick}
      className="flex w-full flex-col items-start px-4 py-2 text-left transition hover:bg-tr-hover focus-visible:bg-tr-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-tr-primary"
    >
      <span className="truncate text-sm text-tr-text">{primary}</span>
      {secondary && <span className="truncate text-xs text-tr-muted">{secondary}</span>}
    </button>
  );
}
