import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Download, FileText, Trash2 } from 'lucide-react';
import { api, qs } from '../api/client';
import { DocumentPanel, formatBytes } from '../components/crm/DocumentUpload';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import {
  EmptyState,
  ErrorState,
  Input,
  Panel,
  Select,
  SkeletonRows,
} from '../components/common/ui';
import { DOC_TYPE_ORDER, t } from '../i18n/vi';
import { formatDateTime } from '../lib/format';
import type { CrmDocument, Customer } from '../types';

export default function DocumentsPage() {
  const queryClient = useQueryClient();
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [docType, setDocType] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(term), 300);
    return () => clearTimeout(id);
  }, [term]);

  const { data: customers = [] } = useQuery({
    queryKey: ['customers', 'select'],
    queryFn: () => api.get<Customer[]>('/api/customers'),
    staleTime: 60_000,
  });

  const {
    data: documents = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['documents', { q: debounced, docType, customerId }],
    queryFn: () =>
      api.get<CrmDocument[]>(
        `/api/documents${qs({ q: debounced, doc_type: docType, customer_id: customerId })}`
      ),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/api/documents/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['documents'] }),
  });

  return (
    <div className="space-y-4 p-6">
      <Panel title="Tải tài liệu mới">
        <DocumentPanel
          links={customerId ? { customer_id: Number(customerId) } : {}}
          title={
            customerId
              ? undefined
              : 'Chọn khách hàng ở bộ lọc bên dưới nếu muốn gắn tài liệu vào khách hàng'
          }
        />
      </Panel>

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-72">
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Tìm theo tên tài liệu (không cần dấu)…"
          />
        </div>
        <div className="w-52">
          <Select value={docType} onChange={(e) => setDocType(e.target.value)}>
            <option value="">Mọi loại tài liệu</option>
            {DOC_TYPE_ORDER.map((d) => (
              <option key={d} value={d}>
                {t.docType[d]}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-60">
          <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Mọi khách hàng</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-panel border border-tr-border bg-tr-panel">
          <SkeletonRows rows={6} cols={5} />
        </div>
      ) : error ? (
        <ErrorState onRetry={() => refetch()} />
      ) : documents.length === 0 ? (
        <EmptyState message="Không có tài liệu nào khớp bộ lọc." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-tr-border bg-tr-panel shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-tr-surface text-left text-xs tracking-wide text-tr-subtle uppercase">
              <tr>
                <th scope="col" className="px-4 py-2.5">Tên tài liệu</th>
                <th scope="col" className="px-4 py-2.5">Loại</th>
                <th scope="col" className="px-4 py-2.5">Khách hàng</th>
                <th scope="col" className="px-4 py-2.5">Gắn với</th>
                <th scope="col" className="px-4 py-2.5 text-right">Dung lượng</th>
                <th scope="col" className="px-4 py-2.5">Ngày tải</th>
                <th scope="col" className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tr-border">
              {documents.map((doc) => (
                <tr key={doc.id} className="transition hover:bg-tr-hover">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2 font-medium text-tr-text">
                      <FileText size={14} className="text-tr-muted" />
                      {doc.name}
                    </div>
                    <div className="text-xs text-tr-muted">{doc.file_name}</div>
                  </td>
                  <td className="px-4 py-2.5 text-tr-subtle">
                    {t.docType[doc.doc_type] ?? doc.doc_type}
                  </td>
                  <td className="px-4 py-2.5">
                    {doc.customer_id ? (
                      <Link
                        to={`/customers/${doc.customer_id}`}
                        className="text-tr-primary hover:underline"
                      >
                        {doc.customer_name}
                      </Link>
                    ) : (
                      <span className="text-tr-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-tr-subtle">
                    {doc.deal_title ?? doc.contract_name ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-tr-subtle tabular-nums">
                    {formatBytes(doc.size)}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-tr-muted">
                    {formatDateTime(doc.created_at.replace(' ', 'T').slice(0, 16))}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      <a
                        href={`/api/documents/${doc.id}/download`}
                        className="rounded p-1 text-tr-muted transition hover:bg-tr-hover hover:text-tr-primary"
                      >
                        <Download size={14} />
                      </a>
                      <button
                        onClick={() => setDeleteId(doc.id)}
                        className="rounded p-1 text-tr-muted transition hover:bg-tr-hover hover:text-tr-danger"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={deleteId !== null}
        message="Xóa tài liệu này? Tệp sẽ bị xóa khỏi ổ đĩa."
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) remove.mutate(deleteId);
          setDeleteId(null);
        }}
      />
    </div>
  );
}
