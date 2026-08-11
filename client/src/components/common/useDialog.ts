import { useEffect, useRef, type RefObject } from 'react';

/**
 * Ha tang dung chung cho moi lop phu dang hop thoai (Modal, CardModal, SearchBox).
 *
 * Giai quyet bon thu ma tung lop phu tu lam se lech nhau:
 *  1. Escape chi dong hop thoai tren cung — ConfirmDialog mo chong len Modal
 *     khong duoc dong ca hai.
 *  2. Bay focus: Tab khong di ra sau nen.
 *  3. Khoa cuon nen (dem so hop thoai dang mo de khong mo khoa som).
 *  4. Tra focus ve dung phan tu da mo hop thoai.
 */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Ngan xep hop thoai dang mo — phan tu cuoi la lop tren cung. */
const openStack: string[] = [];
let lockCount = 0;
let savedOverflow = '';
let savedPaddingRight = '';

function lockScroll() {
  if (lockCount++ > 0) return;
  const { body } = document;
  savedOverflow = body.style.overflow;
  savedPaddingRight = body.style.paddingRight;
  // Bu chieu rong thanh cuon de trang khong giat ngang khi khoa.
  const gap = window.innerWidth - document.documentElement.clientWidth;
  if (gap > 0) body.style.paddingRight = `${gap}px`;
  body.style.overflow = 'hidden';
}

function unlockScroll() {
  if (--lockCount > 0) return;
  lockCount = 0;
  document.body.style.overflow = savedOverflow;
  document.body.style.paddingRight = savedPaddingRight;
}

let idSeq = 0;

interface Options {
  open: boolean;
  onClose: () => void;
  /** Vung chua noi dung hop thoai — dung de bay focus. */
  containerRef: RefObject<HTMLElement | null>;
  /** Tat bay focus/khoa cuon cho lop phu nhe (vi du popover). */
  trapFocus?: boolean;
}

export function useDialog({ open, onClose, containerRef, trapFocus = true }: Options) {
  const idRef = useRef<string>('');
  if (!idRef.current) idRef.current = `dlg-${++idSeq}`;
  // Giu onClose trong ref de effect khong gan lai listener moi lan cha render.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const id = idRef.current;
    const trigger = document.activeElement as HTMLElement | null;

    openStack.push(id);
    if (trapFocus) lockScroll();

    // Dua focus vao trong hop thoai (o nhap dau tien, neu khong thi chinh vung chua).
    const container = containerRef.current;
    if (trapFocus && container) {
      const first = container.querySelector<HTMLElement>(FOCUSABLE);
      if (first) first.focus();
      else {
        container.tabIndex = -1;
        container.focus();
      }
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (openStack[openStack.length - 1] !== id) return; // khong phai lop tren cung

      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
        return;
      }

      if (e.key !== 'Tab' || !trapFocus) return;
      const node = containerRef.current;
      if (!node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (!node.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      const index = openStack.indexOf(id);
      if (index !== -1) openStack.splice(index, 1);
      if (trapFocus) unlockScroll();
      // Tra focus ve nut da mo hop thoai — neu no van con trong tai lieu.
      if (trigger && document.contains(trigger)) trigger.focus();
    };
  }, [open, containerRef, trapFocus]);
}
