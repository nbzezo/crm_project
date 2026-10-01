import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../api/client';
import {
  Button,
  EmptyState,
  Field,
  FormError,
  Input,
  Panel,
  Select,
  SkeletonRows,
  TableHead,
} from '../common/ui';
import { Modal } from '../common/Modal';
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

/**
 * Quan ly tai khoan dang nhap.
 *
 * Tao tai khoan khong co o nhap mat khau: he thong gui lien ket kich hoat, chu
 * tai khoan tu dat mat khau. Ngoai le duy nhat la "Dat mat khau moi" trong hop
 * thoai Sua, chi cho quan tri he thong — va mac dinh bat nguoi do doi lai.
 */
export function UserSettings() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const myId = useAuthStore((s) => s.user?.id ?? null);
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [contactId, setContactId] = useState('');
  const [orgUnitId, setOrgUnitId] = useState('');
  const [positions, setPositions] = useState<PositionChoice[]>([]);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [editingInfo, setEditingInfo] = useState<UserRow | null>(null);
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
      setManualLink(created.invite_link);
      setInviteError(created.invite_error);
      setEmail('');
      setFullName('');
      setContactId('');
      setOrgUnitId('');
      setPositions([]);
      setAdding(false);
      void invalidate();
      void queryClient.invalidateQueries({ queryKey: ['positions'] });
      if (!created.invite_link) pushToast(t.users.inviteSent, 'success');
      setUnassigned(created.warnings?.includes('no_position') ? created : null);
    },
  });

  const patch = useMutation({
    mutationFn: (vars: { id: number; body: Record<string, unknown> }) =>
      api.patch<UserRow>(`/api/users/${vars.id}`, vars.body),
    onSuccess: () => void invalidate(),
  });

  const invite = useMutation({
    mutationFn: (id: number) =>
      api.post<{ invite_link: string | null; invite_error: string | null }>(
        `/api/users/${id}/invite`,
        {}
      ),
    onSuccess: (data) => {
      setManualLink(data.invite_link);
      setInviteError(data.invite_error);
      if (!data.invite_link) pushToast(t.users.inviteSent, 'success');
    },
  });

  const signOut = useMutation({
    mutationFn: (id: number) => api.post(`/api/users/${id}/sign-out`, {}),
    onSuccess: () => pushToast(t.users.signOutEverywhere, 'success'),
  });

  /* 403 nghia la tai khoan nay khong phai quan tri — an ca man thay vi hien mot
     bang rong kem thong bao loi do dang. */
  if (users.error instanceof ApiError && users.error.status === 403) return null;

  return (
    <Panel
      title={t.users.title}
      action={
        <Button variant="primary" onClick={() => setAdding((v) => !v)}>
          {t.users.add}
        </Button>
      }
    >
      <p className="mb-4 text-sm text-tr-subtle">{t.users.subtitle}</p>

      <FormError error={create.error ?? patch.error ?? invite.error} />

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

      {adding ? (
        <div className="mb-4 space-y-3 rounded-control border border-tr-border p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t.users.email} required>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label={t.users.fullName} required>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </Field>
          </div>
          <Field label={t.users.linkedContact}>
            <Select
              value={contactId}
              onChange={(e) => {
                setContactId(e.target.value);
                if (!e.target.value) setOrgUnitId('');
                /* Chon nguoi trong danh ba thi dien san ten va email con trong. */
                const person = staff.data?.find((row) => String(row.id) === e.target.value);
                if (person && !fullName.trim()) setFullName(person.full_name);
                if (person?.email && !email.trim()) setEmail(person.email);
              }}
            >
              <ContactOptions staff={staff.data ?? []} taken={takenContacts(users.data)} />
            </Select>
          </Field>
          <OrgUnitField
            options={access}
            value={orgUnitId}
            onChange={setOrgUnitId}
            hasContact={Boolean(contactId)}
          />
          <PositionPicker options={access} value={positions} onChange={setPositions} />
          <p className="text-xs text-tr-muted">{t.users.createdHint}</p>
          <div className="flex gap-2">
            <Button
              variant="primary"
              disabled={create.isPending || !email.trim() || !fullName.trim()}
              onClick={() => create.mutate()}
            >
              {create.isPending ? t.common.saving : t.users.add}
            </Button>
            <Button variant="secondary" onClick={() => setAdding(false)}>
              {t.common.cancel}
            </Button>
          </div>
        </div>
      ) : null}

      {users.isPending ? <SkeletonRows rows={3} /> : null}

      {users.data?.length === 0 ? <EmptyState message={t.common.empty} /> : null}

      {/* `min-w` tren bang de no CUON NGANG thay vi bi bop: khong co no, cot
          "Gắn với người trong sổ danh bạ" xuong dong moi chu mot hang va dong cao
          gap bon lan. Mot bang doc duoc va phai cuon van hon mot bang vua khung
          ma khong doc noi. */}
      {users.data && users.data.length > 0 ? (
        <div className="tr-scroll overflow-x-auto">
          <table className="w-full min-w-[60rem] text-sm">
            <TableHead>
              <tr>
                <th scope="col" className="py-2 pr-3">
                  {t.users.fullName}
                </th>
                <th scope="col" className="py-2 pr-3">
                  {t.users.email}
                </th>
                <th scope="col" className="py-2 pr-3">
                  {t.users.linkedContactShort}
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
                <th scope="col" className="py-2 text-right">
                  <span className="sr-only">{t.common.edit}</span>
                </th>
              </tr>
            </TableHead>
            <tbody>
              {users.data.map((user) => (
                <tr key={user.id} className="border-t border-tr-border">
                  <td className="py-2 pr-3 text-tr-text">{user.full_name ?? user.username}</td>
                  <td className="py-2 pr-3 text-tr-subtle">{user.email ?? '—'}</td>
                  <td className="py-2 pr-3 text-tr-subtle">
                    {user.contact_name ?? t.users.noContact}
                  </td>
                  <td className="py-2 pr-3 text-tr-subtle">
                    {user.positions.length === 0 ? (
                      <span className="text-tr-warning">{t.users.noPositions}</span>
                    ) : (
                      user.positions.map((row) => (
                        <span key={row.position_id} className="block">
                          {row.position_name}
                          {row.scope_unit_name ? ` · ${row.scope_unit_name}` : ''}
                          {row.is_primary && user.positions.length > 1 ? (
                            <span className="ml-1 text-xs text-tr-muted">({t.users.primary})</span>
                          ) : null}
                        </span>
                      ))
                    )}
                  </td>
                  <td className="py-2 pr-3 text-tr-subtle">
                    {user.org_unit_name ?? t.users.noOrgUnit}
                  </td>
                  <td className="py-2 pr-3">
                    {!user.is_active ? (
                      <span className="text-tr-danger">{t.users.locked}</span>
                    ) : user.must_change_password ? (
                      <span className="text-tr-warning">{t.users.mustChangePassword}</span>
                    ) : user.pending_invite ? (
                      <span className="text-tr-warning">{t.users.pendingInvite}</span>
                    ) : (
                      <span className="text-tr-success">{t.users.active}</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-tr-subtle">
                    {user.last_login_at ? formatDateTime(user.last_login_at) : t.users.never}
                  </td>
                  <td className="py-2">
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button size="sm" variant="secondary" onClick={() => setEditingInfo(user)}>
                        {t.users.editInfo}
                      </Button>
                      {access.canAssign || access.canPlace ? (
                        <Button size="sm" variant="secondary" onClick={() => setEditing(user)}>
                          {t.users.editAccess}
                        </Button>
                      ) : null}
                      {user.email ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={invite.isPending}
                          onClick={() => invite.mutate(user.id)}
                        >
                          {t.users.resendInvite}
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={signOut.isPending}
                        onClick={() => signOut.mutate(user.id)}
                      >
                        {t.users.signOutEverywhere}
                      </Button>
                      {/* Tu khoa chinh minh la mot cua khong mo lai duoc — may chu
                          cung chan, day chi la de nut do khong bao gio bam duoc. */}
                      {user.id === myId ? null : (
                        <Button
                          size="sm"
                          variant={user.is_active ? 'danger' : 'secondary'}
                          disabled={patch.isPending}
                          onClick={() =>
                            patch.mutate({ id: user.id, body: { is_active: !user.is_active } })
                          }
                        >
                          {user.is_active ? t.users.lock : t.users.unlock}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
