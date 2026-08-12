import { formatDate, todayStr } from '../../lib/format';
import type { Customer } from '../../types';

export type CustomerSmartView = 'all' | 'prospect' | 'opportunity' | 'follow-up' | 'stale';

export type CustomerHealth = {
  level: 'good' | 'attention' | 'risk';
  label: string;
  reason: string;
};

export type CustomerNextAction = {
  kind: 'deal' | 'task' | 'reminder';
  title: string;
  date: string | null;
  overdue: boolean;
};

function asLocalDate(value: string): Date {
  const normalized = value.length === 10 ? `${value}T00:00:00` : value.replace(' ', 'T');
  return new Date(normalized);
}

export function daysSince(value: string | null | undefined): number | null {
  if (!value) return null;
  const date = asLocalDate(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000));
}

export function customerInactiveDays(customer: Customer): number {
  return daysSince(customer.last_activity_at ?? customer.created_at) ?? 0;
}

export function isStaleCustomer(customer: Customer): boolean {
  return customerInactiveDays(customer) > 30;
}

export function needsFollowUp(customer: Customer): boolean {
  return (
    (customer.overdue_task_count ?? 0) > 0 ||
    (customer.overdue_next_action_count ?? 0) > 0 ||
    (customer.deals_without_next_action_count ?? 0) > 0 ||
    isStaleCustomer(customer)
  );
}

export function getCustomerHealth(customer: Customer): CustomerHealth {
  const overdueTasks = customer.overdue_task_count ?? 0;
  const missingActions = customer.deals_without_next_action_count ?? 0;
  const inactiveDays = customerInactiveDays(customer);

  if (overdueTasks >= 2) {
    return {
      level: 'risk',
      label: 'Rủi ro',
      reason: `${overdueTasks} công việc quá hạn`,
    };
  }
  if ((customer.overdue_next_action_count ?? 0) > 0) {
    return { level: 'risk', label: 'Rủi ro', reason: 'Next Action đã quá hạn' };
  }
  if (inactiveDays > 30) {
    return {
      level: 'risk',
      label: 'Rủi ro',
      reason: customer.last_activity_at
        ? `${inactiveDays} ngày chưa tương tác`
        : 'Chưa tương tác từ khi tạo',
    };
  }
  if (overdueTasks === 1) {
    return { level: 'attention', label: 'Cần chú ý', reason: '1 công việc quá hạn' };
  }
  if (missingActions > 0) {
    return {
      level: 'attention',
      label: 'Cần chú ý',
      reason: `${missingActions} cơ hội chưa có Next Action`,
    };
  }
  if (customer.last_activity_at && inactiveDays >= 14) {
    return {
      level: 'attention',
      label: 'Cần chú ý',
      reason: `${inactiveDays} ngày chưa tương tác`,
    };
  }
  return {
    level: 'good',
    label: 'Tốt',
    reason: customer.last_activity_at ? 'Đang được chăm sóc' : 'Không có việc quá hạn',
  };
}

export function getNextCustomerAction(customer: Customer): CustomerNextAction | null {
  const candidates: CustomerNextAction[] = [];
  if (customer.next_deal_action) {
    candidates.push({
      kind: 'deal',
      title: customer.next_deal_action,
      date: customer.next_deal_action_date ?? null,
      overdue: Boolean(
        customer.next_deal_action_date && customer.next_deal_action_date.slice(0, 10) < todayStr()
      ),
    });
  }
  if (customer.next_task_title) {
    candidates.push({
      kind: 'task',
      title: customer.next_task_title,
      date: customer.next_task_due_date ?? null,
      overdue: Boolean(
        customer.next_task_due_date && customer.next_task_due_date.slice(0, 10) < todayStr()
      ),
    });
  }
  if (customer.next_reminder_title) {
    candidates.push({
      kind: 'reminder',
      title: customer.next_reminder_title,
      date: customer.next_reminder_due_at ?? null,
      overdue: Boolean(
        customer.next_reminder_due_at && customer.next_reminder_due_at.slice(0, 10) < todayStr()
      ),
    });
  }

  return (
    candidates.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.localeCompare(b.date);
    })[0] ?? null
  );
}

export function formatRelativePast(value: string | null | undefined): string {
  if (!value) return 'Chưa tương tác';
  const days = daysSince(value);
  if (days === null) return formatDate(value) || '—';
  if (days === 0) return 'Hôm nay';
  if (days === 1) return 'Hôm qua';
  if (days < 30) return `${days} ngày trước`;
  return formatDate(value);
}

export function formatActionDate(value: string | null): string {
  if (!value) return 'Chưa đặt hạn';
  const date = value.slice(0, 10);
  const today = todayStr();
  if (date === today) return 'Hôm nay';
  const diff = Math.round(
    (asLocalDate(date).getTime() - asLocalDate(today).getTime()) / 86_400_000
  );
  if (diff === 1) return 'Ngày mai';
  if (diff === -1) return 'Hôm qua';
  if (diff > 1 && diff <= 7) return `${diff} ngày nữa`;
  if (diff < -1 && diff >= -7) return `Quá ${Math.abs(diff)} ngày`;
  return formatDate(value) || '—';
}
