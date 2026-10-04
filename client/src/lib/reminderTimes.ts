import { addDays, addMinutes, format, parseISO, setHours, setMinutes } from 'date-fns';

/**
 * Cac moc gio chon nhanh cho nhac viec — dung chung cho o "Nhắc lúc" trong the
 * (CardModal) va nut Hoan cua popup nhac (DueReminderPopup). Tra ve dang
 * 'YYYY-MM-DDTHH:mm' theo gio may, dung nhu cot `reminders.due_at`.
 */
export interface ReminderPreset {
  label: string;
  value: string;
}

const toLocal = (date: Date) => format(date, "yyyy-MM-dd'T'HH:mm");

/** 9:00 cua mot ngay. */
function morningOf(date: Date): Date {
  return setMinutes(setHours(date, 9), 0);
}

/** Moc chon khi dat nhac cho mot viec. `dueDate` la han chot dang 'YYYY-MM-DD'. */
export function reminderPresets(now: Date, dueDate?: string | null): ReminderPreset[] {
  const presets: ReminderPreset[] = [
    { label: '15 phút nữa', value: toLocal(addMinutes(now, 15)) },
    { label: '1 giờ nữa', value: toLocal(addMinutes(now, 60)) },
    { label: '9:00 sáng mai', value: toLocal(morningOf(addDays(now, 1))) },
  ];
  if (dueDate) {
    const onDue = morningOf(parseISO(dueDate.slice(0, 10)));
    // Chi goi y khi 9h ngay han con o phia truoc va khac "sang mai".
    const value = toLocal(onDue);
    if (onDue > now && !presets.some((p) => p.value === value)) {
      presets.push({ label: '9:00 ngày hạn', value });
    }
  }
  return presets;
}

/** Moc hoan nhac tren popup. */
export function snoozePresets(now: Date): ReminderPreset[] {
  return [
    { label: '10 phút', value: toLocal(addMinutes(now, 10)) },
    { label: '30 phút', value: toLocal(addMinutes(now, 30)) },
    { label: '1 giờ', value: toLocal(addMinutes(now, 60)) },
    { label: 'Sáng mai', value: toLocal(morningOf(addDays(now, 1))) },
  ];
}
