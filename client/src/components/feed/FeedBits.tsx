import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { contrastInk } from '../../lib/format';
import {
  colorFor,
  feedApi,
  fileBadge,
  initials,
  SOURCE_LABEL,
  type PostAttachment,
} from '../../lib/feed';
import { focusRing } from '../common/ui';

/* Mau nho dung chung cua Bang tin: anh dai dien chu, huy hieu nguon tep, o nhap @nhac ten. */

export function Avatar({
  id,
  name,
  size = 40,
  color,
}: {
  id: number;
  name: string | null | undefined;
  size?: number;
  color?: string | null;
}) {
  const background = colorFor(id, color);
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * 0.36)),
        backgroundColor: background,
        color: contrastInk(background),
      }}
    >
      {initials(name)}
    </span>
  );
}

export function GroupIcon({
  id,
  name,
  color,
  size = 24,
}: {
  id: number;
  name: string;
  color?: string | null;
  size?: number;
}) {
  const background = colorFor(id + 3, color);
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-control font-bold select-none"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, Math.round(size * 0.42)),
        backgroundColor: background,
        color: contrastInk(background),
      }}
    >
      {initials(name)}
    </span>
  );
}

const SOURCE_CLASS: Record<PostAttachment['source'], string> = {
  personal: 'bg-tr-hover-strong text-tr-text',
  group: 'bg-tr-primary/10 text-tr-primary',
  shared: 'bg-tr-success/15 text-tr-text',
};

export function SourceBadge({ source }: { source: PostAttachment['source'] }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-compact px-1.5 py-0.5 text-[11px] font-semibold ${SOURCE_CLASS[source]}`}
    >
      {SOURCE_LABEL[source]}
    </span>
  );
}

export function FileTypeIcon({ name, mime }: { name: string; mime: string | null }) {
  const badge = fileBadge(name, mime);
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-10 w-8 shrink-0 items-center justify-center rounded-compact text-[9px] font-bold"
      style={{ backgroundColor: badge.color, color: contrastInk(badge.color) }}
    >
      {badge.label}
    </span>
  );
}

/** Chuyen lien ket http(s) trong van ban thanh <a>. */
export function RichText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  const pattern =
    /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])|(@[\p{Lu}][\p{L}]*(?:\s[\p{Lu}][\p{L}]*){0,3})/gu;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[1]) {
      parts.push(
        <a
          key={key++}
          href={match[1]}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-tr-primary underline-offset-2 hover:underline"
        >
          {match[1]}
        </a>
      );
    } else {
      parts.push(
        <span key={key++} className="font-medium text-tr-primary">
          {match[2]}
        </span>
      );
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

interface Candidate {
  id: number;
  name: string;
  unit: string | null;
}

/**
 * O nhap co goi y @nhac ten thanh vien nhom. Go "@" roi vai chu: hien danh sach,
 * mui ten len/xuong + Enter de chon. Ten duoc chen vao van ban; `onMentionsChange`
 * nhan danh sach id con xuat hien trong van ban.
 */
export function MentionTextarea({
  groupId,
  value,
  onChange,
  onMentionsChange,
  placeholder,
  rows = 3,
  autoFocus,
  ariaLabel,
  onSubmitShortcut,
  className = '',
}: {
  groupId: number | null;
  value: string;
  onChange: (value: string) => void;
  onMentionsChange: (ids: number[]) => void;
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
  ariaLabel: string;
  onSubmitShortcut?: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const listId = useId();
  const [query, setQuery] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [active, setActive] = useState(0);
  const picked = useRef(new Map<number, string>());

  useEffect(() => {
    if (query === null || groupId === null) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      feedApi
        .mentionCandidates(groupId, query)
        .then((rows) => {
          if (!cancelled) {
            setCandidates(rows);
            setActive(0);
          }
        })
        .catch(() => undefined);
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, groupId]);

  const syncMentions = (text: string) => {
    onMentionsChange(
      [...picked.current.entries()]
        .filter(([, name]) => text.includes(`@${name}`))
        .map(([id]) => id)
    );
  };

  const detect = (text: string, caret: number) => {
    const before = text.slice(0, caret);
    const match = /(?:^|\s)@([\p{L}\d]*(?:\s[\p{L}\d]*)?)$/u.exec(before);
    setQuery(match && match[1].length <= 30 ? match[1] : null);
  };

  const choose = (candidate: Candidate) => {
    const element = ref.current;
    if (!element) return;
    const caret = element.selectionStart;
    const before = value.slice(0, caret);
    const at = before.lastIndexOf('@');
    const next = `${value.slice(0, at)}@${candidate.name} ${value.slice(caret)}`;
    picked.current.set(candidate.id, candidate.name);
    onChange(next);
    syncMentions(next);
    setQuery(null);
    requestAnimationFrame(() => {
      const position = at + candidate.name.length + 2;
      element.focus();
      element.setSelectionRange(position, position);
    });
  };

  const open = query !== null && candidates.length > 0;

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        rows={rows}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open ? `${listId}-${candidates[active]?.id}` : undefined}
        onChange={(event) => {
          onChange(event.target.value);
          syncMentions(event.target.value);
          detect(event.target.value, event.target.selectionStart);
        }}
        onKeyDown={(event) => {
          if (open) {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActive((index) => (index + 1) % candidates.length);
              return;
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive((index) => (index - 1 + candidates.length) % candidates.length);
              return;
            }
            if (event.key === 'Enter' || event.key === 'Tab') {
              event.preventDefault();
              choose(candidates[active]);
              return;
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              setQuery(null);
              return;
            }
          }
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && onSubmitShortcut) {
            event.preventDefault();
            onSubmitShortcut();
          }
        }}
        onBlur={() => window.setTimeout(() => setQuery(null), 150)}
        className={`block w-full resize-y rounded-control border border-tr-border bg-tr-card px-3 py-2 text-sm text-tr-text placeholder:text-tr-muted ${focusRing} ${className}`}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Gợi ý thành viên"
          className="absolute z-popover mt-1 max-h-60 w-72 max-w-full overflow-y-auto rounded-control border border-tr-border bg-tr-panel py-1 shadow-lg"
        >
          {candidates.map((candidate, index) => (
            <li
              key={candidate.id}
              id={`${listId}-${candidate.id}`}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => {
                event.preventDefault();
                choose(candidate);
              }}
              className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm ${
                index === active ? 'bg-tr-hover' : ''
              }`}
            >
              <Avatar id={candidate.id} name={candidate.name} size={24} />
              <span className="min-w-0 flex-1 truncate text-tr-text">{candidate.name}</span>
              {candidate.unit && (
                <span className="truncate text-xs text-tr-muted">{candidate.unit}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
