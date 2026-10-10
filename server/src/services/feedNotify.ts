import { db } from '../db/connection.ts';
import { getTelegramConfig, sendTelegramMessage } from './telegram/telegramService.ts';
import { recipientContactId } from './telegram/telegramNotifier.ts';
import { groupMembers, type GroupRow } from './feedService.ts';

/*
 * Thong bao Bang tin (v69): moi dong `feed_notifications` la mot thong bao cho MOT
 * nguoi nhan, tao ngay luc ghi. Chuong thong bao (routes/notifications.ts) doc
 * tu day; bot Telegram gui ngay cho nguoi nhan cua no (bot chi phuc vu mot nguoi).
 *
 * Moi nguoi nhan toi da MOT thong bao cho moi su kien: nhac ten > thong bao >
 * bai moi; tra loi > binh luan. Khong bao gio tu bao cho chinh nguoi vua lam.
 */

export type FeedNotificationKind =
  'post' | 'announcement' | 'mention' | 'comment' | 'reply' | 'pending' | 'approved';

export type NotifyLevel = 'all' | 'mentions' | 'none';

/**
 * Muc thong bao cua mot nguoi voi mot nhom. Chua tung chon thi: nhom Toan cong ty
 * chi bao thong bao + nhac ten (khong thi moi bai cua ca cong ty thanh mot thong
 * bao), cac nhom khac bao moi bai.
 */
export function notifyLevel(group: GroupRow, contactId: number): NotifyLevel {
  const row = db
    .prepare(`SELECT notify FROM feed_visits WHERE group_id = ? AND contact_id = ?`)
    .get(group.id, contactId) as { notify: NotifyLevel } | undefined;
  return row?.notify ?? defaultNotifyLevel(group);
}

export function defaultNotifyLevel(group: { kind: string }): NotifyLevel {
  return group.kind === 'company' ? 'mentions' : 'all';
}

/** SQL tuong ung `notifyLevel` (cot `g.kind`, `v.notify`). */
export const NOTIFY_LEVEL_SQL = `COALESCE(v.notify, CASE WHEN g.kind = 'company' THEN 'mentions' ELSE 'all' END)`;

interface Pending {
  contactId: number;
  kind: FeedNotificationKind;
  commentId: number | null;
}

/** Telegram chi gui nhung loai can nguoi nhan de y — khong gui "bai moi". */
const TELEGRAM_KINDS = new Set<FeedNotificationKind>([
  'mention',
  'announcement',
  'comment',
  'reply',
  'pending',
  'approved',
]);

function insert(postId: number, actorId: number | null, items: Pending[]): void {
  const seen = new Set<number>();
  const stmt = db.prepare(
    `INSERT INTO feed_notifications (contact_id, kind, post_id, comment_id, actor_contact_id)
     VALUES (?, ?, ?, ?, ?)`
  );
  const created: number[] = [];
  for (const item of items) {
    if (item.contactId === actorId || seen.has(item.contactId)) continue;
    seen.add(item.contactId);
    created.push(
      Number(stmt.run(item.contactId, item.kind, postId, item.commentId, actorId).lastInsertRowid)
    );
  }
  sendTelegram(created);
}

/** Bai vua hien voi ca nhom (dang thang, hoac vua duoc duyet). */
export function notifyPostPublished(group: GroupRow, postId: number): void {
  const post = db
    .prepare(`SELECT author_contact_id, kind FROM feed_posts WHERE id = ?`)
    .get(postId) as { author_contact_id: number | null; kind: string };
  const mentioned = new Set(
    (
      db
        .prepare(`SELECT contact_id FROM feed_mentions WHERE post_id = ? AND comment_id IS NULL`)
        .all(postId) as { contact_id: number }[]
    ).map((row) => row.contact_id)
  );
  const items: Pending[] = [];
  for (const id of mentioned) items.push({ contactId: id, kind: 'mention', commentId: null });
  for (const member of groupMembers(group)) {
    if (mentioned.has(member.contact_id)) continue;
    const level = notifyLevel(group, member.contact_id);
    if (level === 'none') continue;
    if (post.kind === 'announcement') {
      items.push({ contactId: member.contact_id, kind: 'announcement', commentId: null });
    } else if (level === 'all') {
      items.push({ contactId: member.contact_id, kind: 'post', commentId: null });
    }
  }
  insert(postId, post.author_contact_id, items);
}

