import { create } from 'zustand';
import { playAmbient, stopAmbient, type AmbientKind } from '../components/music/ambient';
import type { MusicLink } from '../lib/musicLinks';

/*
 * Nhac dang phat — dung chung cho man cho va man lam viec (1.20.0).
 *
 * Mot trinh phat cho ca phien: bat nhac o man cho thi mo khoa van nghe tiep, bat o
 * thanh tren thi khoa man hinh van khong ngat. Link (YouTube / Spotify / radio) phat
 * trong MusicHost, gan mot lan o App; am thanh tao san phat bang Web Audio (ambient.ts).
 *
 * `slots`: cac o trong giao dien muon HIEN trinh phat (bang Nhac o man cho, popover
 * tren thanh tren). MusicHost dat khung phat de len o mo sau cung — khong bao gio
 * chuyen iframe sang cho khac trong DOM, vi lam vay trinh duyet tai lai va nhac bi ngat.
 */
interface MusicState {
  link: MusicLink | null;
  ambient: AmbientKind | null;
  /** Popover Nhac tren thanh tren (menu tai khoan tren dien thoai cung mo duoc). */
  panelOpen: boolean;
  slots: HTMLElement[];
  playLink: (link: MusicLink) => void;
  playAmbient: (kind: AmbientKind) => void;
  stop: () => void;
  setPanelOpen: (open: boolean) => void;
  addSlot: (slot: HTMLElement) => void;
  removeSlot: (slot: HTMLElement) => void;
}

export const useMusicStore = create<MusicState>((set) => ({
  link: null,
  ambient: null,
  panelOpen: false,
  slots: [],
  playLink: (link) => {
    stopAmbient();
    set({ link, ambient: null });
  },
  playAmbient: (kind) => {
    playAmbient(kind);
    set({ link: null, ambient: kind });
  },
  stop: () => {
    stopAmbient();
    set({ link: null, ambient: null });
  },
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  addSlot: (slot) => set((state) => ({ slots: [...state.slots.filter((s) => s !== slot), slot] })),
  removeSlot: (slot) => set((state) => ({ slots: state.slots.filter((s) => s !== slot) })),
}));

/** Dang phat gi do (link hoac am thanh tao san). */
export const selectPlaying = (state: MusicState) => state.link !== null || state.ambient !== null;
