import { useEffect, useState } from 'react';
import { Headphones, Square } from 'lucide-react';
import { Popover } from '../common/Popover';
import { focusRing } from '../common/ui';
import { useLockStore } from '../../stores/lockStore';
import { selectPlaying, useMusicStore } from '../../stores/musicStore';
import { AMBIENT_INFO } from './ambient';
import { MusicPanel } from './MusicPanel';

/** Ten dang phat: ten link, hoac ten am thanh tao san. */
export function useNowPlayingLabel(): string | null {
  const link = useMusicStore((s) => s.link);
  const ambient = useMusicStore((s) => s.ambient);
  return link ? link.title : ambient ? AMBIENT_INFO[ambient].label : null;
}

/**
 * Nut Nhac tren thanh tren (1.20.0): cung bo nhac voi man cho.
 *
 * Dang phat thi nut doi thanh ba vach song nhac + ten bai (man rong) va co them nut
 * dung nhanh — chuong dien thoai reo thi tat duoc ngay, khong phai mo bang.
 * Dien thoai: nut chi hien khi dang phat; loi vao luc chua phat nam trong menu tai khoan.
 */
export function MusicButton() {
  const open = useMusicStore((s) => s.panelOpen);
  const setOpen = useMusicStore((s) => s.setPanelOpen);
  const playing = useMusicStore(selectPlaying);
  const stop = useMusicStore((s) => s.stop);
  const label = useNowPlayingLabel();
  const locked = useLockStore((s) => s.locked);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);

  /* Khoa man hinh thi dong popover: man cho co bang Nhac rieng. */
  useEffect(() => {
    if (locked) setOpen(false);
  }, [locked, setOpen]);

  return (
    <>
      <div className={`shrink-0 items-center gap-1 ${playing ? 'flex' : 'hidden md:flex'}`}>
        <button
          ref={setAnchor}
          type="button"
          onClick={() => setOpen(!open)}
          aria-label={label ? `Nhạc — đang phát ${label}` : 'Nhạc'}
          aria-haspopup="dialog"
          aria-expanded={open}
          title={label ? `Đang phát: ${label}` : 'Nhạc'}
          className={`flex h-11 min-w-11 items-center justify-center gap-2 rounded-control border transition fine:h-8 fine:min-w-8 ${
            playing
              ? 'border-tr-primary/40 bg-tr-primary/10 px-2.5 text-tr-primary hover:bg-tr-primary/15'
              : 'border-tr-border bg-tr-panel text-tr-muted hover:bg-tr-hover hover:text-tr-text'
          } ${focusRing}`}
        >
          {playing ? (
            <span className="tr-eq" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          ) : (
            <Headphones size={18} aria-hidden="true" />
          )}
          {label && (
            <span className="hidden max-w-36 truncate text-xs font-medium xl:inline">{label}</span>
          )}
        </button>
        {playing && (
          <button
            type="button"
            onClick={stop}
            aria-label="Dừng nhạc"
            title="Dừng nhạc"
            className={`hidden h-8 w-8 items-center justify-center rounded-control text-tr-muted transition hover:bg-tr-hover hover:text-tr-text lg:flex ${focusRing}`}
          >
            <Square size={13} aria-hidden="true" />
          </button>
        )}
      </div>
      <Popover open={open} anchor={anchor} onClose={() => setOpen(false)} title="Nhạc" width={340}>
        <MusicPanel variant="app" />
      </Popover>
    </>
  );
}
