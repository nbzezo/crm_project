import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button, DateInput, Field, FormError, Input, Select, Textarea } from '../common/ui';
import { allDayEndFromForm, allDayEndToForm } from './calendarModel';
import { t } from '../../i18n/vi';
import { formatDate } from '../../lib/format';
import type {
  CalEventStatus,
  CalEventType,
  CalendarConflict,
  CalendarEventRow,
} from '../../types';

const TYPES: CalEventType[] = [
  'task',
  'meeting',
  'call',
  'reminder',
  'appointment',
  'deadline',
  'other',
];
const STATUSES: CalEventStatus[] = ['pending', 'done', 'cancelled'];

const REMINDER_CHOICES: { value: number | null; label: string }[] = [
  { value: null, label: t.calendar.noReminder },
  { value: 5, label: `5 ${t.calendar.minutesBefore}` },
  { value: 10, label: `10 ${t.calendar.minutesBefore}` },
  { value: 15, label: `15 ${t.calendar.minutesBefore}` },
  { value: 30, label: `30 ${t.calendar.minutesBefore}` },
  { value: 60, label: `1 ${t.calendar.hoursBefore}` },
  { value: 120, label: `2 ${t.calendar.hoursBefore}` },
  { value: 1440, label: t.calendar.dayBefore },
];

export interface EventDraft {
  title: string;
  event_type: CalEventType;
  startDate: string;
  startTime: string;
  /** Ngay ket thuc theo nghia BAO GOM — dung cho nguoi doc, khong phai cho API. */
  endDate: string;
  endTime: string;
  all_day: boolean;
  location: string;
  description: string;
  reminder_minutes: number | null;
  status: CalEventStatus;
}

/** Ban nhap rong cho mot khoang thoi gian nguoi dung vua chon. */
export function draftFromSlot(startAt: string, endAt: string, allDay: boolean): EventDraft {
  return {
    title: '',
    event_type: 'task',
    startDate: startAt.slice(0, 10),
    startTime: startAt.slice(11, 16) || '09:00',
    endDate: allDay ? allDayEndToForm(endAt) : endAt.slice(0, 10),
    endTime: endAt.slice(11, 16) || '10:00',
    all_day: allDay,
    location: '',
    description: '',
    reminder_minutes: null,
    status: 'pending',
  };
}

/** Ban nhap tu mot su kien da co. */
export function draftFromRow(row: CalendarEventRow): EventDraft {
  const allDay = row.all_day === 1;
  return {
    title: row.title,
    event_type: row.event_type,
    startDate: row.start_at.slice(0, 10),
    startTime: row.start_at.slice(11, 16),
    // Doi tu moc LOAI TRU sang ngay BAO GOM — nguoi dung nghi "15 den 17",
    // CSDL luu "15 den 18T00:00".
    endDate: allDay ? allDayEndToForm(row.end_at) : row.end_at.slice(0, 10),
    endTime: row.end_at.slice(11, 16),
    all_day: allDay,
    location: row.location,
    description: row.description,
    reminder_minutes: row.reminder_minutes,
    status: row.status,
  };
}

/** Doi ban nhap thanh body API — day la noi duy nhat cong tra mot ngay. */
export function draftToApi(draft: EventDraft) {
  return {
    title: draft.title.trim(),
    event_type: draft.event_type,
    all_day: draft.all_day,
    start_at: draft.all_day ? `${draft.startDate}T00:00` : `${draft.startDate}T${draft.startTime}`,
    end_at: draft.all_day
      ? allDayEndFromForm(draft.endDate || draft.startDate)
      : `${draft.endDate || draft.startDate}T${draft.endTime}`,
    location: draft.location.trim(),
    description: draft.description.trim(),
    reminder_minutes: draft.reminder_minutes,
    status: draft.status,
  };
}

