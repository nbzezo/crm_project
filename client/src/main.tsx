import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { Navigate, createBrowserRouter, RouterProvider, useSearchParams } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { AuthGate } from './components/auth/AuthGate';
import { NotFoundPage, RouteErrorPage } from './components/common/RouteError';
import { useUiStore } from './stores/uiStore';
import { isUserCancelled } from './api/client';
import { t } from './i18n/vi';
import { initTheme } from './stores/themeStore';
import './index.css';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const BoardsPage = lazy(() => import('./pages/BoardsPage'));
const BoardPage = lazy(() => import('./pages/BoardPage'));
const CustomersPage = lazy(() => import('./pages/CustomersPage'));
const CustomerDetailPage = lazy(() => import('./pages/CustomerDetailPage'));
const PipelinePage = lazy(() => import('./pages/PipelinePage'));
const DealDetailPage = lazy(() => import('./pages/DealDetailPage'));
const PipelineHealthPage = lazy(() => import('./pages/PipelineHealthPage'));
const ContractsPage = lazy(() => import('./pages/ContractsPage'));
const RevenuePage = lazy(() => import('./pages/RevenuePage'));
const DocumentsHubPage = lazy(() => import('./pages/DocumentsHubPage'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const TimelinePage = lazy(() => import('./pages/TimelinePage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const PerformancePage = lazy(() => import('./pages/PerformancePage'));
const TasksPage = lazy(() => import('./pages/TasksPage'));
const FollowUpPage = lazy(() => import('./pages/FollowUpPage'));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const ProjectDetailPage = lazy(() => import('./pages/ProjectDetailPage'));
const OrgDirectoryPage = lazy(() => import('./pages/OrgDirectoryPage'));
const MyContactsPage = lazy(() => import('./pages/MyContactsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AiWorkspacePage = lazy(() => import('./pages/AiWorkspacePage'));
const PublicSharePage = lazy(() => import('./pages/PublicSharePage'));

/* /notes da gop vao tab "Trang tài liệu" cua /documents. Giu duong dan cu (va
   tham so `open`) de link da chia se, bookmark va lich su trinh duyet khong hong. */
function NotesRedirect() {
  const [params] = useSearchParams();
  const next = new URLSearchParams({ tab: 'pages' });
  const open = params.get('open');
  if (open) next.set('open', open);
  return <Navigate to={`/documents?${next.toString()}`} replace />;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 },
    mutations: {
      onError: (error) => {
        /* Người dùng tự chọn "Giữ nguyên trạng thái" ở hộp Quy trình (v66): không
           phải lỗi, không báo đỏ. Thao tác lạc quan vẫn được hoàn lại như mọi lỗi. */
        if (isUserCancelled(error)) return;
        useUiStore.getState().pushToast(error instanceof Error ? error.message : 'Đã xảy ra lỗi');
      },
    },
  },
});

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    /* Bat moi loi render va moi chunk `lazy()` khong tai duoc. Khong co no thi
       nguoi dung roi vao man hinh loi mac dinh tieng Anh cua react-router. */
    errorElement: <RouteErrorPage />,
    children: [
      {
        index: true,
        element: <DashboardPage />,
        handle: { title: t.nav.dashboard, visibleHeading: true },
      },
      {
        path: 'boards',
        element: <BoardsPage />,
        handle: { permission: 'boards:read', title: t.nav.boards },
      },
      {
        path: 'boards/:boardId',
        element: <BoardPage />,
        handle: {
          permission: 'boards:read',
          title: 'Chi tiết luồng việc',
          mobileChrome: 'no-topbar',
        },
      },
      {
        path: 'customers',
        element: <CustomersPage />,
        handle: { permission: 'customers:read', title: t.nav.customers, visibleHeading: true },
      },
      {
        path: 'customers/:customerId',
        element: <CustomerDetailPage />,
        handle: { permission: 'customers:read', title: 'Hồ sơ khách hàng', visibleHeading: true },
      },
      {
        path: 'pipeline',
        element: <PipelinePage />,
        handle: { permission: 'deals:read', title: t.nav.pipeline, visibleHeading: true },
      },
      {
        path: 'deals/:dealId',
        element: <DealDetailPage />,
        handle: { permission: 'deals:read', title: 'Chi tiết cơ hội', visibleHeading: true },
      },
      {
        path: 'pipeline-health',
        element: <PipelineHealthPage />,
        handle: { permission: 'report.sales:read', title: t.nav.pipelineHealth },
      },
      {
        path: 'contracts',
        element: <ContractsPage />,
        handle: { permission: 'contracts:read', title: t.nav.contracts },
      },
      {
        /* Ba màn hình: /revenue (tổng), /revenue/new (Mới + Mở rộng), /revenue/base (Nền). */
        path: 'revenue/:view?',
        element: <RevenuePage />,
        handle: { permission: 'revenues:read', title: t.nav.revenue },
      },
      {
        path: 'documents',
        element: <DocumentsHubPage />,
        /* Khong dat `permission`: route mo duoc khi co MOT trong hai quyen
           (documents:read / notes:read) — DocumentsHubPage tu kiem va an tab.
           `visibleHeading`: PageHeader da render <h1>, thieu co nay App.tsx se
           render them mot <h1 class="sr-only"> nua. */
        handle: { title: t.nav.documents, visibleHeading: true },
      },
      {
        path: 'calendar',
        element: <CalendarPage />,
        handle: { permission: 'tasks:read', title: t.nav.calendar },
      },
      {
        path: 'timeline',
        element: <TimelinePage />,
        handle: { permission: 'tasks:read', title: t.nav.timeline },
      },
      // Bảng tính đã gộp vào trang Công việc — giữ đường dẫn cũ để link cũ không hỏng
      { path: 'table', element: <Navigate to="/tasks" replace /> },
      {
        path: 'reports',
        element: <ReportsPage />,
        handle: { permission: 'report.tasks:read', title: t.nav.reports },
      },
      {
        path: 'performance',
        element: <PerformancePage />,
        handle: { permission: 'report.tasks:read', title: t.nav.performance },
      },
      {
        path: 'tasks',
        element: <TasksPage />,
        handle: {
          permission: 'tasks:read',
          title: t.nav.tasks,
          visibleHeading: true,
          hideQuickCreate: true,
        },
      },
      {
        path: 'projects',
        element: <ProjectsPage />,
        handle: { permission: 'projects:read', title: t.nav.projects, visibleHeading: true },
      },
      {
        path: 'projects/:projectId',
        element: <ProjectDetailPage />,
        handle: { permission: 'projects:read', title: 'Chi tiết dự án', visibleHeading: true },
      },
      {
        path: 'follow-up',
        element: <FollowUpPage />,
        handle: { permission: 'tasks:read', title: t.nav.followUp, visibleHeading: true },
      },
      {
        path: 'org-directory',
        element: <OrgDirectoryPage />,
        handle: { permission: 'contacts:read', title: t.nav.orgDirectory },
      },
      {
        /* Moi nguoi dang nhap deu co danh ba rieng — khong dat `permission`. */
        path: 'my-contacts',
        element: <MyContactsPage />,
        handle: { title: t.nav.myContacts, visibleHeading: true },
      },
      {
        path: 'ai',
        element: <AiWorkspacePage />,
        handle: { permission: 'ai:read', title: t.nav.ai, hideQuickCreate: true },
      },
      /* "Đã chia sẻ" da chuyen vao Cai dat — giu duong dan cu de link cu khong hong. */
      { path: 'shares', element: <Navigate to="/settings?tab=shares" replace /> },
      { path: 'notes', element: <NotesRedirect /> },
      { path: 'settings', element: <SettingsPage />, handle: { title: t.nav.settings } },
      /* URL khong khop: dat lam route con de van nam trong khung app — nguoi dung
         lac duong khong bi mat luon thanh dieu huong de tim duong ra. */
      { path: '*', element: <NotFoundPage />, handle: { title: 'Không tìm thấy trang' } },
    ],
  },
]);

initTheme();

/* Trang xem cong khai cua lien ket chia se (/s/<token>): nguoi nhan khong co tai khoan
   nen KHONG qua AuthGate va khong co khung app. Quyet dinh o day, truoc khi dung router,
   de khong co mot khoang nao trang nay bi chen man hinh dang nhap. */
const publicShareToken = /^\/s\/([A-Za-z0-9_-]+)\/?$/.exec(window.location.pathname)?.[1];

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {publicShareToken ? (
      <Suspense fallback={null}>
        <PublicSharePage token={publicShareToken} />
      </Suspense>
    ) : (
      <QueryClientProvider client={queryClient}>
        <AuthGate>
          <RouterProvider router={router} />
        </AuthGate>
      </QueryClientProvider>
    )}
  </StrictMode>
);