/** Nguoi duoc nhac them khi sua bai (bai da dang). */
export function notifyNewMentions(postId: number, actorId: number, contactIds: number[]): void {
  insert(
    postId,
    actorId,
    contactIds.map((id) => ({ contactId: id, kind: 'mention', commentId: null }))
  );
}

/** Bai cho duyet: bao cho quan tri / kiem duyet cua nhom. */
export function notifyPendingPost(group: GroupRow, postId: number, authorId: number): void {
  insert(
    postId,
    authorId,
    groupMembers(group)
      .filter((m) => m.role === 'admin' || m.role === 'moderator')
      .map((m) => ({ contactId: m.contact_id, kind: 'pending' as const, commentId: null }))
  );
}

export function notifyApproved(postId: number, moderatorId: number | null): void {
  const post = db.prepare(`SELECT author_contact_id FROM feed_posts WHERE id = ?`).get(postId) as {
    author_contact_id: number | null;
  };
  if (post.author_contact_id == null) return;
  insert(postId, moderatorId, [
    { contactId: post.author_contact_id, kind: 'approved', commentId: null },
  ]);
}

/** Binh luan moi: nguoi duoc nhac, nguoi duoc tra loi, tac gia bai. */
export function notifyComment(
  postId: number,
  commentId: number,
  actorId: number,
  parentId: number | null,
  mentionedIds: number[]
): void {
  const items: Pending[] = mentionedIds.map((id) => ({
    contactId: id,
    kind: 'mention',
    commentId,
  }));
  if (parentId != null) {
    const parent = db
      .prepare(`SELECT author_contact_id FROM feed_comments WHERE id = ?`)
      .get(parentId) as { author_contact_id: number | null } | undefined;
    if (parent?.author_contact_id != null) {
      items.push({ contactId: parent.author_contact_id, kind: 'reply', commentId });
    }
  }
  const post = db.prepare(`SELECT author_contact_id FROM feed_posts WHERE id = ?`).get(postId) as {
    author_contact_id: number | null;
  };
  if (post.author_contact_id != null) {
    items.push({ contactId: post.author_contact_id, kind: 'comment', commentId });
  }
  insert(postId, actorId, items);
}

