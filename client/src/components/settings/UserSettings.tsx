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
import { t } from '../../i18n/vi';
import { formatDateTime } from '../../lib/format';
import { useUiStore } from '../../stores/uiStore';
import { useAuthStore } from '../../stores/authStore';
import type { Assignee } from '../../types';

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
}

/**
 * Quan ly tai khoan dang nhap.
 *
 * Khong co o nhap mat khau: tao tai khoan xong he thong gui lien ket kich hoat,
 * chu tai khoan tu dat mat khau. Nguoi quan tri khong bao gio biet mat khau cua
 * ai — ke ca cua nguoi minh vua tao.
 */
export function UserSettings() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const myId = useAuthStore((s) => s.user?.id ?? null);
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [contactId, setContactId] = useState('');
  /* Chi hien khi chua cau hinh SMTP — luc do khong con duong nao khac de kich hoat. */
  const [manualLink, setManualLink] = useState<string | null>(null);

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
      api.post<UserRow & { invite_link: string | null }>('/api/users', {
        email: email.trim(),
        full_name: fullName.trim(),
        contact_id: contactId ? Number(contactId) : null,
      }),
    onSuccess: (created) => {
      setManualLink(created.invite_link);
      setEmail('');
      setFullName('');
      setContactId('');
      setAdding(false);
      void invalidate();
      if (!created.invite_link) pushToast(t.users.inviteSent, 'success');
    },
  });

  const patch = useMutation({
    mutationFn: (vars: { id: number; body: Record<string, unknown> }) =>
      api.patch<UserRow>(`/api/users/${vars.id}`, vars.body),
    onSuccess: () => void invalidate(),
  });

  const invite = useMutation({
    mutationFn: (id: number) =>
      api.post<{ invite_link: string | null }>(`/api/users/${id}/invite`, {}),
    onSuccess: (data) => {
      setManualLink(data.invite_link);
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
          <p className="mb-1 text-sm text-tr-text">{t.users.inviteLinkManual}</p>
          <code className="block break-all text-xs text-tr-subtle">{manualLink}</code>
          <Button className="mt-2" variant="secondary" onClick={() => setManualLink(null)}>
            {t.common.close}
          </Button>
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
            <Select value={contactId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">{t.users.noContact}</option>
              {(staff.data ?? []).map((person) => (
                <option key={person.id} value={person.id}>
                  {person.full_name}
                </option>
              ))}
            </Select>
          </Field>
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

      {users.data && users.data.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <TableHead>
              <tr>
                <th scope="col" className="py-2 pr-3">
                  {t.users.fullName}
                </th>
                <th scope="col" className="py-2 pr-3">
                  {t.users.email}
                </th>
                <th scope="col" className="py-2 pr-3">
                  {t.users.linkedContact}
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
                  <td className="py-2 pr-3">
                    {!user.is_active ? (
                      <span className="text-tr-danger">{t.users.locked}</span>
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
    </Panel>
  );
}
