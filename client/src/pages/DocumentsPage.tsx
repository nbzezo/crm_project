import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import {
  ArchiveRestore,
  Download,
  FilePenLine,
  FileText,
  ListPlus,
  LockKeyhole,
  Search,
  Trash2,
} from 'lucide-react';
import { api, qs } from '../api/client';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { PageShell } from '../components/common/PageShell';
import {
  Button,
  EmptyState,
  ErrorState,
  Input,
  Select,
  SkeletonRows,
  TableHead,
  focusRing,
} from '../components/common/ui';
import { DocumentMetadataDrawer } from '../components/documents/DocumentMetadataDrawer';
import {
  DocumentUploadManager,
  type DocumentOptions,
} from '../components/documents/DocumentUploadManager';
import { formatBytes } from '../components/crm/DocumentUpload';
import { DOC_TYPE_ORDER, t } from '../i18n/vi';
import { formatDate, formatDateTime } from '../lib/format';
import { useUiStore } from '../stores/uiStore';
import type { Contract, CrmDocument, Customer, DealsResponse, Quotation } from '../types';

type PendingAction = { type: 'trash' | 'permanent'; ids: number[] } | null;

const confidentialityLabel: Record<CrmDocument['confidentiality'], string> = {
  public: 'Công khai',
  internal: 'Nội bộ',
  confidential: 'Mật',
};

