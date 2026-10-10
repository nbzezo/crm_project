import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bookmark,
  BookmarkCheck,
  CalendarPlus,
  Check,
  ChevronDown,
  Download,
  ListPlus,
  Lock,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Pin,
  ThumbsUp,
  Trash2,
  X,
} from 'lucide-react';
import { Button, IconButton, Input, Select, focusRing } from '../common/ui';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Popover, PopoverItem, usePopover } from '../common/Popover';
import { useUiStore } from '../../stores/uiStore';
import {
  attachmentUrl,
  feedApi,
  feedKeys,
  fileSize,
  formatEventTime,
  LINK_TYPE_LABEL,
  linkHref,
  REACTIONS,
  relativeTime,
  type FeedComment,
  type FeedPost,
  type Reaction,
} from '../../lib/feed';
import {
  Avatar,
  FileTypeIcon,
  GroupIcon,
  MentionTextarea,
  RichText,
  SourceBadge,
} from './FeedBits';

const KIND_BADGE: Partial<Record<FeedPost['kind'], string>> = {
  announcement: 'Thông báo',
  poll: 'Khảo sát',
  question: 'Hỏi đáp',
  event: 'Sự kiện',
};

/** Cap nhat bai trong moi danh sach dang dem — khong tai lai ca bang tin sau moi lan bam. */
function usePatchPost() {
  const queryClient = useQueryClient();
  return (post: FeedPost) => {
    queryClient.setQueriesData<{ pages: { items: FeedPost[] }[] }>(
      { queryKey: ['feed', 'posts'] },
      (data) =>
        data && {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.map((item) => (item.id === post.id ? post : item)),
          })),
        }
    );
    queryClient.setQueryData(feedKeys.post(post.id), post);
  };
}

