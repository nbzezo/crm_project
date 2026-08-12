import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, Plus, UserRound } from 'lucide-react';
import { api, qs } from '../api/client';
import { ContactList } from '../components/crm/ContactList';
import { CustomerForm } from '../components/crm/CustomerForm';
import { Button, EmptyState, ErrorState, SkeletonRows, focusRing } from '../components/common/ui';
import { t } from '../i18n/vi';
import type { Contact, Customer, OrgKind } from '../types';

/** Nhóm nào hiện ở đây — khách hàng đã có trang riêng với pipeline, hợp đồng, doanh thu. */
const DIRECTORY_KINDS: OrgKind[] = ['own', 'partner', 'vendor'];

interface OrgWithContacts extends Customer {
  contacts: Contact[];
}

/**
 * Sổ danh bạ tổ chức không phải khách hàng: công ty mình, đối tác, nhà cung cấp.
 *
 * Dùng chung bảng `customers`/`contacts` với CRM — nhân sự khách hàng đã có sẵn ở
 * hồ sơ khách hàng nên không nhập lại ở đây. Mọi người trong cả hai nơi đều giao
 * việc được; trang này chỉ là chỗ khai báo những tổ chức mà CRM cố ý lọc ra.
 */
export default function OrgDirectoryPage() {
  const [creating, setCreating] = useState<OrgKind | null>(null);
  const [editing, setEditing] = useState<Customer | null>(null);

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

  const hasOwnOrg = orgs.some((org) => org.org_kind === 'own');

  /* `h1` nam ngoai moi nhanh: route khai bao `visibleHeading` nen App khong tu
     chen tieu de sr-only — thieu no la trang khong co h1 nao. */
  if (isLoading || error) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <h1 className="text-2xl font-semibold tracking-tight text-tr-text">{t.nav.orgDirectory}</h1>
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
    <div className="space-y-5 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold tracking-tight text-tr-text">{t.nav.orgDirectory}</h1>
      <p className="max-w-3xl text-sm text-tr-subtle">
        Khai báo công ty của bạn, đối tác và nhà cung cấp cùng nhân sự của họ để giao việc. Nhân sự
        khách hàng nằm trong hồ sơ từng khách hàng — mọi người ở cả hai nơi đều chọn được làm người
        phụ trách.
      </p>

      {/* Không có tổ chức 'own' thì bộ lọc "Việc của tôi" và mọi việc nội bộ đều
          không giao được — nên đây là việc đầu tiên cần làm, phải nhìn thấy ngay. */}
      {!hasOwnOrg && (
        <div className="flex flex-wrap items-center gap-3 rounded-panel border border-tr-warning/40 bg-tr-warning/10 px-4 py-3">
          <UserRound size={18} className="shrink-0 text-tr-warning" aria-hidden="true" />
          <div className="min-w-56 flex-1 text-sm">
            <p className="font-medium text-tr-text">Chưa khai báo tổ chức của bạn</p>
            <p className="text-tr-subtle">
              Tạo hồ sơ công ty mình rồi thêm chính bạn vào đó, đánh dấu “Đây là tôi”.
            </p>
          </div>
          <Button variant="primary" onClick={() => setCreating('own')}>
            <Plus size={15} aria-hidden="true" /> Tạo tổ chức của tôi
          </Button>
        </div>
      )}

      {DIRECTORY_KINDS.map((kind) => {
        const group = orgs.filter((org) => org.org_kind === kind);
        return (
          <section key={kind}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-tr-text">{t.orgKind[kind]}</h2>
              <span className="text-xs text-tr-muted">({group.length})</span>
              <span className="flex-1" />
              <Button onClick={() => setCreating(kind)}>
                <Plus size={15} aria-hidden="true" /> Thêm {t.orgKind[kind].toLowerCase()}
              </Button>
            </div>

            {group.length === 0 ? (
              <EmptyState message={`Chưa có ${t.orgKind[kind].toLowerCase()} nào.`} />
            ) : (
              <div className="space-y-3">
                {group.map((org) => (
                  <OrgCard key={org.id} org={org} onEdit={() => setEditing(org)} />
                ))}
              </div>
            )}
          </section>
        );
      })}

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
    </div>
  );
}

/** Một tổ chức kèm danh sách người — tái dùng nguyên `ContactList` của hồ sơ khách hàng. */
function OrgCard({ org, onEdit }: { org: Customer; onEdit: () => void }) {
  const { data } = useQuery({
    queryKey: ['customer', org.id],
    queryFn: () => api.get<OrgWithContacts>(`/api/customers/${org.id}/full`),
  });

  return (
    <div className="rounded-panel border border-tr-border bg-tr-panel p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Building2 size={16} className="shrink-0 text-tr-muted" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-tr-text">{org.name}</h3>
        {org.short_name && <span className="text-xs text-tr-muted">({org.short_name})</span>}
        <span className="flex-1" />
        <button
          type="button"
          onClick={onEdit}
          className={`rounded-control px-2 py-1 text-xs text-tr-primary transition hover:bg-tr-hover ${focusRing}`}
        >
          {t.common.edit}
        </button>
      </div>
      <ContactList customerId={org.id} contacts={data?.contacts ?? []} />
    </div>
  );
}
