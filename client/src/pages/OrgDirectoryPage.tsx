import { Fragment, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  ChevronDown,
  Eye,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  UserRound,
  Users,
} from 'lucide-react';
import { api, qs } from '../api/client';
import {
  ContactList,
  RELATIONSHIP_BADGE_CLASS,
  type ContactListHandle,
} from '../components/crm/ContactList';
import { CustomerForm } from '../components/crm/CustomerForm';
import { Modal } from '../components/common/Modal';
import { Popover, PopoverItem } from '../components/common/Popover';
import { Tabs } from '../components/common/Tabs';
import {
  Button,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  Panel,
  Select,
  Skeleton,
  SkeletonRows,
  TableHead,
  focusRing,
} from '../components/common/ui';
import { t } from '../i18n/vi';
import { formatDate } from '../lib/format';
import type { Contact, Customer, OrgKind } from '../types';

/** Nhóm nào hiện ở đây — khách hàng đã có trang riêng với pipeline, hợp đồng, doanh thu. */
const DIRECTORY_KINDS: OrgKind[] = ['own', 'partner', 'vendor'];

type RelTab = 'partner' | 'vendor';

interface OrgWithContacts extends Customer {
  contacts: Contact[];
}

interface OrgSummary {
  contacts: Contact[];
  relationship: string | null;
  loaded: boolean;
}

const orgKindLabel: Record<RelTab, string> = { partner: 'đối tác', vendor: 'nhà cung cấp' };

/** Nhãn tab kèm số đếm — tự vẽ thay vì dùng `count` của `Tabs` vì component đó ẩn số 0. */
function tabLabel(text: string, count: number) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {text}
      <span className="text-xs font-normal text-tr-muted">{count}</span>
    </span>
  );
}

const ghostLinkClass = `tr-button tr-button-ghost inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-control px-2.5 py-1 text-xs font-medium text-tr-subtle transition hover:bg-tr-hover fine:min-h-0 ${focusRing}`;

/**
 * Sổ danh bạ tổ chức không phải khách hàng: công ty mình, đối tác, nhà cung cấp.
 *
 * Dùng chung bảng `customers`/`contacts` với CRM — nhân sự khách hàng đã có sẵn ở
 * hồ sơ khách hàng nên không nhập lại ở đây. Mọi người trong cả hai nơi đều giao
 * việc được; trang này chỉ là chỗ khai báo những tổ chức mà CRM cố ý lọc ra.
 */
