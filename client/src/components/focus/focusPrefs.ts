import type { PeriodKind } from './focusPeriod';
import type { FocusMode } from './focusTypes';

const PREFS_KEY = 'focus.prefs';

export interface Prefs {
  kind: Exclude<PeriodKind, 'custom'>;
  mode: FocusMode;
}

/* Chi nho loai ky va pham vi — moc ngay luon la hom nay khi mo lai. */
export function readPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>;
    return {
      kind: raw.kind === 'day' || raw.kind === 'month' ? raw.kind : 'week',
      mode: raw.mode === 'team' ? 'team' : 'me',
    };
  } catch {
    return { kind: 'week', mode: 'me' };
  }
}

export function writePrefs(prefs: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* che do rieng tu / bi chan luu tru: bo qua, chi mat ghi nho */
  }
}
