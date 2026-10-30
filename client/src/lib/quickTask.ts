import { api } from '../api/client';
import type { Card, Priority } from '../types';

export interface QuickTaskInput {
  title: string;
  priority: Priority;
  due_date: string | null;
  list_id?: number;
  customer_id?: number | null;
}

export async function createQuickTask(input: QuickTaskInput, remindAt?: string | null) {
  const card = await api.post<Card>('/api/cards', input);
  let reminderFailed = false;
  if (remindAt) {
    try {
      await api.post('/api/reminders', { title: input.title, due_at: remindAt, card_id: card.id });
    } catch {
      reminderFailed = true;
    }
  }
  return { card, reminderFailed };
}
