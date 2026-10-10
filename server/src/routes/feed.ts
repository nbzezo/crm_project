import fs from 'node:fs';
import path from 'node:path';
import { Router, type Request } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { db, FILES_DIR } from '../db/connection.ts';
import { HttpError, intParam, parseBody, required } from '../lib/validate.ts';
import { afterCursor, decodeCursor, encodeCursor, pageLimit } from '../lib/paging.ts';
import { buildSearchText, fold } from '../lib/viSearch.ts';
import { accessOf } from '../middleware/currentUser.ts';
import { documentScope } from '../lib/documentScope.ts';
import { createDocument, DOCUMENT_TEMP_DIR } from '../services/documentService.ts';
import { createCard } from '../services/cardService.ts';
import {
  assertCanView,
  canViewGroup,
  ensureAutoGroups,
  groupMembers,
  isFeedSuperAdmin,
  isMember,
  loadGroup,
  memberGroupsSql,
  requireContact,
  roleOf,
  type GroupRow,
} from '../services/feedService.ts';
import {
  accessibleLibraryDocs,
  linkLabels,
  linkScope,
  serializePosts,
  type LinkType,
  type PostRow,
} from '../services/feedPosts.ts';
import {
  defaultNotifyLevel,
  markGroupNotificationsRead,
  markPostNotificationsRead,
  notifyApproved,
  notifyComment,
  notifyNewMentions,
  notifyPendingPost,
  notifyPostPublished,
  NOTIFY_LEVEL_SQL,
} from '../services/feedNotify.ts';
import { publishPost } from '../services/feedPublish.ts';

/*
 * Bang tin nhom (v68). Ai dang nhap cung dung duoc — ranh gioi du lieu la THANH
 * VIEN NHOM (services/feedService.ts), khong phai mot quyen trong ma tran: ai cung
 * co phong ban cua minh. Ban ghi CRM va tep gan vao bai van theo quyen cua chinh
 * no (services/feedPosts.ts).
 */

const router = Router();

const FEED_EXTENSIONS = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.txt',
  '.csv',
  '.zip',
  '.mp4',
  '.webm',
  '.m4a',
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, DOCUMENT_TEMP_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!FEED_EXTENSIONS.has(ext))
      return cb(new HttpError(422, `Định dạng ${ext || 'không xác định'} không được hỗ trợ`));
    cb(null, true);
  },
});

function nowLocal(): string {
  return (
    db.prepare(`SELECT strftime('%Y-%m-%dT%H:%M','now','localtime') AS t`).get() as { t: string }
  ).t;
}

function isModerator(req: Request, group: GroupRow): boolean {
  const role = roleOf(req, group);
  return role === 'admin' || role === 'moderator';
}

function assertAdmin(req: Request, group: GroupRow): void {
  if (roleOf(req, group) !== 'admin') {
    throw new HttpError(403, 'Chỉ quản trị nhóm mới làm được việc này');
  }
}

/** Bai hien voi nguoi xem: da dang, hoac cua chinh ho, hoac dang cho duyet ma ho duyet duoc. */
function postVisibility(req: Request, alias = 'p'): { sql: string; params: unknown[] } {
  const me = accessOf(req).contactId;
  /* Bai nhap / hen gio (v70) chi tac gia thay — ke ca quan tri he thong. */
  if (isFeedSuperAdmin(req)) {
    return {
      sql: `${alias}.deleted_at IS NULL AND (${alias}.status NOT IN ('draft','scheduled') OR ${alias}.author_contact_id = ?)`,
      params: [me ?? 0],
    };
  }
  return {
    sql: `${alias}.deleted_at IS NULL AND (${alias}.status = 'published' OR ${alias}.author_contact_id = ?
          OR (${alias}.status = 'pending' AND ${alias}.group_id IN (
                SELECT group_id FROM feed_group_members WHERE contact_id = ? AND role IN ('admin','moderator')
                UNION SELECT g.id FROM feed_groups g JOIN org_units u ON u.id = g.org_unit_id WHERE u.head_contact_id = ?
                UNION SELECT g.id FROM feed_groups g JOIN projects pr ON pr.id = g.project_id WHERE pr.owner_contact_id = ?
                UNION SELECT id FROM feed_groups WHERE kind = 'custom' AND created_by_contact_id = ?)))`,
    params: [me ?? 0, me ?? 0, me ?? 0, me ?? 0, me ?? 0],
  };
}

/** Nap mot bai va kiem nguoi xem thay duoc no (404 neu khong). */
function loadPost(req: Request, id: number): { post: PostRow; group: GroupRow } {
  const visible = postVisibility(req);
  const post = db
    .prepare(`SELECT p.* FROM feed_posts p WHERE p.id = ? AND ${visible.sql}`)
    .get(id, ...visible.params) as PostRow | undefined;
  if (!post) throw new HttpError(404, 'Không tìm thấy bài viết');
  const group = loadGroup(post.group_id);
  assertCanView(req, group);
  return { post, group };
}

/** Bai nhap / hen gio / cho duyet chua the duoc thich, binh chon, xac nhan. */
function assertPublished(post: PostRow): void {
  if (post.status !== 'published') throw new HttpError(409, 'Bài viết chưa được đăng');
}

/** Tuong tac (thich, binh luan, binh chon...) chi danh cho thanh vien. */
function assertParticipant(req: Request, group: GroupRow): number {
  const me = requireContact(req);
  if (!isMember(group, me) && !isFeedSuperAdmin(req)) {
    throw new HttpError(403, 'Tham gia nhóm để tương tác với bài viết');
  }
  if (group.is_archived) throw new HttpError(409, 'Nhóm đã lưu trữ, không thể tương tác');
  return me;
}

/** Chi giu nhung nguoi duoc nhac ma THAY duoc bai (thanh vien nhom). */
function saveMentions(
  group: GroupRow,
  postId: number,
  commentId: number | null,
  ids: number[]
): number[] {
  const unique = [...new Set(ids)].slice(0, 50);
  if (unique.length === 0) return [];
  const members = new Set(groupMembers(group).map((m) => m.contact_id));
  const insert = db.prepare(
    `INSERT INTO feed_mentions (post_id, comment_id, contact_id) VALUES (?, ?, ?)`
  );
  const saved = unique.filter((id) => members.has(id));
  for (const id of saved) insert.run(postId, commentId, id);
  return saved;
}

function respondPost(req: Request, id: number) {
  const post = db.prepare(`SELECT * FROM feed_posts WHERE id = ?`).get(id) as PostRow;
  return serializePosts(req, [post])[0];
}

/* ===================== Nhom ===================== */

const groupSummarySql = (req: Request) => {
  const me = accessOf(req).contactId;
  const groups = memberGroupsSql(me);
  return { groups, me };
};

/** Cot trai: nhom cua toi theo loai, so bai chua doc, viec can lam. */
router.get('/nav', (req, res) => {
  ensureAutoGroups();
  const { groups, me } = groupSummarySql(req);
  const rows = db
    .prepare(
      `SELECT g.id, g.kind, g.name, g.color, g.visibility, g.org_unit_id, g.project_id,
              v.last_seen_at, ${NOTIFY_LEVEL_SQL} AS notify,
              (SELECT COUNT(*) FROM feed_posts p
                WHERE p.group_id = g.id AND p.status = 'published' AND p.deleted_at IS NULL
                  AND (p.author_contact_id IS NULL OR p.author_contact_id <> ?)
                  AND p.created_at > COALESCE(v.last_seen_at, '0000')) AS unread,
              (SELECT MAX(p.created_at) FROM feed_posts p
                WHERE p.group_id = g.id AND p.status = 'published' AND p.deleted_at IS NULL) AS last_post_at
         FROM feed_groups g
         LEFT JOIN feed_visits v ON v.group_id = g.id AND v.contact_id = ?
        WHERE g.id IN (${groups.sql})
        ORDER BY CASE g.kind WHEN 'company' THEN 0 WHEN 'unit' THEN 1 WHEN 'project' THEN 2 ELSE 3 END,
                 g.name COLLATE NOCASE`
    )
    .all(me ?? 0, me ?? 0, ...groups.params) as {
    id: number;
    kind: string;
    notify: string;
    unread: number;
  }[];
  const ackPending = me
    ? (
        db
          .prepare(
            `SELECT COUNT(*) AS n FROM feed_posts p
              WHERE p.group_id IN (${groups.sql}) AND p.requires_ack = 1 AND p.status = 'published'
                AND p.deleted_at IS NULL AND (p.author_contact_id IS NULL OR p.author_contact_id <> ?)
                AND NOT EXISTS (SELECT 1 FROM feed_post_acks a WHERE a.post_id = p.id AND a.contact_id = ?)`
          )
          .get(...groups.params, me, me) as { n: number }
      ).n
    : 0;
  const mentions = me
    ? (
        db
          .prepare(
            `SELECT COUNT(*) AS n FROM feed_notifications n JOIN feed_posts p ON p.id = n.post_id
              WHERE n.contact_id = ? AND n.kind = 'mention' AND n.is_read = 0 AND p.deleted_at IS NULL`
          )
          .get(me) as { n: number }
      ).n
    : 0;
  const pending = db
    .prepare(
      `SELECT group_id, COUNT(*) AS n FROM feed_posts WHERE status = 'pending' AND deleted_at IS NULL GROUP BY group_id`
    )
    .all() as { group_id: number; n: number }[];
  const pendingByGroup = new Map(pending.map((row) => [row.group_id, row.n]));
  const result = rows.map((row) => {
    const group = loadGroup(row.id);
    const role = roleOf(req, group);
    return {
      ...row,
      /* Tat thong bao nhom thi khong dem bai moi o cot trai. */
      unread: row.notify === 'none' ? 0 : row.unread,
      role,
      pending: role === 'admin' || role === 'moderator' ? (pendingByGroup.get(row.id) ?? 0) : 0,
    };
  });
  res.json({
    contact_id: me,
    can_admin: isFeedSuperAdmin(req),
    groups: result,
    counts: {
      unread: result.reduce((sum, row) => sum + row.unread, 0),
      ack_pending: ackPending,
      mentions,
    },
  });
});

/** Kham pha: nhom tu lap cong khai minh chua tham gia. */
router.get('/groups/discover', (req, res) => {
  ensureAutoGroups();
  const me = accessOf(req).contactId;
  const groups = memberGroupsSql(me);
  const rows = db
    .prepare(
      `SELECT g.* FROM feed_groups g
        WHERE g.kind = 'custom' AND g.visibility = 'public' AND g.is_archived = 0
          AND g.id NOT IN (${groups.sql})
        ORDER BY g.created_at DESC LIMIT 100`
    )
    .all(...groups.params) as GroupRow[];
  res.json(
    rows.map((group) => ({
      id: group.id,
      name: group.name,
      description: group.description,
      color: group.color,
      member_count: groupMembers(group).length,
      post_count: (
        db
          .prepare(
            `SELECT COUNT(*) AS n FROM feed_posts WHERE group_id = ? AND status = 'published' AND deleted_at IS NULL`
          )
          .get(group.id) as { n: number }
      ).n,
    }))
  );
});

const groupSettingsSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
  visibility: z.enum(['public', 'private']).optional(),
  posting: z.enum(['all', 'admins']).optional(),
  require_approval: z.boolean().optional(),
});

router.post('/groups', (req, res) => {
  const me = requireContact(req);
  const body = parseBody(
    groupSettingsSchema.extend({
      name: z.string().trim().min(1).max(120),
      member_ids: z.array(z.number().int().positive()).max(500).optional(),
    }),
    req
  );
  const id = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO feed_groups (kind, name, description, color, visibility, posting, require_approval, created_by_contact_id)
         VALUES ('custom', ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        body.name,
        body.description ?? '',
        body.color ?? null,
        body.visibility ?? 'public',
        body.posting ?? 'all',
        body.require_approval ? 1 : 0,
        me
      );
    const groupId = Number(info.lastInsertRowid);
    const insert = db.prepare(
      `INSERT OR IGNORE INTO feed_group_members (group_id, contact_id, role) VALUES (?, ?, ?)`
    );
    insert.run(groupId, me, 'admin');
    for (const contactId of body.member_ids ?? []) {
      if (db.prepare(`SELECT 1 FROM contacts WHERE id = ?`).get(contactId)) {
        insert.run(groupId, contactId, 'member');
      }
    }
    return groupId;
  })();
  res.status(201).json(groupDetail(req, loadGroup(id)));
});

