import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Building2, ListTodo, Plus, Target, Users, Zap } from 'lucide-react';
import { api } from '../../api/client';
import { focusRing } from '../common/ui';

/* Lazy: hai bieu mau nay nang, va phan lon phien lam viec khong mo toi chung. */
const DealForm = lazy(() =>
  import('../crm/DealForm').then((module) => ({ default: module.DealForm }))
);
const CustomerForm = lazy(() =>
  import('../crm/CustomerForm').then((module) => ({ default: module.CustomerForm }))
);
import { useUiStore } from '../../stores/uiStore';
import type { MeetingNote } from '../../types';

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
  const [dealOpen, setDealOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Mo menu thi dua focus vao muc dau — neu khong, nguoi dung ban phim bam mo
  // xong van dang dung o nut FAB va phai Tab nguoc lai.
  useEffect(() => {
    if (open) menuRef.current?.querySelector('button')?.focus();
  }, [open]);
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
          /*
           * MOT the menu thay vi nam pill roi.
           *
           * Nam pill rong khac nhau ma can phai nen mep trai thanh bac thang,
           * va khong co cho nao dat tieu de nhom hay phim tat. Gop lai thanh mot
           * the: mep thang, chia duoc hai nhom, va hien duoc phim tat dang co.
           */
          <div
            ref={menuRef}
            role="menu"
            aria-label="Tạo nhanh"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                setOpen(false);
              }
            }}
            className="tr-anim-pop w-60 overflow-hidden rounded-panel border border-tr-border bg-tr-panel py-1.5 shadow-2xl"
          >
            <MenuGroup label="Bán hàng" />
            <MenuItem
              icon={<Target size={16} aria-hidden="true" />}
              label="Cơ hội"
              onClick={() => {
                setOpen(false);
                setDealOpen(true);
              }}
            />
            <MenuItem
              icon={<Building2 size={16} aria-hidden="true" />}
              label="Khách hàng"
              onClick={() => {
                setOpen(false);
                setCustomerOpen(true);
              }}
            />

            <MenuGroup label="Việc & ghi chú" divider />
            <MenuItem
              icon={<ListTodo size={16} aria-hidden="true" />}
              label="Công việc"
              onClick={() => {
                setOpen(false);
                openTaskComposer();
              }}
            />
            {/* `Zap` chu khong phai hinh quyen so: o 16px, NotebookPen va
                NotebookText gan nhu khong phan biet noi — hai muc ghi chu phai
                khac nhau o CA nhan lan hinh. */}
            <MenuItem
              icon={<Zap size={16} aria-hidden="true" />}
              label="Ghi chú nhanh"
              shortcut="Ctrl ⇧ N"
              onClick={() => {
                setOpen(false);
                openQuickNotesBoard({ createNew: true });
              }}
            />
            <MenuItem
              icon={<Users size={16} aria-hidden="true" />}
              label={createNote.isPending ? 'Đang tạo…' : 'Ghi chú họp'}
              disabled={createNote.isPending}
              onClick={() => createNote.mutate()}
            />
          </div>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Đóng menu tạo nhanh' : 'Tạo nhanh'}
          aria-expanded={open}
          aria-haspopup="menu"
          className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-tr-primary to-tr-primary-hover text-tr-on-primary shadow-lg shadow-tr-primary/40 transition-all duration-200 hover:scale-105 hover:shadow-xl hover:shadow-tr-primary/50 active:scale-95 ${focusRing}`}
        >
          {/* Mot dau cong xoay 45 do thanh dau X — mot icon, mot chuyen dong.
              Truoc day la huy hieu DAU TICK, ma dau tick nghia la "xong/da duyet"
              chu khong phai "tao moi". */}
          <Plus
            size={26}
            aria-hidden="true"
            className={`transition-transform duration-200 ${open ? 'rotate-45' : ''}`}
          />
        </button>
      </div>
      <Suspense fallback={null}>
        {dealOpen && <DealForm open onClose={() => setDealOpen(false)} />}
        {customerOpen && <CustomerForm open onClose={() => setCustomerOpen(false)} />}
      </Suspense>
    </>
  );
}

/** Tieu de nhom trong menu — thuan trang tri nen an khoi cay a11y. */
function MenuGroup({ label, divider }: { label: string; divider?: boolean }) {
  return (
    <p
      aria-hidden="true"
      className={`px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-tr-muted uppercase ${
        divider ? 'mt-1 border-t border-tr-border' : ''
      }`}
    >
      {label}
    </p>
  );
}

function MenuItem({
  icon,
  label,
  shortcut,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  /** Phim tat da ton tai — hien ra de nguoi dung khoi phai tu mo. */
  shortcut?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-tr-text transition hover:bg-tr-hover disabled:cursor-wait disabled:opacity-60 ${focusRing}`}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control bg-tr-primary/10 text-tr-primary">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      {shortcut && (
        <kbd className="shrink-0 rounded border border-tr-border px-1.5 py-0.5 text-[10px] text-tr-muted">
          {shortcut}
        </kbd>
      )}
    </button>
  );
}
