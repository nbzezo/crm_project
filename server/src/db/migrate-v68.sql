/* v68: Bang tin nhom (1.33.0) — trao doi thong tin cua cong ty, phong ban, du an.

   Ten bang mang tien to `feed_` chu khong dung `groups`: GROUPS la tu khoa cua
   SQLite (khung cua so) va mot ten nhu vay chi cho de viet sai cau truy van.

   Bon loai nhom:
     company — Toan cong ty, moi nhan su co tai khoan.
     unit    — mot don vi trong so do to chuc; thanh vien la nhan su thuoc ca cay
               don vi do (Khoi thay ca cac Phong ben duoi).
     project — mot du an; thanh vien la chu du an va nguoi duoc giao viec trong du an.
     custom  — nhom tu lap; thanh vien la nhung dong trong feed_group_members.
   Ba loai dau tu dong theo so do to chuc / du an (services/feedService.ts tinh
   khi doc), nen chuyen phong hay roi du an la doi nhom ngay, khong ai phai sua tay.
   feed_group_members voi ba loai do chi giu NGOAI LE: them nguoi ngoai, nang vai tro.

   Dinh kem tep dung lai bang `documents`:
     view    — tep CA NHAN cua nguoi dang, cho thanh vien nhom xem/tai QUA BAI VIET.
               Tep van thuoc nguoi dang va KHONG hien trong kho tai lieu cua ho.
               Go dinh kem hoac xoa bai la thu hoi.
     library — tep trong kho: tep chung nguoi dang thay duoc, ban sao vao nhom, hoac
               tep moi tai len nhom (`documents.group_id`). Ai thay thi theo quyen
               cua chinh tep (lib/documentScope.ts, them nhanh "tep cua nhom minh"). */

CREATE TABLE feed_groups (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('company','unit','project','custom')),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  color TEXT,
  org_unit_id INTEGER REFERENCES org_units(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  /* Chi co nghia voi nhom tu lap: `private` thi nguoi ngoai khong thay nhom. */
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private')),
  /* `admins`: chi quan tri nhom dang bai (vd. kenh thong bao). */
  posting TEXT NOT NULL DEFAULT 'all' CHECK (posting IN ('all','admins')),
  require_approval INTEGER NOT NULL DEFAULT 0 CHECK (require_approval IN (0,1)),
  created_by_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  CHECK ((kind = 'unit') = (org_unit_id IS NOT NULL)),
  CHECK ((kind = 'project') = (project_id IS NOT NULL))
);
CREATE UNIQUE INDEX idx_feed_groups_company ON feed_groups(kind) WHERE kind = 'company';
CREATE UNIQUE INDEX idx_feed_groups_unit ON feed_groups(org_unit_id) WHERE org_unit_id IS NOT NULL;
CREATE UNIQUE INDEX idx_feed_groups_project ON feed_groups(project_id) WHERE project_id IS NOT NULL;

CREATE TABLE feed_group_members (
  group_id INTEGER NOT NULL REFERENCES feed_groups(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','moderator','member')),
  joined_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (group_id, contact_id)
);
CREATE INDEX idx_feed_group_members_contact ON feed_group_members(contact_id);

/* Trang thai rieng cua tung nguoi voi tung nhom: lan xem cuoi (dem bai chua doc)
   va muc thong bao. Khong phai du lieu nghiep vu. */
CREATE TABLE feed_visits (
  group_id INTEGER NOT NULL REFERENCES feed_groups(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  last_seen_at TEXT,
  notify TEXT NOT NULL DEFAULT 'all' CHECK (notify IN ('all','mentions','none')),
  PRIMARY KEY (group_id, contact_id)
);

CREATE TABLE feed_posts (
  id INTEGER PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES feed_groups(id) ON DELETE CASCADE,
  author_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'post'
    CHECK (kind IN ('post','announcement','poll','question','event')),
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','pending','rejected')),
  is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0,1)),
  requires_ack INTEGER NOT NULL DEFAULT 0 CHECK (requires_ack IN (0,1)),
  poll_multi INTEGER NOT NULL DEFAULT 0 CHECK (poll_multi IN (0,1)),
  poll_closes_at TEXT,
  event_start_at TEXT,
  event_end_at TEXT,
  event_location TEXT NOT NULL DEFAULT '',
  /* Cong viec tao tu bai viet gan nhat — de bai hien "Đã tạo công việc". */
  task_card_id INTEGER REFERENCES cards(id) ON DELETE SET NULL,
  search_text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  edited_at TEXT,
  deleted_at TEXT,
  deleted_by_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL
);
CREATE INDEX idx_feed_posts_group ON feed_posts(group_id, status, created_at DESC);
CREATE INDEX idx_feed_posts_author ON feed_posts(author_contact_id, created_at DESC);
CREATE INDEX idx_feed_posts_event ON feed_posts(event_start_at) WHERE kind = 'event';

CREATE TABLE feed_post_attachments (
  id INTEGER PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('view','library')),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (post_id, document_id)
);
CREATE INDEX idx_feed_post_attachments_document ON feed_post_attachments(document_id);

CREATE TABLE feed_post_links (
  post_id INTEGER NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('customer','deal','contract','project','card')),
  entity_id INTEGER NOT NULL,
  PRIMARY KEY (post_id, entity_type, entity_id)
);

CREATE TABLE feed_post_reactions (
  post_id INTEGER NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL DEFAULT 'like'
    CHECK (reaction IN ('like','love','haha','wow','sad','celebrate')),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (post_id, contact_id)
);

CREATE TABLE feed_comments (
  id INTEGER PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  parent_id INTEGER REFERENCES feed_comments(id) ON DELETE CASCADE,
  author_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  is_answer INTEGER NOT NULL DEFAULT 0 CHECK (is_answer IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  edited_at TEXT,
  deleted_at TEXT
);
CREATE INDEX idx_feed_comments_post ON feed_comments(post_id, created_at);

CREATE TABLE feed_comment_likes (
  comment_id INTEGER NOT NULL REFERENCES feed_comments(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  PRIMARY KEY (comment_id, contact_id)
);

CREATE TABLE feed_mentions (
  id INTEGER PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  comment_id INTEGER REFERENCES feed_comments(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_feed_mentions_contact ON feed_mentions(contact_id, created_at DESC);

CREATE TABLE feed_post_acks (
  post_id INTEGER NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  acked_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (post_id, contact_id)
);

CREATE TABLE feed_post_saves (
  post_id INTEGER NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  saved_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (post_id, contact_id)
);

CREATE TABLE feed_poll_options (
  id INTEGER PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_feed_poll_options_post ON feed_poll_options(post_id, position);

CREATE TABLE feed_poll_votes (
  option_id INTEGER NOT NULL REFERENCES feed_poll_options(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  voted_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (option_id, contact_id)
);

CREATE TABLE feed_event_rsvps (
  post_id INTEGER NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  response TEXT NOT NULL CHECK (response IN ('going','maybe','declined')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (post_id, contact_id)
);

ALTER TABLE documents ADD COLUMN group_id INTEGER REFERENCES feed_groups(id) ON DELETE SET NULL;
CREATE INDEX idx_documents_group ON documents(group_id) WHERE group_id IS NOT NULL;
