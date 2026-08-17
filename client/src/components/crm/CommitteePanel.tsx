/**
 * F-03 — Bản đồ nhóm ra quyết định, sự kiện bắt buộc và đối thủ.
 *
 * Ba khối này nằm chung một tab vì chúng là **dữ liệu nền của rubric**: không có
 * chúng thì AUTHORITY, RELATIONSHIP, TIMELINE, PRICE và PROCESS đều bị chặn trần điểm.
 *
 * Vai trò mua đọc từ `contacts.buying_role` đã có — không dựng từ điển vai trò thứ hai.
 * Ngày liên hệ gần nhất tính từ lịch sử tương tác, không lưu thành cột.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, Crown, Plus, Trash2, UserPlus } from 'lucide-react';
import { api } from '../../api/client';
import { Combobox } from '../common/Combobox';
import {
  Button,
  ColorBadge,
  DateInput,
  EmptyState,
  Field,
  FormError,
  Input,
  Panel,
  Select,
  Skeleton,
  focusRing,
} from '../common/ui';
import { t } from '../../i18n/vi';
import {
  EVENT_TYPE_LABELS,
  PRICE_POSITION_LABELS,
  STANCE_COLORS,
  STANCE_LABELS,
} from '../../i18n/scoring';
import { formatDate } from '../../lib/format';
import type { CommitteeResponse, DealCompetitor, DealEvent, Deal } from '../../types';

const ECONOMIC_ROLES = ['economic_buyer', 'decision_maker'];
const RECENT_DAYS = 30;

export function CommitteePanel({ deal }: { deal: Deal }) {
  const dealId = deal.id;
  const queryClient = useQueryClient();
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['deal', dealId] });
    queryClient.invalidateQueries({ queryKey: ['deals'] });
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <MembersBlock dealId={dealId} onChange={refresh} />
      <div className="space-y-4">
        <EventsBlock deal={deal} onChange={refresh} />
        <CompetitorsBlock dealId={dealId} onChange={refresh} />
      </div>
    </div>
  );
}

/* ---------- Nhóm ra quyết định ---------- */

