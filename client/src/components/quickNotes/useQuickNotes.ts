import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, qs } from '../../api/client';
import { useUiStore } from '../../stores/uiStore';
import type { QuickNote, QuickNoteRelationType } from '../../types';

export interface QuickNoteFilters {
  q?: string;
  view?: 'active' | 'archived' | 'trash';
  pinned?: boolean;
  has_reminder?: boolean;
  has_attachment?: boolean;
  checklist?: boolean;
  linked?: boolean;
  tag?: string;
  updated_from?: string;
  updated_to?: string;
}

export const emptyQuickNoteFilters: QuickNoteFilters = { view: 'active' };

export function useQuickNotesList(filters: QuickNoteFilters) {
  return useQuery({
    queryKey: ['quick-notes', 'list', filters],
    queryFn: () =>
      api.get<QuickNote[]>(
        `/api/quick-notes${qs(filters as Record<string, string | number | boolean | null | undefined>)}`
      ),
  });
}

export function useQuickNote(id: number | null) {
  return useQuery({
    queryKey: ['quick-notes', 'detail', id],
    queryFn: () => api.get<QuickNote>(`/api/quick-notes/${id}`),
    enabled: id !== null,
  });
}

/** Danh sach tag khong trung — dung cho popup Lọc theo tag. */
export function useQuickNoteTags() {
  return useQuery({
    queryKey: ['quick-notes', 'tags'],
    queryFn: () => api.get<string[]>('/api/quick-notes/tags'),
    staleTime: 30_000,
  });
}

/**
 * Moi hanh dong tren Quick Note dung chung mot bo mutation — theo dung mau
 * `useCalendarEvents.ts`. Chi lam moi khoa `['quick-notes']`: module nay doc
 * lap hoan toan, khong man hinh nao khac phu thuoc du lieu cua no.
 */
export function useQuickNoteMutations() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['quick-notes'] });

  const create = useMutation({
    mutationFn: (body: { title?: string; content_text?: string; content_json?: string }) =>
      api.post<QuickNote>('/api/quick-notes', body),
    onSuccess: invalidate,
  });

  /** Autosave — khong toast thanh cong, chi hien trang thai "Đã lưu" tai cho (xem QuickNoteCard). */
  const update = useMutation({
    mutationFn: (vars: { id: number; patch: Record<string, unknown> }) =>
      api.patch<QuickNote>(`/api/quick-notes/${vars.id}`, vars.patch),
    onSuccess: invalidate,
  });

  /** Khong tu toast — noi goi quyet dinh (thuong kem hanh dong "Hoàn tác", xem QuickNoteCard). */
  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/api/quick-notes/${id}`),
    onSuccess: invalidate,
  });

  const restore = useMutation({
    mutationFn: (id: number) => api.post<QuickNote>(`/api/quick-notes/${id}/restore`),
    onSuccess: () => {
      invalidate();
      pushToast('Đã khôi phục ghi chú', 'success');
    },
  });

  /** Chi goi duoc voi ghi chu DANG trong Thung rac — xoa vinh vien ca tep dinh kem. */
  const permanentlyDelete = useMutation({
    mutationFn: (id: number) => api.del(`/api/quick-notes/${id}/permanent`),
    onSuccess: () => {
      invalidate();
      pushToast('Đã xoá vĩnh viễn ghi chú', 'success');
    },
  });

  /**
   * Goi khi dong mot ghi chu — tu am tham xoa neu no hoan toan rong (giong
   * Google Keep). Khong toast: nguoi dung khong chu dong xoa nen khong can bao.
   */
  const discardIfEmpty = useMutation({
    mutationFn: (id: number) =>
      api.post<{ discarded: boolean }>(`/api/quick-notes/${id}/discard-if-empty`),
    onSuccess: (result) => {
      if (result.discarded) invalidate();
    },
  });

  const setPinned = useMutation({
    mutationFn: (vars: { id: number; pinned: boolean }) =>
      api.post<QuickNote>(`/api/quick-notes/${vars.id}/pin`, { pinned: vars.pinned }),
    onSuccess: invalidate,
  });

  /** Keo tha sap xep tay (v33) — khong toast, giu cam giac muot nhu keo the Kanban. */
  const move = useMutation({
    mutationFn: (vars: { id: number; beforeId?: number | null; afterId?: number | null }) =>
      api.post<QuickNote>(`/api/quick-notes/${vars.id}/move`, {
        beforeId: vars.beforeId,
        afterId: vars.afterId,
      }),
    onSuccess: invalidate,
  });

  const setArchived = useMutation({
    mutationFn: (vars: { id: number; archived: boolean }) =>
      api.post<QuickNote>(`/api/quick-notes/${vars.id}/archive`, { archived: vars.archived }),
    onSuccess: (_note, vars) => {
      invalidate();
      pushToast(vars.archived ? 'Đã lưu trữ ghi chú' : 'Đã bỏ lưu trữ ghi chú', 'success');
    },
  });

  const syncRelations = useMutation({
    mutationFn: (vars: {
      id: number;
      relations: { object_type: QuickNoteRelationType; object_id: number }[];
    }) =>
      api.put<QuickNote>(`/api/quick-notes/${vars.id}/relations`, { relations: vars.relations }),
    onSuccess: invalidate,
  });

  /** Ghi lai lien ket SAU KHI Task da duoc tao qua Task Composer chung (FR17). */
  const markConvertedToTask = useMutation({
    mutationFn: (vars: { id: number; cardId: number }) =>
      api.post<QuickNote>(`/api/quick-notes/${vars.id}/convert/task`, { card_id: vars.cardId }),
    onSuccess: () => {
      invalidate();
      pushToast('Đã tạo công việc từ ghi chú', 'success');
    },
  });

  const convertToCrmNote = useMutation({
    mutationFn: (vars: {
      id: number;
      links: { customer_id?: number | null; deal_id?: number | null; project_id?: number | null };
    }) => api.post<QuickNote>(`/api/quick-notes/${vars.id}/convert/crm-note`, vars.links),
    onSuccess: () => {
      invalidate();
      pushToast('Đã tạo ghi chú CRM', 'success');
    },
  });

  return {
    create,
    update,
    remove,
    restore,
    permanentlyDelete,
    discardIfEmpty,
    setPinned,
    setArchived,
    move,
    syncRelations,
    markConvertedToTask,
    convertToCrmNote,
  };
}
