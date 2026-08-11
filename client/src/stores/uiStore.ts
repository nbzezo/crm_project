import { create } from 'zustand';
import type { Priority } from '../types';

export interface TaskFilters {
  q: string;
  priority: Priority | '';
  customerId: number | '';
  boardId: number | '';
  status: 'all' | 'open' | 'done' | 'overdue';
}

export const emptyTaskFilters: TaskFilters = {
  q: '',
  priority: '',
  customerId: '',
  boardId: '',
  status: 'open',
};

/** Bo loc the ngay tren bang (giong nut "Bộ lọc" cua Trello). */
export interface BoardFilters {
  q: string;
  labelIds: number[];
  /** FR-TAG-22: cach ghep nhieu nhan. Mac dinh 'or' — dung hanh vi truoc day. */
  labelMode: 'or' | 'and';
  priorities: Priority[];
  due: '' | 'overdue' | 'today' | 'week' | 'none';
  status: 'all' | 'open' | 'done';
  customerId: number | '';
}

export const emptyBoardFilters: BoardFilters = {
  q: '',
  labelIds: [],
  labelMode: 'or',
  priorities: [],
  due: '',
  status: 'all',
  customerId: '',
};

export function countActiveFilters(f: BoardFilters): number {
  return (
    (f.q ? 1 : 0) +
    f.labelIds.length +
    f.priorities.length +
    (f.due ? 1 : 0) +
    (f.status !== 'all' ? 1 : 0) +
    (f.customerId !== '' ? 1 : 0)
  );
}

interface Toast {
  id: number;
  message: string;
  kind: 'error' | 'success';
  /** Nut hanh dong tren toast — dung cho "Hoàn tác" sau khi xoa. */
  action?: { label: string; run: () => void };
  /** Thoi gian tu an (ms). Toast co hanh dong duoc giu lau hon. */
  duration: number;
}

interface UiState {
  openCardId: number | null;
  openCard: (id: number) => void;
  closeCard: () => void;

  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;

  /** Ngan keo dieu huong tren man hinh hep. */
  navOpen: boolean;
  setNavOpen: (open: boolean) => void;

  /** Nhan hien dang thanh mau (thu gon) hay kem chu — giong nut bat/tat cua Trello. */
  labelText: boolean;
  toggleLabelText: () => void;

  boardFilters: BoardFilters;
  setBoardFilters: (patch: Partial<BoardFilters>) => void;
  resetBoardFilters: () => void;

  taskFilters: TaskFilters;
  setTaskFilters: (patch: Partial<TaskFilters>) => void;
  resetTaskFilters: () => void;

  toasts: Toast[];
  pushToast: (message: string, kind?: Toast['kind'], action?: Toast['action']) => void;
  dismissToast: (id: number) => void;
}

let toastSeq = 0;

export const useUiStore = create<UiState>((set) => ({
  openCardId: null,
  openCard: (id) => set({ openCardId: id }),
  closeCard: () => set({ openCardId: null }),

  searchOpen: false,
  setSearchOpen: (open) => set({ searchOpen: open }),

  navOpen: false,
  setNavOpen: (open) => set({ navOpen: open }),

  labelText: false,
  toggleLabelText: () => set((s) => ({ labelText: !s.labelText })),

  boardFilters: emptyBoardFilters,
  setBoardFilters: (patch) => set((s) => ({ boardFilters: { ...s.boardFilters, ...patch } })),
  resetBoardFilters: () => set({ boardFilters: emptyBoardFilters }),

  taskFilters: emptyTaskFilters,
  setTaskFilters: (patch) => set((s) => ({ taskFilters: { ...s.taskFilters, ...patch } })),
  resetTaskFilters: () => set({ taskFilters: emptyTaskFilters }),

  toasts: [],
  pushToast: (message, kind = 'error', action) =>
    set((s) => ({
      toasts: [
        ...s.toasts,
        { id: ++toastSeq, message, kind, action, duration: action ? 8000 : 4000 },
      ],
    })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