function groupDetail(req: Request, group: GroupRow) {
  const role = roleOf(req, group);
  const me = accessOf(req).contactId;
  const members = groupMembers(group);
  const visit = me
    ? (db
        .prepare(`SELECT notify FROM feed_visits WHERE group_id = ? AND contact_id = ?`)
        .get(group.id, me) as { notify: string } | undefined)
    : undefined;
  const counts = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM feed_posts WHERE group_id = ? AND status = 'published' AND deleted_at IS NULL) AS posts,
         (SELECT COUNT(*) FROM feed_posts WHERE group_id = ? AND status = 'pending' AND deleted_at IS NULL) AS pending,
         (SELECT COUNT(DISTINCT a.document_id) FROM feed_post_attachments a JOIN feed_posts p ON p.id = a.post_id
           WHERE p.group_id = ? AND p.deleted_at IS NULL AND p.status = 'published') AS files`
    )
    .get(group.id, group.id, group.id) as { posts: number; pending: number; files: number };
  const member = me != null && members.some((m) => m.contact_id === me);
  return {
    id: group.id,
    kind: group.kind,
    name: group.name,
    description: group.description,
    color: group.color,
    visibility: group.visibility,
    posting: group.posting,
    require_approval: Boolean(group.require_approval),
    is_archived: Boolean(group.is_archived),
    org_unit_id: group.org_unit_id,
    project_id: group.project_id,
    created_at: group.created_at,
    role,
    is_member: member,
    notify: visit?.notify ?? defaultNotifyLevel(group),
    member_count: members.length,
    admins: members
      .filter((m) => m.role === 'admin')
      .map((m) => ({ id: m.contact_id, name: m.full_name })),
    counts: {
      posts: counts.posts,
      files: counts.files,
      pending: role === 'admin' || role === 'moderator' ? counts.pending : 0,
    },
    can_post:
      !group.is_archived &&
      (member || isFeedSuperAdmin(req)) &&
      (group.posting === 'all' || role === 'admin'),
    can_join: group.kind === 'custom' && group.visibility === 'public' && !member && me != null,
    can_leave: group.kind === 'custom' && member && group.created_by_contact_id !== me,
  };
}

router.get('/groups/:id', (req, res) => {
  const group = loadGroup(intParam(req.params.id));
  assertCanView(req, group);
  res.json(groupDetail(req, group));
});

router.patch('/groups/:id', (req, res) => {
  const group = loadGroup(intParam(req.params.id));
  assertCanView(req, group);
  assertAdmin(req, group);
  const body = parseBody(groupSettingsSchema, req);
  /* Ten va che do cong khai cua nhom tu dong di theo so do to chuc / du an. */
  if (group.kind !== 'custom' && (body.name !== undefined || body.visibility !== undefined)) {
    throw new HttpError(422, 'Tên và chế độ hiển thị của nhóm tự động đi theo phòng ban / dự án');
  }
  db.prepare(
    `UPDATE feed_groups SET name = ?, description = ?, color = ?, visibility = ?, posting = ?,
            require_approval = ?, updated_at = datetime('now','localtime') WHERE id = ?`
  ).run(
    body.name ?? group.name,
    body.description ?? group.description,
    body.color === undefined ? group.color : body.color,
    body.visibility ?? group.visibility,
    body.posting ?? group.posting,
    body.require_approval === undefined ? group.require_approval : body.require_approval ? 1 : 0,
    group.id
  );
  res.json(groupDetail(req, loadGroup(group.id)));
});

/** Luu tru nhom tu lap (bai van con, chi la khong dang moi duoc). */
router.delete('/groups/:id', (req, res) => {
  const group = loadGroup(intParam(req.params.id));
  assertCanView(req, group);
  assertAdmin(req, group);
  if (group.kind !== 'custom') {
    throw new HttpError(422, 'Nhóm phòng ban / dự án tự lưu trữ theo phòng ban / dự án');
  }
  db.prepare(
    `UPDATE feed_groups SET is_archived = 1, updated_at = datetime('now','localtime') WHERE id = ?`
  ).run(group.id);
  res.json({ ok: true });
});

router.post('/groups/:id/join', (req, res) => {
  const me = requireContact(req);
  const group = loadGroup(intParam(req.params.id));
  assertCanView(req, group);
  if (group.kind !== 'custom' || group.visibility !== 'public' || group.is_archived) {
    throw new HttpError(422, 'Chỉ tự tham gia được nhóm công khai');
  }
  db.prepare(`INSERT OR IGNORE INTO feed_group_members (group_id, contact_id) VALUES (?, ?)`).run(
    group.id,
    me
  );
  res.json(groupDetail(req, group));
});

router.post('/groups/:id/leave', (req, res) => {
  const me = requireContact(req);
  const group = loadGroup(intParam(req.params.id));
  if (group.kind !== 'custom') {
    throw new HttpError(
      422,
      'Bạn thuộc nhóm này theo phòng ban / dự án; hãy tắt thông báo thay vì rời nhóm'
    );
  }
  if (group.created_by_contact_id === me) {
    throw new HttpError(422, 'Người lập nhóm không rời nhóm được; hãy lưu trữ nhóm');
  }
  db.prepare(`DELETE FROM feed_group_members WHERE group_id = ? AND contact_id = ?`).run(
    group.id,
    me
  );
  res.json({ ok: true });
});

router.get('/groups/:id/members', (req, res) => {
  const group = loadGroup(intParam(req.params.id));
  assertCanView(req, group);
  res.json(groupMembers(group));
});

router.post('/groups/:id/members', (req, res) => {
  const group = loadGroup(intParam(req.params.id));
  assertCanView(req, group);
  assertAdmin(req, group);
  const body = parseBody(
    z.object({
      contact_ids: z.array(z.number().int().positive()).min(1).max(500),
      role: z.enum(['admin', 'moderator', 'member']).optional(),
    }),
    req
  );
  const upsert = db.prepare(
    `INSERT INTO feed_group_members (group_id, contact_id, role) VALUES (?, ?, ?)
     ON CONFLICT(group_id, contact_id) DO UPDATE SET role = excluded.role`
  );
  db.transaction(() => {
    for (const id of body.contact_ids) {
      required(
        db.prepare(`SELECT id FROM contacts WHERE id = ?`).get(id),
        'Không tìm thấy nhân sự'
      );
      upsert.run(group.id, id, body.role ?? 'member');
    }
  })();
  res.json(groupMembers(group));
});

router.patch('/groups/:id/members/:contactId', (req, res) => {
  const group = loadGroup(intParam(req.params.id));
  assertCanView(req, group);
  assertAdmin(req, group);
  const contactId = intParam(req.params.contactId, 'contactId');
  const body = parseBody(z.object({ role: z.enum(['admin', 'moderator', 'member']) }), req);
  db.prepare(
    `INSERT INTO feed_group_members (group_id, contact_id, role) VALUES (?, ?, ?)
     ON CONFLICT(group_id, contact_id) DO UPDATE SET role = excluded.role`
  ).run(group.id, contactId, body.role);
  /* Voi nhom tu dong, ha ve 'member' thi bo luon dong ngoai le neu nguoi do van
     thuoc nhom theo so do — khong de lai rac. */
  if (body.role === 'member' && group.kind !== 'custom') {
    db.prepare(`DELETE FROM feed_group_members WHERE group_id = ? AND contact_id = ?`).run(
      group.id,
      contactId
    );
  }
  res.json(groupMembers(group));
});

router.delete('/groups/:id/members/:contactId', (req, res) => {
  const group = loadGroup(intParam(req.params.id));
  assertCanView(req, group);
  assertAdmin(req, group);
  const contactId = intParam(req.params.contactId, 'contactId');
  if (group.kind === 'custom' && group.created_by_contact_id === contactId) {
    throw new HttpError(422, 'Không thể xóa người lập nhóm');
  }
  db.prepare(`DELETE FROM feed_group_members WHERE group_id = ? AND contact_id = ?`).run(
    group.id,
    contactId
  );
  const stillAuto = groupMembers(group).some((m) => m.contact_id === contactId);
  res.json({ ok: true, still_member: stillAuto });
});

/** Danh dau da xem nhom (xoa so chua doc) va/hoac doi muc thong bao. */
router.put('/groups/:id/visit', (req, res) => {
  const me = requireContact(req);
  const group = loadGroup(intParam(req.params.id));
  assertCanView(req, group);
  const body = parseBody(
    z.object({ notify: z.enum(['all', 'mentions', 'none']).optional() }).default({}),
    req
  );
  db.prepare(
    `INSERT INTO feed_visits (group_id, contact_id, last_seen_at, notify)
     VALUES (?, ?, datetime('now','localtime'), COALESCE(?, ?))
     ON CONFLICT(group_id, contact_id) DO UPDATE SET
       last_seen_at = datetime('now','localtime'),
       notify = COALESCE(?, feed_visits.notify)`
  ).run(group.id, me, body.notify ?? null, defaultNotifyLevel(group), body.notify ?? null);
  markGroupNotificationsRead(me, group.id);
  res.json({ ok: true });
});

/* ===================== Bai viet ===================== */

const FEED_FILTERS = [
  'all',
  'announcements',
  'mentions',
  'attachments',
  'saved',
  'pending',
  'mine',
  'questions',
  'events',
  'drafts',
] as const;

router.get('/posts', (req, res) => {
  const me = accessOf(req).contactId;
  const filter = (FEED_FILTERS as readonly string[]).includes(String(req.query.filter))
    ? (String(req.query.filter) as (typeof FEED_FILTERS)[number])
    : 'all';
  const where: string[] = [];
  const params: unknown[] = [];
  const visible = postVisibility(req);
  where.push(visible.sql);
  params.push(...visible.params);

  if (req.query.group_id) {
    const group = loadGroup(intParam(String(req.query.group_id), 'group_id'));
    assertCanView(req, group);
    where.push('p.group_id = ?');
    params.push(group.id);
  } else if (req.query.link_type) {
    /* Trao doi noi bo cua mot khach hang / co hoi (v70): bai gan the do, tu moi nhom
       nguoi xem DOC duoc (nhom minh, nhom tu lap cong khai). Nguoi xem phai thay
       chinh ban ghi — khong dung trang nay de do ban ghi cua nguoi khac. */
    const type = String(req.query.link_type) as LinkType;
    if (!['customer', 'deal', 'contract', 'project', 'card'].includes(type)) {
      throw new HttpError(400, 'Loại liên kết không hợp lệ');
    }
    const linkId = intParam(String(req.query.link_id), 'link_id');
    if (!linkLabels(req, type, [linkId]).get(linkId)?.accessible) {
      throw new HttpError(404, 'Không tìm thấy bản ghi');
    }
    const groups = memberGroupsSql(me);
    if (!isFeedSuperAdmin(req)) {
      where.push(`(p.group_id IN (${groups.sql}) OR p.group_id IN (
        SELECT id FROM feed_groups WHERE kind = 'custom' AND visibility = 'public' AND is_archived = 0))`);
      params.push(...groups.params);
    }
    const branches = [`(l.entity_type = ? AND l.entity_id = ?)`];
    const linkParams: unknown[] = [type, linkId];
    /* Trang khach hang gom ca bai gan co hoi / hop dong cua khach do. */
    if (type === 'customer' && req.query.include_related === '1') {
      branches.push(
        `(l.entity_type = 'deal' AND l.entity_id IN (SELECT id FROM deals WHERE customer_id = ?))`,
        `(l.entity_type = 'contract' AND l.entity_id IN (SELECT id FROM contracts WHERE customer_id = ?))`
      );
      linkParams.push(linkId, linkId);
    }
    where.push(
      `EXISTS (SELECT 1 FROM feed_post_links l WHERE l.post_id = p.id AND (${branches.join(' OR ')}))`
    );
    params.push(...linkParams);
  } else if (filter !== 'saved' && filter !== 'drafts') {
    /* Trang chu: chi nhom minh la thanh vien. Bai da luu thi tu nhom nao cung duoc
       (mien con xem duoc nhom) — loc o duoi. */
    const groups = memberGroupsSql(me);
    where.push(`p.group_id IN (${groups.sql})`);
    params.push(...groups.params);
  }

  if (filter === 'pending') where.push(`p.status = 'pending'`);
  else if (filter === 'drafts') {
    where.push(`p.status IN ('draft','scheduled') AND p.author_contact_id = ?`);
    params.push(me ?? 0);
  } else {
    /* Bai cho duyet chi hien o bo loc rieng (va voi tac gia, kem nhan "Chờ duyệt").
       Bai nhap / hen gio chi o bo loc "drafts". */
    where.push(
      `(p.status = 'published' OR (p.author_contact_id = ? AND p.status IN ('pending','rejected')))`
    );
    params.push(me ?? 0);
  }
  if (filter === 'announcements') where.push(`p.kind = 'announcement'`);
  if (filter === 'questions') where.push(`p.kind = 'question'`);
  if (filter === 'events') where.push(`p.kind = 'event'`);
  if (filter === 'mine') {
    where.push('p.author_contact_id = ?');
    params.push(me ?? 0);
  }
  if (filter === 'mentions') {
    where.push(`p.id IN (SELECT post_id FROM feed_mentions WHERE contact_id = ?)`);
    params.push(me ?? 0);
  }
  if (filter === 'attachments') {
    where.push(`EXISTS (SELECT 1 FROM feed_post_attachments a WHERE a.post_id = p.id)`);
  }
  if (filter === 'saved') {
    where.push(`p.id IN (SELECT post_id FROM feed_post_saves WHERE contact_id = ?)`);
    params.push(me ?? 0);
  }
  const q = fold(String(req.query.q ?? '').trim());
  if (q) {
    where.push(`p.search_text LIKE '%' || ? || '%'`);
    params.push(q);
  }

  /* Bai ghim len dau — chi trong trang cua MOT nhom, va chi trang dau. */
  const pinnedFirst = Boolean(req.query.group_id) && filter === 'all' && !req.query.q;
  const cursor = decodeCursor(req.query.cursor);
  const limit = Math.min(pageLimit(req.query.limit ?? 20), 50);
  let pinned: PostRow[] = [];
  if (pinnedFirst) {
    if (!cursor) {
      pinned = db
        .prepare(
          `SELECT p.* FROM feed_posts p WHERE ${where.join(' AND ')} AND p.is_pinned = 1
            ORDER BY p.created_at DESC, p.id DESC LIMIT 10`
        )
        .all(...params) as PostRow[];
    }
    where.push('p.is_pinned = 0');
  }
  const after = afterCursor(cursor, 'p.created_at', 'p.id');
  if (after.sql) {
    where.push(after.sql);
    params.push(...after.params);
  }
  let rows = db
    .prepare(
      `SELECT p.* FROM feed_posts p WHERE ${where.join(' AND ')}
        ORDER BY p.created_at DESC, p.id DESC LIMIT ?`
    )
    .all(...params, limit + 1) as PostRow[];
  const hasMore = rows.length > limit;
  rows = rows.slice(0, limit);
  if (filter === 'saved' && !req.query.group_id) {
    rows = rows.filter((row) => canViewGroup(req, loadGroup(row.group_id)));
  }
  const last = rows[rows.length - 1];
  res.json({
    items: serializePosts(req, [...pinned, ...rows]),
    next_cursor: hasMore && last ? encodeCursor({ key: last.created_at, id: last.id }) : null,
  });
});

router.get('/posts/:id', (req, res) => {
  const { post } = loadPost(req, intParam(req.params.id));
  res.json(serializePosts(req, [post])[0]);
});

const attachmentInput = z.object({
  document_id: z.number().int().positive(),
  /* view: tep ca nhan, xem qua bai | copy: chep vao tai lieu nhom | library: tep chung / tep vua tai len nhom */
  mode: z.enum(['view', 'copy', 'library']),
});

const linkInput = z.object({
  entity_type: z.enum(['customer', 'deal', 'contract', 'project', 'card']),
  entity_id: z.number().int().positive(),
});

const localDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Thời điểm phải dạng YYYY-MM-DDTHH:mm');

const postInput = z.object({
  group_id: z.number().int().positive(),
  kind: z.enum(['post', 'announcement', 'poll', 'question', 'event']).default('post'),
  body: z.string().trim().max(20000).default(''),
  requires_ack: z.boolean().optional(),
  is_pinned: z.boolean().optional(),
  attachments: z.array(attachmentInput).max(20).default([]),
  links: z.array(linkInput).max(10).default([]),
  mention_ids: z.array(z.number().int().positive()).max(50).default([]),
  /* v70: dang ngay, luu nhap, hoac hen gio dang luc `publish_at`. */
  mode: z.enum(['publish', 'draft', 'schedule']).default('publish'),
  publish_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Thời điểm phải dạng YYYY-MM-DDTHH:mm')
    .nullable()
    .optional(),
  poll: z
    .object({
      options: z.array(z.string().trim().min(1).max(200)).min(2).max(10),
      multi: z.boolean().default(false),
      closes_at: localDateTime.nullable().optional(),
    })
    .optional(),
  event: z
    .object({
      start_at: localDateTime,
      end_at: localDateTime.nullable().optional(),
      location: z.string().trim().max(300).default(''),
    })
    .optional(),
});

/** Chep tep sang ban moi thuoc nhom — ban goc cua nguoi dang khong doi. */
function copyDocumentToGroup(documentId: number, groupId: number, ownerContactId: number): number {
  const doc = db.prepare(`SELECT * FROM documents WHERE id = ?`).get(documentId) as Record<
    string,
    unknown
  >;
  const ext = path.extname(String(doc.stored_name));
  const storedName = `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
  fs.copyFileSync(path.join(FILES_DIR, String(doc.stored_name)), path.join(FILES_DIR, storedName));
  const info = db
    .prepare(
      `INSERT INTO documents (name, doc_type, file_name, stored_name, mime, size, description, tags,
                              confidentiality, search_text, owner_contact_id, group_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'internal', ?, ?, ?, datetime('now','localtime'))`
    )
    .run(
      doc.name,
      doc.doc_type,
      doc.file_name,
      storedName,
      doc.mime,
      doc.size,
      doc.description ?? '',
      doc.tags ?? '',
      doc.search_text ?? '',
      ownerContactId,
      groupId
    );
  return Number(info.lastInsertRowid);
}

/**
 * Kiem va ghi tep dinh kem cua mot bai. Goi TRONG transaction tao/sua bai.
 *
 * - view: chi chu tep (nguoi tai len) moi chia se duoc tep ca nhan cua minh.
 * - copy: nhu tren, nhung chep thanh ban cua nhom.
 * - library: nguoi dang phai THAY duoc tep (quyen kho tai lieu, hoac tep nhom).
 */
