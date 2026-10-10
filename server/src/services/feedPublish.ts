import { db } from '../db/connection.ts';
import { groupMembers, loadGroup } from './feedService.ts';
import { notifyPendingPost, notifyPostPublished } from './feedNotify.ts';

/*
 * Dua mot bai NHAP hoac HEN GIO ra nhom (v70). Dung chung cho "Đăng ngay" va bo
 * hen gio. Luat giong luc dang thang: nhom bat duyet bai ma tac gia khong phai
 * quan tri / kiem duyet thi bai vao hang cho duyet. Thoi diem bai la luc dang,
 * khong phai luc soan — dung thu tu tren bang tin va so bai chua doc.
 */
export function publishPost(postId: number): 'published' | 'pending' | null {
  const post = db
    .prepare(
      `SELECT id, group_id, author_contact_id, kind, status FROM feed_posts
        WHERE id = ? AND deleted_at IS NULL`
    )
    .get(postId) as
    | {
        id: number;
        group_id: number;
        author_contact_id: number | null;
        kind: string;
        status: string;
      }
    | undefined;
  if (!post || (post.status !== 'draft' && post.status !== 'scheduled')) return null;
  const group = loadGroup(post.group_id);
  if (group.is_archived) return null;
  const role = groupMembers(group).find((m) => m.contact_id === post.author_contact_id)?.role;
  const moderator = role === 'admin' || role === 'moderator';
  const status = group.require_approval && !moderator ? 'pending' : 'published';
  db.transaction(() => {
    db.prepare(
      `UPDATE feed_posts SET status = ?, publish_at = NULL, created_at = datetime('now','localtime')
        WHERE id = ?`
    ).run(status, post.id);
    if (status === 'published') notifyPostPublished(group, post.id);
    else if (post.author_contact_id != null)
      notifyPendingPost(group, post.id, post.author_contact_id);
  })();
  return status;
}

/** Dang moi bai hen gio da toi gio. Tra ve so bai da xu ly. */
export function publishDueScheduledPosts(): number {
  const due = db
    .prepare(
      `SELECT id FROM feed_posts
        WHERE status = 'scheduled' AND deleted_at IS NULL
          AND publish_at <= strftime('%Y-%m-%dT%H:%M','now','localtime')
        ORDER BY publish_at, id LIMIT 100`
    )
    .all() as { id: number }[];
  let done = 0;
  for (const row of due) {
    try {
      if (publishPost(row.id)) done += 1;
    } catch (error) {
      console.error('[feed] Khong dang duoc bai hen gio:', row.id, error);
    }
  }
  return done;
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startFeedScheduler() {
  if (timer) return timer;
  timer = setInterval(() => publishDueScheduledPosts(), 60_000);
  timer.unref();
  setTimeout(() => publishDueScheduledPosts(), 3_000).unref();
  return timer;
}
