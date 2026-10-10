import type { Database } from 'better-sqlite3';
import { getTelegramConfig, sendTelegramMessage } from './telegramService.ts';
import { runFocusDigests } from './focusDigest.ts';
import {
  hasPersonalLink,
  personalTargetFor,
  personalTargets,
  sendPersonal,
} from './userTelegram.ts';

interface DueCardRow {
  id: number;
  title: string;
  due_date: string;
}

interface DueReminderRow {
  id: number;
  title: string;
  note: string;
  due_at: string;
}

interface DueQuickNoteRow {
  id: number;
  title: string;
  reminder_at: string;
}

function alreadySent(db: Database, key: string): boolean {
  return Boolean(db.prepare(`SELECT 1 FROM telegram_sent_log WHERE dedupe_key = ?`).get(key));
}

function markSent(db: Database, key: string): void {
  db.prepare(`INSERT OR IGNORE INTO telegram_sent_log (dedupe_key) VALUES (?)`).run(key);
}

/**
 * Nguoi ma bot Telegram dang nhac viec giup.
 *
 * `telegram_settings` co dung MOT chat_id cho ca he thong, nen bot chi phuc vu
 * duoc mot nguoi. Truoc v37 nguoi do la co `contacts.is_me`; nay la tai khoan
 * dau tien con hoat dong — cung chinh nguoi ay sau khi v37 backfill, nhung
 * khong con phu thuoc vao mot co sap bi bo.
 *
 * Dinh tuyen thong bao theo tung nguoi can mot chat_id tren moi tai khoan; do
 * la viec cua dot phan quyen du lieu, khong phai cua buoc nay.
 */
export function recipientContactId(db: Database): number | null {
  const row = db
    .prepare(
      `SELECT contact_id FROM users
        WHERE is_active = 1 AND contact_id IS NOT NULL
        ORDER BY id LIMIT 1`
    )
    .get() as { contact_id: number } | undefined;
  return row?.contact_id ?? null;
}

async function notifyDueCards(db: Database): Promise<void> {
  const cards = db
    .prepare(
      `SELECT k.id, k.title, k.due_date
         FROM cards k
        WHERE k.is_done = 0 AND k.is_archived = 0
          AND k.due_date IS NOT NULL AND k.due_date <= date('now','localtime')
          AND (k.assignee_contact_id IS NULL OR k.assignee_contact_id = ?)
        ORDER BY k.due_date LIMIT 50`
    )
    .all(recipientContactId(db)) as DueCardRow[];

  for (const card of cards) {
    const key = `task-${card.id}-${card.due_date}`;
    if (alreadySent(db, key)) continue;
    try {
      await sendTelegramMessage(db, `⏰ Việc đến hạn: ${card.title}\nHạn: ${card.due_date}`);
      markSent(db, key);
    } catch (error) {
      console.error('[telegram] Gui thong bao viec den han that bai:', card.id, error);
    }
  }
}

async function notifyDueReminders(db: Database): Promise<void> {
  const reminders = db
    .prepare(
      `SELECT id, title, note, due_at
         FROM reminders
        WHERE is_done = 0
          AND due_at BETWEEN strftime('%Y-%m-%dT%H:%M', datetime('now','localtime','-5 minutes'))
                          AND strftime('%Y-%m-%dT%H:%M', datetime('now','localtime','+15 minutes'))
        ORDER BY due_at LIMIT 50`
    )
    .all() as DueReminderRow[];

  for (const reminder of reminders) {
    const key = `reminder-${reminder.id}-${reminder.due_at}`;
    if (alreadySent(db, key)) continue;
    try {
      const body = reminder.note ? `\n${reminder.note}` : '';
      await sendTelegramMessage(
        db,
        `🔔 Nhắc hẹn: ${reminder.title}${body}\nGiờ: ${reminder.due_at.replace('T', ' ')}`
      );
      markSent(db, key);
    } catch (error) {
      console.error('[telegram] Gui nhac hen that bai:', reminder.id, error);
    }
  }
}

