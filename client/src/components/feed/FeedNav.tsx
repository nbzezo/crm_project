import { useState } from 'react';
import { NavLink } from 'react-router';
import {
  BarChart3,
  Bell,
  Bookmark,
  CalendarDays,
  ChevronLeft,
  Compass,
  FileText,
  Home,
  ListChecks,
  Megaphone,
  MessagesSquare,
  Search,
  Settings2,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { focusRing } from '../common/ui';
import type { FeedNav as FeedNavData, GroupDetail, GroupKind, NavGroup } from '../../lib/feed';
import { GroupIcon } from './FeedBits';

/*
 * Cot menu thu hai cua Bang tin — mo ra canh cot dieu huong chinh, cung kieu cot
 * muc cua trang Cai dat. O trang chu: loi tat + nhom cua toi theo loai. Trong mot
 * nhom: cac muc cua nhom do.
 */

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-11 items-center gap-2.5 rounded-control px-2.5 text-sm transition fine:min-h-9 ${focusRing} ${
    isActive ? 'bg-tr-primary/10 font-semibold text-tr-primary' : 'text-tr-text hover:bg-tr-hover'
  }`;

function Count({ value, tone = 'primary' }: { value: number; tone?: 'primary' | 'warning' }) {
  if (!value) return null;
  return (
    <span
      className={`ml-auto min-w-5 rounded-full px-1.5 text-center text-xs font-semibold ${
        tone === 'primary' ? 'bg-tr-primary text-tr-on-primary' : 'bg-tr-warning/30 text-tr-text'
      }`}
    >
      {value > 99 ? '99+' : value}
    </span>
  );
}

const SECTIONS: { kind: GroupKind; label: string }[] = [
  { kind: 'company', label: 'Công ty' },
  { kind: 'unit', label: 'Phòng ban' },
  { kind: 'project', label: 'Dự án' },
  { kind: 'custom', label: 'Nhóm tự lập' },
];

export function FeedHomeNav({
  nav,
  onCreateGroup,
}: {
  nav: FeedNavData | undefined;
  onCreateGroup: () => void;
}) {
  const [query, setQuery] = useState('');
  const groups = (nav?.groups ?? []).filter(
    (g) => !query.trim() || g.name.toLowerCase().includes(query.trim().toLowerCase())
  );
  return (
    <nav aria-label="Menu bảng tin" className="flex flex-col gap-0.5">
      <p className="tr-display mb-3 px-2.5 text-xl font-bold tracking-[-0.01em] text-tr-text">
        Bảng tin
      </p>
      <label className="mb-3 flex h-10 items-center gap-2 rounded-control border border-tr-border bg-tr-card px-2.5 focus-within:outline-2 focus-within:outline-tr-primary fine:h-9">
        <Search size={15} className="text-tr-muted" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Tìm nhóm…"
          aria-label="Tìm nhóm"
          className="min-w-0 flex-1 bg-transparent text-sm text-tr-text outline-none placeholder:text-tr-muted"
        />
      </label>
      <NavLink to="/feed" end className={linkClass}>
        <Home size={16} aria-hidden="true" /> Trang chủ bảng tin
        <Count value={nav?.counts.unread ?? 0} />
      </NavLink>
      <NavLink to="/feed/announcements" className={linkClass}>
        <Megaphone size={16} aria-hidden="true" /> Thông báo cần xác nhận
        <Count value={nav?.counts.ack_pending ?? 0} tone="warning" />
      </NavLink>
      <NavLink to="/feed/mentions" className={linkClass}>
        <Bell size={16} aria-hidden="true" /> Nhắc đến tôi
        <Count value={nav?.counts.mentions ?? 0} tone="warning" />
      </NavLink>
      <NavLink to="/feed/saved" className={linkClass}>
        <Bookmark size={16} aria-hidden="true" /> Bài viết đã lưu
      </NavLink>
      <NavLink to="/feed/explore" className={linkClass}>
        <Compass size={16} aria-hidden="true" /> Khám phá nhóm
      </NavLink>
      {(nav?.can_admin ||
        nav?.groups.some((g) => g.role === 'admin' || g.role === 'moderator')) && (
        <NavLink to="/feed/insights" className={linkClass}>
          <BarChart3 size={16} aria-hidden="true" /> Thống kê nhóm
        </NavLink>
      )}

      {SECTIONS.map((section) => {
        const items = groups.filter((g) => g.kind === section.kind);
        if (items.length === 0) return null;
        return (
          <div key={section.kind} className="mt-3">
            <div className="px-2.5 pb-1 text-xs font-semibold text-tr-muted">{section.label}</div>
            {items.map((group) => (
              <GroupLink key={group.id} group={group} />
            ))}
          </div>
        );
      })}
      <button
        type="button"
        onClick={onCreateGroup}
        className={`mt-2 flex min-h-11 items-center gap-2.5 rounded-control px-2.5 text-left text-sm font-medium text-tr-primary hover:bg-tr-hover fine:min-h-9 ${focusRing}`}
      >
        + Tạo nhóm mới
      </button>
    </nav>
  );
}

function GroupLink({ group }: { group: NavGroup }) {
  return (
    <NavLink to={`/feed/groups/${group.id}`} className={linkClass}>
      <GroupIcon id={group.id} name={group.name} color={group.color} size={22} />
      <span className="min-w-0 flex-1 truncate">{group.name}</span>
      {group.pending > 0 && (
        <span className="text-xs font-semibold text-tr-warning" title="Bài chờ duyệt">
          {group.pending} chờ
        </span>
      )}
      <Count value={group.unread} />
    </NavLink>
  );
}

export type GroupTab =
  | 'posts'
  | 'announcements'
  | 'files'
  | 'events'
  | 'members'
  | 'tasks'
  | 'pending'
  | 'stats'
  | 'settings';

export function FeedGroupNav({ group }: { group: GroupDetail }) {
  const base = `/feed/groups/${group.id}`;
  const moderator = group.role === 'admin' || group.role === 'moderator';
  const items: { to: string; label: string; icon: typeof Home; count?: number; end?: boolean }[] = [
    { to: base, label: 'Thảo luận', icon: MessagesSquare, end: true },
    { to: `${base}/announcements`, label: 'Thông báo', icon: Megaphone },
    { to: `${base}/files`, label: 'Tài liệu', icon: FileText, count: group.counts.files },
    { to: `${base}/events`, label: 'Sự kiện', icon: CalendarDays },
    { to: `${base}/members`, label: 'Thành viên', icon: Users, count: group.member_count },
    { to: `${base}/tasks`, label: 'Công việc từ bài viết', icon: ListChecks },
  ];
  return (
    <nav aria-label={`Menu nhóm ${group.name}`} className="flex flex-col gap-0.5">
      <NavLink
        to="/feed"
        end
        className={`mb-2 flex min-h-11 items-center gap-1 rounded-control px-1.5 text-sm font-medium text-tr-primary hover:bg-tr-hover fine:min-h-9 ${focusRing}`}
      >
        <ChevronLeft size={16} aria-hidden="true" /> Bảng tin
      </NavLink>
      <div className="mb-3 flex items-center gap-2.5 px-1.5">
        <GroupIcon id={group.id} name={group.name} color={group.color} size={40} />
        <div className="min-w-0">
          <div className="truncate text-base font-bold text-tr-text">{group.name}</div>
          <div className="text-xs text-tr-subtle">
            {group.kind === 'company'
              ? 'Toàn công ty'
              : group.kind === 'unit'
                ? 'Nhóm phòng ban'
                : group.kind === 'project'
                  ? 'Nhóm dự án'
                  : group.visibility === 'private'
                    ? 'Nhóm kín'
                    : 'Nhóm công khai'}{' '}
            · {group.member_count} thành viên
          </div>
        </div>
      </div>
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
          <item.icon size={16} aria-hidden="true" />
          <span className="flex-1">{item.label}</span>
          {item.count ? <span className="text-xs text-tr-muted">{item.count}</span> : null}
        </NavLink>
      ))}
      {moderator && (
        <>
          <div className="mt-3 px-2.5 pb-1 text-xs font-semibold text-tr-muted">Quản trị nhóm</div>
          <NavLink to={`${base}/pending`} className={linkClass}>
            <ShieldCheck size={16} aria-hidden="true" /> Bài chờ duyệt
            <Count value={group.counts.pending} tone="warning" />
          </NavLink>
          <NavLink to={`${base}/stats`} className={linkClass}>
            <BarChart3 size={16} aria-hidden="true" /> Thống kê tương tác
          </NavLink>
          {group.role === 'admin' && (
            <NavLink to={`${base}/settings`} className={linkClass}>
              <Settings2 size={16} aria-hidden="true" /> Cài đặt nhóm
            </NavLink>
          )}
        </>
      )}
    </nav>
  );
}