export default function DocumentsPage() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);
  const openTaskComposer = useUiStore((state) => state.openTaskComposer);
  const [searchParams] = useSearchParams();
  const focusId = Number(searchParams.get('focus')) || null;
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [docType, setDocType] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [view, setView] = useState<'active' | 'trash'>('active');
  const [selected, setSelected] = useState<number[]>([]);
  const [bulkType, setBulkType] = useState('');
  const [bulkCustomer, setBulkCustomer] = useState('');
  const [editing, setEditing] = useState<CrmDocument | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(term), 250);
    return () => window.clearTimeout(id);
  }, [term]);

  const { data: customers = [] } = useQuery({
    queryKey: ['customers', 'select'],
    queryFn: () => api.get<Customer[]>('/api/customers'),
    staleTime: 60_000,
  });
  const { data: dealsData } = useQuery({
    queryKey: ['deals', 'document-select'],
    queryFn: () => api.get<DealsResponse>('/api/deals'),
    staleTime: 60_000,
  });
  const { data: contracts = [] } = useQuery({
    queryKey: ['contracts', 'document-select'],
    queryFn: () => api.get<Contract[]>('/api/contracts'),
    staleTime: 60_000,
  });
  const { data: quotations = [] } = useQuery({
    queryKey: ['quotations', 'document-select'],
    queryFn: () => api.get<Quotation[]>('/api/quotations'),
    staleTime: 60_000,
  });
  const options: DocumentOptions = useMemo(
    () => ({
      customers,
      deals: dealsData ? Object.values(dealsData.stages).flat() : [],
      contracts,
      quotations,
    }),
    [contracts, customers, dealsData, quotations]
  );

  const {
    data: documents = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['documents', { q: debounced, docType, customerId, view }],
    queryFn: () =>
      api.get<CrmDocument[]>(
        `/api/documents${qs({
          q: debounced,
          doc_type: docType,
          customer_id: customerId,
          trash: view === 'trash' ? 1 : undefined,
        })}`
      ),
  });

  useEffect(() => setSelected([]), [view, docType, customerId, debounced]);

  const invalidateDocuments = () => queryClient.invalidateQueries({ queryKey: ['documents'] });

  const trash = useMutation({
    mutationFn: (ids: number[]) => api.post('/api/documents/bulk/trash', { ids }),
    onSuccess: (_data, ids) => {
      setSelected([]);
      invalidateDocuments();
      pushToast(`Đã chuyển ${ids.length} tài liệu vào thùng rác`, 'success', {
        label: 'Hoàn tác',
        run: () => {
          void api.post('/api/documents/bulk/restore', { ids }).then(() => invalidateDocuments());
        },
      });
    },
  });

  const restore = useMutation({
    mutationFn: (ids: number[]) => api.post('/api/documents/bulk/restore', { ids }),
    onSuccess: (_data, ids) => {
      setSelected([]);
      invalidateDocuments();
      pushToast(`Đã khôi phục ${ids.length} tài liệu`, 'success');
    },
  });

  const permanentDelete = useMutation({
    mutationFn: (id: number) => api.del(`/api/documents/${id}/permanent`),
    onSuccess: () => {
      setSelected([]);
      invalidateDocuments();
      pushToast('Đã xóa vĩnh viễn tài liệu', 'success');
    },
  });

  const bulkUpdate = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = { ids: selected };
      if (bulkType) payload.doc_type = bulkType;
      if (bulkCustomer)
        payload.customer_id = bulkCustomer === '__none__' ? null : Number(bulkCustomer);
      return api.patch('/api/documents/bulk', payload);
    },
    onSuccess: () => {
      setSelected([]);
      setBulkType('');
      setBulkCustomer('');
      invalidateDocuments();
      pushToast('Đã cập nhật các tài liệu đã chọn', 'success');
    },
  });

  useEffect(() => {
    if (!focusId || documents.length === 0) return;
    document.getElementById(`document-${focusId}`)?.scrollIntoView({ block: 'center' });
  }, [documents, focusId]);

  const allSelected =
    documents.length > 0 && documents.every((document) => selected.includes(document.id));
  const toggleAll = () => setSelected(allSelected ? [] : documents.map((document) => document.id));
  const hasFilters = Boolean(term || docType || customerId);
  const zipHref = `/api/documents/download.zip?ids=${selected.join(',')}`;

  return (
    <PageShell width="wide">
      <header>
        <p className="text-sm text-tr-muted">
          Quản lý hồ sơ khách hàng, liên kết bán hàng và vòng đời tài liệu tại một nơi.
        </p>
      </header>

      {view === 'active' && (
        <DocumentUploadManager
          options={options}
          onReview={(documentId) =>
            // Danh sach vua duoc lam moi sau upload nen tai lieu da co trong `documents`.
            setEditing(documents.find((item) => item.id === documentId) ?? null)
          }
        />
      )}

      <section aria-label="Kho tài liệu" className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 rounded-panel border border-tr-border bg-tr-panel p-3 shadow-sm">
          <div className="relative w-full sm:w-72">
            <Search
              size={15}
              aria-hidden="true"
              className="absolute top-1/2 left-2.5 -translate-y-1/2 text-tr-muted"
            />
            <Input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Tìm tên, mô tả, thẻ, chủ sở hữu…"
              aria-label="Tìm tài liệu"
              className="pl-8"
            />
          </div>
          <Select
            value={docType}
            onChange={(event) => setDocType(event.target.value)}
            aria-label="Lọc loại tài liệu"
            className="w-[calc(50%-0.25rem)] sm:w-48"
          >
            <option value="">Mọi loại tài liệu</option>
            {DOC_TYPE_ORDER.map((value) => (
              <option key={value} value={value}>
                {t.docType[value]}
              </option>
            ))}
          </Select>
          <Select
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
            aria-label="Lọc khách hàng"
            className="w-[calc(50%-0.25rem)] sm:w-60"
          >
            <option value="">Mọi khách hàng</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </Select>
          <div
            className="ml-auto flex rounded-full border border-tr-border bg-tr-surface p-1"
            role="group"
            aria-label="Vị trí tài liệu"
          >
            <button
              type="button"
              aria-pressed={view === 'active'}
              onClick={() => setView('active')}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${focusRing} ${view === 'active' ? 'bg-tr-primary text-tr-on-primary' : 'text-tr-subtle hover:bg-tr-hover'}`}
            >
              Đang dùng
            </button>
            <button
              type="button"
              aria-pressed={view === 'trash'}
              onClick={() => setView('trash')}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition ${focusRing} ${view === 'trash' ? 'bg-tr-primary text-tr-on-primary' : 'text-tr-subtle hover:bg-tr-hover'}`}
            >
              <Trash2 size={12} /> Thùng rác
            </button>
          </div>
        </div>

        {selected.length > 0 && (
          <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-panel border border-tr-primary/30 bg-tr-panel p-2.5 shadow-lg">
            <span className="px-1 text-sm font-semibold text-tr-text">
              {selected.length} đã chọn
            </span>
            {view === 'active' ? (
              <>
                <a
                  href={zipHref}
                  className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-control border border-tr-border bg-tr-panel px-2.5 py-1 text-xs font-medium text-tr-text hover:bg-tr-hover ${focusRing}`}
                >
                  <Download size={14} /> Tải ZIP
                </a>
                <Select
                  value={bulkType}
                  onChange={(event) => setBulkType(event.target.value)}
                  aria-label="Đổi loại hàng loạt"
                  className="w-44 py-1 text-xs"
                >
                  <option value="">Không đổi loại</option>
                  {DOC_TYPE_ORDER.map((value) => (
                    <option key={value} value={value}>
                      {t.docType[value]}
                    </option>
                  ))}
                </Select>
                <Select
                  value={bulkCustomer}
                  onChange={(event) => setBulkCustomer(event.target.value)}
                  aria-label="Gắn khách hàng hàng loạt"
                  className="w-52 py-1 text-xs"
                >
                  <option value="">Không đổi khách hàng</option>
                  <option value="__none__">Bỏ liên kết khách hàng</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </Select>
                <Button
                  size="sm"
                  disabled={!bulkType && !bulkCustomer}
                  onClick={() => bulkUpdate.mutate()}
                >
                  Áp dụng
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  className="ml-auto"
                  onClick={() => setPendingAction({ type: 'trash', ids: selected })}
                >
                  <Trash2 size={14} /> Chuyển vào thùng rác
                </Button>
              </>
            ) : (
              <Button size="sm" variant="primary" onClick={() => restore.mutate(selected)}>
                <ArchiveRestore size={14} /> Khôi phục
              </Button>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="rounded-panel border border-tr-border bg-tr-panel">
            <SkeletonRows rows={6} cols={6} />
          </div>
        ) : error ? (
          <ErrorState onRetry={() => refetch()} />
        ) : documents.length === 0 ? (
          <EmptyState
            message={
              view === 'trash'
                ? 'Thùng rác đang trống'
                : hasFilters
                  ? 'Không có tài liệu khớp bộ lọc'
                  : 'Chưa có tài liệu'
            }
            hint={
              view === 'trash'
                ? 'Tài liệu đã xóa mềm sẽ xuất hiện ở đây để bạn khôi phục.'
                : hasFilters
                  ? 'Thử xóa bớt bộ lọc hoặc dùng từ khóa khác.'
                  : 'Kéo tệp vào khu vực tải lên phía trên để bắt đầu.'
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-panel border border-tr-border bg-tr-panel shadow-sm">
            <table className="min-w-[1100px] w-full text-sm">
              <TableHead>
                <tr>
                  <th scope="col" className="w-10 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Chọn tất cả tài liệu"
                    />
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Tài liệu
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Loại / bảo mật
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Khách hàng
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Liên kết
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Hiệu lực
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Chủ sở hữu
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right">
                    Dung lượng
                  </th>
                  <th scope="col" className="px-3 py-2.5"></th>
                </tr>
              </TableHead>
              <tbody className="divide-y divide-tr-border">
                {documents.map((document) => {
                  const checked = selected.includes(document.id);
                  const tags = (document.tags ?? '')
                    .split(',')
                    .map((tag) => tag.trim())
                    .filter(Boolean)
                    .slice(0, 3);
                  return (
                    <tr
                      id={`document-${document.id}`}
                      key={document.id}
                      className={`transition hover:bg-tr-hover ${checked ? 'bg-tr-selected' : ''} ${focusId === document.id ? 'ring-2 ring-inset ring-tr-primary' : ''}`}
                    >
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setSelected((current) =>
                              current.includes(document.id)
                                ? current.filter((id) => id !== document.id)
                                : [...current, document.id]
                            )
                          }
                          aria-label={`Chọn ${document.name}`}
                        />
                      </td>
                      <td className="max-w-80 px-3 py-3">
                        <button
                          type="button"
                          onClick={() => view === 'active' && setEditing(document)}
                          disabled={view === 'trash'}
                          className={`flex max-w-full items-center gap-2 text-left font-medium text-tr-text disabled:cursor-default ${view === 'active' ? `hover:text-tr-primary ${focusRing}` : ''}`}
                        >
                          <FileText size={15} className="shrink-0 text-tr-muted" />
                          <span className="truncate">{document.name}</span>
                        </button>
                        <div className="mt-0.5 truncate text-xs text-tr-muted">
                          {document.file_name}
                        </div>
                        {document.description && (
                          <div className="mt-1 line-clamp-1 text-xs text-tr-subtle">
                            {document.description}
                          </div>
                        )}
                        {tags.length > 0 && (
                          <div className="mt-1 flex gap-1">
                            {tags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full bg-tr-hover px-1.5 py-0.5 text-[10px] text-tr-subtle"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs text-tr-subtle">
                        <div>{t.docType[document.doc_type] ?? document.doc_type}</div>
                        <div
                          className={`mt-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 ${document.confidentiality === 'confidential' ? 'bg-tr-danger/10 text-tr-danger' : 'bg-tr-hover text-tr-muted'}`}
                        >
                          <LockKeyhole size={10} />{' '}
                          {confidentialityLabel[document.confidentiality ?? 'internal']}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {document.customer_id ? (
                          <Link
                            to={`/customers/${document.customer_id}`}
                            className="text-tr-primary hover:underline"
                          >
                            {document.customer_name}
                          </Link>
                        ) : (
                          <span className="text-tr-muted">—</span>
                        )}
                      </td>
                      <td className="max-w-52 px-3 py-3 text-xs text-tr-subtle">
                        <div className="truncate">
                          {document.deal_title ??
                            document.contract_name ??
                            (document.quotation_code ? `Báo giá ${document.quotation_code}` : '—')}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs text-tr-subtle">
                        <div>
                          {document.effective_date ? formatDate(document.effective_date) : '—'}
                        </div>
                        {document.expires_at && (
                          <div className="mt-0.5 text-tr-muted">
                            đến {formatDate(document.expires_at)}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-tr-subtle">{document.owner || '—'}</td>
                      <td className="px-3 py-3 text-right text-tr-subtle tabular-nums">
                        <div>{formatBytes(document.size)}</div>
                        <div className="mt-0.5 text-xs text-tr-muted">
                          {formatDateTime(document.created_at.replace(' ', 'T').slice(0, 16))}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-1">
                          {view === 'active' ? (
                            <>
                              <button
                                type="button"
                                onClick={() => setEditing(document)}
                                aria-label={`Sửa ${document.name}`}
                                className={`rounded-control p-2 text-tr-muted hover:bg-tr-hover hover:text-tr-primary ${focusRing}`}
                              >
                                <FilePenLine size={15} />
                              </button>
                              {/* Cong viec ke thua dung chuoi lien ket cua tai lieu. */}
                              <button
                                type="button"
                                onClick={() =>
                                  openTaskComposer({
                                    context: {
                                      customer_id: document.customer_id ?? undefined,
                                      contact_id: document.contact_id ?? undefined,
                                      deal_id: document.deal_id ?? undefined,
                                      contract_id: document.contract_id ?? undefined,
                                      quotation_id: document.quotation_id ?? undefined,
                                    },
                                    draftTitle: `Xử lý tài liệu: ${document.name}`,
                                  })
                                }
                                aria-label={`Tạo công việc từ ${document.name}`}
                                title="Tạo công việc"
                                className={`rounded-control p-2 text-tr-muted hover:bg-tr-hover hover:text-tr-primary ${focusRing}`}
                              >
                                <ListPlus size={15} />
                              </button>
                              <a
                                href={`/api/documents/${document.id}/download`}
                                aria-label={`Tải xuống ${document.name}`}
                                className={`rounded-control p-2 text-tr-muted hover:bg-tr-hover hover:text-tr-primary ${focusRing}`}
                              >
                                <Download size={15} />
                              </a>
                              <button
                                type="button"
                                onClick={() =>
                                  setPendingAction({ type: 'trash', ids: [document.id] })
                                }
                                aria-label={`Chuyển ${document.name} vào thùng rác`}
                                className={`rounded-control p-2 text-tr-muted hover:bg-tr-hover hover:text-tr-danger ${focusRing}`}
                              >
                                <Trash2 size={15} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => restore.mutate([document.id])}
                                aria-label={`Khôi phục ${document.name}`}
                                className={`rounded-control p-2 text-tr-muted hover:bg-tr-hover hover:text-tr-primary ${focusRing}`}
                              >
                                <ArchiveRestore size={15} />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setPendingAction({ type: 'permanent', ids: [document.id] })
                                }
                                aria-label={`Xóa vĩnh viễn ${document.name}`}
                                className={`rounded-control p-2 text-tr-muted hover:bg-tr-hover hover:text-tr-danger ${focusRing}`}
                              >
                                <Trash2 size={15} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <DocumentMetadataDrawer
        document={editing}
        options={options}
        onClose={() => setEditing(null)}
      />
      <ConfirmDialog
        open={pendingAction !== null}
        message={
          pendingAction?.type === 'permanent'
            ? 'Xóa vĩnh viễn tài liệu này? Tệp sẽ bị xóa khỏi ổ đĩa và không thể khôi phục.'
            : `Chuyển ${pendingAction?.ids.length ?? 0} tài liệu vào thùng rác?`
        }
        onCancel={() => setPendingAction(null)}
        onConfirm={() => {
          if (pendingAction?.type === 'trash') trash.mutate(pendingAction.ids);
          if (pendingAction?.type === 'permanent') permanentDelete.mutate(pendingAction.ids[0]);
          setPendingAction(null);
        }}
      />
    </PageShell>
  );
}
