import { useEffect } from 'react';
import { ACTIVITY_KEY, useLockStore } from '../../stores/lockStore';

/*
 * Phim tat va tu khoa khi khong dung.
 *
 * Phim tat la Ctrl+Shift+L chu khong phai Ctrl+L: Ctrl+L la "nhay len thanh dia
 * chi" cua moi trinh duyet, chiem no la lam hong mot thao tac nguoi ta dung hang
 * ngay.
 *
 * Moc hoat dong ghi chung vao localStorage (thua, moi 5 giay mot lan) de go phim
 * o tab nay thi tab kia khong tu khoa.
 */

const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;
const WRITE_EVERY_MS = 5_000;
const CHECK_EVERY_MS = 15_000;

function lastActivity(local: number): number {
  try {
    const shared = Number(localStorage.getItem(ACTIVITY_KEY));
    return Number.isFinite(shared) ? Math.max(local, shared) : local;
  } catch {
    return local;
  }
}

export function useLockTriggers(): void {
  const idleMinutes = useLockStore((s) => s.prefs.idleMinutes);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey) return;
      if (event.key.toLowerCase() !== 'l') return;
      event.preventDefault();
      useLockStore.getState().lock();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!idleMinutes) return;
    let local = Date.now();
    let written = 0;
    const record = () => {
      if (useLockStore.getState().locked) return;
      local = Date.now();
      if (local - written < WRITE_EVERY_MS) return;
      written = local;
      try {
        localStorage.setItem(ACTIVITY_KEY, String(local));
      } catch {
        // Khong ghi duoc thi chi tab nay biet minh dang duoc dung — van dung.
      }
    };
    record();
    for (const name of ACTIVITY_EVENTS) {
      window.addEventListener(name, record, { passive: true, capture: true });
    }
    const timer = window.setInterval(() => {
      const state = useLockStore.getState();
      if (state.locked) return;
      if (Date.now() - lastActivity(local) >= idleMinutes * 60_000) state.lock();
    }, CHECK_EVERY_MS);
    return () => {
      for (const name of ACTIVITY_EVENTS) {
        window.removeEventListener(name, record, { capture: true });
      }
      window.clearInterval(timer);
    };
  }, [idleMinutes]);
}
