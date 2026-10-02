import type { Database } from 'better-sqlite3';
import { z } from 'zod';
import {
  addDays,
  buildFocus,
  ownerScope,
  weekStart,
  type AgendaItem,
  type FocusData,
} from '../focusService.ts';
import { generateFocusPlan } from '../focusAi.ts';
import { sendTelegramMessage } from './telegramService.ts';

/*
 * Ban tin "Trong tam" qua Telegram: sang moi ngay, sang thu Hai, ngay mung 1.
 *
 * Cai dat nam trong app_settings (khoa `focus.digest`, mot chuoi JSON) — khong
 * them cot vao telegram_settings vi do la bang mot dong cho KET NOI, con day la
 * NOI DUNG gui di; tron hai thu se phai migration moi khi them mot loai ban tin.
 *
 * Nguoi nhan: cung nguoi ma bot dang nhac viec (xem `recipientContactId` o
 * telegramNotifier.ts) — bot van chi co mot chat_id cho ca he thong.
 */

export const DIGEST_KINDS = ['daily', 'weekly', 'monthly'] as const;
export type DigestKind = (typeof DIGEST_KINDS)[number];

export const digestSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  daily: z.boolean().default(true),
  weekly: z.boolean().default(true),
  monthly: z.boolean().default(true),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .default('07:00'),
  ai: z.boolean().default(false),
});
export type DigestSettings = z.infer<typeof digestSettingsSchema>;

const KEY = 'focus.digest';

export function getDigestSettings(db: Database): DigestSettings {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(KEY) as
    { value: string } | undefined;
  try {
    return digestSettingsSchema.parse(row ? JSON.parse(row.value) : {});
  } catch {
    return digestSettingsSchema.parse({});
  }
}

export function saveDigestSettings(db: Database, patch: Partial<DigestSettings>): DigestSettings {
  const next = digestSettingsSchema.parse({ ...getDigestSettings(db), ...patch });
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now','localtime'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(KEY, JSON.stringify(next));
  return next;
}

