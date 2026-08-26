import { Suspense, lazy } from 'react';
import { Skeleton } from '../../common/ui';

/**
 * BlockNote (@blocknote/core + react + mantine) la phu thuoc nang — chi nap khi
 * thuc su mo mot ghi chu hop, dung ky thuat LazyCalendarView.tsx da dung cho
 * FullCalendar de khong lot vao ngan sach 260 KiB gzip cua bundle chinh
 * (client/scripts/check-bundle.mjs).
 */
const MeetingNoteBody = lazy(() => import('./MeetingNoteBody'));

export function LazyMeetingNoteBody(props: {
  noteId: number;
  initialContentJson: string;
  customerId: number | null;
  dealId: number | null;
  projectId: number | null;
  onChange: (payload: { contentJson: string; contentText: string }) => void;
}) {
  return (
    <Suspense
      fallback={
        <div className="space-y-1.5 rounded-panel border border-tr-border bg-tr-panel p-3">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-32 w-full" />
        </div>
      }
    >
      <MeetingNoteBody {...props} />
    </Suspense>
  );
}
