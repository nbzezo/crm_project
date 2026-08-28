import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { ListTodo, NotebookPen, NotebookText, X } from 'lucide-react';
import { api } from '../../api/client';
import { focusRing } from '../common/ui';
import { useUiStore } from '../../stores/uiStore';
import type { MeetingNote } from '../../types';

/**
 * The huy hieu dau tick chong hai vong tron — theo mau nguoi dung gui, nhung
 * doi mau de hop voi nen: nut FAB da la gradient tr-primary nen mang xanh
 * nguyen ban se chim; doi sang trang (tr-on-primary) cho vong tron + dau tick
 * mau tr-primary de noi tren nen do, giu dung bo cuc hai vong tron lech nhau.
 */
function CheckBadgeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="15.5" cy="8.5" r="7" className="fill-tr-on-primary/45" />
      <circle cx="9.5" cy="13.5" r="8" className="fill-tr-on-primary" />
      <path
        d="M6 14l3 3 7-7.5"
        className="stroke-tr-primary"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/**
 * Nut hanh dong noi (FAB) — luon noi tren moi trang, bam vao xoe ra ba lua
 * chon "tao nhanh": Cong viec (dung lai openTaskComposer, giong nut "+" cu o
 * Topbar — nut do da bo vi trung lap), Ghi chu nhanh (mo Bang Ghi chu nhanh —
 * overlay kieu Sticky Notes, xem QuickNotesBoard.tsx — VOI mot ghi chu rong
 * dang mo san) va Ghi chu (Ghi chu hop CRM, tao mot ghi chu DOC LAP — xem
 * migrate-v31.sql — roi dieu huong sang trang "Ghi chu"). Mount mot lan o
 * App.tsx, khong phu thuoc trang dang xem.
 */
export function QuickCreateFab() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const openTaskComposer = useUiStore((s) => s.openTaskComposer);
  const openQuickNotesBoard = useUiStore((s) => s.openQuickNotesBoard);
  const pushToast = useUiStore((s) => s.pushToast);

  const createNote = useMutation({
    mutationFn: () => api.post<MeetingNote>('/api/meeting-notes', { title: 'Ghi chú mới' }),
    onSuccess: (note) => {
      setOpen(false);
      navigate(`/notes?open=${note.id}`);
    },
    onError: (error) =>
      pushToast(error instanceof Error ? error.message : 'Không tạo được ghi chú'),
  });

  /**
   * FR22: mo thang Bang Ghi chu nhanh voi mot ghi chu rong tu bat ky dau,
   * khong phai qua hai lan bam (mo FAB roi bam Ghi chu nhanh) — khop muc tieu
   * UX < 1 giay cua BRD muc 37. Khong dung Ctrl/Cmd+K vi phim do da danh cho
   * Tim kiem (SearchBox.tsx).
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setOpen(false);
        openQuickNotesBoard({ createNew: true });
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openQuickNotesBoard]);

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-sticky" onClick={() => setOpen(false)} aria-hidden="true" />
      )}
      <div className="fixed right-5 bottom-5 z-nav-overlay flex flex-col items-end gap-2 sm:right-8 sm:bottom-8">
        {open && (
          <div className="tr-anim-pop flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                openTaskComposer();
              }}
              className={`flex items-center gap-2 rounded-full bg-tr-panel py-2 pr-4 pl-3 text-sm font-medium text-tr-text shadow-lg ring-1 ring-tr-border transition hover:bg-tr-hover ${focusRing}`}
            >
              <ListTodo size={16} className="text-tr-primary" aria-hidden="true" />
              Công việc
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                openQuickNotesBoard({ createNew: true });
              }}
              className={`flex items-center gap-2 rounded-full bg-tr-panel py-2 pr-4 pl-3 text-sm font-medium text-tr-text shadow-lg ring-1 ring-tr-border transition hover:bg-tr-hover ${focusRing}`}
            >
              <NotebookPen size={16} className="text-tr-primary" aria-hidden="true" />
              Ghi chú nhanh
            </button>
            <button
              type="button"
              disabled={createNote.isPending}
              onClick={() => createNote.mutate()}
              className={`flex items-center gap-2 rounded-full bg-tr-panel py-2 pr-4 pl-3 text-sm font-medium text-tr-text shadow-lg ring-1 ring-tr-border transition hover:bg-tr-hover disabled:opacity-60 ${focusRing}`}
            >
              <NotebookText size={16} className="text-tr-primary" aria-hidden="true" />
              {createNote.isPending ? 'Đang tạo…' : 'Ghi chú'}
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Đóng menu tạo nhanh' : 'Tạo nhanh'}
          aria-expanded={open}
          className={`group relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-tr-primary to-tr-primary-hover text-tr-on-primary shadow-lg shadow-tr-primary/40 transition-all duration-200 hover:scale-105 hover:shadow-xl hover:shadow-tr-primary/50 active:scale-95 ${focusRing}`}
        >
          <CheckBadgeIcon
            className={`absolute h-6 w-6 transition-all duration-200 ${open ? 'scale-50 opacity-0' : 'scale-100 opacity-100 group-hover:scale-110'}`}
          />
          <X
            size={26}
            aria-hidden="true"
            className={`absolute transition-all duration-200 ${open ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}
          />
        </button>
      </div>
    </>
  );
}