/**
 * FR14: nhac cua Ghi chu nhanh la cot noi tai (`reminder_at`/`reminder_status`),
 * khong qua bang `reminders` — nen can mot vong quet rieng, dung chung co che
 * gui (Telegram) va dedupe (`telegram_sent_log`) voi cac ham tren.
 *
 * Cung khoang -5/+15 phut voi notifyDueReminders — KHONG chi dung `<= now`:
 * server tat lau ngay roi bat lai se khong don don mot loat nhac cu hang gio/
 * ngay truoc thanh mot con "bao" thong bao Telegram cung mot luc.
 */
async function notifyDueQuickNotes(db: Database): Promise<void> {
  const notes = db
    .prepare(
      `SELECT id, title, reminder_at
         FROM quick_notes
        WHERE deleted_at IS NULL AND reminder_status = 'pending'
          AND reminder_at BETWEEN strftime('%Y-%m-%dT%H:%M', datetime('now','localtime','-5 minutes'))
                               AND strftime('%Y-%m-%dT%H:%M', datetime('now','localtime','+15 minutes'))
        ORDER BY reminder_at LIMIT 50`
    )
    .all() as DueQuickNoteRow[];

  for (const note of notes) {
    const key = `quick-note-${note.id}-${note.reminder_at}`;
    if (alreadySent(db, key)) continue;
    try {
      const title = note.title || 'Ghi chú không tiêu đề';
      await sendTelegramMessage(db, `📝 Nhắc ghi chú nhanh: ${title}`);
      markSent(db, key);
      db.prepare(`UPDATE quick_notes SET reminder_status = 'triggered' WHERE id = ?`).run(note.id);
    } catch (error) {
      console.error('[telegram] Gui nhac ghi chu nhanh that bai:', note.id, error);
    }
  }
}

/**
 * Tin rieng (v70): moi nguoi da noi Telegram nhan viec den han, nhac hen, ghi chu
 * nhanh CUA CHINH HO, theo cong tac cua ho.
 */
async function notifyPersonalDue(db: Database): Promise<void> {
  for (const target of personalTargets(db, 'tasks')) {
    const cards = db
      .prepare(
        `SELECT id, title, due_date FROM cards
          WHERE is_done = 0 AND is_archived = 0 AND due_date IS NOT NULL
            AND due_date <= date('now','localtime') AND assignee_contact_id = ?
          ORDER BY due_date LIMIT 50`
      )
      .all(target.contact_id) as DueCardRow[];
    for (const card of cards) {
      await sendPersonal(
        db,
        target,
        `task-${card.id}-${card.due_date}`,
        `⏰ Việc đến hạn: ${card.title}\nHạn: ${card.due_date}`
      );
    }
  }
  for (const target of personalTargets(db, 'reminders')) {
    const reminders = db
      .prepare(
        `SELECT id, title, note, due_at FROM reminders
          WHERE is_done = 0 AND owner_contact_id = ?
            AND due_at BETWEEN strftime('%Y-%m-%dT%H:%M', datetime('now','localtime','-5 minutes'))
                            AND strftime('%Y-%m-%dT%H:%M', datetime('now','localtime','+15 minutes'))
          ORDER BY due_at LIMIT 50`
      )
      .all(target.contact_id) as DueReminderRow[];
    for (const reminder of reminders) {
      const body = reminder.note ? `\n${reminder.note}` : '';
      await sendPersonal(
        db,
        target,
        `reminder-${reminder.id}-${reminder.due_at}`,
        `🔔 Nhắc hẹn: ${reminder.title}${body}\nGiờ: ${reminder.due_at.replace('T', ' ')}`
      );
    }
    const notes = db
      .prepare(
        `SELECT id, title, reminder_at FROM quick_notes
          WHERE deleted_at IS NULL AND reminder_status = 'pending' AND owner_contact_id = ?
            AND reminder_at BETWEEN strftime('%Y-%m-%dT%H:%M', datetime('now','localtime','-5 minutes'))
                                 AND strftime('%Y-%m-%dT%H:%M', datetime('now','localtime','+15 minutes'))
          ORDER BY reminder_at LIMIT 50`
      )
      .all(target.contact_id) as DueQuickNoteRow[];
    for (const note of notes) {
      await sendPersonal(
        db,
        target,
        `quick-note-${note.id}-${note.reminder_at}`,
        `📝 Nhắc ghi chú nhanh: ${note.title || 'Ghi chú không tiêu đề'}`
      );
    }
  }
}