function attachDocuments(
  req: Request,
  postId: number,
  group: GroupRow,
  me: number,
  items: z.infer<typeof attachmentInput>[],
  startPosition = 0
): void {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO feed_post_attachments (post_id, document_id, mode, position) VALUES (?, ?, ?, ?)`
  );
  items.forEach((item, index) => {
    const doc = db
      .prepare(
        `SELECT id, owner_contact_id, group_id FROM documents WHERE id = ? AND deleted_at IS NULL`
      )
      .get(item.document_id) as
      { id: number; owner_contact_id: number | null; group_id: number | null } | undefined;
    if (!doc) throw new HttpError(404, 'Không tìm thấy tài liệu đính kèm');
    if (item.mode === 'view' || item.mode === 'copy') {
      if (doc.owner_contact_id !== me) {
        throw new HttpError(403, 'Chỉ chia sẻ được tài liệu cá nhân của chính bạn');
      }
      const documentId = item.mode === 'copy' ? copyDocumentToGroup(doc.id, group.id, me) : doc.id;
      insert.run(
        postId,
        documentId,
        item.mode === 'copy' ? 'library' : 'view',
        startPosition + index
      );
      return;
    }
    const ownGroupFile = doc.group_id === group.id;
    if (!ownGroupFile && !accessibleLibraryDocs(req, [doc.id]).has(doc.id)) {
      throw new HttpError(404, 'Không tìm thấy tài liệu đính kèm');
    }
    insert.run(postId, doc.id, 'library', startPosition + index);
  });
}

function attachLinks(req: Request, postId: number, items: z.infer<typeof linkInput>[]) {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO feed_post_links (post_id, entity_type, entity_id) VALUES (?, ?, ?)`
  );
  for (const item of items) {
    const info = linkLabels(req, item.entity_type, [item.entity_id]).get(item.entity_id);
    /* Chi gan duoc ban ghi minh thay — khong dung bai viet de do xem id nao ton tai. */
    if (!info?.accessible) throw new HttpError(404, 'Không tìm thấy bản ghi liên kết');
    insert.run(postId, item.entity_type, item.entity_id);
  }
}

router.post('/posts', (req, res) => {
  const me = requireContact(req);
  const body = parseBody(postInput, req);
  const group = loadGroup(body.group_id);
  assertCanView(req, group);
  const role = roleOf(req, group);
  if (group.is_archived) throw new HttpError(409, 'Nhóm đã lưu trữ');
  if (!isMember(group, me) && !isFeedSuperAdmin(req)) {
    throw new HttpError(403, 'Tham gia nhóm để đăng bài');
  }
  const admin = role === 'admin';
  if (group.posting === 'admins' && !admin) {
    throw new HttpError(403, 'Nhóm này chỉ quản trị viên được đăng bài');
  }
  if (body.kind === 'announcement' && !admin) {
    throw new HttpError(403, 'Chỉ quản trị nhóm mới đăng được thông báo');
  }
  if (body.kind === 'poll' && !body.poll)
    throw new HttpError(422, 'Khảo sát cần ít nhất hai lựa chọn');
  if (body.kind === 'event' && !body.event)
    throw new HttpError(422, 'Sự kiện cần thời gian bắt đầu');
  if (body.event?.end_at && body.event.end_at < body.event.start_at) {
    throw new HttpError(422, 'Giờ kết thúc phải sau giờ bắt đầu');
  }
  if (
    !body.body &&
    body.attachments.length === 0 &&
    body.kind !== 'poll' &&
    body.kind !== 'event'
  ) {
    throw new HttpError(422, 'Bài viết đang trống');
  }
  if (body.mode === 'schedule') assertFuture(body.publish_at);
  const status =
    body.mode === 'draft'
      ? 'draft'
      : body.mode === 'schedule'
        ? 'scheduled'
        : group.require_approval && !(role === 'admin' || role === 'moderator')
          ? 'pending'
          : 'published';

  const id = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO feed_posts (group_id, author_contact_id, kind, body, status, is_pinned, requires_ack,
                                 poll_multi, poll_closes_at, event_start_at, event_end_at, event_location, search_text,
                                 publish_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        group.id,
        me,
        body.kind,
        body.body,
        status,
        admin && (body.is_pinned || body.kind === 'announcement') ? 1 : 0,
        body.kind === 'announcement' && body.requires_ack ? 1 : 0,
        body.poll?.multi ? 1 : 0,
        body.poll?.closes_at ?? null,
        body.event?.start_at ?? null,
        body.event?.end_at ?? null,
        body.event?.location ?? '',
        buildSearchText(body.body, body.event?.location, ...(body.poll?.options ?? [])),
        status === 'scheduled' ? body.publish_at : null
      );
    const postId = Number(info.lastInsertRowid);
    if (body.poll) {
      const insert = db.prepare(
        `INSERT INTO feed_poll_options (post_id, label, position) VALUES (?, ?, ?)`
      );
      body.poll.options.forEach((label, index) => insert.run(postId, label, index));
    }
    attachDocuments(req, postId, group, me, body.attachments);
    attachLinks(req, postId, body.links);
    saveMentions(group, postId, null, body.mention_ids);
    if (status === 'published') notifyPostPublished(group, postId);
    else if (status === 'pending') notifyPendingPost(group, postId, me);
    return postId;
  })();
  res.status(201).json(respondPost(req, id));
});

function assertFuture(value: string | null | undefined): asserts value is string {
  if (!value) throw new HttpError(422, 'Chọn thời điểm đăng');
  if (value <= nowLocal()) throw new HttpError(422, 'Thời điểm đăng phải ở tương lai');
}

/** Bai nhap / hen gio cua chinh minh. */
function loadOwnUnpublished(req: Request, id: number) {
  const me = requireContact(req);
  const { post, group } = loadPost(req, id);
  if (post.author_contact_id !== me) throw new HttpError(403, 'Chỉ tác giả mới làm được việc này');
  if (post.status !== 'draft' && post.status !== 'scheduled') {
    throw new HttpError(409, 'Bài đã đăng');
  }
  return { post, group, me };
}

/** Dang ngay mot bai nhap / hen gio. */
router.post('/posts/:id/publish', (req, res) => {
  const { post, group, me } = loadOwnUnpublished(req, intParam(req.params.id));
  if (group.posting === 'admins' && roleOf(req, group) !== 'admin') {
    throw new HttpError(403, 'Nhóm này chỉ quản trị viên được đăng bài');
  }
  if (!isMember(group, me) && !isFeedSuperAdmin(req))
    throw new HttpError(403, 'Tham gia nhóm để đăng bài');
  publishPost(post.id);
  res.json(respondPost(req, post.id));
});

/** Hen gio (hoac doi gio) cho bai nhap / hen gio; `publish_at: null` = quay ve nhap. */
router.post('/posts/:id/schedule', (req, res) => {
  const { post } = loadOwnUnpublished(req, intParam(req.params.id));
  const body = parseBody(
    z.object({
      publish_at: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
        .nullable(),
    }),
    req
  );
  if (body.publish_at !== null) assertFuture(body.publish_at);
  db.prepare(`UPDATE feed_posts SET status = ?, publish_at = ? WHERE id = ?`).run(
    body.publish_at === null ? 'draft' : 'scheduled',
    body.publish_at,
    post.id
  );
  res.json(respondPost(req, post.id));
});

/* ---------- Mau bai (v70) ---------- */

interface TemplateRow {
  id: number;
  owner_contact_id: number | null;
  group_id: number | null;
  name: string;
  kind: string;
  body: string;
}

router.get('/templates', (req, res) => {
  const me = requireContact(req);
  const groupId = req.query.group_id ? intParam(String(req.query.group_id), 'group_id') : null;
  const rows: (TemplateRow & { scope: 'mine' | 'group' })[] = (
    db
      .prepare(
        `SELECT * FROM feed_post_templates WHERE owner_contact_id = ? AND group_id IS NULL ORDER BY name`
      )
      .all(me) as TemplateRow[]
  ).map((row) => ({ ...row, scope: 'mine' as const }));
  if (groupId != null) {
    const group = loadGroup(groupId);
    if (canViewGroup(req, group)) {
      rows.push(
        ...(
          db
            .prepare(`SELECT * FROM feed_post_templates WHERE group_id = ? ORDER BY name`)
            .all(group.id) as TemplateRow[]
        ).map((row) => ({ ...row, scope: 'group' as const }))
      );
    }
  }
  res.json(
    rows.map((row) => ({
      ...row,
      can_edit:
        row.owner_contact_id === me ||
        (row.group_id != null && isModerator(req, loadGroup(row.group_id))),
    }))
  );
});

const templateInput = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(['post', 'announcement', 'poll', 'question', 'event']).default('post'),
  body: z.string().max(20000).default(''),
  group_id: z.number().int().positive().nullable().optional(),
});

function assertTemplateGroup(req: Request, groupId: number | null | undefined) {
  if (groupId == null) return;
  const group = loadGroup(groupId);
  assertCanView(req, group);
  if (!isModerator(req, group)) {
    throw new HttpError(403, 'Chỉ quản trị / kiểm duyệt nhóm mới lưu mẫu dùng chung cho nhóm');
  }
}

router.post('/templates', (req, res) => {
  const me = requireContact(req);
  const body = parseBody(templateInput, req);
  assertTemplateGroup(req, body.group_id);
  const info = db
    .prepare(
      `INSERT INTO feed_post_templates (owner_contact_id, group_id, name, kind, body) VALUES (?, ?, ?, ?, ?)`
    )
    .run(me, body.group_id ?? null, body.name, body.kind, body.body);
  res
    .status(201)
    .json(db.prepare(`SELECT * FROM feed_post_templates WHERE id = ?`).get(info.lastInsertRowid));
});

function loadEditableTemplate(req: Request, id: number): TemplateRow {
  const me = requireContact(req);
  const row = db.prepare(`SELECT * FROM feed_post_templates WHERE id = ?`).get(id) as
    TemplateRow | undefined;
  if (!row) throw new HttpError(404, 'Không tìm thấy mẫu');
  const groupModerator = row.group_id != null && isModerator(req, loadGroup(row.group_id));
  if (row.owner_contact_id !== me && !groupModerator)
    throw new HttpError(404, 'Không tìm thấy mẫu');
  return row;
}

router.patch('/templates/:id', (req, res) => {
  const row = loadEditableTemplate(req, intParam(req.params.id));
  const body = parseBody(templateInput.partial(), req);
  db.prepare(
    `UPDATE feed_post_templates SET name = ?, kind = ?, body = ?, updated_at = datetime('now','localtime') WHERE id = ?`
  ).run(body.name ?? row.name, body.kind ?? row.kind, body.body ?? row.body, row.id);
  res.json(db.prepare(`SELECT * FROM feed_post_templates WHERE id = ?`).get(row.id));
});

router.delete('/templates/:id', (req, res) => {
  const row = loadEditableTemplate(req, intParam(req.params.id));
  db.prepare(`DELETE FROM feed_post_templates WHERE id = ?`).run(row.id);
  res.json({ ok: true });
});

