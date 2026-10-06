import { useEffect, useRef } from 'react';
import { create } from 'zustand';

/*
 * Ban ghi "trang Cai dat nao dang co thay doi chua luu" (1.32.0).
 *
 * Truoc day moi man tu giu ban nhap trong state cua no; bam sang muc khac la
 * React go man do ra va ban nhap bien mat khong mot loi canh bao. Gio moi man
 * dang ky trang thai `dirty` cua minh vao day, SettingsPage doc no de hoi lai
 * truoc khi doi muc, roi trang, hoac dong tab.
 *
 * `save` (khong bat buoc) cho phep hop thoai co nut "Luu va di tiep".
 */
export interface DirtySource {
  label: string;
  save?: () => Promise<unknown>;
}

interface DirtyState {
  sources: Record<string, DirtySource>;
  set: (key: string, source: DirtySource | null) => void;
  clear: () => void;
}

export const useSettingsDirtyStore = create<DirtyState>((set) => ({
  sources: {},
  set: (key, source) =>
    set((state) => {
      if (!source) {
        if (!(key in state.sources)) return state;
        const next = { ...state.sources };
        delete next[key];
        return { sources: next };
      }
      return { sources: { ...state.sources, [key]: source } };
    }),
  clear: () => set({ sources: {} }),
}));

/**
 * Dang ky mot nguon thay doi chua luu. Tu go khi `dirty` ve false hoac khi man
 * hinh bi go ra. `save` duoc doc qua ref nen truyen ham moi moi lan render cung
 * khong lam dang ky lai.
 */
export function useSettingsDirty(
  key: string,
  dirty: boolean,
  label: string,
  save?: () => Promise<unknown>
) {
  const setSource = useSettingsDirtyStore((s) => s.set);
  const saveRef = useRef(save);
  saveRef.current = save;
  const hasSave = Boolean(save);
  useEffect(() => {
    if (!dirty) {
      setSource(key, null);
      return;
    }
    setSource(key, { label, save: hasSave ? () => saveRef.current!() : undefined });
    return () => setSource(key, null);
  }, [key, dirty, label, hasSave, setSource]);
}

export function dirtySummary(sources: Record<string, DirtySource>): string {
  const labels = [...new Set(Object.values(sources).map((source) => source.label))];
  return labels.join(', ');
}