export function EventForm({
  open,
  initial,
  editing,
  saving,
  error,
  conflicts,
  onSave,
  onClose,
}: {
  open: boolean;
  initial: EventDraft;
  editing: boolean;
  saving: boolean;
  error: unknown;
  conflicts: CalendarConflict[];
  onSave: (draft: EventDraft) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<EventDraft>(initial);
  const [dirty, setDirty] = useState(false);

  const patch = (part: Partial<EventDraft>) => {
    setDraft((d) => ({ ...d, ...part }));
    setDirty(true);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      dirty={dirty}
      width="max-w-lg"
      title={editing ? t.calendar.editEvent : t.calendar.newEvent}
      footer={
        <>
          <Button onClick={onClose}>{t.common.cancel}</Button>
          <Button
            variant="primary"
            disabled={saving || draft.title.trim() === ''}
            onClick={() => onSave(draft)}
          >
            {saving ? t.common.saving : t.common.save}
          </Button>
        </>
      }
    >
      {/* Muc 51: loi giu form MO va giu nguyen du lieu da go — chi `onSuccess`
          moi duoc dong. `FormError` hien ngay canh nut Luu. */}
      <FormError error={error} />

      {conflicts.length > 0 && (
        <div className="mb-4 rounded-panel border border-tr-warning/50 bg-tr-hover px-3 py-2.5 text-sm">
          <p className="mb-1 flex items-center gap-1.5 font-medium text-tr-text">
            <AlertTriangle size={15} className="text-tr-warning" aria-hidden="true" />
            {t.calendar.conflictTitle}
          </p>
          <ul className="text-xs text-tr-subtle">
            {conflicts.map((c) => (
              <li key={c.id}>
                {c.start_at.slice(11, 16)} – {c.end_at.slice(11, 16)} · {c.title}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-4">
        <Field label={t.calendar.fieldTitle}>
          <Input
            autoFocus
            value={draft.title}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder="Tên lịch"
          />
        </Field>

        <Field label={t.calendar.fieldType}>
          <Select
            value={draft.event_type}
            onChange={(e) => patch({ event_type: e.target.value as CalEventType })}
          >
            {TYPES.map((type) => (
              <option key={type} value={type}>
                {t.calendarType[type]}
              </option>
            ))}
          </Select>
        </Field>

        <label className="flex items-center gap-2 text-sm text-tr-text">
          <input
            type="checkbox"
            checked={draft.all_day}
            onChange={(e) => patch({ all_day: e.target.checked })}
            className="h-4 w-4"
          />
          {t.calendar.allDay}
        </label>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t.calendar.fieldStart}>
            <DateInput value={draft.startDate} onChange={(v) => patch({ startDate: v ?? '' })} />
          </Field>
          {!draft.all_day && (
            <Field label="Giờ bắt đầu">
              <Input
                type="time"
                value={draft.startTime}
                onChange={(e) => patch({ startTime: e.target.value })}
              />
            </Field>
          )}
          <Field label={t.calendar.fieldEnd} hint={draft.all_day ? 'ngày cuối cùng' : undefined}>
            <DateInput value={draft.endDate} onChange={(v) => patch({ endDate: v ?? '' })} />
          </Field>
          {!draft.all_day && (
            <Field label="Giờ kết thúc">
              <Input
                type="time"
                value={draft.endTime}
                onChange={(e) => patch({ endTime: e.target.value })}
              />
            </Field>
          )}
        </div>

        <Field label={t.calendar.fieldLocation} hint={t.common.optional}>
          <Input value={draft.location} onChange={(e) => patch({ location: e.target.value })} />
        </Field>

        <Field label={t.calendar.fieldReminder}>
          <Select
            value={String(draft.reminder_minutes ?? '')}
            onChange={(e) =>
              patch({ reminder_minutes: e.target.value === '' ? null : Number(e.target.value) })
            }
          >
            {REMINDER_CHOICES.map((choice) => (
              <option key={String(choice.value)} value={choice.value ?? ''}>
                {choice.label}
              </option>
            ))}
          </Select>
        </Field>

        {editing && (
          <Field label={t.calendar.fieldStatus}>
            <Select
              value={draft.status}
              onChange={(e) => patch({ status: e.target.value as CalEventStatus })}
            >
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t.calendarStatus[status]}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label={t.calendar.fieldDescription} hint={t.common.optional}>
          <Textarea
            rows={3}
            value={draft.description}
            onChange={(e) => patch({ description: e.target.value })}
          />
        </Field>

        {draft.all_day && draft.endDate && draft.endDate !== draft.startDate && (
          <p className="text-xs text-tr-muted">
            Kéo dài từ {formatDate(draft.startDate)} đến hết {formatDate(draft.endDate)}.
          </p>
        )}
      </div>
    </Modal>
  );
}
