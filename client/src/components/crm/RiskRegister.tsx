/**
 * Sổ rủi ro / vấn đề / đề nghị thay đổi / quyết định của một dự án (đặc tả 6.6).
 *
 * Một danh sách cho cả bốn loại, sắp theo **mức độ cần xử lý** chứ không theo
 * thời gian tạo — danh sách này tồn tại để trả lời "hôm nay lo cái gì", nên thứ
 * tự thời gian tạo là thứ tự vô dụng nhất có thể chọn. Máy chủ đã sắp sẵn.
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, Plus, Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import {
  Button,
  DateInput,
  EmptyState,
  Field,
  FormError,
  Input,
  Panel,
  Select,
  Textarea,
  focusRing,
} from '../common/ui';
import { AssigneePicker } from '../tasks/AssigneePicker';
import { Modal } from '../common/Modal';
import { t } from '../../i18n/vi';
import { formatDate } from '../../lib/format';
import type { ProjectRisk, RiskKind, RiskSeverity, RiskStatus } from '../../types';

const KINDS: RiskKind[] = ['risk', 'issue', 'change', 'decision'];
const SEVERITIES: RiskSeverity[] = ['high', 'medium', 'low'];
const STATUSES: RiskStatus[] = ['open', 'mitigating', 'closed'];

const SEVERITY_TONE: Record<RiskSeverity, string> = {
  high: 'bg-tr-danger/15 text-tr-danger',
  medium: 'bg-tr-warning/15 text-tr-warning',
  low: 'bg-tr-hover text-tr-subtle',
};

const EMPTY = {
  kind: 'risk' as RiskKind,
  title: '',
  detail: '',
  severity: 'medium' as RiskSeverity,
  owner_contact_id: null as number | null,
  due_date: null as string | null,
};

export function RiskRegister({ projectId, risks }: { projectId: number; risks: ProjectRisk[] }) {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY);
  /** Lọc theo loại; rỗng = tất cả. */
  const [kindFilter, setKindFilter] = useState<'' | RiskKind>('');

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['project', projectId] });

  const create = useMutation({
    mutationFn: () => api.post<ProjectRisk>(`/api/projects/${projectId}/risks`, form),
    onSuccess: () => {
      setCreating(false);
      setForm(EMPTY);
      refresh();
    },
  });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<ProjectRisk> }) =>
      api.patch<ProjectRisk>(`/api/projects/${projectId}/risks/${id}`, body),
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/api/projects/${projectId}/risks/${id}`),
    onSuccess: refresh,
  });

  const shown = kindFilter ? risks.filter((risk) => risk.kind === kindFilter) : risks;
  const openCount = risks.filter((risk) => risk.status !== 'closed').length;

  return (
    <Panel title={`Sổ rủi ro & thay đổi (${openCount} đang mở)`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select
          value={kindFilter}
          onChange={(event) => setKindFilter(event.target.value as '' | RiskKind)}
          aria-label="Lọc theo loại"
          className="max-w-48"
        >
          <option value="">Tất cả loại</option>
          {KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {t.riskKind[kind]}
            </option>
          ))}
        </Select>
        <span className="flex-1" />
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus size={15} aria-hidden="true" /> Thêm mục
        </Button>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          message={risks.length === 0 ? 'Chưa có mục nào.' : 'Không có mục nào thuộc loại này.'}
          hint={
            risks.length === 0
              ? 'Ghi lại rủi ro, vấn đề, đề nghị thay đổi và quyết định để chúng không biến mất trong hộp thư.'
              : undefined
          }
        />
      ) : (
        <ul className="space-y-1.5">
          {shown.map((risk) => {
            const closed = risk.status === 'closed';
            const overdue =
              !closed &&
              risk.due_date !== null &&
              risk.due_date < new Date().toISOString().slice(0, 10);
            return (
              <li
                key={risk.id}
                className="group rounded-control border border-tr-border px-3 py-2.5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-tr-hover px-1.5 py-0.5 text-2xs font-semibold text-tr-subtle">
                    {t.riskKind[risk.kind]}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-2xs font-semibold ${SEVERITY_TONE[risk.severity]}`}
                  >
                    {t.riskSeverity[risk.severity]}
                  </span>
                  <span
                    className={`min-w-0 flex-1 text-sm font-medium ${closed ? 'text-tr-muted line-through' : 'text-tr-text'}`}
                  >
                    {risk.title}
                  </span>

                  <Select
                    value={risk.status}
                    onChange={(event) =>
                      patch.mutate({
                        id: risk.id,
                        body: { status: event.target.value as RiskStatus },
                      })
                    }
                    aria-label={`Trạng thái: ${risk.title}`}
                    className="max-w-36 shrink-0"
                  >
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {t.riskStatus[status]}
                      </option>
                    ))}
                  </Select>

                  <button
                    type="button"
                    onClick={() => remove.mutate(risk.id)}
                    aria-label={`Xóa: ${risk.title}`}
                    className={`shrink-0 rounded p-1 text-tr-muted opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 hover:text-tr-danger ${focusRing}`}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>

                {risk.detail && (
                  <p className="mt-1 text-xs whitespace-pre-wrap text-tr-subtle">{risk.detail}</p>
                )}

                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-tr-muted">
                  {risk.owner_name && <span>Phụ trách: {risk.owner_name}</span>}
                  {risk.due_date && (
                    <span className={overdue ? 'font-semibold text-tr-danger' : ''}>
                      Hạn {formatDate(risk.due_date)}
                      {overdue && ' · quá hạn'}
                    </span>
                  )}
                  {risk.closed_at && (
                    <span className="inline-flex items-center gap-1 text-tr-success">
                      <CircleCheck size={11} aria-hidden="true" />
                      Đóng {formatDate(risk.closed_at.slice(0, 10))}
                    </span>
                  )}
                  {risk.resolution && <span>Kết quả: {risk.resolution}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Thêm vào sổ rủi ro"
        width="max-w-xl"
        footer={
          <>
            <Button onClick={() => setCreating(false)}>{t.common.cancel}</Button>
            <Button
              variant="primary"
              disabled={!form.title.trim() || create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending ? t.common.saving : t.common.save}
            </Button>
          </>
        }
      >
        <FormError error={create.error} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Loại">
            <Select
              value={form.kind}
              onChange={(event) => setForm({ ...form, kind: event.target.value as RiskKind })}
            >
              {KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {t.riskKind[kind]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Mức độ">
            <Select
              value={form.severity}
              onChange={(event) =>
                setForm({ ...form, severity: event.target.value as RiskSeverity })
              }
            >
              {SEVERITIES.map((severity) => (
                <option key={severity} value={severity}>
                  {t.riskSeverity[severity]}
                </option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Tiêu đề" required>
              <Input
                autoFocus
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="Nhà cung cấp chậm giao thiết bị…"
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Chi tiết">
              <Textarea
                rows={3}
                value={form.detail}
                onChange={(event) => setForm({ ...form, detail: event.target.value })}
                placeholder="Bối cảnh, tác động, phương án giảm thiểu…"
              />
            </Field>
          </div>
          <AssigneePicker
            value={form.owner_contact_id}
            onChange={(value) => setForm({ ...form, owner_contact_id: value })}
            label="Người chịu trách nhiệm"
          />
          <Field label="Hạn xử lý">
            <DateInput
              value={form.due_date}
              onChange={(value) => setForm({ ...form, due_date: value })}
            />
          </Field>
        </div>
      </Modal>
    </Panel>
  );
}
