import { create } from 'zustand';

export type ThemeMode =
  'light' | 'dark' | 'neo-tactile' | 'neat-slate' | 'cream-teal' | 'zoho' | 'system';

const STORAGE_KEY = 'workflow-theme';
const THEME_MODES: readonly ThemeMode[] = [
  'light',
  'dark',
  'neo-tactile',
  'neat-slate',
  'cream-teal',
  'zoho',
  'system',
];

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
  return THEME_MODES.includes(saved as ThemeMode) ? (saved as ThemeMode) : 'dark';
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
