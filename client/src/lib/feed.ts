import { api, qs } from '../api/client';
import { LABEL_PALETTE } from '../theme/palettes';

/* Kieu du lieu va loi goi API cua Bang tin nhom (may chu: server/src/routes/feed.ts). */

export type GroupKind = 'company' | 'unit' | 'project' | 'custom';
export type GroupRole = 'admin' | 'moderator' | 'member';
export type PostKind = 'post' | 'announcement' | 'poll' | 'question' | 'event';
export type Reaction = 'like' | 'love' | 'haha' | 'wow' | 'sad' | 'celebrate';
export type FeedFilter =
  | 'all'
  | 'announcements'
  | 'mentions'
  | 'attachments'
  | 'saved'
  | 'pending'
  | 'mine'
  | 'questions'
  | 'events'
  | 'drafts';
export type LinkType = 'customer' | 'deal' | 'contract' | 'project' | 'card';

export interface NavGroup {
  id: number;
  kind: GroupKind;
  name: string;
  color: string | null;
  visibility: 'public' | 'private';
  unread: number;
  pending: number;
  notify: 'all' | 'mentions' | 'none';
  role: GroupRole | null;
  last_post_at: string | null;
}

export interface FeedNav {
  contact_id: number | null;
  can_admin: boolean;
  groups: NavGroup[];
  counts: { unread: number; ack_pending: number; mentions: number };
}

export interface GroupDetail {
  id: number;
  kind: GroupKind;
  name: string;
  description: string;
  color: string | null;
  visibility: 'public' | 'private';
  posting: 'all' | 'admins';
  require_approval: boolean;
  is_archived: boolean;
  org_unit_id: number | null;
  project_id: number | null;
  created_at: string;
  role: GroupRole | null;
  is_member: boolean;
  notify: 'all' | 'mentions' | 'none';
  member_count: number;
  admins: { id: number; name: string }[];
  counts: { posts: number; files: number; pending: number };
  can_post: boolean;
  can_join: boolean;
  can_leave: boolean;
}

export interface PostAttachment {
  id: number;
  document_id: number;
  mode: 'view' | 'library';
  source: 'personal' | 'group' | 'shared';
  accessible: boolean;
  name: string;
  file_name: string;
  mime: string | null;
  size: number;
  is_image: boolean;
}

export interface PostLink {
  type: LinkType;
  id: number;
  label: string;
  sub: string;
  accessible: boolean;
}

export interface FeedPost {
  id: number;
  group: { id: number; name: string; kind: GroupKind; color: string | null };
  author: { id: number; name: string; title: string | null; unit: string | null } | null;
  kind: PostKind;
  body: string;
  status: 'published' | 'pending' | 'rejected' | 'draft' | 'scheduled';
  /** Gio hen dang (bai hen gio) — 'YYYY-MM-DDTHH:mm'. */
  publish_at: string | null;
  is_pinned: boolean;
  created_at: string;
  edited_at: string | null;
  task_card_id: number | null;
  reactions: {
    total: number;
    counts: Partial<Record<Reaction, number>>;
    mine: Reaction | null;
    recent_names: string[];
  };
  comment_count: number;
  attachments: PostAttachment[];
  links: PostLink[];
  poll: {
    multi: boolean;
    closes_at: string | null;
    closed: boolean;
    voters: number;
    options: { id: number; label: string; votes: number; mine: boolean }[];
  } | null;
  event: {
    start_at: string | null;
    end_at: string | null;
    location: string;
    going: number;
    maybe: number;
    mine: 'going' | 'maybe' | 'declined' | null;
  } | null;
  ack: { count: number; mine: boolean } | null;
  answer_comment_id: number | null;
  saved: boolean;
  mentioned_me: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_moderate: boolean;
}

