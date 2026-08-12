import { Suspense, lazy } from 'react';
import { Skeleton } from '../common/ui';

/**
 * FullCalendar la phu thuoc nang nhat cua ung dung. Truoc day CalendarView duoc
 * nhap tinh o ca CalendarPage lan BoardPage nen no nam trong goi chinh va MOI
 * trang — ke ca Tong quan — deu phai tai. Tach ra day de chi tai khi thuc su mo Lich.
 *
 * Phai boc chinh CalendarView chu khong phai CalendarPage: BoardPage cung dung
 * component nay, neu chi lazy o trang Lich thi goi chinh van keo FullCalendar vao.
 */
const CalendarView = lazy(() =>
  import('../views/CalendarView').then((m) => ({ default: m.CalendarView }))
);

export function LazyCalendarView({ boardId, projectId }: { boardId?: number; projectId?: number }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 rounded-panel border border-tr-border bg-tr-panel p-3 sm:p-4">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="w-full flex-1" />
        </div>
      }
    >
      <CalendarView boardId={boardId} projectId={projectId} />
    </Suspense>
  );
}
