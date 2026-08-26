import { create } from 'zustand';
import type { Card, CardStatus, Priority } from '../types';

export interface TaskFilters {
  q: string;
  priority: Priority | '';
  customerId: number | '';
  boardId: number | '';
  /** Lọc theo dự án — máy chủ lọc qua `boards.project_id`, không qua cột trên thẻ. */
  projectId: number | '';
  /**
   * Một trục duy nhất cho cả "đã xong chưa" và vòng đời (v16).
   *
   * Tách thành hai ô sẽ có hai dropdown cùng tên "Trạng thái" cạnh nhau; gộp lại
   * đúng với cách người dùng nghĩ — họ chọn *một* lát cắt tại một thời điểm.
   * 'waiting' gộp `blocked` + `waiting_customer`: cả hai đều là đang chờ ai đó.
   */
  status: 'all' | 'open' | 'done' | 'doing' | 'waiting' | 'blocked' | 'review';
  due: '' | 'overdue' | 'today' | 'tomorrow' | 'week' | 'none';
  /** '' = mọi người, 'mine' = việc của tôi, 'none' = chưa giao, số = một người cụ thể. */
  assignee: number | '' | 'mine' | 'none';
}

export const emptyTaskFilters: TaskFilters = {
  q: '',
  priority: '',
  customerId: '',
  boardId: '',
  projectId: '',
  status: 'open',
  due: '',
  assignee: '',
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
  /** Vòng đời (v16) — trục riêng, độc lập với `status` ở trên. '' = mọi trạng thái. */
  cardStatus: CardStatus | '';
  customerId: number | '';
  /** '' = mọi người, 'mine' = việc của tôi, 'none' = chưa giao, số = một người cụ thể. */
  assignee: number | '' | 'mine' | 'none';
}

export const emptyBoardFilters: BoardFilters = {
  q: '',
  labelIds: [],
  labelMode: 'or',
  priorities: [],
  due: '',
  status: 'all',
  cardStatus: '',
  customerId: '',
  assignee: '',
};

export function countActiveFilters(f: BoardFilters): number {
  return (
    (f.q ? 1 : 0) +
    f.labelIds.length +
    f.priorities.length +
    (f.due ? 1 : 0) +
    (f.status !== 'all' ? 1 : 0) +
    (f.cardStatus !== '' ? 1 : 0) +
    (f.customerId !== '' ? 1 : 0) +
    (f.assignee !== '' ? 1 : 0)
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

/**
 * Ngu canh mo form tao cong viec tu mot module bat ky.
 *
 * Chi can khoa cu the nhat ma man hinh dang biet — server suy ra phan con lai
 * qua GET /api/cards/context.
 */
export interface TaskContext {
  customer_id?: number;
  contact_id?: number;
  deal_id?: number;
  contract_id?: number;
  quotation_id?: number;
}

/** Dữ liệu đã được chuẩn hóa để điền vào form tạo công việc dùng chung. */
export interface TaskComposerDraft {
  title: string;
  description?: string;
  priority?: Priority;
  startDate?: string | null;
  dueDate?: string | null;
  checklist?: string[];
  links?: TaskContext;
  /** Có request id nghĩa là bản nháp đến từ AI và cần gửi phản hồi khi lưu. */
  aiRequestId?: string;
  aiWarnings?: string[];
}

export interface TaskComposerState {
  context: TaskContext;
  listId?: number;
  /**
   * Nguoi phu trach dat truoc — tach khoi `context` vi day khong phai lien ket CRM.
   * Vi du: mo form tu the "Viec cua Anh Tuan" thi dien san chinh nguoi do.
   */
  assigneeContactId?: number | null;
  /** Dự án đặt trước — bỏ trống thì máy chủ suy ra theo bảng chứa danh sách đích. */
  projectId?: number | null;
  /** Tieu de go san — vi du khi nguoi dung dang go o o them nhanh roi mo form day du. */
  draftTitle?: string;
  /** Bản nháp đầy đủ — dùng cho luồng dán/gõ nhanh rồi nhờ AI chuẩn hóa. */
  draft?: TaskComposerDraft;
  /**
   * Goi sau khi luu thanh cong — noi mo form co the nhung mot tham chieu
   * nguoc lai (vd. ghi chu hop chen mot the tham chieu vao ngay cho vua go
   * "/công việc"). Khong bat buoc — cac noi mo form khac khong can quan tam.
   */
  onCreated?: (card: Card) => void;
}

interface UiState {
  openCardId: number | null;
  cardPresentation: 'modal' | 'drawer';
  openCard: (id: number, presentation?: 'modal' | 'drawer') => void;
  closeCard: () => void;

  /** Form tao cong viec dung chung, mount mot lan o App va mo tu bat ky trang nao. */
  taskComposer: TaskComposerState | null;
  openTaskComposer: (state?: TaskComposerState) => void;
  closeTaskComposer: () => void;

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
  cardPresentation: 'modal',
  openCard: (id, presentation = 'modal') => set({ openCardId: id, cardPresentation: presentation }),
  closeCard: () => set({ openCardId: null }),

  taskComposer: null,
  openTaskComposer: (state) => set({ taskComposer: state ?? { context: {} } }),
  closeTaskComposer: () => set({ taskComposer: null }),

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
