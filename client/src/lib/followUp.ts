import { daysFromToday } from '../components/tasks/TaskPresentation';
import type { TaskRow } from '../types';

/**
 * Trong bao lâu nữa thì một việc đáng nhắc.
 *
 * 3 ngày, không phải "đến hạn hôm nay": nhắc vào đúng ngày hết hạn thì đã muộn —
 * người phụ trách không còn thời gian để làm.
 */
export const NUDGE_HORIZON_DAYS = 3;

/**
 * Việc "Nhắc người khác" — bỏ việc của chính người đang xem; việc chưa giao
 * vẫn giữ vì không có ai để nhắc. Chờ khách không tự vào danh sách: chỉ việc
 * có hạn trong NUDGE_HORIZON_DAYS ngày hoặc đang bị chặn mới được chọn.
 */
export function selectNeedsNudge(tasks: TaskRow[], meContactId: number | null): TaskRow[] {
  return tasks.filter((task) => {
    if (task.parent_id) return false; // việc con đi theo việc cha, nhắc hai lần là thừa
    if (meContactId !== null && task.assignee_contact_id === meContactId) return false;
    const days = daysFromToday(task.due_date);
    const dueSoon = days !== null && days <= NUDGE_HORIZON_DAYS;
    return dueSoon || task.status === 'blocked';
  });
}
