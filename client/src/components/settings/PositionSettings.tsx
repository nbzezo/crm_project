import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Plus, Trash2 } from 'lucide-react';
import {
  PERMISSION_SCOPES,
  RESOURCE_ACTIONS,
  RESOURCE_GROUPS,
  permissionKey,
  type PermissionAction,
  type PermissionResource,
  type PermissionScope,
} from '@workflow/contracts';
import { api } from '../../api/client';
import {
  Button,
  Field,
  FormError,
  IconButton,
  Input,
  Panel,
  Select,
  SkeletonRows,
} from '../common/ui';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { t } from '../../i18n/vi';
import {
  ACTION_LABELS,
  RESOURCE_GROUP_LABELS,
  RESOURCE_HINTS,
  RESOURCE_LABELS,
  SCOPE_HINTS,
  SCOPE_LABELS,
} from '../../i18n/permissions';
import { useUiStore } from '../../stores/uiStore';
import { useAuthStore } from '../../stores/authStore';

/**
 * Vi tri va ma tran phan quyen — toan bo la cau hinh dong.
 *
 * Tao loai vi tri moi, nhan ban mot vi tri co san roi sua, doi pham vi tung o:
 * khong thao tac nao o day can sua code hay deploy. Thu MUON ma hoa cung o code
 * la danh muc resource/action (`@workflow/contracts`) — mot resource khong co man
 * hinh va endpoint thi co tao trong CSDL cung vo nghia.
 */

interface Position {
  id: number;
  name: string;
  code: string | null;
  description: string;
  is_system: number;
  holder_count: number;
}

interface PermissionRow {
  resource: string;
  action: string;
  scope: string;
}

type Matrix = Record<string, PermissionScope>;

function toMatrix(rows: PermissionRow[]): Matrix {
  const matrix: Matrix = {};
  for (const row of rows) matrix[`${row.resource}:${row.action}`] = row.scope as PermissionScope;
  return matrix;
}

