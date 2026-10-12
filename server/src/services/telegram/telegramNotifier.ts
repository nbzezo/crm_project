import type { Database } from 'better-sqlite3';
import { getTelegramConfig, sendTelegramMessage } from './telegramService.ts';
import { runFocusDigests } from './focusDigest.ts';

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

/**
 * Giu cho mot tin TRUOC khi gui (INSERT OR IGNORE nguyen tu): tra ve false neu da co
 * vong quet khac giu / da gui. Truoc day "kiem roi danh dau SAU khi gui" — mot lan gui
 * cham hon chu ky quet thi vong sau thay chua co log va gui trung.
 */
function claim(db: Database, key: string): boolean {
  return (
    db.prepare(`INSERT OR IGNORE INTO telegram_sent_log (dedupe_key) VALUES (?)`).run(key)
      .changes === 1
  );
}

/** Gui that bai thi tra cho lai de vong sau thu tiep. */
function release(db: Database, key: string): void {
  db.prepare(`DELETE FROM telegram_sent_log WHERE dedupe_key = ?`).run(key);
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
    if (!claim(db, key)) continue;
    try {
      await sendTelegramMessage(db, `⏰ Việc đến hạn: ${card.title}\nHạn: ${card.due_date}`);
    } catch (error) {
      release(db, key);
      console.error('[telegram] Gui thong bao viec den han that bai:', card.id, error);
    }
  }
}

async function notifyDueReminders(db: Database): Promise<void> {
  /* Chat Telegram la cua MOT nguoi (recipientContactId): chi nhac hen cua nguoi do,
     cong nhac vo chu truoc v40. Truoc day nhac cua moi nguoi deu do vao chat nay. */
  const reminders = db
    .prepare(
      `SELECT id, title, note, due_at
         FROM reminders
        WHERE is_done = 0
          AND (owner_contact_id IS NULL OR owner_contact_id = ?)
          AND due_at BETWEEN strftime('%Y-%m-%dT%H:%M', datetime('now','localtime','-5 minutes'))
                          AND strftime('%Y-%m-%dT%H:%M', datetime('now','localtime','+15 minutes'))
        ORDER BY due_at LIMIT 50`
    )
    .all(recipientContactId(db)) as DueReminderRow[];

  for (const reminder of reminders) {
    const key = `reminder-${reminder.id}-${reminder.due_at}`;
    if (!claim(db, key)) continue;
    try {
      const body = reminder.note ? `\n${reminder.note}` : '';
      await sendTelegramMessage(
        db,
        `🔔 Nhắc hẹn: ${reminder.title}${body}\nGiờ: ${reminder.due_at.replace('T', ' ')}`
      );
    } catch (error) {
      release(db, key);
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
      /* Ghi chu nhanh la du lieu ca nhan: chi cua nguoi nhan, khong co nhanh "vo chu". */
      `SELECT id, title, reminder_at
         FROM quick_notes
        WHERE deleted_at IS NULL AND reminder_status = 'pending'
          AND owner_contact_id = ?
          AND reminder_at BETWEEN strftime('%Y-%m-%dT%H:%M', datetime('now','localtime','-5 minutes'))
                               AND strftime('%Y-%m-%dT%H:%M', datetime('now','localtime','+15 minutes'))
        ORDER BY reminder_at LIMIT 50`
    )
    .all(recipientContactId(db) ?? 0) as DueQuickNoteRow[];

  for (const note of notes) {
    const key = `quick-note-${note.id}-${note.reminder_at}`;
    if (!claim(db, key)) continue;
    try {
      const title = note.title || 'Ghi chú không tiêu đề';
      await sendTelegramMessage(db, `📝 Nhắc ghi chú nhanh: ${title}`);
      db.prepare(`UPDATE quick_notes SET reminder_status = 'triggered' WHERE id = ?`).run(note.id);
    } catch (error) {
      release(db, key);
      console.error('[telegram] Gui nhac ghi chu nhanh that bai:', note.id, error);
    }
  }
}

/* Mot vong quet tai mot thoi diem: vong truoc chua xong (Telegram cham) thi bo qua. */
let scanning = false;

async function runDueTelegramChecks(db: Database): Promise<void> {
  if (scanning) return;
  scanning = true;
  try {
    await runDueTelegramChecksOnce(db);
  } finally {
    scanning = false;
  }
}

async function runDueTelegramChecksOnce(db: Database): Promise<void> {
  const config = getTelegramConfig(db);
  if (!config.enabled || !config.has_token || !config.chat_id) return;
  /* Chat Telegram la cua MOT nguoi; chua xac dinh duoc la ai thi khong gui gi ca — neu
     khong, viec chua giao va nhac hen vo chu cua ca cong ty do vao chat do. */
  if (recipientContactId(db) == null) return;
  if (config.notify_due_dates) await notifyDueCards(db);
  if (config.notify_reminders) {
    await notifyDueReminders(db);
    await notifyDueQuickNotes(db);
  }
  // Ban tin Trong tam co cong tac rieng trong app_settings (focus.digest).
  await runFocusDigests(db, recipientContactId(db));
}

export function notifyAssigneeChangeTelegram(db: Database, cardId: number): void {
  void (async () => {
    try {
      const config = getTelegramConfig(db);
      if (!config.enabled || !config.has_token || !config.chat_id || !config.notify_assignee) {
        return;
      }
      const recipient = recipientContactId(db);
      if (recipient == null) return;
      const card = db
        .prepare(`SELECT title, assignee_contact_id FROM cards WHERE id = ?`)
        .get(cardId) as { title: string; assignee_contact_id: number | null } | undefined;
      if (!card || card.assignee_contact_id !== recipient) return;
      await sendTelegramMessage(db, `📌 Bạn vừa được giao việc: ${card.title}`);
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
