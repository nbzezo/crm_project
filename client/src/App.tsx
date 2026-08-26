import { lazy, Suspense } from 'react';
import { Outlet, useMatches } from 'react-router';
import { Sidebar } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';
import { QuickCreateFab } from './components/layout/QuickCreateFab';
import { Toasts } from './components/common/Toasts';

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
  const matches = useMatches();
  const pageHandle = [...matches]
    .reverse()
    .map((match) => match.handle as { title?: string; visibleHeading?: boolean } | undefined)
    .find((handle) => handle?.title);
  const pageTitle = pageHandle?.title ?? 'WorkFlow';

  return (
    <div className="tr-app-stage">
      <a
        href="#main-content"
        className="sr-only z-[100] rounded bg-tr-primary px-4 py-2 text-tr-on-primary focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
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
            id="main-content"
            tabIndex={-1}
            className="relative min-w-0 flex-1 overflow-auto bg-transparent outline-none"
          >
            {!pageHandle?.visibleHeading && <h1 className="sr-only">{pageTitle}</h1>}
            <Suspense
              fallback={
                <div role="status" className="p-6 text-sm text-tr-muted">
                  Đang tải trang…
                </div>
              }
            >
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>
      <Suspense fallback={null}>
        <CardModal />
        <TaskFormDialog />
        <QuickNotesBoard />
      </Suspense>
      <QuickCreateFab />
      <Toasts />
    </div>
  );
}
