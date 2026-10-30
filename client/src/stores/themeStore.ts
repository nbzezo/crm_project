import { create } from 'zustand';
import { ensureThemeFont } from '../lib/themeFonts';
import { storageGet, storageSet } from '../lib/safeStorage';

export type ThemeMode = 'light' | 'dark' | 'ubuntu' | 'mono' | 'system';

const STORAGE_KEY = 'workflow-theme';
const THEME_MODES: readonly ThemeMode[] = ['light', 'dark', 'ubuntu', 'mono', 'system'];

/**
 * Theme co NEN TOI. Khong chi de doi token CSS: `isDark()` la nguon su that cho
 * BlockNote, Excalidraw va MindElixir — ba thu vien tu ve giao dien rieng va chi
 * nhan mot co sang/toi. Bo sot theme toi o day thi ba vung do render nen sang
 * giua mot app dang toi.
 */
const DARK_THEMES = new Set<ThemeMode>(['dark', 'ubuntu']);

/**
 * Bon theme da go: 'neo-tactile', 'neat-slate', 'cream-teal', 'zoho'.
 *
 * Ca bon deu la bien the NEN SANG, nen nguoi dung dang dung chung se duoc dua ve
 * 'light' chu khong phai gia tri mac dinh 'dark' — doi tu nen sang sang nen toi
 * ma khong hoi la mot cu nhay bat ngo. Chi doc mot lan roi ghi de localStorage.
 */
const REMOVED_LIGHT_THEMES = new Set(['neo-tactile', 'neat-slate', 'cream-teal', 'zoho']);

function systemPrefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

/** Gan thuoc tinh data-theme len <html> de bo token CSS doi theo. */
function applyTheme(mode: ThemeMode): void {
  const resolved = mode === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : mode;
  ensureThemeFont(resolved);
  document.documentElement.setAttribute('data-theme', resolved);
}

function initialMode(): ThemeMode {
  const saved = storageGet(STORAGE_KEY);
  if (THEME_MODES.includes(saved as ThemeMode)) return saved as ThemeMode;
  if (saved && REMOVED_LIGHT_THEMES.has(saved)) {
    storageSet(STORAGE_KEY, 'light');
    return 'light';
  }
  return 'dark';
}

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  isDark: () => boolean;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: initialMode(),
  setMode: (mode) => {
    storageSet(STORAGE_KEY, mode);
    applyTheme(mode);
    set({ mode });
  },
  isDark: () => {
    const { mode } = get();
    return DARK_THEMES.has(mode) || (mode === 'system' && systemPrefersDark());
  },
}));

/** Goi mot lan luc khoi dong + theo doi thay doi cua he dieu hanh. */
export function initTheme(): void {
  applyTheme(useThemeStore.getState().mode);
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (useThemeStore.getState().mode === 'system') applyTheme('system');
  });
}
