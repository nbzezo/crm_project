import { StrictMode, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { Navigate, createBrowserRouter, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { AuthGate } from './components/auth/AuthGate';
import { NotFoundPage, RouteErrorPage } from './components/common/RouteError';
import { useUiStore } from './stores/uiStore';
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
const DocumentsPage = lazy(() => import('./pages/DocumentsPage'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const TimelinePage = lazy(() => import('./pages/TimelinePage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const TasksPage = lazy(() => import('./pages/TasksPage'));
const FollowUpPage = lazy(() => import('./pages/FollowUpPage'));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const ProjectDetailPage = lazy(() => import('./pages/ProjectDetailPage'));
const OrgDirectoryPage = lazy(() => import('./pages/OrgDirectoryPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AiWorkspacePage = lazy(() => import('./pages/AiWorkspacePage'));
const NotesPage = lazy(() => import('./pages/NotesPage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 },
    mutations: {
      onError: (error) => {
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
        handle: { permission: 'boards:read', title: 'Chi tiết bảng' },
      },
      {
        path: 'customers',
        element: <CustomersPage />,
        handle: { permission: 'customers:read', title: t.nav.customers, visibleHeading: true },
      },
      {
        path: 'customers/:customerId',
        element: <CustomerDetailPage />,
        handle: { permission: 'customers:read', title: 'Hồ sơ khách hàng' },
      },
      {
        path: 'pipeline',
        element: <PipelinePage />,
        handle: { permission: 'deals:read', title: t.nav.pipeline },
      },
      {
        path: 'deals/:dealId',
        element: <DealDetailPage />,
        handle: { permission: 'deals:read', title: 'Chi tiết cơ hội' },
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
        path: 'revenue',
        element: <RevenuePage />,
        handle: { permission: 'revenues:read', title: t.nav.revenue },
      },
      {
        path: 'documents',
        element: <DocumentsPage />,
        handle: { permission: 'documents:read', title: t.nav.documents },
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
        path: 'tasks',
        element: <TasksPage />,
        handle: { permission: 'tasks:read', title: t.nav.tasks, visibleHeading: true },
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
        path: 'ai',
        element: <AiWorkspacePage />,
        handle: { permission: 'ai:read', title: t.nav.ai },
      },
      {
        path: 'notes',
        element: <NotesPage />,
        handle: { permission: 'notes:read', title: t.nav.notes, visibleHeading: true },
      },
      { path: 'settings', element: <SettingsPage />, handle: { title: t.nav.settings } },
      /* URL khong khop: dat lam route con de van nam trong khung app — nguoi dung
         lac duong khong bi mat luon thanh dieu huong de tim duong ra. */
      { path: '*', element: <NotFoundPage />, handle: { title: 'Không tìm thấy trang' } },
    ],
  },
]);

initTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthGate>
        <RouterProvider router={router} />
      </AuthGate>
    </QueryClientProvider>
  </StrictMode>
);