export async function runDueTelegramChecks(db: Database): Promise<void> {
  const config = getTelegramConfig(db);
  if (!config.enabled || !config.has_token) return;
  await notifyPersonalDue(db);
  if (!config.chat_id) return;
  /* Kenh chung (Chat ID cua quan tri) giu nguyen nhu truoc cho nguoi nhan cu — tru
     khi nguoi do da noi Telegram rieng, luc ay tin cua ho di qua kenh rieng, khong trung. */
  if (!hasPersonalLink(db, recipientContactId(db))) {
    if (config.notify_due_dates) await notifyDueCards(db);
    if (config.notify_reminders) {
      await notifyDueReminders(db);
      await notifyDueQuickNotes(db);
    }
  }
  // Ban tin Trong tam co cong tac rieng trong app_settings (focus.digest).
  await runFocusDigests(db, recipientContactId(db));
}

export function notifyAssigneeChangeTelegram(db: Database, cardId: number): void {
  void (async () => {
    try {
      const config = getTelegramConfig(db);
      if (!config.enabled || !config.has_token) return;
      const card = db
        .prepare(`SELECT title, assignee_contact_id, updated_at FROM cards WHERE id = ?`)
        .get(cardId) as
        { title: string; assignee_contact_id: number | null; updated_at: string } | undefined;
      if (!card || card.assignee_contact_id == null) return;
      const text = `📌 Bạn vừa được giao việc: ${card.title}`;
      /* Nguoi duoc giao da noi Telegram rieng: gui thang cho ho. */
      const personal = personalTargetFor(db, card.assignee_contact_id, 'assignee');
      if (personal) {
        await sendPersonal(db, personal, `assign-${cardId}-${card.updated_at}`, text);
        return;
      }
      const recipient = recipientContactId(db);
      if (!config.chat_id || !config.notify_assignee || recipient == null) return;
      if (card.assignee_contact_id !== recipient || hasPersonalLink(db, recipient)) return;
      await sendTelegramMessage(db, text);
    } catch (error) {
      console.error('[telegram] Gui thong bao giao viec that bai:', cardId, error);
    }
  })();
}

/** Khach mo lien ket chia se lan dau — di cung cong tac "Nhac hen" nhu truoc v56. */
export function notifyShareViewTelegram(db: Database, text: string): void {
  void (async () => {
    try {
      const config = getTelegramConfig(db);
      if (!config.enabled || !config.has_token || !config.chat_id || !config.notify_reminders) {
        return;
      }
      await sendTelegramMessage(db, text);
    } catch (error) {
      console.error('[telegram] Gui thong bao mo lien ket that bai:', error);
    }
  })();
}

let scheduler: ReturnType<typeof setInterval> | null = null;

export function startTelegramNotifierScheduler(db: Database) {
  if (scheduler) return scheduler;
  scheduler = setInterval(() => {
    runDueTelegramChecks(db).catch((error) => console.error('[telegram] Quet dinh ky loi:', error));
  }, 5 * 60_000);
  scheduler.unref();
  setTimeout(() => {
    runDueTelegramChecks(db).catch((error) => console.error('[telegram] Quet dinh ky loi:', error));
  }, 2_000).unref();
  return scheduler;
}
