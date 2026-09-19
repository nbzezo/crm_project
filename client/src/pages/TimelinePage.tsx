import { TimelineBoard } from '../components/views/TimelineBoard';
import { PageHeader } from '../components/common/PageShell';

/** Dòng thời gian toàn cục cho mọi bảng. */
export default function TimelinePage() {
  return (
    <div className="space-y-4 p-6">
      <PageHeader description="Mốc thời gian của mọi bảng trên một trục chung." />
      <TimelineBoard />
    </div>
  );
}