export function PostCard({
  post,
  showGroup = true,
  defaultCommentsOpen = false,
}: {
  post: FeedPost;
  showGroup?: boolean;
  defaultCommentsOpen?: boolean;
}) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const openCard = useUiStore((s) => s.openCard);
  const patch = usePatchPost();
  const menu = usePopover();
  const reactionMenu = usePopover();
  const [commentsOpen, setCommentsOpen] = useState(defaultCommentsOpen);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.body);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [acksOpen, setAcksOpen] = useState(false);

  const onError = (error: unknown) =>
    pushToast(error instanceof Error ? error.message : 'Không thực hiện được');
  const act = useMutation({
    mutationFn: (fn: () => Promise<FeedPost>) => fn(),
    onSuccess: patch,
    onError,
  });
  const refreshAll = () => void queryClient.invalidateQueries({ queryKey: feedKeys.all });

  const remove = useMutation({
    mutationFn: () => feedApi.deletePost(post.id),
    onSuccess: () => {
      setConfirmDelete(false);
      refreshAll();
      pushToast('Đã xóa bài viết', 'success');
    },
    onError,
  });
  const saveEdit = useMutation({
    mutationFn: () => feedApi.updatePost(post.id, { body: draft.trim() }),
    onSuccess: (updated) => {
      patch(updated);
      setEditing(false);
    },
    onError,
  });
  const calendar = useMutation({
    mutationFn: () => feedApi.addToCalendar(post.id),
    onSuccess: () => pushToast('Đã thêm vào Lịch của bạn', 'success'),
    onError,
  });

  const long = post.body.length > 600 && !expanded;
  const images = post.attachments.filter((a) => a.is_image);
  const files = post.attachments.filter((a) => !a.is_image);
  const myReaction = REACTIONS.find((r) => r.key === post.reactions.mine);
  const topReactions = REACTIONS.filter((r) => post.reactions.counts[r.key]).slice(0, 3);

  const react = (reaction: Reaction | null) => act.mutate(() => feedApi.react(post.id, reaction));

  return (
    <article
      aria-labelledby={`post-${post.id}-author`}
      className={`rounded-panel border bg-tr-card p-3 sm:p-4 ${
        post.status === 'pending' ? 'border-dashed border-tr-warning' : 'border-tr-border'
      }`}
    >
      {(post.is_pinned || post.kind !== 'post' || post.status !== 'published') && (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
          {post.is_pinned && (
            <span className="inline-flex items-center gap-1 rounded-compact bg-tr-warning/25 px-2 py-0.5 text-tr-text">
              <Pin size={12} aria-hidden="true" /> Đã ghim
            </span>
          )}
          {KIND_BADGE[post.kind] && (
            <span className="rounded-compact bg-tr-primary/10 px-2 py-0.5 text-tr-primary">
              {KIND_BADGE[post.kind]}
            </span>
          )}
          {post.status === 'pending' && (
            <span className="rounded-compact bg-tr-warning/25 px-2 py-0.5 text-tr-text">
              Chờ duyệt
            </span>
          )}
          {post.status === 'rejected' && (
            <span className="rounded-compact bg-tr-danger/15 px-2 py-0.5 text-tr-danger">
              Bị từ chối
            </span>
          )}
        </div>
      )}

      <header className="flex items-start gap-3">
        <Avatar id={post.author?.id ?? 0} name={post.author?.name ?? '?'} />
        <div className="min-w-0 flex-1">
          <div
            id={`post-${post.id}-author`}
            className="flex flex-wrap items-center gap-x-1.5 text-sm"
          >
            <b className="text-tr-text">{post.author?.name ?? 'Người dùng đã rời'}</b>
            {showGroup && (
              <>
                <span aria-hidden="true" className="text-tr-muted">
                  ›
                </span>
                <Link
                  to={`/feed/groups/${post.group.id}`}
                  className={`inline-flex items-center gap-1 font-medium text-tr-text hover:text-tr-primary ${focusRing}`}
                >
                  <GroupIcon
                    id={post.group.id}
                    name={post.group.name}
                    color={post.group.color}
                    size={16}
                  />
                  {post.group.name}
                </Link>
              </>
            )}
          </div>
          <div className="text-xs text-tr-subtle">
            {post.author?.unit ? `${post.author.unit} · ` : ''}
            <Link to={`/feed/posts/${post.id}`} className={`hover:underline ${focusRing}`}>
              <time dateTime={post.created_at.replace(' ', 'T')}>
                {relativeTime(post.created_at)}
              </time>
            </Link>
            {post.edited_at ? ' · đã sửa' : ''}
          </div>
        </div>
        <IconButton
          label="Tùy chọn bài viết"
          onClick={menu.toggle}
          aria-haspopup="menu"
          aria-expanded={menu.open}
        >
          <MoreHorizontal size={18} aria-hidden="true" />
        </IconButton>
        <Popover
          open={menu.open}
          onClose={menu.close}
          anchor={menu.anchor}
          title="Tùy chọn bài viết"
          width={240}
        >
          <PopoverItem
            icon={
              post.saved ? (
                <BookmarkCheck size={16} aria-hidden="true" />
              ) : (
                <Bookmark size={16} aria-hidden="true" />
              )
            }
            onClick={() => {
              menu.close();
              act.mutate(() => feedApi.save(post.id, !post.saved));
            }}
          >
            {post.saved ? 'Bỏ lưu bài' : 'Lưu bài'}
          </PopoverItem>
          <PopoverItem
            icon={<ListPlus size={16} aria-hidden="true" />}
            onClick={() => {
              menu.close();
              setTaskOpen(true);
            }}
          >
            Tạo công việc từ bài
          </PopoverItem>
          {post.ack && (post.can_moderate || post.can_edit) && (
            <PopoverItem
              icon={<Check size={16} aria-hidden="true" />}
              onClick={() => {
                menu.close();
                setAcksOpen(true);
              }}
            >
              Ai đã xác nhận đọc
            </PopoverItem>
          )}
          {post.can_moderate && post.status === 'published' && (
            <PopoverItem
              icon={<Pin size={16} aria-hidden="true" />}
              onClick={() => {
                menu.close();
                act.mutate(() => feedApi.pin(post.id, !post.is_pinned));
              }}
            >
              {post.is_pinned ? 'Bỏ ghim' : 'Ghim lên đầu nhóm'}
            </PopoverItem>
          )}
          {post.can_edit && (
            <PopoverItem
              onClick={() => {
                menu.close();
                setDraft(post.body);
                setEditing(true);
              }}
            >
              Sửa bài viết
            </PopoverItem>
          )}
          {post.can_delete && (
            <PopoverItem
              danger
              icon={<Trash2 size={16} aria-hidden="true" />}
              onClick={() => {
                menu.close();
                setConfirmDelete(true);
              }}
            >
              Xóa bài viết
            </PopoverItem>
          )}
        </Popover>
      </header>

      {editing ? (
        <div className="mt-3 space-y-2">
          <MentionTextarea
            groupId={post.group.id}
            value={draft}
            onChange={setDraft}
            onMentionsChange={() => undefined}
            ariaLabel="Sửa nội dung bài viết"
            autoFocus
            rows={4}
          />
          <div className="flex justify-end gap-2">
            <Button onClick={() => setEditing(false)}>Hủy</Button>
            <Button
              variant="primary"
              disabled={saveEdit.isPending}
              onClick={() => saveEdit.mutate()}
            >
              Lưu
            </Button>
          </div>
        </div>
      ) : (
        post.body && (
          <div className="mt-3 text-sm leading-relaxed whitespace-pre-wrap text-tr-text">
            <RichText text={long ? `${post.body.slice(0, 600)}…` : post.body} />
            {long && (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className={`ml-1 font-semibold text-tr-primary hover:underline ${focusRing}`}
              >
                Xem thêm
              </button>
            )}
          </div>
        )
      )}

      {post.event && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-panel border border-tr-border bg-tr-panel p-3">
          <div className="min-w-0 flex-[1_1_15rem] text-sm">
            <div className="font-semibold text-tr-text">
              {formatEventTime(post.event.start_at, post.event.end_at)}
            </div>
            {post.event.location && (
              <div className="flex items-center gap-1 text-tr-subtle">
                <MapPin size={14} aria-hidden="true" />
                {post.event.location}
              </div>
            )}
            <div className="text-xs text-tr-subtle">
              {post.event.going} tham gia · {post.event.maybe} có thể
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Trả lời tham gia">
            {(
              [
                ['going', 'Tham gia'],
                ['maybe', 'Có thể'],
                ['declined', 'Không đi'],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                size="sm"
                variant={post.event?.mine === value ? 'primary' : 'secondary'}
                aria-pressed={post.event?.mine === value}
                onClick={() =>
                  act.mutate(() => feedApi.rsvp(post.id, post.event?.mine === value ? null : value))
                }
              >
                {label}
              </Button>
            ))}
            <Button size="sm" onClick={() => calendar.mutate()} disabled={calendar.isPending}>
              <CalendarPlus size={14} aria-hidden="true" /> Vào lịch của tôi
            </Button>
          </div>
        </div>
      )}

      {post.poll && (
        <PollBlock post={post} onVote={(ids) => act.mutate(() => feedApi.vote(post.id, ids))} />
      )}

      {images.length > 0 && (
        <div
          className={`mt-3 grid gap-1.5 overflow-hidden rounded-panel ${
            images.length === 1
              ? 'grid-cols-1'
              : images.length === 2
                ? 'grid-cols-2'
                : 'grid-cols-3'
          }`}
        >
          {images.slice(0, 6).map((image, index) => (
            <a
              key={image.id}
              href={attachmentUrl(image.id, true)}
              target="_blank"
              rel="noopener noreferrer"
              className={`relative block bg-tr-surface ${focusRing}`}
            >
              <img
                src={attachmentUrl(image.id, true)}
                alt={image.name}
                loading="lazy"
                className={`w-full object-cover ${images.length === 1 ? 'max-h-[28rem]' : 'aspect-[4/3]'}`}
              />
              {index === 5 && images.length > 6 && (
                <span className="absolute inset-0 flex items-center justify-center bg-tr-overlay text-xl font-semibold text-tr-on-primary">
                  +{images.length - 6}
                </span>
              )}
            </a>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <ul className="mt-3 space-y-1.5" aria-label="Tệp đính kèm">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex items-center gap-3 rounded-control border border-tr-border bg-tr-panel px-3 py-2"
            >
              {file.accessible ? (
                <FileTypeIcon name={file.file_name} mime={file.mime} />
              ) : (
                <span className="inline-flex h-10 w-8 items-center justify-center rounded-compact bg-tr-hover-strong text-tr-muted">
                  <Lock size={14} aria-hidden="true" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-tr-text">{file.name}</span>
                <span className="block text-xs text-tr-subtle">
                  {file.accessible
                    ? `${fileSize(file.size)} · ${
                        file.source === 'personal'
                          ? 'tệp cá nhân của người đăng, chia sẻ chỉ xem cho nhóm'
                          : file.source === 'group'
                            ? 'tài liệu của nhóm'
                            : 'tài liệu chung'
                      }`
                    : 'Bạn không có quyền với tệp này'}
                </span>
              </span>
              <SourceBadge source={file.source} />
              {file.accessible && (
                <a
                  href={attachmentUrl(file.id)}
                  aria-label={`Tải ${file.name}`}
                  title="Tải về"
                  className={`inline-flex h-11 w-11 items-center justify-center rounded-control text-tr-muted hover:bg-tr-hover hover:text-tr-text fine:h-8 fine:w-8 ${focusRing}`}
                >
                  <Download size={16} aria-hidden="true" />
                </a>
              )}
              {(post.can_edit || post.can_moderate) && (
                <IconButton
                  label={`Gỡ ${file.name} khỏi bài`}
                  tone="danger"
                  onClick={() => act.mutate(() => feedApi.removeAttachment(post.id, file.id))}
                >
                  <X size={14} aria-hidden="true" />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}

      {post.links.length > 0 && (
        <ul className="mt-3 space-y-1.5" aria-label="Thẻ CRM">
          {post.links.map((link) => {
            const href = link.accessible ? linkHref(link) : null;
            return (
              <li
                key={`${link.type}-${link.id}`}
                className="flex items-center gap-3 rounded-control border border-dashed border-tr-border px-3 py-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-semibold text-tr-subtle">
                    {LINK_TYPE_LABEL[link.type]}
                  </span>
                  <span
                    className={`block truncate text-sm font-medium ${link.accessible ? 'text-tr-text' : 'text-tr-muted italic'}`}
                  >
                    {link.label}
                  </span>
                  {link.sub && (
                    <span className="block truncate text-xs text-tr-subtle">{link.sub}</span>
                  )}
                </span>
                {href && (
                  <Link
                    to={href}
                    className={`text-sm font-semibold text-tr-primary hover:underline ${focusRing}`}
                  >
                    Mở
                  </Link>
                )}
                {link.accessible && link.type === 'card' && (
                  <button
                    type="button"
                    onClick={() => openCard(link.id)}
                    className={`text-sm font-semibold text-tr-primary hover:underline ${focusRing}`}
                  >
                    Mở
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {post.task_card_id && (
        <button
          type="button"
          onClick={() => openCard(post.task_card_id!)}
          className={`mt-3 inline-flex items-center gap-1.5 rounded-control bg-tr-success/15 px-2.5 py-1 text-xs font-semibold text-tr-text hover:bg-tr-success/25 ${focusRing}`}
        >
          <Check size={13} aria-hidden="true" /> Đã tạo công việc · Mở
        </button>
      )}

      {post.ack && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-control bg-tr-panel px-3 py-2">
          <span className="text-xs text-tr-subtle">{post.ack.count} người đã xác nhận đọc</span>
          {post.ack.mine ? (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-tr-success">
              <Check size={14} aria-hidden="true" /> Bạn đã xác nhận
            </span>
          ) : (
            !post.can_edit && (
              <Button
                size="sm"
                variant="primary"
                onClick={() => act.mutate(() => feedApi.ack(post.id))}
              >
                Tôi đã đọc
              </Button>
            )
          )}
        </div>
      )}

      {post.status === 'pending' && post.can_moderate && (
        <div className="mt-3 flex justify-end gap-2">
          <Button onClick={() => act.mutate(() => feedApi.moderate(post.id, 'reject'))}>
            Từ chối
          </Button>
          <Button
            variant="primary"
            onClick={() =>
              act.mutate(async () => {
                const updated = await feedApi.moderate(post.id, 'approve');
                refreshAll();
                return updated;
              })
            }
          >
            Duyệt bài
          </Button>
        </div>
      )}

      {(post.reactions.total > 0 || post.comment_count > 0) && (
        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-tr-subtle">
          <span className="flex items-center gap-1">
            {topReactions.length > 0 && (
              <span aria-hidden="true">{topReactions.map((r) => r.glyph).join('')}</span>
            )}
            {post.reactions.total > 0 &&
              reactionSummary(
                post.reactions.recent_names,
                post.reactions.total,
                Boolean(post.reactions.mine)
              )}
          </span>
          {post.comment_count > 0 && (
            <button
              type="button"
              onClick={() => setCommentsOpen((open) => !open)}
              className={`hover:underline ${focusRing}`}
            >
              {post.comment_count} bình luận
            </button>
          )}
        </div>
      )}

      {post.status === 'published' && (
        <div className="mt-2 flex items-center gap-1 border-t border-tr-border pt-1.5">
          <div className="flex flex-1">
            <button
              type="button"
              aria-pressed={Boolean(post.reactions.mine)}
              onClick={() => react(post.reactions.mine ? null : 'like')}
              className={`inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-l-control text-sm font-medium hover:bg-tr-hover ${
                post.reactions.mine ? 'text-tr-primary' : 'text-tr-subtle'
              } ${focusRing}`}
            >
              {myReaction && myReaction.key !== 'like' ? (
                <span aria-hidden="true">{myReaction.glyph}</span>
              ) : (
                <ThumbsUp size={16} aria-hidden="true" />
              )}
              {myReaction?.label ?? 'Thích'}
            </button>
            <button
              type="button"
              aria-label="Chọn cảm xúc khác"
              aria-haspopup="menu"
              aria-expanded={reactionMenu.open}
              onClick={reactionMenu.toggle}
              className={`inline-flex min-h-10 items-center rounded-r-control px-1.5 text-tr-muted hover:bg-tr-hover ${focusRing}`}
            >
              <ChevronDown size={14} aria-hidden="true" />
            </button>
            <Popover
              open={reactionMenu.open}
              onClose={reactionMenu.close}
              anchor={reactionMenu.anchor}
              title="Cảm xúc"
              width={260}
            >
              <div className="flex flex-wrap gap-1 py-1">
                {REACTIONS.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    aria-label={r.label}
                    title={r.label}
                    aria-pressed={post.reactions.mine === r.key}
                    onClick={() => {
                      reactionMenu.close();
                      react(post.reactions.mine === r.key ? null : r.key);
                    }}
                    className={`flex h-11 w-11 items-center justify-center rounded-full text-xl hover:bg-tr-hover ${
                      post.reactions.mine === r.key ? 'bg-tr-primary/10' : ''
                    } ${focusRing}`}
                  >
                    <span aria-hidden="true">{r.glyph}</span>
                  </button>
                ))}
              </div>
            </Popover>
          </div>
          <button
            type="button"
            aria-expanded={commentsOpen}
            onClick={() => setCommentsOpen((open) => !open)}
            className={`inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-control text-sm font-medium text-tr-subtle hover:bg-tr-hover ${focusRing}`}
          >
            <MessageCircle size={16} aria-hidden="true" /> Bình luận
          </button>
          <button
            type="button"
            onClick={() => setTaskOpen(true)}
            className={`hidden min-h-10 flex-1 items-center justify-center gap-1.5 rounded-control text-sm font-medium text-tr-subtle hover:bg-tr-hover sm:inline-flex ${focusRing}`}
          >
            <ListPlus size={16} aria-hidden="true" /> Tạo công việc
          </button>
          <button
            type="button"
            aria-pressed={post.saved}
            onClick={() => act.mutate(() => feedApi.save(post.id, !post.saved))}
            className={`inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-control text-sm font-medium hover:bg-tr-hover ${
              post.saved ? 'text-tr-primary' : 'text-tr-subtle'
            } ${focusRing}`}
          >
            {post.saved ? (
              <BookmarkCheck size={16} aria-hidden="true" />
            ) : (
              <Bookmark size={16} aria-hidden="true" />
            )}
            {post.saved ? 'Đã lưu' : 'Lưu'}
          </button>
        </div>
      )}

      {commentsOpen && post.status === 'published' && <Comments post={post} />}

      <ConfirmDialog
        open={confirmDelete}
        title="Xóa bài viết này?"
        message="Bài viết, bình luận và quyền xem các tệp cá nhân đính kèm qua bài sẽ bị gỡ khỏi nhóm."
        confirmLabel="Xóa bài viết"
        pending={remove.isPending}
        onConfirm={() => remove.mutate()}
        onCancel={() => setConfirmDelete(false)}
      />
      {taskOpen && (
        <CreateTaskDialog
          post={post}
          onClose={() => setTaskOpen(false)}
          onCreated={(updated, cardId) => {
            patch(updated);
            setTaskOpen(false);
            pushToast('Đã tạo công việc', 'success', { label: 'Mở', run: () => openCard(cardId) });
          }}
        />
      )}
      {acksOpen && <AcksDialog postId={post.id} onClose={() => setAcksOpen(false)} />}
    </article>
  );
}

function reactionSummary(names: string[], total: number, mine: boolean): string {
  if (total === 1 && mine) return 'Bạn';
  const others = total - (mine ? 1 : 0);
  if (mine) return `Bạn và ${others} người khác`;
  if (names.length > 0 && total <= 2) return names.join(', ');
  if (names.length > 0) return `${names[0]} và ${total - 1} người khác`;
  return `${total}`;
}

function PollBlock({ post, onVote }: { post: FeedPost; onVote: (ids: number[]) => void }) {
  const poll = post.poll!;
  const mine = poll.options.filter((o) => o.mine).map((o) => o.id);
  const voted = mine.length > 0;
  const total = poll.options.reduce((sum, o) => sum + o.votes, 0);
  return (
    <fieldset className="mt-3 space-y-1.5 rounded-panel border border-tr-border p-3">
      <legend className="px-1 text-xs text-tr-subtle">
        {poll.multi ? 'Chọn một hoặc nhiều' : 'Chọn một'} · {poll.voters} người đã bình chọn
        {poll.closed
          ? ' · Đã đóng'
          : poll.closes_at
            ? ` · Đóng ${poll.closes_at.replace('T', ' ')}`
            : ''}
      </legend>
      {poll.options.map((option) => {
        const percent = total ? Math.round((option.votes / total) * 100) : 0;
        return (
          <label
            key={option.id}
            className={`relative flex min-h-10 cursor-pointer items-center gap-2 overflow-hidden rounded-control border px-3 text-sm ${
              option.mine ? 'border-tr-primary' : 'border-tr-border'
            } ${poll.closed ? 'cursor-default' : 'hover:bg-tr-hover'}`}
          >
            {(voted || poll.closed) && (
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 bg-tr-primary/10"
                style={{ width: `${percent}%` }}
              />
            )}
            <input
              type={poll.multi ? 'checkbox' : 'radio'}
              name={`poll-${post.id}`}
              checked={option.mine}
              disabled={poll.closed}
              onChange={() =>
                onVote(
                  poll.multi
                    ? option.mine
                      ? mine.filter((id) => id !== option.id)
                      : [...mine, option.id]
                    : option.mine
                      ? []
                      : [option.id]
                )
              }
              className="relative h-4 w-4 accent-tr-primary"
            />
            <span className="relative flex-1 text-tr-text">{option.label}</span>
            {(voted || poll.closed) && (
              <span className="relative text-xs font-semibold text-tr-subtle">
                {option.votes} · {percent}%
              </span>
            )}
          </label>
        );
      })}
    </fieldset>
  );
}

function Comments({ post }: { post: FeedPost }) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const [body, setBody] = useState('');
  const [mentionIds, setMentionIds] = useState<number[]>([]);
  const [replyTo, setReplyTo] = useState<FeedComment | null>(null);
  const comments = useQuery({
    queryKey: feedKeys.comments(post.id),
    queryFn: () => feedApi.comments(post.id),
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: feedKeys.comments(post.id) });
    void queryClient.invalidateQueries({ queryKey: ['feed', 'posts'] });
    void queryClient.invalidateQueries({ queryKey: feedKeys.post(post.id) });
  };
  const onError = (error: unknown) =>
    pushToast(error instanceof Error ? error.message : 'Không thực hiện được');
  const add = useMutation({
    mutationFn: () =>
      feedApi.addComment(post.id, {
        body: body.trim(),
        parent_id: replyTo?.id ?? null,
        mention_ids: mentionIds,
      }),
    onSuccess: () => {
      setBody('');
      setMentionIds([]);
      setReplyTo(null);
      refresh();
    },
    onError,
  });
  const action = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: refresh,
    onError,
  });

  const rows = comments.data ?? [];
  const roots = rows.filter((c) => c.parent_id === null);
  const repliesOf = (id: number) => rows.filter((c) => c.parent_id === id);

  const renderComment = (comment: FeedComment, nested = false) => (
    <li key={comment.id} className={nested ? 'mt-2' : ''}>
      <div className="flex items-start gap-2">
        <Avatar
          id={comment.author_contact_id ?? 0}
          name={comment.author_name}
          size={nested ? 26 : 32}
        />
        <div className="min-w-0 flex-1">
          <div
            className={`inline-block max-w-full rounded-panel px-3 py-2 ${
              comment.is_answer ? 'border border-tr-success bg-tr-success/10' : 'bg-tr-surface'
            }`}
          >
            <div className="text-xs font-semibold text-tr-text">
              {comment.author_name ?? 'Người dùng đã rời'}
              {comment.is_answer && (
                <span className="ml-2 inline-flex items-center gap-0.5 text-tr-success">
                  <Check size={12} aria-hidden="true" /> Câu trả lời được chọn
                </span>
              )}
            </div>
            <div className="text-sm whitespace-pre-wrap text-tr-text">
              <RichText text={comment.body} />
            </div>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-3 px-2 text-xs text-tr-subtle">
            <span>{relativeTime(comment.created_at)}</span>
            <button
              type="button"
              aria-pressed={comment.liked}
              onClick={() => action.mutate(() => feedApi.likeComment(comment.id, !comment.liked))}
              className={`font-semibold hover:underline ${comment.liked ? 'text-tr-primary' : ''} ${focusRing}`}
            >
              Thích{comment.likes ? ` · ${comment.likes}` : ''}
            </button>
            <button
              type="button"
              onClick={() => setReplyTo(comment)}
              className={`font-semibold hover:underline ${focusRing}`}
            >
              Trả lời
            </button>
            {post.kind === 'question' && (post.can_edit || post.can_moderate) && !nested && (
              <button
                type="button"
                onClick={() =>
                  action.mutate(() => feedApi.markAnswer(comment.id, !comment.is_answer))
                }
                className={`font-semibold hover:underline ${focusRing}`}
              >
                {comment.is_answer ? 'Bỏ chọn câu trả lời' : 'Chọn là câu trả lời'}
              </button>
            )}
            {comment.can_delete && (
              <button
                type="button"
                onClick={() => action.mutate(() => feedApi.deleteComment(comment.id))}
                className={`font-semibold text-tr-danger hover:underline ${focusRing}`}
              >
                Xóa
              </button>
            )}
          </div>
          {!nested && repliesOf(comment.id).length > 0 && (
            <ul className="ml-1 border-l border-tr-border pl-3">
              {repliesOf(comment.id).map((reply) => renderComment(reply, true))}
            </ul>
          )}
        </div>
      </div>
    </li>
  );

  return (
    <section aria-label="Bình luận" className="mt-2 space-y-3 border-t border-tr-border pt-3">
      {comments.isLoading ? (
        <p className="text-sm text-tr-muted">Đang tải bình luận…</p>
      ) : (
        roots.length > 0 && <ul className="space-y-3">{roots.map((c) => renderComment(c))}</ul>
      )}
      <div className="space-y-1.5">
        {replyTo && (
          <div className="flex items-center gap-2 text-xs text-tr-subtle">
            Đang trả lời <b className="text-tr-text">{replyTo.author_name}</b>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              className={`text-tr-primary hover:underline ${focusRing}`}
            >
              Hủy
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <MentionTextarea
              groupId={post.group.id}
              value={body}
              onChange={setBody}
              onMentionsChange={setMentionIds}
              rows={1}
              ariaLabel="Viết bình luận"
              placeholder="Viết bình luận… (Ctrl+Enter để gửi)"
              onSubmitShortcut={() => body.trim() && add.mutate()}
            />
          </div>
          <Button
            variant="primary"
            disabled={!body.trim() || add.isPending}
            onClick={() => add.mutate()}
          >
            Gửi
          </Button>
        </div>
      </div>
    </section>
  );
}

function CreateTaskDialog({
  post,
  onClose,
  onCreated,
}: {
  post: FeedPost;
  onClose: () => void;
  onCreated: (post: FeedPost, cardId: number) => void;
}) {
  const [title, setTitle] = useState(post.body.split('\n')[0].slice(0, 200));
  const [assignee, setAssignee] = useState<number | ''>('');
  const [due, setDue] = useState('');
  const members = useQuery({
    queryKey: feedKeys.members(post.group.id),
    queryFn: () => feedApi.members(post.group.id),
  });
  const create = useMutation({
    mutationFn: () =>
      feedApi.createTask(post.id, {
        title: title.trim(),
        assignee_contact_id: assignee === '' ? null : assignee,
        due_date: due || null,
      }),
    onSuccess: (result) => onCreated(result.post, result.card.id),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Tạo công việc từ bài viết"
      width="max-w-lg"
      footer={
        <>
          <Button onClick={onClose}>Hủy</Button>
          <Button
            variant="primary"
            disabled={!title.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            Tạo công việc
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block text-xs font-semibold text-tr-subtle">
          Tên công việc
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-1"
            autoFocus
          />
        </label>
        <label className="block text-xs font-semibold text-tr-subtle">
          Người phụ trách
          <Select
            value={assignee}
            onChange={(event) => setAssignee(event.target.value ? Number(event.target.value) : '')}
            className="mt-1"
          >
            <option value="">Tôi</option>
            {(members.data ?? []).map((m) => (
              <option key={m.contact_id} value={m.contact_id}>
                {m.full_name}
                {m.unit_name ? ` — ${m.unit_name}` : ''}
              </option>
            ))}
          </Select>
        </label>
        <label className="block text-xs font-semibold text-tr-subtle">
          Hạn hoàn thành
          <input
            type="date"
            value={due}
            onChange={(event) => setDue(event.target.value)}
            className={`mt-1 block min-h-10 w-full rounded-control border border-tr-border bg-tr-card px-2 text-sm font-normal text-tr-text ${focusRing}`}
          />
        </label>
        <p className="text-xs text-tr-subtle">
          Mô tả công việc sẽ chép nội dung bài và đường dẫn về bài gốc
          {post.group.kind === 'project' ? '; công việc được đặt vào bảng của dự án.' : '.'}
        </p>
        {create.error && (
          <p role="alert" className="text-sm text-tr-danger">
            {create.error instanceof Error ? create.error.message : 'Không tạo được công việc'}
          </p>
        )}
      </div>
    </Modal>
  );
}

function AcksDialog({ postId, onClose }: { postId: number; onClose: () => void }) {
  const acks = useQuery({
    queryKey: ['feed', 'acks', postId],
    queryFn: () => feedApi.acks(postId),
  });
  const rows = acks.data ?? [];
  const done = rows.filter((r) => r.acked_at);
  const pending = rows.filter((r) => !r.acked_at);
  return (
    <Modal open onClose={onClose} title="Xác nhận đã đọc" width="max-w-lg">
      {acks.isLoading ? (
        <p className="text-sm text-tr-muted">Đang tải…</p>
      ) : (
        <div className="space-y-4">
          <section>
            <h3 className="mb-1 text-sm font-semibold text-tr-text">
              Chưa xác nhận ({pending.length})
            </h3>
            <ul className="space-y-1 text-sm text-tr-subtle">
              {pending.map((r) => (
                <li key={r.contact_id}>
                  {r.full_name}
                  {r.unit_name ? ` · ${r.unit_name}` : ''}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="mb-1 text-sm font-semibold text-tr-text">Đã xác nhận ({done.length})</h3>
            <ul className="space-y-1 text-sm text-tr-subtle">
              {done.map((r) => (
                <li key={r.contact_id}>
                  {r.full_name} · {relativeTime(r.acked_at!)}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </Modal>
  );
}
