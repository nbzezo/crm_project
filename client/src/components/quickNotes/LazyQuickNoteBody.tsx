import { Suspense, lazy } from 'react';
import { Skeleton } from '../common/ui';

/**
 * BlockNote la phu thuoc nang — chi nap khi thuc su mo mot Ghi chu nhanh, dung
 * ky thuat LazyMeetingNoteBody.tsx da dung de khong lot vao ngan sach 260 KiB
 * gzip cua bundle chinh (client/scripts/check-bundle.mjs).
 */
const QuickNoteBody = lazy(() => import('./QuickNoteBody'));

export function LazyQuickNoteBody(props: {
  noteId: number;
  initialContentJson: string;
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
      <QuickNoteBody {...props} />
    </Suspense>
  );
}
