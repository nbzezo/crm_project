import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router';
import { Maximize2, X } from 'lucide-react';
import { AssistantChat } from './AssistantChat';
import { IconButton } from '../common/ui';
import { useDialog } from '../common/useDialog';
import { useUiStore } from '../../stores/uiStore';
import { pageContextOf } from '../../ai/pageContext';

/**
 * Tro ly AI dang bang truot tu canh phai — hoi ngay tai man dang xem.
 *
 * Bang KHONG thao ra khi dong, chi an di: cau hoi dang cho tra loi van chay
 * tiep, o nhap giu nguyen chu dang go, va mo lai la thay dung cho cu. Lan mo
 * dau tien moi tai ma cua bang (AssistantLauncher lazy-load file nay).
 *
 * Cuoc tro chuyen nam trong store dung chung voi trang /ai, nen "Mo toan man
 * hinh" chi can dieu huong — trang lon tu mo dung cuoc do.
 */
export function AssistantPanel() {
  const open = useUiStore((s) => s.assistantPanelOpen);
  const setOpen = useUiStore((s) => s.setAssistantPanelOpen);
  const navigate = useNavigate();
  /* Bang dong moi khi doi trang (AssistantLauncher), nen ban ghi trong duong
     dan luc nay chinh la ban ghi nguoi dung dang xem khi mo bang. */
  const { pathname } = useLocation();
  const pageContext = useMemo(() => pageContextOf(pathname), [pathname]);
  const panelRef = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);

  useDialog({ open, onClose: close, containerRef: panelRef });

  /* useDialog dua focus vao phan tu dau tien (nut mo lich su); mo bang la de
     go cau hoi, nen chuyen thang xuong o nhap. Chay sau effect cua useDialog. */
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  return createPortal(
    <div
      className={`tr-anim-fade fixed inset-0 z-modal justify-end bg-tr-overlay print:hidden ${open ? 'flex' : 'hidden'}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Trợ lý AI"
        className="tr-anim-slide-right flex h-full w-full flex-col border-s border-tr-border bg-tr-panel pt-[env(safe-area-inset-top)] shadow-2xl sm:w-[min(30rem,100vw)] sm:pt-0"
      >
        <AssistantChat
          variant="panel"
          pageContext={pageContext}
          headerActions={
            <>
              <IconButton label="Mở toàn màn hình" onClick={() => navigate('/ai')}>
                <Maximize2 size={15} aria-hidden="true" />
              </IconButton>
              <IconButton label="Đóng trợ lý" onClick={close}>
                <X size={16} aria-hidden="true" />
              </IconButton>
            </>
          }
        />
      </div>
    </div>,
    document.body
  );
}