router.patch('/posts/:id', (req, res) => {
  const me = requireContact(req);
  const { post, group } = loadPost(req, intParam(req.params.id));
  if (post.author_contact_id !== me) throw new HttpError(403, 'Chỉ tác giả mới sửa được bài viết');
  const body = parseBody(
    z.object({
      body: z.string().trim().max(20000).optional(),
      add_attachments: z.array(attachmentInput).max(20).optional(),
      links: z.array(linkInput).max(10).optional(),
      mention_ids: z.array(z.number().int().positive()).max(50).optional(),
      event: postInput.shape.event,
    }),
    req
  );
  db.transaction(() => {
    if (body.body !== undefined || body.event) {
      db.prepare(
        `UPDATE feed_posts SET body = ?, event_start_at = ?, event_end_at = ?, event_location = ?,
                search_text = ?, edited_at = datetime('now','localtime') WHERE id = ?`
      ).run(
        body.body ?? post.body,
        body.event?.start_at ?? post.event_start_at,
        body.event ? (body.event.end_at ?? null) : post.event_end_at,
        body.event?.location ?? post.event_location,
        buildSearchText(body.body ?? post.body, body.event?.location ?? post.event_location),
        post.id
      );
    }
    if (body.add_attachments?.length) {
      const max = (
        db
          .prepare(
            `SELECT COALESCE(MAX(position), -1) AS m FROM feed_post_attachments WHERE post_id = ?`
          )
          .get(post.id) as { m: number }
      ).m;
      attachDocuments(req, post.id, group, me, body.add_attachments, max + 1);
    }
    if (body.links) {
      db.prepare(`DELETE FROM feed_post_links WHERE post_id = ?`).run(post.id);
      attachLinks(req, post.id, body.links);
    }
    if (body.mention_ids) {
      const already = new Set(
        (
          db
            .prepare(
              `SELECT contact_id FROM feed_mentions WHERE post_id = ? AND comment_id IS NULL`
            )
            .all(post.id) as { contact_id: number }[]
        ).map((row) => row.contact_id)
      );
      const added = saveMentions(
        group,
        post.id,
        null,
        body.mention_ids.filter((id) => !already.has(id))
      );
      if (post.status === 'published') notifyNewMentions(post.id, me, added);
    }
  })();
  res.json(respondPost(req, post.id));
});

router.delete('/posts/:id', (req, res) => {
  const me = requireContact(req);
  const { post, group } = loadPost(req, intParam(req.params.id));
  if (post.author_contact_id !== me && !isModerator(req, group)) {
    throw new HttpError(403, 'Bạn không xóa được bài viết này');
  }
  db.prepare(
    `UPDATE feed_posts SET deleted_at = datetime('now','localtime'), deleted_by_contact_id = ? WHERE id = ?`
  ).run(me, post.id);
  res.json({ ok: true });
});

/** Go mot tep khoi bai — voi tep ca nhan, day la THU HOI quyen xem cua nhom. */
router.delete('/posts/:id/attachments/:attachmentId', (req, res) => {
  const me = requireContact(req);
  const { post, group } = loadPost(req, intParam(req.params.id));
  if (post.author_contact_id !== me && !isModerator(req, group)) {
    throw new HttpError(403, 'Bạn không gỡ được tệp này');
  }
  const info = db
    .prepare(`DELETE FROM feed_post_attachments WHERE id = ? AND post_id = ?`)
    .run(intParam(req.params.attachmentId, 'attachmentId'), post.id);
  if (info.changes === 0) throw new HttpError(404, 'Không tìm thấy tệp đính kèm');
  res.json(respondPost(req, post.id));
});

router.post('/posts/:id/moderate', (req, res) => {
  const { post, group } = loadPost(req, intParam(req.params.id));
  if (!isModerator(req, group)) throw new HttpError(403, 'Chỉ quản trị nhóm mới duyệt bài');
  const body = parseBody(z.object({ action: z.enum(['approve', 'reject']) }), req);
  if (post.status !== 'pending') throw new HttpError(409, 'Bài viết không ở trạng thái chờ duyệt');
  /* Duyet thi bai "moi" tu luc duyet — dung thu tu tren bang tin va dem chua doc. */
  db.prepare(
    `UPDATE feed_posts SET status = ?, created_at = CASE WHEN ? = 'published' THEN datetime('now','localtime') ELSE created_at END WHERE id = ?`
  ).run(
    body.action === 'approve' ? 'published' : 'rejected',
    body.action === 'approve' ? 'published' : 'rejected',
    post.id
  );
  if (body.action === 'approve') {
    notifyApproved(post.id, accessOf(req).contactId);
    notifyPostPublished(group, post.id);
  }
  res.json(respondPost(req, post.id));
});

/** Da xem bai (mo trang bai / mo binh luan): thong bao ve bai do thanh da doc. */
router.post('/posts/:id/seen', (req, res) => {
  const me = requireContact(req);
  const { post } = loadPost(req, intParam(req.params.id));
  markPostNotificationsRead(me, [post.id]);
  res.json({ ok: true });
});

router.post('/posts/:id/pin', (req, res) => {
  const { post, group } = loadPost(req, intParam(req.params.id));
  if (!isModerator(req, group)) throw new HttpError(403, 'Chỉ quản trị nhóm mới ghim bài');
  const body = parseBody(z.object({ pinned: z.boolean() }), req);
  db.prepare(`UPDATE feed_posts SET is_pinned = ? WHERE id = ?`).run(body.pinned ? 1 : 0, post.id);
  res.json(respondPost(req, post.id));
});

router.put('/posts/:id/reaction', (req, res) => {
  const { post, group } = loadPost(req, intParam(req.params.id));
  const me = assertParticipant(req, group);
  assertPublished(post);
  const body = parseBody(
    z.object({
      reaction: z.enum(['like', 'love', 'haha', 'wow', 'sad', 'celebrate']).nullable(),
    }),
    req
  );
  if (body.reaction === null) {
    db.prepare(`DELETE FROM feed_post_reactions WHERE post_id = ? AND contact_id = ?`).run(
      post.id,
      me
    );
  } else {
    db.prepare(
      `INSERT INTO feed_post_reactions (post_id, contact_id, reaction) VALUES (?, ?, ?)
       ON CONFLICT(post_id, contact_id) DO UPDATE SET reaction = excluded.reaction`
    ).run(post.id, me, body.reaction);
  }
  res.json(respondPost(req, post.id));
});

router.get('/posts/:id/reactions', (req, res) => {
  const { post } = loadPost(req, intParam(req.params.id));
  res.json(
    db
      .prepare(
        `SELECT r.reaction, c.id AS contact_id, c.full_name FROM feed_post_reactions r
           JOIN contacts c ON c.id = r.contact_id WHERE r.post_id = ? ORDER BY r.created_at DESC`
      )
      .all(post.id)
  );
});

router.post('/posts/:id/ack', (req, res) => {
  const { post, group } = loadPost(req, intParam(req.params.id));
  const me = assertParticipant(req, group);
  assertPublished(post);
  if (!post.requires_ack) throw new HttpError(422, 'Bài viết không cần xác nhận');
  db.prepare(`INSERT OR IGNORE INTO feed_post_acks (post_id, contact_id) VALUES (?, ?)`).run(
    post.id,
    me
  );
  res.json(respondPost(req, post.id));
});

/** Ai da / chua xac nhan doc thong bao — cho quan tri nhom va tac gia. */
router.get('/posts/:id/acks', (req, res) => {
  const me = requireContact(req);
  const { post, group } = loadPost(req, intParam(req.params.id));
  if (post.author_contact_id !== me && !isModerator(req, group)) {
    throw new HttpError(403, 'Chỉ tác giả và quản trị nhóm xem được danh sách xác nhận');
  }
  const acked = new Map(
    (
      db
        .prepare(`SELECT contact_id, acked_at FROM feed_post_acks WHERE post_id = ?`)
        .all(post.id) as {
        contact_id: number;
        acked_at: string;
      }[]
    ).map((row) => [row.contact_id, row.acked_at])
  );
  res.json(
    groupMembers(group)
      .filter((m) => m.contact_id !== post.author_contact_id)
      .map((m) => ({
        contact_id: m.contact_id,
        full_name: m.full_name,
        unit_name: m.unit_name,
        acked_at: acked.get(m.contact_id) ?? null,
      }))
  );
});

router.put('/posts/:id/save', (req, res) => {
  const me = requireContact(req);
  const { post } = loadPost(req, intParam(req.params.id));
  const body = parseBody(z.object({ saved: z.boolean() }), req);
  if (body.saved) {
    db.prepare(`INSERT OR IGNORE INTO feed_post_saves (post_id, contact_id) VALUES (?, ?)`).run(
      post.id,
      me
    );
  } else {
    db.prepare(`DELETE FROM feed_post_saves WHERE post_id = ? AND contact_id = ?`).run(post.id, me);
  }
  res.json(respondPost(req, post.id));
});

router.put('/posts/:id/vote', (req, res) => {
  const { post, group } = loadPost(req, intParam(req.params.id));
  const me = assertParticipant(req, group);
  assertPublished(post);
  if (post.kind !== 'poll') throw new HttpError(422, 'Bài viết không phải khảo sát');
  if (post.poll_closes_at && post.poll_closes_at <= nowLocal()) {
    throw new HttpError(409, 'Khảo sát đã đóng');
  }
  const body = parseBody(
    z.object({ option_ids: z.array(z.number().int().positive()).max(10) }),
    req
  );
  const valid = new Set(
    (
      db.prepare(`SELECT id FROM feed_poll_options WHERE post_id = ?`).all(post.id) as {
        id: number;
      }[]
    ).map((row) => row.id)
  );
  const chosen = [...new Set(body.option_ids)];
  if (chosen.some((id) => !valid.has(id))) throw new HttpError(422, 'Lựa chọn không hợp lệ');
  if (!post.poll_multi && chosen.length > 1) throw new HttpError(422, 'Khảo sát chỉ cho chọn một');
  db.transaction(() => {
    db.prepare(
      `DELETE FROM feed_poll_votes WHERE contact_id = ? AND option_id IN (SELECT id FROM feed_poll_options WHERE post_id = ?)`
    ).run(me, post.id);
    const insert = db.prepare(`INSERT INTO feed_poll_votes (option_id, contact_id) VALUES (?, ?)`);
    for (const id of chosen) insert.run(id, me);
  })();
  res.json(respondPost(req, post.id));
});

router.put('/posts/:id/rsvp', (req, res) => {
  const { post, group } = loadPost(req, intParam(req.params.id));
  const me = assertParticipant(req, group);
  assertPublished(post);
  if (post.kind !== 'event') throw new HttpError(422, 'Bài viết không phải sự kiện');
  const body = parseBody(
    z.object({ response: z.enum(['going', 'maybe', 'declined']).nullable() }),
    req
  );
  if (body.response === null) {
    db.prepare(`DELETE FROM feed_event_rsvps WHERE post_id = ? AND contact_id = ?`).run(
      post.id,
      me
    );
  } else {
    db.prepare(
      `INSERT INTO feed_event_rsvps (post_id, contact_id, response) VALUES (?, ?, ?)
       ON CONFLICT(post_id, contact_id) DO UPDATE SET response = excluded.response, updated_at = datetime('now','localtime')`
    ).run(post.id, me, body.response);
  }
  res.json(respondPost(req, post.id));
});