/** Da xem bai: moi thong bao cua minh ve bai do thanh da doc (ca trong chuong). */
export function markPostNotificationsRead(contactId: number, postIds: number[]): void {
  if (postIds.length === 0) return;
  const ph = postIds.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT id FROM feed_notifications WHERE contact_id = ? AND is_read = 0 AND post_id IN (${ph})`
    )
    .all(contactId, ...postIds) as { id: number }[];
  markRead(rows.map((row) => row.id));
}

/** Da mo nhom: bai moi / thong bao cua nhom do thanh da doc (nhac ten, binh luan giu nguyen). */
export function markGroupNotificationsRead(contactId: number, groupId: number): void {
  const rows = db
    .prepare(
      `SELECT n.id FROM feed_notifications n JOIN feed_posts p ON p.id = n.post_id
        WHERE n.contact_id = ? AND n.is_read = 0 AND p.group_id = ? AND n.kind IN ('post','announcement')`
    )
    .all(contactId, groupId) as { id: number }[];
  markRead(rows.map((row) => row.id));
}

function markRead(ids: number[]): void {
  if (ids.length === 0) return;
  const ph = ids.map(() => '?').join(',');
  db.prepare(`UPDATE feed_notifications SET is_read = 1 WHERE id IN (${ph})`).run(...ids);
  db.prepare(
    `UPDATE notification_states SET is_read = 1, read_at = COALESCE(read_at, datetime('now','localtime'))
      WHERE notification_key IN (${ph})`
  ).run(...ids.map((id) => `feed-${id}`));
}

export interface FeedNotificationView {
  id: number;
  kind: FeedNotificationKind;
  post_id: number;
  title: string;
  body: string;
  created_at: string;
  is_read: number;
  severity: 'info' | 'warning';
}

const VERB: Record<FeedNotificationKind, string> = {
  post: 'đăng bài mới trong',
  announcement: 'đăng thông báo trong',
  mention: 'nhắc đến bạn trong',
  comment: 'bình luận bài viết của bạn trong',
  reply: 'trả lời bình luận của bạn trong',
  pending: 'gửi bài chờ duyệt trong',
  approved: 'đã duyệt bài của bạn trong',
};

/** Thong bao cua mot nguoi, da dien ten nguoi lam, ten nhom va trich doan. */
export function feedNotificationsFor(contactId: number, ids?: number[]): FeedNotificationView[] {
  const filter = ids ? `AND n.id IN (${ids.map(() => '?').join(',')})` : '';
  const rows = db
    .prepare(
      `SELECT n.id, n.kind, n.post_id, n.created_at, n.is_read, a.full_name AS actor_name,
              g.name AS group_name, p.body AS post_body, p.kind AS post_kind, p.requires_ack,
              c.body AS comment_body,
              EXISTS (SELECT 1 FROM feed_post_acks k WHERE k.post_id = p.id AND k.contact_id = n.contact_id) AS acked
         FROM feed_notifications n
         JOIN feed_posts p ON p.id = n.post_id AND p.deleted_at IS NULL
         JOIN feed_groups g ON g.id = p.group_id
         LEFT JOIN contacts a ON a.id = n.actor_contact_id
         LEFT JOIN feed_comments c ON c.id = n.comment_id AND c.deleted_at IS NULL
        WHERE n.contact_id = ? ${filter}
        ORDER BY n.created_at DESC, n.id DESC LIMIT 100`
    )
    .all(contactId, ...(ids ?? [])) as {
    id: number;
    kind: FeedNotificationKind;
    post_id: number;
    created_at: string;
    is_read: number;
    actor_name: string | null;
    group_name: string;
    post_body: string;
    post_kind: string;
    requires_ack: number;
    comment_body: string | null;
    acked: number;
  }[];
  return rows.map((row) => {
    const excerpt = (row.comment_body ?? row.post_body ?? '').replace(/\s+/g, ' ').trim();
    return {
      id: row.id,
      kind: row.kind,
      post_id: row.post_id,
      title: `${row.actor_name ?? 'Một người'} ${VERB[row.kind]} ${row.group_name}`,
      body: excerpt.length > 160 ? `${excerpt.slice(0, 157)}…` : excerpt || 'Mở bài viết',
      created_at: row.created_at,
      is_read: row.is_read,
      /* Thong bao can xac nhan ma chua xac nhan: noi bat hon. */
      severity: row.kind === 'announcement' && row.requires_ack && !row.acked ? 'warning' : 'info',
    };
  });
}

/**
 * Gui Telegram cho nguoi nhan cua bot neu ho nam trong so vua duoc bao. Chay nen —
 * loi mang khong duoc lam hong viec dang bai.
 */
function sendTelegram(createdIds: number[]): void {
  if (createdIds.length === 0) return;
  let recipient: number | null;
  try {
    const config = getTelegramConfig(db);
    if (!config.enabled || !config.has_token || !config.chat_id || !config.notify_feed) return;
    recipient = recipientContactId(db);
  } catch {
    return;
  }
  if (recipient == null) return;
  const mine = db
    .prepare(
      `SELECT id FROM feed_notifications
        WHERE contact_id = ? AND id IN (${createdIds.map(() => '?').join(',')})`
    )
    .all(recipient, ...createdIds) as { id: number }[];
  if (mine.length === 0) return;
  const views = feedNotificationsFor(
    recipient,
    mine.map((row) => row.id)
  ).filter((view) => TELEGRAM_KINDS.has(view.kind));
  void (async () => {
    for (const view of views) {
      const key = `feed-${view.id}`;
      try {
        if (db.prepare(`SELECT 1 FROM telegram_sent_log WHERE dedupe_key = ?`).get(key)) continue;
        await sendTelegramMessage(db, `💬 ${view.title}\n${view.body}`);
        db.prepare(`INSERT OR IGNORE INTO telegram_sent_log (dedupe_key) VALUES (?)`).run(key);
      } catch (error) {
        console.error('[telegram] Gui thong bao bang tin that bai:', view.id, error);
      }
    }
  })();
}
