import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'workflow-theme';

function systemPrefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

/** Gan thuoc tinh data-theme len <html> de bo token CSS doi theo. */
export function applyTheme(mode: ThemeMode): void {
  const dark = mode === 'dark' || (mode === 'system' && systemPrefersDark());
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}

function initialMode(): ThemeMode {
  const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
  return saved ?? 'dark';
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
    return mode === 'dark' || (mode === 'system' && systemPrefersDark());
  },
}));

/** Goi mot lan luc khoi dong + theo doi thay doi cua he dieu hanh. */
export function initTheme(): void {
  applyTheme(useThemeStore.getState().mode);
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (useThemeStore.getState().mode === 'system') applyTheme('system');
  });
}
