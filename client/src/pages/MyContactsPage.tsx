import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import {
  CheckCircle2,
  CloudDownload,
  Link2,
  RefreshCw,
  Trash2,
  Unlink,
  Upload,
  UserPlus,
} from 'lucide-react';
import { api, qs } from '../api/client';
import { Combobox } from '../components/common/Combobox';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { Modal } from '../components/common/Modal';
import { PageHeader, PageShell } from '../components/common/PageShell';
import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Panel,
  Segmented,
  SkeletonRows,
  focusRing,
} from '../components/common/ui';
import { useCustomerOptions } from '../lib/useCrmOptions';
import { usePermissionCheck } from '../lib/permissions';
import { formatDate } from '../lib/format';
import { useUiStore } from '../stores/uiStore';

/*
 * Danh bạ cá nhân: danh bạ điện thoại / Gmail của RIÊNG từng nhân viên. Chỉ chủ
 * sở hữu thấy; chọn dòng nào thì "đưa vào CRM" thành người liên hệ của một khách
 * hàng. Nguồn: file .vcf/.csv hoặc đồng bộ một chiều từ Google Contacts.
 */

type LinkFilter = 'all' | 'unlinked' | 'linked';
const PAGE_SIZE = 50;

interface CrmMatch {
  contact_id: number;
  full_name: string;
  customer_id: number;
  customer_name: string;
}
interface PersonalContact {
  id: number;
  full_name: string;
  org_name: string | null;
  title: string | null;
  phone: string | null;
  email: string | null;
  source: 'google' | 'file';
  linked_contact_id: number | null;
  /** Người liên hệ CRM đã gắn, kèm khách hàng — null nếu ngoài phạm vi bạn được xem. */
  linked: CrmMatch | null;
  matches: CrmMatch[];
}
interface PromoteResult {
  created: number;
  linked_existing: number;
  skipped: {
    id: number;
    reason: 'linked' | 'duplicate';
    customers?: { id: number; name: string }[];
  }[];
}
interface ListResponse {
  total: number;
  counts: { total: number; linked: number; google: number; file: number };
  items: PersonalContact[];
}
interface GoogleStatus {
  client_configured: boolean;
  connected: boolean;
  google_account: string;
  auto_sync: boolean;
  last_sync_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  last_imported: number | null;
  last_updated: number | null;
  last_removed: number | null;
  syncing: boolean;
}
interface StatusResponse {
  counts: ListResponse['counts'];
  google: GoogleStatus;
}
interface ImportResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
}

const STATUS_KEY = ['my-contacts', 'status'];

