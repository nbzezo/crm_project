import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Lock, Search, UserPlus, X } from 'lucide-react';
import { Button, EmptyState, IconButton, Input, Select, Textarea, focusRing } from '../common/ui';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { useUiStore } from '../../stores/uiStore';
import {
  attachmentUrl,
  feedApi,
  feedKeys,
  fileSize,
  formatEventTime,
  relativeTime,
  type GroupDetail,
  type GroupFile,
  type GroupRole,
} from '../../lib/feed';
import { Avatar, FileTypeIcon, GroupIcon, SourceBadge } from './FeedBits';

const ROLE_LABEL: Record<GroupRole, string> = {
  admin: 'Quản trị',
  moderator: 'Kiểm duyệt',
  member: 'Thành viên',
};

/* ---------------- Tai lieu cua nhom ---------------- */

type FileFilter = 'all' | 'shared' | 'personal' | 'mine';

export function GroupFiles({ group }: { group: GroupDetail }) {
  const [filter, setFilter] = useState<FileFilter>('all');
  const [query, setQuery] = useState('');
  const files = useQuery({
    queryKey: feedKeys.files(group.id),
    queryFn: () => feedApi.files(group.id),
  });
  const rows = (files.data ?? []).filter((f) => {
    if (filter === 'shared' && f.source === 'personal') return false;
    if (filter === 'personal' && f.source !== 'personal') return false;
    if (filter === 'mine' && !f.mine) return false;
    return !query.trim() || f.name.toLowerCase().includes(query.trim().toLowerCase());
  });
  const count = (fn: (f: GroupFile) => boolean) => (files.data ?? []).filter(fn).length;
  const chips: { value: FileFilter; label: string }[] = [
    { value: 'all', label: `Tất cả · ${count(() => true)}` },
    { value: 'shared', label: `Chung & của nhóm · ${count((f) => f.source !== 'personal')}` },
    { value: 'personal', label: `Cá nhân được chia sẻ · ${count((f) => f.source === 'personal')}` },
    { value: 'mine', label: 'Của tôi' },
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {chips.map((chip) => (
          <button
            key={chip.value}
            type="button"
            aria-pressed={filter === chip.value}
            onClick={() => setFilter(chip.value)}
            className={`min-h-9 rounded-full border px-3 text-sm ${
              filter === chip.value
                ? 'border-tr-primary bg-tr-primary/10 font-semibold text-tr-primary'
                : 'border-tr-border bg-tr-card text-tr-text hover:bg-tr-hover'
            } ${focusRing}`}
          >
            {chip.label}
          </button>
        ))}
        <label className="ml-auto flex h-9 min-w-0 flex-[0_1_15rem] items-center gap-2 rounded-control border border-tr-border bg-tr-card px-2.5 focus-within:outline-2 focus-within:outline-tr-primary">
          <Search size={14} className="text-tr-muted" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm tệp…"
            aria-label="Tìm tệp trong nhóm"
            className="min-w-0 flex-1 bg-transparent text-sm text-tr-text outline-none placeholder:text-tr-muted"
          />
        </label>
      </div>
      {files.isLoading ? (
        <p className="text-sm text-tr-muted">Đang tải…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          message="Chưa có tệp nào"
          hint="Tệp đính kèm trong bài viết của nhóm sẽ được gom về đây."
        />
      ) : (
        <div className="overflow-x-auto rounded-panel border border-tr-border bg-tr-card">
          <table className="w-full min-w-[44rem] border-collapse text-sm">
            <thead className="bg-tr-surface text-left text-xs font-semibold text-tr-subtle">
              <tr>
                <th scope="col" className="px-3 py-2">
                  Tên tệp
                </th>
                <th scope="col" className="px-3 py-2">
                  Loại
                </th>
                <th scope="col" className="px-3 py-2">
                  Người đăng
                </th>
                <th scope="col" className="px-3 py-2">
                  Trong bài viết
                </th>
                <th scope="col" className="px-3 py-2">
                  Ngày
                </th>
                <th scope="col" className="px-3 py-2">
                  <span className="sr-only">Tải về</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((file) => (
                <tr key={file.attachment_id} className="border-t border-tr-border">
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2">
                      {file.accessible ? (
                        <FileTypeIcon name={file.file_name} mime={file.mime} />
                      ) : (
                        <Lock size={14} className="text-tr-muted" aria-hidden="true" />
                      )}
                      <span
                        className={`font-medium ${file.accessible ? 'text-tr-text' : 'text-tr-muted italic'}`}
                      >
                        {file.name}
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <SourceBadge source={file.source} />
                  </td>
                  <td className="px-3 py-2 text-tr-subtle">{file.poster_name ?? '—'}</td>
                  <td className="max-w-[16rem] truncate px-3 py-2">
                    <Link
                      to={`/feed/posts/${file.post_id}`}
                      className={`text-tr-primary hover:underline ${focusRing}`}
                    >
                      {file.post_excerpt || 'Xem bài'}
                    </Link>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-tr-subtle">
                    {relativeTime(file.created_at)}
                    {file.accessible && file.size ? ` · ${fileSize(file.size)}` : ''}
                  </td>
                  <td className="px-3 py-2">
                    {file.accessible && (
                      <a
                        href={attachmentUrl(file.attachment_id)}
                        aria-label={`Tải ${file.name}`}
                        className={`inline-flex h-9 w-9 items-center justify-center rounded-control text-tr-muted hover:bg-tr-hover hover:text-tr-text ${focusRing}`}
                      >
                        <Download size={16} aria-hidden="true" />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-tr-subtle">
        Tệp cá nhân vẫn thuộc người đăng: họ gỡ khỏi bài là tệp biến mất khỏi danh sách này. Tệp “bị
        giới hạn” là tài liệu chung bạn chưa có quyền xem.
      </p>
    </div>
  );
}

/* ---------------- Thanh vien ---------------- */

export function GroupMembers({ group }: { group: GroupDetail }) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const members = useQuery({
    queryKey: feedKeys.members(group.id),
    queryFn: () => feedApi.members(group.id),
  });
  const isAdmin = group.role === 'admin';
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: feedKeys.members(group.id) });
    void queryClient.invalidateQueries({ queryKey: feedKeys.group(group.id) });
  };
  const change = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: refresh,
    onError: (error) => pushToast(error instanceof Error ? error.message : 'Không thực hiện được'),
  });
  const rows = (members.data ?? []).filter(
    (m) => !query.trim() || m.full_name.toLowerCase().includes(query.trim().toLowerCase())
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-tr-subtle">
          {group.kind === 'company'
            ? 'Mọi nhân sự có tài khoản đều là thành viên.'
            : group.kind === 'unit'
              ? 'Thành viên tự đồng bộ theo sơ đồ tổ chức (cả các đơn vị bên dưới).'
              : group.kind === 'project'
                ? 'Thành viên tự đồng bộ: chủ dự án và người được giao việc trong dự án.'
                : 'Nhóm tự lập — quản trị nhóm thêm hoặc bớt thành viên.'}
        </p>
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Tìm thành viên…"
          aria-label="Tìm thành viên"
          className="ml-auto max-w-[14rem]"
        />
        {isAdmin && (
          <Button variant="primary" onClick={() => setAdding(true)}>
            <UserPlus size={16} aria-hidden="true" /> Thêm người
          </Button>
        )}
      </div>
      <ul className="divide-y divide-tr-border rounded-panel border border-tr-border bg-tr-card">
        {rows.map((member) => (
          <li key={member.contact_id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
            <Avatar id={member.contact_id} name={member.full_name} size={36} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-tr-text">
                {member.full_name}
              </span>
              <span className="block truncate text-xs text-tr-subtle">
                {[member.title, member.unit_name].filter(Boolean).join(' · ') || '—'}
                {member.source === 'manual' && group.kind !== 'custom' ? ' · thêm thủ công' : ''}
              </span>
            </span>
            {isAdmin ? (
              <Select
                value={member.role}
                onChange={(event) =>
                  change.mutate(() =>
                    feedApi.setRole(group.id, member.contact_id, event.target.value as GroupRole)
                  )
                }
                aria-label={`Vai trò của ${member.full_name}`}
                fullWidth={false}
                className="w-36"
              >
                {(Object.keys(ROLE_LABEL) as GroupRole[]).map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABEL[role]}
                  </option>
                ))}
              </Select>
            ) : (
              <span className="text-xs font-semibold text-tr-subtle">
                {ROLE_LABEL[member.role]}
              </span>
            )}
            {isAdmin && member.source === 'manual' && (
              <IconButton
                label={`Bỏ ${member.full_name} khỏi nhóm`}
                tone="danger"
                onClick={() =>
                  change.mutate(() => feedApi.removeMember(group.id, member.contact_id))
                }
              >
                <X size={16} aria-hidden="true" />
              </IconButton>
            )}
          </li>
        ))}
      </ul>
      {adding && (
        <PeoplePicker
          title={`Thêm người vào ${group.name}`}
          exclude={(members.data ?? []).map((m) => m.contact_id)}
          onClose={() => setAdding(false)}
          onConfirm={(ids) => {
            change.mutate(() => feedApi.addMembers(group.id, ids));
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}

function PeoplePicker({
  title,
  exclude,
  onClose,
  onConfirm,
}: {
  title: string;
  exclude: number[];
  onClose: () => void;
  onConfirm: (ids: number[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [picked, setPicked] = useState<Map<number, string>>(new Map());
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [query]);
  const people = useQuery({
    queryKey: ['feed', 'people', debounced],
    queryFn: () => feedApi.people(debounced),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      width="max-w-lg"
      footer={
        <>
          <Button onClick={onClose}>Hủy</Button>
          <Button
            variant="primary"
            disabled={picked.size === 0}
            onClick={() => onConfirm([...picked.keys()])}
          >
            Thêm {picked.size || ''} người
          </Button>
        </>
      }
    >
      <PeopleChooser
        query={query}
        setQuery={setQuery}
        people={(people.data ?? []).filter((p) => !exclude.includes(p.id))}
        picked={picked}
        setPicked={setPicked}
      />
    </Modal>
  );
}

function PeopleChooser({
  query,
  setQuery,
  people,
  picked,
  setPicked,
}: {
  query: string;
  setQuery: (value: string) => void;
  people: { id: number; name: string; unit: string | null }[];
  picked: Map<number, string>;
  setPicked: (value: Map<number, string>) => void;
}) {
  return (
    <div className="space-y-2">
      <Input
        type="search"
        autoFocus
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Tìm theo tên…"
        aria-label="Tìm nhân sự"
      />
      {picked.size > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Đã chọn">
          {[...picked.entries()].map(([id, name]) => (
            <li
              key={id}
              className="flex items-center gap-1 rounded-full bg-tr-primary/10 py-0.5 pr-1 pl-2.5 text-sm text-tr-primary"
            >
              {name}
              <button
                type="button"
                aria-label={`Bỏ chọn ${name}`}
                onClick={() => {
                  const next = new Map(picked);
                  next.delete(id);
                  setPicked(next);
                }}
                className={`inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-tr-primary/15 ${focusRing}`}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <ul className="max-h-72 overflow-y-auto rounded-panel border border-tr-border">
        {people.map((person) => (
          <li key={person.id}>
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-tr-hover">
              <input
                type="checkbox"
                checked={picked.has(person.id)}
                onChange={() => {
                  const next = new Map(picked);
                  if (next.has(person.id)) next.delete(person.id);
                  else next.set(person.id, person.name);
                  setPicked(next);
                }}
                className="h-4 w-4 accent-tr-primary"
              />
              <Avatar id={person.id} name={person.name} size={28} />
              <span className="min-w-0 flex-1 truncate text-sm text-tr-text">{person.name}</span>
              {person.unit && <span className="truncate text-xs text-tr-muted">{person.unit}</span>}
            </label>
          </li>
        ))}
        {people.length === 0 && (
          <li className="px-3 py-2 text-sm text-tr-muted">Không tìm thấy ai.</li>
        )}
      </ul>
    </div>
  );
}

/* ---------------- Su kien ---------------- */

export function GroupEvents({ groupId }: { groupId?: number }) {
  const events = useQuery({
    queryKey: feedKeys.events(groupId),
    queryFn: () => feedApi.events(groupId),
  });
  if (events.isLoading) return <p className="text-sm text-tr-muted">Đang tải…</p>;
  if ((events.data ?? []).length === 0)
    return (
      <EmptyState message="Chưa có sự kiện sắp tới" hint="Đăng bài loại Sự kiện để mời cả nhóm." />
    );
  return (
    <ul className="space-y-2">
      {(events.data ?? []).map((event) => (
        <li key={event.id}>
          <EventRow event={event} />
        </li>
      ))}
    </ul>
  );
}

export function EventRow({
  event,
  compact = false,
}: {
  event: {
    id: number;
    body: string;
    event_start_at: string;
    event_end_at: string | null;
    event_location: string;
    group_name: string;
    my_response: string | null;
  };
  compact?: boolean;
}) {
  const [date] = event.event_start_at.split('T');
  const [, month, day] = date.split('-');
  return (
    <Link
      to={`/feed/posts/${event.id}`}
      className={`flex items-start gap-3 rounded-panel ${compact ? 'py-1.5' : 'border border-tr-border bg-tr-card p-3'} hover:bg-tr-hover ${focusRing}`}
    >
      <span className="flex w-11 shrink-0 flex-col items-center rounded-control bg-tr-surface py-1">
        <b className="text-base leading-tight text-tr-danger">{day}</b>
        <span className="text-[10px] text-tr-subtle">TH{month}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-tr-text">
          {event.body.split('\n')[0] || 'Sự kiện'}
        </span>
        <span className="block truncate text-xs text-tr-subtle">
          {formatEventTime(event.event_start_at, event.event_end_at).split(' · ')[1]}
          {event.event_location ? ` · ${event.event_location}` : ''}
          {compact ? '' : ` · ${event.group_name}`}
        </span>
        {event.my_response === 'going' && (
          <span className="text-xs font-semibold text-tr-success">Bạn tham gia</span>
        )}
      </span>
    </Link>
  );
}

/* ---------------- Cong viec tu bai viet ---------------- */

export function GroupTasks({ groupId }: { groupId: number }) {
  const openCard = useUiStore((s) => s.openCard);
  const tasks = useQuery({
    queryKey: feedKeys.tasks(groupId),
    queryFn: () => feedApi.tasks(groupId),
  });
  if (tasks.isLoading) return <p className="text-sm text-tr-muted">Đang tải…</p>;
  if ((tasks.data ?? []).length === 0)
    return (
      <EmptyState
        message="Chưa có công việc nào tạo từ bài viết"
        hint="Mở menu ••• của một bài viết và chọn “Tạo công việc từ bài”."
      />
    );
  return (
    <ul className="divide-y divide-tr-border rounded-panel border border-tr-border bg-tr-card">
      {(tasks.data ?? []).map((task) => (
        <li key={task.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${task.is_done ? 'bg-tr-success' : 'bg-tr-warning'}`}
            aria-hidden="true"
          />
          <button
            type="button"
            onClick={() => openCard(task.id)}
            className={`min-w-0 flex-1 truncate text-left text-sm font-medium ${task.is_done ? 'text-tr-muted line-through' : 'text-tr-text'} hover:text-tr-primary ${focusRing}`}
          >
            {task.title}
          </button>
          <span className="text-xs text-tr-subtle">
            {task.assignee_name ?? 'Chưa giao'}
            {task.due_date ? ` · hạn ${task.due_date.split('-').reverse().join('/')}` : ''}
          </span>
          <Link
            to={`/feed/posts/${task.post_id}`}
            className={`text-xs text-tr-primary hover:underline ${focusRing}`}
          >
            Bài gốc
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* ---------------- Cai dat nhom ---------------- */

export function GroupSettings({ group }: { group: GroupDetail }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const pushToast = useUiStore((s) => s.pushToast);
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description);
  const [visibility, setVisibility] = useState(group.visibility);
  const [posting, setPosting] = useState(group.posting);
  const [approval, setApproval] = useState(group.require_approval);
  const [archiving, setArchiving] = useState(false);
  const custom = group.kind === 'custom';
  const save = useMutation({
    mutationFn: () =>
      feedApi.updateGroup(group.id, {
        ...(custom ? { name: name.trim(), visibility } : {}),
        description: description.trim(),
        posting,
        require_approval: approval,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: feedKeys.all });
      pushToast('Đã lưu cài đặt nhóm', 'success');
    },
    onError: (error) => pushToast(error instanceof Error ? error.message : 'Không lưu được'),
  });
  const archive = useMutation({
    mutationFn: () => feedApi.archiveGroup(group.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: feedKeys.all });
      navigate('/feed');
    },
  });
  return (
    <div className="max-w-2xl space-y-4">
      {custom ? (
        <label className="block text-xs font-semibold text-tr-subtle">
          Tên nhóm
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1"
            maxLength={120}
          />
        </label>
      ) : (
        <p className="text-sm text-tr-subtle">
          Tên nhóm đi theo{' '}
          {group.kind === 'project'
            ? 'tên dự án'
            : group.kind === 'unit'
              ? 'tên đơn vị'
              : 'công ty'}
          .
        </p>
      )}
      <label className="block text-xs font-semibold text-tr-subtle">
        Giới thiệu
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          className="mt-1"
        />
      </label>
      {custom && (
        <fieldset className="space-y-1.5">
          <legend className="text-xs font-semibold text-tr-subtle">Ai thấy nhóm</legend>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              checked={visibility === 'public'}
              onChange={() => setVisibility('public')}
              className="mt-1 h-4 w-4 accent-tr-primary"
            />
            <span>
              <b className="text-tr-text">Công khai</b>
              <span className="block text-xs text-tr-subtle">
                Mọi người tìm thấy, đọc bài và tự tham gia.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              checked={visibility === 'private'}
              onChange={() => setVisibility('private')}
              className="mt-1 h-4 w-4 accent-tr-primary"
            />
            <span>
              <b className="text-tr-text">Kín</b>
              <span className="block text-xs text-tr-subtle">
                Chỉ thành viên thấy nhóm; quản trị thêm người.
              </span>
            </span>
          </label>
        </fieldset>
      )}
      <fieldset className="space-y-1.5">
        <legend className="text-xs font-semibold text-tr-subtle">Ai được đăng bài</legend>
        <label className="flex items-center gap-2 text-sm text-tr-text">
          <input
            type="radio"
            checked={posting === 'all'}
            onChange={() => setPosting('all')}
            className="h-4 w-4 accent-tr-primary"
          />
          Mọi thành viên
        </label>
        <label className="flex items-center gap-2 text-sm text-tr-text">
          <input
            type="radio"
            checked={posting === 'admins'}
            onChange={() => setPosting('admins')}
            className="h-4 w-4 accent-tr-primary"
          />
          Chỉ quản trị (kênh thông báo)
        </label>
      </fieldset>
      <label className="flex items-center gap-2 text-sm text-tr-text">
        <input
          type="checkbox"
          checked={approval}
          onChange={(event) => setApproval(event.target.checked)}
          className="h-4 w-4 accent-tr-primary"
        />
        Bài của thành viên phải được quản trị/kiểm duyệt duyệt trước khi hiện
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          disabled={save.isPending || (custom && !name.trim())}
          onClick={() => save.mutate()}
        >
          Lưu cài đặt
        </Button>
        {custom && (
          <Button variant="danger" onClick={() => setArchiving(true)}>
            Lưu trữ nhóm
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={archiving}
        title={`Lưu trữ nhóm “${group.name}”?`}
        message="Nhóm ẩn khỏi danh sách và không đăng bài mới được. Bài và tệp cũ vẫn được giữ."
        confirmLabel="Lưu trữ nhóm"
        pending={archive.isPending}
        onConfirm={() => archive.mutate()}
        onCancel={() => setArchiving(false)}
      />
    </div>
  );
}

/* ---------------- Kham pha + tao nhom ---------------- */

export function DiscoverGroups({ onCreate }: { onCreate: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const discover = useQuery({ queryKey: feedKeys.discover, queryFn: feedApi.discover });
  const join = useMutation({
    mutationFn: (id: number) => feedApi.join(id),
    onSuccess: (group) => {
      void queryClient.invalidateQueries({ queryKey: feedKeys.all });
      navigate(`/feed/groups/${group.id}`);
    },
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-tr-subtle">
          Nhóm công khai do đồng nghiệp lập — tham gia để đọc và trao đổi.
        </p>
        <Button variant="primary" onClick={onCreate}>
          + Tạo nhóm mới
        </Button>
      </div>
      {discover.isLoading ? (
        <p className="text-sm text-tr-muted">Đang tải…</p>
      ) : (discover.data ?? []).length === 0 ? (
        <EmptyState
          message="Chưa có nhóm công khai nào khác"
          hint="Lập nhóm theo chủ đề: chia sẻ kiến thức, an ninh mạng, CLB…"
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(discover.data ?? []).map((group) => (
            <li
              key={group.id}
              className="flex flex-col gap-3 rounded-panel border border-tr-border bg-tr-card p-4"
            >
              <div className="flex items-center gap-3">
                <GroupIcon id={group.id} name={group.name} color={group.color} size={44} />
                <div className="min-w-0">
                  <Link
                    to={`/feed/groups/${group.id}`}
                    className={`block truncate font-semibold text-tr-text hover:text-tr-primary ${focusRing}`}
                  >
                    {group.name}
                  </Link>
                  <div className="text-xs text-tr-subtle">
                    {group.member_count} thành viên · {group.post_count} bài viết
                  </div>
                </div>
              </div>
              {group.description && (
                <p className="line-clamp-3 text-sm text-tr-subtle">{group.description}</p>
              )}
              <Button
                className="mt-auto"
                disabled={join.isPending}
                onClick={() => join.mutate(group.id)}
              >
                Tham gia
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CreateGroupDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [picked, setPicked] = useState<Map<number, string>>(new Map());
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [query]);
  const people = useQuery({
    queryKey: ['feed', 'people', debounced],
    queryFn: () => feedApi.people(debounced),
  });
  const create = useMutation({
    mutationFn: () =>
      feedApi.createGroup({
        name: name.trim(),
        description: description.trim(),
        visibility,
        member_ids: [...picked.keys()],
      }),
    onSuccess: (group) => {
      void queryClient.invalidateQueries({ queryKey: feedKeys.all });
      onClose();
      navigate(`/feed/groups/${group.id}`);
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      dirty={Boolean(name || description || picked.size)}
      title="Tạo nhóm mới"
      width="max-w-xl"
      footer={
        <>
          <Button onClick={onClose}>Hủy</Button>
          <Button
            variant="primary"
            disabled={!name.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            Tạo nhóm
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block text-xs font-semibold text-tr-subtle">
          Tên nhóm *
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            className="mt-1"
            placeholder="Ví dụ: Chia sẻ kiến thức IT"
          />
        </label>
        <label className="block text-xs font-semibold text-tr-subtle">
          Giới thiệu
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
            className="mt-1"
          />
        </label>
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="mb-1 text-xs font-semibold text-tr-subtle">Ai thấy nhóm</legend>
          {(
            [
              ['public', 'Công khai', 'Mọi người tìm thấy và tự tham gia'],
              ['private', 'Kín', 'Chỉ người được mời thấy nhóm'],
            ] as const
          ).map(([value, label, hint]) => (
            <label
              key={value}
              className={`flex cursor-pointer items-start gap-2 rounded-panel border p-3 text-sm ${
                visibility === value ? 'border-tr-primary bg-tr-primary/5' : 'border-tr-border'
              }`}
            >
              <input
                type="radio"
                checked={visibility === value}
                onChange={() => setVisibility(value)}
                className="mt-1 h-4 w-4 accent-tr-primary"
              />
              <span>
                <b className="text-tr-text">{label}</b>
                <span className="block text-xs text-tr-subtle">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div>
          <div className="mb-1 text-xs font-semibold text-tr-subtle">Mời thành viên</div>
          <PeopleChooser
            query={query}
            setQuery={setQuery}
            people={people.data ?? []}
            picked={picked}
            setPicked={setPicked}
          />
        </div>
        {create.error && (
          <p role="alert" className="text-sm text-tr-danger">
            {create.error instanceof Error ? create.error.message : 'Không tạo được nhóm'}
          </p>
        )}
      </div>
    </Modal>
  );
}

/** Ten hien thi ngan cua vai tro — dung o tieu de nhom. */
export function roleLabel(role: GroupRole | null): string | null {
  return role ? ROLE_LABEL[role] : null;
}