/** Them su kien vao Lich CUA TOI (ban rieng, sua/xoa khong anh huong bai). */
router.post('/posts/:id/calendar', (req, res) => {
  const me = requireContact(req);
  const { post, group } = loadPost(req, intParam(req.params.id));
  if (post.kind !== 'event' || !post.event_start_at)
    throw new HttpError(422, 'Bài viết không phải sự kiện');
  if (!accessOf(req).can('tasks', 'create'))
    throw new HttpError(403, 'Bạn không có quyền dùng Lịch');
  const start = post.event_start_at;
  const end =
    post.event_end_at ??
    (db.prepare(`SELECT strftime('%Y-%m-%dT%H:%M', ?, '+1 hour') AS t`).get(start) as { t: string })
      .t;
  const title = (post.body.split('\n')[0] || 'Sự kiện nhóm').slice(0, 200);
  const description = `Từ Bảng tin · ${group.name}\n\n${post.body}`.slice(0, 5000);
  const info = db
    .prepare(
      `INSERT INTO calendar_events (title, description, location, event_type, start_at, end_at, all_day,
                                    status, reminder_minutes, search_text, owner_contact_id)
       VALUES (?, ?, ?, 'meeting', ?, ?, 0, 'pending', 30, ?, ?)`
    )
    .run(
      title,
      description,
      post.event_location,
      start,
      end,
      buildSearchText(title, post.event_location),
      me
    );
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

/** Tao cong viec tu bai viet — mo ta mang duong dan ve bai goc. */
router.post('/posts/:id/task', (req, res) => {
  const me = requireContact(req);
  const { post, group } = loadPost(req, intParam(req.params.id));
  if (!accessOf(req).can('tasks', 'create'))
    throw new HttpError(403, 'Bạn không có quyền tạo công việc');
  const body = parseBody(
    z.object({
      title: z.string().trim().min(1).max(300),
      assignee_contact_id: z.number().int().positive().nullable().optional(),
      due_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable()
        .optional(),
    }),
    req
  );
  const card = createCard(
    {
      title: body.title,
      description:
        `${post.body}\n\n— Tạo từ bài viết trong nhóm “${group.name}”: /feed/posts/${post.id}`.slice(
          0,
          5000
        ),
      assignee_contact_id: body.assignee_contact_id ?? null,
      due_date: body.due_date ?? null,
      project_id: group.project_id ?? null,
    } as Parameters<typeof createCard>[0],
    { actorContactId: me }
  ) as { id: number };
  db.prepare(`UPDATE feed_posts SET task_card_id = ? WHERE id = ?`).run(card.id, post.id);
  res.status(201).json({ card, post: respondPost(req, post.id) });
});

/* ===================== Binh luan ===================== */

router.get('/posts/:id/comments', (req, res) => {
  const me = accessOf(req).contactId;
  const { post, group } = loadPost(req, intParam(req.params.id));
  const moderator = isModerator(req, group);
  const rows = db
    .prepare(
      `SELECT fc.id, fc.parent_id, fc.body, fc.is_answer, fc.created_at, fc.edited_at,
              fc.author_contact_id, c.full_name AS author_name, u.name AS author_unit,
              (SELECT COUNT(*) FROM feed_comment_likes l WHERE l.comment_id = fc.id) AS likes,
              EXISTS (SELECT 1 FROM feed_comment_likes l WHERE l.comment_id = fc.id AND l.contact_id = ?) AS liked
         FROM feed_comments fc
         LEFT JOIN contacts c ON c.id = fc.author_contact_id
         LEFT JOIN org_units u ON u.id = c.org_unit_id
        WHERE fc.post_id = ? AND fc.deleted_at IS NULL
        ORDER BY fc.created_at, fc.id`
    )
    .all(me ?? 0, post.id) as {
    id: number;
    author_contact_id: number | null;
    is_answer: number;
    liked: number;
  }[];
  res.json(
    rows.map((row) => ({
      ...row,
      is_answer: Boolean(row.is_answer),
      liked: Boolean(row.liked),
      can_edit: me != null && row.author_contact_id === me,
      can_delete: (me != null && row.author_contact_id === me) || moderator,
    }))
  );
});

router.post('/posts/:id/comments', (req, res) => {
  const { post, group } = loadPost(req, intParam(req.params.id));
  const me = assertParticipant(req, group);
  if (post.status !== 'published') throw new HttpError(409, 'Bài viết chưa được duyệt');
  const body = parseBody(
    z.object({
      body: z.string().trim().min(1).max(5000),
      parent_id: z.number().int().positive().nullable().optional(),
      mention_ids: z.array(z.number().int().positive()).max(50).default([]),
    }),
    req
  );
  let parentId = body.parent_id ?? null;
  if (parentId != null) {
    const parent = db
      .prepare(
        `SELECT id, parent_id FROM feed_comments WHERE id = ? AND post_id = ? AND deleted_at IS NULL`
      )
      .get(parentId, post.id) as { id: number; parent_id: number | null } | undefined;
    if (!parent) throw new HttpError(404, 'Không tìm thấy bình luận');
    /* Chi mot cap tra loi: tra loi vao tra loi thi gan vao goc cua no. */
    parentId = parent.parent_id ?? parent.id;
  }
  const id = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO feed_comments (post_id, parent_id, author_contact_id, body) VALUES (?, ?, ?, ?)`
      )
      .run(post.id, parentId, me, body.body);
    const commentId = Number(info.lastInsertRowid);
    const mentioned = saveMentions(group, post.id, commentId, body.mention_ids);
    notifyComment(post.id, commentId, me, body.parent_id ?? null, mentioned);
    return commentId;
  })();
  res.status(201).json({ id });
});

function loadComment(req: Request, id: number) {
  const comment = db
    .prepare(`SELECT * FROM feed_comments WHERE id = ? AND deleted_at IS NULL`)
    .get(id) as
    | { id: number; post_id: number; author_contact_id: number | null; parent_id: number | null }
    | undefined;
  if (!comment) throw new HttpError(404, 'Không tìm thấy bình luận');
  const { post, group } = loadPost(req, comment.post_id);
  return { comment, post, group };
}

router.patch('/comments/:id', (req, res) => {
  const me = requireContact(req);
  const { comment } = loadComment(req, intParam(req.params.id));
  if (comment.author_contact_id !== me)
    throw new HttpError(403, 'Chỉ người viết mới sửa được bình luận');
  const body = parseBody(z.object({ body: z.string().trim().min(1).max(5000) }), req);
  db.prepare(
    `UPDATE feed_comments SET body = ?, edited_at = datetime('now','localtime') WHERE id = ?`
  ).run(body.body, comment.id);
  res.json({ ok: true });
});

router.delete('/comments/:id', (req, res) => {
  const me = requireContact(req);
  const { comment, group } = loadComment(req, intParam(req.params.id));
  if (comment.author_contact_id !== me && !isModerator(req, group)) {
    throw new HttpError(403, 'Bạn không xóa được bình luận này');
  }
  db.prepare(
    `UPDATE feed_comments SET deleted_at = datetime('now','localtime') WHERE id = ? OR parent_id = ?`
  ).run(comment.id, comment.id);
  res.json({ ok: true });
});

router.put('/comments/:id/like', (req, res) => {
  const { comment, group } = loadComment(req, intParam(req.params.id));
  const me = assertParticipant(req, group);
  const body = parseBody(z.object({ liked: z.boolean() }), req);
  if (body.liked) {
    db.prepare(
      `INSERT OR IGNORE INTO feed_comment_likes (comment_id, contact_id) VALUES (?, ?)`
    ).run(comment.id, me);
  } else {
    db.prepare(`DELETE FROM feed_comment_likes WHERE comment_id = ? AND contact_id = ?`).run(
      comment.id,
      me
    );
  }
  res.json({ ok: true });
});

/** Hoi dap: tac gia cau hoi (hoac quan tri) chon cau tra loi dung. */
router.post('/comments/:id/answer', (req, res) => {
  const me = requireContact(req);
  const { comment, post, group } = loadComment(req, intParam(req.params.id));
  if (post.kind !== 'question') throw new HttpError(422, 'Chỉ bài hỏi đáp mới chọn câu trả lời');
  if (post.author_contact_id !== me && !isModerator(req, group)) {
    throw new HttpError(403, 'Chỉ người hỏi mới chọn câu trả lời');
  }
  const body = parseBody(z.object({ is_answer: z.boolean() }), req);
  db.transaction(() => {
    db.prepare(`UPDATE feed_comments SET is_answer = 0 WHERE post_id = ?`).run(post.id);
    if (body.is_answer)
      db.prepare(`UPDATE feed_comments SET is_answer = 1 WHERE id = ?`).run(comment.id);
  })();
  res.json({ ok: true });
});

/* ===================== Tep ===================== */

/** Tai tep moi len nhom — thanh tai lieu cua nhom (kho tai lieu cua thanh vien cung thay). */
router.post('/groups/:id/files', upload.single('file'), (req, res) => {
  const file = req.file;
  if (!file) throw new HttpError(400, 'Chưa chọn tệp để tải lên');
  try {
    const me = requireContact(req);
    const group = loadGroup(intParam(String(req.params.id)));
    assertCanView(req, group);
    if (!isMember(group, me) && !isFeedSuperAdmin(req))
      throw new HttpError(403, 'Tham gia nhóm để tải tệp');
    const id = createDocument(file, { owner_contact_id: me, confidentiality: 'internal' });
    db.prepare(`UPDATE documents SET group_id = ? WHERE id = ?`).run(group.id, id);
    res
      .status(201)
      .json(
        db
          .prepare(`SELECT id, name, file_name, mime, size, group_id FROM documents WHERE id = ?`)
          .get(id)
      );
  } catch (error) {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    throw error;
  }
});

/**
 * Tai xuong / xem tep dinh kem QUA BAI VIET. Tep ca nhan (mode view) chi mo duoc
 * theo duong nay; tep trong kho thi phai con thay duoc theo quyen cua chinh tep.
 */
router.get('/attachments/:id/download', (req, res) => {
  const attachment = db
    .prepare(
      `SELECT a.*, d.stored_name, d.file_name, d.mime, d.deleted_at AS doc_deleted
         FROM feed_post_attachments a JOIN documents d ON d.id = a.document_id WHERE a.id = ?`
    )
    .get(intParam(req.params.id)) as
    | {
        post_id: number;
        document_id: number;
        mode: 'view' | 'library';
        stored_name: string;
        file_name: string;
        mime: string;
        doc_deleted: string | null;
      }
    | undefined;
  if (!attachment || attachment.doc_deleted) throw new HttpError(404, 'Không tìm thấy tệp');
  loadPost(req, attachment.post_id);
  if (
    attachment.mode === 'library' &&
    !accessibleLibraryDocs(req, [attachment.document_id]).has(attachment.document_id)
  ) {
    throw new HttpError(404, 'Không tìm thấy tệp');
  }
  const filePath = path.join(FILES_DIR, attachment.stored_name);
  if (!fs.existsSync(filePath)) throw new HttpError(404, 'Tệp không còn trên ổ đĩa');
  res.type(attachment.mime || 'application/octet-stream');
  if (req.query.inline === '1' && /^(image|video|audio)\//.test(attachment.mime ?? '')) {
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.sendFile(filePath);
    return;
  }
  res.download(filePath, attachment.file_name);
});

/** Tab Tai lieu cua nhom: moi tep da dinh kem trong bai + tep tai len nhom. */
router.get('/groups/:id/files', (req, res) => {
  const me = accessOf(req).contactId;
  const group = loadGroup(intParam(req.params.id));
  assertCanView(req, group);
  const visible = postVisibility(req);
  const rows = db
    .prepare(
      `SELECT a.id AS attachment_id, a.mode, a.created_at, d.id AS document_id, d.name, d.file_name,
              d.mime, d.size, d.group_id, d.owner_contact_id, p.id AS post_id,
              substr(p.body, 1, 120) AS post_excerpt, c.full_name AS poster_name
         FROM feed_post_attachments a
         JOIN feed_posts p ON p.id = a.post_id
         JOIN documents d ON d.id = a.document_id
         LEFT JOIN contacts c ON c.id = p.author_contact_id
        WHERE p.group_id = ? AND p.status = 'published' AND d.deleted_at IS NULL AND ${visible.sql}
        ORDER BY a.created_at DESC, a.id DESC LIMIT 500`
    )
    .all(group.id, ...visible.params) as {
    attachment_id: number;
    mode: 'view' | 'library';
    document_id: number;
    name: string;
    file_name: string;
    group_id: number | null;
    owner_contact_id: number | null;
    mime: string | null;
    size: number;
  }[];
  const libraryOk = accessibleLibraryDocs(
    req,
    rows.filter((row) => row.mode === 'library').map((row) => row.document_id)
  );
  res.json(
    rows.map((row) => {
      const accessible = row.mode === 'view' || libraryOk.has(row.document_id);
      return {
        ...row,
        source: row.mode === 'view' ? 'personal' : row.group_id === group.id ? 'group' : 'shared',
        accessible,
        mine: me != null && row.owner_contact_id === me,
        name: accessible ? row.name : 'Tệp bị giới hạn',
        file_name: accessible ? row.file_name : '',
        mime: accessible ? row.mime : null,
      };
    })
  );
});

/**
 * Chon tep de dinh kem:
 *   mine   — tep ca nhan (minh tai len, khong thuoc nhom nao)
 *   shared — tep trong kho minh thay duoc nhung khong phai cua minh, va tep cua nhom minh
 */
router.get('/doc-picker', (req, res) => {
  const me = requireContact(req);
  const source = req.query.source === 'shared' ? 'shared' : 'mine';
  const q = fold(String(req.query.q ?? '').trim());
  const where = ['dc.deleted_at IS NULL'];
  const params: unknown[] = [];
  if (source === 'mine') {
    where.push('dc.owner_contact_id = ?', 'dc.group_id IS NULL');
    params.push(me);
  } else {
    const canDocs = accessOf(req).can('documents', 'read');
    const scope = documentScope(req, 'read');
    const groups = memberGroupsSql(me);
    where.push(
      `(dc.owner_contact_id IS NULL OR dc.owner_contact_id <> ? OR dc.group_id IS NOT NULL)`
    );
    params.push(me);
    if (canDocs && scope.sql) {
      where.push(`(${scope.sql} OR dc.confidentiality = 'public')`);
      params.push(...scope.params);
    } else if (!canDocs) {
      where.push(`(dc.group_id IN (${groups.sql}) OR dc.confidentiality = 'public')`);
      params.push(...groups.params);
    }
  }
  if (q) {
    where.push(`dc.search_text LIKE '%' || ? || '%'`);
    params.push(q);
  }
  res.json(
    db
      .prepare(
        `SELECT dc.id, dc.name, dc.file_name, dc.mime, dc.size, dc.confidentiality, dc.group_id,
                COALESCE(dc.updated_at, dc.created_at) AS updated_at,
                g.name AS group_name, cu.name AS customer_name, d.title AS deal_title,
                k.name AS contract_name, ow.full_name AS owner_name
           FROM documents dc
           LEFT JOIN feed_groups g ON g.id = dc.group_id
           LEFT JOIN customers cu ON cu.id = dc.customer_id
           LEFT JOIN deals d ON d.id = dc.deal_id
           LEFT JOIN contracts k ON k.id = dc.contract_id
           LEFT JOIN contacts ow ON ow.id = dc.owner_contact_id
          WHERE ${where.join(' AND ')}
          ORDER BY COALESCE(dc.updated_at, dc.created_at) DESC, dc.id DESC LIMIT 60`
      )
      .all(...params)
  );
});

/** Tim nguoi de @nhac — thanh vien cua nhom. */
router.get('/groups/:id/mention-candidates', (req, res) => {
  const group = loadGroup(intParam(req.params.id));
  assertCanView(req, group);
  const q = fold(String(req.query.q ?? '').trim());
  res.json(
    groupMembers(group)
      .filter((m) => !q || fold(m.full_name).includes(q))
      .slice(0, 12)
      .map((m) => ({ id: m.contact_id, name: m.full_name, unit: m.unit_name }))
  );
});

/** Nhan su dang lam viec — de them vao nhom tu lap / nhom. Ai dang nhap cung can danh sach nay. */
router.get('/people', (req, res) => {
  const q = fold(String(req.query.q ?? '').trim());
  const rows = db
    .prepare(
      `SELECT c.id, c.full_name AS name, u.name AS unit FROM contacts c
         JOIN users us ON us.contact_id = c.id AND us.is_active = 1
         LEFT JOIN org_units u ON u.id = c.org_unit_id
        ORDER BY c.full_name COLLATE NOCASE`
    )
    .all() as { id: number; name: string; unit: string | null }[];
  res.json(rows.filter((row) => !q || fold(row.name).includes(q)).slice(0, 30));
});

/** Tim ban ghi CRM de gan vao bai — chi trong pham vi nguoi dang. */
router.get('/link-search', (req, res) => {
  const type = String(req.query.type) as LinkType;
  const sources: Record<
    LinkType,
    { table: string; label: string; search: string; sub: string; extra?: string }
  > = {
    customer: {
      table: 'customers x',
      label: 'x.name',
      search: 'x.search_text',
      sub: "''",
      extra: "x.org_kind = 'customer'",
    },
    deal: {
      table: 'deals x LEFT JOIN customers c ON c.id = x.customer_id',
      label: 'x.title',
      search: 'x.search_text',
      sub: "COALESCE(c.name, '')",
    },
    contract: {
      table: 'contracts x LEFT JOIN customers c ON c.id = x.customer_id',
      label: 'x.name',
      search: 'x.search_text',
      sub: "COALESCE(c.name, '')",
    },
    project: {
      table: 'projects x',
      label: 'x.name',
      search: 'x.search_text',
      sub: "COALESCE(x.code, '')",
      extra: 'x.is_archived = 0',
    },
    card: {
      table: 'cards x',
      label: 'x.title',
      search: 'x.search_text',
      sub: "COALESCE(x.due_date, '')",
      extra: 'x.is_archived = 0',
    },
  };
  const source = sources[type];
  if (!source) throw new HttpError(400, 'Loại liên kết không hợp lệ');
  const resource = {
    customer: 'customers',
    deal: 'deals',
    contract: 'contracts',
    project: 'projects',
    card: 'tasks',
  } as const;
  if (!accessOf(req).can(resource[type], 'read')) {
    res.json([]);
    return;
  }
  const q = fold(String(req.query.q ?? '').trim());
  const scope = linkScope(req, type);
  const where = [scope.sql, source.extra, q ? `${source.search} LIKE '%' || ? || '%'` : ''].filter(
    Boolean
  );
  res.json(
    db
      .prepare(
        `SELECT x.id, ${source.label} AS label, ${source.sub} AS sub FROM ${source.table}
          ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY x.id DESC LIMIT 15`
      )
      .all(...scope.params, ...(q ? [q] : []))
  );
});

/** Su kien sap toi trong nhom minh (hoac mot nhom). */
router.get('/events', (req, res) => {
  const me = accessOf(req).contactId;
  const where = [
    `p.kind = 'event'`,
    `p.status = 'published'`,
    `p.deleted_at IS NULL`,
    `COALESCE(p.event_end_at, p.event_start_at) >= ?`,
  ];
  const params: unknown[] = [nowLocal()];
  if (req.query.group_id) {
    const group = loadGroup(intParam(String(req.query.group_id), 'group_id'));
    assertCanView(req, group);
    where.push('p.group_id = ?');
    params.push(group.id);
  } else {
    const groups = memberGroupsSql(me);
    where.push(`p.group_id IN (${groups.sql})`);
    params.push(...groups.params);
  }
  res.json(
    db
      .prepare(
        `SELECT p.id, p.body, p.event_start_at, p.event_end_at, p.event_location, g.id AS group_id, g.name AS group_name,
                (SELECT response FROM feed_event_rsvps r WHERE r.post_id = p.id AND r.contact_id = ?) AS my_response
           FROM feed_posts p JOIN feed_groups g ON g.id = p.group_id
          WHERE ${where.join(' AND ')} ORDER BY p.event_start_at LIMIT 10`
      )
      .all(me ?? 0, ...params)
  );
});

/** Cong viec da tao tu bai viet cua nhom. */
router.get('/groups/:id/tasks', (req, res) => {
  const group = loadGroup(intParam(req.params.id));
  assertCanView(req, group);
  res.json(
    db
      .prepare(
        `SELECT p.id AS post_id, substr(p.body, 1, 120) AS post_excerpt, k.id, k.title, k.status, k.is_done,
                k.due_date, c.full_name AS assignee_name
           FROM feed_posts p JOIN cards k ON k.id = p.task_card_id
           LEFT JOIN contacts c ON c.id = k.assignee_contact_id
          WHERE p.group_id = ? AND p.deleted_at IS NULL
          ORDER BY k.is_done, k.due_date IS NULL, k.due_date, k.id DESC`
      )
      .all(group.id)
  );
});

/* ===================== Thong ke tuong tac ===================== */

/**
 * So lieu tuong tac cua mot nhom trong `days` ngay gan nhat (va ky lien truoc de so
 * sanh). Chi quan tri / kiem duyet nhom xem — danh sach "ai dong gop nhieu" khong
 * phai thu moi thanh vien nen thay ve nhau.
 */
function groupStats(group: GroupRow, days: number) {
  const since = `-${days} days`;
  const before = `-${days * 2} days`;
  const members = groupMembers(group);
  const memberIds = new Set(members.map((m) => m.contact_id));
  const count = (sql: string, ...params: unknown[]) =>
    (db.prepare(sql).get(...params) as { n: number }).n;
  const window = (from: string, to: string | null) => {
    const range = `>= datetime('now','localtime','${from}')${to ? ` AND {col} < datetime('now','localtime','${to}')` : ''}`;
    const where = (col: string) => `${col} ${range.replaceAll('{col}', col)}`;
    return {
      posts: count(
        `SELECT COUNT(*) AS n FROM feed_posts p WHERE p.group_id = ? AND p.status = 'published' AND p.deleted_at IS NULL AND ${where('p.created_at')}`,
        group.id
      ),
      comments: count(
        `SELECT COUNT(*) AS n FROM feed_comments c JOIN feed_posts p ON p.id = c.post_id
          WHERE p.group_id = ? AND p.deleted_at IS NULL AND c.deleted_at IS NULL AND ${where('c.created_at')}`,
        group.id
      ),
      reactions: count(
        `SELECT COUNT(*) AS n FROM feed_post_reactions r JOIN feed_posts p ON p.id = r.post_id
          WHERE p.group_id = ? AND p.deleted_at IS NULL AND ${where('r.created_at')}`,
        group.id
      ),
      active: (
        db
          .prepare(
            `SELECT DISTINCT who FROM (
               SELECT p.author_contact_id AS who FROM feed_posts p
                WHERE p.group_id = ? AND p.status = 'published' AND p.deleted_at IS NULL AND ${where('p.created_at')}
               UNION SELECT c.author_contact_id FROM feed_comments c JOIN feed_posts p ON p.id = c.post_id
                WHERE p.group_id = ? AND c.deleted_at IS NULL AND ${where('c.created_at')}
               UNION SELECT r.contact_id FROM feed_post_reactions r JOIN feed_posts p ON p.id = r.post_id
                WHERE p.group_id = ? AND ${where('r.created_at')}
               UNION SELECT v.contact_id FROM feed_poll_votes v JOIN feed_poll_options o ON o.id = v.option_id
                 JOIN feed_posts p ON p.id = o.post_id
                WHERE p.group_id = ? AND ${where('v.voted_at')}
               UNION SELECT a.contact_id FROM feed_post_acks a JOIN feed_posts p ON p.id = a.post_id
                WHERE p.group_id = ? AND ${where('a.acked_at')}
             ) WHERE who IS NOT NULL`
          )
          .all(group.id, group.id, group.id, group.id, group.id) as { who: number }[]
      ).filter((row) => memberIds.has(row.who)).length,
    };
  };
  const current = window(since, null);
  const previous = window(before, since);

  /* Hoat dong theo ngay (bai + binh luan), du ca ngay trong. */
  const daily = new Map(
    (
      db
        .prepare(
          `SELECT d, SUM(posts) AS posts, SUM(comments) AS comments FROM (
             SELECT date(created_at) AS d, 1 AS posts, 0 AS comments FROM feed_posts
              WHERE group_id = ? AND status = 'published' AND deleted_at IS NULL
                AND created_at >= datetime('now','localtime','${since}')
             UNION ALL
             SELECT date(c.created_at), 0, 1 FROM feed_comments c JOIN feed_posts p ON p.id = c.post_id
              WHERE p.group_id = ? AND p.deleted_at IS NULL AND c.deleted_at IS NULL
                AND c.created_at >= datetime('now','localtime','${since}')
           ) GROUP BY d`
        )
        .all(group.id, group.id) as { d: string; posts: number; comments: number }[]
    ).map((row) => [row.d, row])
  );
  const today = (db.prepare(`SELECT date('now','localtime') AS d`).get() as { d: string }).d;
  const series: { date: string; posts: number; comments: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = (db.prepare(`SELECT date(?, ?) AS d`).get(today, `-${i} days`) as { d: string }).d;
    const row = daily.get(date);
    series.push({ date, posts: row?.posts ?? 0, comments: row?.comments ?? 0 });
  }

  const announcements = db
    .prepare(
      `SELECT p.id, substr(p.body, 1, 100) AS excerpt, p.created_at, p.author_contact_id,
              (SELECT COUNT(*) FROM feed_post_acks a WHERE a.post_id = p.id) AS acks
         FROM feed_posts p
        WHERE p.group_id = ? AND p.requires_ack = 1 AND p.status = 'published' AND p.deleted_at IS NULL
          AND p.created_at >= datetime('now','localtime','${since}')
        ORDER BY p.created_at DESC LIMIT 10`
    )
    .all(group.id) as {
    id: number;
    excerpt: string;
    created_at: string;
    author_contact_id: number | null;
    acks: number;
  }[];

  const questions = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(EXISTS (SELECT 1 FROM feed_comments c WHERE c.post_id = p.id AND c.is_answer = 1 AND c.deleted_at IS NULL)) AS answered,
              SUM(NOT EXISTS (SELECT 1 FROM feed_comments c WHERE c.post_id = p.id AND c.deleted_at IS NULL)) AS no_reply
         FROM feed_posts p
        WHERE p.group_id = ? AND p.kind = 'question' AND p.status = 'published' AND p.deleted_at IS NULL
          AND p.created_at >= datetime('now','localtime','${since}')`
    )
    .get(group.id) as { total: number; answered: number | null; no_reply: number | null };

  const contributors = db
    .prepare(
      `SELECT who AS contact_id, c.full_name, u.name AS unit_name,
              SUM(posts) AS posts, SUM(comments) AS comments FROM (
         SELECT author_contact_id AS who, 1 AS posts, 0 AS comments FROM feed_posts
          WHERE group_id = ? AND status = 'published' AND deleted_at IS NULL
            AND created_at >= datetime('now','localtime','${since}')
         UNION ALL
         SELECT fc.author_contact_id, 0, 1 FROM feed_comments fc JOIN feed_posts p ON p.id = fc.post_id
          WHERE p.group_id = ? AND p.deleted_at IS NULL AND fc.deleted_at IS NULL
            AND fc.created_at >= datetime('now','localtime','${since}')
       ) x JOIN contacts c ON c.id = x.who LEFT JOIN org_units u ON u.id = c.org_unit_id
       GROUP BY who ORDER BY SUM(posts) * 3 + SUM(comments) DESC, c.full_name LIMIT 5`
    )
    .all(group.id, group.id);

  const topPosts = db
    .prepare(
      `SELECT p.id, substr(p.body, 1, 100) AS excerpt, p.kind, c.full_name AS author_name,
              (SELECT COUNT(*) FROM feed_post_reactions r WHERE r.post_id = p.id) AS reactions,
              (SELECT COUNT(*) FROM feed_comments fc WHERE fc.post_id = p.id AND fc.deleted_at IS NULL) AS comments
         FROM feed_posts p LEFT JOIN contacts c ON c.id = p.author_contact_id
        WHERE p.group_id = ? AND p.status = 'published' AND p.deleted_at IS NULL
          AND p.created_at >= datetime('now','localtime','${since}')
        ORDER BY reactions + comments * 2 DESC, p.created_at DESC LIMIT 5`
    )
    .all(group.id);

  const files = count(
    `SELECT COUNT(*) AS n FROM feed_post_attachments a JOIN feed_posts p ON p.id = a.post_id
      WHERE p.group_id = ? AND p.deleted_at IS NULL AND a.created_at >= datetime('now','localtime','${since}')`,
    group.id
  );

  const audience = (authorId: number | null) =>
    Math.max(0, members.length - (authorId != null && memberIds.has(authorId) ? 1 : 0));
  return {
    group: { id: group.id, name: group.name, kind: group.kind, color: group.color },
    days,
    members: members.length,
    current: {
      ...current,
      participation: members.length ? current.active / members.length : 0,
      files,
    },
    previous: {
      ...previous,
      participation: members.length ? previous.active / members.length : 0,
    },
    series,
    announcements: announcements.map((a) => ({
      id: a.id,
      excerpt: a.excerpt,
      created_at: a.created_at,
      acks: a.acks,
      audience: audience(a.author_contact_id),
    })),
    questions: {
      total: questions.total,
      answered: questions.answered ?? 0,
      no_reply: questions.no_reply ?? 0,
    },
    contributors,
    top_posts: topPosts,
  };
}

function statsDays(raw: unknown): number {
  const value = Number(raw ?? 30);
  return [7, 30, 90].includes(value) ? value : 30;
}

router.get('/groups/:id/stats', (req, res) => {
  const group = loadGroup(intParam(req.params.id));
  assertCanView(req, group);
  if (!isModerator(req, group)) {
    throw new HttpError(403, 'Chỉ quản trị và kiểm duyệt nhóm xem được thống kê');
  }
  res.json(groupStats(group, statsDays(req.query.days)));
});

/** Tong quan moi nhom minh quan tri (quan tri he thong: moi nhom dang hoat dong). */
router.get('/stats', (req, res) => {
  ensureAutoGroups();
  const days = statsDays(req.query.days);
  const groups = (
    db.prepare(`SELECT * FROM feed_groups WHERE is_archived = 0 ORDER BY name`).all() as GroupRow[]
  ).filter((group) => isModerator(req, group));
  const rows = groups.map((group) => {
    const stats = groupStats(group, days);
    return {
      group: stats.group,
      members: stats.members,
      posts: stats.current.posts,
      comments: stats.current.comments,
      reactions: stats.current.reactions,
      active: stats.current.active,
      participation: stats.current.participation,
      previous_participation: stats.previous.participation,
      ack_rate:
        stats.announcements.length === 0
          ? null
          : stats.announcements.reduce((sum, a) => sum + a.acks, 0) /
            Math.max(
              1,
              stats.announcements.reduce((sum, a) => sum + a.audience, 0)
            ),
      unanswered: stats.questions.total - stats.questions.answered,
    };
  });
  res.json({ days, groups: rows.sort((a, b) => b.participation - a.participation) });
});

export default router;
