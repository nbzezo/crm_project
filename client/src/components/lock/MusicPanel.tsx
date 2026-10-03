import { useState, type FormEvent } from 'react';
import { Play, Square, Trash2 } from 'lucide-react';
import {
  newMusicLinkId,
  parseMusicLink,
  readMusicLinks,
  writeMusicLinks,
  type MusicLink,
} from '../../lib/musicLinks';
import {
  AMBIENT_INFO,
  AMBIENT_KINDS,
  ambientVolume,
  playAmbient,
  setAmbientVolume,
  stopAmbient,
  type AmbientKind,
} from './ambient';

/* Phat link cua nguoi dung bang trinh phat nhung cua chinh dich vu (hoac the <audio> cho radio). */
function LinkPlayer({ link }: { link: MusicLink }) {
  if (link.kind === 'stream') {
    return (
      <audio
        key={link.id}
        src={link.src}
        controls
        autoPlay
        className="mt-3 w-full"
        aria-label={`Đang phát: ${link.title}`}
      />
    );
  }
  return (
    <iframe
      key={link.id}
      src={link.src}
      title={`Đang phát: ${link.title}`}
      allow="autoplay; encrypted-media; fullscreen"
      referrerPolicy="strict-origin-when-cross-origin"
      className={`mt-3 w-full rounded-xl border-0 ${
        link.kind === 'youtube' ? 'aspect-video' : 'h-[152px]'
      }`}
    />
  );
}

const KIND_LABEL: Record<MusicLink['kind'], string> = {
  youtube: 'YouTube',
  spotify: 'Spotify',
  stream: 'Radio',
};

/*
 * Nhac study (1.14.1): dan link YouTube / Spotify / radio, hoac dung am thanh tao san.
 *
 * Luon duoc gan (an bang `hidden` khi bang dong): dong bang Nhac study ma nhac tu link
 * van phai chay tiep, nen trinh phat khong duoc go ra khoi DOM.
 */
export function MusicPanel({
  ambient,
  onAmbient,
  link,
  onLink,
}: {
  ambient: AmbientKind | null;
  onAmbient: (kind: AmbientKind | null) => void;
  link: MusicLink | null;
  onLink: (link: MusicLink | null) => void;
}) {
  const [volume, setVolume] = useState(ambientVolume);
  const [links, setLinks] = useState(readMusicLinks);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const play = (item: MusicLink) => {
    stopAmbient();
    onAmbient(null);
    onLink(item);
  };

  const add = (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseMusicLink(url, title);
    if (!parsed) {
      setError('Chưa nhận ra link. Hãy dán link YouTube, Spotify hoặc đường dẫn radio (.mp3).');
      return;
    }
    const item: MusicLink = { ...parsed, id: newMusicLinkId() };
    const next = [item, ...links.filter((existing) => existing.url !== item.url)];
    setLinks(next);
    writeMusicLinks(next);
    setUrl('');
    setTitle('');
    setError(null);
    play(item);
  };

  const remove = (item: MusicLink) => {
    const next = links.filter((existing) => existing.id !== item.id);
    setLinks(next);
    writeMusicLinks(next);
    if (link?.id === item.id) onLink(null);
  };

  return (
    <div>
      <p className="ls-panel-title">Nhạc study</p>

      <form onSubmit={add} className="mt-3 space-y-2">
        <label htmlFor="ls-music-url" className="block text-xs opacity-80">
          Dán link YouTube, Spotify hoặc radio
        </label>
        <div className="flex gap-2">
          <input
            id="ls-music-url"
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              setError(null);
            }}
            placeholder="https://…"
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'ls-music-error' : undefined}
            className="ls-field h-10 min-w-0 flex-1 px-3 text-sm"
          />
          <button type="submit" disabled={!url.trim()} className="ls-chip">
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
          className="ls-field h-9 w-full px-3 text-sm"
        />
        {error && (
          <p id="ls-music-error" role="alert" className="text-xs font-medium">
            {error}
          </p>
        )}
      </form>

      {link && (
        <div>
          <LinkPlayer link={link} />
          <button type="button" onClick={() => onLink(null)} className="ls-chip mt-2">
            <Square size={12} aria-hidden="true" />
            Dừng
          </button>
          {link.kind === 'spotify' && (
            <p className="mt-2 text-xs opacity-75">
              Spotify cần bấm nút phát trong khung, và chỉ nghe trọn bài khi trình duyệt đã đăng
              nhập Spotify.
            </p>
          )}
        </div>
      )}

      {links.length > 0 && (
        <ul className="mt-3 max-h-36 space-y-1 overflow-y-auto" aria-label="Link đã lưu">
          {links.map((item) => {
            const on = link?.id === item.id;
            return (
              <li key={item.id} className="flex items-center gap-1">
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => (on ? onLink(null) : play(item))}
                  className={`ls-chip min-w-0 flex-1 justify-start ${on ? 'ls-chip-on' : ''}`}
                >
                  {on ? (
                    <Square size={12} aria-hidden="true" />
                  ) : (
                    <Play size={12} aria-hidden="true" />
                  )}
                  <span className="truncate">{item.title}</span>
                  <span className="shrink-0 text-xs opacity-70">{KIND_LABEL[item.kind]}</span>
                </button>
                <button
                  type="button"
                  onClick={() => remove(item)}
                  aria-label={`Xóa ${item.title}`}
                  className="ls-icon-btn shrink-0"
                >
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-4 text-xs font-medium opacity-80">
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
              onClick={() => {
                if (on) {
                  stopAmbient();
                  onAmbient(null);
                } else {
                  onLink(null);
                  playAmbient(kind);
                  onAmbient(kind);
                }
              }}
              className={`ls-chip min-w-0 flex-col items-start text-left whitespace-normal ${
                on ? 'ls-chip-on' : ''
              }`}
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
          className="ls-range flex-1"
        />
      </label>
    </div>
  );
}
