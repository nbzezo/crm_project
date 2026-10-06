import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { api } from '../../api/client';
import {
  Button,
  Field,
  FormError,
  IconButton,
  Input,
  Panel,
  Select,
  Segmented,
  SkeletonRows,
} from '../common/ui';
import { OrgChartTree } from './OrgChartTree';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Modal } from '../common/Modal';
import { t } from '../../i18n/vi';
import { useUiStore } from '../../stores/uiStore';
import type { Assignee } from '../../types';

/**
 * So do to chuc — chi CAU TRUC, khong phai con nguoi.
 *
 * Viec xep nguoi vao don vi nam o man *To chuc & nhan su*: do la noi nguoi ta
 * mo ra de xem nguoi, va mot don vi khong hien o do thi khong ai biet no anh
 * huong gi toi minh. O day chi con cay don vi va danh sach loai don vi.
 *
 * Cay `parent_id`, do sau tuy y. Day la thu bien "phan cap quan ly" tu mot danh
 * sach cap co dinh thanh mot cau truc mo: don vi ma mot quan ly phu trach CHINH
 * LA don vi ho ngoi, nen them cap thu nam chi la them mot nhanh.
 *
 * `org_unit_kinds` (Cong ty / Trung tam / Khoi / Phong / To) chi la NHAN. Chung
 * khong quyet dinh quyen — neu khong se sinh ra cau hoi vo nghia kieu "Khoi co
 * nhieu quyen hon Phong khong".
 */

interface OrgUnit {
  id: number;
  parent_id: number | null;
  kind_id: number | null;
  kind_name: string | null;
  name: string;
  code: string | null;
  head_contact_id: number | null;
  head_name: string | null;
  is_active: number;
  member_count: number;
}

interface UnitKind {
  id: number;
  name: string;
  level_order: number;
  is_system: number;
}

interface Draft {
  name: string;
  parent_id: number | null;
  kind_id: number | null;
  code: string;
  head_contact_id: number | null;
}

const EMPTY_DRAFT: Draft = {
  name: '',
  parent_id: null,
  kind_id: null,
  code: '',
  head_contact_id: null,
};

function draftOf(unit: OrgUnit): Draft {
  return {
    name: unit.name,
    parent_id: unit.parent_id,
    kind_id: unit.kind_id,
    code: unit.code ?? '',
    head_contact_id: unit.head_contact_id,
  };
}

