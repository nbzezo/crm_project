import { CalendarView } from '../components/views/CalendarView';

/** Lịch toàn cục: công việc + nhắc hẹn + ngày chốt cơ hội + hạn hợp đồng. */
export default function CalendarPage() {
  return (
    <div className="p-6">
      <CalendarView />
    </div>
  );
}
