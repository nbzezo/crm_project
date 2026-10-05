import { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { MusicLink } from '../../lib/musicLinks';
import { useMusicStore } from '../../stores/musicStore';
import { importLegacyMusicLinks, MUSIC_LINKS_KEY } from './musicApi';

/* Phat link cua nguoi dung bang trinh phat nhung cua chinh dich vu (hoac the <audio> cho radio). */
function LinkPlayer({ link }: { link: MusicLink }) {
  if (link.kind === 'stream') {
    return (
      <audio
        src={link.src}
        controls
        autoPlay
        className="h-full w-full"
        aria-label={`Đang phát: ${link.title}`}
      />
    );
  }
  return (
    <iframe
      src={link.src}
      title={`Đang phát: ${link.title}`}
      allow="autoplay; encrypted-media; fullscreen"
      referrerPolicy="strict-origin-when-cross-origin"
      className="h-full w-full rounded-xl border-0"
    />
  );
}

/** Cac to tien co the cat mat o (vung cuon cua bang, popover). */
function clippingAncestors(node: HTMLElement): HTMLElement[] {
  const result: HTMLElement[] = [];
  for (let parent = node.parentElement; parent && parent !== document.body;) {
    const style = getComputedStyle(parent);
    if (/(auto|scroll|hidden|clip)/.test(`${style.overflowX} ${style.overflowY}`)) {
      result.push(parent);
    }
    parent = parent.parentElement;
  }
  return result;
}

function hide(box: HTMLElement): void {
  box.style.visibility = 'hidden';
  box.style.left = '-10000px';
  box.style.top = '0px';
  box.style.clipPath = '';
}

/**
 * Trinh phat nhac duy nhat cua ung dung (1.20.0), gan mot lan o App.
 *
 * Nam ngoai #root (portal ra <body>): khi khoa man hinh #root bi `inert`, ma trinh
 * phat van phai bam duoc tren man cho. Khung phat KHONG BAO GIO doi cho trong DOM —
 * chi doi toa do de khit len o (MusicSlot) dang mo; khong co o nao thi giau di nhung
 * van chay, nen dong bang, mo khoa hay doi trang deu khong lam ngat nhac.
 */
export function MusicHost() {
  const link = useMusicStore((s) => s.link);
  const slot = useMusicStore((s) => s.slots.at(-1) ?? null);
  const boxRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  /* Dang xuat (App go ra) thi tat nhac. */
  useEffect(() => () => useMusicStore.getState().stop(), []);

  useEffect(() => {
    void importLegacyMusicLinks().then((moved) => {
      if (moved) void queryClient.invalidateQueries({ queryKey: MUSIC_LINKS_KEY });
    });
  }, [queryClient]);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    if (!slot) {
      hide(box);
      return;
    }
    const clippers = clippingAncestors(slot);
    box.style.zIndex = slot.closest('.ls-root')
      ? 'calc(var(--z-index-lock-screen) + 1)'
      : 'calc(var(--z-index-popover) + 1)';
    let frame = 0;
    let last = '';
    /* Bam theo o tung khung hinh: o nam trong popover co hieu ung mo, vung cuon, doi
       co man hinh... — theo doi tung truong hop rieng thi de sot hon. */
    const place = () => {
      frame = requestAnimationFrame(place);
      const rect = slot.getBoundingClientRect();
      let top = Math.max(rect.top, 0);
      let left = Math.max(rect.left, 0);
      let bottom = Math.min(rect.bottom, window.innerHeight);
      let right = Math.min(rect.right, window.innerWidth);
      for (const clipper of clippers) {
        const area = clipper.getBoundingClientRect();
        top = Math.max(top, area.top);
        left = Math.max(left, area.left);
        bottom = Math.min(bottom, area.bottom);
        right = Math.min(right, area.right);
      }
      const visible = rect.width > 0 && rect.height > 0 && bottom > top && right > left;
      const key = visible
        ? [rect.left, rect.top, rect.width, rect.height, top, left, bottom, right].join()
        : 'hidden';
      if (key === last) return;
      last = key;
      if (!visible) {
        hide(box);
        return;
      }
      box.style.visibility = 'visible';
      box.style.left = `${rect.left}px`;
      box.style.top = `${rect.top}px`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;
      box.style.clipPath = `inset(${top - rect.top}px ${rect.right - right}px ${rect.bottom - bottom}px ${left - rect.left}px)`;
    };
    place();
    return () => cancelAnimationFrame(frame);
  }, [slot, link]);

  if (!link) return null;
  return createPortal(
    <div
      ref={boxRef}
      /* Bam vao <audio> khong duoc tinh la bam ra ngoai popover dang chua o phat. */
      onPointerDown={(event) => event.stopPropagation()}
      className="fixed h-[152px] w-80"
      style={{ visibility: 'hidden', left: -10000, top: 0 }}
    >
      <LinkPlayer key={link.id} link={link} />
    </div>,
    document.body
  );
}