function MembersBlock({ dealId, onChange }: { dealId: number; onChange: () => void }) {
  const [adding, setAdding] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['deal', dealId, 'committee'],
    queryFn: () => api.get<CommitteeResponse>(`/api/deals/${dealId}/committee`),
  });

  const add = useMutation({
    mutationFn: (contactId: number) =>
      api.post(`/api/deals/${dealId}/committee`, { contact_id: contactId }),
    onSuccess: onChange,
  });
  const update = useMutation({
    mutationFn: (vars: { contactId: number; patch: Record<string, unknown> }) =>
      api.patch(`/api/deals/${dealId}/committee/${vars.contactId}`, vars.patch),
    onSuccess: onChange,
  });
  const remove = useMutation({
    mutationFn: (contactId: number) => api.del(`/api/deals/${dealId}/committee/${contactId}`),
    onSuccess: onChange,
  });

  if (isLoading || !data) return <Skeleton className="h-64 rounded-panel" />;

  const { members, candidates } = data;
  const recentCutoff = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString().slice(0, 10);
  const recent = members.filter((m) => (m.last_contact_at ?? '') >= recentCutoff);
  const hasEconomic = members.some((m) => m.role && ECONOMIC_ROLES.includes(m.role));
  const hasChampion = members.some((m) => m.is_champion === 1 && m.stance === 'supporter');

  return (
    <Panel
      title="Nhóm ra quyết định"
      action={<span className="text-xs text-tr-muted">{members.length} người</span>}
    >
      <div className="mb-3 space-y-1.5">
        {recent.length <= 1 && members.length > 0 && (
          <Warning
            text={`Single-threaded — chỉ ${recent.length} người có tương tác trong ${RECENT_DAYS} ngày.`}
          />
        )}
        {!hasChampion && <Warning text="Chưa có champion nào ở trạng thái ủng hộ." />}
        {!hasEconomic && (
          <Warning text="Chưa xác định người duyệt ngân sách (economic buyer) — đây là điều kiện chặn forecast." />
        )}
      </div>

      {members.length === 0 && (
        <EmptyState
          message="Chưa đưa ai vào nhóm ra quyết định."
          hint="Thêm người liên hệ để chấm được Quyền hạn và Thân thiết."
        />
      )}

      <ul className="space-y-1.5">
        {members.map((member) => (
          <li key={member.contact_id} className="rounded-control border border-tr-border p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 text-sm font-medium text-tr-text">
                {member.full_name}
                {member.title && (
                  <span className="ml-1 text-xs text-tr-muted">· {member.title}</span>
                )}
              </span>
              {member.is_champion === 1 && (
                <Crown size={14} className="shrink-0 text-tr-warning" aria-label="Champion" />
              )}
              <ColorBadge color={STANCE_COLORS[member.stance]} small>
                {STANCE_LABELS[member.stance]}
              </ColorBadge>
              <button
                type="button"
                onClick={() => remove.mutate(member.contact_id)}
                className={`rounded p-1 text-tr-muted hover:text-tr-danger ${focusRing}`}
                aria-label={`Gỡ ${member.full_name} khỏi nhóm`}
              >
                <Trash2 size={13} />
              </button>
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-tr-muted">
                {member.role ? (t.buyingRole[member.role] ?? member.role) : 'Chưa rõ vai trò'}
              </span>
              <span className="text-tr-muted">
                {member.last_contact_at
                  ? `Liên hệ gần nhất ${formatDate(member.last_contact_at)}`
                  : 'Chưa có tương tác nào'}
              </span>
              <Select
                value={member.stance}
                aria-label={`Thái độ của ${member.full_name}`}
                onChange={(e) =>
                  update.mutate({ contactId: member.contact_id, patch: { stance: e.target.value } })
                }
                className="h-7 w-auto py-0 text-xs"
              >
                {Object.entries(STANCE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
              <label className="flex items-center gap-1 text-tr-subtle">
                <input
                  type="checkbox"
                  checked={member.is_champion === 1}
                  onChange={(e) =>
                    update.mutate({
                      contactId: member.contact_id,
                      patch: { is_champion: e.target.checked },
                    })
                  }
                />
                Champion
              </label>
              <label className="flex items-center gap-1 text-tr-subtle">
                Ảnh hưởng
                <Select
                  value={String(member.influence)}
                  aria-label={`Mức ảnh hưởng của ${member.full_name}`}
                  onChange={(e) =>
                    update.mutate({
                      contactId: member.contact_id,
                      patch: { influence: Number(e.target.value) },
                    })
                  }
                  className="h-7 w-auto py-0 text-xs"
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
          </li>
        ))}
      </ul>

      {candidates.length > 0 && (
        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-tr-border pt-3">
          <div className="min-w-[12rem] flex-1">
            <Field label="Thêm từ danh sách người liên hệ">
              <Combobox
                value={adding === '' ? '' : Number(adding)}
                onChange={(v) => setAdding(v === '' ? '' : String(v))}
                options={candidates.map((c) => ({
                  id: c.contact_id,
                  label: c.full_name + (c.role ? ` — ${t.buyingRole[c.role] ?? c.role}` : ''),
                }))}
                placeholder="— Chọn người —"
                searchPlaceholder="Tìm người liên hệ…"
                emptyText="Không tìm thấy người liên hệ."
                ariaLabel="Thêm từ danh sách người liên hệ"
              />
            </Field>
          </div>
          <Button
            variant="primary"
            disabled={!adding}
            onClick={() => {
              add.mutate(Number(adding));
              setAdding('');
            }}
          >
            <UserPlus size={14} /> Thêm
          </Button>
        </div>
      )}
      <FormError error={add.error ?? update.error} />
    </Panel>
  );
}

/* ---------- Sự kiện bắt buộc ---------- */

function EventsBlock({ deal, onChange }: { deal: Deal; onChange: () => void }) {
  const dealId = deal.id;
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    event_type: 'contract_expiry',
    description: '',
    event_date: null as string | null,
    confirmed: false,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['deal', dealId, 'events'],
    queryFn: () => api.get<DealEvent[]>(`/api/deals/${dealId}/events`),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['deal', dealId] });
    onChange();
  };
  const create = useMutation({
    mutationFn: () =>
      api.post(`/api/deals/${dealId}/events`, { ...form, is_primary: !data?.length }),
    onSuccess: () => {
      setForm({
        event_type: 'contract_expiry',
        description: '',
        event_date: null,
        confirmed: false,
      });
      refresh();
    },
  });
  const update = useMutation({
    mutationFn: (vars: { id: number; patch: Record<string, unknown> }) =>
      api.patch(`/api/deals/${dealId}/events/${vars.id}`, vars.patch),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/api/deals/${dealId}/events/${id}`),
    onSuccess: refresh,
  });

  if (isLoading || !data) return <Skeleton className="h-48 rounded-panel" />;

  const primary = data.find((e) => e.is_primary === 1) ?? data[0];
  const closeAfterEvent =
    primary?.event_date &&
    deal.expected_close_date &&
    deal.expected_close_date > primary.event_date;

  return (
    <Panel title="Sự kiện bắt buộc">
      <p className="mb-2 text-xs text-tr-muted">
        Ràng buộc <strong>của khách</strong> — dời được thì không phải sự kiện bắt buộc. Khác với
        Hành động tiếp theo, vốn là việc của ta.
      </p>

      {closeAfterEvent && (
        <Warning
          text={`Ngày dự kiến chốt (${formatDate(deal.expected_close_date)}) muộn hơn sự kiện bắt buộc (${formatDate(primary.event_date)}).`}
        />
      )}

      <ul className="space-y-1.5">
        {data.map((event) => (
          <li key={event.id} className="rounded-control border border-tr-border p-2.5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 text-tr-text">{event.description}</span>
              {event.is_primary === 1 && (
                <span className="rounded bg-tr-hover px-1.5 py-0.5 text-2xs text-tr-subtle">
                  Sự kiện chính
                </span>
              )}
              <button
                type="button"
                onClick={() => remove.mutate(event.id)}
                className={`rounded p-1 text-tr-muted hover:text-tr-danger ${focusRing}`}
                aria-label="Xóa sự kiện"
              >
                <Trash2 size={13} />
              </button>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-tr-muted">
              <span>{EVENT_TYPE_LABELS[event.event_type]}</span>
              <DateInput
                value={event.event_date}
                onChange={(value) => update.mutate({ id: event.id, patch: { event_date: value } })}
                className="h-7 w-auto py-0 text-xs"
              />
              <label className="flex items-center gap-1 text-tr-subtle">
                <input
                  type="checkbox"
                  checked={event.confirmed === 1}
                  onChange={(e) =>
                    update.mutate({ id: event.id, patch: { confirmed: e.target.checked } })
                  }
                />
                Khách đã xác nhận
              </label>
            </div>
          </li>
        ))}
      </ul>

      {primary?.event_date && <BackwardPlan dealId={dealId} />}

      <div className="mt-3 space-y-2 border-t border-tr-border pt-3">
        <FormError error={create.error} />
        <div className="flex flex-wrap gap-2">
          <Select
            value={form.event_type}
            aria-label="Loại sự kiện"
            onChange={(e) => setForm({ ...form, event_type: e.target.value })}
            className="w-auto"
          >
            {Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Mô tả sự kiện…"
            className="min-w-[10rem] flex-1"
          />
          <DateInput
            value={form.event_date}
            onChange={(value) => setForm({ ...form, event_date: value })}
            className="w-auto"
          />
          <Button
            variant="primary"
            disabled={form.description.trim().length < 3 || create.isPending}
            onClick={() => create.mutate()}
          >
            <Plus size={14} /> Thêm
          </Button>
        </div>
      </div>
    </Panel>
  );
}

/**
 * F-14 — lịch triển khai ngược.
 *
 * Rubric TIMELINE = 3 đòi "lịch triển khai ngược đã được thống nhất" — đây là chỗ tạo
 * ra nó. Mốc rơi vào quá khứ là bằng chứng deal sẽ trượt kỳ, hiện cảnh báo ngay.
 * Dùng lại module Nhắc hẹn đã có, không dựng lịch riêng.
 */
function BackwardPlan({ dealId }: { dealId: number }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const { data } = useQuery({
    queryKey: ['deal', dealId, 'backward-plan'],
    queryFn: () =>
      api.get<{
        event: { description: string; event_date: string } | null;
        milestones: { title: string; date: string; overdue: boolean }[];
      }>(`/api/deals/${dealId}/backward-plan`),
    enabled: expanded,
  });

  const create = useMutation({
    mutationFn: () =>
      api.post(`/api/deals/${dealId}/backward-plan`, {
        milestones: (data?.milestones ?? []).map(({ title, date }) => ({ title, date })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      setExpanded(false);
    },
  });

  const overdueCount = (data?.milestones ?? []).filter((m) => m.overdue).length;

  return (
    <div className="mt-3 border-t border-tr-border pt-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={`text-xs font-semibold text-tr-primary hover:underline ${focusRing}`}
        aria-expanded={expanded}
      >
        <CalendarClock size={12} className="mr-1 inline" aria-hidden="true" />
        Lịch triển khai ngược
      </button>

      {expanded && data && (
        <div className="mt-2 space-y-2">
          {overdueCount > 0 && (
            <Warning
              text={`${overdueCount} mốc đã rơi vào quá khứ — theo lịch này deal sẽ trượt kỳ, trừ khi rút ngắn được quy trình.`}
            />
          )}
          <ul className="space-y-1 text-xs">
            {data.milestones.map((m) => (
              <li key={m.title} className="flex items-center gap-2">
                <span
                  className={`w-24 tabular-nums ${m.overdue ? 'text-tr-danger' : 'text-tr-muted'}`}
                >
                  {formatDate(m.date)}
                </span>
                <span className="text-tr-text">{m.title}</span>
              </li>
            ))}
          </ul>
          <Button
            variant="primary"
            disabled={create.isPending || data.milestones.length === 0}
            onClick={() => create.mutate()}
          >
            Tạo nhắc hẹn cho các mốc
          </Button>
          <FormError error={create.error} />
        </div>
      )}
    </div>
  );
}

/* ---------- Đối thủ ---------- */

function CompetitorsBlock({ dealId, onChange }: { dealId: number; onChange: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['deal', dealId, 'competitors'],
    queryFn: () =>
      api.get<{ items: DealCompetitor[]; known: { name: string }[] }>(
        `/api/deals/${dealId}/competitors`
      ),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['deal', dealId] });
    onChange();
  };
  const create = useMutation({
    mutationFn: () => api.post(`/api/deals/${dealId}/competitors`, { name }),
    onSuccess: () => {
      setName('');
      refresh();
    },
  });
  const update = useMutation({
    mutationFn: (vars: { id: number; patch: Record<string, unknown> }) =>
      api.patch(`/api/deals/${dealId}/competitors/${vars.id}`, vars.patch),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/api/deals/${dealId}/competitors/${id}`),
    onSuccess: refresh,
  });

  if (isLoading || !data) return <Skeleton className="h-48 rounded-panel" />;

  return (
    <Panel title="Đối thủ">
      {data.items.length === 0 && (
        <p className="text-xs text-tr-muted">
          Chưa có đối thủ nào. Không biết mặt bằng giá thì theo rubric, yếu tố Giá cả bằng 0.
        </p>
      )}

      <ul className="space-y-1.5">
        {data.items.map((c) => (
          <li key={c.id} className="rounded-control border border-tr-border p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 text-sm font-medium text-tr-text">{c.name}</span>
              {c.shaped_requirements === 1 && (
                <ColorBadge color="#e8a33d" small>
                  Đã soạn tiêu chí
                </ColorBadge>
              )}
              <button
                type="button"
                onClick={() => remove.mutate(c.id)}
                className={`rounded p-1 text-tr-muted hover:text-tr-danger ${focusRing}`}
                aria-label={`Xóa ${c.name}`}
              >
                <Trash2 size={13} />
              </button>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-tr-subtle">
              <label className="flex items-center gap-1">
                Giá của họ
                <Select
                  value={c.price_position}
                  aria-label={`Vị thế giá của ${c.name}`}
                  onChange={(e) =>
                    update.mutate({ id: c.id, patch: { price_position: e.target.value } })
                  }
                  className="h-7 w-auto py-0 text-xs"
                >
                  {Object.entries(PRICE_POSITION_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={c.incumbent === 1}
                  onChange={(e) =>
                    update.mutate({ id: c.id, patch: { incumbent: e.target.checked } })
                  }
                />
                Đang cung cấp
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={c.shaped_requirements === 1}
                  onChange={(e) =>
                    update.mutate({ id: c.id, patch: { shaped_requirements: e.target.checked } })
                  }
                />
                Đã tham gia soạn tiêu chí
              </label>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap gap-2 border-t border-tr-border pt-3">
        <Input
          list={`competitors-${dealId}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tên đối thủ…"
          className="min-w-[10rem] flex-1"
        />
        <datalist id={`competitors-${dealId}`}>
          {data.known.map((k) => (
            <option key={k.name} value={k.name} />
          ))}
        </datalist>
        <Button
          variant="primary"
          disabled={!name.trim() || create.isPending}
          onClick={() => create.mutate()}
        >
          <Plus size={14} /> Thêm
        </Button>
      </div>
      <FormError error={create.error} />
    </Panel>
  );
}

function Warning({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-1.5 rounded-control border border-tr-warning/50 bg-tr-warning/10 px-2.5 py-1.5 text-xs text-tr-text">
      <AlertTriangle size={12} className="mt-0.5 shrink-0 text-tr-warning" aria-hidden="true" />
      {text}
    </p>
  );
}
