import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import {
  ArchiveRestore,
  Download,
  FilePenLine,
  FileText,
  ListPlus,
  LockKeyhole,
  MoreHorizontal,
  Trash2,
} from 'lucide-react';
import { api, qs } from '../../api/client';
import { LG_QUERY, useMediaQuery } from '../../lib/useMediaQuery';
import { Drawer } from '../../components/common/Drawer';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import {
  Button,
  EmptyState,
  ErrorState,
  Select,
  SkeletonRows,
  TableHead,
  focusRing,
} from '../../components/common/ui';
import { DocumentMetadataDrawer } from '../../components/documents/DocumentMetadataDrawer';
import {
  DocumentUploadManager,
  type DocumentOptions,
} from '../../components/documents/DocumentUploadManager';
import { formatBytes } from '../../components/crm/DocumentUpload';
import { formatDate, formatDateTime } from '../../lib/format';
import { useUiStore } from '../../stores/uiStore';
import { ShareButton } from '../share/ShareButton';
import { LoadMoreSentinel } from '../common/LoadMoreSentinel';
import { Popover, usePopover } from '../common/Popover';
import { DocumentsToolbar } from './DocumentsToolbar';
import type { Contract, CrmDocument, Customer, DealsResponse, Quotation } from '../../types';
import { pickLabel, pickOptions } from '../../lib/crmConfig';

type PendingAction = { type: 'trash' | 'permanent'; ids: number[] } | null;

const confidentialityLabel: Record<CrmDocument['confidentiality'], string> = {
  public: 'Công khai',
  internal: 'Nội bộ',
  confidential: 'Mật',
};

/** Nhan duoi tep (PDF, DOCX…) — de nhan ra loai tep truoc khi doc ten. */
function fileExt(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(dot + 1, dot + 5).toUpperCase() : '';
}

/**
 * Menu "⋯" cua mot tep: gom cac thao tac it dung (sua thong tin, tao cong viec,
 * xoa) de hang chi con hai nut hay dung — truoc day sau nut xep canh nhau.
 */
function DocumentRowMenu({
  document,
  onEdit,
  onTrash,
}: {
  document: CrmDocument;
  onEdit: () => void;
  onTrash: () => void;
}) {
  const menu = usePopover();
  const openTaskComposer = useUiStore((state) => state.openTaskComposer);
  const item = (icon: ReactNode, label: string, onClick: () => void, danger = false) => (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        menu.close();
        onClick();
      }}
      className={`flex min-h-11 w-full items-center gap-2 rounded-control px-3 text-left text-sm hover:bg-tr-hover ${
        danger ? 'text-tr-danger' : 'text-tr-text'
      } ${focusRing}`}
    >
      {icon}
      {label}
    </button>
  );
  return (
    <>
      <button
        type="button"
        onClick={menu.toggle}
        aria-label={`Thao tác khác với ${document.name}`}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        className={`inline-flex h-9 w-9 items-center justify-center rounded-control text-tr-muted hover:bg-tr-hover hover:text-tr-primary ${focusRing}`}
      >
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>
      <Popover
        open={menu.open}
        onClose={menu.close}
        anchor={menu.anchor}
        title="Thao tác"
        width={240}
      >
        <div role="menu" className="space-y-1">
          {item(<FilePenLine size={15} aria-hidden="true" />, 'Sửa thông tin', onEdit)}
          {/* Cong viec ke thua dung chuoi lien ket cua tai lieu. */}
          {item(<ListPlus size={15} aria-hidden="true" />, 'Tạo công việc', () =>
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
          )}
          {item(<Trash2 size={15} aria-hidden="true" />, 'Chuyển vào thùng rác', onTrash, true)}
        </div>
      </Popover>
    </>
  );
}

const iconLink = `inline-flex h-9 w-9 items-center justify-center rounded-control text-tr-muted hover:bg-tr-hover hover:text-tr-primary ${focusRing}`;

