import { useId, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Field, Select } from '../common/ui';
import { t } from '../../i18n/vi';
import { usePermissionCheck } from '../../lib/permissions';

/*
 * Chon vi tri va don vi cho mot tai khoan — dung chung cho form Them nguoi dung
 * va hop thoai Phan quyen.
 *
 * Hai thu nay nam o hai noi trong CSDL (`user_positions` va `contacts.org_unit_id`,
 * xem migrate-v39.sql) va can hai quyen khac nhau (`admin.positions`,
 * `admin.org`), nen moi phan tu an khi nguoi dang thao tac khong co quyen tuong
 * ung — may chu cung chan, day chi de khong hien mot o bam vao la 403.
 */

export interface PositionOption {
  id: number;
  name: string;
  description: string;
}

export interface OrgUnitOption {
  id: number;
  parent_id: number | null;
  name: string;
}

export interface PositionChoice {
  position_id: number;
  is_primary: boolean;
  scope_unit_id: number | null;
}

export function useAccessOptions() {
  const allowed = usePermissionCheck();
  const canAssign = allowed('admin.positions:update');
  const canPlace = allowed('admin.org:update');

  const positions = useQuery({
    queryKey: ['positions'],
    queryFn: () => api.get<PositionOption[]>('/api/positions'),
    enabled: canAssign,
  });
  const units = useQuery({
    queryKey: ['org-units'],
    queryFn: () => api.get<OrgUnitOption[]>('/api/org-units'),
    /* Don vi kiem nhiem cung can danh sach nay, nen tai khi co mot trong hai quyen. */
    enabled: canAssign || canPlace,
  });

  /* Server tra danh sach phang (xem routes/orgUnits.ts) — dung lai thu tu cay o
     day de o chon doc duoc "Phong P1" nam duoi "Khoi A1". */
  const orderedUnits = useMemo(() => {
    const rows = units.data ?? [];
    const children = new Map<number | null, OrgUnitOption[]>();
    for (const row of rows) {
      const list = children.get(row.parent_id) ?? [];
      list.push(row);
      children.set(row.parent_id, list);
    }
    const ids = new Set(rows.map((row) => row.id));
    const out: { unit: OrgUnitOption; depth: number }[] = [];
    const visit = (parent: number | null, depth: number) => {
      for (const unit of children.get(parent) ?? []) {
        out.push({ unit, depth });
        visit(unit.id, depth + 1);
      }
    };
    visit(null, 0);
    /* Don vi co cha khong con trong danh sach van phai chon duoc. */
    for (const row of rows) {
      if (row.parent_id != null && !ids.has(row.parent_id)) {
        out.push({ unit: row, depth: 0 });
        visit(row.id, 1);
      }
    }
    return out;
  }, [units.data]);

  return {
    canAssign,
    canPlace,
    positions: positions.data ?? [],
    units: orderedUnits,
  };
}

type AccessOptions = ReturnType<typeof useAccessOptions>;

function UnitOptions({ units }: { units: AccessOptions['units'] }) {
  return (
    <>
      {units.map(({ unit, depth }) => (
        <option key={unit.id} value={unit.id}>
          {`${'  '.repeat(depth)}${unit.name}`}
        </option>
      ))}
    </>
  );
}

export function OrgUnitField({
  options,
  value,
  onChange,
  hasContact,
}: {
  options: AccessOptions;
  value: string;
  onChange: (value: string) => void;
  hasContact: boolean;
}) {
  if (!options.canPlace) return null;
  return (
    <Field label={t.users.orgUnit} hint={hasContact ? undefined : t.users.orgUnitNeedsContact}>
      <Select value={value} disabled={!hasContact} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t.users.noOrgUnit}</option>
        <UnitOptions units={options.units} />
      </Select>
    </Field>
  );
}

/**
 * Danh sach vi tri dang o tick.
 *
 * Nhieu vi tri la binh thuong (kiem nhiem); quyen gop theo pham vi RONG HON o
 * tung o (services/auth/access.ts). Vi tri dau tien duoc tick tu thanh vi tri
 * chinh — server cung lam vay khi khong ai danh dau.
 */
export function PositionPicker({
  options,
  value,
  onChange,
}: {
  options: AccessOptions;
  value: PositionChoice[];
  onChange: (value: PositionChoice[]) => void;
}) {
  /* Form Them nguoi dung va hop thoai Phan quyen co the cung mo — nhom radio
     dung chung mot `name` se cuop lua chon cua nhau. */
  const radioName = useId();
  if (!options.canAssign) {
    return <p className="text-xs text-tr-muted">{t.users.noPositionAccess}</p>;
  }

  const toggle = (positionId: number, checked: boolean) => {
    if (checked) {
      onChange([
        ...value,
        { position_id: positionId, is_primary: value.length === 0, scope_unit_id: null },
      ]);
      return;
    }
    const rest = value.filter((row) => row.position_id !== positionId);
    if (rest.length > 0 && !rest.some((row) => row.is_primary))
      rest[0] = { ...rest[0], is_primary: true };
    onChange(rest);
  };

  const update = (positionId: number, patch: Partial<PositionChoice>) =>
    onChange(
      value.map((row) =>
        row.position_id === positionId
          ? { ...row, ...patch }
          : patch.is_primary
            ? { ...row, is_primary: false }
            : row
      )
    );

  return (
    <fieldset>
      <legend className="mb-1 block text-xs font-semibold text-tr-subtle">
        {t.users.positions}
      </legend>
      <p className="mb-2 text-xs text-tr-muted">{t.users.positionsHint}</p>
      <ul className="divide-y divide-tr-border rounded-control border border-tr-border">
        {options.positions.map((position) => {
          const choice = value.find((row) => row.position_id === position.id);
          return (
            <li key={position.id} className="p-2">
              <label className="flex items-start gap-2 text-sm text-tr-text">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-tr-border"
                  checked={Boolean(choice)}
                  onChange={(e) => toggle(position.id, e.target.checked)}
                />
                <span className="min-w-0">
                  <span className="font-medium">{position.name}</span>
                  {position.description ? (
                    <span className="block text-xs text-tr-muted">{position.description}</span>
                  ) : null}
                </span>
              </label>
              {choice ? (
                <div className="mt-2 grid gap-2 pl-6 sm:grid-cols-[auto_1fr] sm:items-center">
                  <label className="flex items-center gap-2 text-xs text-tr-subtle">
                    <input
                      type="radio"
                      name={radioName}
                      className="h-4 w-4"
                      checked={choice.is_primary}
                      onChange={() => update(position.id, { is_primary: true })}
                    />
                    {t.users.primaryLabel}
                  </label>
                  <Select
                    aria-label={`${t.users.scopeUnit} — ${position.name}`}
                    title={t.users.scopeUnitHint}
                    value={choice.scope_unit_id ?? ''}
                    onChange={(e) =>
                      update(position.id, {
                        scope_unit_id: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  >
                    <option value="">
                      {t.users.scopeUnit}: {t.users.scopeOwnUnit}
                    </option>
                    <UnitOptions units={options.units} />
                  </Select>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
