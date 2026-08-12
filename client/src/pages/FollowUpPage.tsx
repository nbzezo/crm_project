import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  Copy,
  Mail,
  MessageCircle,
  Phone,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { api } from '../api/client';
import { Modal } from '../components/common/Modal';
import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  FormError,
  Panel,
  Select,
  SkeletonRows,
  Textarea,
  focusRing,
} from '../components/common/ui';
import { AssigneeChip } from '../components/tasks/AssigneePicker';
import { CardStatusChip } from '../components/tasks/CardStatusControl';
import { daysFromToday } from '../components/tasks/TaskPresentation';
import { NUDGE_CHANNELS } from '@workflow/contracts';
import { t } from '../i18n/vi';
import { formatDateShort } from '../lib/format';
import { invalidateCardViews } from '../lib/queryKeys';
import { useUiStore } from '../stores/uiStore';
import type { NudgeChannel, TaskRow } from '../types';

/**
 * Trong bao lâu nữa thì một việc đáng nhắc.
 *
 * 3 ngày, không phải "đến hạn hôm nay": nhắc vào đúng ngày hết hạn thì đã muộn —
 * người phụ trách không còn thời gian để làm.
 */
const NUDGE_HORIZON_DAYS = 3;

interface DraftResult {
  subject: string;
  message: string;
  meta: { requestId: string; provider: string; model: string };
}

/** Nhóm việc theo người phụ trách, người nhiều việc quá hạn nhất lên trước. */
interface Group {
  key: string;
  contactId: number | null;
  name: string | null;
  orgName: string | null;
  orgKind: TaskRow['assignee_org_kind'];
  phone: string | null;
  email: string | null;
  zalo: string | null;
  tasks: TaskRow[];
  overdue: number;
}

/**
 * Màn “Cần nhắc”: gom mọi việc đang cần một cú hích, nhóm theo người phụ trách.
 *
 * Ứng dụng không có kênh gửi ra ngoài (không SMTP, không Zalo API) nên trang này
 * KHÔNG gửi gì cả — nó soạn sẵn nội dung, mở `zalo.me`/`mailto:` hoặc copy vào
 * clipboard, rồi ghi lại rằng bạn đã nhắc. Giả vờ đã gửi còn nguy hiểm hơn không
 * có tính năng, vì bạn sẽ tin là lời nhắc đã tới nơi.
 */
export default function FollowUpPage() {
  const openCard = useUiStore((s) => s.openCard);
  const [drafting, setDrafting] = useState<Group | null>(null);

  const {
    data: tasks = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['tasks', 'follow-up'],
    queryFn: () => api.get<TaskRow[]>('/api/views/tasks?done=0'),
  });

  const needsNudge = tasks.filter((task) => {
    if (task.parent_id) return false; // việc con đi theo việc cha, nhắc hai lần là thừa
    const days = daysFromToday(task.due_date);
    const dueSoon = days !== null && days <= NUDGE_HORIZON_DAYS;
    const waiting = task.status === 'blocked' || task.status === 'waiting_customer';
    return dueSoon || waiting;
  });

  const groups = groupByAssignee(needsNudge);

  /*
   * `h1` nam NGOAI cac nhanh loading/error: route khai bao `visibleHeading` nen
   * App khong tu chen tieu de sr-only nua — thieu no la trang khong co h1 nao,
   * hong ca dieu huong ban phim lan bo doc man hinh.
   */
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold tracking-tight text-tr-text">{t.nav.followUp}</h1>
      <p className="max-w-3xl text-sm text-tr-subtle">
        Việc quá hạn, sắp đến hạn trong {NUDGE_HORIZON_DAYS} ngày, hoặc đang bị chặn / chờ khách
        phản hồi — gom theo người phụ trách. Ứng dụng không tự gửi tin: nó soạn sẵn nội dung để bạn
        copy hoặc mở Zalo / email, rồi ghi lại là đã nhắc.
      </p>

      {isLoading ? (
        <div className="rounded-panel border border-tr-border bg-tr-panel">
          <SkeletonRows rows={6} cols={4} />
        </div>
      ) : error ? (
        <ErrorState onRetry={() => refetch()} />
      ) : groups.length === 0 ? (
        <EmptyState
          message="Không có việc nào cần nhắc."
          hint={`Mọi việc đang mở đều còn hơn ${NUDGE_HORIZON_DAYS} ngày và không có việc nào bị chặn.`}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {groups.map((group) => (
            <Panel
              key={group.key}
              title={group.name ?? t.card.unassigned}
              action={
                group.contactId !== null ? (
                  <Button size="sm" onClick={() => setDrafting(group)}>
                    <Sparkles size={14} aria-hidden="true" /> Soạn lời nhắc
                  </Button>
                ) : undefined
              }
            >
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                {group.name ? (
                  <AssigneeChip name={group.name} orgKind={group.orgKind} orgName={group.orgName} />
                ) : (
                  /* Việc chưa giao là rủi ro lớn nhất ở đây: không có ai để nhắc. */
                  <span className="inline-flex items-center gap-1 rounded-full bg-tr-danger/15 px-2 py-0.5 text-tr-danger">
                    <UserRound size={12} aria-hidden="true" /> Chưa có người phụ trách
                  </span>
                )}
                {group.overdue > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-tr-danger/15 px-2 py-0.5 font-semibold text-tr-danger">
                    <AlertTriangle size={12} aria-hidden="true" /> {group.overdue} quá hạn
                  </span>
                )}
                <span className="text-tr-muted">{group.tasks.length} việc</span>
              </div>

              <ul className="space-y-1">
                {group.tasks.map((task) => (
                  <li key={task.id}>
                    <button
                      type="button"
                      onClick={() => openCard(task.id, 'drawer')}
                      className={`flex min-h-11 w-full items-center gap-2 rounded-control px-1.5 py-2 text-left transition hover:bg-tr-hover ${focusRing}`}
                    >
                      <span className="min-w-0 flex-1 truncate text-sm text-tr-text">
                        {task.title}
                      </span>
                      <CardStatusChip status={task.status} blockedReason={task.blocked_reason} />
                      <DueBadge dueDate={task.due_date} />
                      <NudgeCount count={task.nudge_count} lastAt={task.last_nudged_at} />
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>
          ))}
        </div>
      )}

      <NudgeDialog group={drafting} onClose={() => setDrafting(null)} />
    </div>
  );
}

