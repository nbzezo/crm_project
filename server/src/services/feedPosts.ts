import type { Request } from 'express';
import { db } from '../db/connection.ts';
import { accessOf } from '../middleware/currentUser.ts';
import { documentScope } from '../lib/documentScope.ts';
import { linkedBranch, taskBranch, type LinkedKind } from '../lib/linkedScope.ts';
import type { ScopeClause } from '../lib/scope.ts';
import { roleOf, type GroupRole, type GroupRow } from './feedService.ts';

/*
 * Doc bai viet cua Bang tin thanh dang giao dien can — mot lan cho ca trang, khong
 * moi bai mot loat truy van. Moi thu "nguoi nay duoc thay khong" (tep, ban ghi CRM)
 * tinh o day theo DUNG nguoi dang xem.
 */

export interface PostRow {
  id: number;
  group_id: number;
  author_contact_id: number | null;
  kind: 'post' | 'announcement' | 'poll' | 'question' | 'event';
  body: string;
  status: 'published' | 'pending' | 'rejected';
  is_pinned: number;
  requires_ack: number;
  poll_multi: number;
  poll_closes_at: string | null;
  event_start_at: string | null;
  event_end_at: string | null;
  event_location: string;
  task_card_id: number | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
}

export type LinkType = 'customer' | 'deal' | 'contract' | 'project' | 'card';

const LINK_SOURCES: Record<LinkType, { table: string; label: string; sub: string }> = {
  customer: { table: 'customers x', label: 'x.name', sub: "''" },
  deal: {
    table: 'deals x LEFT JOIN customers c ON c.id = x.customer_id',
    label: 'x.title',
    sub: "COALESCE(c.name, '')",
  },
  contract: {
    table: 'contracts x LEFT JOIN customers c ON c.id = x.customer_id',
    label: 'x.name',
    sub: "COALESCE(c.name, '')",
  },
  project: { table: 'projects x', label: 'x.name', sub: "COALESCE(x.code, '')" },
  card: { table: 'cards x', label: 'x.title', sub: "COALESCE(x.due_date, '')" },
};

/** Dieu kien "nguoi xem thay ban ghi CRM nay" — cung luat voi route goc cua no. */
export function linkScope(req: Request, type: LinkType, column = 'x.id'): ScopeClause {
  if (type === 'card') return taskBranch(req, column);
  return linkedBranch(req, column, type as LinkedKind, 'read');
}

export function linkLabels(
  req: Request,
  type: LinkType,
  ids: number[]
): Map<number, { label: string; sub: string; accessible: boolean }> {
  const result = new Map<number, { label: string; sub: string; accessible: boolean }>();
  if (ids.length === 0) return result;
  const source = LINK_SOURCES[type];
  const scope = linkScope(req, type);
  const rows = db
    .prepare(
      `SELECT x.id, ${source.label} AS label, ${source.sub} AS sub,
              ${scope.sql ? `CASE WHEN ${scope.sql} THEN 1 ELSE 0 END` : '1'} AS accessible
         FROM ${source.table}
        WHERE x.id IN (${ids.map(() => '?').join(',')})`
    )
    .all(...scope.params, ...ids) as {
    id: number;
    label: string;
    sub: string;
    accessible: number;
  }[];
  for (const row of rows) {
    /* Khong thay ban ghi thi CUNG khong thay ten — ten khach hang cung la du lieu. */
    result.set(row.id, {
      label: row.accessible ? row.label : 'Nội dung bị giới hạn',
      sub: row.accessible ? row.sub : '',
      accessible: Boolean(row.accessible),
    });
  }
  return result;
}

