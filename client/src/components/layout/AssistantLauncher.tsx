import { lazy, Suspense, useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { Sparkles } from 'lucide-react';
import { focusRing } from '../common/ui';
import { usePermissionCheck } from '../../lib/permissions';
import { useUiStore } from '../../stores/uiStore';

/* Lazy: khung chat keo theo ca bo hien thi cau tra loi, ma nhieu phien lam
   viec khong mo toi no. */
const AssistantPanel = lazy(() =>
  import('../ai/AssistantPanel').then((module) => ({ default: module.AssistantPanel }))
);

/** Phim tat mo Tro ly — Ctrl/Cmd+K da danh cho Tim kiem, Ctrl/Cmd+Shift+N cho Ghi chu nhanh. */
export const ASSISTANT_SHORTCUT = 'Ctrl /';

function onAiPage(pathname: string) {
  return pathname === '/ai' || pathname.startsWith('/ai/');
}

/** Nguoi dung mo duoc bang Tro ly o trang hien tai khong (co quyen, khong o /ai). */
export function useCanOpenAssistant(): boolean {
  const canUseAi = usePermissionCheck()('ai:read');
  const { pathname } = useLocation();
  return canUseAi && !onAiPage(pathname);
}

/**
 * Nut ✨ tren Topbar mo bang Tro ly AI. Dat o thanh tren chu khong thanh mot
 * nut noi: goc phai duoi da co nut Tao nhanh, bong bong Ghi chu nhanh va toast.
 * Tren trang /ai thi an — o do chinh la tro ly.
 *
 * Chi tu md tro len: thanh tren cua dien thoai khong con cho (tieu de trang bi
 * ep con vai pixel). Tren dien thoai loi vao nam trong bang "Tao nhanh", canh
 * "Ghi nhanh" (QuickCreateFab).
 */
export function AssistantButton() {
  const canOpen = useCanOpenAssistant();
  const open = useUiStore((s) => s.assistantPanelOpen);
  const setOpen = useUiStore((s) => s.setAssistantPanelOpen);

  if (!canOpen) return null;

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Trợ lý AI"
      aria-haspopup="dialog"
      aria-expanded={open}
      title={`Trợ lý AI (${ASSISTANT_SHORTCUT})`}
      className={`hidden h-11 w-11 shrink-0 items-center justify-center rounded-control border md:flex border-tr-border bg-tr-panel text-tr-primary transition hover:bg-tr-hover fine:h-8 fine:w-8 ${focusRing}`}
    >
      <Sparkles size={18} aria-hidden="true" />
    </button>
  );
}

/**
 * Mount mot lan o App.tsx: lang nghe phim tat, dong bang khi doi trang, va chi
 * tai ma bang o lan mo dau tien — sau do giu bang trong cay de cuoc dang hoi
 * khong mat khi dong.
 */
export function AssistantLauncher() {
  const canUseAi = usePermissionCheck()('ai:read');
  const { pathname } = useLocation();
  const open = useUiStore((s) => s.assistantPanelOpen);
  const setOpen = useUiStore((s) => s.setAssistantPanelOpen);
  const [loaded, setLoaded] = useState(false);

  if (open && !loaded) setLoaded(true);

  /* Doi trang (vd. bam "Mo toan man hinh" hay mot lien ket) thi dong bang: no
     la lop phu, de no mo de len trang moi la che mat noi nguoi dung vua toi. */
  useEffect(() => {
    setOpen(false);
  }, [pathname, setOpen]);

  useEffect(() => {
    if (!canUseAi) return;
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key !== '/') return;
      if (onAiPage(window.location.pathname)) return;
      event.preventDefault();
      const state = useUiStore.getState();
      state.setAssistantPanelOpen(!state.assistantPanelOpen);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [canUseAi]);

  if (!canUseAi || !loaded) return null;
  return (
    <Suspense fallback={null}>
      <AssistantPanel />
    </Suspense>
  );
}
