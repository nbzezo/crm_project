import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Modal } from '../common/Modal';
import { Button, DateInput, Field, FormError, Input, Select, Textarea } from '../common/ui';
import { AssigneePicker } from '../tasks/AssigneePicker';
import { CustomerCombobox } from './CustomerCombobox';
import { PROJECT_STATUSES } from '@workflow/contracts';
import { t } from '../../i18n/vi';
import { useCustomerOptions } from '../../lib/useCrmOptions';
import { useFormErrors, type FieldIssue } from '../../lib/useFormErrors';
import type { Project, ProjectStatus } from '../../types';

const EMPTY = {
  name: '',
  code: '',
  status: 'planning' as ProjectStatus,
  plan_start: null as string | null,
  plan_end: null as string | null,
  actual_start: null as string | null,
  actual_end: null as string | null,
  budget_vnd: 0,
  notes: '',
};

/** Form dự án — dùng chung cho tạo mới và sửa (truyền `project`). */
export function ProjectForm({
  open,
  onClose,
  project,
  defaults,
  requireCustomer = false,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  project?: Project;
  /** Điền sẵn khi tạo mới — ví dụ mở từ một công việc đã gắn khách hàng. */
  defaults?: { name?: string; customer_id?: number | null };
  /**
   * Bắt buộc chọn khách hàng. Tạo từ màn công việc thì dự án phải thuộc một khách
   * hàng; ở trang Dự án vẫn được để trống cho dự án nội bộ.
   */
  requireCustomer?: boolean;
  /** Gọi sau khi TẠO MỚI thành công, kèm dự án vừa tạo. */
  onCreated?: (project: Project) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [customerId, setCustomerId] = useState<number | ''>('');
  const [ownerId, setOwnerId] = useState<number | null>(null);
  const [loadedId, setLoadedId] = useState<number | 'new' | null>(null);
  const { submitted, validate, reset: resetErrors } = useFormErrors();

  const { data: customers = [] } = useCustomerOptions(open);

  // Nạp lại ngay trong render — cùng lý do với TaskFormDialog: đặt trong useEffect
  // thì lần render commit đầu tiên vẫn mang dữ liệu của dự án trước.
  const key = project?.id ?? 'new';
  if (open && loadedId !== key) {
    setLoadedId(key);
    setForm(
      project
        ? {
            name: project.name,
            code: project.code ?? '',
            status: project.status,
            plan_start: project.plan_start,
            plan_end: project.plan_end,
            actual_start: project.actual_start,
            actual_end: project.actual_end,
            budget_vnd: project.budget_vnd,
            notes: project.notes,
          }
        : { ...EMPTY, name: defaults?.name ?? '' }
    );
    setCustomerId(project?.customer_id ?? defaults?.customer_id ?? '');
    setOwnerId(project?.owner_contact_id ?? null);
    resetErrors();
  }
  if (!open && loadedId !== null) setLoadedId(null);

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        code: form.code.trim() || null,
        customer_id: customerId === '' ? null : customerId,
        owner_contact_id: ownerId,
      };
      return project
        ? api.patch<Project>(`/api/projects/${project.id}`, payload)
        : api.post<Project>('/api/projects', payload);
    },
    onSuccess: (saved) => {
      if (!project) onCreated?.(saved);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      if (project) queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      onClose();
    },
  });

  const set = <K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const nameMissing = !form.name.trim();
  const customerMissing = requireCustomer && customerId === '';
  const issues: FieldIssue[] = [];
  if (nameMissing) issues.push({ id: 'project-name', label: 'Tên dự án' });
  if (customerMissing) issues.push({ id: 'project-customer', label: t.card.customer });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={project ? `${t.common.edit}: ${project.name}` : 'Dự án mới'}
      dirty={form.name.trim() !== (project?.name ?? defaults?.name ?? '')}
      footer={
        <>
          <Button onClick={onClose}>{t.common.cancel}</Button>
          <Button
            variant="primary"
            disabled={save.isPending}
            onClick={() => {
              if (!validate(issues)) return;
              save.mutate();
            }}
          >
            {save.isPending ? t.common.saving : t.common.save}
          </Button>
        </>
      }
    >
      <FormError error={save.error} />
      {submitted && issues.length > 0 && (
        <FormError
          takeFocus={false}
          error={new Error('Chưa lưu được — còn trường bắt buộc chưa điền.')}
          fields={issues}
        />
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field
            label="Tên dự án"
            required
            error={submitted && nameMissing ? t.common.required : undefined}
          >
            <Input
              id="project-name"
              autoFocus
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </Field>
        </div>
        <Field label="Mã dự án">
          <Input
            value={form.code}
            onChange={(e) => set('code', e.target.value)}
            placeholder="DA-2026-01"
          />
        </Field>
        <Field
          label={t.card.customer}
          required={requireCustomer}
          hint={requireCustomer ? undefined : 'Để trống nếu là dự án nội bộ.'}
          error={submitted && customerMissing ? t.common.required : undefined}
        >
          <CustomerCombobox
            id="project-customer"
            value={customerId}
            onChange={setCustomerId}
            options={customers.map((c) => ({ id: c.id, label: c.name }))}
            placeholder={requireCustomer ? t.common.selectCustomer : '— Dự án nội bộ —'}
            searchPlaceholder="Tìm khách hàng…"
            emptyText="Không tìm thấy khách hàng."
            ariaLabel={t.card.customer}
          />
        </Field>

        <AssigneePicker
          label="Chủ dự án"
          value={ownerId}
          onChange={setOwnerId}
          hint="Người chịu trách nhiệm chung cho tiến độ dự án."
        />
        <Field label="Trạng thái">
          <Select
            value={form.status}
            onChange={(e) => set('status', e.target.value as ProjectStatus)}
          >
            {PROJECT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t.projectStatus[status]}
              </option>
            ))}
          </Select>
        </Field>

        {/* Kế hoạch và thực tế đặt cạnh nhau: chênh lệch giữa hai cặp ngày này
            chính là phép đo, không phải thông tin phụ. */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Bắt đầu (kế hoạch)">
            <DateInput value={form.plan_start} onChange={(v) => set('plan_start', v)} />
          </Field>
          <Field label="Kết thúc (kế hoạch)">
            <DateInput value={form.plan_end} onChange={(v) => set('plan_end', v)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Bắt đầu (thực tế)">
            <DateInput value={form.actual_start} onChange={(v) => set('actual_start', v)} />
          </Field>
          <Field label="Kết thúc (thực tế)">
            <DateInput value={form.actual_end} onChange={(v) => set('actual_end', v)} />
          </Field>
        </div>

        <Field label="Ngân sách (₫)">
          <Input
            type="number"
            min={0}
            value={form.budget_vnd}
            onChange={(e) => set('budget_vnd', Number(e.target.value) || 0)}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label={t.customer.notes}>
            <Textarea rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
