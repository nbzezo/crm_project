import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Briefcase, Crown, Pencil, Plus, Trash2, UserMinus, UserPlus } from 'lucide-react';
import { api } from '../../api/client';
import { Button, FormError, IconButton, Input, SkeletonRows } from '../common/ui';
import { Modal } from '../common/Modal';
import { t } from '../../i18n/vi';
import { useUiStore } from '../../stores/uiStore';
import { usePermissionCheck } from '../../lib/permissions';
import { PositionPicker, useAccessOptions, type PositionChoice } from './UserAccessFields';

/*
 * So do to chuc dang CAY — moi don vi mot o, trong o la nguoi ngoi o do.
 *
 * Day la noi xep nguoi vao so do: them nguoi vao o, dat lam truong, gan vi tri.
 * Truong mot o tu dong XEM duoc du lieu cua ca nhanh ben duoi (xem
 * `headedUnitsOf` trong server/src/services/auth/access.ts), nen o day vuong mien
 * khong chi la nhan hien thi — no la mot quyet dinh phan quyen.
 */

export interface ChartUnit {
  id: number;
  parent_id: number | null;
  kind_name: string | null;
  name: string;
  code: string | null;
  head_contact_id: number | null;
  head_name: string | null;
}

interface PersonPosition {
  position_id: number;
  position_name: string;
  is_primary: boolean;
  scope_unit_id: number | null;
}

interface Person {
  id: number;
  full_name: string;
  title: string | null;
  email: string | null;
  org_unit_id: number | null;
  user_id: number | null;
  user_active: number | null;
  positions: PersonPosition[];
}

/* Mot o dai qua lam ca so do gian ra theo chieu doc — moi o chi hien vai nguoi
   dau, phan con lai mo ra khi can. */
const VISIBLE_MEMBERS = 6;