export default function MyContactsPage() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const allowed = usePermissionCheck();
  const canCreateContact = allowed('contacts:create');
  const [params, setParams] = useSearchParams();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<LinkFilter>('all');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [promoting, setPromoting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const listKey = ['my-contacts', 'list', search, filter, page];
  const list = useQuery({
    queryKey: listKey,
    queryFn: () =>
      api.get<ListResponse>(
        `/api/my-contacts${qs({
          q: search.trim(),
          filter: filter === 'all' ? undefined : filter,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        })}`
      ),
    placeholderData: (previous) => previous,
  });
  const status = useQuery({
    queryKey: STATUS_KEY,
    queryFn: () => api.get<StatusResponse>('/api/my-contacts/status'),
    /* Dang dong bo (lan dau keo ve chay nen): hoi lai den khi xong. */
    refetchInterval: (query) => (query.state.data?.google.syncing ? 1500 : false),
  });
  const google = status.data?.google;

  const refreshAll = () => queryClient.invalidateQueries({ queryKey: ['my-contacts'] });

  /* Quay ve tu trang dong y cua Google. */
  const handledReturn = useRef<string | null>(null);
  useEffect(() => {
    const connected = params.get('google');
    const failure = params.get('google_error');
    if (!connected && !failure) return;
    const key = `${connected}|${failure}`;
    if (handledReturn.current === key) return;
    handledReturn.current = key;
    if (connected) pushToast('Đã kết nối Gmail — đang kéo danh bạ về.', 'success');
    if (failure) pushToast(failure, 'error');
    const next = new URLSearchParams(params);
    next.delete('google');
    next.delete('google_error');
    setParams(next, { replace: true });
    void refreshAll();
  }, [params, setParams, pushToast]);

  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.postForm<ImportResult>('/api/my-contacts/import', form);
    },
    onSuccess: (result) => {
      pushToast(
        `Đã nạp ${result.created} liên hệ mới, cập nhật ${result.updated}${
          result.skipped ? `, bỏ qua ${result.skipped}` : ''
        }.`,
        'success'
      );
      setPage(0);
      void refreshAll();
    },
  });

  const sync = useMutation({
    mutationFn: () =>
      api.post<{ imported: number; updated: number; removed: number }>(
        '/api/my-contacts/google/sync'
      ),
    onSuccess: (result) => {
      pushToast(
        `Đồng bộ xong: ${result.imported} mới, ${result.updated} cập nhật, ${result.removed} đã xoá.`,
        'success'
      );
      void refreshAll();
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: STATUS_KEY }),
  });

  const autoSync = useMutation({
    mutationFn: (enabled: boolean) =>
      api.put<GoogleStatus>('/api/my-contacts/google/settings', { auto_sync: enabled }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: STATUS_KEY }),
  });

  const disconnect = useMutation({
    mutationFn: (removeContacts: boolean) =>
      api.post('/api/my-contacts/google/disconnect', { remove_contacts: removeContacts }),
    onSuccess: () => {
      setDisconnecting(false);
      pushToast('Đã ngắt kết nối Gmail.', 'success');
      void refreshAll();
    },
  });

  const remove = useMutation({
    mutationFn: (ids: number[]) =>
      api.post<{ deleted: number }>('/api/my-contacts/delete', { ids }),
    onSuccess: (result) => {
      setDeleting(false);
      setSelected(new Set());
      pushToast(`Đã xoá ${result.deleted} liên hệ khỏi danh bạ cá nhân.`, 'success');
      void refreshAll();
    },
  });

  const link = useMutation({
    mutationFn: (input: { id: number; contactId: number }) =>
      api.post(`/api/my-contacts/${input.id}/link`, {
        contact_id: input.contactId,
        fill_empty: true,
      }),
    onSuccess: () => {
      pushToast('Đã liên kết với người liên hệ trong CRM.', 'success');
      void refreshAll();
    },
  });

  const unlink = useMutation({
    mutationFn: (id: number) => api.post(`/api/my-contacts/${id}/unlink`),
    onSuccess: () => void refreshAll(),
  });

  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selectableOnPage = items.filter((item) => item.linked_contact_id === null);
  const allOnPageSelected =
    selectableOnPage.length > 0 && selectableOnPage.every((item) => selected.has(item.id));

  const toggle = (id: number) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const togglePage = () =>
    setSelected((current) => {
      const next = new Set(current);
      for (const item of selectableOnPage) {
        if (allOnPageSelected) next.delete(item.id);
        else next.add(item.id);
      }
      return next;
    });

  const counts = status.data?.counts ?? list.data?.counts;

  return (
    <PageShell width="content">
      <PageHeader
        title="Danh bạ cá nhân"
        description="Danh bạ điện thoại và Gmail của riêng bạn — chỉ bạn nhìn thấy. Chọn người nào cần thì đưa vào CRM."
        actions={
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInput}
              type="file"
              accept=".vcf,.vcard,.csv,text/vcard,text/csv"
              className="sr-only"
              aria-label="Chọn file danh bạ"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) upload.mutate(file);
              }}
            />
            <Button onClick={() => fileInput.current?.click()} disabled={upload.isPending}>
              <Upload size={15} aria-hidden="true" />
              {upload.isPending ? 'Đang nạp…' : 'Tải file danh bạ'}
            </Button>
          </div>
        }
      />

      <Panel
        title={
          <span className="inline-flex items-center gap-1.5">
            <CloudDownload size={15} className="shrink-0 text-tr-muted" aria-hidden="true" />
            Đồng bộ từ Gmail
          </span>
        }
      >
        {!google ? (
          <SkeletonRows rows={1} cols={2} />
        ) : google.connected ? (
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <CheckCircle2 size={16} className="text-tr-success" aria-hidden="true" />
              <span className="text-tr-text">
                Đã kết nối <strong>{google.google_account}</strong>
              </span>
              {google.syncing && <span className="text-tr-muted">· đang đồng bộ…</span>}
            </div>
            <p className="text-xs text-tr-muted">
              {google.last_success_at
                ? `Đồng bộ thành công lúc ${formatDate(google.last_success_at)}: ${
                    google.last_imported ?? 0
                  } mới, ${google.last_updated ?? 0} cập nhật, ${google.last_removed ?? 0} đã xoá.`
                : 'Chưa đồng bộ lần nào.'}{' '}
              Chỉ đọc danh bạ — CRM không sửa hay xoá gì trên Google.
            </p>
            {google.last_error && (
              <p role="alert" className="text-xs text-tr-danger">
                Lần đồng bộ gần nhất lỗi: {google.last_error}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                disabled={sync.isPending || google.syncing}
                onClick={() => sync.mutate()}
              >
                <RefreshCw size={15} aria-hidden="true" /> Đồng bộ ngay
              </Button>
              <Button onClick={() => setDisconnecting(true)}>Ngắt kết nối</Button>
              <label className="inline-flex items-center gap-2 text-xs text-tr-subtle">
                <input
                  type="checkbox"
                  checked={google.auto_sync}
                  disabled={autoSync.isPending}
                  onChange={(event) => autoSync.mutate(event.target.checked)}
                />
                Tự động đồng bộ mỗi ngày
              </label>
            </div>
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            <p className="text-tr-subtle">
              Kết nối Gmail của bạn để kéo danh bạ về CRM. Chỉ cần quyền xem danh bạ; bạn có thể
              ngắt bất cứ lúc nào. Không dùng Gmail? Tải file <code>.vcf</code> hoặc{' '}
              <code>.csv</code> xuất từ điện thoại ở trên.
            </p>
            {google.last_error && (
              <p role="alert" className="text-xs text-tr-danger">
                {google.last_error}
              </p>
            )}
            {google.client_configured ? (
              <Button
                variant="primary"
                onClick={() => {
                  /* Dieu huong trinh duyet (khong phai fetch): xem routes/myContacts.ts. */
                  window.location.href = '/api/my-contacts/google/start';
                }}
              >
                Kết nối Gmail
              </Button>
            ) : (
              <p className="text-xs text-tr-warning">
                Quản trị viên chưa khai báo Google Client ID/Secret (Cài đặt → Email) nên chưa kết
                nối Gmail được. Vẫn dùng được file danh bạ.
              </p>
            )}
          </div>
        )}
      </Panel>

      <Panel>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="min-w-48 flex-1">
            <Input
              type="search"
              value={search}
              placeholder="Tìm theo tên, công ty, số điện thoại, email…"
              aria-label="Tìm trong danh bạ cá nhân"
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(0);
              }}
            />
          </div>
          <Segmented<LinkFilter>
            label="Lọc theo trạng thái"
            value={filter}
            onChange={(value) => {
              setFilter(value);
              setPage(0);
            }}
            options={[
              { value: 'all', label: `Tất cả${counts ? ` (${counts.total})` : ''}` },
              {
                value: 'unlinked',
                label: `Chưa vào CRM${counts ? ` (${counts.total - counts.linked})` : ''}`,
              },
              { value: 'linked', label: `Đã vào CRM${counts ? ` (${counts.linked})` : ''}` },
            ]}
          />
        </div>

        {selected.size > 0 && (
          <div
            role="region"
            aria-label="Thao tác với các dòng đã chọn"
            className="mb-3 flex flex-wrap items-center gap-2 rounded-control border border-tr-border bg-tr-surface px-3 py-2 text-sm"
          >
            <span className="font-medium text-tr-text">Đã chọn {selected.size}</span>
            {canCreateContact && (
              <Button variant="primary" size="sm" onClick={() => setPromoting(true)}>
                <UserPlus size={14} aria-hidden="true" /> Đưa vào CRM
              </Button>
            )}
            <Button size="sm" variant="danger" onClick={() => setDeleting(true)}>
              <Trash2 size={14} aria-hidden="true" /> Xoá khỏi danh bạ cá nhân
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Bỏ chọn
            </Button>
          </div>
        )}

        {list.isLoading ? (
          <SkeletonRows rows={6} cols={4} />
        ) : list.error ? (
          <ErrorState onRetry={() => list.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            message={
              search || filter !== 'all'
                ? 'Không có liên hệ nào khớp bộ lọc.'
                : 'Danh bạ cá nhân còn trống.'
            }
            hint={
              search || filter !== 'all'
                ? undefined
                : 'Tải file .vcf/.csv xuất từ điện thoại hoặc Google Contacts, hoặc kết nối Gmail ở trên.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="text-xs text-tr-muted">
                <tr>
                  <th className="w-8 py-1.5 pr-2">
                    <input
                      type="checkbox"
                      aria-label="Chọn tất cả trên trang này"
                      checked={allOnPageSelected}
                      disabled={selectableOnPage.length === 0}
                      onChange={togglePage}
                    />
                  </th>
                  <th className="py-1.5 pr-3 font-semibold">Liên hệ</th>
                  <th className="py-1.5 pr-3 font-semibold">Điện thoại / Email</th>
                  <th className="py-1.5 font-semibold">Trong CRM</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <ContactRow
                    key={item.id}
                    item={item}
                    checked={selected.has(item.id)}
                    onToggle={() => toggle(item.id)}
                    onLink={(contactId) => link.mutate({ id: item.id, contactId })}
                    onUnlink={() => unlink.mutate(item.id)}
                    busy={link.isPending || unlink.isPending}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > PAGE_SIZE && (
          <div className="mt-3 flex items-center justify-between text-xs text-tr-muted">
            <span>
              Trang {page + 1}/{pageCount} · {total} liên hệ
            </span>
            <div className="flex gap-2">
              <Button size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                Trước
              </Button>
              <Button size="sm" disabled={page + 1 >= pageCount} onClick={() => setPage(page + 1)}>
                Sau
              </Button>
            </div>
          </div>
        )}
      </Panel>

      <PromoteModal
        open={promoting}
        ids={[...selected]}
        onClose={() => setPromoting(false)}
        onDone={() => {
          setPromoting(false);
          setSelected(new Set());
          void refreshAll();
          void queryClient.invalidateQueries({ queryKey: ['orgs'] });
          void queryClient.invalidateQueries({ queryKey: ['customer'] });
        }}
      />

      <ConfirmDialog
        open={deleting}
        title="Xoá khỏi danh bạ cá nhân"
        message={`Xoá ${selected.size} liên hệ khỏi danh bạ cá nhân? Người đã đưa vào CRM vẫn nằm ở CRM. Liên hệ lấy từ Gmail sẽ hiện lại ở lần đồng bộ sau nếu còn trên Google.`}
        onCancel={() => setDeleting(false)}
        onConfirm={() => remove.mutate([...selected])}
      />

      <DisconnectModal
        open={disconnecting}
        pending={disconnect.isPending}
        onCancel={() => setDisconnecting(false)}
        onConfirm={(removeContacts) => disconnect.mutate(removeContacts)}
      />
    </PageShell>
  );
}

function ContactRow({
  item,
  checked,
  onToggle,
  onLink,
  onUnlink,
  busy,
}: {
  item: PersonalContact;
  checked: boolean;
  onToggle: () => void;
  onLink: (contactId: number) => void;
  onUnlink: () => void;
  busy: boolean;
}) {
  const linked = item.linked_contact_id !== null;
  const match = item.matches[0];
  return (
    <tr className="border-t border-tr-border align-top">
      <td className="py-2 pr-2">
        <input
          type="checkbox"
          aria-label={`Chọn ${item.full_name}`}
          checked={checked}
          disabled={linked}
          onChange={onToggle}
        />
      </td>
      <td className="py-2 pr-3">
        <p className="font-medium text-tr-text">{item.full_name}</p>
        {(item.org_name || item.title) && (
          <p className="text-xs text-tr-muted">
            {[item.title, item.org_name].filter(Boolean).join(' · ')}
          </p>
        )}
        <span className="mt-0.5 inline-block rounded-control border border-tr-border px-1.5 text-[11px] text-tr-muted">
          {item.source === 'google' ? 'Gmail' : 'File'}
        </span>
      </td>
      <td className="py-2 pr-3 text-tr-subtle">
        {item.phone && <p>{item.phone}</p>}
        {item.email && <p className="break-all">{item.email}</p>}
      </td>
      <td className="py-2">
        {linked ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs text-tr-success">
              <CheckCircle2 size={13} aria-hidden="true" /> Đã vào CRM
            </span>
            {item.linked && (
              <Link
                to={`/customers/${item.linked.customer_id}?contact=${item.linked.contact_id}`}
                className={`rounded-control text-xs font-medium text-tr-primary hover:underline ${focusRing}`}
              >
                {item.linked.customer_name}
              </Link>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={onUnlink}
              className={`inline-flex items-center gap-1 rounded-control px-1 text-xs text-tr-muted hover:text-tr-text ${focusRing}`}
            >
              <Unlink size={12} aria-hidden="true" /> Gỡ liên kết
            </button>
          </div>
        ) : match ? (
          <div className="space-y-1 text-xs">
            <p className="text-tr-warning">
              Có thể trùng: {match.full_name} ({match.customer_name})
              {item.matches.length > 1 ? ` +${item.matches.length - 1}` : ''}
            </p>
            <Button size="sm" disabled={busy} onClick={() => onLink(match.contact_id)}>
              <Link2 size={13} aria-hidden="true" /> Liên kết với người này
            </Button>
          </div>
        ) : (
          <span className="text-xs text-tr-muted">Chưa có</span>
        )}
      </td>
    </tr>
  );
}

function PromoteModal({
  open,
  ids,
  onClose,
  onDone,
}: {
  open: boolean;
  ids: number[];
  onClose: () => void;
  onDone: () => void;
}) {
  const pushToast = useUiStore((s) => s.pushToast);
  const customers = useCustomerOptions(open);
  const [customerId, setCustomerId] = useState<number | ''>('');
  const [allowDuplicates, setAllowDuplicates] = useState(false);

  const options = useMemo(
    () =>
      (customers.data ?? []).map((customer) => ({
        id: customer.id,
        label: customer.name,
        sublabel: customer.tax_code ?? undefined,
      })),
    [customers.data]
  );

  const promote = useMutation({
    mutationFn: () =>
      api.post<PromoteResult>('/api/my-contacts/promote', {
        ids,
        customer_id: customerId,
        allow_duplicates: allowDuplicates,
      }),
    onSuccess: (result) => {
      const duplicates = result.skipped.filter((s) => s.reason === 'duplicate');
      /* Người trùng ở khách hàng KHÁC không được gắn vào khách hàng vừa chọn — phải
         nói rõ ở đâu, nếu không người dùng tưởng đã gắn mà hồ sơ khách hàng trống. */
      const elsewhere = [
        ...new Set(duplicates.flatMap((s) => (s.customers ?? []).map((c) => c.name))),
      ];
      const parts = [`Đã thêm ${result.created} người liên hệ mới`];
      if (result.linked_existing)
        parts.push(`gắn ${result.linked_existing} người đã có sẵn ở khách hàng này`);
      let message = `${parts.join(', ')}.`;
      if (duplicates.length)
        message += ` Bỏ qua ${duplicates.length} người đã có ở ${
          elsewhere.length ? elsewhere.slice(0, 3).join(', ') : 'khách hàng khác'
        }${elsewhere.length > 3 ? '…' : ''} — muốn thêm vào khách hàng này, đánh dấu "Vẫn tạo mới" rồi đưa lại.`;
      const nothingAdded = result.created + result.linked_existing === 0;
      pushToast(message, nothingAdded && duplicates.length ? 'error' : 'success');
      setCustomerId('');
      setAllowDuplicates(false);
      onDone();
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Đưa ${ids.length} liên hệ vào CRM`}
      width="max-w-md"
      footer={
        <>
          <Button onClick={onClose}>Huỷ</Button>
          <Button
            variant="primary"
            disabled={customerId === '' || promote.isPending}
            onClick={() => promote.mutate()}
          >
            Đưa vào CRM
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Gắn vào khách hàng / tổ chức" required>
          <Combobox
            value={customerId}
            onChange={setCustomerId}
            options={options}
            placeholder="— Chọn khách hàng —"
            searchPlaceholder="Tìm khách hàng…"
            allowClear={false}
          />
        </Field>
        <label className="flex items-start gap-2 text-xs text-tr-subtle">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={allowDuplicates}
            onChange={(event) => setAllowDuplicates(event.target.checked)}
          />
          <span>
            Vẫn tạo mới cả những người đã có ở khách hàng khác (trùng số điện thoại / email). Mặc
            định: trùng người ở chính khách hàng này thì gắn vào người đó; trùng ở khách hàng khác
            thì bỏ qua để không tạo bản sao.
          </span>
        </label>
      </div>
    </Modal>
  );
}

function DisconnectModal({
  open,
  pending,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (removeContacts: boolean) => void;
}) {
  const [removeContacts, setRemoveContacts] = useState(false);
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="Ngắt kết nối Gmail"
      width="max-w-md"
      footer={
        <>
          <Button onClick={onCancel}>Huỷ</Button>
          <Button variant="danger" disabled={pending} onClick={() => onConfirm(removeContacts)}>
            Ngắt kết nối
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-tr-subtle">
        <p>
          CRM sẽ ngừng đồng bộ và thu hồi quyền xem danh bạ. Người đã đưa vào CRM không bị ảnh
          hưởng.
        </p>
        <label className="flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={removeContacts}
            onChange={(event) => setRemoveContacts(event.target.checked)}
          />
          <span>
            Xoá luôn các liên hệ đã kéo về từ Gmail (chưa đưa vào CRM) khỏi danh bạ cá nhân.
          </span>
        </label>
      </div>
    </Modal>
  );
}
