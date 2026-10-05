import { useCallback, useId, useState, type FormEvent } from 'react';
import { Play, Square, Star, Trash2 } from 'lucide-react';
import {
  linkFromSaved,
  newMusicLinkId,
  parseMusicLink,
  type MusicLink,
} from '../../lib/musicLinks';
import { useMusicStore } from '../../stores/musicStore';
import { focusRing } from '../common/ui';
import { AMBIENT_INFO, AMBIENT_KINDS, ambientVolume, setAmbientVolume } from './ambient';
import { useMusicFavorites, useRemoveFavorite, useSaveFavorite } from './musicApi';

const KIND_LABEL: Record<MusicLink['kind'], string> = {
  youtube: 'YouTube',
  spotify: 'Spotify',
  stream: 'Radio',
};

/** Khung phat cao bao nhieu — MusicHost dat trinh phat de khit len o nay. */
const SLOT_SIZE: Record<MusicLink['kind'], string> = {
  youtube: 'aspect-video',
  spotify: 'h-[152px]',
  stream: 'h-[54px]',
};

/**
 * Cho dat trinh phat trong bang. Bang chi giu cho; iframe/<audio> that nam o
 * MusicHost va duoc dat de len dung vi tri nay, de dong bang hay doi tu man cho
 * sang man lam viec ma nhac khong bi tai lai.
 */
function MusicSlot({ kind }: { kind: MusicLink['kind'] }) {
  const addSlot = useMusicStore((s) => s.addSlot);
  const removeSlot = useMusicStore((s) => s.removeSlot);
  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;
      addSlot(node);
      return () => removeSlot(node);
    },
    [addSlot, removeSlot]
  );
  return <div ref={ref} className={`mt-3 w-full rounded-xl ${SLOT_SIZE[kind]}`} />;
}

interface Look {
  title: string;
  label: string;
  field: string;
  chip: (on?: boolean) => string;
  iconBtn: string;
  range: string;
  note: string;
}

/* Man cho dung kinh mo tren canh nen; man lam viec dung mau theo giao dien Sang/Toi. */
const LOOKS: Record<'lock' | 'app', Look> = {
  lock: {
    title: 'ls-panel-title',
    label: 'opacity-80',
    field: 'ls-field',
    chip: (on) => `ls-chip ${on ? 'ls-chip-on' : ''}`,
    iconBtn: 'ls-icon-btn',
    range: 'ls-range',
    note: 'opacity-75',
  },
  app: {
    title: 'text-sm font-semibold text-tr-text',
    label: 'text-tr-subtle',
    field: `rounded-control border border-tr-border bg-tr-panel text-tr-text placeholder:text-tr-muted ${focusRing}`,
    chip: (on) =>
      `inline-flex min-h-11 items-center gap-1.5 rounded-control border px-3 py-1.5 text-sm transition fine:min-h-8 ${focusRing} ${
        on
          ? 'border-tr-primary/40 bg-tr-primary/10 text-tr-primary'
          : 'border-tr-border bg-tr-panel text-tr-text hover:bg-tr-hover'
      }`,
    iconBtn: `flex h-11 w-11 items-center justify-center rounded-control text-tr-muted transition hover:bg-tr-hover hover:text-tr-danger fine:h-8 fine:w-8 ${focusRing}`,
    range: 'accent-tr-primary',
    note: 'text-tr-muted',
  },
};

/*
 * Nhac (1.14.1 o man cho, 1.20.0 them o thanh tren): dan link YouTube / Spotify / radio,
 * luu link yeu thich theo tai khoan, hoac dung am thanh tao san.
 *
 * Trang thai phat nam o musicStore nen hai noi dieu khien cung mot trinh phat.
 */
