import { Suspense, lazy, useEffect, useRef } from 'react';
import { Outlet, useMatches } from 'react-router';
import { useRouteViewport } from './lib/useRouteViewport';
import { Sidebar } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';
import { QuickCreateFab } from './components/layout/QuickCreateFab';
import { Toasts } from './components/common/Toasts';
import { usePermissionCheck, type PermissionKey } from './lib/permissions';
import { EmptyState } from './components/common/ui';
import { t } from './i18n/vi';

const CardModal = lazy(() =>
  import('./components/kanban/CardModal').then((module) => ({ default: module.CardModal }))
);
const TaskFormDialog = lazy(() =>
  import('./components/tasks/TaskFormDialog').then((module) => ({
    default: module.TaskFormDialog,
  }))
);
const QuickNotesBoard = lazy(() =>
  import('./components/quickNotes/QuickNotesBoard').then((module) => ({
    default: module.QuickNotesBoard,
  }))
);

export default function App() {
  const mainRef = useRef<HTMLElement>(null);
  useRouteViewport(mainRef);
  const matches = useMatches();
  const pageHandle = [...matches]
    .reverse()
    .map(
      (match) =>
        match.handle as
          | {
              title?: string;
              visibleHeading?: boolean;
              permission?: PermissionKey;
              /** Trang tu co o nhap ghim day man hinh — nut "Tạo nhanh" se de len no. */
              hideQuickCreate?: boolean;
            }
          | undefined
    )
    .find((handle) => handle?.title);
  const pageTitle = pageHandle?.title ?? 'WorkFlow';

  /* Chan route theo quyen. Day chi la lop giao dien — may chu van chan that o
     requireResource(); muc dich o day la hien mot cau giai thich doc duoc thay
     vi de trang tu goi API roi bao 403 rai rac khap noi.

     Doc tu chinh `handle` cua route dang khop, nen them mot route moi la khai
     bao quyen ngay tai cho do, khong phai nho cap nhat mot danh sach o noi khac. */
  const allowed = usePermissionCheck();
  const blocked = !allowed(pageHandle?.permission);

  /* Tieu de tab trinh duyet lay cung mot nguon voi sidebar va tieu de trang
     (handle.title -> t.nav.*), nen ba cho khong the goi mot man hinh bang ba
     ten khac nhau nua. */
  useEffect(() => {
    document.title = pageTitle === 'WorkFlow' ? 'WorkFlow' : `${pageTitle} · WorkFlow`;
  }, [pageTitle]);

  return (
    <div className="tr-app-stage">
      <a
        href="#main-content"
        className="sr-only z-skip-link rounded bg-tr-primary px-4 py-2 text-tr-on-primary focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Bỏ qua đến nội dung chính
      </a>
      <div className="tr-app-shell flex flex-col">
        <Topbar />
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          {/* `relative`: lam main thanh containing block cho con `position:absolute`
              (vd sr-only), neu khong chung se lay viewport lam containing block va
              lam <html> phinh ra qua chieu cao thuc, gay khoang trong khi cuon trang. */}
          <main
            ref={mainRef}
            id="main-content"
            /* tabIndex 0 chu khong phai -1: day la vung CUON that (overflow-auto),
               nen WCAG 2.1.1 doi no phai cuon duoc bang ban phim. Voi -1 thi chi
               focus bang code duoc, va khi trang chua co phan tu nao focus duoc
               ben trong — vd mot bang Kanban con rong — nguoi dung ban phim khong
               cach nao cuon noi dung. Skip-link van hoat dong y nguyen. */
            tabIndex={0}
            className="relative min-w-0 flex-1 overflow-auto bg-transparent outline-none"
          >
            {!pageHandle?.visibleHeading && <h1 className="sr-only">{pageTitle}</h1>}
            {blocked ? (
              <NoPermission />
            ) : (
              <Suspense
                fallback={
                  <div role="status" className="p-6 text-sm text-tr-muted">
                    Đang tải trang…
                  </div>
                }
              >
                <Outlet />
              </Suspense>
            )}
          </main>
        </div>
      </div>
      <Suspense fallback={null}>
        <CardModal />
        <TaskFormDialog />
        <QuickNotesBoard />
      </Suspense>
      <QuickCreateFab hidden={pageHandle?.hideQuickCreate} />
      <Toasts />
    </div>
  );
}

/** Man hinh thay the khi nguoi dung mo mot trang ho khong co quyen. */
function NoPermission() {
  return (
    <div className="p-6">
      <EmptyState message={t.permissions.noAccessTitle} hint={t.permissions.noAccessHint} />
    </div>
  );
}
