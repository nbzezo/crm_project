import { daysFromToday } from '../components/tasks/TaskPresentation';
import type { TaskRow } from '../types';

/**
 * Trong bao lâu nữa thì một việc đáng nhắc.
 *
 * 3 ngày, không phải "đến hạn hôm nay": nhắc vào đúng ngày hết hạn thì đã muộn —
 * người phụ trách không còn thời gian để làm.
 */
export const NUDGE_HORIZON_DAYS = 3;

/** Việc quá hạn/sắp đến hạn trong NUDGE_HORIZON_DAYS ngày, hoặc đang bị chặn/chờ khách. */
export function selectNeedsNudge(tasks: TaskRow[]): TaskRow[] {
  return tasks.filter((task) => {
    if (task.parent_id) return false; // việc con đi theo việc cha, nhắc hai lần là thừa
    const days = daysFromToday(task.due_date);
    const dueSoon = days !== null && days <= NUDGE_HORIZON_DAYS;
    const waiting = task.status === 'blocked' || task.status === 'waiting_customer';
    return dueSoon || waiting;
  });
}
