import { useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { EmptyState, ErrorState } from '../common/ui';
import { LoadMoreSentinel } from '../common/LoadMoreSentinel';
import { feedApi, feedKeys, type FeedFilter, type LinkType } from '../../lib/feed';
import { PostCard } from './PostCard';

/* Danh sach bai tai dan khi cuon — dung chung cho Bang tin va tab Trao doi noi bo. */

export function PostList({
  filter,
  groupId,
  link,
  emptyHint,
}: {
  filter: FeedFilter;
  groupId?: number;
  /** Chi bai gan mot ban ghi CRM (trao doi noi bo cua khach hang / co hoi). */
  link?: { type: LinkType; id: number; includeRelated?: boolean };
  emptyHint?: string;
}) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);
  const posts = useInfiniteQuery({
    queryKey: feedKeys.posts(
      link ? `${link.type}-${link.id}-${link.includeRelated ? 1 : 0}` : String(groupId ?? 'home'),
      filter,
      debounced
    ),
    queryFn: ({ pageParam }) =>
      feedApi.posts({
        group_id: groupId,
        filter,
        q: debounced || undefined,
        cursor: pageParam,
        link_type: link?.type,
        link_id: link?.id,
        include_related: link?.includeRelated ? 1 : undefined,
      }),
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
                    : filter === 'drafts'
                      ? 'Không có bản nháp hay bài hẹn giờ nào'
                      : 'Chưa có bài viết nào'
          }
          hint={
            emptyHint ??
            (filter === 'all' && !debounced ? 'Hãy là người mở đầu cuộc trò chuyện.' : undefined)
          }
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
