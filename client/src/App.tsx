import { Outlet } from 'react-router';
import { Sidebar } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';
import { Toasts } from './components/common/Toasts';
import { CardModal } from './components/kanban/CardModal';

export default function App() {
  return (
    <div className="flex h-full flex-col">
      <Topbar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
      <CardModal />
      <Toasts />
    </div>
  );
}