export function MusicPanel({ variant }: { variant: 'lock' | 'app' }) {
  const look = LOOKS[variant];
  const id = useId();
  const link = useMusicStore((s) => s.link);
  const ambient = useMusicStore((s) => s.ambient);
  const playLink = useMusicStore((s) => s.playLink);
  const playAmbient = useMusicStore((s) => s.playAmbient);
  const stop = useMusicStore((s) => s.stop);
  const favorites = useMusicFavorites();
  const saveFavorite = useSaveFavorite();
  const removeFavorite = useRemoveFavorite();
  const [volume, setVolume] = useState(ambientVolume);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const saved = favorites.data ?? [];
  const savedLinks = saved.flatMap((row) => {
    const item = linkFromSaved(row);
    return item ? [{ row, item }] : [];
  });
  const savedNow = link ? saved.find((row) => row.url === link.url) : undefined;

  const add = (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseMusicLink(url, title);
    if (!parsed) {
      setError('Chưa nhận ra link. Hãy dán link YouTube, Spotify hoặc đường dẫn radio (.mp3).');
      return;
    }
    /* Dan lai link da co trong Yeu thich ma khong dat ten: dung ten da luu. */
    const known = title.trim() ? undefined : saved.find((row) => row.url === parsed.url);
    setUrl('');
    setTitle('');
    setError(null);
    playLink({ ...parsed, title: known?.title ?? parsed.title, id: newMusicLinkId() });
  };

  const toggleSaved = () => {
    if (!link) return;
    if (savedNow) removeFavorite.mutate(savedNow.id);
    else saveFavorite.mutate({ url: link.url, title: link.title.slice(0, 60) });
  };

  const actionError = saveFavorite.error ?? removeFavorite.error;

  return (
    <div>
      {/* Popover tren thanh tren da co tieu de "Nhạc". */}
      {variant === 'lock' && <p className={look.title}>Nhạc study</p>}

      <form onSubmit={add} className={`space-y-2 ${variant === 'lock' ? 'mt-3' : ''}`}>
        <label htmlFor={`${id}-url`} className={`block text-xs ${look.label}`}>
          Dán link YouTube, Spotify hoặc radio
        </label>
        <div className="flex gap-2">
          <input
            id={`${id}-url`}
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              setError(null);
            }}
            placeholder="https://…"
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            className={`${look.field} h-10 min-w-0 flex-1 px-3 text-sm`}
          />
          <button type="submit" disabled={!url.trim()} className={look.chip()}>
            <Play size={15} aria-hidden="true" />
            Phát
          </button>
        </div>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Tên gợi nhớ (không bắt buộc)"
          aria-label="Tên gợi nhớ cho link"
          maxLength={60}
          className={`${look.field} h-9 w-full px-3 text-sm`}
        />
        {error && (
          <p id={`${id}-error`} role="alert" className="text-xs font-medium">
            {error}
          </p>
        )}
      </form>

      {link && (
        <div>
          <MusicSlot kind={link.kind} />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={toggleSaved}
              aria-pressed={Boolean(savedNow)}
              disabled={saveFavorite.isPending || removeFavorite.isPending || favorites.isPending}
              className={look.chip(Boolean(savedNow))}
            >
              <Star size={14} aria-hidden="true" fill={savedNow ? 'currentColor' : 'none'} />
              {savedNow ? 'Đã lưu yêu thích' : 'Lưu yêu thích'}
            </button>
            <button type="button" onClick={stop} className={look.chip()}>
              <Square size={12} aria-hidden="true" />
              Dừng
            </button>
          </div>
          {actionError && (
            <p role="alert" className="mt-2 text-xs font-medium">
              {actionError instanceof Error ? actionError.message : 'Không lưu được, thử lại sau'}
            </p>
          )}
          {link.kind === 'spotify' && (
            <p className={`mt-2 text-xs ${look.note}`}>
              Spotify cần bấm nút phát trong khung, và chỉ nghe trọn bài khi trình duyệt đã đăng
              nhập Spotify.
            </p>
          )}
        </div>
      )}

      <p className={`mt-4 text-xs font-medium ${look.label}`}>Yêu thích</p>
      {favorites.isPending ? (
        <p className={`mt-2 text-xs ${look.note}`}>Đang tải…</p>
      ) : favorites.isError ? (
        <p className={`mt-2 text-xs ${look.note}`}>Không tải được danh sách yêu thích.</p>
      ) : savedLinks.length === 0 ? (
        <p className={`mt-2 text-xs ${look.note}`}>
          Chưa có link nào. Đang nghe bài hợp ý thì bấm ☆ Lưu yêu thích để nghe lại ở mọi máy.
        </p>
      ) : (
        <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto" aria-label="Link yêu thích">
          {savedLinks.map(({ row, item }) => {
            const on = link?.url === item.url;
            return (
              <li key={row.id} className="flex items-center gap-1">
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => (on ? stop() : playLink(item))}
                  className={`${look.chip(on)} min-w-0 flex-1 justify-start`}
                >
                  {on ? (
                    <Square size={12} aria-hidden="true" />
                  ) : (
                    <Play size={12} aria-hidden="true" />
                  )}
                  <span className="truncate">{item.title}</span>
                  <span className="ml-auto shrink-0 text-xs opacity-70">
                    {KIND_LABEL[item.kind]}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => removeFavorite.mutate(row.id)}
                  aria-label={`Bỏ yêu thích ${item.title}`}
                  title="Bỏ yêu thích"
                  className={`${look.iconBtn} shrink-0`}
                >
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className={`mt-4 text-xs font-medium ${look.label}`}>
        Không có mạng? Âm thanh tạo sẵn trên máy
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {AMBIENT_KINDS.map((kind) => {
          const on = ambient === kind;
          return (
            <button
              key={kind}
              type="button"
              aria-pressed={on}
              onClick={() => (on ? stop() : playAmbient(kind))}
              className={`${look.chip(on)} min-w-0 flex-col items-start text-left whitespace-normal`}
            >
              <span className="flex items-center gap-1.5 font-medium">
                {on ? (
                  <Square size={12} aria-hidden="true" />
                ) : (
                  <Play size={12} aria-hidden="true" />
                )}
                {AMBIENT_INFO[kind].label}
              </span>
              <span className="text-xs leading-snug opacity-75">
                {AMBIENT_INFO[kind].description}
              </span>
            </button>
          );
        })}
      </div>
      <label className="mt-3 flex items-center gap-3 text-sm">
        Âm lượng
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(event) => {
            const value = Number(event.target.value);
            setVolume(value);
            setAmbientVolume(value);
          }}
          className={`${look.range} flex-1`}
        />
      </label>
    </div>
  );
}