export function OrgChartSettings() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const [editing, setEditing] = useState<{ id: number | null; draft: Draft } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<OrgUnit | null>(null);
  const [confirmKind, setConfirmKind] = useState<UnitKind | null>(null);
  const [newKind, setNewKind] = useState('');
  const [view, setView] = useState<'chart' | 'list' | 'kinds'>('chart');
  const units = useQuery({
    queryKey: ['org-units'],
    queryFn: () => api.get<OrgUnit[]>('/api/org-units'),
  });
  const kinds = useQuery({
    queryKey: ['org-units', 'kinds'],
    queryFn: () => api.get<UnitKind[]>('/api/org-units/kinds'),
  });
  const staff = useQuery({
    queryKey: ['contacts', 'assignable'],
    queryFn: () => api.get<Assignee[]>('/api/contacts/assignable'),
    select: (rows) => rows.filter((row) => row.org_kind === 'own'),
  });

  /* May chu tra ve danh sach PHANG kem parent_id; cay duoc dung o day. Tra ve cay
     long nhau tu API se buoc moi man hinh tu viet mot ham duyet rieng. */
  const editingDirty = Boolean(
    editing &&
    JSON.stringify(editing.draft) !==
      JSON.stringify(
        editing.id === null
          ? { ...EMPTY_DRAFT, parent_id: editing.draft.parent_id }
          : draftOf(units.data?.find((unit) => unit.id === editing.id) ?? ({} as OrgUnit))
      )
  );
  const childrenOf = useMemo(() => {
    const map = new Map<number | null, OrgUnit[]>();
    for (const unit of units.data ?? []) {
      const list = map.get(unit.parent_id) ?? [];
      list.push(unit);
      map.set(unit.parent_id, list);
    }
    return map;
  }, [units.data]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['org-units'] });
    void queryClient.invalidateQueries({ queryKey: ['contacts'] });
  };

  const save = useMutation({
    mutationFn: (vars: { id: number | null; draft: Draft }) =>
      vars.id === null
        ? api.post<OrgUnit>('/api/org-units', {
            name: vars.draft.name.trim(),
            parent_id: vars.draft.parent_id,
            kind_id: vars.draft.kind_id,
            code: vars.draft.code.trim() || null,
            head_contact_id: vars.draft.head_contact_id,
          })
        : api.patch<OrgUnit>(`/api/org-units/${vars.id}`, {
            name: vars.draft.name.trim(),
            parent_id: vars.draft.parent_id,
            kind_id: vars.draft.kind_id,
            code: vars.draft.code.trim() || null,
            head_contact_id: vars.draft.head_contact_id,
          }),
    onSuccess: () => {
      setEditing(null);
      invalidate();
      pushToast(t.orgChart.saved, 'success');
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/api/org-units/${id}`),
    onSuccess: () => {
      setConfirmDelete(null);
      invalidate();
    },
  });

  const addKind = useMutation({
    mutationFn: () =>
      api.post<UnitKind>('/api/org-units/kinds', {
        name: newKind.trim(),
        level_order: (kinds.data?.length ?? 0) + 1,
      }),
    onSuccess: () => {
      setNewKind('');
      void queryClient.invalidateQueries({ queryKey: ['org-units', 'kinds'] });
    },
  });

  const removeKind = useMutation({
    mutationFn: (id: number) => api.del(`/api/org-units/kinds/${id}`),
    onSuccess: () => {
      setConfirmKind(null);
      void queryClient.invalidateQueries({ queryKey: ['org-units', 'kinds'] });
    },
  });

  function renderUnit(unit: OrgUnit, depth: number) {
    const children = childrenOf.get(unit.id) ?? [];
    return (
      <div key={unit.id}>
        <div
          className="flex flex-wrap items-center gap-2 border-t border-tr-border py-2"
          style={{ paddingLeft: `${depth * 1.25}rem` }}
        >
          {depth > 0 ? (
            <ChevronRight size={14} className="shrink-0 text-tr-muted" aria-hidden />
          ) : null}
          <span className="font-medium text-tr-text">{unit.name}</span>
          {unit.kind_name ? (
            <span className="rounded-compact bg-tr-surface px-1.5 py-0.5 text-xs text-tr-subtle">
              {unit.kind_name}
            </span>
          ) : null}
          <span className="flex items-center gap-1 text-xs text-tr-muted">
            <Users size={12} aria-hidden />
            {t.orgChart.members.replace('{n}', String(unit.member_count))}
          </span>
          {unit.head_name ? (
            <span className="text-xs text-tr-muted">· {unit.head_name}</span>
          ) : null}

          <div className="ml-auto flex gap-1">
            <IconButton
              label={t.orgChart.addChild}
              onClick={() =>
                setEditing({ id: null, draft: { ...EMPTY_DRAFT, parent_id: unit.id } })
              }
            >
              <Plus size={14} aria-hidden />
            </IconButton>
            <IconButton
              label={t.common.edit}
              onClick={() => setEditing({ id: unit.id, draft: draftOf(unit) })}
            >
              <Pencil size={14} aria-hidden />
            </IconButton>
            <IconButton
              label={t.common.delete}
              tone="danger"
              onClick={() => setConfirmDelete(unit)}
            >
              <Trash2 size={14} aria-hidden />
            </IconButton>
          </div>
        </div>
        {children.map((child) => renderUnit(child, depth + 1))}
      </div>
    );
  }

  return (
    <Panel
      title={t.orgChart.title}
      action={
        <div className="flex gap-2">
          <Button
            variant="primary"
            onClick={() => setEditing({ id: null, draft: { ...EMPTY_DRAFT } })}
          >
            <Plus size={14} aria-hidden /> {t.orgChart.addUnit}
          </Button>
        </div>
      }
    >
      <p className="mb-4 text-sm text-tr-subtle">{t.orgChart.subtitle}</p>

      <FormError
        error={units.error ?? save.error ?? remove.error ?? addKind.error ?? removeKind.error}
      />

      <div className="mb-3">
        <Segmented
          label={t.orgChart.title}
          value={view}
          onChange={setView}
          options={[
            { value: 'chart', label: t.orgChart.viewChart },
            { value: 'list', label: t.orgChart.viewList },
            { value: 'kinds', label: t.orgChart.kinds },
          ]}
        />
      </div>
      {view === 'kinds' ? (
        <div className="mb-4 rounded-control border border-tr-border p-3">
          <p className="mb-2 text-xs text-tr-muted">{t.orgChart.kindsHint}</p>
          <ul className="mb-3 space-y-1">
            {(kinds.data ?? []).map((kind) => (
              <li key={kind.id} className="flex items-center gap-2 text-sm">
                <span className="text-tr-text">{kind.name}</span>
                {kind.is_system ? null : (
                  <IconButton
                    label={t.common.delete}
                    tone="danger"
                    onClick={() => setConfirmKind(kind)}
                  >
                    <Trash2 size={13} aria-hidden />
                  </IconButton>
                )}
              </li>
            ))}
          </ul>
          <div className="flex items-end gap-2">
            <Field label={t.orgChart.kindName}>
              <Input
                className="sm:w-48"
                value={newKind}
                onChange={(e) => setNewKind(e.target.value)}
              />
            </Field>
            <Button
              variant="secondary"
              disabled={!newKind.trim() || addKind.isPending}
              onClick={() => addKind.mutate()}
            >
              {t.common.add}
            </Button>
          </div>
        </div>
      ) : null}

      {units.isPending ? <SkeletonRows rows={4} /> : null}
      {view === 'chart' && units.data ? (
        <OrgChartTree
          units={units.data}
          childrenOf={childrenOf}
          onAddChild={(unit) =>
            setEditing({ id: null, draft: { ...EMPTY_DRAFT, parent_id: unit.id } })
          }
          onEdit={(unit) => setEditing({ id: unit.id, draft: draftOf(unit) })}
          onDelete={(unit) => setConfirmDelete(unit)}
        />
      ) : null}
      {view === 'list' ? (childrenOf.get(null) ?? []).map((unit) => renderUnit(unit, 0)) : null}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        dirty={Boolean(editing && editingDirty)}
        title={editing?.id === null ? t.orgChart.addUnit : t.common.edit}
        footer={
          <>
            <Button onClick={() => setEditing(null)}>{t.common.cancel}</Button>
            <Button
              variant="primary"
              disabled={save.isPending || !editing?.draft.name.trim()}
              onClick={() => editing && save.mutate(editing)}
            >
              {save.isPending ? t.common.saving : t.common.save}
            </Button>
          </>
        }
      >
        {editing ? (
          <>
            <FormError error={save.error} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t.orgChart.unitName} required>
                <Input
                  value={editing.draft.name}
                  onChange={(e) =>
                    setEditing({ ...editing, draft: { ...editing.draft, name: e.target.value } })
                  }
                />
              </Field>
              <Field label={t.orgChart.unitCode}>
                <Input
                  value={editing.draft.code}
                  onChange={(e) =>
                    setEditing({ ...editing, draft: { ...editing.draft, code: e.target.value } })
                  }
                />
              </Field>
              <Field label={t.orgChart.parent}>
                <Select
                  value={editing.draft.parent_id ?? ''}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      draft: {
                        ...editing.draft,
                        parent_id: e.target.value ? Number(e.target.value) : null,
                      },
                    })
                  }
                >
                  <option value="">{t.orgChart.noParent}</option>
                  {(units.data ?? [])
                    /* Khong cho chon chinh no lam cap tren. Chu trinh sau hon do may
                     chu chan (assertNoCycle) — day chi la loc cho de dung. */
                    .filter((u) => u.id !== editing.id)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label={t.orgChart.unitKind}>
                <Select
                  value={editing.draft.kind_id ?? ''}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      draft: {
                        ...editing.draft,
                        kind_id: e.target.value ? Number(e.target.value) : null,
                      },
                    })
                  }
                >
                  <option value="">—</option>
                  {(kinds.data ?? []).map((kind) => (
                    <option key={kind.id} value={kind.id}>
                      {kind.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t.orgChart.head}>
                <Select
                  value={editing.draft.head_contact_id ?? ''}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      draft: {
                        ...editing.draft,
                        head_contact_id: e.target.value ? Number(e.target.value) : null,
                      },
                    })
                  }
                >
                  <option value="">{t.orgChart.noHead}</option>
                  {(staff.data ?? []).map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.full_name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </>
        ) : null}
      </Modal>
      <ConfirmDialog
        open={confirmKind !== null}
        title={`Xoá loại đơn vị “${confirmKind?.name ?? ''}”?`}
        message="Các đơn vị đang mang loại này sẽ không còn nhãn loại. Cây đơn vị và người trong đó giữ nguyên."
        pending={removeKind.isPending}
        onConfirm={() => confirmKind && removeKind.mutate(confirmKind.id)}
        onCancel={() => setConfirmKind(null)}
      />
      <ConfirmDialog
        open={confirmDelete !== null}
        title={t.orgChart.confirmDeleteUnitTitle}
        message={t.orgChart.confirmDeleteUnit.replace('{name}', confirmDelete?.name ?? '')}
        confirmLabel={t.common.delete}
        onConfirm={() => confirmDelete && remove.mutate(confirmDelete.id)}
        onCancel={() => setConfirmDelete(null)}
      />
    </Panel>
  );
}
