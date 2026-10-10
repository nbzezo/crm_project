import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, LayoutList, Search } from 'lucide-react';
import { Button, EmptyState, ErrorState, Select, focusRing } from '../components/common/ui';
import { Tabs } from '../components/common/Tabs';
import { LoadMoreSentinel } from '../components/common/LoadMoreSentinel';
import { useMediaQuery } from '../lib/useMediaQuery';
import { useUiStore } from '../stores/uiStore';
import { feedApi, feedKeys, type FeedFilter, type GroupDetail } from '../lib/feed';
import { FeedGroupNav, FeedHomeNav, type GroupTab } from '../components/feed/FeedNav';
import { Composer } from '../components/feed/Composer';
import { PostCard } from '../components/feed/PostCard';
import { GroupIcon } from '../components/feed/FeedBits';
import {
  CreateGroupDialog,
  DiscoverGroups,
  EventRow,
  GroupEvents,
  GroupFiles,
  GroupMembers,
  GroupSettings,
  GroupTasks,
  roleLabel,
} from '../components/feed/GroupPanels';

/*
 * Bang tin nhom (1.33.0) — trao doi trong cong ty, phong ban, du an nhu mot nhom
 * Facebook. Bo cuc: cot dieu huong chinh cua ung dung | cot menu Bang tin (cung
 * kieu cot muc cua Cai dat) | noi dung | cot phu (man rong).
 */

const HOME_SECTIONS = ['announcements', 'mentions', 'saved', 'explore', 'menu'] as const;
type HomeSection = (typeof HOME_SECTIONS)[number];
const GROUP_TABS: GroupTab[] = [
  'posts',
  'announcements',
  'files',
  'events',
  'members',
  'tasks',
  'pending',
  'settings',
];

