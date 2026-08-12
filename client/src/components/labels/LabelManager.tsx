import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  EyeOff,
  Merge,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { api } from '../../api/client';
import { Button, Input, Select, Textarea, focusRing } from '../common/ui';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { LabelChip } from './LabelChips';
import { contrastInk, foldText } from '../../lib/format';
import { t } from '../../i18n/vi';
import { useUiStore } from '../../stores/uiStore';
import type { Label, LabelEntity, LabelGroup, LabelNameCheck, LabelRecord } from '../../types';

const LABEL_COLORS = [
  '#61bd4f',
  '#f2d600',
  '#ff9f1a',
  '#eb5a46',
  '#c377e0',
  '#0079bf',
  '#00c2e0',
  '#51e898',
  '#ff78cb',
  '#344563',
  '#8993a4',
  '#026aa7',
];

const ENTITIES: LabelEntity[] = ['card', 'customer', 'deal', 'contact', 'contract'];

interface Draft {
  id?: number;
  parent_id: number | null;
  name: string;
  color: string;
  description: string;
  scope: LabelEntity[];
  status: 'active' | 'inactive';
}

function emptyDraft(parentId: number | null): Draft {
  return {
    parent_id: parentId,
    name: '',
    color: LABEL_COLORS[parentId === null ? 9 : 0],
    description: '',
    scope: [],
    status: 'active',
  };
}

/**
 * Man Cai dat -> Quan ly nhan (FR-TAG-17).
 *
 * Cay 2 cap: nhom nhan (nhan cha, khong gan truc tiep duoc) chua cac nhan con.
 * Moi nhan hien so ban ghi dang dung; bam vao so do mo danh sach ban ghi (FR-TAG-24).
 */
