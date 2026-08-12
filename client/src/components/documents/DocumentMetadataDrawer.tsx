import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { api } from '../../api/client';
import { DOC_TYPE_ORDER, t } from '../../i18n/vi';
import type { CrmDocument } from '../../types';
import { Drawer } from '../common/Drawer';
import { Button, Field, Input, Select, Textarea } from '../common/ui';
import type { DocumentOptions } from './DocumentUploadManager';

interface MetadataForm {
  name: string;
  doc_type: string;
  customer_id: string;
  deal_id: string;
  contract_id: string;
  quotation_id: string;
  description: string;
  tags: string;
  owner: string;
  effective_date: string;
  expires_at: string;
  confidentiality: CrmDocument['confidentiality'];
}

function formOf(document: CrmDocument): MetadataForm {
  return {
    name: document.name,
    doc_type: document.doc_type,
    customer_id: document.customer_id ? String(document.customer_id) : '',
    deal_id: document.deal_id ? String(document.deal_id) : '',
    contract_id: document.contract_id ? String(document.contract_id) : '',
    quotation_id: document.quotation_id ? String(document.quotation_id) : '',
    description: document.description ?? '',
    tags: document.tags ?? '',
    owner: document.owner ?? '',
    effective_date: document.effective_date ?? '',
    expires_at: document.expires_at ?? '',
    confidentiality: document.confidentiality ?? 'internal',
  };
}

export function DocumentMetadataDrawer({
  document,
  options,
  onClose,
}: {
  document: CrmDocument | null;
  options: DocumentOptions;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<MetadataForm | null>(document ? formOf(document) : null);

  useEffect(() => setForm(document ? formOf(document) : null), [document]);

  const customerId = form?.customer_id ? Number(form.customer_id) : null;
  const deals = useMemo(
    () => options.deals.filter((item) => !customerId || item.customer_id === customerId),
    [customerId, options.deals]
  );
  const contracts = useMemo(
    () => options.contracts.filter((item) => !customerId || item.customer_id === customerId),
    [customerId, options.contracts]
  );
  const quotations = useMemo(
    () => options.quotations.filter((item) => !customerId || item.customer_id === customerId),
    [customerId, options.quotations]
  );

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/api/documents/${document!.id}`, {
        ...form,
        customer_id: form!.customer_id ? Number(form!.customer_id) : null,
        deal_id: form!.deal_id ? Number(form!.deal_id) : null,
        contract_id: form!.contract_id ? Number(form!.contract_id) : null,
        quotation_id: form!.quotation_id ? Number(form!.quotation_id) : null,
        owner: form!.owner || null,
        effective_date: form!.effective_date || null,
        expires_at: form!.expires_at || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      onClose();
    },
  });

  const set = <K extends keyof MetadataForm>(key: K, value: MetadataForm[K]) =>
    setForm((current) => (current ? { ...current, [key]: value } : current));

  const chooseCustomer = (value: string) => {
    setForm((current) => {
      if (!current) return current;
      const numeric = Number(value);
      return {
        ...current,
        customer_id: value,
        deal_id:
          current.deal_id &&
          options.deals.find((item) => item.id === Number(current.deal_id))?.customer_id !== numeric
            ? ''
            : current.deal_id,
        contract_id:
          current.contract_id &&
          options.contracts.find((item) => item.id === Number(current.contract_id))?.customer_id !==
            numeric
            ? ''
            : current.contract_id,
        quotation_id:
          current.quotation_id &&
          options.quotations.find((item) => item.id === Number(current.quotation_id))
            ?.customer_id !== numeric
            ? ''
            : current.quotation_id,
      };
    });
  };

  const chooseRelation = (
    key: 'deal_id' | 'contract_id' | 'quotation_id',
    value: string,
    relationCustomerId?: number
  ) =>
    setForm((current) =>
      current
        ? {
            ...current,
            [key]: value,
            customer_id:
              value && relationCustomerId ? String(relationCustomerId) : current.customer_id,
          }
        : current
    );

  return (
    <Drawer
      open={Boolean(document && form)}
      onClose={onClose}
      title="Thông tin tài liệu"
      width="w-[min(34rem,100vw)]"
      footer={
        <>
          <Button onClick={onClose}>Hủy</Button>
          <Button
            variant="primary"
            disabled={!form?.name.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            <Save size={15} aria-hidden="true" /> {save.isPending ? 'Đang lưu…' : 'Lưu thay đổi'}
          </Button>
        </>
      }
    >
      {form && (
        <div className="space-y-4">
          <Field label="Tên hiển thị" required>
            <Input value={form.name} onChange={(event) => set('name', event.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Loại tài liệu">
              <Select
                value={form.doc_type}
                onChange={(event) => set('doc_type', event.target.value)}
              >
                {DOC_TYPE_ORDER.map((value) => (
                  <option key={value} value={value}>
                    {t.docType[value]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Bảo mật">
              <Select
                value={form.confidentiality}
                onChange={(event) =>
                  set('confidentiality', event.target.value as MetadataForm['confidentiality'])
                }
              >
                <option value="public">Công khai</option>
                <option value="internal">Nội bộ</option>
                <option value="confidential">Mật</option>
              </Select>
            </Field>
          </div>
          <Field label="Khách hàng">
            <Select
              value={form.customer_id}
              onChange={(event) => chooseCustomer(event.target.value)}
            >
              <option value="">— Không gắn —</option>
              {options.customers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Cơ hội">
              <Select
                value={form.deal_id}
                onChange={(event) => {
                  const item = options.deals.find(
                    (candidate) => candidate.id === Number(event.target.value)
                  );
                  chooseRelation('deal_id', event.target.value, item?.customer_id);
                }}
              >
                <option value="">— Không gắn —</option>
                {deals.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Hợp đồng">
              <Select
                value={form.contract_id}
                onChange={(event) => {
                  const item = options.contracts.find(
                    (candidate) => candidate.id === Number(event.target.value)
                  );
                  chooseRelation('contract_id', event.target.value, item?.customer_id);
                }}
              >
                <option value="">— Không gắn —</option>
                {contracts.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Báo giá">
            <Select
              value={form.quotation_id}
              onChange={(event) => {
                const item = options.quotations.find(
                  (candidate) => candidate.id === Number(event.target.value)
                );
                chooseRelation('quotation_id', event.target.value, item?.customer_id);
              }}
            >
              <option value="">— Không gắn —</option>
              {quotations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code || `Báo giá #${item.id}`} · v{item.version}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Chủ sở hữu">
            <Input value={form.owner} onChange={(event) => set('owner', event.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ngày hiệu lực">
              <Input
                type="date"
                value={form.effective_date}
                onChange={(event) => set('effective_date', event.target.value)}
              />
            </Field>
            <Field label="Ngày hết hạn">
              <Input
                type="date"
                value={form.expires_at}
                onChange={(event) => set('expires_at', event.target.value)}
              />
            </Field>
          </div>
          <Field label="Thẻ" hint="Phân cách bằng dấu phẩy">
            <Input value={form.tags} onChange={(event) => set('tags', event.target.value)} />
          </Field>
          <Field label="Mô tả">
            <Textarea
              rows={4}
              value={form.description}
              onChange={(event) => set('description', event.target.value)}
            />
          </Field>
          {save.error && (
            <p role="alert" className="text-sm text-tr-danger">
              {save.error instanceof Error ? save.error.message : 'Không thể lưu tài liệu'}
            </p>
          )}
        </div>
      )}
    </Drawer>
  );
}