export function OrgChartTree<U extends ChartUnit>({
  units,
  childrenOf,
  onAddChild,
  onEdit,
  onDelete,
}: {
  units: U[];
  childrenOf: Map<number | null, U[]>;
  onAddChild: (unit: U) => void;
  onEdit: (unit: U) => void;
  onDelete: (unit: U) => void;
}) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const allowed = usePermissionCheck();
  const canPlace = allowed('admin.org:update');
  const canAssign = allowed('admin.positions:update');
  const [addingTo, setAddingTo] = useState<ChartUnit | null>(null);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const people = useQuery({
    queryKey: ['org-units', 'people'],
    queryFn: () => api.get<Person[]>('/api/org-units/people'),
  });

  const membersOf = useMemo(() => {
    const map = new Map<number | null, Person[]>();
    for (const person of people.data ?? []) {
      const list = map.get(person.org_unit_id) ?? [];
      list.push(person);
      map.set(person.org_unit_id, list);
    }
    return map;
  }, [people.data]);

  const unitIds = useMemo(() => new Set(units.map((unit) => unit.id)), [units]);
  /* Don vi co cha khong con trong danh sach (cha da bi an) van phai hien ra —
     neu khong ca nhanh do bien mat khoi so do. */
  const roots = useMemo(
    () => units.filter((unit) => unit.parent_id == null || !unitIds.has(unit.parent_id)),
    [units, unitIds]
  );

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['org-units'] });
    void queryClient.invalidateQueries({ queryKey: ['users'] });
    void queryClient.invalidateQueries({ queryKey: ['contacts'] });
  };

  const move = useMutation({
    mutationFn: (vars: { contactIds: number[]; unitId: number | null; clearHeadOf?: number }) =>
      (async () => {
        await api.post('/api/org-units/members', {
          contact_ids: vars.contactIds,
          org_unit_id: vars.unitId,
        });
        if (vars.clearHeadOf != null) {
          await api.patch(`/api/org-units/${vars.clearHeadOf}`, { head_contact_id: null });
        }
      })(),
    onSuccess: invalidate,
  });

  const setHead = useMutation({
    mutationFn: (vars: { unitId: number; contactId: number | null }) =>
      api.patch(`/api/org-units/${vars.unitId}`, { head_contact_id: vars.contactId }),
    onSuccess: (_data, vars) => {
      invalidate();
      pushToast(vars.contactId ? t.orgChart.headSet : t.orgChart.headCleared, 'success');
    },
  });

  function renderPerson(unit: U, person: Person) {
    const isHead = unit.head_contact_id === person.id;
    return (
      <li key={person.id} className="group flex items-start gap-1.5 py-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-sm text-tr-text">
            {isHead ? (
              <Crown size={13} className="shrink-0 text-tr-warning" aria-label={t.orgChart.head} />
            ) : null}
            <span className={`break-words ${isHead ? 'font-semibold' : ''}`}>
              {person.full_name}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap gap-1">
            {person.user_id == null ? (
              <span className="text-[11px] text-tr-muted">{t.orgChart.noAccount}</span>
            ) : person.positions.length === 0 ? (
              <span className="text-[11px] text-tr-warning">{t.orgChart.noPosition}</span>
            ) : (
              person.positions.map((position) => (
                <span
                  key={position.position_id}
                  className={`rounded-compact px-1.5 py-px text-[11px] ${
                    position.is_primary
                      ? 'bg-tr-primary/10 text-tr-primary'
                      : 'bg-tr-surface text-tr-subtle'
                  }`}
                >
                  {position.position_name}
                </span>
              ))
            )}
          </div>
        </div>
        {canPlace ? (
          <div className="flex shrink-0 fine:opacity-0 fine:group-hover:opacity-100 fine:group-focus-within:opacity-100">
            <IconButton
              label={isHead ? t.orgChart.unsetHead : t.orgChart.setHead}
              tone="primary"
              onClick={() =>
                setHead.mutate({ unitId: unit.id, contactId: isHead ? null : person.id })
              }
            >
              <Crown size={13} aria-hidden />
            </IconButton>
            {canAssign && person.user_id != null ? (
              <IconButton label={t.orgChart.editPositions} onClick={() => setEditingPerson(person)}>
                <Briefcase size={13} aria-hidden />
              </IconButton>
            ) : null}
            <IconButton
              label={t.orgChart.removeFromUnit}
              tone="danger"
              onClick={() =>
                move.mutate({
                  contactIds: [person.id],
                  unitId: null,
                  clearHeadOf: isHead ? unit.id : undefined,
                })
              }
            >
              <UserMinus size={13} aria-hidden />
            </IconButton>
          </div>
        ) : null}
      </li>
    );
  }

  function renderUnit(unit: U) {
    const children = childrenOf.get(unit.id) ?? [];
    const members = [...(membersOf.get(unit.id) ?? [])].sort(
      (a, b) =>
        Number(b.id === unit.head_contact_id) - Number(a.id === unit.head_contact_id) ||
        a.full_name.localeCompare(b.full_name, 'vi')
    );
    /* Truong co the ngoi o don vi khac (vd. GD Khoi kiem truong mot phong). */
    const headOutside =
      unit.head_contact_id != null && !members.some((m) => m.id === unit.head_contact_id);
    const showAll = expanded.has(unit.id);
    const shown = showAll ? members : members.slice(0, VISIBLE_MEMBERS);

    return (
      <li key={unit.id} className="tr-orgtree-node">
        <div className="w-72 rounded-control border border-tr-border bg-tr-card text-left shadow-sm">
          <div className="flex items-start gap-1 border-b border-tr-border px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-tr-text" title={unit.name}>
                {unit.name}
              </div>
              <div className="text-xs text-tr-muted">
                {[
                  unit.kind_name,
                  unit.code,
                  t.orgChart.members.replace('{n}', String(members.length)),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
            {canPlace ? (
              <div className="-mr-1 flex shrink-0">
                <IconButton label={t.common.edit} onClick={() => onEdit(unit)}>
                  <Pencil size={13} aria-hidden />
                </IconButton>
                <IconButton label={t.common.delete} tone="danger" onClick={() => onDelete(unit)}>
                  <Trash2 size={13} aria-hidden />
                </IconButton>
              </div>
            ) : null}
          </div>

          <div className="px-3 py-1.5">
            {headOutside ? (
              <div className="flex items-center gap-1 py-1 text-sm font-semibold text-tr-text">
                <Crown size={13} className="text-tr-warning" aria-label={t.orgChart.head} />
                <span className="truncate">{unit.head_name}</span>
                <span className="text-[11px] font-normal text-tr-muted">
                  ({t.orgChart.headElsewhere})
                </span>
              </div>
            ) : null}
            {members.length === 0 && !headOutside ? (
              <p className="py-1 text-xs text-tr-muted">{t.orgChart.emptyUnit}</p>
            ) : (
              <ul className="divide-y divide-tr-border">
                {shown.map((person) => renderPerson(unit, person))}
              </ul>
            )}
            {members.length > VISIBLE_MEMBERS ? (
              <button
                type="button"
                className="py-1 text-xs text-tr-primary hover:underline"
                onClick={() =>
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    if (next.has(unit.id)) next.delete(unit.id);
                    else next.add(unit.id);
                    return next;
                  })
                }
              >
                {showAll
                  ? t.orgChart.showLess
                  : t.orgChart.showMore.replace('{n}', String(members.length - VISIBLE_MEMBERS))}
              </button>
            ) : null}
          </div>

          {canPlace ? (
            <div className="flex border-t border-tr-border">
              <button
                type="button"
                className="flex flex-1 items-center justify-center gap-1 py-1.5 text-xs text-tr-subtle hover:bg-tr-hover hover:text-tr-text"
                onClick={() => setAddingTo(unit)}
              >
                <UserPlus size={13} aria-hidden /> {t.orgChart.addPerson}
              </button>
              <button
                type="button"
                className="flex flex-1 items-center justify-center gap-1 border-l border-tr-border py-1.5 text-xs text-tr-subtle hover:bg-tr-hover hover:text-tr-text"
                onClick={() => onAddChild(unit)}
              >
                <Plus size={13} aria-hidden /> {t.orgChart.addChildShort}
              </button>
            </div>
          ) : null}
        </div>
        {children.length > 0 ? (
          <ul className="tr-orgtree-branch">{children.map(renderUnit)}</ul>
        ) : null}
      </li>
    );
  }

  const unplaced = membersOf.get(null) ?? [];

  return (
    <div>
      <FormError error={people.error ?? move.error ?? setHead.error} />
      <p className="mb-3 flex items-start gap-1.5 rounded-control bg-tr-surface px-3 py-2 text-xs text-tr-subtle">
        <Crown size={13} className="mt-px shrink-0 text-tr-warning" aria-hidden />
        {t.orgChart.headRule}
      </p>
      {people.isPending ? <SkeletonRows rows={3} /> : null}
      <div className="tr-scroll overflow-x-auto pb-4">
        {/* `w-max`: khung rong theo noi dung (cuon ngang khi so do rong hon man hinh),
            `min-w-full`: van can giua khi so do hep. `inline-block` thi bi ep ve
            be rong man hinh va canh giua lam mat phan ben trai. */}
        <div className="tr-orgtree w-max min-w-full">
          <ul className="tr-orgtree-branch tr-orgtree-root">{roots.map(renderUnit)}</ul>
        </div>
      </div>

      {unplaced.length > 0 ? (
        <p className="mt-2 text-xs text-tr-muted">
          {t.orgChart.unplaced.replace('{n}', String(unplaced.length))}{' '}
          {unplaced
            .slice(0, 8)
            .map((person) => person.full_name)
            .join(', ')}
          {unplaced.length > 8 ? '…' : ''}
        </p>
      ) : null}

      {addingTo ? (
        <AddPeopleDialog
          unit={addingTo}
          units={units}
          people={people.data ?? []}
          pending={move.isPending}
          onAdd={(contactIds) =>
            move.mutate(
              { contactIds, unitId: addingTo.id },
              {
                onSuccess: () => {
                  pushToast(t.orgChart.movedMembers, 'success');
                  setAddingTo(null);
                },
              }
            )
          }
          onClose={() => setAddingTo(null)}
        />
      ) : null}

      {editingPerson ? (
        <PositionsDialog
          person={editingPerson}
          onClose={() => setEditingPerson(null)}
          onSaved={invalidate}
        />
      ) : null}
    </div>
  );
}