/** Id tep (trong danh sach) nguoi xem mo duoc theo quyen kho tai lieu hoac vi tep cong khai. */
export function accessibleLibraryDocs(req: Request, ids: number[]): Set<number> {
  if (ids.length === 0) return new Set();
  const scope = documentScope(req, 'read');
  const canDocs = accessOf(req).can('documents', 'read');
  const rows = db
    .prepare(
      `SELECT dc.id FROM documents dc
        WHERE dc.id IN (${ids.map(() => '?').join(',')}) AND dc.deleted_at IS NULL
          AND (dc.confidentiality = 'public'
               ${canDocs ? (scope.sql ? `OR ${scope.sql}` : 'OR 1') : ''})`
    )
    .all(...ids, ...(canDocs ? scope.params : [])) as { id: number }[];
  return new Set(rows.map((row) => row.id));
}

function placeholders(ids: readonly unknown[]): string {
  return ids.map(() => '?').join(',');
}

function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = map.get(k);
    if (list) list.push(row);
    else map.set(k, [row]);
  }
  return map;
}

export function serializePosts(req: Request, rows: PostRow[]) {
  if (rows.length === 0) return [];
  const me = accessOf(req).contactId;
  const ids = rows.map((row) => row.id);
  const ph = placeholders(ids);

  const groupIds = [...new Set(rows.map((row) => row.group_id))];
  const groups = new Map(
    (
      db
        .prepare(`SELECT * FROM feed_groups WHERE id IN (${placeholders(groupIds)})`)
        .all(...groupIds) as GroupRow[]
    ).map((group) => [group.id, group])
  );
  const roles = new Map<number, GroupRole | null>();
  for (const group of groups.values()) roles.set(group.id, roleOf(req, group));

  const authorIds = [
    ...new Set(rows.map((row) => row.author_contact_id).filter((id): id is number => id != null)),
  ];
  const authors = new Map(
    (authorIds.length
      ? (db
          .prepare(
            `SELECT c.id, c.full_name, c.title, u.name AS unit_name FROM contacts c
               LEFT JOIN org_units u ON u.id = c.org_unit_id
              WHERE c.id IN (${placeholders(authorIds)})`
          )
          .all(...authorIds) as {
          id: number;
          full_name: string;
          title: string | null;
          unit_name: string | null;
        }[])
      : []
    ).map((author) => [author.id, author])
  );

  const reactions = groupBy(
    db
      .prepare(
        `SELECT post_id, contact_id, reaction FROM feed_post_reactions WHERE post_id IN (${ph})`
      )
      .all(...ids) as { post_id: number; contact_id: number; reaction: string }[],
    (row) => row.post_id
  );
  const reactorNames = new Map(
    (
      db
        .prepare(
          `SELECT r.post_id, GROUP_CONCAT(c.full_name, '|') AS names FROM (
             SELECT post_id, contact_id FROM feed_post_reactions WHERE post_id IN (${ph})
              ORDER BY created_at DESC) r
             JOIN contacts c ON c.id = r.contact_id GROUP BY r.post_id`
        )
        .all(...ids) as { post_id: number; names: string }[]
    ).map((row) => [row.post_id, row.names.split('|').slice(0, 3)])
  );
  const commentCounts = new Map(
    (
      db
        .prepare(
          `SELECT post_id, COUNT(*) AS n FROM feed_comments
            WHERE post_id IN (${ph}) AND deleted_at IS NULL GROUP BY post_id`
        )
        .all(...ids) as { post_id: number; n: number }[]
    ).map((row) => [row.post_id, row.n])
  );

  const attachmentRows = db
    .prepare(
      `SELECT a.id, a.post_id, a.document_id, a.mode, d.name, d.file_name, d.mime, d.size,
              d.owner_contact_id, d.group_id, d.deleted_at
         FROM feed_post_attachments a JOIN documents d ON d.id = a.document_id
        WHERE a.post_id IN (${ph}) ORDER BY a.post_id, a.position, a.id`
    )
    .all(...ids) as {
    id: number;
    post_id: number;
    document_id: number;
    mode: 'view' | 'library';
    name: string;
    file_name: string;
    mime: string | null;
    size: number;
    owner_contact_id: number | null;
    group_id: number | null;
    deleted_at: string | null;
  }[];
  const libraryOk = accessibleLibraryDocs(
    req,
    attachmentRows.filter((a) => a.mode === 'library').map((a) => a.document_id)
  );
  const attachments = groupBy(
    attachmentRows
      .filter((a) => !a.deleted_at)
      .map((a) => {
        const post = rows.find((row) => row.id === a.post_id)!;
        const source: 'personal' | 'group' | 'shared' =
          a.mode === 'view' ? 'personal' : a.group_id === post.group_id ? 'group' : 'shared';
        const accessible = a.mode === 'view' || libraryOk.has(a.document_id);
        return {
          id: a.id,
          post_id: a.post_id,
          document_id: a.document_id,
          mode: a.mode,
          source,
          accessible,
          /* Tep khong mo duoc: van cho biet "co mot tep" nhung giau ten (ten tep
             thuong chua ten khach hang / hop dong). */
          name: accessible ? a.name : 'Tệp bị giới hạn',
          file_name: accessible ? a.file_name : '',
          mime: accessible ? a.mime : null,
          size: accessible ? a.size : 0,
          is_image: accessible && /^image\//.test(a.mime ?? ''),
        };
      }),
    (a) => a.post_id
  );

  const linkRows = db
    .prepare(`SELECT post_id, entity_type, entity_id FROM feed_post_links WHERE post_id IN (${ph})`)
    .all(...ids) as { post_id: number; entity_type: LinkType; entity_id: number }[];
  const labelsByType = new Map<LinkType, ReturnType<typeof linkLabels>>();
  for (const [type, list] of groupBy(linkRows, (row) => row.entity_type)) {
    labelsByType.set(
      type,
      linkLabels(
        req,
        type,
        list.map((row) => row.entity_id)
      )
    );
  }
  const links = groupBy(
    linkRows
      .map((row) => {
        const info = labelsByType.get(row.entity_type)?.get(row.entity_id);
        if (!info) return null;
        return { post_id: row.post_id, type: row.entity_type, id: row.entity_id, ...info };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null),
    (row) => row.post_id
  );

  const pollOptions = groupBy(
    db
      .prepare(
        `SELECT o.id, o.post_id, o.label, o.position,
                (SELECT COUNT(*) FROM feed_poll_votes v WHERE v.option_id = o.id) AS votes,
                EXISTS (SELECT 1 FROM feed_poll_votes v WHERE v.option_id = o.id AND v.contact_id = ?) AS mine
           FROM feed_poll_options o WHERE o.post_id IN (${ph}) ORDER BY o.post_id, o.position`
      )
      .all(me ?? 0, ...ids) as {
      id: number;
      post_id: number;
      label: string;
      votes: number;
      mine: number;
    }[],
    (row) => row.post_id
  );
  const pollVoters = new Map(
    (
      db
        .prepare(
          `SELECT o.post_id, COUNT(DISTINCT v.contact_id) AS n FROM feed_poll_options o
             JOIN feed_poll_votes v ON v.option_id = o.id
            WHERE o.post_id IN (${ph}) GROUP BY o.post_id`
        )
        .all(...ids) as { post_id: number; n: number }[]
    ).map((row) => [row.post_id, row.n])
  );

  const rsvps = groupBy(
    db
      .prepare(
        `SELECT post_id, contact_id, response FROM feed_event_rsvps WHERE post_id IN (${ph})`
      )
      .all(...ids) as { post_id: number; contact_id: number; response: string }[],
    (row) => row.post_id
  );
  const acks = groupBy(
    db
      .prepare(`SELECT post_id, contact_id FROM feed_post_acks WHERE post_id IN (${ph})`)
      .all(...ids) as {
      post_id: number;
      contact_id: number;
    }[],
    (row) => row.post_id
  );
  const saved = new Set(
    (
      db
        .prepare(`SELECT post_id FROM feed_post_saves WHERE contact_id = ? AND post_id IN (${ph})`)
        .all(me ?? 0, ...ids) as { post_id: number }[]
    ).map((row) => row.post_id)
  );
  const mentioned = new Set(
    (
      db
        .prepare(
          `SELECT DISTINCT post_id FROM feed_mentions WHERE contact_id = ? AND post_id IN (${ph})`
        )
        .all(me ?? 0, ...ids) as { post_id: number }[]
    ).map((row) => row.post_id)
  );
  const answers = new Map(
    (
      db
        .prepare(
          `SELECT post_id, id FROM feed_comments
            WHERE post_id IN (${ph}) AND is_answer = 1 AND deleted_at IS NULL`
        )
        .all(...ids) as { post_id: number; id: number }[]
    ).map((row) => [row.post_id, row.id])
  );
  const nowLocal = (
    db.prepare(`SELECT strftime('%Y-%m-%dT%H:%M','now','localtime') AS t`).get() as {
      t: string;
    }
  ).t;

  return rows.map((row) => {
    const group = groups.get(row.group_id)!;
    const role = roles.get(row.group_id) ?? null;
    const isAuthor = me != null && row.author_contact_id === me;
    const moderator = role === 'admin' || role === 'moderator';
    const author = row.author_contact_id != null ? authors.get(row.author_contact_id) : undefined;
    const postReactions = reactions.get(row.id) ?? [];
    const counts: Record<string, number> = {};
    for (const r of postReactions) counts[r.reaction] = (counts[r.reaction] ?? 0) + 1;
    const postRsvps = rsvps.get(row.id) ?? [];
    const postAcks = acks.get(row.id) ?? [];
    return {
      id: row.id,
      group: { id: group.id, name: group.name, kind: group.kind, color: group.color },
      author: author
        ? { id: author.id, name: author.full_name, title: author.title, unit: author.unit_name }
        : null,
      kind: row.kind,
      body: row.body,
      status: row.status,
      is_pinned: Boolean(row.is_pinned),
      created_at: row.created_at,
      edited_at: row.edited_at,
      task_card_id: row.task_card_id,
      reactions: {
        total: postReactions.length,
        counts,
        mine: postReactions.find((r) => r.contact_id === me)?.reaction ?? null,
        recent_names: reactorNames.get(row.id) ?? [],
      },
      comment_count: commentCounts.get(row.id) ?? 0,
      attachments: (attachments.get(row.id) ?? []).map(({ post_id: _post, ...rest }) => rest),
      links: (links.get(row.id) ?? []).map(({ post_id: _post, ...rest }) => rest),
      poll:
        row.kind === 'poll'
          ? {
              multi: Boolean(row.poll_multi),
              closes_at: row.poll_closes_at,
              closed: Boolean(row.poll_closes_at && row.poll_closes_at <= nowLocal),
              voters: pollVoters.get(row.id) ?? 0,
              options: (pollOptions.get(row.id) ?? []).map((option) => ({
                id: option.id,
                label: option.label,
                votes: option.votes,
                mine: Boolean(option.mine),
              })),
            }
          : null,
      event:
        row.kind === 'event'
          ? {
              start_at: row.event_start_at,
              end_at: row.event_end_at,
              location: row.event_location,
              going: postRsvps.filter((r) => r.response === 'going').length,
              maybe: postRsvps.filter((r) => r.response === 'maybe').length,
              mine: postRsvps.find((r) => r.contact_id === me)?.response ?? null,
            }
          : null,
      ack: row.requires_ack
        ? { count: postAcks.length, mine: postAcks.some((a) => a.contact_id === me) }
        : null,
      answer_comment_id: answers.get(row.id) ?? null,
      saved: saved.has(row.id),
      mentioned_me: mentioned.has(row.id),
      can_edit: isAuthor,
      can_delete: isAuthor || moderator,
      can_moderate: moderator,
    };
  });
}

export type SerializedPost = ReturnType<typeof serializePosts>[number];
