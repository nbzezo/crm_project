import { StrictMode, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { Navigate, createBrowserRouter, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { useUiStore } from './stores/uiStore';
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
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AiWorkspacePage = lazy(() => import('./pages/AiWorkspacePage'));

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
    children: [
      {
        index: true,
        element: <DashboardPage />,
        handle: { title: 'Tổng quan', visibleHeading: true },
      },
      { path: 'boards', element: <BoardsPage />, handle: { title: 'Bảng công việc' } },
      { path: 'boards/:boardId', element: <BoardPage />, handle: { title: 'Chi tiết bảng' } },
      {
        path: 'customers',
        element: <CustomersPage />,
        handle: { title: 'Khách hàng', visibleHeading: true },
      },
      {
        path: 'customers/:customerId',
        element: <CustomerDetailPage />,
        handle: { title: 'Hồ sơ khách hàng' },
      },
      { path: 'pipeline', element: <PipelinePage />, handle: { title: 'Pipeline bán hàng' } },
      { path: 'deals/:dealId', element: <DealDetailPage />, handle: { title: 'Chi tiết cơ hội' } },
      {
        path: 'pipeline-health',
        element: <PipelineHealthPage />,
        handle: { title: 'Sức khỏe pipeline' },
      },
      { path: 'contracts', element: <ContractsPage />, handle: { title: 'Hợp đồng' } },
      { path: 'revenue', element: <RevenuePage />, handle: { title: 'Doanh thu' } },
      { path: 'documents', element: <DocumentsPage />, handle: { title: 'Tài liệu' } },
      { path: 'calendar', element: <CalendarPage />, handle: { title: 'Lịch' } },
      { path: 'timeline', element: <TimelinePage />, handle: { title: 'Dòng thời gian' } },
      // Bảng tính đã gộp vào trang Công việc — giữ đường dẫn cũ để link cũ không hỏng
      { path: 'table', element: <Navigate to="/tasks" replace /> },
      { path: 'reports', element: <ReportsPage />, handle: { title: 'Báo cáo' } },
      { path: 'tasks', element: <TasksPage />, handle: { title: 'Công việc' } },
      { path: 'ai', element: <AiWorkspacePage />, handle: { title: 'Trợ lý AI' } },
      { path: 'settings', element: <SettingsPage />, handle: { title: 'Cài đặt' } },
    ],
  },
]);

initTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>
);