function AddPeopleDialog({
  unit,
  units,
  people,
  pending,
  onAdd,
  onClose,
}: {
  unit: ChartUnit;
  units: ChartUnit[];
  people: Person[];
  pending: boolean;
  onAdd: (contactIds: number[]) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const unitName = useMemo(() => new Map(units.map((u) => [u.id, u.name])), [units]);

  const candidates = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('vi');
    return (
      people
        .filter((person) => person.org_unit_id !== unit.id)
        .filter(
          (person) =>
            !needle ||
            person.full_name.toLocaleLowerCase('vi').includes(needle) ||
            (person.email ?? '').toLocaleLowerCase('vi').includes(needle)
        )
        /* Nguoi chua co cho ngoi len dau — thuong la nhung nguoi dang can xep. */
        .sort(
          (a, b) =>
            Number(a.org_unit_id != null) - Number(b.org_unit_id != null) ||
            a.full_name.localeCompare(b.full_name, 'vi')
        )
    );
  }, [people, unit.id, query]);

  const toggle = (id: number) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Modal
      open
      onClose={onClose}
      dirty={picked.size > 0}
      width="max-w-lg"
      title={t.orgChart.addPeopleTitle.replace('{name}', unit.name)}
      footer={
        <>
          <Button onClick={onClose}>{t.common.cancel}</Button>
          <Button
            variant="primary"
            disabled={picked.size === 0 || pending}
            onClick={() => onAdd([...picked])}
          >
            {pending
              ? t.common.saving
              : t.orgChart.addPeopleConfirm.replace('{n}', String(picked.size))}
          </Button>
        </>
      }
    >
      <Input
        autoFocus
        placeholder={t.orgChart.searchPeople}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-3"
      />
      <p className="mb-2 text-xs text-tr-muted">{t.orgChart.addPeopleHint}</p>
      {candidates.length === 0 ? (
        <p className="py-4 text-center text-sm text-tr-muted">{t.orgChart.noCandidates}</p>
      ) : (
        <ul className="max-h-[55vh] divide-y divide-tr-border overflow-y-auto rounded-control border border-tr-border">
          {candidates.map((person) => (
            <li key={person.id}>
              <label className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-tr-hover">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={picked.has(person.id)}
                  onChange={() => toggle(person.id)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-tr-text">{person.full_name}</span>
                  <span className="block truncate text-xs text-tr-muted">
                    {person.org_unit_id == null
                      ? t.orgChart.notPlaced
                      : t.orgChart.currentlyIn.replace(
                          '{name}',
                          unitName.get(person.org_unit_id) ?? '—'
                        )}
                    {person.positions.length
                      ? ` · ${person.positions.map((p) => p.position_name).join(', ')}`
                      : ''}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function toChoices(person: Person): PositionChoice[] {
  return person.positions.map((row) => ({
    position_id: row.position_id,
    is_primary: row.is_primary,
    scope_unit_id: row.scope_unit_id,
  }));
}

function PositionsDialog({
  person,
  onClose,
  onSaved,
}: {
  person: Person;
  onClose: () => void;
  onSaved: () => void;
}) {
  const pushToast = useUiStore((s) => s.pushToast);
  const options = useAccessOptions();
  const [value, setValue] = useState<PositionChoice[]>(() => toChoices(person));
  const dirty = JSON.stringify(value) !== JSON.stringify(toChoices(person));

  const save = useMutation({
    mutationFn: () => api.put(`/api/positions/assignments/${person.user_id}`, { positions: value }),
    onSuccess: () => {
      onSaved();
      pushToast(t.users.accessSaved, 'success');
      onClose();
    },
  });

  return (
    <Modal
      open
      onClose={onClose}
      dirty={dirty}
      title={t.users.editAccessTitle.replace('{name}', person.full_name)}
      footer={
        <>
          <Button onClick={onClose}>{t.common.cancel}</Button>
          <Button
            variant="primary"
            disabled={!dirty || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? t.common.saving : t.common.save}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <FormError error={save.error} />
        <PositionPicker options={options} value={value} onChange={setValue} />
      </div>
    </Modal>
  );
}