export interface FeedComment {
  id: number;
  parent_id: number | null;
  body: string;
  is_answer: boolean;
  created_at: string;
  edited_at: string | null;
  author_contact_id: number | null;
  author_name: string | null;
  author_unit: string | null;
  likes: number;
  liked: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

export interface GroupMember {
  contact_id: number;
  full_name: string;
  title: string | null;
  unit_name: string | null;
  role: GroupRole;
  source: 'auto' | 'manual';
}

export interface GroupFile {
  attachment_id: number;
  mode: 'view' | 'library';
  source: 'personal' | 'group' | 'shared';
  accessible: boolean;
  mine: boolean;
  created_at: string;
  document_id: number;
  name: string;
  file_name: string;
  mime: string | null;
  size: number;
  post_id: number;
  post_excerpt: string;
  poster_name: string | null;
}

export interface PickerDoc {
  id: number;
  name: string;
  file_name: string;
  mime: string | null;
  size: number;
  confidentiality: string;
  group_id: number | null;
  group_name: string | null;
  customer_name: string | null;
  deal_title: string | null;
  contract_name: string | null;
  owner_name: string | null;
  updated_at: string;
}

export interface FeedEvent {
  id: number;
  body: string;
  event_start_at: string;
  event_end_at: string | null;
  event_location: string;
  group_id: number;
  group_name: string;
  my_response: 'going' | 'maybe' | 'declined' | null;
}

export interface GroupTask {
  post_id: number;
  post_excerpt: string;
  id: number;
  title: string;
  is_done: number;
  due_date: string | null;
  assignee_name: string | null;
}

export interface DiscoverGroup {
  id: number;
  name: string;
  description: string;
  color: string | null;
  member_count: number;
  post_count: number;
}

export interface PostTemplate {
  id: number;
  owner_contact_id: number | null;
  group_id: number | null;
  name: string;
  kind: PostKind;
  body: string;
  scope: 'mine' | 'group';
  can_edit: boolean;
}

/** Mau co san — dung ngay khong can ai luu. */
export const BUILTIN_TEMPLATES: { name: string; kind: PostKind; body: string }[] = [
  {
    name: 'Báo cáo tuần',
    kind: 'post',
    body: 'Báo cáo tuần [từ ngày – đến ngày]\n\nĐã xong:\n- \n\nĐang làm:\n- \n\nVướng mắc / cần hỗ trợ:\n- \n\nKế hoạch tuần tới:\n- ',
  },
  {
    name: 'Biên bản họp',
    kind: 'post',
    body: 'Biên bản họp [chủ đề] — [ngày giờ]\n\nThành phần: \n\nNội dung chính:\n1. \n\nKết luận:\n- \n\nViệc cần làm (ai — hạn):\n- ',
  },
  {
    name: 'Thông báo nội bộ',
    kind: 'announcement',
    body: '[Tiêu đề thông báo]\n\nNội dung: \nÁp dụng từ: \nĐầu mối liên hệ: ',
  },
  {
    name: 'Bàn giao ca / công việc',
    kind: 'post',
    body: 'Bàn giao [công việc / ca] cho @\n\nTình trạng hiện tại:\n- \n\nViệc còn dở:\n- \n\nLưu ý:\n- ',
  },
];

export interface PostDraft {
  group_id: number;
  kind: PostKind;
  body: string;
  requires_ack?: boolean;
  attachments: { document_id: number; mode: 'view' | 'copy' | 'library' }[];
  links: { entity_type: LinkType; entity_id: number }[];
  mention_ids: number[];
  poll?: { options: string[]; multi: boolean; closes_at?: string | null };
  event?: { start_at: string; end_at?: string | null; location: string };
  mode?: 'publish' | 'draft' | 'schedule';
  publish_at?: string | null;
}

export interface StatsWindow {
  posts: number;
  comments: number;
  reactions: number;
  active: number;
  participation: number;
}

export interface GroupStats {
  group: { id: number; name: string; kind: GroupKind; color: string | null };
  days: number;
  members: number;
  current: StatsWindow & { files: number };
  previous: StatsWindow;
  series: { date: string; posts: number; comments: number }[];
  announcements: {
    id: number;
    excerpt: string;
    created_at: string;
    acks: number;
    audience: number;
  }[];
  questions: { total: number; answered: number; no_reply: number };
  contributors: {
    contact_id: number;
    full_name: string;
    unit_name: string | null;
    posts: number;
    comments: number;
  }[];
  top_posts: {
    id: number;
    excerpt: string;
    kind: PostKind;
    author_name: string | null;
    reactions: number;
    comments: number;
  }[];
}

export interface StatsOverviewRow {
  group: { id: number; name: string; kind: GroupKind; color: string | null };
  members: number;
  posts: number;
  comments: number;
  reactions: number;
  active: number;
  participation: number;
  previous_participation: number;
  ack_rate: number | null;
  unanswered: number;
}

export const feedKeys = {
  all: ['feed'] as const,
  nav: ['feed', 'nav'] as const,
  group: (id: number) => ['feed', 'group', id] as const,
  posts: (scope: string, filter: FeedFilter, q: string) =>
    ['feed', 'posts', scope, filter, q] as const,
  post: (id: number) => ['feed', 'post', id] as const,
  comments: (postId: number) => ['feed', 'comments', postId] as const,
  files: (groupId: number) => ['feed', 'files', groupId] as const,
  members: (groupId: number) => ['feed', 'members', groupId] as const,
  events: (groupId?: number) => ['feed', 'events', groupId ?? 0] as const,
  tasks: (groupId: number) => ['feed', 'tasks', groupId] as const,
  discover: ['feed', 'discover'] as const,
  stats: (groupId: number, days: number) => ['feed', 'stats', groupId, days] as const,
  overview: (days: number) => ['feed', 'stats', 'all', days] as const,
};

export const feedApi = {
  nav: () => api.get<FeedNav>('/api/feed/nav'),
  group: (id: number) => api.get<GroupDetail>(`/api/feed/groups/${id}`),
  posts: (params: {
    group_id?: number;
    filter: FeedFilter;
    q?: string;
    cursor?: string | null;
    /* Trao doi noi bo cua mot ban ghi CRM (v70). */
    link_type?: LinkType;
    link_id?: number;
    include_related?: 1;
  }) =>
    api.get<{ items: FeedPost[]; next_cursor: string | null }>(
      `/api/feed/posts${qs({ ...params, limit: 15 })}`
    ),
  post: (id: number) => api.get<FeedPost>(`/api/feed/posts/${id}`),
  createPost: (draft: PostDraft) => api.post<FeedPost>('/api/feed/posts', draft),
  updatePost: (id: number, body: Record<string, unknown>) =>
    api.patch<FeedPost>(`/api/feed/posts/${id}`, body),
  deletePost: (id: number) => api.del<{ ok: true }>(`/api/feed/posts/${id}`),
  removeAttachment: (postId: number, attachmentId: number) =>
    api.del<FeedPost>(`/api/feed/posts/${postId}/attachments/${attachmentId}`),
  react: (id: number, reaction: Reaction | null) =>
    api.put<FeedPost>(`/api/feed/posts/${id}/reaction`, { reaction }),
  ack: (id: number) => api.post<FeedPost>(`/api/feed/posts/${id}/ack`),
  publishNow: (id: number) => api.post<FeedPost>(`/api/feed/posts/${id}/publish`),
  schedule: (id: number, publishAt: string | null) =>
    api.post<FeedPost>(`/api/feed/posts/${id}/schedule`, { publish_at: publishAt }),
  templates: (groupId?: number | null) =>
    api.get<PostTemplate[]>(`/api/feed/templates${qs({ group_id: groupId ?? undefined })}`),
  saveTemplate: (body: { name: string; kind: PostKind; body: string; group_id?: number | null }) =>
    api.post<PostTemplate>('/api/feed/templates', body),
  deleteTemplate: (id: number) => api.del(`/api/feed/templates/${id}`),
  seen: (id: number) => api.post<{ ok: true }>(`/api/feed/posts/${id}/seen`),
  acks: (id: number) =>
    api.get<
      { contact_id: number; full_name: string; unit_name: string | null; acked_at: string | null }[]
    >(`/api/feed/posts/${id}/acks`),
  save: (id: number, saved: boolean) => api.put<FeedPost>(`/api/feed/posts/${id}/save`, { saved }),
  vote: (id: number, optionIds: number[]) =>
    api.put<FeedPost>(`/api/feed/posts/${id}/vote`, { option_ids: optionIds }),
  rsvp: (id: number, response: 'going' | 'maybe' | 'declined' | null) =>
    api.put<FeedPost>(`/api/feed/posts/${id}/rsvp`, { response }),
  pin: (id: number, pinned: boolean) => api.post<FeedPost>(`/api/feed/posts/${id}/pin`, { pinned }),
  moderate: (id: number, action: 'approve' | 'reject') =>
    api.post<FeedPost>(`/api/feed/posts/${id}/moderate`, { action }),
  addToCalendar: (id: number) => api.post<{ id: number }>(`/api/feed/posts/${id}/calendar`),
  createTask: (
    id: number,
    body: { title: string; assignee_contact_id?: number | null; due_date?: string | null }
  ) => api.post<{ card: { id: number }; post: FeedPost }>(`/api/feed/posts/${id}/task`, body),
  comments: (postId: number) => api.get<FeedComment[]>(`/api/feed/posts/${postId}/comments`),
  addComment: (
    postId: number,
    body: { body: string; parent_id?: number | null; mention_ids: number[] }
  ) => api.post<{ id: number }>(`/api/feed/posts/${postId}/comments`, body),
  editComment: (id: number, body: string) => api.patch(`/api/feed/comments/${id}`, { body }),
  deleteComment: (id: number) => api.del(`/api/feed/comments/${id}`),
  likeComment: (id: number, liked: boolean) => api.put(`/api/feed/comments/${id}/like`, { liked }),
  markAnswer: (id: number, isAnswer: boolean) =>
    api.post(`/api/feed/comments/${id}/answer`, { is_answer: isAnswer }),
  files: (groupId: number) => api.get<GroupFile[]>(`/api/feed/groups/${groupId}/files`),
  uploadFile: (groupId: number, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.postForm<{ id: number; name: string; mime: string | null; size: number }>(
      `/api/feed/groups/${groupId}/files`,
      form
    );
  },
  docPicker: (source: 'mine' | 'shared', q: string) =>
    api.get<PickerDoc[]>(`/api/feed/doc-picker${qs({ source, q })}`),
  mentionCandidates: (groupId: number, q: string) =>
    api.get<{ id: number; name: string; unit: string | null }[]>(
      `/api/feed/groups/${groupId}/mention-candidates${qs({ q })}`
    ),
  people: (q: string) =>
    api.get<{ id: number; name: string; unit: string | null }[]>(`/api/feed/people${qs({ q })}`),
  linkSearch: (type: LinkType, q: string) =>
    api.get<{ id: number; label: string; sub: string }[]>(
      `/api/feed/link-search${qs({ type, q })}`
    ),
  members: (groupId: number) => api.get<GroupMember[]>(`/api/feed/groups/${groupId}/members`),
  addMembers: (groupId: number, contactIds: number[], role?: GroupRole) =>
    api.post<GroupMember[]>(`/api/feed/groups/${groupId}/members`, {
      contact_ids: contactIds,
      role,
    }),
  setRole: (groupId: number, contactId: number, role: GroupRole) =>
    api.patch<GroupMember[]>(`/api/feed/groups/${groupId}/members/${contactId}`, { role }),
  removeMember: (groupId: number, contactId: number) =>
    api.del<{ ok: true; still_member: boolean }>(
      `/api/feed/groups/${groupId}/members/${contactId}`
    ),
  visit: (groupId: number, notify?: 'all' | 'mentions' | 'none') =>
    api.put(`/api/feed/groups/${groupId}/visit`, notify ? { notify } : {}),
  createGroup: (body: {
    name: string;
    description?: string;
    color?: string | null;
    visibility: 'public' | 'private';
    posting?: 'all' | 'admins';
    require_approval?: boolean;
    member_ids?: number[];
  }) => api.post<GroupDetail>('/api/feed/groups', body),
  updateGroup: (id: number, body: Record<string, unknown>) =>
    api.patch<GroupDetail>(`/api/feed/groups/${id}`, body),
  archiveGroup: (id: number) => api.del(`/api/feed/groups/${id}`),
  join: (id: number) => api.post<GroupDetail>(`/api/feed/groups/${id}/join`),
  leave: (id: number) => api.post(`/api/feed/groups/${id}/leave`),
  discover: () => api.get<DiscoverGroup[]>('/api/feed/groups/discover'),
  groupStats: (id: number, days: number) =>
    api.get<GroupStats>(`/api/feed/groups/${id}/stats${qs({ days })}`),
  statsOverview: (days: number) =>
    api.get<{ days: number; groups: StatsOverviewRow[] }>(`/api/feed/stats${qs({ days })}`),
  events: (groupId?: number) =>
    api.get<FeedEvent[]>(`/api/feed/events${qs({ group_id: groupId })}`),
  tasks: (groupId: number) => api.get<GroupTask[]>(`/api/feed/groups/${groupId}/tasks`),
};

export const attachmentUrl = (id: number, inline = false) =>
  `/api/feed/attachments/${id}/download${inline ? '?inline=1' : ''}`;

export const GROUP_KIND_LABEL: Record<GroupKind, string> = {
  company: 'Công ty',
  unit: 'Phòng ban',
  project: 'Dự án',
  custom: 'Nhóm tự lập',
};

export const SOURCE_LABEL: Record<PostAttachment['source'], string> = {
  personal: 'Cá nhân',
  group: 'Của nhóm',
  shared: 'Chung',
};

export const REACTIONS: { key: Reaction; label: string; glyph: string }[] = [
  { key: 'like', label: 'Thích', glyph: '👍' },
  { key: 'love', label: 'Yêu thích', glyph: '❤️' },
  { key: 'celebrate', label: 'Chúc mừng', glyph: '🎉' },
  { key: 'haha', label: 'Haha', glyph: '😄' },
  { key: 'wow', label: 'Ngạc nhiên', glyph: '😮' },
  { key: 'sad', label: 'Buồn', glyph: '😢' },
];

export const LINK_TYPE_LABEL: Record<LinkType, string> = {
  customer: 'Khách hàng',
  deal: 'Cơ hội',
  contract: 'Hợp đồng',
  project: 'Dự án',
  card: 'Công việc',
};

export function linkHref(link: { type: LinkType; id: number }): string | null {
  switch (link.type) {
    case 'customer':
      return `/customers/${link.id}`;
    case 'deal':
      return `/deals/${link.id}`;
    case 'contract':
      return `/contracts?focus=${link.id}`;
    case 'project':
      return `/projects/${link.id}`;
    default:
      return null;
  }
}

/** Chu cai dau cua ten (toi da 2) — anh dai dien chu. */
export function initials(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[words.length - 2][0] + words[words.length - 1][0]).toUpperCase();
}

