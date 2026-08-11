import { LazyCalendarView } from '../components/calendar/LazyCalendarView';

/**
 * Lịch toàn cục: công việc + nhắc hẹn + ngày chốt cơ hội + hạn hợp đồng.
 *
 * `h-full` + `min-h-0` cho lịch lấp đầy phần chiều cao còn lại của viewport.
 * `min-h-[520px]` là chốt chặn: min-height thắng height, nên trên màn hình thấp
 * trang tự dài ra và thanh cuộn sẵn có của <main> tiếp quản — thay vì để lại
 * một lưới quá thấp không dùng được.
 */
export default function CalendarPage() {
  return (
    <div className="flex h-full min-h-[520px] flex-col p-4 sm:p-6">
      <LazyCalendarView />
    </div>
  );
}
