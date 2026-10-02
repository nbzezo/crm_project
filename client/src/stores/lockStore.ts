import { create } from 'zustand';

/*
 * Man khoa / man cho (1.14.0).
 *
 * Trang thai "dang khoa" nam trong localStorage chu khong chi trong bo nho:
 * - tai lai trang (F5) khong duoc la cach mo khoa;
 * - khoa o mot tab thi moi tab khac cung khoa (su kien `storage`).
 *
 * Lua chon man cho va thoi gian tu khoa la so thich cua TUNG MAY (nhu giao dien
 * Sang/Toi), con ma PIN nam o may chu theo tai khoan (/api/lock-screen).
 */

export type LockScene = 'aurora' | 'sunset' | 'night' | 'ocean' | 'forest' | 'minimal';
export const LOCK_SCENES: readonly LockScene[] = [
  'aurora',
  'sunset',
  'night',
  'ocean',
  'forest',
  'minimal',
];

/** 0 = khong tu khoa. */
export const IDLE_OPTIONS = [0, 5, 10, 15, 30, 60] as const;
export type IdleMinutes = (typeof IDLE_OPTIONS)[number];

export interface LockPrefs {
  scene: LockScene;
  idleMinutes: IdleMinutes;
  showSeconds: boolean;
  showLunar: boolean;
  showQuote: boolean;
}

export const DEFAULT_LOCK_PREFS: LockPrefs = {
  scene: 'aurora',
  idleMinutes: 0,
  showSeconds: false,
  showLunar: true,
  showQuote: true,
};

export const LOCKED_KEY = 'workflow.lock.locked';
export const PREFS_KEY = 'workflow.lock.prefs.v1';
/** Moc hoat dong gan nhat, chung giua cac tab — go phim o tab A thi tab B khong tu khoa. */
export const ACTIVITY_KEY = 'workflow.lock.activity';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Trinh duyet chan storage: van khoa/mo duoc trong tab nay.
  }
}

export function parsePrefs(raw: string | null): LockPrefs {
  try {
    const value = JSON.parse(raw ?? '') as Partial<LockPrefs>;
    return {
      scene: LOCK_SCENES.includes(value.scene as LockScene)
        ? (value.scene as LockScene)
        : DEFAULT_LOCK_PREFS.scene,
      idleMinutes: IDLE_OPTIONS.includes(value.idleMinutes as IdleMinutes)
        ? (value.idleMinutes as IdleMinutes)
        : DEFAULT_LOCK_PREFS.idleMinutes,
      showSeconds: value.showSeconds ?? DEFAULT_LOCK_PREFS.showSeconds,
      showLunar: value.showLunar ?? DEFAULT_LOCK_PREFS.showLunar,
      showQuote: value.showQuote ?? DEFAULT_LOCK_PREFS.showQuote,
    };
  } catch {
    return DEFAULT_LOCK_PREFS;
  }
}

interface LockState {
  locked: boolean;
  prefs: LockPrefs;
  lock: () => void;
  unlock: () => void;
  setPrefs: (patch: Partial<LockPrefs>) => void;
}

export const useLockStore = create<LockState>((set, get) => ({
  locked: read(LOCKED_KEY) === '1',
  prefs: parsePrefs(read(PREFS_KEY)),
  lock: () => {
    write(LOCKED_KEY, '1');
    set({ locked: true });
  },
  unlock: () => {
    write(LOCKED_KEY, null);
    write(ACTIVITY_KEY, String(Date.now()));
    set({ locked: false });
  },
  setPrefs: (patch) => {
    const prefs = { ...get().prefs, ...patch };
    write(PREFS_KEY, JSON.stringify(prefs));
    set({ prefs });
  },
}));

/** Dang xuat thi bo co khoa: lan dang nhap sau khong mo ra man khoa cua phien cu. */
export function clearLockOnSignOut(): void {
  write(LOCKED_KEY, null);
  useLockStore.setState({ locked: false });
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === LOCKED_KEY) useLockStore.setState({ locked: event.newValue === '1' });
    else if (event.key === PREFS_KEY) useLockStore.setState({ prefs: parsePrefs(event.newValue) });
  });
}