function DueBadge({ dueDate }: { dueDate: string | null }) {
  const days = daysFromToday(dueDate);
  if (days === null || !dueDate) return null;
  const tone = days < 0 ? 'bg-tr-danger/15 text-tr-danger' : 'bg-tr-warning/15 text-tr-warning';
  const label = days < 0 ? `trễ ${Math.abs(days)} ngày` : days === 0 ? 'hôm nay' : `${days} ngày`;
  return (
    <span
      title={formatDateShort(dueDate)}
      className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-medium ${tone}`}
    >
      {label}
    </span>
  );
}

/** “Đã nhắc 3 lần, lần cuối 5 ngày trước” — thứ biến việc theo đuổi thành số đo được. */
function NudgeCount({ count, lastAt }: { count?: number; lastAt?: string | null }) {
  if (!count) return null;
  const days = lastAt ? daysFromToday(lastAt.slice(0, 10)) : null;
  const since = days === null ? '' : days === 0 ? ' · hôm nay' : ` · ${Math.abs(days)} ngày trước`;
  return (
    <span
      className="shrink-0 rounded-full bg-tr-hover px-2 py-0.5 text-2xs text-tr-muted"
      title={`Đã nhắc ${count} lần${since}`}
    >
      đã nhắc {count}
      {since}
    </span>
  );
}

/**
 * Soạn nội dung nhắc rồi ghi lại một lần nhắc.
 *
 * Nút gửi thật sự chỉ có ba: copy, mở Zalo, mở email — tất cả đều rời khỏi ứng
 * dụng. Việc ghi nhật ký là bước riêng và người dùng phải bấm, vì chỉ họ biết
 * mình có thực sự gửi hay không.
 */
function NudgeDialog({ group, onClose }: { group: Group | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const [message, setMessage] = useState('');
  const [subject, setSubject] = useState('');
  const [channel, setChannel] = useState<NudgeChannel>('zalo');
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  const open = group !== null;
  if (group && loadedKey !== group.key) {
    setLoadedKey(group.key);
    setSubject('');
    setMessage(defaultMessage(group));
    setChannel(group.zalo ? 'zalo' : group.email ? 'email' : 'call');
  }

  const draft = useMutation({
    mutationFn: (tone: 'friendly' | 'neutral' | 'firm') =>
      api.post<DraftResult>(`/api/nudges/${group?.tasks[0]?.id}/draft`, { tone }),
    onSuccess: (result) => {
      setMessage(result.message);
      setSubject(result.subject);
    },
  });

  /* Ghi nhat ky cho TUNG viec trong nhom: mot loi nhac cho ba viec van la ba lan
     theo duoi, va bo dem tren tung the phai phan anh dieu do. */
  const record = useMutation({
    mutationFn: async () => {
      for (const task of group?.tasks ?? []) {
        await api.post('/api/nudges', { card_id: task.id, channel, message });
      }
    },
    onSuccess: () => {
      invalidateCardViews(queryClient);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      pushToast(`Đã ghi nhận nhắc ${group?.tasks.length ?? 0} việc`, 'success');
      onClose();
    },
  });

  const copy = async () => {
    await navigator.clipboard.writeText(message);
    pushToast('Đã copy nội dung nhắc', 'success');
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-2xl"
      title={`Nhắc ${group?.name ?? ''}`}
      footer={
        <>
          <Button onClick={copy} disabled={!message.trim()}>
            <Copy size={15} aria-hidden="true" /> Copy
          </Button>
          {group?.zalo && (
            <a
              href={`https://zalo.me/${group.zalo.replace(/\D/g, '')}`}
              target="_blank"
              rel="noreferrer"
              className={`inline-flex h-9 items-center gap-1.5 rounded-control border border-tr-border px-3 text-sm text-tr-subtle transition hover:bg-tr-hover ${focusRing}`}
            >
              <MessageCircle size={15} aria-hidden="true" /> Mở Zalo
            </a>
          )}
          {group?.email && (
            <a
              href={`mailto:${group.email}?subject=${encodeURIComponent(subject || 'Nhắc tiến độ công việc')}&body=${encodeURIComponent(message)}`}
              className={`inline-flex h-9 items-center gap-1.5 rounded-control border border-tr-border px-3 text-sm text-tr-subtle transition hover:bg-tr-hover ${focusRing}`}
            >
              <Mail size={15} aria-hidden="true" /> Mở email
            </a>
          )}
          {group?.phone && (
            <a
              href={`tel:${group.phone.replace(/\s/g, '')}`}
              className={`inline-flex h-9 items-center gap-1.5 rounded-control border border-tr-border px-3 text-sm text-tr-subtle transition hover:bg-tr-hover ${focusRing}`}
            >
              <Phone size={15} aria-hidden="true" /> Gọi
            </a>
          )}
          <span className="flex-1" />
          <Button onClick={onClose}>{t.common.cancel}</Button>
          <Button
            variant="primary"
            disabled={record.isPending || !message.trim()}
            onClick={() => record.mutate()}
          >
            <Check size={15} aria-hidden="true" />
            {record.isPending ? t.common.saving : 'Đã nhắc — ghi nhật ký'}
          </Button>
        </>
      }
    >
      <FormError error={draft.error} />
      <FormError error={record.error} />

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div className="w-40">
          <Field label="Kênh đã dùng">
            <Select value={channel} onChange={(e) => setChannel(e.target.value as NudgeChannel)}>
              {NUDGE_CHANNELS.map((value) => (
                <option key={value} value={value}>
                  {t.nudgeChannel[value]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <span className="flex-1" />
        {(['friendly', 'neutral', 'firm'] as const).map((tone) => (
          <Button
            key={tone}
            size="sm"
            disabled={draft.isPending}
            onClick={() => draft.mutate(tone)}
          >
            <Sparkles size={13} aria-hidden="true" />
            {draft.isPending ? 'Đang soạn…' : TONE_LABEL[tone]}
          </Button>
        ))}
      </div>

      {subject && (
        <div className="mb-2">
          <Field label="Tiêu đề email">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="h-9 w-full rounded-control border border-tr-border bg-tr-panel px-3 text-sm text-tr-text outline-none focus:border-tr-primary"
            />
          </Field>
        </div>
      )}

      <Field label="Nội dung" hint="Kiểm tra lại trước khi gửi — AI có thể hiểu sai ngữ cảnh.">
        <Textarea rows={7} value={message} onChange={(e) => setMessage(e.target.value)} />
      </Field>

      <p className="mt-2 text-xs text-tr-muted">
        Ứng dụng không gửi tin thay bạn. Bấm “Đã nhắc” sau khi thực sự gửi để{' '}
        {group?.tasks.length ?? 0} việc trong nhóm này được ghi vào nhật ký nhắc.
      </p>
    </Modal>
  );
}

const TONE_LABEL = { friendly: 'Thân thiện', neutral: 'Trung tính', firm: 'Dứt khoát' };

/** Nội dung mặc định khi chưa gọi AI — vẫn dùng được nếu chưa cấu hình provider. */
function defaultMessage(group: Group): string {
  const lines = group.tasks
    .slice(0, 5)
    .map(
      (task) => `• ${task.title}${task.due_date ? ` (hạn ${formatDateShort(task.due_date)})` : ''}`
    );
  return `Chào ${group.name ?? 'anh/chị'},\n\nNhờ anh/chị cập nhật giúp tiến độ các việc sau:\n${lines.join('\n')}\n\nNếu có vướng mắc gì, anh/chị cho tôi biết để cùng xử lý nhé. Cảm ơn anh/chị.`;
}

function groupByAssignee(tasks: TaskRow[]): Group[] {
  const index = new Map<string, Group>();
  for (const task of tasks) {
    const key = String(task.assignee_contact_id ?? 'none');
    let group = index.get(key);
    if (!group) {
      group = {
        key,
        contactId: task.assignee_contact_id,
        name: task.assignee_name,
        orgName: task.assignee_org_name,
        orgKind: task.assignee_org_kind,
        phone: task.assignee_phone ?? null,
        email: task.assignee_email ?? null,
        zalo: task.assignee_zalo ?? null,
        tasks: [],
        overdue: 0,
      };
      index.set(key, group);
    }
    group.tasks.push(task);
    if ((daysFromToday(task.due_date) ?? 0) < 0) group.overdue += 1;
  }

  return [...index.values()].sort((a, b) => {
    // Chưa giao luôn đứng đầu: không có ai để nhắc là vấn đề cần xử lý trước.
    if (a.contactId === null) return -1;
    if (b.contactId === null) return 1;
    return b.overdue - a.overdue || b.tasks.length - a.tasks.length;
  });
}