export function PositionSettings() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const refreshMe = useAuthStore((s) => s.checkSession);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Matrix>({});
  const [dirty, setDirty] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [cloneFrom, setCloneFrom] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<Position | null>(null);

  const positions = useQuery({
    queryKey: ['positions'],
    queryFn: () => api.get<Position[]>('/api/positions'),
  });

  const selected = positions.data?.find((p) => p.id === selectedId) ?? positions.data?.[0] ?? null;

  const permissions = useQuery({
    queryKey: ['positions', selected?.id, 'permissions'],
    queryFn: () => api.get<PermissionRow[]>(`/api/positions/${selected?.id}/permissions`),
    enabled: selected != null,
  });

  useEffect(() => {
    if (permissions.data) {
      setDraft(toMatrix(permissions.data));
      setDirty(false);
    }
  }, [permissions.data]);

  const save = useMutation({
    mutationFn: () =>
      api.put<PermissionRow[]>(`/api/positions/${selected?.id}/permissions`, {
        /* Gui ca nhung o `none`: may chu bo chung di khi ghi. Gui du giup phan
           hoi phan anh dung y dinh cua nguoi dung thay vi mot tap da bi loc. */
        permissions: Object.entries(draft).map(([key, scope]) => {
          const [resource, action] = key.split(':');
          return { resource, action, scope };
        }),
      }),
    onSuccess: (rows) => {
      queryClient.setQueryData(['positions', selected?.id, 'permissions'], rows);
      setDirty(false);
      pushToast(t.positions.saved, 'success');
      /* Nguoi dang sua co the vua doi chinh quyen cua MINH — nap lai ho so de
         menu va cac man hinh khac khop ngay, khong doi lan tai trang sau. */
      void refreshMe();
    },
  });

  const create = useMutation({
    mutationFn: () =>
      api.post<Position>('/api/positions', {
        name: newName.trim(),
        copy_from_position_id: cloneFrom ? Number(cloneFrom) : undefined,
      }),
    onSuccess: (created) => {
      setAdding(false);
      setNewName('');
      setCloneFrom('');
      setSelectedId(created.id);
      void queryClient.invalidateQueries({ queryKey: ['positions'] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/api/positions/${id}`),
    onSuccess: () => {
      setConfirmDelete(null);
      setSelectedId(null);
      void queryClient.invalidateQueries({ queryKey: ['positions'] });
    },
  });

  function setCell(resource: PermissionResource, action: PermissionAction, scope: PermissionScope) {
    setDraft((prev) => ({ ...prev, [permissionKey(resource, action)]: scope }));
    setDirty(true);
  }

  /** Đặt cả một hàng về cùng một phạm vi — thao tác hay dùng nhất khi dựng vị trí mới. */
  function setRow(resource: PermissionResource, scope: PermissionScope) {
    setDraft((prev) => {
      const next = { ...prev };
      for (const action of RESOURCE_ACTIONS[resource])
        next[permissionKey(resource, action)] = scope;
      return next;
    });
    setDirty(true);
  }

  return (
    <Panel
      title={t.positions.title}
      action={
        <Button variant="primary" onClick={() => setAdding((v) => !v)}>
          <Plus size={14} aria-hidden /> {t.positions.add}
        </Button>
      }
    >
      <p className="mb-4 text-sm text-tr-subtle">{t.positions.subtitle}</p>

      <FormError
        error={positions.error ?? permissions.error ?? save.error ?? create.error ?? remove.error}
      />

      {adding ? (
        <div className="mb-4 space-y-3 rounded-control border border-tr-border p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t.positions.name} required>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
            </Field>
            <Field label={t.positions.cloneFrom} hint={t.positions.cloneHint}>
              <Select value={cloneFrom} onChange={(e) => setCloneFrom(e.target.value)}>
                <option value="">{t.positions.cloneNone}</option>
                {(positions.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="flex gap-2">
            <Button
              variant="primary"
              disabled={create.isPending || !newName.trim()}
              onClick={() => create.mutate()}
            >
              {create.isPending ? t.common.saving : t.common.add}
            </Button>
            <Button variant="secondary" onClick={() => setAdding(false)}>
              {t.common.cancel}
            </Button>
          </div>
        </div>
      ) : null}

      {positions.isPending ? <SkeletonRows rows={4} /> : null}

      {positions.data && positions.data.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-[15rem_minmax(0,1fr)]">
          <div className="space-y-1">
            {positions.data.map((position) => (
              <div
                key={position.id}
                className={`flex items-center gap-1 rounded-control border px-2 py-1.5 ${
                  selected?.id === position.id
                    ? 'border-tr-primary bg-tr-surface'
                    : 'border-transparent'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedId(position.id)}
                  aria-current={selected?.id === position.id}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-sm font-medium text-tr-text">
                    {position.name}
                  </span>
                  <span className="block text-xs text-tr-muted">
                    {t.positions.holders.replace('{n}', String(position.holder_count))}
                  </span>
                </button>
                <IconButton
                  label={t.positions.clone}
                  onClick={() => {
                    setAdding(true);
                    setCloneFrom(String(position.id));
                    setNewName(`${position.name} (bản sao)`);
                  }}
                >
                  <Copy size={14} aria-hidden />
                </IconButton>
                {position.is_system ? null : (
                  <IconButton
                    label={t.common.delete}
                    tone="danger"
                    onClick={() => setConfirmDelete(position)}
                  >
                    <Trash2 size={14} aria-hidden />
                  </IconButton>
                )}
              </div>
            ))}
          </div>

          {selected ? (
            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-tr-text">{selected.name}</h3>
                  {selected.description ? (
                    <p className="text-xs text-tr-muted">{selected.description}</p>
                  ) : null}
                </div>
                <Button
                  variant="primary"
                  disabled={!dirty || save.isPending}
                  onClick={() => save.mutate()}
                >
                  {save.isPending ? t.common.saving : t.common.save}
                </Button>
              </div>

              {permissions.isPending ? <SkeletonRows rows={6} /> : null}

              {permissions.data
                ? RESOURCE_GROUPS.map((group) => (
                    <section key={group.id} className="mb-5">
                      <h4 className="mb-2 text-xs font-semibold tracking-wide text-tr-muted uppercase">
                        {RESOURCE_GROUP_LABELS[group.id] ?? group.id}
                      </h4>
                      {/* Ma tran co sau cot; tren man hep no PHAI cuon ngang chu
                          khong duoc bop lai — ban truoc cot nhan hang con 56px va
                          "Khách hàng" xuong dong moi chu mot hang. Cot dau dinh lai
                          de con biet dang chinh nhom chuc nang nao khi cuon. */}
                      <div className="tr-scroll overflow-x-auto">
                        <table className="w-full min-w-[42rem] text-sm">
                          <thead className="text-left text-xs text-tr-subtle">
                            <tr>
                              <th
                                scope="col"
                                className="sticky left-0 z-10 bg-tr-panel py-1 pr-3 font-medium"
                              >
                                {t.positions.feature}
                              </th>
                              {(['read', 'create', 'update', 'delete', 'export'] as const).map(
                                (action) => (
                                  <th
                                    key={action}
                                    scope="col"
                                    className="py-1 pr-2 font-medium whitespace-nowrap"
                                  >
                                    {ACTION_LABELS[action]}
                                  </th>
                                )
                              )}
                              <th scope="col" className="py-1 font-medium">
                                <span className="sr-only">{t.positions.setWholeRow}</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.resources.map((resource) => (
                              <tr key={resource} className="border-t border-tr-border align-top">
                                <th
                                  scope="row"
                                  className="sticky left-0 z-10 w-48 min-w-[12rem] bg-tr-panel py-1.5 pr-3 text-left font-normal"
                                >
                                  <span className="block text-tr-text">
                                    {RESOURCE_LABELS[resource]}
                                  </span>
                                  {RESOURCE_HINTS[resource] ? (
                                    <span className="block text-xs text-tr-muted">
                                      {RESOURCE_HINTS[resource]}
                                    </span>
                                  ) : null}
                                </th>
                                {(['read', 'create', 'update', 'delete', 'export'] as const).map(
                                  (action) => {
                                    const applies = RESOURCE_ACTIONS[resource].includes(action);
                                    return (
                                      <td key={action} className="py-1.5 pr-2">
                                        {applies ? (
                                          <Select
                                            fullWidth={false}
                                            aria-label={`${RESOURCE_LABELS[resource]} — ${ACTION_LABELS[action]}`}
                                            title={
                                              SCOPE_HINTS[
                                                draft[permissionKey(resource, action)] ?? 'none'
                                              ]
                                            }
                                            value={draft[permissionKey(resource, action)] ?? 'none'}
                                            onChange={(e) =>
                                              setCell(
                                                resource,
                                                action,
                                                e.target.value as PermissionScope
                                              )
                                            }
                                          >
                                            {PERMISSION_SCOPES.map((scope) => (
                                              <option key={scope} value={scope}>
                                                {SCOPE_LABELS[scope]}
                                              </option>
                                            ))}
                                          </Select>
                                        ) : (
                                          /* Action khong ap dung cho resource nay —
                                             ve mot o trong thay vi mot dropdown hua
                                             mot thu khong ton tai. */
                                          <span aria-hidden className="text-tr-muted">
                                            —
                                          </span>
                                        )}
                                      </td>
                                    );
                                  }
                                )}
                                <td className="py-1.5">
                                  <Select
                                    fullWidth={false}
                                    aria-label={`${RESOURCE_LABELS[resource]} — ${t.positions.setWholeRow}`}
                                    value=""
                                    onChange={(e) => {
                                      if (e.target.value) {
                                        setRow(resource, e.target.value as PermissionScope);
                                      }
                                    }}
                                  >
                                    <option value="">{t.positions.setWholeRow}</option>
                                    {PERMISSION_SCOPES.map((scope) => (
                                      <option key={scope} value={scope}>
                                        {SCOPE_LABELS[scope]}
                                      </option>
                                    ))}
                                  </Select>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  ))
                : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmDelete !== null}
        title={t.positions.confirmDeleteTitle}
        message={t.positions.confirmDelete.replace('{name}', confirmDelete?.name ?? '')}
        confirmLabel={t.common.delete}
        onConfirm={() => confirmDelete && remove.mutate(confirmDelete.id)}
        onCancel={() => setConfirmDelete(null)}
      />
    </Panel>
  );
}