export function LabelManager() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const [keyword, setKeyword] = useState('');
  const [collapsed, setCollapsed] = useState<number[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<Label | null>(null);
  const [merging, setMerging] = useState<Label | null>(null);
  const [viewing, setViewing] = useState<Label | null>(null);

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['labels', 'tree'],
    queryFn: () => api.get<LabelGroup[]>('/api/labels?tree=1'),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['labels'] });
    queryClient.invalidateQueries({ queryKey: ['label-links'] });
    queryClient.invalidateQueries({ queryKey: ['board'] });
  };

  const remove = useMutation({
    mutationFn: ({ id, force }: { id: number; force?: boolean }) =>
      api.del(`/api/labels/${id}${force ? '?force=1' : ''}`),
    onSuccess: () => {
      refresh();
      setDeleting(null);
    },
    onError: (e: Error) => {
      pushToast(e.message, 'error');
      setDeleting(null);
    },
  });

  const deactivate = useMutation({
    mutationFn: (id: number) => api.patch(`/api/labels/${id}`, { status: 'inactive' }),
    onSuccess: () => {
      refresh();
      setDeleting(null);
    },
  });

  const q = foldText(keyword.trim());
  const visible = q
    ? groups
        .map((group) => ({
          ...group,
          children: group.children.filter(
            (c) =>
              foldText(c.name).includes(q) ||
              foldText(c.description ?? '').includes(q) ||
              foldText(group.name).includes(q)
          ),
        }))
        .filter((group) => group.children.length > 0 || foldText(group.name).includes(q))
    : groups;

  const allChildren = groups.flatMap((g) => g.children);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-56">
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={t.labels.searchPlaceholder}
            aria-label={t.labels.searchPlaceholder}
          />
        </div>
        <Button variant="primary" onClick={() => setDraft(emptyDraft(null))}>
          <Plus size={15} /> {t.labels.newGroup}
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-tr-muted">{t.common.loading}</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-tr-muted">{keyword ? t.labels.noResults : t.labels.empty}</p>
      ) : (
        <ul className="divide-y divide-tr-border rounded-panel border border-tr-border">
          {visible.map((group) => {
            const open = !collapsed.includes(group.id);
            return (
              <li key={group.id}>
                {/* ---- Dong nhom (nhan cha) ---- */}
                <div className="flex items-center gap-2 px-2 py-2">
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsed((prev) =>
                        prev.includes(group.id)
                          ? prev.filter((x) => x !== group.id)
                          : [...prev, group.id]
                      )
                    }
                    aria-expanded={open}
                    className={`rounded p-1 text-tr-muted hover:bg-tr-hover ${focusRing}`}
                  >
                    {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  <span
                    className="h-3 w-3 shrink-0 rounded-sm"
                    style={{ backgroundColor: group.color }}
                    aria-hidden="true"
                  />
                  <span className="font-semibold text-tr-text">{group.name}</span>
                  {group.status === 'inactive' && (
                    <span className="rounded bg-tr-hover px-1.5 py-0.5 text-[10px] text-tr-muted">
                      {t.labels.inactive}
                    </span>
                  )}
                  {!!group.scope_list?.length && (
                    <span className="text-xs text-tr-muted">
                      {t.labels.scope}: {group.scope_list.map((s) => t.labelEntity[s]).join(', ')}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-tr-muted">
                    {group.used_count} {t.labels.used}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    title={t.labels.addChild}
                    onClick={() => setDraft(emptyDraft(group.id))}
                  >
                    <Plus size={14} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    title={t.common.edit}
                    onClick={() =>
                      setDraft({
                        id: group.id,
                        parent_id: null,
                        name: group.name,
                        color: group.color,
                        description: group.description ?? '',
                        scope: group.scope_list ?? [],
                        status: group.status ?? 'active',
                      })
                    }
                  >
                    <Pencil size={14} />
                  </Button>
                  {group.is_system !== 1 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-tr-danger"
                      title={t.common.delete}
                      onClick={() => setDeleting(group)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  )}
                </div>

                {/* ---- Cac nhan con ---- */}
                {open && (
                  <ul className="pb-1">
                    {group.children.length === 0 && (
                      <li className="px-10 pb-2 text-xs text-tr-muted">
                        {group.is_system === 1 ? t.labels.systemGroupHint : t.labels.addChild}
                      </li>
                    )}
                    {group.children.map((label) => (
                      <li
                        key={label.id}
                        className="flex items-center gap-2 px-2 py-1.5 pl-10 hover:bg-tr-hover/50"
                      >
                        <LabelChip label={{ ...label, group_name: group.name }} />
                        {label.description && (
                          <span className="truncate text-xs text-tr-muted">
                            {label.description}
                          </span>
                        )}
                        {label.status === 'inactive' && (
                          <span className="rounded bg-tr-hover px-1.5 py-0.5 text-[10px] text-tr-muted">
                            {t.labels.inactive}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => setViewing(label)}
                          disabled={!label.used_count}
                          title={t.labels.viewRecords}
                          className={`ml-auto rounded px-1.5 py-0.5 text-xs tabular-nums transition ${
                            label.used_count
                              ? 'text-tr-primary hover:bg-tr-hover'
                              : 'cursor-default text-tr-muted'
                          } ${focusRing}`}
                        >
                          {label.used_count
                            ? `${label.used_count} ${t.labels.used}`
                            : t.labels.usedNone}
                        </button>
                        <Button
                          size="sm"
                          variant="ghost"
                          title={t.labels.merge}
                          onClick={() => setMerging(label)}
                        >
                          <Merge size={14} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          title={t.common.edit}
                          onClick={() =>
                            setDraft({
                              id: label.id,
                              parent_id: group.id,
                              name: label.name,
                              color: label.color,
                              description: label.description ?? '',
                              scope: [],
                              status: label.status ?? 'active',
                            })
                          }
                        >
                          <Pencil size={14} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-tr-danger"
                          title={t.common.delete}
                          onClick={() => setDeleting(label)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {draft && (
        <LabelEditor
          draft={draft}
          groups={groups}
          onClose={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            refresh();
          }}
        />
      )}

      {merging && (
        <MergeDialog
          label={merging}
          candidates={allChildren.filter((l) => l.id !== merging.id)}
          onClose={() => setMerging(null)}
          onDone={() => {
            setMerging(null);
            refresh();
          }}
        />
      )}

      {viewing && <RecordsDialog label={viewing} onClose={() => setViewing(null)} />}

      {/* BR-TAG-16: nhan dang dung thi uu tien vo hieu hoa thay vi xoa */}
      {deleting && (deleting.used_count ?? 0) > 0 ? (
        <Modal
          open
          onClose={() => setDeleting(null)}
          title={t.labels.deleteUsed}
          width="max-w-md"
          footer={
            <>
              <Button onClick={() => setDeleting(null)}>{t.common.cancel}</Button>
              <Button variant="primary" onClick={() => deactivate.mutate(deleting.id)}>
                <EyeOff size={15} /> {t.labels.deactivate}
              </Button>
              <Button
                variant="danger"
                onClick={() => remove.mutate({ id: deleting.id, force: true })}
              >
                {t.labels.deleteAnyway}
              </Button>
            </>
          }
        >
          <p className="text-sm text-tr-subtle">
            {t.labels.deleteUsedBody(deleting.used_count ?? 0)}
          </p>
        </Modal>
      ) : (
        <ConfirmDialog
          open={deleting !== null}
          message={`Xóa nhãn “${deleting?.name ?? ''}”?`}
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleting && remove.mutate({ id: deleting.id })}
        />
      )}
    </div>
  );
}

/* ---------- Biểu mẫu tạo / sửa nhãn ---------- */

function LabelEditor({
  draft,
  groups,
  onClose,
  onSaved,
}: {
  draft: Draft;
  groups: LabelGroup[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Draft>(draft);
  const [ignoreConflict, setIgnoreConflict] = useState(false);
  const isGroup = form.parent_id === null;
  const name = form.name.trim();

  // FR-TAG-39: hỏi máy chủ xem tên có trùng nhãn khác hoặc trùng trường nghiệp vụ không
  const { data: check } = useQuery({
    queryKey: ['label-check', name, form.parent_id, draft.id],
    queryFn: () =>
      api.get<LabelNameCheck>(
        `/api/labels/check-name?name=${encodeURIComponent(name)}` +
          (form.parent_id ? `&parent_id=${form.parent_id}` : '') +
          (draft.id ? `&id=${draft.id}` : '')
      ),
    enabled: name.length > 0,
  });

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name,
        color: form.color,
        description: form.description,
        status: form.status,
        ...(isGroup ? { scope: form.scope } : {}),
        ...(draft.id ? {} : { parent_id: form.parent_id }),
        ...(draft.id && !isGroup ? { parent_id: form.parent_id } : {}),
      };
      return draft.id
        ? api.patch(`/api/labels/${draft.id}`, payload)
        : api.post('/api/labels', payload);
    },
    onSuccess: onSaved,
  });

  const blocked = check?.duplicate === true;
  const conflict = check?.conflict ?? null;

  return (
    <Modal
      open
      onClose={onClose}
      title={draft.id ? t.common.edit : isGroup ? t.labels.newGroup : t.labels.newLabel}
      width="max-w-lg"
      dirty={form.name !== draft.name}
      footer={
        <>
          <Button onClick={onClose}>{t.common.cancel}</Button>
          <Button
            variant="primary"
            disabled={!name || blocked || (Boolean(conflict) && !ignoreConflict) || save.isPending}
            onClick={() => save.mutate()}
          >
            {t.common.save}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-tr-subtle">{t.labels.name}</span>
          <Input
            autoFocus
            maxLength={30}
            value={form.name}
            onChange={(e) => {
              setForm({ ...form, name: e.target.value });
              setIgnoreConflict(false);
            }}
          />
        </label>

        {blocked && (
          <p className="flex items-start gap-1.5 text-xs text-tr-danger">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {t.labels.duplicate}
          </p>
        )}

        {/* Cảnh báo mềm — vẫn cho tạo nếu người dùng khẳng định (FR-TAG-39) */}
        {conflict && !blocked && (
          <div className="rounded-panel border border-tr-warning/50 bg-tr-warning/10 p-3">
            <p className="mb-2 flex items-start gap-1.5 text-xs text-tr-text">
              <AlertTriangle size={13} className="mt-0.5 shrink-0 text-tr-warning" />
              {t.labels.conflictBody(conflict.field, conflict.value)}
            </p>
            <label className="flex items-center gap-2 text-xs text-tr-subtle">
              <input
                type="checkbox"
                checked={ignoreConflict}
                onChange={(e) => setIgnoreConflict(e.target.checked)}
              />
              {t.labels.createAnyway}
            </label>
          </div>
        )}

        {!isGroup && (
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-tr-subtle">
              {t.labels.inGroup}
            </span>
            <Select
              value={String(form.parent_id ?? '')}
              onChange={(e) => setForm({ ...form, parent_id: Number(e.target.value) })}
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </label>
        )}

        <div>
          <span className="mb-1 block text-xs font-semibold text-tr-subtle">{t.labels.color}</span>
          <div className="flex flex-wrap gap-1.5">
            {LABEL_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={color}
                onClick={() => setForm({ ...form, color })}
                className={`h-7 w-7 rounded-md transition ${focusRing} ${
                  form.color === color ? 'ring-2 ring-tr-text ring-offset-1' : ''
                }`}
                style={{ backgroundColor: color, color: contrastInk(color) }}
              >
                {form.color === color ? '✓' : ''}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-tr-subtle">
            {t.labels.description}
          </span>
          <Textarea
            rows={2}
            maxLength={200}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>

        {/* FR-TAG-30: phạm vi khai báo ở nhóm, nhãn con kế thừa */}
        {isGroup && (
          <div>
            <span className="mb-1 block text-xs font-semibold text-tr-subtle">
              {t.labels.scope}
            </span>
            <div className="flex flex-wrap gap-3">
              {ENTITIES.map((entity) => (
                <label key={entity} className="flex items-center gap-1.5 text-sm text-tr-text">
                  <input
                    type="checkbox"
                    checked={form.scope.includes(entity)}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        scope: e.target.checked
                          ? [...form.scope, entity]
                          : form.scope.filter((s) => s !== entity),
                      })
                    }
                  />
                  {t.labelEntity[entity]}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-tr-muted">
              {form.scope.length === 0 ? t.labels.scopeAll : ''}
            </p>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-tr-text">
          <input
            type="checkbox"
            checked={form.status === 'inactive'}
            onChange={(e) => setForm({ ...form, status: e.target.checked ? 'inactive' : 'active' })}
          />
          {t.labels.inactive}
        </label>

        {save.error && <p className="text-xs text-tr-danger">{(save.error as Error).message}</p>}
      </div>
    </Modal>
  );
}

/* ---------- Gộp nhãn (FR-TAG-31) ---------- */

function MergeDialog({
  label,
  candidates,
  onClose,
  onDone,
}: {
  label: Label;
  candidates: Label[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [targetId, setTargetId] = useState<number | null>(candidates[0]?.id ?? null);
  const pushToast = useUiStore((s) => s.pushToast);
  const target = candidates.find((c) => c.id === targetId);

  const merge = useMutation({
    mutationFn: () => api.post(`/api/labels/${label.id}/merge`, { target_id: targetId }),
    onSuccess: () => {
      pushToast(`Đã gộp “${label.name}” vào “${target?.name ?? ''}”`, 'success');
      onDone();
    },
    onError: (e: Error) => pushToast(e.message, 'error'),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={t.labels.merge}
      width="max-w-md"
      footer={
        <>
          <Button onClick={onClose}>{t.common.cancel}</Button>
          <Button variant="primary" disabled={!targetId} onClick={() => merge.mutate()}>
            {t.labels.mergeInto}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-tr-subtle">{t.labels.mergeHint}</p>
      <div className="mb-3 flex items-center gap-2 text-sm">
        <LabelChip label={label} />
        <span className="text-tr-muted">
          ({label.used_count ?? 0} {t.labels.used}) →
        </span>
        {target && <LabelChip label={target} />}
      </div>
      <Select value={String(targetId ?? '')} onChange={(e) => setTargetId(Number(e.target.value))}>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.group_name ? `${c.group_name} / ${c.name}` : c.name} ({c.used_count ?? 0})
          </option>
        ))}
      </Select>
    </Modal>
  );
}

/* ---------- Mở dữ liệu từ nhãn (FR-TAG-24) ---------- */

function RecordsDialog({ label, onClose }: { label: Label; onClose: () => void }) {
  const { data: records = [], isLoading } = useQuery({
    queryKey: ['label-records', label.id],
    queryFn: () => api.get<LabelRecord[]>(`/api/labels/${label.id}/records`),
  });

  const byType = new Map<string, LabelRecord[]>();
  for (const record of records) {
    const arr = byType.get(record.entity_type) ?? [];
    arr.push(record);
    byType.set(record.entity_type, arr);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${label.name} — ${records.length} ${t.labels.used}`}
      width="max-w-lg"
    >
      {isLoading ? (
        <p className="text-sm text-tr-muted">{t.common.loading}</p>
      ) : records.length === 0 ? (
        <p className="text-sm text-tr-muted">{t.labels.usedNone}</p>
      ) : (
        <div className="space-y-3">
          {[...byType.entries()].map(([type, rows]) => (
            <div key={type}>
              <p className="mb-1 text-xs font-semibold tracking-wide text-tr-muted uppercase">
                {t.labelEntity[type as LabelEntity]} ({rows.length})
              </p>
              <ul className="divide-y divide-tr-border rounded-panel border border-tr-border">
                {rows.map((row) => (
                  <li
                    key={`${row.entity_type}-${row.id}`}
                    className="px-3 py-1.5 text-sm text-tr-text"
                  >
                    {row.title}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
