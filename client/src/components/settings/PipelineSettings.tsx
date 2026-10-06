/**
 * Cài đặt → Quy trình bán hàng (1.26.0).
 *
 * Mỗi giai đoạn của pipeline là một dòng cấu hình: tên, màu, xác suất gợi ý, và các
 * thuộc tính quyết định hành vi — cổng điểm BANT, phủ quyết "chưa gặp người duyệt
 * ngân sách", theo dõi PoC, số ngày tối đa. Mã nguồn chỉ hỏi các thuộc tính này,
 * không gọi tên giai đoạn, nên thêm/đổi tên/sắp xếp không cần cập nhật phần mềm.
 *
 * Thành công và Thất bại là hai giai đoạn hệ thống: luôn đứng cuối, đổi tên và màu
 * được, không ẩn hay xoá được (máy chủ cũng chặn).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, EyeOff, Lock, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import { Button, Field, FormError, IconButton, Input, Panel, Select } from '../common/ui';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { useUiStore } from '../../stores/uiStore';
import { STAGE_FALLBACK_COLOR } from '../../i18n/vi';
import { usePermission } from '../../lib/permissions';
import { CRM_CONFIG_QUERY_KEY, usePipeline, type PipelineStage } from '../../lib/crmConfig';

type StagePatch = Partial<
  Pick<PipelineStage, 'label' | 'color' | 'probability' | 'gate_bant_min' | 'max_days_in_stage'> & {
    require_economic_buyer: boolean;
    track_poc: boolean;
  }
>;

export function PipelineSettings() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const canEdit = usePermission('settings.app', 'update');
  const pipeline = usePipeline();
  const base = `/api/crm-config/pipelines/${pipeline.id}/stages`;

  const [newLabel, setNewLabel] = useState('');
  const [after, setAfter] = useState<number | ''>('');
  const [archiving, setArchiving] = useState<PipelineStage | null>(null);
  const [deleting, setDeleting] = useState<PipelineStage | null>(null);

  const counts = useQuery({
    queryKey: ['crm-config', 'stage-counts'],
    queryFn: () => api.get<Record<string, number>>('/api/crm-config/pipelines/stage-counts'),
    enabled: canEdit,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: CRM_CONFIG_QUERY_KEY });
    /* Kanban, Tổng quan, Báo cáo đọc cột theo giai đoạn. */
    queryClient.invalidateQueries({ queryKey: ['deals'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['scoring-settings'] });
  };

  const create = useMutation({
    mutationFn: () =>
      api.post(base, { label: newLabel.trim(), after_stage_id: after === '' ? null : after }),
    onSuccess: () => {
      setNewLabel('');
      refresh();
    },
  });
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: number; body: StagePatch }) =>
      api.patch(`${base}/${id}`, body),
    onSuccess: refresh,
  });
  const reorder = useMutation({
    mutationFn: (ids: number[]) => api.put(`${base}/order`, { ids }),
    onSuccess: refresh,
  });
  const restore = useMutation({
    mutationFn: (id: number) => api.post(`${base}/${id}/restore`),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.del(`${base}/${id}`),
    onSuccess: () => {
      setDeleting(null);
      refresh();
    },
  });

  const open = pipeline.stages.filter((stage) => stage.category === 'open');
  const move = (index: number, delta: number) => {
    const ids = open.map((stage) => stage.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorder.mutate(ids);
  };

  const error =
    create.error ?? patch.error ?? reorder.error ?? restore.error ?? remove.error ?? null;

  return (
    <div className="space-y-4">
      <Panel title="Quy trình bán hàng">
        <p className="mb-3 text-xs text-tr-muted">
          Các giai đoạn một cơ hội đi qua, theo thứ tự trên Kanban. <b>Cổng BANT</b> là điểm tối
          thiểu để chuyển cơ hội vào giai đoạn đó (để trống là không chặn; người dùng vẫn ghi đè
          được kèm lý do). Chuyển sang Thất bại không bao giờ bị chặn.
        </p>
        <FormError error={error} />
        <ol className="space-y-2">
          {pipeline.stages.map((stage) => {
            const openIndex = open.findIndex((entry) => entry.id === stage.id);
            return (
              <StageRow
                key={stage.id}
                stage={stage}
                count={counts.data?.[stage.key]}
                canEdit={canEdit}
                canUp={openIndex > 0}
                canDown={openIndex >= 0 && openIndex < open.length - 1}
                busy={reorder.isPending}
                onMove={(delta) => move(openIndex, delta)}
                onPatch={(body) => patch.mutate({ id: stage.id, body })}
                onArchive={() => setArchiving(stage)}
                onRestore={() => restore.mutate(stage.id)}
                onDelete={() => setDeleting(stage)}
              />
            );
          })}
        </ol>

        {canEdit && (
          <form
            className="mt-4 flex flex-wrap items-end gap-2 border-t border-tr-border pt-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (newLabel.trim()) create.mutate();
            }}
          >
            <Field label="Thêm giai đoạn">
              <Input
                value={newLabel}
                onChange={(event) => setNewLabel(event.target.value)}
                maxLength={60}
                placeholder="VD: Rà soát pháp lý"
                className="max-w-60"
              />
            </Field>
            <Field label="Đặt sau">
              <Select
                value={after}
                onChange={(event) =>
                  setAfter(event.target.value === '' ? '' : Number(event.target.value))
                }
                className="max-w-60"
              >
                <option value="">Cuối các giai đoạn mở</option>
                {open.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" disabled={!newLabel.trim() || create.isPending}>
              <Plus size={15} aria-hidden="true" /> Thêm
            </Button>
          </form>
        )}
      </Panel>

      {archiving && (
        <ArchiveDialog
          pipelineId={pipeline.id}
          stage={archiving}
          stages={pipeline.stages}
          count={counts.data?.[archiving.key] ?? 0}
          onClose={() => setArchiving(null)}
          onDone={(moved) => {
            setArchiving(null);
            refresh();
            pushToast(
              moved > 0 ? `Đã ẩn giai đoạn, chuyển ${moved} cơ hội` : 'Đã ẩn giai đoạn',
              'success'
            );
          }}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        message={`Xoá hẳn giai đoạn "${deleting?.label ?? ''}"? Giai đoạn chưa từng có cơ hội nào.`}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

function StageRow({
  stage,
  count,
  canEdit,
  canUp,
  canDown,
  busy,
  onMove,
  onPatch,
  onArchive,
  onRestore,
  onDelete,
}: {
  stage: PipelineStage;
  count: number | undefined;
  canEdit: boolean;
  canUp: boolean;
  canDown: boolean;
  busy: boolean;
  onMove: (delta: number) => void;
  onPatch: (body: StagePatch) => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const system = stage.category !== 'open';
  const inactive = stage.is_active === 0;
  return (
    <li
      className={`rounded-control border border-tr-border p-2.5 ${inactive ? 'opacity-60' : ''}`}
      style={{ borderLeft: `4px solid ${stage.color ?? 'var(--tr-border)'}` }}
    >
      <div className="flex flex-wrap items-center gap-2">
        {system ? (
          <span
            className="inline-flex h-11 w-[5.5rem] items-center justify-center text-tr-muted fine:h-8"
            title="Giai đoạn hệ thống luôn đứng cuối"
          >
            <Lock size={14} aria-hidden="true" />
          </span>
        ) : (
          <div className="flex shrink-0">
            <IconButton
              label={`Đưa "${stage.label}" lên`}
              disabled={!canEdit || !canUp || busy}
              onClick={() => onMove(-1)}
            >
              <ArrowUp size={14} aria-hidden="true" />
            </IconButton>
            <IconButton
              label={`Đưa "${stage.label}" xuống`}
              disabled={!canEdit || !canDown || busy}
              onClick={() => onMove(1)}
            >
              <ArrowDown size={14} aria-hidden="true" />
            </IconButton>
          </div>
        )}
        <input
          type="color"
          aria-label={`Màu giai đoạn ${stage.label}`}
          value={stage.color ?? STAGE_FALLBACK_COLOR}
          disabled={!canEdit}
          onChange={(event) => onPatch({ color: event.target.value })}
          className="h-8 w-9 shrink-0 cursor-pointer rounded border border-tr-border bg-transparent"
        />
        <CommitInput
          value={stage.label}
          disabled={!canEdit}
          ariaLabel={`Tên giai đoạn ${stage.label}`}
          onCommit={(label) => label && onPatch({ label })}
          className="min-w-40 flex-1"
        />
        <span className="shrink-0 text-xs text-tr-muted">
          {count === undefined ? '' : `${count} cơ hội`}
          {system && ' · hệ thống'}
          {inactive && ' · đang ẩn'}
        </span>
        {!system &&
          (inactive ? (
            <>
              <IconButton
                label={`Dùng lại "${stage.label}"`}
                disabled={!canEdit}
                onClick={onRestore}
              >
                <RotateCcw size={14} aria-hidden="true" />
              </IconButton>
              <IconButton
                label={`Xoá hẳn "${stage.label}"`}
                tone="danger"
                disabled={!canEdit}
                onClick={onDelete}
              >
                <Trash2 size={14} aria-hidden="true" />
              </IconButton>
            </>
          ) : (
            <IconButton label={`Ẩn "${stage.label}"`} disabled={!canEdit} onClick={onArchive}>
              <EyeOff size={14} aria-hidden="true" />
            </IconButton>
          ))}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <NumberField
          label="Xác suất (%)"
          value={stage.probability}
          min={0}
          max={100}
          disabled={!canEdit || system}
          hint={system ? 'Cố định' : undefined}
          onCommit={(value) => value !== null && onPatch({ probability: value })}
        />
        <NumberField
          label="Cổng BANT tối thiểu"
          value={stage.gate_bant_min}
          min={0}
          max={12}
          placeholder="không chặn"
          disabled={!canEdit || stage.category === 'lost'}
          onCommit={(value) => onPatch({ gate_bant_min: value })}
        />
        <NumberField
          label="Số ngày tối đa"
          value={stage.max_days_in_stage}
          min={1}
          max={3650}
          placeholder="không giới hạn"
          disabled={!canEdit || system}
          onCommit={(value) => onPatch({ max_days_in_stage: value })}
        />
        <div className="flex flex-col justify-end gap-1 text-xs text-tr-subtle">
          {!system && (
            <>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={stage.require_economic_buyer === 1}
                  disabled={!canEdit}
                  onChange={(event) => onPatch({ require_economic_buyer: event.target.checked })}
                  className="h-4 w-4 rounded border-tr-border"
                />
                Phải gặp người duyệt ngân sách
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={stage.track_poc === 1}
                  disabled={!canEdit}
                  onChange={(event) => onPatch({ track_poc: event.target.checked })}
                  className="h-4 w-4 rounded border-tr-border"
                />
                Theo dõi PoC
              </label>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

/** Ô chữ lưu khi rời ô / bấm Enter; Esc trả về giá trị cũ. */
function CommitInput({
  value,
  disabled,
  ariaLabel,
  onCommit,
  className = '',
}: {
  value: string;
  disabled: boolean;
  ariaLabel: string;
  onCommit: (value: string) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [source, setSource] = useState(value);
  if (value !== source) {
    setSource(value);
    setDraft(value);
  }
  return (
    <Input
      value={draft}
      disabled={disabled}
      maxLength={60}
      aria-label={ariaLabel}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const next = draft.trim();
        if (!next) setDraft(value);
        else if (next !== value) onCommit(next);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') setDraft(value);
      }}
      className={className}
    />
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  placeholder,
  disabled,
  hint,
  onCommit,
}: {
  label: string;
  value: number | null;
  min: number;
  max: number;
  placeholder?: string;
  disabled: boolean;
  hint?: string;
  onCommit: (value: number | null) => void;
}) {
  const text = value === null ? '' : String(value);
  const [draft, setDraft] = useState(text);
  const [source, setSource] = useState(text);
  if (text !== source) {
    setSource(text);
    setDraft(text);
  }
  return (
    <Field label={label} hint={hint}>
      <Input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={draft}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft === text) return;
          if (draft.trim() === '') return onCommit(null);
          const number = Math.round(Number(draft));
          if (!Number.isFinite(number) || number < min || number > max) {
            setDraft(text);
            return;
          }
          onCommit(number);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
    </Field>
  );
}

function ArchiveDialog({
  pipelineId,
  stage,
  stages,
  count,
  onClose,
  onDone,
}: {
  pipelineId: number;
  stage: PipelineStage;
  stages: PipelineStage[];
  count: number;
  onClose: () => void;
  onDone: (moved: number) => void;
}) {
  const targets = stages.filter(
    (entry) => entry.category === 'open' && entry.is_active === 1 && entry.id !== stage.id
  );
  const [target, setTarget] = useState<number>(targets[0]?.id ?? 0);
  const archive = useMutation({
    mutationFn: () =>
      api.post<{ moved: number }>(
        `/api/crm-config/pipelines/${pipelineId}/stages/${stage.id}/archive`,
        { move_to_stage_id: count > 0 ? target : null }
      ),
    onSuccess: (result) => onDone(result.moved),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Ẩn giai đoạn "${stage.label}"`}
      width="max-w-md"
      footer={
        <>
          <Button onClick={onClose}>Huỷ</Button>
          <Button
            variant="primary"
            disabled={archive.isPending || (count > 0 && !target)}
            onClick={() => archive.mutate()}
          >
            {archive.isPending ? 'Đang ẩn…' : 'Ẩn giai đoạn'}
          </Button>
        </>
      }
    >
      <FormError error={archive.error} />
      <p className="mb-3 text-sm text-tr-subtle">
        Giai đoạn ẩn sẽ biến khỏi Kanban và ô chọn; lịch sử cơ hội từng đi qua nó vẫn giữ nguyên.
        Bạn có thể dùng lại nó bất cứ lúc nào.
      </p>
      {count > 0 && (
        <Field
          label={`Chuyển ${count} cơ hội đang ở giai đoạn này sang`}
          hint="Không áp cổng điểm cho lần chuyển này; mỗi cơ hội được ghi vào nhật ký thay đổi."
        >
          <Select value={target} onChange={(event) => setTarget(Number(event.target.value))}>
            {targets.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </Select>
        </Field>
      )}
    </Modal>
  );
}
