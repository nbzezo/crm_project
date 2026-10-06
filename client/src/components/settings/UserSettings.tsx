import { useMemo, useState, type ReactNode } from 'react';
import { MoreHorizontal, Search, UserPlus } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../api/client';
import {
  Button,
  EmptyState,
  Field,
  FormError,
  IconButton,
  Input,
  Panel,
  Select,
  SkeletonRows,
  TableHead,
} from '../common/ui';
import { Modal } from '../common/Modal';
import { Popover } from '../common/Popover';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { focusRing } from '../common/ui';
import { foldVietnamese } from '../../lib/settingsNav';
import { StatusBadge, type StatusTone } from './SettingsKit';
import { t } from '../../i18n/vi';
import { formatDateTime } from '../../lib/format';
import { useUiStore } from '../../stores/uiStore';
import { useAuthStore } from '../../stores/authStore';
import type { Assignee } from '../../types';
import {
  OrgUnitField,
  PositionPicker,
  useAccessOptions,
  type PositionChoice,
} from './UserAccessFields';

interface UserRow {
  id: number;
  username: string;
  email: string | null;
  full_name: string | null;
  contact_id: number | null;
  contact_name: string | null;
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  pending_invite: boolean;
  org_unit_id: number | null;
  org_unit_name: string | null;
  positions: {
    position_id: number;
    position_name: string;
    is_primary: boolean;
    scope_unit_id: number | null;
    scope_unit_name: string | null;
  }[];
}

function toChoices(user: UserRow): PositionChoice[] {
  return user.positions.map((row) => ({
    position_id: row.position_id,
    is_primary: row.is_primary,
    scope_unit_id: row.scope_unit_id,
  }));
}

/**
 * Sua vi tri va don vi cua mot tai khoan da co.
 *
 * Hai lenh ghi rieng (`/api/positions/assignments`, `/api/org-units/members`) vi
 * hai thu nay nam o hai bang va can hai quyen khac nhau — chi goi lenh nao that
 * su doi, de nguoi chi co mot trong hai quyen van luu duoc phan cua minh.
 */
function AccessDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const options = useAccessOptions();
  const [positions, setPositions] = useState<PositionChoice[]>(() => toChoices(user));
  const [orgUnitId, setOrgUnitId] = useState(user.org_unit_id ? String(user.org_unit_id) : '');

  const positionsChanged = JSON.stringify(positions) !== JSON.stringify(toChoices(user));
  const unitChanged = orgUnitId !== (user.org_unit_id ? String(user.org_unit_id) : '');

  const save = useMutation({
    mutationFn: async () => {
      if (positionsChanged && options.canAssign) {
        await api.put(`/api/positions/assignments/${user.id}`, { positions });
      }
      if (unitChanged && options.canPlace && user.contact_id) {
        await api.post('/api/org-units/members', {
          contact_ids: [user.contact_id],
          org_unit_id: orgUnitId ? Number(orgUnitId) : null,
        });
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      void queryClient.invalidateQueries({ queryKey: ['positions'] });
      void queryClient.invalidateQueries({ queryKey: ['org-units'] });
      pushToast(t.users.accessSaved, 'success');
      onClose();
    },
  });

  return (
    <Modal
      open
      onClose={onClose}
      dirty={positionsChanged || unitChanged}
      title={t.users.editAccessTitle.replace('{name}', user.full_name ?? user.username)}
      footer={
        <>
          <Button onClick={onClose}>{t.common.cancel}</Button>
          <Button
            variant="primary"
            disabled={save.isPending || (!positionsChanged && !unitChanged)}
            onClick={() => save.mutate()}
          >
            {save.isPending ? t.common.saving : t.common.save}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormError error={save.error} />
        <OrgUnitField
          options={options}
          value={orgUnitId}
          onChange={setOrgUnitId}
          hasContact={Boolean(user.contact_id)}
        />
        <PositionPicker options={options} value={positions} onChange={setPositions} />
      </div>
    </Modal>
  );
}

/** Ai dang giu contact nao — de o chon khong moi nguoi ta bam vao mot 409. */
function takenContacts(users: UserRow[] | undefined, exceptUserId?: number): Set<number> {
  return new Set(
    (users ?? [])
      .filter((row) => row.id !== exceptUserId && row.contact_id != null)
      .map((row) => row.contact_id as number)
  );
}

function ContactOptions({ staff, taken }: { staff: Assignee[]; taken: Set<number> }) {
  return (
    <>
      <option value="">{t.users.noContact}</option>
      {staff.map((person) => (
        <option key={person.id} value={person.id} disabled={taken.has(person.id)}>
          {person.full_name}
          {taken.has(person.id) ? ` ${t.users.contactTaken}` : ''}
        </option>
      ))}
    </>
  );
}

/**
 * Sua thong tin mot tai khoan, va (chi quan tri he thong) dat mat khau moi.
 *
 * Hai phan luu rieng: thong tin la PATCH /api/users/:id, mat khau la mot lenh co
 * hau qua rieng (huy moi phien, huy lien ket moi) nen co nut rieng — khong de no
 * xay ra chi vi ai do bam "Luu" sau khi sua mot chu trong ten.
 */
function InfoDialog({
  user,
  staff,
  taken,
  canSetPassword,
  onClose,
}: {
  user: UserRow;
  staff: Assignee[];
  taken: Set<number>;
  canSetPassword: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const [email, setEmail] = useState(user.email ?? '');
  const [fullName, setFullName] = useState(user.full_name ?? '');
  const [contactId, setContactId] = useState(user.contact_id ? String(user.contact_id) : '');
  const [password, setPassword] = useState('');
  const [requireChange, setRequireChange] = useState(true);
  const [generated, setGenerated] = useState<string | null>(null);

  const body: Record<string, unknown> = {};
  if (email.trim() !== (user.email ?? '')) body.email = email.trim();
  if (fullName.trim() !== (user.full_name ?? '')) body.full_name = fullName.trim();
  if (contactId !== (user.contact_id ? String(user.contact_id) : '')) {
    body.contact_id = contactId ? Number(contactId) : null;
  }
  const dirty = Object.keys(body).length > 0;

  const save = useMutation({
    mutationFn: () => api.patch<UserRow>(`/api/users/${user.id}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      pushToast(t.users.infoSaved, 'success');
      onClose();
    },
  });

  const setPw = useMutation({
    mutationFn: () =>
      api.post<UserRow & { generated_password: string | null }>(`/api/users/${user.id}/password`, {
        ...(password ? { password } : {}),
        require_change: requireChange,
      }),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      setPassword('');
      setGenerated(data.generated_password);
      pushToast(t.users.passwordSet, 'success');
    },
  });

  return (
    <Modal
      open
      onClose={onClose}
      dirty={dirty}
      title={t.users.editInfoTitle.replace('{name}', user.full_name ?? user.username)}
      footer={
        <>
          <Button onClick={onClose}>{generated ? t.common.close : t.common.cancel}</Button>
          <Button
            variant="primary"
            disabled={save.isPending || !dirty || !email.trim() || !fullName.trim()}
            onClick={() => save.mutate()}
          >
            {save.isPending ? t.common.saving : t.common.save}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormError error={save.error} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t.users.email} required>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label={t.users.fullName} required>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </Field>
        </div>
        <Field label={t.users.linkedContact} hint={t.users.contactChangeHint}>
          <Select value={contactId} onChange={(e) => setContactId(e.target.value)}>
            <ContactOptions staff={staff} taken={taken} />
          </Select>
        </Field>

        {canSetPassword ? (
          <div className="space-y-3 border-t border-tr-border pt-4">
            <h3 className="text-sm font-semibold text-tr-text">{t.users.setPassword}</h3>
            <p className="text-xs text-tr-muted">{t.users.setPasswordHint}</p>
            <FormError error={setPw.error} />
            <Field label={t.users.newPassword} hint={t.auth.newPasswordHint}>
              <Input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm text-tr-text">
              <input
                type="checkbox"
                checked={requireChange}
                onChange={(e) => setRequireChange(e.target.checked)}
              />
              {t.users.requireChange}
            </label>
            <Button
              variant="secondary"
              disabled={setPw.isPending || (password.length > 0 && password.length < 8)}
              onClick={() => setPw.mutate()}
            >
              {setPw.isPending ? t.common.saving : t.users.setPasswordSubmit}
            </Button>
            {generated ? (
              <div className="rounded-control border border-tr-border bg-tr-surface p-3">
                <p className="mb-1 text-sm text-tr-text">{t.users.generatedPassword}</p>
                <code className="block break-all text-sm font-semibold text-tr-text">
                  {generated}
                </code>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

type UserStatus = 'active' | 'pending' | 'mustChange' | 'locked';

const STATUS_META: Record<UserStatus, { label: string; tone: StatusTone }> = {
  active: { label: t.users.active, tone: 'ok' },
  pending: { label: t.users.pendingInvite, tone: 'warn' },
  mustChange: { label: t.users.mustChangePassword, tone: 'warn' },
  locked: { label: t.users.locked, tone: 'error' },
};

function statusOf(user: UserRow): UserStatus {
  if (!user.is_active) return 'locked';
  if (user.must_change_password) return 'mustChange';
  if (user.pending_invite) return 'pending';
  return 'active';
}

type Confirm = { kind: 'lock'; users: UserRow[] } | { kind: 'signOut'; user: UserRow };

/**
 * Quan ly tai khoan dang nhap.
 *
 * Tao tai khoan khong co o nhap mat khau: he thong gui lien ket kich hoat, chu
 * tai khoan tu dat mat khau. Ngoai le duy nhat la "Dat mat khau moi" trong hop
 * thoai Sua, chi cho quan tri he thong — va mac dinh bat nguoi do doi lai.
 *
 * 1.32.0: bang gon (ten + email, vi tri, don vi, chip trang thai, lan dang nhap);
 * nam nut tren moi hang gom vao menu "⋯"; them tim, loc trang thai/don vi, chon
 * nhieu; Khoa va Dang xuat moi thiet bi luon hoi lai; dien thoai hien the.
 */
export function UserSettings() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const myId = useAuthStore((s) => s.user?.id ?? null);
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [editingInfo, setEditingInfo] = useState<UserRow | null>(null);
  const [term, setTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<UserStatus | 'all'>('all');
  const [unitFilter, setUnitFilter] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [menu, setMenu] = useState<{ user: UserRow; anchor: HTMLElement } | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  /* Dat mat khau cho nguoi khac = dang nhap duoc duoi ten ho, nen may chu doi CA
     quan tri nguoi dung lan phan quyen o muc `all` (routes/users.ts). */
  const permissions = useAuthStore((s) => s.user?.permissions);
  const canSetPassword =
    permissions?.['admin.users:update'] === 'all' &&
    permissions?.['admin.positions:update'] === 'all';
  /* Tai khoan vua tao ma chua co vi tri: nhac ngay, kem nut gan — mot toast se
     troi mat truoc khi nguoi ta kip doc. */
  const [unassigned, setUnassigned] = useState<UserRow | null>(null);
  const access = useAccessOptions();
  /* Chi hien khi khong gui duoc thu (chua cau hinh SMTP hoac SMTP loi) — luc do
     khong con duong nao khac de kich hoat. */
  const [manualLink, setManualLink] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const users = useQuery({ queryKey: ['users'], queryFn: () => api.get<UserRow[]>('/api/users') });

  /* Chi nhan su cong ty minh moi gan duoc vao tai khoan: nguoi lien he ben khach
     hang khong dang nhap vao he thong cua ta. */
  const staff = useQuery({
    queryKey: ['contacts', 'assignable'],
    queryFn: () => api.get<Assignee[]>('/api/contacts/assignable'),
    select: (rows) => rows.filter((row) => row.org_kind === 'own'),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['users'] });

  const setActive = useMutation({
    mutationFn: async (vars: { ids: number[]; active: boolean }) => {
      for (const id of vars.ids) {
        await api.patch<UserRow>(`/api/users/${id}`, { is_active: vars.active });
      }
      return vars;
    },
    onSuccess: (vars) => {
      void invalidate();
      setConfirm(null);
      setSelected(new Set());
      pushToast(
        vars.active
          ? `Đã mở khoá ${vars.ids.length} tài khoản`
          : `Đã khoá ${vars.ids.length} tài khoản`,
        'success'
      );
    },
  });

  const invite = useMutation({
    mutationFn: async (ids: number[]) => {
      let last: { invite_link: string | null; invite_error: string | null } | null = null;
      for (const id of ids) {
        last = await api.post<{ invite_link: string | null; invite_error: string | null }>(
          `/api/users/${id}/invite`,
          {}
        );
      }
      return { last, count: ids.length };
    },
    onSuccess: ({ last, count }) => {
      setSelected(new Set());
      /* Khong gui duoc thu: chi hien lien ket tay khi moi MOT nguoi — hang loat
         thi bao loi, tung nguoi mot. */
      if (count === 1 && last?.invite_link) {
        setManualLink(last.invite_link);
        setInviteError(last.invite_error);
      } else if (last?.invite_error) {
        pushToast(t.users.inviteFailed.replace('{error}', last.invite_error), 'error');
      } else {
        pushToast(count === 1 ? t.users.inviteSent : `Đã gửi lại ${count} thư mời`, 'success');
      }
    },
  });

  const signOut = useMutation({
    mutationFn: (id: number) => api.post(`/api/users/${id}/sign-out`, {}),
    onSuccess: () => {
      setConfirm(null);
      pushToast('Đã đăng xuất tài khoản khỏi mọi thiết bị', 'success');
    },
  });

  const all = useMemo(() => users.data ?? [], [users.data]);
  const counts = useMemo(() => {
    const result: Record<UserStatus | 'all', number> = {
      all: all.length,
      active: 0,
      pending: 0,
      mustChange: 0,
      locked: 0,
    };
    for (const user of all) result[statusOf(user)] += 1;
    return result;
  }, [all]);
  const units = useMemo(
    () =>
      [...new Map(all.filter((u) => u.org_unit_id).map((u) => [u.org_unit_id, u.org_unit_name]))]
        .map(([id, name]) => ({ id: String(id), name: name ?? '' }))
        .sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    [all]
  );
  const rows = useMemo(() => {
    const words = foldVietnamese(term).split(/\s+/).filter(Boolean);
    return all.filter((user) => {
      if (statusFilter !== 'all' && statusOf(user) !== statusFilter) return false;
      if (unitFilter && String(user.org_unit_id ?? '') !== unitFilter) return false;
      if (words.length === 0) return true;
      const hay = foldVietnamese(`${user.full_name ?? ''} ${user.username} ${user.email ?? ''}`);
      return words.every((word) => hay.includes(word));
    });
  }, [all, term, statusFilter, unitFilter]);

  /* 403 nghia la tai khoan nay khong phai quan tri — an ca man thay vi hien mot
     bang rong kem thong bao loi do dang. */
  if (users.error instanceof ApiError && users.error.status === 403) return null;

  const selectable = rows.filter((user) => user.id !== myId);
  const selectedUsers = all.filter((user) => selected.has(user.id));
  const allChecked = selectable.length > 0 && selectable.every((user) => selected.has(user.id));
  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const openMenu = (user: UserRow, anchor: HTMLElement) => setMenu({ user, anchor });
  const busy = setActive.isPending || invite.isPending || signOut.isPending;

  const filters: { key: UserStatus | 'all'; label: string }[] = [
    { key: 'all', label: 'Tất cả' },
    { key: 'active', label: t.users.active },
    { key: 'pending', label: t.users.pendingInvite },
    { key: 'mustChange', label: t.users.mustChangePassword },
    { key: 'locked', label: t.users.locked },
  ];

  return (
    <Panel
      title={`${counts.all} tài khoản`}
      action={
        <Button variant="primary" onClick={() => setInviting(true)}>
          <UserPlus size={15} aria-hidden="true" /> Mời người dùng
        </Button>
      }
    >
      <FormError error={setActive.error ?? invite.error ?? signOut.error} />

      {manualLink ? (
        <div className="mb-4 rounded-control border border-tr-border bg-tr-surface p-3">
          <p className="mb-1 text-sm text-tr-text">
            {inviteError
              ? t.users.inviteFailed.replace('{error}', inviteError)
              : t.users.inviteLinkManual}
          </p>
          <code className="block break-all text-xs text-tr-subtle">{manualLink}</code>
          <Button className="mt-2" variant="secondary" onClick={() => setManualLink(null)}>
            {t.common.close}
          </Button>
        </div>
      ) : null}

      {unassigned ? (
        <div className="mb-4 rounded-control border border-tr-warning/40 bg-tr-surface p-3">
          <p className="text-sm text-tr-text">{t.users.noPositionWarning}</p>
          <div className="mt-2 flex gap-2">
            {access.canAssign ? (
              <Button
                variant="primary"
                onClick={() => {
                  setEditing(unassigned);
                  setUnassigned(null);
                }}
              >
                {t.users.editAccess}
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => setUnassigned(null)}>
              {t.common.close}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label
          className={`flex h-11 min-w-0 flex-1 items-center gap-2 rounded-control border border-tr-border bg-tr-panel px-2.5 sm:max-w-xs fine:h-9 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-tr-primary`}
        >
          <Search size={15} className="shrink-0 text-tr-muted" aria-hidden="true" />
          <input
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Tìm theo tên hoặc email"
            aria-label="Tìm người dùng"
            className="min-w-0 flex-1 bg-transparent text-sm text-tr-text outline-none placeholder:text-tr-muted"
          />
        </label>
        {units.length > 1 && (
          <Select
            fullWidth={false}
            aria-label="Lọc theo đơn vị"
            value={unitFilter}
            onChange={(event) => setUnitFilter(event.target.value)}
            className="max-w-56"
          >
            <option value="">Mọi đơn vị</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </Select>
        )}
      </div>
      <div role="group" aria-label="Lọc theo trạng thái" className="mb-3 flex flex-wrap gap-1.5">
        {filters
          .filter((filter) => filter.key === 'all' || counts[filter.key] > 0)
          .map((filter) => {
            const on = statusFilter === filter.key;
            return (
              <button
                key={filter.key}
                type="button"
                aria-pressed={on}
                onClick={() => setStatusFilter(filter.key)}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition ${focusRing} ${
                  on
                    ? 'border-tr-primary bg-tr-primary text-tr-on-primary'
                    : 'border-tr-border bg-tr-panel text-tr-subtle hover:bg-tr-hover'
                }`}
              >
                {filter.label}
                <span className="tabular-nums opacity-80">{counts[filter.key]}</span>
              </button>
            );
          })}
      </div>

      {selected.size > 0 && (
        <div
          role="region"
          aria-label="Thao tác hàng loạt"
          className="mb-3 flex flex-wrap items-center gap-2 rounded-control border border-tr-primary/30 bg-tr-primary/5 px-3 py-2 text-sm"
        >
          <b className="text-tr-primary">{selected.size} người đã chọn</b>
          <Button
            size="sm"
            disabled={busy || selectedUsers.every((user) => !user.email)}
            onClick={() =>
              invite.mutate(selectedUsers.filter((user) => user.email).map((user) => user.id))
            }
          >
            {t.users.resendInvite}
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={busy || selectedUsers.every((user) => !user.is_active)}
            onClick={() =>
              setConfirm({ kind: 'lock', users: selectedUsers.filter((user) => user.is_active) })
            }
          >
            Khoá…
          </Button>
          <span className="flex-1" />
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Bỏ chọn
          </Button>
        </div>
      )}

      {users.isPending ? <SkeletonRows rows={3} /> : null}

      {users.data && rows.length === 0 ? (
        <EmptyState
          message={all.length === 0 ? t.common.empty : 'Không có người dùng nào khớp bộ lọc.'}
        />
      ) : null}

      {rows.length > 0 ? (
        <>
          {/* Man rong: bang. `min-w` de bang cuon ngang thay vi bop cot. */}
          <div className="tr-scroll hidden overflow-x-auto md:block">
            <table className="w-full min-w-[48rem] text-sm">
              <TableHead>
                <tr>
                  <th scope="col" className="w-10 py-2 pr-2">
                    <input
                      type="checkbox"
                      aria-label="Chọn tất cả người dùng đang hiện"
                      checked={allChecked}
                      onChange={() =>
                        setSelected(
                          allChecked ? new Set() : new Set(selectable.map((user) => user.id))
                        )
                      }
                      className="h-4 w-4"
                    />
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    {t.users.fullName}
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    {t.users.positions}
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    {t.users.orgUnit}
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    {t.users.status}
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    {t.users.lastLogin}
                  </th>
                  <th scope="col" className="w-12 py-2">
                    <span className="sr-only">Thao tác</span>
                  </th>
                </tr>
              </TableHead>
              <tbody>
                {rows.map((user) => {
                  const status = STATUS_META[statusOf(user)];
                  return (
                    <tr
                      key={user.id}
                      className={`border-t border-tr-border ${selected.has(user.id) ? 'bg-tr-primary/5' : ''}`}
                    >
                      <td className="py-2 pr-2">
                        {user.id === myId ? null : (
                          <input
                            type="checkbox"
                            aria-label={`Chọn ${user.full_name ?? user.username}`}
                            checked={selected.has(user.id)}
                            onChange={() => toggle(user.id)}
                            className="h-4 w-4"
                          />
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <span className="block font-medium text-tr-text">
                          {user.full_name ?? user.username}
                          {user.id === myId ? (
                            <span className="ml-1 text-xs font-normal text-tr-muted">(bạn)</span>
                          ) : null}
                        </span>
                        <span className="block text-xs text-tr-muted">{user.email ?? '—'}</span>
                      </td>
                      <td className="py-2 pr-3 text-tr-subtle">
                        <PositionList user={user} />
                      </td>
                      <td className="py-2 pr-3 text-tr-subtle">
                        {user.org_unit_name ?? t.users.noOrgUnit}
                      </td>
                      <td className="py-2 pr-3">
                        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                      </td>
                      <td className="py-2 pr-3 text-xs text-tr-subtle">
                        {user.last_login_at ? formatDateTime(user.last_login_at) : t.users.never}
                      </td>
                      <td className="py-2 text-right">
                        <RowMenuButton user={user} onOpen={openMenu} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Dien thoai: the, khong cuon ngang. */}
          <ul className="space-y-2 md:hidden">
            {rows.map((user) => {
              const status = STATUS_META[statusOf(user)];
              return (
                <li
                  key={user.id}
                  className="flex items-center gap-3 rounded-control border border-tr-border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-tr-text">
                      {user.full_name ?? user.username}
                    </p>
                    <p className="truncate text-xs text-tr-muted">{user.email ?? '—'}</p>
                    <div className="mt-1 text-xs text-tr-subtle">
                      <PositionList user={user} inline />
                    </div>
                  </div>
                  <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                  <RowMenuButton user={user} onOpen={openMenu} />
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      <Popover
        open={menu !== null}
        onClose={() => setMenu(null)}
        anchor={menu?.anchor ?? null}
        title={menu ? (menu.user.full_name ?? menu.user.username) : ''}
        width={248}
      >
        {menu ? (
          <div role="menu" className="flex flex-col p-1">
            <MenuItem
              onClick={() => {
                setEditingInfo(menu.user);
                setMenu(null);
              }}
            >
              Sửa thông tin
            </MenuItem>
            {access.canAssign || access.canPlace ? (
              <MenuItem
                onClick={() => {
                  setEditing(menu.user);
                  setMenu(null);
                }}
              >
                Vị trí &amp; đơn vị
              </MenuItem>
            ) : null}
            {menu.user.email ? (
              <MenuItem
                disabled={invite.isPending}
                onClick={() => {
                  invite.mutate([menu.user.id]);
                  setMenu(null);
                }}
              >
                {t.users.resendInvite}
              </MenuItem>
            ) : null}
            <div className="my-1 border-t border-tr-border" />
            <MenuItem
              onClick={() => {
                setConfirm({ kind: 'signOut', user: menu.user });
                setMenu(null);
              }}
            >
              {t.users.signOutEverywhere}…
            </MenuItem>
            {/* Tu khoa chinh minh la mot cua khong mo lai duoc — may chu cung chan. */}
            {menu.user.id === myId ? null : menu.user.is_active ? (
              <MenuItem
                danger
                onClick={() => {
                  setConfirm({ kind: 'lock', users: [menu.user] });
                  setMenu(null);
                }}
              >
                {t.users.lock}…
              </MenuItem>
            ) : (
              <MenuItem
                onClick={() => {
                  setActive.mutate({ ids: [menu.user.id], active: true });
                  setMenu(null);
                }}
              >
                {t.users.unlock}
              </MenuItem>
            )}
          </div>
        ) : null}
      </Popover>

      <ConfirmDialog
        open={confirm?.kind === 'lock'}
        title={
          confirm?.kind === 'lock' && confirm.users.length === 1
            ? `Khoá tài khoản ${confirm.users[0].full_name ?? confirm.users[0].username}?`
            : `Khoá ${confirm?.kind === 'lock' ? confirm.users.length : 0} tài khoản?`
        }
        message="Người bị khoá:"
        details={[
          'bị đăng xuất ngay trên mọi thiết bị;',
          'không đăng nhập được cho tới khi được mở khoá;',
          'công việc và dữ liệu của họ vẫn giữ nguyên.',
        ]}
        confirmLabel="Khoá tài khoản"
        pending={setActive.isPending}
        onConfirm={() =>
          confirm?.kind === 'lock' &&
          setActive.mutate({ ids: confirm.users.map((user) => user.id), active: false })
        }
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm?.kind === 'signOut'}
        title={`Đăng xuất ${confirm?.kind === 'signOut' ? (confirm.user.full_name ?? confirm.user.username) : ''} khỏi mọi thiết bị?`}
        message="Mọi phiên đăng nhập của người này kết thúc ngay; họ phải đăng nhập lại. Dùng khi mất máy hoặc nghi lộ mật khẩu."
        confirmLabel="Đăng xuất mọi thiết bị"
        pending={signOut.isPending}
        onConfirm={() => confirm?.kind === 'signOut' && signOut.mutate(confirm.user.id)}
        onCancel={() => setConfirm(null)}
      />

      {inviting ? (
        <InviteDialog
          staff={staff.data ?? []}
          taken={takenContacts(users.data)}
          onClose={() => setInviting(false)}
          onCreated={(created) => {
            setManualLink(created.invite_link);
            setInviteError(created.invite_error);
            if (!created.invite_link) pushToast(t.users.inviteSent, 'success');
            setUnassigned(created.warnings?.includes('no_position') ? created : null);
            setInviting(false);
          }}
        />
      ) : null}
      {editing ? <AccessDialog user={editing} onClose={() => setEditing(null)} /> : null}
      {editingInfo ? (
        <InfoDialog
          user={editingInfo}
          staff={staff.data ?? []}
          taken={takenContacts(users.data, editingInfo.id)}
          canSetPassword={canSetPassword && editingInfo.id !== myId}
          onClose={() => setEditingInfo(null)}
        />
      ) : null}
    </Panel>
  );
}

function PositionList({ user, inline = false }: { user: UserRow; inline?: boolean }) {
  if (user.positions.length === 0) {
    return <span className="font-medium text-tr-warning">{t.users.noPositions}</span>;
  }
  return (
    <>
      {user.positions.map((row, index) => (
        <span key={row.position_id} className={inline ? undefined : 'block'}>
          {inline && index > 0 ? ', ' : ''}
          {row.position_name}
          {row.scope_unit_name ? ` · ${row.scope_unit_name}` : ''}
          {!inline && row.is_primary && user.positions.length > 1 ? (
            <span className="ml-1 text-xs text-tr-muted">({t.users.primary})</span>
          ) : null}
        </span>
      ))}
    </>
  );
}

function RowMenuButton({
  user,
  onOpen,
}: {
  user: UserRow;
  onOpen: (user: UserRow, anchor: HTMLElement) => void;
}) {
  return (
    <IconButton
      label={`Thao tác cho ${user.full_name ?? user.username}`}
      aria-haspopup="menu"
      onClick={(event) => onOpen(user, event.currentTarget)}
    >
      <MoreHorizontal size={16} aria-hidden="true" />
    </IconButton>
  );
}

function MenuItem({
  children,
  onClick,
  danger = false,
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-11 w-full items-center rounded-control px-3 text-left text-sm hover:bg-tr-hover disabled:opacity-50 fine:min-h-9 ${focusRing} ${
        danger ? 'text-tr-danger' : 'text-tr-text'
      }`}
    >
      {children}
    </button>
  );
}

/** Moi nguoi dung moi. O "Gan voi danh ba" dung DAU vi chon no se dien san ten va email. */
function InviteDialog({
  staff,
  taken,
  onClose,
  onCreated,
}: {
  staff: Assignee[];
  taken: Set<number>;
  onClose: () => void;
  onCreated: (
    created: UserRow & {
      invite_link: string | null;
      invite_error: string | null;
      warnings: string[];
    }
  ) => void;
}) {
  const queryClient = useQueryClient();
  const access = useAccessOptions();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [contactId, setContactId] = useState('');
  const [orgUnitId, setOrgUnitId] = useState('');
  const [positions, setPositions] = useState<PositionChoice[]>([]);

  const create = useMutation({
    mutationFn: () =>
      api.post<
        UserRow & { invite_link: string | null; invite_error: string | null; warnings: string[] }
      >('/api/users', {
        email: email.trim(),
        full_name: fullName.trim(),
        contact_id: contactId ? Number(contactId) : null,
        ...(access.canAssign && positions.length > 0 ? { positions } : {}),
        ...(access.canPlace && contactId && orgUnitId ? { org_unit_id: Number(orgUnitId) } : {}),
      }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      void queryClient.invalidateQueries({ queryKey: ['positions'] });
      onCreated(created);
    },
  });

  const dirty = Boolean(email || fullName || contactId || positions.length);

  return (
    <Modal
      open
      onClose={onClose}
      dirty={dirty}
      title="Mời người dùng"
      footer={
        <>
          <Button onClick={onClose}>{t.common.cancel}</Button>
          <Button
            variant="primary"
            disabled={create.isPending || !email.trim() || !fullName.trim()}
            onClick={() => create.mutate()}
          >
            {create.isPending ? t.common.saving : 'Gửi thư mời'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <FormError error={create.error} />
        <Field
          label={t.users.linkedContact}
          hint="Chọn người trong danh bạ sẽ điền sẵn tên và email."
        >
          <Select
            value={contactId}
            onChange={(e) => {
              setContactId(e.target.value);
              if (!e.target.value) setOrgUnitId('');
              const person = staff.find((row) => String(row.id) === e.target.value);
              if (person && !fullName.trim()) setFullName(person.full_name);
              if (person?.email && !email.trim()) setEmail(person.email);
            }}
          >
            <ContactOptions staff={staff} taken={taken} />
          </Select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t.users.email} required>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label={t.users.fullName} required>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </Field>
        </div>
        <OrgUnitField
          options={access}
          value={orgUnitId}
          onChange={setOrgUnitId}
          hasContact={Boolean(contactId)}
        />
        <PositionPicker options={access} value={positions} onChange={setPositions} />
        <p className="text-xs text-tr-muted">{t.users.createdHint}</p>
      </div>
    </Modal>
  );
}
