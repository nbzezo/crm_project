import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'zoho' | 'ubuntu' | 'system';

const STORAGE_KEY = 'workflow-theme';
const THEME_MODES: readonly ThemeMode[] = ['light', 'dark', 'zoho', 'ubuntu', 'system'];

/**
 * Theme co NEN TOI. Khong chi de doi token CSS: `isDark()` la nguon su that cho
 * BlockNote, Excalidraw va MindElixir — ba thu vien tu ve giao dien rieng va chi
 * nhan mot co sang/toi. Bo sot theme toi o day thi ba vung do render nen sang
 * giua mot app dang toi.
 */
const DARK_THEMES = new Set<ThemeMode>(['dark', 'ubuntu']);

/**
 * Ba theme da go: 'neo-tactile', 'neat-slate', 'cream-teal'.
 *
 * Ca ba deu la bien the NEN SANG, nen nguoi dung dang dung chung se duoc dua ve
 * 'light' chu khong phai gia tri mac dinh 'dark' — doi tu nen sang sang nen toi
 * ma khong hoi la mot cu nhay bat ngo. Chi doc mot lan roi ghi de localStorage.
 */
const REMOVED_LIGHT_THEMES = new Set(['neo-tactile', 'neat-slate', 'cream-teal']);

function systemPrefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

/** Gan thuoc tinh data-theme len <html> de bo token CSS doi theo. */
export function applyTheme(mode: ThemeMode): void {
  const resolved = mode === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : mode;
  document.documentElement.setAttribute('data-theme', resolved);
}

function initialMode(): ThemeMode {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (THEME_MODES.includes(saved as ThemeMode)) return saved as ThemeMode;
  if (saved && REMOVED_LIGHT_THEMES.has(saved)) {
    try {
      localStorage.setItem(STORAGE_KEY, 'light');
    } catch {
      // Trinh duyet chan storage thi van chay dung trong phien nay.
    }
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
    localStorage.setItem(STORAGE_KEY, mode);
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
