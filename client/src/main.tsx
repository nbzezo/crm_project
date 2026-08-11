import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Navigate, createBrowserRouter, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { useUiStore } from './stores/uiStore';
import { initTheme } from './stores/themeStore';
import DashboardPage from './pages/DashboardPage';
import BoardsPage from './pages/BoardsPage';
import BoardPage from './pages/BoardPage';
import CustomersPage from './pages/CustomersPage';
import CustomerDetailPage from './pages/CustomerDetailPage';
import PipelinePage from './pages/PipelinePage';
import ContractsPage from './pages/ContractsPage';
import RevenuePage from './pages/RevenuePage';
import DocumentsPage from './pages/DocumentsPage';
import CalendarPage from './pages/CalendarPage';
import TimelinePage from './pages/TimelinePage';
import ReportsPage from './pages/ReportsPage';
import TasksPage from './pages/TasksPage';
import SettingsPage from './pages/SettingsPage';
import './index.css';

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
      { index: true, element: <DashboardPage /> },
      { path: 'boards', element: <BoardsPage /> },
      { path: 'boards/:boardId', element: <BoardPage /> },
      { path: 'customers', element: <CustomersPage /> },
      { path: 'customers/:customerId', element: <CustomerDetailPage /> },
      { path: 'pipeline', element: <PipelinePage /> },
      { path: 'contracts', element: <ContractsPage /> },
      { path: 'revenue', element: <RevenuePage /> },
      { path: 'documents', element: <DocumentsPage /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'timeline', element: <TimelinePage /> },
      // Bảng tính đã gộp vào trang Công việc — giữ đường dẫn cũ để link cũ không hỏng
      { path: 'table', element: <Navigate to="/tasks" replace /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'tasks', element: <TasksPage /> },
      { path: 'settings', element: <SettingsPage /> },
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