export default function FeedPage() {
  const params = useParams();
  const wide = useMediaQuery('(min-width: 768px)');
  const [creating, setCreating] = useState(false);
  const nav = useQuery({ queryKey: feedKeys.nav, queryFn: feedApi.nav, refetchInterval: 60_000 });

  const groupId = params.groupId ? Number(params.groupId) : null;
  const postId = params.postId ? Number(params.postId) : null;
  const section = (HOME_SECTIONS as readonly string[]).includes(params.section ?? '')
    ? (params.section as HomeSection)
    : null;
  const tab = (GROUP_TABS as string[]).includes(params.tab ?? '')
    ? (params.tab as GroupTab)
    : 'posts';

  const group = useQuery({
    queryKey: feedKeys.group(groupId ?? 0),
    queryFn: () => feedApi.group(groupId!),
    enabled: groupId !== null,
  });

  if (params.section && !section) return <Navigate to="/feed" replace />;
  if (section === 'menu' && wide) return <Navigate to="/feed" replace />;

  const showNavOnly = section === 'menu';
  const navColumn =
    groupId !== null && group.data ? (
      <FeedGroupNav group={group.data} />
    ) : (
      <FeedHomeNav nav={nav.data} onCreateGroup={() => setCreating(true)} />
    );

  return (
    <div className="flex min-h-full flex-col md:h-full md:flex-row">
      <aside
        className={`tr-scroll shrink-0 border-tr-border bg-tr-panel px-3 py-4 md:block md:w-64 md:overflow-y-auto md:border-r md:py-6 ${
          showNavOnly ? 'block' : 'hidden'
        }`}
      >
        {navColumn}
      </aside>
      {!showNavOnly && (
        <div className="tr-scroll min-w-0 flex-1 md:overflow-y-auto">
          <div className="mx-auto w-full max-w-[76rem] p-4 pb-28 md:p-6">
            <Link
              to="/feed/menu"
              className={`mb-3 inline-flex min-h-11 items-center gap-2 rounded-control px-2 text-sm font-medium text-tr-primary md:hidden ${focusRing}`}
            >
              <LayoutList size={16} aria-hidden="true" /> Nhóm & menu bảng tin
            </Link>
            {nav.error ? (
              <ErrorState
                message={nav.error instanceof Error ? nav.error.message : undefined}
                onRetry={() => void nav.refetch()}
              />
            ) : postId !== null ? (
              <SinglePost postId={postId} />
            ) : groupId !== null ? (
              group.isLoading ? (
                <p role="status" className="text-sm text-tr-muted">
                  Đang tải nhóm…
                </p>
              ) : group.error || !group.data ? (
                <EmptyState
                  message="Không tìm thấy nhóm"
                  hint="Nhóm không tồn tại hoặc bạn không thuộc nhóm này."
                />
              ) : (
                <GroupView group={group.data} tab={tab} />
              )
            ) : section === 'explore' ? (
              <>
                <PageTitle title="Khám phá nhóm" />
                <DiscoverGroups onCreate={() => setCreating(true)} />
              </>
            ) : (
              <HomeView section={section} />
            )}
          </div>
        </div>
      )}
      {creating && <CreateGroupDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function PageTitle({ title, description }: { title: string; description?: string }) {
  return (
    <header className="mb-4">
      <h2 className="text-xl font-bold tracking-[-0.01em] text-tr-text">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-tr-subtle">{description}</p>}
    </header>
  );
}

/* ---------------- Trang chu ---------------- */

const HOME_FILTERS: { value: FeedFilter; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'announcements', label: 'Thông báo' },
  { value: 'questions', label: 'Hỏi đáp' },
  { value: 'events', label: 'Sự kiện' },
  { value: 'attachments', label: 'Có tài liệu' },
  { value: 'mine', label: 'Bài của tôi' },
];

function HomeView({ section }: { section: HomeSection | null }) {
  const nav = useQuery({ queryKey: feedKeys.nav, queryFn: feedApi.nav });
  const [filter, setFilter] = useState<FeedFilter>('all');

  if (section === 'saved')
    return (
      <>
        <PageTitle title="Bài viết đã lưu" description="Bài bạn đánh dấu Lưu từ mọi nhóm." />
        <PostList filter="saved" />
      </>
    );
  if (section === 'mentions')
    return (
      <>
        <PageTitle title="Nhắc đến tôi" description="Bài và bình luận có @tên bạn." />
        <PostList filter="mentions" />
      </>
    );
  if (section === 'announcements')
    return (
      <>
        <PageTitle
          title="Thông báo"
          description="Thông báo từ các nhóm — bấm “Tôi đã đọc” để xác nhận."
        />
        <PostList filter="announcements" />
      </>
    );

  return (
    <div className="flex flex-wrap items-start gap-6">
      <div className="min-w-0 flex-[999_1_32rem] space-y-4">
        <Composer groups={nav.data?.groups ?? []} />
        <Tabs
          value={filter}
          onChange={setFilter}
          items={HOME_FILTERS}
          ariaLabel="Lọc bảng tin"
          idPrefix="feed-filter"
          panelClassName="pt-4"
        >
          <PostList filter={filter} />
        </Tabs>
      </div>
      <RightRail />
    </div>
  );
}

function RightRail({ groupId }: { groupId?: number }) {
  const events = useQuery({
    queryKey: feedKeys.events(groupId),
    queryFn: () => feedApi.events(groupId),
  });
  const discover = useQuery({
    queryKey: feedKeys.discover,
    queryFn: feedApi.discover,
    enabled: !groupId,
  });
  return (
    <aside aria-label="Thông tin bên lề" className="hidden w-72 shrink-0 space-y-4 xl:block">
      <section className="rounded-panel border border-tr-border bg-tr-card p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-tr-text">Sự kiện sắp tới</h2>
          <Link to="/calendar" className={`text-xs text-tr-primary hover:underline ${focusRing}`}>
            Lịch
          </Link>
        </div>
        {(events.data ?? []).length === 0 ? (
          <p className="text-sm text-tr-muted">Chưa có sự kiện nào.</p>
        ) : (
          <ul>
            {(events.data ?? []).slice(0, 4).map((event) => (
              <li key={event.id}>
                <EventRow event={event} compact />
              </li>
            ))}
          </ul>
        )}
      </section>
      {!groupId && (discover.data ?? []).length > 0 && (
        <section className="rounded-panel border border-tr-border bg-tr-card p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-tr-text">Nhóm gợi ý</h2>
            <Link
              to="/feed/explore"
              className={`text-xs text-tr-primary hover:underline ${focusRing}`}
            >
              Xem tất cả
            </Link>
          </div>
          <ul className="space-y-2">
            {(discover.data ?? []).slice(0, 3).map((group) => (
              <li key={group.id}>
                <Link
                  to={`/feed/groups/${group.id}`}
                  className={`flex items-center gap-2.5 rounded-control p-1 hover:bg-tr-hover ${focusRing}`}
                >
                  <GroupIcon id={group.id} name={group.name} color={group.color} size={32} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-tr-text">
                      {group.name}
                    </span>
                    <span className="text-xs text-tr-subtle">{group.member_count} thành viên</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}

/* ---------------- Danh sach bai ---------------- */

function PostList({ filter, groupId }: { filter: FeedFilter; groupId?: number }) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);
  const posts = useInfiniteQuery({
    queryKey: feedKeys.posts(String(groupId ?? 'home'), filter, debounced),
    queryFn: ({ pageParam }) =>
      feedApi.posts({ group_id: groupId, filter, q: debounced || undefined, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
  });
  const items = posts.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <div className="space-y-4">
      <label className="flex h-10 items-center gap-2 rounded-control border border-tr-border bg-tr-card px-3 focus-within:outline-2 focus-within:outline-tr-primary">
        <Search size={15} className="text-tr-muted" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Tìm trong bài viết…"
          aria-label="Tìm trong bài viết"
          className="min-w-0 flex-1 bg-transparent text-sm text-tr-text outline-none placeholder:text-tr-muted"
        />
      </label>
      {posts.isLoading ? (
        <p role="status" className="text-sm text-tr-muted">
          Đang tải bài viết…
        </p>
      ) : posts.error ? (
        <ErrorState onRetry={() => void posts.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          message={
            debounced
              ? 'Không có bài viết nào khớp'
              : filter === 'saved'
                ? 'Bạn chưa lưu bài viết nào'
                : filter === 'mentions'
                  ? 'Chưa ai nhắc đến bạn'
                  : filter === 'pending'
                    ? 'Không có bài nào chờ duyệt'
                    : 'Chưa có bài viết nào'
          }
          hint={filter === 'all' && !debounced ? 'Hãy là người mở đầu cuộc trò chuyện.' : undefined}
        />
      ) : (
        <>
          {items.map((post) => (
            <PostCard key={post.id} post={post} showGroup={groupId === undefined} />
          ))}
          {posts.hasNextPage && (
            <LoadMoreSentinel
              hasMore
              onLoadMore={() => void posts.fetchNextPage()}
              loading={posts.isFetchingNextPage}
              label="Tải thêm bài viết"
            />
          )}
        </>
      )}
    </div>
  );
}

function SinglePost({ postId }: { postId: number }) {
  const post = useQuery({ queryKey: feedKeys.post(postId), queryFn: () => feedApi.post(postId) });
  if (post.isLoading) return <p className="text-sm text-tr-muted">Đang tải bài viết…</p>;
  if (post.error || !post.data)
    return (
      <EmptyState
        message="Không tìm thấy bài viết"
        hint="Bài có thể đã bị xóa hoặc bạn không thuộc nhóm này."
      />
    );
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <Link
        to={`/feed/groups/${post.data.group.id}`}
        className={`text-sm text-tr-primary hover:underline ${focusRing}`}
      >
        ← {post.data.group.name}
      </Link>
      <PostCard post={post.data} defaultCommentsOpen />
    </div>
  );
}

/* ---------------- Mot nhom ---------------- */

const TAB_TITLE: Record<GroupTab, string> = {
  posts: 'Thảo luận',
  announcements: 'Thông báo',
  files: 'Tài liệu',
  events: 'Sự kiện',
  members: 'Thành viên',
  tasks: 'Công việc từ bài viết',
  pending: 'Bài chờ duyệt',
  settings: 'Cài đặt nhóm',
};

function GroupView({ group, tab }: { group: GroupDetail; tab: GroupTab }) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const nav = useQuery({ queryKey: feedKeys.nav, queryFn: feedApi.nav });

  /* Mo nhom = da xem: xoa so bai chua doc. */
  useEffect(() => {
    if (!group.is_member) return;
    void feedApi
      .visit(group.id)
      .then(() => queryClient.invalidateQueries({ queryKey: feedKeys.nav }));
  }, [group.id, group.is_member, queryClient]);

  const membership = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: feedKeys.all }),
    onError: (error) => pushToast(error instanceof Error ? error.message : 'Không thực hiện được'),
  });

  const moderator = group.role === 'admin' || group.role === 'moderator';
  if ((tab === 'pending' && !moderator) || (tab === 'settings' && group.role !== 'admin')) {
    return <Navigate to={`/feed/groups/${group.id}`} replace />;
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-[1_1_18rem]">
          <h2 className="text-xl font-bold tracking-[-0.01em] text-tr-text">
            {tab === 'posts' ? group.name : TAB_TITLE[tab]}
          </h2>
          <p className="mt-0.5 text-sm text-tr-subtle">
            {tab === 'posts'
              ? group.description ||
                `${group.member_count} thành viên${roleLabel(group.role) ? ` · bạn là ${roleLabel(group.role)?.toLowerCase()}` : ''}`
              : group.name}
          </p>
        </div>
        {group.can_join && (
          <Button variant="primary" onClick={() => membership.mutate(() => feedApi.join(group.id))}>
            Tham gia nhóm
          </Button>
        )}
        {group.is_member && (
          <label className="flex items-center gap-1.5 text-sm text-tr-subtle">
            {group.notify === 'none' ? (
              <BellOff size={15} aria-hidden="true" />
            ) : (
              <Bell size={15} aria-hidden="true" />
            )}
            <Select
              value={group.notify}
              fullWidth={false}
              aria-label="Thông báo của nhóm"
              onChange={(event) =>
                membership.mutate(() =>
                  feedApi.visit(group.id, event.target.value as 'all' | 'mentions' | 'none')
                )
              }
            >
              <option value="all">Mọi bài mới</option>
              <option value="mentions">Chỉ khi nhắc tên</option>
              <option value="none">Tắt thông báo</option>
            </Select>
          </label>
        )}
        {group.can_leave && (
          <Button onClick={() => membership.mutate(() => feedApi.leave(group.id))}>Rời nhóm</Button>
        )}
      </header>

      {group.is_archived && (
        <p className="rounded-control bg-tr-warning/20 px-3 py-2 text-sm text-tr-text">
          Nhóm đã lưu trữ — chỉ đọc được bài cũ.
        </p>
      )}

      {tab === 'posts' && (
        <div className="flex flex-wrap items-start gap-6">
          <div className="min-w-0 flex-[999_1_32rem] space-y-4">
            {group.can_post && <Composer groups={nav.data?.groups ?? []} fixedGroupId={group.id} />}
            {!group.is_member && !group.can_join && (
              <p className="text-sm text-tr-subtle">Bạn đang xem với quyền quản trị hệ thống.</p>
            )}
            <PostList filter="all" groupId={group.id} />
          </div>
          <RightRail groupId={group.id} />
        </div>
      )}
      {tab === 'announcements' && <PostList filter="announcements" groupId={group.id} />}
      {tab === 'pending' && <PostList filter="pending" groupId={group.id} />}
      {tab === 'files' && <GroupFiles group={group} />}
      {tab === 'events' && <GroupEvents groupId={group.id} />}
      {tab === 'members' && <GroupMembers group={group} />}
      {tab === 'tasks' && <GroupTasks groupId={group.id} />}
      {tab === 'settings' && <GroupSettings group={group} />}
    </div>
  );
}
