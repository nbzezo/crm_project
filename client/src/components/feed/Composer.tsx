import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  CalendarDays,
  FileText,
  HelpCircle,
  Image as ImageIcon,
  Link2,
  Megaphone,
  Plus,
  X,
} from 'lucide-react';
import { Button, IconButton, Input, Select, focusRing } from '../common/ui';
import { Popover, PopoverItem, usePopover } from '../common/Popover';
import { useAuthStore } from '../../stores/authStore';
import { useUiStore } from '../../stores/uiStore';
import {
  feedApi,
  feedKeys,
  fileSize,
  LINK_TYPE_LABEL,
  type LinkType,
  type NavGroup,
  type PostKind,
} from '../../lib/feed';
import { AttachPicker, type PickedAttachment } from './AttachPicker';
import { Avatar, FileTypeIcon, MentionTextarea, SourceBadge } from './FeedBits';

const KIND_LABEL: Record<PostKind, string> = {
  post: 'Bài viết',
  announcement: 'Thông báo',
  poll: 'Khảo sát',
  question: 'Hỏi đáp',
  event: 'Sự kiện',
};

interface PickedLink {
  type: LinkType;
  id: number;
  label: string;
  sub: string;
}

/** O dang bai: chon nhom (o trang chu), loai bai, tep, the CRM, khao sat, su kien. */
export function Composer({
  groups,
  fixedGroupId,
}: {
  /** Nhom co the dang (trang chu). Bo qua khi `fixedGroupId` co gia tri. */
  groups: NavGroup[];
  fixedGroupId?: number;
}) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const me = useAuthStore((s) => s.user);
  const [expanded, setExpanded] = useState(false);
  const [groupId, setGroupId] = useState<number | null>(fixedGroupId ?? null);
  const [kind, setKind] = useState<PostKind>('post');
  const [body, setBody] = useState('');
  const [mentionIds, setMentionIds] = useState<number[]>([]);
  const [attachments, setAttachments] = useState<PickedAttachment[]>([]);
  const [links, setLinks] = useState<PickedLink[]>([]);
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollMulti, setPollMulti] = useState(false);
  const [pollCloses, setPollCloses] = useState('');
  const [eventStart, setEventStart] = useState('');
  const [eventEnd, setEventEnd] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [requiresAck, setRequiresAck] = useState(true);
  const [picker, setPicker] = useState<null | 'mine' | 'shared' | 'upload'>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const attachMenu = usePopover();
  const kindMenu = usePopover();
  const imageInput = useRef<HTMLInputElement>(null);
  const [uploadingImages, setUploadingImages] = useState(false);

  useEffect(() => {
    if (fixedGroupId) setGroupId(fixedGroupId);
  }, [fixedGroupId]);
  useEffect(() => {
    if (!fixedGroupId && groupId === null && groups.length > 0) setGroupId(groups[0].id);
  }, [fixedGroupId, groupId, groups]);

  const group = useQuery({
    queryKey: feedKeys.group(groupId ?? 0),
    queryFn: () => feedApi.group(groupId!),
    enabled: groupId !== null,
  });
  const isAdmin = group.data?.role === 'admin';
  const canPost = group.data?.can_post ?? false;

  const reset = () => {
    setBody('');
    setMentionIds([]);
    setAttachments([]);
    setLinks([]);
    setKind('post');
    setPollOptions(['', '']);
    setPollMulti(false);
    setPollCloses('');
    setEventStart('');
    setEventEnd('');
    setEventLocation('');
    setRequiresAck(true);
    setExpanded(false);
  };

  const create = useMutation({
    mutationFn: () =>
      feedApi.createPost({
        group_id: groupId!,
        kind,
        body: body.trim(),
        requires_ack: kind === 'announcement' ? requiresAck : undefined,
        attachments: attachments.map((a) => ({ document_id: a.document_id, mode: a.mode })),
        links: links.map((l) => ({ entity_type: l.type, entity_id: l.id })),
        mention_ids: mentionIds,
        poll:
          kind === 'poll'
            ? {
                options: pollOptions.map((o) => o.trim()).filter(Boolean),
                multi: pollMulti,
                closes_at: pollCloses || null,
              }
            : undefined,
        event:
          kind === 'event'
            ? { start_at: eventStart, end_at: eventEnd || null, location: eventLocation.trim() }
            : undefined,
      }),
    onSuccess: (post) => {
      reset();
      void queryClient.invalidateQueries({ queryKey: feedKeys.all });
      pushToast(
        post.status === 'pending' ? 'Đã gửi bài — đang chờ quản trị nhóm duyệt' : 'Đã đăng bài',
        'success'
      );
    },
  });

  const uploadImages = async (files: FileList | null) => {
    if (!files || !groupId) return;
    setUploadingImages(true);
    try {
      for (const file of Array.from(files)) {
        const doc = await feedApi.uploadFile(groupId, file);
        setAttachments((prev) => [
          ...prev,
          {
            document_id: doc.id,
            mode: 'library',
            name: doc.name,
            mime: doc.mime,
            size: doc.size,
            source: 'group',
          },
        ]);
      }
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Không tải được ảnh');
    } finally {
      setUploadingImages(false);
    }
  };

  const validOptions = pollOptions.filter((o) => o.trim()).length;
  const ready =
    groupId !== null &&
    canPost &&
    !create.isPending &&
    (kind === 'poll'
      ? validOptions >= 2
      : kind === 'event'
        ? Boolean(eventStart) && Boolean(body.trim())
        : Boolean(body.trim()) || attachments.length > 0);

  const groupName = group.data?.name ?? groups.find((g) => g.id === groupId)?.name ?? 'nhóm';

  if (!expanded) {
    return (
      <section
        aria-label="Đăng bài"
        className="rounded-panel border border-tr-border bg-tr-card p-3 sm:p-4"
      >
        <div className="flex items-center gap-3">
          <Avatar id={me?.contact_id ?? 0} name={me?.contact_name ?? me?.full_name} />
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className={`min-h-11 flex-1 rounded-full border border-tr-border bg-tr-surface px-4 text-left text-sm text-tr-muted hover:bg-tr-hover ${focusRing}`}
          >
            {fixedGroupId ? `Chia sẻ với ${groupName}…` : 'Chia sẻ với nhóm…'}
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1 border-t border-tr-border pt-2">
          <QuickKind
            icon={<ImageIcon size={16} aria-hidden="true" />}
            label="Ảnh / Video"
            onClick={() => setExpanded(true)}
          />
          <QuickKind
            icon={<FileText size={16} aria-hidden="true" />}
            label="Tài liệu"
            onClick={() => {
              setExpanded(true);
              setPicker('mine');
            }}
          />
          <QuickKind
            icon={<BarChart3 size={16} aria-hidden="true" />}
            label="Khảo sát"
            onClick={() => {
              setKind('poll');
              setExpanded(true);
            }}
          />
          <QuickKind
            icon={<CalendarDays size={16} aria-hidden="true" />}
            label="Sự kiện"
            onClick={() => {
              setKind('event');
              setExpanded(true);
            }}
          />
          <QuickKind
            icon={<HelpCircle size={16} aria-hidden="true" />}
            label="Hỏi đáp"
            onClick={() => {
              setKind('question');
              setExpanded(true);
            }}
          />
        </div>
        {picker && groupId && (
          <AttachPicker
            open
            onClose={() => setPicker(null)}
            groupId={groupId}
            groupName={groupName}
            memberCount={group.data?.member_count}
            initialSource={picker}
            onPick={(items) => setAttachments((prev) => [...prev, ...items])}
          />
        )}
      </section>
    );
  }

  return (
    <section
      aria-label="Đăng bài"
      className="space-y-3 rounded-panel border border-tr-border bg-tr-card p-3 sm:p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Avatar id={me?.contact_id ?? 0} name={me?.contact_name ?? me?.full_name} size={32} />
        {!fixedGroupId && (
          <label className="flex items-center gap-1.5 text-sm text-tr-subtle">
            Đăng vào
            <Select
              value={groupId ?? ''}
              onChange={(event) => {
                setGroupId(Number(event.target.value));
                setAttachments((prev) => prev.filter((a) => a.source !== 'group'));
              }}
              aria-label="Nhóm đăng bài"
              className="max-w-[14rem]"
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </label>
        )}
        <button
          type="button"
          onClick={kindMenu.toggle}
          aria-haspopup="menu"
          aria-expanded={kindMenu.open}
          className={`inline-flex min-h-9 items-center gap-1 rounded-control border border-tr-border px-2.5 text-sm text-tr-text hover:bg-tr-hover ${focusRing}`}
        >
          {KIND_LABEL[kind]} ▾
        </button>
        <Popover
          open={kindMenu.open}
          onClose={kindMenu.close}
          anchor={kindMenu.anchor}
          title="Loại bài"
          width={220}
        >
          {(Object.keys(KIND_LABEL) as PostKind[])
            .filter((k) => k !== 'announcement' || isAdmin)
            .map((k) => (
              <PopoverItem
                key={k}
                role="menuitemradio"
                checked={kind === k}
                onClick={() => {
                  setKind(k);
                  kindMenu.close();
                }}
              >
                {KIND_LABEL[k]}
              </PopoverItem>
            ))}
        </Popover>
        <IconButton label="Thu gọn" className="ml-auto" onClick={reset}>
          <X size={16} aria-hidden="true" />
        </IconButton>
      </div>

      {group.data && !canPost && (
        <p className="rounded-control bg-tr-warning/20 px-3 py-2 text-sm text-tr-text">
          {group.data.is_member
            ? 'Nhóm này chỉ quản trị viên được đăng bài.'
            : 'Tham gia nhóm để đăng bài.'}
        </p>
      )}
      {group.data?.require_approval &&
        group.data.role !== 'admin' &&
        group.data.role !== 'moderator' && (
          <p className="text-xs text-tr-subtle">
            Bài viết trong nhóm này cần quản trị duyệt trước khi hiện.
          </p>
        )}

      <MentionTextarea
        groupId={groupId}
        value={body}
        onChange={setBody}
        onMentionsChange={setMentionIds}
        rows={kind === 'post' ? 4 : 3}
        autoFocus
        ariaLabel="Nội dung bài viết"
        onSubmitShortcut={() => ready && create.mutate()}
        placeholder={
          kind === 'question'
            ? 'Bạn muốn hỏi gì? Gõ @ để nhắc tên đồng nghiệp…'
            : kind === 'event'
              ? 'Tên và mô tả sự kiện…'
              : kind === 'poll'
                ? 'Câu hỏi khảo sát…'
                : 'Bạn muốn chia sẻ gì? Gõ @ để nhắc tên đồng nghiệp…'
        }
      />

      {kind === 'announcement' && (
        <label className="flex items-center gap-2 text-sm text-tr-text">
          <input
            type="checkbox"
            checked={requiresAck}
            onChange={(event) => setRequiresAck(event.target.checked)}
            className="h-4 w-4 accent-tr-primary"
          />
          Yêu cầu thành viên bấm “Tôi đã đọc” (thông báo được ghim lên đầu nhóm)
        </label>
      )}

      {kind === 'poll' && (
        <fieldset className="space-y-2 rounded-panel border border-tr-border p-3">
          <legend className="px-1 text-sm font-semibold text-tr-text">Lựa chọn</legend>
          {pollOptions.map((option, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                value={option}
                onChange={(event) =>
                  setPollOptions((prev) =>
                    prev.map((o, i) => (i === index ? event.target.value : o))
                  )
                }
                aria-label={`Lựa chọn ${index + 1}`}
                placeholder={`Lựa chọn ${index + 1}`}
                maxLength={200}
              />
              {pollOptions.length > 2 && (
                <IconButton
                  label={`Bỏ lựa chọn ${index + 1}`}
                  onClick={() => setPollOptions((prev) => prev.filter((_, i) => i !== index))}
                >
                  <X size={14} aria-hidden="true" />
                </IconButton>
              )}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            {pollOptions.length < 10 && (
              <Button size="sm" onClick={() => setPollOptions((prev) => [...prev, ''])}>
                <Plus size={14} aria-hidden="true" /> Thêm lựa chọn
              </Button>
            )}
            <label className="flex items-center gap-2 text-sm text-tr-text">
              <input
                type="checkbox"
                checked={pollMulti}
                onChange={(event) => setPollMulti(event.target.checked)}
                className="h-4 w-4 accent-tr-primary"
              />
              Cho chọn nhiều
            </label>
            <label className="flex items-center gap-2 text-sm text-tr-subtle">
              Đóng lúc
              <input
                type="datetime-local"
                value={pollCloses}
                onChange={(event) => setPollCloses(event.target.value)}
                className={`min-h-9 rounded-control border border-tr-border bg-tr-card px-2 text-sm text-tr-text ${focusRing}`}
              />
            </label>
          </div>
        </fieldset>
      )}

      {kind === 'event' && (
        <fieldset className="grid gap-2 rounded-panel border border-tr-border p-3 sm:grid-cols-3">
          <legend className="px-1 text-sm font-semibold text-tr-text">Thời gian & địa điểm</legend>
          <label className="text-xs font-semibold text-tr-subtle">
            Bắt đầu *
            <input
              type="datetime-local"
              required
              value={eventStart}
              onChange={(event) => setEventStart(event.target.value)}
              className={`mt-1 block min-h-10 w-full rounded-control border border-tr-border bg-tr-card px-2 text-sm font-normal text-tr-text ${focusRing}`}
            />
          </label>
          <label className="text-xs font-semibold text-tr-subtle">
            Kết thúc
            <input
              type="datetime-local"
              value={eventEnd}
              min={eventStart || undefined}
              onChange={(event) => setEventEnd(event.target.value)}
              className={`mt-1 block min-h-10 w-full rounded-control border border-tr-border bg-tr-card px-2 text-sm font-normal text-tr-text ${focusRing}`}
            />
          </label>
          <label className="text-xs font-semibold text-tr-subtle">
            Địa điểm
            <Input
              value={eventLocation}
              onChange={(event) => setEventLocation(event.target.value)}
              placeholder="Phòng họp A / Online"
              className="mt-1"
            />
          </label>
        </fieldset>
      )}

      {attachments.length > 0 && (
        <ul className="space-y-1.5" aria-label="Tệp đính kèm">
          {attachments.map((a) => (
            <li
              key={`${a.document_id}-${a.mode}`}
              className="flex items-center gap-3 rounded-control border border-tr-border bg-tr-panel px-3 py-2"
            >
              <FileTypeIcon name={a.name} mime={a.mime} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-tr-text">{a.name}</span>
                <span className="block text-xs text-tr-subtle">
                  {fileSize(a.size)} ·{' '}
                  {a.mode === 'view'
                    ? 'tệp cá nhân, nhóm chỉ xem qua bài'
                    : a.mode === 'copy'
                      ? 'sẽ sao chép vào tài liệu nhóm'
                      : a.source === 'group'
                        ? 'tài liệu của nhóm'
                        : 'tài liệu chung, giữ quyền gốc'}
                </span>
              </span>
              <SourceBadge source={a.source} />
              <IconButton
                label={`Bỏ ${a.name}`}
                onClick={() => setAttachments((prev) => prev.filter((x) => x !== a))}
              >
                <X size={14} aria-hidden="true" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      {links.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Thẻ CRM đính kèm">
          {links.map((link) => (
            <li
              key={`${link.type}-${link.id}`}
              className="flex items-center gap-2 rounded-control border border-dashed border-tr-border px-2.5 py-1 text-sm"
            >
              <span className="text-xs font-semibold text-tr-subtle">
                {LINK_TYPE_LABEL[link.type]}
              </span>
              <span className="text-tr-text">{link.label}</span>
              <IconButton
                label={`Bỏ ${link.label}`}
                onClick={() => setLinks((prev) => prev.filter((l) => l !== link))}
              >
                <X size={14} aria-hidden="true" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      {linkOpen && (
        <LinkSearch
          onClose={() => setLinkOpen(false)}
          onPick={(link) => {
            setLinks((prev) =>
              prev.some((l) => l.type === link.type && l.id === link.id) ? prev : [...prev, link]
            );
            setLinkOpen(false);
          }}
        />
      )}

      <div className="flex flex-wrap items-center gap-1 border-t border-tr-border pt-2">
        <QuickKind
          icon={<ImageIcon size={16} aria-hidden="true" />}
          label={uploadingImages ? 'Đang tải…' : 'Ảnh / Video'}
          onClick={() => imageInput.current?.click()}
          disabled={!groupId || uploadingImages}
        />
        <input
          ref={imageInput}
          type="file"
          accept="image/*,video/mp4,video/webm"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            void uploadImages(event.target.files);
            event.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={attachMenu.toggle}
          aria-haspopup="menu"
          aria-expanded={attachMenu.open}
          disabled={!groupId}
          className={`inline-flex min-h-9 items-center gap-1.5 rounded-control px-2.5 text-sm text-tr-subtle hover:bg-tr-hover hover:text-tr-text disabled:opacity-50 ${focusRing}`}
        >
          <FileText size={16} aria-hidden="true" /> Tài liệu ▾
        </button>
        <Popover
          open={attachMenu.open}
          onClose={attachMenu.close}
          anchor={attachMenu.anchor}
          title="Đính kèm tài liệu"
          width={300}
        >
          <PopoverItem
            onClick={() => {
              attachMenu.close();
              setPicker('mine');
            }}
          >
            <span>
              <b className="block">Từ tài liệu của tôi</b>
              <span className="text-xs text-tr-subtle">
                Tệp cá nhân — nhóm xem qua bài hoặc nhận bản sao
              </span>
            </span>
          </PopoverItem>
          <PopoverItem
            onClick={() => {
              attachMenu.close();
              setPicker('shared');
            }}
          >
            <span>
              <b className="block">Từ tài liệu chung</b>
              <span className="text-xs text-tr-subtle">Kho chung của công ty, phòng, dự án</span>
            </span>
          </PopoverItem>
          <PopoverItem
            onClick={() => {
              attachMenu.close();
              setPicker('upload');
            }}
          >
            <span>
              <b className="block">Tải tệp mới lên</b>
              <span className="text-xs text-tr-subtle">Lưu vào tài liệu của nhóm</span>
            </span>
          </PopoverItem>
        </Popover>
        <QuickKind
          icon={<Link2 size={16} aria-hidden="true" />}
          label="Thẻ CRM"
          onClick={() => setLinkOpen(true)}
        />
        {isAdmin && kind !== 'announcement' && (
          <QuickKind
            icon={<Megaphone size={16} aria-hidden="true" />}
            label="Thông báo"
            onClick={() => setKind('announcement')}
          />
        )}
        <Button
          variant="primary"
          className="ml-auto"
          disabled={!ready}
          onClick={() => create.mutate()}
        >
          {create.isPending ? 'Đang đăng…' : 'Đăng'}
        </Button>
      </div>
      {create.error && (
        <p role="alert" className="text-sm text-tr-danger">
          {create.error instanceof Error ? create.error.message : 'Không đăng được bài'}
        </p>
      )}

      {picker && groupId && (
        <AttachPicker
          open
          onClose={() => setPicker(null)}
          groupId={groupId}
          groupName={groupName}
          memberCount={group.data?.member_count}
          initialSource={picker}
          onPick={(items) =>
            setAttachments((prev) => [
              ...prev,
              ...items.filter((item) => !prev.some((p) => p.document_id === item.document_id)),
            ])
          }
        />
      )}
    </section>
  );
}

function QuickKind({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-control px-2.5 text-sm text-tr-subtle hover:bg-tr-hover hover:text-tr-text disabled:opacity-50 ${focusRing}`}
    >
      {icon}
      {label}
    </button>
  );
}

/** Tim va gan mot ban ghi CRM (chi trong pham vi nguoi dang). */
function LinkSearch({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (link: PickedLink) => void;
}) {
  const [type, setType] = useState<LinkType>('customer');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  const results = useQuery({
    queryKey: ['feed', 'link-search', type, debounced],
    queryFn: () => feedApi.linkSearch(type, debounced),
  });
  return (
    <div className="space-y-2 rounded-panel border border-tr-border bg-tr-panel p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={type}
          onChange={(event) => setType(event.target.value as LinkType)}
          aria-label="Loại bản ghi"
          className="w-36"
        >
          {(Object.keys(LINK_TYPE_LABEL) as LinkType[]).map((key) => (
            <option key={key} value={key}>
              {LINK_TYPE_LABEL[key]}
            </option>
          ))}
        </Select>
        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Gõ tên để tìm…"
          aria-label="Tìm bản ghi CRM"
          className="min-w-0 flex-1"
        />
        <IconButton label="Đóng tìm thẻ CRM" onClick={onClose}>
          <X size={14} aria-hidden="true" />
        </IconButton>
      </div>
      <ul className="max-h-48 overflow-y-auto">
        {(results.data ?? []).map((row) => (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => onPick({ type, id: row.id, label: row.label, sub: row.sub })}
              className={`flex w-full items-center justify-between gap-2 rounded-control px-2 py-1.5 text-left text-sm hover:bg-tr-hover ${focusRing}`}
            >
              <span className="truncate text-tr-text">{row.label}</span>
              {row.sub && <span className="truncate text-xs text-tr-muted">{row.sub}</span>}
            </button>
          </li>
        ))}
        {results.data?.length === 0 && (
          <li className="px-2 py-1.5 text-sm text-tr-muted">
            Không có kết quả trong phạm vi của bạn.
          </li>
        )}
      </ul>
    </div>
  );
}