/** Mau on dinh theo id — de mot nguoi / mot nhom luon cung mot mau (bang mau nhan chung). */
export function colorFor(id: number, explicit?: string | null): string {
  return explicit || LABEL_PALETTE[Math.abs(id) % (LABEL_PALETTE.length - 1)];
}

/** "2 giờ trước", "Hôm qua 14:05", "12/10 09:00". Nhan chuoi 'YYYY-MM-DD HH:MM:SS' gio dia phuong. */
export function relativeTime(value: string, now = new Date()): string {
  const date = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return value;
  const diff = (now.getTime() - date.getTime()) / 1000;
  if (diff < 60) return 'Vừa xong';
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400 && now.getDate() === date.getDate())
    return `${Math.floor(diff / 3600)} giờ trước`;
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (yesterday.toDateString() === date.toDateString()) return `Hôm qua ${hh}:${mm}`;
  const dd = String(date.getDate()).padStart(2, '0');
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const sameYear = date.getFullYear() === now.getFullYear();
  return `${dd}/${mo}${sameYear ? '' : `/${date.getFullYear()}`} ${hh}:${mm}`;
}

export function formatEventTime(start: string | null, end: string | null): string {
  if (!start) return '';
  const [date, time] = start.split('T');
  const [y, m, d] = date.split('-');
  const endTime = end
    ? end.split('T')[0] === date
      ? end.split('T')[1]
      : end.replace('T', ' ')
    : '';
  return `${d}/${m}/${y} · ${time}${endTime ? ` – ${endTime}` : ''}`;
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

const P = LABEL_PALETTE;
export function fileBadge(name: string, mime: string | null): { label: string; color: string } {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return { label: 'PDF', color: P[3] };
  if (['xls', 'xlsx', 'csv'].includes(ext)) return { label: 'XLS', color: P[0] };
  if (['doc', 'docx', 'txt'].includes(ext))
    return { label: ext === 'txt' ? 'TXT' : 'DOC', color: P[5] };
  if (['ppt', 'pptx'].includes(ext)) return { label: 'PPT', color: P[2] };
  if (/^image\//.test(mime ?? '')) return { label: 'ẢNH', color: P[6] };
  if (/^(video|audio)\//.test(mime ?? '')) return { label: 'MEDIA', color: P[4] };
  if (ext === 'zip') return { label: 'ZIP', color: P[9] };
  return { label: (ext || 'TỆP').slice(0, 4).toUpperCase(), color: P[9] };
}