/** Khoang ngay cua tung loai ban tin, tinh tu `today`. */
export function digestRange(kind: DigestKind, today: string): { from: string; to: string } {
  if (kind === 'daily') return { from: today, to: today };
  if (kind === 'weekly') {
    const from = weekStart(today);
    return { from, to: addDays(from, 6) };
  }
  const from = `${today.slice(0, 7)}-01`;
  const next = new Date(`${from}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return { from, to: addDays(next.toISOString().slice(0, 10), -1) };
}

const WEEKDAYS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

function dm(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

function vndShort(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1).replace('.0', '')} tỷ`;
  if (value >= 1_000_000) return `${Math.round(value / 1_000_000)} tr`;
  return `${value.toLocaleString('vi-VN')} ₫`;
}

function title(kind: DigestKind, data: FocusData): string {
  const { from, to } = data.range;
  if (kind === 'daily') {
    const day = new Date(`${from}T00:00:00Z`).getUTCDay();
    return `☀️ Trọng tâm hôm nay — ${WEEKDAYS[day]} ${dm(from)}`;
  }
  if (kind === 'weekly') return `🗓 Trọng tâm tuần này — ${dm(from)} đến ${dm(to)}`;
  return `📅 Trọng tâm tháng ${Number(from.slice(5, 7))}/${from.slice(0, 4)}`;
}

function line(item: AgendaItem, withDate: boolean): string {
  const flag = item.overdue
    ? '❗'
    : item.priority === 'urgent' || item.priority === 'high'
      ? '🔺'
      : '•';
  const when = [withDate ? dm(item.date) : null, item.time].filter(Boolean).join(' ');
  return `${flag} ${when ? `${when} ` : ''}${item.title}${item.meta ? ` — ${item.meta}` : ''}`;
}

const MAX_LENGTH = 3800;

export function buildDigestText(kind: DigestKind, data: FocusData, aiLines: string[] = []): string {
  const s = data.summary;
  const multiDay = data.range.from !== data.range.to;
  const out: string[] = [title(kind, data), ''];
  const stats = [
    `${s.open_due_count} việc đến hạn`,
    s.overdue_count > 0 ? `${s.overdue_count} việc quá hạn` : null,
    s.meeting_count > 0 ? `${s.meeting_count} cuộc họp` : null,
    s.deal_close_count > 0
      ? `${s.deal_close_count} cơ hội dự kiến chốt (${vndShort(s.deal_close_vnd)})`
      : null,
    s.expiring_count > 0 ? `${s.expiring_count} hợp đồng/báo giá/dịch vụ đến hạn` : null,
  ].filter(Boolean);
  out.push(stats.join(' · '));
  if (s.capacity_hours > 0 && s.load_hours > s.capacity_hours) {
    out.push(
      `⚠️ Khối lượng ước tính ${s.load_hours} giờ, vượt ${s.capacity_hours} giờ làm việc còn lại.`
    );
  }

  if (aiLines.length > 0) out.push('', '🤖 AI gợi ý', ...aiLines);

  const carry = data.carry_over.filter((item) => !item.done).slice(0, 5);
  if (carry.length > 0) {
    out.push('', `⏰ Tồn từ trước (${data.summary.carry_over_count})`);
    out.push(...carry.map((item) => line(item, true)));
  }

  const todo = data.items.filter((item) => item.group === 'todo' && !item.done);
  if (todo.length > 0) {
    out.push('', '✅ Phải làm');
    out.push(...todo.slice(0, kind === 'monthly' ? 12 : 10).map((item) => line(item, multiDay)));
    if (todo.length > 10) out.push(`… và ${todo.length - 10} việc khác`);
  }

  const calendar = data.items.filter((item) => item.group === 'calendar' && !item.done);
  if (calendar.length > 0 && kind !== 'monthly') {
    out.push('', '📆 Lịch');
    out.push(...calendar.slice(0, 8).map((item) => line(item, multiDay)));
  }

  const milestones = data.items.filter((item) => item.group === 'milestone');
  if (milestones.length > 0) {
    out.push('', '🎯 Mốc kinh doanh & dự án');
    out.push(
      ...milestones
        .slice(0, 8)
        .map(
          (item) => `${line(item, true)}${item.value_vnd ? ` (${vndShort(item.value_vnd)})` : ''}`
        )
    );
  }

  if (data.attention.length > 0) {
    out.push('', '👀 Cần chú ý');
    out.push(...data.attention.slice(0, 6).map((a) => `• ${a.title} — ${a.meta}`));
  }

  if (data.waiting.on_me.length > 0) {
    out.push('', '🙋 Người khác đang chờ bạn');
    out.push(
      ...data.waiting.on_me
        .slice(0, 5)
        .map((w) => `• ${w.title}${w.person_name ? ` — ${w.person_name}` : ''}`)
    );
  }

  if (kind !== 'daily' && data.retro?.previous && data.retro.previous.planned > 0) {
    const p = data.retro.previous;
    const done = p.done_on_time + p.done_late;
    out.push('', `📈 Kỳ trước: xong ${done}/${p.planned} việc (${p.done_on_time} đúng hạn).`);
  }

  let text = out.join('\n');
  if (text.length > MAX_LENGTH) text = `${text.slice(0, MAX_LENGTH)}\n…`;
  return text;
}

function alreadySent(db: Database, key: string): boolean {
  return Boolean(db.prepare(`SELECT 1 FROM telegram_sent_log WHERE dedupe_key = ?`).get(key));
}

function markSent(db: Database, key: string): void {
  db.prepare(`INSERT OR IGNORE INTO telegram_sent_log (dedupe_key) VALUES (?)`).run(key);
}

/** Soan va gui MOT ban tin — dung cho ca bo hen gio lan nut "Gửi thử". */
export async function sendFocusDigest(
  db: Database,
  kind: DigestKind,
  recipient: number | null,
  options: { today?: string; ai?: boolean } = {}
): Promise<string> {
  const today =
    options.today ?? (db.prepare(`SELECT date('now','localtime') AS d`).get() as { d: string }).d;
  const range = digestRange(kind, today);
  const data = buildFocus(db, {
    ...range,
    scope: ownerScope(recipient),
    today,
    withRetro: kind !== 'daily',
  });
  let aiLines: string[] = [];
  if (options.ai) {
    try {
      const plan = await generateFocusPlan(db, data, {
        mode: 'fast',
        assigneeContactId: recipient,
        withProposals: false,
      });
      aiLines = [
        plan.headline,
        ...plan.priorities.slice(0, 3).map((p, i) => `${i + 1}. ${p.title}`),
      ];
    } catch (error) {
      console.error('[focus-digest] AI phan tich loi, gui ban tin khong kem AI:', error);
    }
  }

  const text = buildDigestText(kind, data, aiLines);
  await sendTelegramMessage(db, text);
  return text;
}

/** Nhung ban tin den luc gui cua hom nay — goi tu vong quet 5 phut cua telegramNotifier. */
export function dueDigests(
  settings: DigestSettings,
  today: string,
  now: string
): { kind: DigestKind; key: string }[] {
  if (!settings.enabled || now < settings.time) return [];
  const due: { kind: DigestKind; key: string }[] = [];
  if (settings.daily) due.push({ kind: 'daily', key: `focus-daily-${today}` });
  if (settings.weekly && weekStart(today) === today) {
    due.push({ kind: 'weekly', key: `focus-weekly-${today}` });
  }
  if (settings.monthly && today.endsWith('-01')) {
    due.push({ kind: 'monthly', key: `focus-monthly-${today.slice(0, 7)}` });
  }
  return due;
}

export async function runFocusDigests(db: Database, recipient: number | null): Promise<void> {
  const settings = getDigestSettings(db);
  if (!settings.enabled) return;
  const clock = db
    .prepare(`SELECT date('now','localtime') AS today, strftime('%H:%M','now','localtime') AS now`)
    .get() as { today: string; now: string };
  for (const { kind, key } of dueDigests(settings, clock.today, clock.now)) {
    if (alreadySent(db, key)) continue;
    /* Danh dau TRUOC khi gui: AI co the cham hon vong quet 5 phut ke tiep, va
       hai vong chay chong se gui trung. Gui loi thi go dau de vong sau thu lai. */
    markSent(db, key);
    try {
      await sendFocusDigest(db, kind, recipient, { today: clock.today, ai: settings.ai });
    } catch (error) {
      db.prepare(`DELETE FROM telegram_sent_log WHERE dedupe_key = ?`).run(key);
      console.error('[focus-digest] Gui ban tin that bai:', kind, error);
    }
  }
}