/**
 * Kho tep tai len (truoc day la trang /documents). Nay nhung vao tab "Tệp tải
 * lên" cua DocumentsHubPage — xem pages/DocumentsHubPage.tsx. Khong tu dung
 * PageShell/PageHeader: khung trang do hub cap. Tu khoa, nut Tai len va goi y
 * cheo tab cung do hub cap (1.28.0) de dung chung voi tab Trang tai lieu.
 */
export function DocumentsLibrary({
  term,
  onTermChange,
  query,
  crossHint,
  uploadOpen,
  onUploadOpenChange: setUploadOpen,
}: {
  term: string;
  onTermChange: (value: string) => void;
  /** Tu khoa da debounce — dung de goi API. */
  query: string;
  crossHint: ReactNode;
  uploadOpen: boolean;
  onUploadOpenChange: (open: boolean) => void;
}) {
  const isWide = useMediaQuery(LG_QUERY);
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);
  const [searchParams] = useSearchParams();
  const focusId = Number(searchParams.get('focus')) || null;
  const [docType, setDocType] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [view, setView] = useState<'active' | 'trash'>('active');
  const [selected, setSelected] = useState<number[]>([]);
  const [bulkType, setBulkType] = useState('');
  const [bulkCustomer, setBulkCustomer] = useState('');
  const [editing, setEditing] = useState<CrmDocument | null>(null);

  /* Keo tep vao BAT KY dau tren trang cung mo ngan tai len. Sau khi khoi upload
     roi khoi than trang, nguoi dung quen thao tac keo-tha cu se khong con dich
     de tha — nhanh nay giu lai loi vao do. */
  useEffect(() => {
    if (view !== 'active') return;
    const onDragEnter = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes('Files')) return;
      setUploadOpen(true);
    };
    window.addEventListener('dragenter', onDragEnter);
    return () => window.removeEventListener('dragenter', onDragEnter);
  }, [view, setUploadOpen]);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const { data: customers = [] } = useQuery({
    queryKey: ['customers', 'select'],
    queryFn: () => api.get<Customer[]>('/api/customers?fields=basic'),
    staleTime: 60_000,
  });
  /* Co hoi / hop dong / bao gia chi dung trong ngan Tai len va ngan sua thong tin —
     tai luc mo ngan thay vi luc vao trang. Ba danh sach nay co the len hang chuc MB,
     va may chu mot luong bat trang tai lieu xep hang cho chung. */
  const needLinkOptions = uploadOpen || editing !== null;
  const { data: dealsData } = useQuery({
    queryKey: ['deals', 'document-select'],
    queryFn: () => api.get<DealsResponse>('/api/deals'),
    staleTime: 60_000,
    enabled: needLinkOptions,
  });
  const { data: contracts = [] } = useQuery({
    queryKey: ['contracts', 'document-select'],
    queryFn: () => api.get<Contract[]>('/api/contracts'),
    staleTime: 60_000,
    enabled: needLinkOptions,
  });
  const { data: quotations = [] } = useQuery({
    queryKey: ['quotations', 'document-select'],
    queryFn: () => api.get<Quotation[]>('/api/quotations'),
    staleTime: 60_000,
    enabled: needLinkOptions,
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

  /* Theo trang (1.21.0): moi nhat truoc, tai dan khi cuon. Truoc day tai ca thu
     vien mot luc — vai chuc nghin tai lieu la hang chuc MB. */
  const filterParams = {
    q: query,
    doc_type: docType,
    customer_id: customerId,
    trash: view === 'trash' ? 1 : undefined,
  };
  const {
    data: pages,
    isLoading,
    error,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ['documents', 'library', filterParams],
    queryFn: ({ pageParam }) =>
      api.get<{ items: CrmDocument[]; next_cursor: string | null }>(
        `/api/documents/page${qs({ ...filterParams, cursor: pageParam })}`
      ),
    initialPageParam: '',
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
  const loaded = useMemo(() => pages?.pages.flatMap((page) => page.items) ?? [], [pages]);
  /* Mo tu lien ket (?focus=): tai lieu do co the chua nam trong trang dau — lay rieng
     va dat len dau de van cuon toi va to sang duoc. */
  const focusMissing = focusId != null && !isLoading && !loaded.some((d) => d.id === focusId);
  const { data: focusDocs = [] } = useQuery({
    queryKey: ['documents', 'focus', focusId, view],
    queryFn: () =>
      api.get<CrmDocument[]>(
        `/api/documents${qs({ id: focusId, trash: view === 'trash' ? 1 : undefined })}`
      ),
    enabled: focusMissing,
  });
  const documents = useMemo(
    () => (focusMissing ? [...focusDocs, ...loaded] : loaded),
    [focusDocs, focusMissing, loaded]
  );
  const loadMoreDocuments = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  useEffect(() => setSelected([]), [view, docType, customerId, query]);

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
    /* Duoi lg danh sach ve bang the chu khong phai hang bang, nen phai thu ca hai
       id — chi tim `document-N` thi tren dien thoai khong cuon toi dau ca. */
    const target =
      document.getElementById(`document-${focusId}`) ??
      document.getElementById(`document-card-${focusId}`);
    target?.scrollIntoView({ block: 'center' });
  }, [documents, focusId]);

  const allSelected =
    documents.length > 0 && documents.every((document) => selected.includes(document.id));
  const toggleAll = () => setSelected(allSelected ? [] : documents.map((document) => document.id));
  const hasFilters = Boolean(query || docType || customerId);
  const zipHref = `/api/documents/download.zip?ids=${selected.join(',')}`;

  const rowCheckbox = (document: CrmDocument, className = '') => (
    <input
      type="checkbox"
      checked={selected.includes(document.id)}
      onChange={() =>
        setSelected((current) =>
          current.includes(document.id)
            ? current.filter((id) => id !== document.id)
            : [...current, document.id]
        )
      }
      aria-label={`Chọn ${document.name}`}
      className={className}
    />
  );

  /* Thao tac tren mot tep — dung chung cho hang bang va the dien thoai. */
  const rowActions = (document: CrmDocument) =>
    view === 'active' ? (
      <>
        <a
          href={`/api/documents/${document.id}/download`}
          aria-label={`Tải xuống ${document.name}`}
          className={iconLink}
        >
          <Download size={15} aria-hidden="true" />
        </a>
        <ShareButton entityType="document" entityId={document.id} label={document.name} />
        <DocumentRowMenu
          document={document}
          onEdit={() => setEditing(document)}
          onTrash={() => setPendingAction({ type: 'trash', ids: [document.id] })}
        />
      </>
    ) : (
      <>
        <button
          type="button"
          onClick={() => restore.mutate([document.id])}
          aria-label={`Khôi phục ${document.name}`}
          className={iconLink}
        >
          <ArchiveRestore size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setPendingAction({ type: 'permanent', ids: [document.id] })}
          aria-label={`Xóa vĩnh viễn ${document.name}`}
          className={`inline-flex h-9 w-9 items-center justify-center rounded-control text-tr-muted hover:bg-tr-hover hover:text-tr-danger ${focusRing}`}
        >
          <Trash2 size={15} aria-hidden="true" />
        </button>
      </>
    );

  const extBadge = (document: CrmDocument) => {
    const ext = fileExt(document.file_name);
    return ext ? (
      <span className="shrink-0 rounded-compact bg-tr-surface px-1.5 py-0.5 text-[10px] font-bold text-tr-subtle">
        {ext}
      </span>
    ) : (
      <FileText size={15} className="shrink-0 text-tr-muted" aria-hidden="true" />
    );
  };

  return (
    <div className="space-y-3">
      {/*
       * Khoi tai len nam trong Drawer chu khong con dat thang tren trang.
       *
       * Truoc day ~450px dau trang la bieu mau 11 truong + vung keo tha, day
       * danh sach tai lieu xuong tan y~610 — chi con ba dong lot man hinh
       * 1526x866, va tren dien thoai phai cuon hon mot man ruoi moi thay tep dau
       * tien. Nhung phan lon luot vao trang Tai lieu la de TIM mot tep, khong
       * phai de tai len. Nut mo ngan nam o hang tab cua hub (1.28.0).
       */}
      <Drawer
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="Tải tài liệu"
        width="w-[min(44rem,100vw)]"
      >
        <DocumentUploadManager
          options={options}
          onReview={(documentId) => {
            setUploadOpen(false);
            // Danh sach vua duoc lam moi sau upload nen tai lieu da co trong `documents`.
            setEditing(documents.find((item) => item.id === documentId) ?? null);
          }}
        />
      </Drawer>

      <section aria-label="Kho tài liệu" className="space-y-3">
        <DocumentsToolbar
          term={term}
          onTermChange={onTermChange}
          placeholder="Tìm tên, mô tả, thẻ, chủ sở hữu…"
          view={view}
          onViewChange={setView}
        >
          <Select
            value={docType}
            onChange={(event) => setDocType(event.target.value)}
            aria-label="Lọc loại tài liệu"
            fullWidth={false}
            className="w-[calc(50%-0.25rem)] sm:w-48"
          >
            <option value="">Mọi loại tài liệu</option>
            {pickOptions('doc_type').map(({ item_key: value }) => (
              <option key={value} value={value}>
                {pickLabel('doc_type', value)}
              </option>
            ))}
          </Select>
          <Select
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
            aria-label="Lọc khách hàng"
            fullWidth={false}
            className="w-[calc(50%-0.25rem)] sm:w-60"
          >
            <option value="">Mọi khách hàng</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </Select>
        </DocumentsToolbar>

        {(hasFilters || crossHint) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            {hasFilters && (
              <button
                type="button"
                onClick={() => {
                  onTermChange('');
                  setDocType('');
                  setCustomerId('');
                }}
                className={`text-tr-subtle underline hover:text-tr-text ${focusRing}`}
              >
                Xoá lọc
              </button>
            )}
            {crossHint && <span className="sm:ml-auto">{crossHint}</span>}
          </div>
        )}

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
                  {pickOptions('doc_type').map(({ item_key: value }) => (
                    <option key={value} value={value}>
                      {pickLabel('doc_type', value)}
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
                  : 'Bấm "Tải tệp lên" hoặc kéo tệp vào bất kỳ đâu trên trang để bắt đầu.'
            }
          />
        ) : !isWide ? (
          <>
            {/* Duoi lg: the thay cho bang. Giu ten tep, loai, khach hang, dung
              luong va cac thao tac hay dung (tai xuong, chia se, menu) — truoc day
              phai mo ngan sua thong tin moi tai duoc tep. */}
            <ul className="space-y-2" aria-label="Danh sách tài liệu">
              {documents.map((document) => (
                <li
                  key={document.id}
                  id={`document-card-${document.id}`}
                  className={`rounded-panel border border-tr-border bg-tr-card p-3 shadow-sm ${
                    focusId === document.id ? 'ring-2 ring-tr-primary' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {rowCheckbox(document, 'mt-1 h-4 w-4 shrink-0')}
                    <button
                      type="button"
                      onClick={() => view === 'active' && setEditing(document)}
                      disabled={view === 'trash'}
                      title={document.name}
                      className={`flex min-w-0 flex-1 items-start gap-2 text-left disabled:cursor-default ${
                        view === 'active' ? focusRing : ''
                      }`}
                    >
                      <span className="mt-0.5">{extBadge(document)}</span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-tr-text">
                          {document.name}
                        </span>
                        <span className="block truncate text-xs text-tr-muted">
                          {document.file_name}
                        </span>
                      </span>
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-x-3 gap-y-1 text-xs text-tr-muted">
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                      {document.doc_type && <span>{pickLabel('doc_type', document.doc_type)}</span>}
                      {document.customer_name && (
                        <span className="truncate text-tr-subtle">{document.customer_name}</span>
                      )}
                      <span className="tabular-nums">{formatBytes(document.size)}</span>
                    </div>
                    <div className="-my-1 flex shrink-0 items-center">{rowActions(document)}</div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="tr-scroll overflow-x-auto rounded-panel border border-tr-border bg-tr-panel shadow-sm">
            {/* 6 cot (1.28.0): Hieu luc va Chu so huu thanh dong phu cua cot Cap
                nhat — bang 8 cot rong 1100px bat cuon ngang tren laptop 13 inch. */}
            <table className="w-full min-w-[880px] text-sm">
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
                    Tệp
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Loại · bảo mật
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Gắn với
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Cập nhật
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right">
                    Dung lượng
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    <span className="sr-only">Thao tác</span>
                  </th>
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
                  const linkLabel =
                    document.deal_title ??
                    document.contract_name ??
                    (document.quotation_code ? `Báo giá ${document.quotation_code}` : null);
                  return (
                    <tr
                      id={`document-${document.id}`}
                      key={document.id}
                      className={`transition hover:bg-tr-hover ${checked ? 'bg-tr-selected' : ''} ${focusId === document.id ? 'ring-2 ring-tr-primary ring-inset' : ''}`}
                    >
                      <td className="px-3 py-3">{rowCheckbox(document)}</td>
                      <td className="max-w-80 px-3 py-3">
                        <button
                          type="button"
                          onClick={() => view === 'active' && setEditing(document)}
                          disabled={view === 'trash'}
                          className={`flex max-w-full items-center gap-2 text-left font-medium text-tr-text disabled:cursor-default ${view === 'active' ? `hover:text-tr-primary ${focusRing}` : ''}`}
                        >
                          {extBadge(document)}
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
                                className="rounded-full bg-tr-hover px-1.5 py-0.5 text-xs text-tr-subtle"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs text-tr-subtle">
                        <div>{pickLabel('doc_type', document.doc_type)}</div>
                        <div
                          className={`mt-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 ${document.confidentiality === 'confidential' ? 'bg-tr-danger/10 text-tr-danger' : 'bg-tr-hover text-tr-muted'}`}
                        >
                          <LockKeyhole size={10} aria-hidden="true" />{' '}
                          {confidentialityLabel[document.confidentiality ?? 'internal']}
                        </div>
                      </td>
                      <td className="max-w-56 px-3 py-3">
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
                        {linkLabel && (
                          <div className="mt-0.5 truncate text-xs text-tr-subtle">{linkLabel}</div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs text-tr-subtle">
                        <div className="tabular-nums">
                          {formatDateTime(document.created_at.replace(' ', 'T').slice(0, 16))}
                        </div>
                        {document.owner && (
                          <div className="mt-0.5 text-tr-muted">{document.owner}</div>
                        )}
                        {(document.effective_date || document.expires_at) && (
                          <div className="mt-0.5 text-tr-muted">
                            Hiệu lực{' '}
                            {document.effective_date ? formatDate(document.effective_date) : '…'}
                            {document.expires_at ? ` → ${formatDate(document.expires_at)}` : ''}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right text-tr-subtle tabular-nums">
                        {formatBytes(document.size)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-1">{rowActions(document)}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!isLoading && !error && documents.length > 0 && (
          <LoadMoreSentinel
            hasMore={Boolean(hasNextPage)}
            loading={isFetchingNextPage}
            onLoadMore={loadMoreDocuments}
            label="Tải thêm tài liệu cũ hơn"
          />
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
    </div>
  );
}
