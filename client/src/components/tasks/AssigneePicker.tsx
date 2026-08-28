import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Combobox, type ComboboxOption } from '../common/Combobox';
import { Field, focusRing } from '../common/ui';
import { t } from '../../i18n/vi';
import type { Assignee, Contact, OrgKind } from '../../types';

/** Màu chip theo tổ chức: nhìn thẻ là biết việc đang nằm ở bên mình hay bên khách. */
const ORG_TONE: Record<OrgKind, string> = {
  own: 'bg-tr-primary/15 text-tr-primary',
  customer: 'bg-amber-500/15 text-amber-500',
  partner: 'bg-emerald-500/15 text-emerald-500',
  vendor: 'bg-violet-500/15 text-violet-400',
};

/**
 * Danh bạ người có thể giao việc.
 *
 * Dùng chung một truy vấn cho mọi ô chọn — `staleTime` dài vì danh bạ đổi rất
 * hiếm so với số lần mở form.
 */
export function useAssignees() {
  return useQuery({
    queryKey: ['assignees'],
    queryFn: () => api.get<Assignee[]>('/api/contacts/assignable'),
    staleTime: 5 * 60_000,
  });
}

/**
 * Tao nhanh mot lien he noi bo tu o chon nguoi phu trach.
 *
 * Khong co API tao lien he doc lap — moi lien he phai thuoc mot khach hang.
 * O day suy ra "cong ty cua toi" tu chinh lien he `is_me` da co (khong the
 * doan bua ID), nen tra ve undefined neu chua co ai duoc danh dau `is_me`.
 */
function useQuickCreateAssignee(
  assignees: Assignee[]
): ((fullName: string) => Promise<ComboboxOption>) | undefined {
  const queryClient = useQueryClient();
  const ownOrgId = assignees.find((a) => a.is_me)?.org_id;
  if (ownOrgId == null) return undefined;
  return async (fullName) => {
    const created = await api.post<Contact>(`/api/customers/${ownOrgId}/contacts`, {
      full_name: fullName,
    });
    queryClient.invalidateQueries({ queryKey: ['assignees'] });
    return { id: created.id, label: created.full_name };
  };
}

/** Hai chữ cái đầu — họ tên tiếng Việt lấy chữ đầu của từ đầu và từ cuối. */
export function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
  return (first + last).toUpperCase();
}

/**
 * Ô chọn người phụ trách, nhóm theo tổ chức.
 *
 * CỐ Ý không phải một `LinkSelect`: các ô liên kết CRM ràng buộc nhau theo chuỗi
 * sở hữu và bị xóa theo khi đổi khách hàng. Người phụ trách độc lập hoàn toàn —
 * đổi khách hàng của công việc không làm mất người đang làm nó.
 */
export function AssigneePicker({
  value,
  onChange,
  label = t.card.assignee,
  hint,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  label?: string;
  hint?: string;
}) {
  const { data: assignees = [] } = useAssignees();
  const onQuickCreate = useQuickCreateAssignee(assignees);

  return (
    <Field label={label} hint={hint}>
      <Combobox
        value={value ?? ''}
        onChange={(v) => onChange(v === '' ? null : v)}
        options={assignees.map((p) => ({
          id: p.id,
          label: `${p.full_name}${p.is_me ? ' (tôi)' : ''}${p.title ? ` — ${p.title}` : ''}`,
          sublabel: `${p.org_name} · ${t.orgKind[p.org_kind]}`,
        }))}
        placeholder={`— ${t.card.unassigned} —`}
        searchPlaceholder="Tìm người phụ trách…"
        emptyText="Không tìm thấy ai phù hợp."
        ariaLabel={label}
        onQuickCreate={onQuickCreate}
        quickCreateLabel={(q) => `+ Tạo người mới "${q}"`}
      />
    </Field>
  );
}

/**
 * Ô chọn gọn cho một dòng bảng / dòng cây — không nhãn, không viền cho tới khi rê chuột.
 * Cùng dữ liệu với `AssigneePicker`, khác cách trình bày.
 */
export function AssigneeSelect({
  value,
  onChange,
  taskTitle,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  taskTitle: string;
}) {
  const { data: assignees = [] } = useAssignees();
  const onQuickCreate = useQuickCreateAssignee(assignees);

  return (
    <Combobox
      value={value ?? ''}
      onChange={(v) => onChange(v === '' ? null : v)}
      options={assignees.map((p) => ({
        id: p.id,
        label: `${p.full_name}${p.is_me ? ' (tôi)' : ''}`,
        sublabel: `${p.org_name} · ${t.orgKind[p.org_kind]}`,
      }))}
      placeholder={`— ${t.card.unassigned} —`}
      searchPlaceholder="Tìm người phụ trách…"
      emptyText="Không tìm thấy ai phù hợp."
      ariaLabel={`${t.card.assignee}: ${taskTitle}`}
      triggerClassName={`flex max-w-36 items-center justify-between gap-1 rounded-control border border-transparent bg-transparent px-1 py-0.5 text-xs text-tr-subtle outline-none transition hover:border-tr-border hover:bg-tr-panel focus:border-tr-primary ${focusRing}`}
      onQuickCreate={onQuickCreate}
      quickCreateLabel={(q) => `+ Tạo người mới "${q}"`}
    />
  );
}

/** Huy hiệu người phụ trách trên thẻ / dòng bảng. `compact` chỉ hiện chữ cái đầu. */
export function AssigneeChip({
  name,
  orgKind,
  orgName,
  compact = false,
}: {
  name?: string | null;
  orgKind?: OrgKind | null;
  orgName?: string | null;
  compact?: boolean;
}) {
  if (!name) return null;
  const tone = ORG_TONE[orgKind ?? 'customer'];
  const full = orgName ? `${name} · ${orgName}` : name;

  if (compact) {
    return (
      <span
        title={full}
        aria-label={`${t.card.assignee}: ${full}`}
        className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${tone}`}
      >
        {initialsOf(name)}
      </span>
    );
  }
  return (
    <span
      title={full}
      className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs ${tone}`}
    >
      <span className="text-xs font-semibold">{initialsOf(name)}</span>
      <span className="truncate">{name}</span>
    </span>
  );
}