export default function OrgDirectoryPage() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState<OrgKind | null>(null);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [newMenuAnchor, setNewMenuAnchor] = useState<HTMLElement | null>(null);
  const [relTab, setRelTab] = useState<RelTab>('partner');
  const [search, setSearch] = useState('');
  const [relationshipFilter, setRelationshipFilter] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [rowMenu, setRowMenu] = useState<{ id: number; anchor: HTMLElement } | null>(null);
  const ownMemberListRef = useRef<ContactListHandle>(null);
  const rowContactRefs = useRef(new Map<number, ContactListHandle | null>());

  const {
    data: orgs = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['orgs', 'directory'],
    queryFn: async () => {
      const lists = await Promise.all(
        DIRECTORY_KINDS.map((kind) =>
          api.get<Customer[]>(`/api/customers${qs({ org_kind: kind })}`)
        )
      );
      return lists.flat();
    },
  });

  const ownOrg = orgs.find((org) => org.org_kind === 'own') ?? null;
  const partners = useMemo(() => orgs.filter((org) => org.org_kind === 'partner'), [orgs]);
  const vendors = useMemo(() => orgs.filter((org) => org.org_kind === 'vendor'), [orgs]);
  const activeOrgs = relTab === 'partner' ? partners : vendors;

  const { data: ownFull } = useQuery({
    queryKey: ['customer', ownOrg?.id],
    queryFn: () => api.get<OrgWithContacts>(`/api/customers/${ownOrg!.id}/full`),
    enabled: !!ownOrg,
  });

  /** Chỉ nạp nhân sự của các tổ chức đang ở tab hiện tại — tab kia không render nên không gọi. */
  const activeOrgFullQueries = useQueries({
    queries: activeOrgs.map((org) => ({
      queryKey: ['customer', org.id],
      queryFn: () => api.get<OrgWithContacts>(`/api/customers/${org.id}/full`),
      staleTime: 30_000,
    })),
  });

  const orgSummaries = useMemo(() => {
    const map = new Map<number, OrgSummary>();
    activeOrgs.forEach((org, index) => {
      const result = activeOrgFullQueries[index];
      const contacts = result?.data?.contacts ?? [];
      const primary = contacts.find((c) => c.is_primary) ?? contacts.find((c) => c.relationship);
      map.set(org.id, {
        contacts,
        relationship: primary?.relationship ?? null,
        loaded: !!result?.data,
      });
    });
    return map;
  }, [activeOrgs, activeOrgFullQueries.map((q) => q.dataUpdatedAt).join(',')]);

  const filteredOrgs = useMemo(() => {
    const term = search.trim().toLowerCase();
    return activeOrgs.filter((org) => {
      if (term && !`${org.name} ${org.short_name ?? ''}`.toLowerCase().includes(term)) return false;
      if (
        relationshipFilter &&
        (orgSummaries.get(org.id)?.relationship ?? '') !== relationshipFilter
      ) {
        return false;
      }
      return true;
    });
  }, [activeOrgs, search, relationshipFilter, orgSummaries]);

  const hasActiveFilters = Boolean(search || relationshipFilter);

  const removeOrg = useMutation({
    mutationFn: (id: number) => api.del(`/api/customers/${id}`),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['orgs'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setExpandedId((current) => (current === id ? null : current));
    },
  });

  const { data: deleteImpact } = useQuery({
    queryKey: ['customer', deleteTarget?.id, 'impact'],
    queryFn: () => api.get<Record<string, number>>(`/api/customers/${deleteTarget!.id}/impact`),
    enabled: !!deleteTarget,
  });

  const rowMenuTarget = rowMenu ? (activeOrgs.find((org) => org.id === rowMenu.id) ?? null) : null;
  const ownMemberCount = ownFull?.contacts.length ?? 0;
  /** "Người phụ trách" ở đây = liên hệ được đánh dấu chính (`is_primary`) trong nội bộ. */
  const ownLeadCount = ownFull?.contacts.filter((c) => c.is_primary).length ?? 0;

  if (isLoading || error) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <p className="text-base font-bold text-tr-text">{t.nav.orgDirectory}</p>
        {isLoading ? (
          <div className="rounded-panel border border-tr-border bg-tr-panel">
            <SkeletonRows rows={5} cols={3} />
          </div>
        ) : (
          <ErrorState onRetry={() => refetch()} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-base font-bold text-tr-text">{t.nav.orgDirectory}</p>
          <p className="text-xs text-tr-muted">
            Quản lý công ty, đối tác, nhà cung cấp và người liên hệ.
          </p>
        </div>
        <Button variant="primary" onClick={(e) => setNewMenuAnchor(e.currentTarget)}>
          <Plus size={16} aria-hidden="true" /> Thêm mới{' '}
          <ChevronDown size={14} aria-hidden="true" />
        </Button>
      </div>

      {!ownOrg ? (
        <div className="flex flex-wrap items-center gap-3 rounded-panel border border-tr-warning/40 bg-tr-warning/10 px-4 py-3">
          <UserRound size={18} className="shrink-0 text-tr-warning" aria-hidden="true" />
          <div className="min-w-56 flex-1 text-sm">
            <p className="font-medium text-tr-text">Chưa khai báo tổ chức của bạn</p>
            <p className="text-tr-subtle">
              Tạo hồ sơ công ty mình rồi thêm chính bạn vào đó, đánh dấu "Đây là tôi".
            </p>
          </div>
          <Button variant="primary" onClick={() => setCreating('own')}>
            <Plus size={15} aria-hidden="true" /> Tạo tổ chức của tôi
          </Button>
        </div>
      ) : (
        <Panel
          title={
            <span className="inline-flex items-center gap-1.5">
              <Building2 size={15} className="shrink-0 text-tr-muted" aria-hidden="true" />
              {ownOrg.name}
            </span>
          }
          action={
            <div className="flex shrink-0 gap-1.5">
              <Button size="sm" onClick={() => setEditing(ownOrg)}>
                {t.common.edit}
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={() => ownMemberListRef.current?.openAdd()}
              >
                <Plus size={13} aria-hidden="true" /> Thành viên
              </Button>
            </div>
          }
        >
          <p className="mb-2 text-xs text-tr-muted">
            {ownOrg.short_name && `${ownOrg.short_name} · `}
            {ownMemberCount} thành viên · {ownLeadCount} người phụ trách
          </p>
          <ContactList
            ref={ownMemberListRef}
            customerId={ownOrg.id}
            contacts={ownFull?.contacts ?? []}
            compact
          />
        </Panel>
      )}

      <Panel title="Quan hệ doanh nghiệp">
        <Tabs
          value={relTab}
          onChange={(value) => {
            setRelTab(value);
            setSearch('');
            setRelationshipFilter('');
            setExpandedId(null);
          }}
          items={[
            { value: 'partner', label: tabLabel('Đối tác', partners.length) },
            { value: 'vendor', label: tabLabel('Nhà cung cấp', vendors.length) },
          ]}
          ariaLabel="Loại quan hệ doanh nghiệp"
          idPrefix="org-rel"
        >
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-[200px] flex-1 sm:max-w-xs">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={relTab === 'partner' ? 'Tìm đối tác…' : 'Tìm nhà cung cấp…'}
                  aria-label="Tìm tổ chức"
                />
              </div>
              <div className="w-44">
                <Select
                  value={relationshipFilter}
                  onChange={(e) => setRelationshipFilter(e.target.value)}
                  aria-label="Quan hệ"
                >
                  <option value="">Mọi mức quan hệ</option>
                  {Object.entries(t.relationship).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </div>
              <Button variant="primary" className="ml-auto" onClick={() => setCreating(relTab)}>
                <Plus size={15} aria-hidden="true" /> Thêm {orgKindLabel[relTab]}
              </Button>
            </div>

            {filteredOrgs.length === 0 ? (
              activeOrgs.length === 0 ? (
                <EmptyState
                  message={`Chưa có ${orgKindLabel[relTab]}`}
                  hint={`Thêm ${orgKindLabel[relTab]} đầu tiên để quản lý quan hệ doanh nghiệp.`}
                  action={
                    <Button variant="primary" onClick={() => setCreating(relTab)}>
                      <Plus size={15} aria-hidden="true" /> Thêm {orgKindLabel[relTab]}
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  message="Không tìm thấy tổ chức"
                  hint="Thử thay đổi từ khóa hoặc bộ lọc."
                  action={
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setSearch('');
                        setRelationshipFilter('');
                      }}
                    >
                      {t.common.clearFilter}
                    </Button>
                  }
                />
              )
            ) : (
              <div className="overflow-x-auto rounded-lg border border-tr-border bg-tr-panel shadow-sm">
                <table className="w-full min-w-[720px] text-sm">
                  <TableHead>
                    <tr>
                      <th scope="col" className="px-4 py-2">
                        Tổ chức
                      </th>
                      <th scope="col" className="px-4 py-2">
                        Người liên hệ
                      </th>
                      <th scope="col" className="px-4 py-2">
                        Quan hệ
                      </th>
                      <th scope="col" className="px-4 py-2">
                        Cập nhật
                      </th>
                      <th scope="col" className="px-4 py-2"></th>
                    </tr>
                  </TableHead>
                  <tbody className="divide-y divide-tr-border">
                    {filteredOrgs.map((org) => {
                      const summary = orgSummaries.get(org.id);
                      const expanded = expandedId === org.id;
                      return (
                        <Fragment key={org.id}>
                          <tr className="transition hover:bg-tr-hover">
                            <td className="px-4 py-2">
                              <Link
                                to={`/customers/${org.id}`}
                                className="group flex items-center gap-2"
                              >
                                <Building2
                                  size={14}
                                  className="shrink-0 text-tr-muted"
                                  aria-hidden="true"
                                />
                                <span className="truncate font-semibold text-tr-text group-hover:text-tr-primary group-hover:underline">
                                  {org.name}
                                </span>
                              </Link>
                              {(org.short_name || org.industry) && (
                                <div className="mt-0.5 pl-[22px] text-xs text-tr-muted">
                                  {[org.short_name, org.industry].filter(Boolean).join(' · ')}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-2">
                              {summary?.loaded ? (
                                <button
                                  type="button"
                                  onClick={() => setExpandedId(expanded ? null : org.id)}
                                  className={`inline-flex items-center gap-1 rounded-control px-1 py-0.5 text-xs text-tr-subtle transition hover:text-tr-primary ${focusRing}`}
                                  aria-expanded={expanded}
                                >
                                  <Users size={12} aria-hidden="true" />
                                  {summary.contacts.length} người liên hệ
                                  <ChevronDown
                                    size={12}
                                    aria-hidden="true"
                                    className={`transition ${expanded ? 'rotate-180' : ''}`}
                                  />
                                </button>
                              ) : (
                                <Skeleton className="h-3 w-20" />
                              )}
                            </td>
                            <td className="px-4 py-2">
                              {!summary?.loaded ? (
                                <Skeleton className="h-4 w-14" />
                              ) : summary.relationship ? (
                                <span
                                  className={`rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ${
                                    RELATIONSHIP_BADGE_CLASS[summary.relationship] ??
                                    'bg-tr-hover text-tr-subtle'
                                  }`}
                                >
                                  ● {t.relationship[summary.relationship] ?? summary.relationship}
                                </span>
                              ) : (
                                <span className="text-xs text-tr-muted">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-xs whitespace-nowrap text-tr-muted">
                              {formatDate(org.updated_at) || '—'}
                            </td>
                            <td className="px-4 py-2">
                              <div className="flex items-center justify-end gap-1">
                                <Link to={`/customers/${org.id}`} className={ghostLinkClass}>
                                  <Eye size={13} aria-hidden="true" /> Xem
                                </Link>
                                <IconButton
                                  onClick={(e) =>
                                    setRowMenu({ id: org.id, anchor: e.currentTarget })
                                  }
                                  label={`Thao tác khác: ${org.name}`}
                                >
                                  <MoreHorizontal size={16} aria-hidden="true" />
                                </IconButton>
                              </div>
                            </td>
                          </tr>
                          {expanded && (
                            <tr>
                              <td colSpan={5} className="bg-tr-surface px-4 py-3">
                                <div className="mb-2 flex items-center justify-between">
                                  <p className="text-xs font-semibold text-tr-subtle">
                                    Người liên hệ
                                  </p>
                                  <Button
                                    size="sm"
                                    onClick={() => rowContactRefs.current.get(org.id)?.openAdd()}
                                  >
                                    <Plus size={13} aria-hidden="true" /> Thêm người liên hệ
                                  </Button>
                                </div>
                                <ContactList
                                  ref={(handle) => {
                                    rowContactRefs.current.set(org.id, handle);
                                  }}
                                  customerId={org.id}
                                  contacts={summary?.contacts ?? []}
                                  compact
                                />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {hasActiveFilters && filteredOrgs.length > 0 && (
              <p className="text-xs text-tr-muted">
                {filteredOrgs.length}/{activeOrgs.length} {orgKindLabel[relTab]}
              </p>
            )}
          </div>
        </Tabs>
      </Panel>

      <CustomerForm
        open={creating !== null}
        onClose={() => setCreating(null)}
        defaultOrgKind={creating ?? 'partner'}
        showOrgKind
      />
      <CustomerForm
        open={editing !== null}
        onClose={() => setEditing(null)}
        customer={editing ?? undefined}
        showOrgKind
      />

      {newMenuAnchor && (
        <Popover
          open
          onClose={() => setNewMenuAnchor(null)}
          anchor={newMenuAnchor}
          title="Thêm mới"
          width={200}
        >
          <PopoverItem
            icon={<Building2 size={15} aria-hidden="true" />}
            onClick={() => {
              setCreating('own');
              setNewMenuAnchor(null);
            }}
          >
            Công ty
          </PopoverItem>
          <PopoverItem
            icon={<Building2 size={15} aria-hidden="true" />}
            onClick={() => {
              setCreating('partner');
              setNewMenuAnchor(null);
            }}
          >
            Đối tác
          </PopoverItem>
          <PopoverItem
            icon={<Building2 size={15} aria-hidden="true" />}
            onClick={() => {
              setCreating('vendor');
              setNewMenuAnchor(null);
            }}
          >
            Nhà cung cấp
          </PopoverItem>
        </Popover>
      )}

      {rowMenu && rowMenuTarget && (
        <Popover
          open
          onClose={() => setRowMenu(null)}
          anchor={rowMenu.anchor}
          title={rowMenuTarget.name}
          width={232}
        >
          <PopoverItem
            icon={<Pencil size={15} aria-hidden="true" />}
            onClick={() => {
              setEditing(rowMenuTarget);
              setRowMenu(null);
            }}
          >
            {t.common.edit}
          </PopoverItem>
          <PopoverItem
            icon={<Users size={15} aria-hidden="true" />}
            onClick={() => {
              setExpandedId(rowMenuTarget.id);
              setRowMenu(null);
            }}
          >
            Quản lý người liên hệ
          </PopoverItem>
          <div className="my-1 -mx-3 border-t border-tr-border" />
          <PopoverItem
            icon={<Trash2 size={15} aria-hidden="true" />}
            danger
            onClick={() => {
              setDeleteTarget(rowMenuTarget);
              setRowMenu(null);
            }}
          >
            Xóa {orgKindLabel[relTab]}
          </PopoverItem>
        </Popover>
      )}

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={deleteTarget ? `Xóa ${t.orgKind[deleteTarget.org_kind]?.toLowerCase()}` : ''}
        width="max-w-md"
        footer={
          <>
            <Button onClick={() => setDeleteTarget(null)}>{t.common.cancel}</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (deleteTarget) removeOrg.mutate(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              {t.common.delete}
            </Button>
          </>
        }
      >
        {deleteTarget && (
          <>
            <p className="text-sm text-tr-subtle">
              Xóa <strong className="text-tr-text">{deleteTarget.name}</strong> sẽ xóa theo:
            </p>
            {deleteImpact && (
              <ul className="mt-2 space-y-0.5 text-sm text-tr-subtle">
                {(
                  [
                    ['contacts', 'người liên hệ'],
                    ['deals', 'cơ hội'],
                    ['contracts', 'hợp đồng'],
                    ['quotations', 'báo giá'],
                    ['documents', 'tài liệu'],
                    ['services', 'dòng dịch vụ & doanh thu'],
                    ['interactions', 'tương tác'],
                  ] as const
                ).map(([key, label]) =>
                  deleteImpact[key] ? (
                    <li key={key}>
                      • {deleteImpact[key]} {label}
                    </li>
                  ) : null
                )}
                {deleteImpact.tasks ? (
                  <li>• {deleteImpact.tasks} công việc sẽ bị gỡ liên kết</li>
                ) : null}
              </ul>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
