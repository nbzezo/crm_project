import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { api, qs } from '../../api/client';
import { Modal } from '../common/Modal';
import { Button, Field, FormError, Input, Select, Textarea } from '../common/ui';
import { ACCOUNT_SIZES, ACCOUNT_SOURCES, t } from '../../i18n/vi';
import { invalidateCrmViews } from '../../lib/queryKeys';
import type { Customer } from '../../types';

const EMPTY = {
  name: '',
  short_name: '',
  tax_code: '',
  industry: '',
  address: '',
  website: '',
  phone: '',
  email: '',
  size: '',
  source: '',
  status: 'prospect' as 'prospect' | 'customer' | 'inactive',
  notes: '',
};

type Duplicate = { id: number; name: string; tax_code: string | null; website: string | null };

export function CustomerForm({
  open,
  onClose,
  customer,
}: {
  open: boolean;
  onClose: () => void;
  customer?: Customer;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [touchedName, setTouchedName] = useState(false);
  /** Ban sao luc mo form — dung de biet nguoi dung da sua gi chua. */
  const initialRef = useRef(EMPTY);

  useEffect(() => {
    if (!open) return;
    const next = customer
      ? {
          name: customer.name,
          short_name: customer.short_name ?? '',
          tax_code: customer.tax_code ?? '',
          industry: customer.industry ?? '',
          address: customer.address ?? '',
          website: customer.website ?? '',
          phone: customer.phone ?? '',
          email: customer.email ?? '',
          size: customer.size ?? '',
          source: customer.source ?? '',
          status: customer.status,
          notes: customer.notes ?? '',
        }
      : EMPTY;
    setForm(next);
    initialRef.current = next;
    setTouchedName(false);
    save.reset();
  }, [open, customer?.id]);

  /** FR-ACC-04: cảnh báo trùng khi tạo mới (không chặn lưu). */
  const { data: duplicates = [] } = useQuery({
    queryKey: ['customers', 'duplicates', form.name, form.tax_code, form.website],
    queryFn: () =>
      api.get<Duplicate[]>(
        `/api/customers/duplicates${qs({ name: form.name, tax_code: form.tax_code, website: form.website })}`
      ),
    enabled: open && !customer && form.name.trim().length >= 3,
  });

  const save = useMutation({
    mutationFn: () =>
      customer
        ? api.patch(`/api/customers/${customer.id}`, form)
        : api.post('/api/customers', form),
    onSuccess: () => {
      invalidateCrmViews(queryClient, customer?.id);
      onClose();
    },
  });

  const set = (key: keyof typeof EMPTY, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const nameMissing = !form.name.trim();
  const dirty = JSON.stringify(form) !== JSON.stringify(initialRef.current);

  return (
    <Modal
      open={open}
      onClose={onClose}
      dirty={dirty && !save.isPending}
      title={customer ? `${t.common.edit}: ${customer.name}` : t.customer.newCustomer}
      footer={
        <>
          <Button onClick={onClose}>{t.common.cancel}</Button>
          {/* disabled theo isPending: mang cham + bam hai lan truoc day tao hai khach hang */}
          <Button
            variant="primary"
            disabled={nameMissing || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? t.common.saving : t.common.save}
          </Button>
        </>
      }
    >
      <FormError error={save.error} />

      {duplicates.length > 0 && (
        <div className="mb-3 flex gap-2 rounded-panel border border-tr-border bg-tr-hover p-3 text-sm">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-tr-warning" aria-hidden="true" />
          <div>
            <p className="font-medium text-tr-text">{t.customer.duplicateWarning}</p>
            <ul className="mt-1 space-y-0.5 text-tr-subtle">
              {duplicates.map((d) => (
                <li key={d.id}>
                  {d.name}
                  {d.tax_code ? ` · MST ${d.tax_code}` : ''}
                  {d.website ? ` · ${d.website}` : ''}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-tr-muted">{t.customer.duplicateHint}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field
            label={t.customer.name}
            required
            error={touchedName && nameMissing ? t.common.required : undefined}
          >
            <Input
              autoFocus
              value={form.name}
              onBlur={() => setTouchedName(true)}
              onChange={(e) => set('name', e.target.value)}
            />
          </Field>
        </div>
        <Field label={t.customer.shortName}>
          <Input value={form.short_name} onChange={(e) => set('short_name', e.target.value)} />
        </Field>
        <Field label={t.customer.taxCode}>
          <Input value={form.tax_code} onChange={(e) => set('tax_code', e.target.value)} />
        </Field>
        <Field label={t.customer.industry}>
          <Input value={form.industry} onChange={(e) => set('industry', e.target.value)} />
        </Field>
        <Field label={t.customer.size}>
          <Select value={form.size} onChange={(e) => set('size', e.target.value)}>
            <option value="">— {t.common.none} —</option>
            {ACCOUNT_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.customer.phone}>
          <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label={t.customer.email}>
          <Input value={form.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label={t.customer.website}>
          <Input value={form.website} onChange={(e) => set('website', e.target.value)} />
        </Field>
        <Field label={t.customer.source}>
          <Select value={form.source} onChange={(e) => set('source', e.target.value)}>
            <option value="">— {t.common.none} —</option>
            {ACCOUNT_SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.customer.status}>
          <Select value={form.status} onChange={(e) => set('status', e.target.value)}>
            {Object.entries(t.accountStatus).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Field label={t.customer.address}>
            <Input value={form.address} onChange={(e) => set('address', e.target.value)} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label={t.customer.notes}>
            <Textarea rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
