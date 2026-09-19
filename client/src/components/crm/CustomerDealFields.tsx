import { Combobox } from '../common/Combobox';
import { Field } from '../common/ui';
import { t } from '../../i18n/vi';
import type { Deal } from '../../types';
import { useCustomerOptions, useDealsByCustomer } from '../../lib/useCrmOptions';

interface CustomerDealFieldsProps {
  open: boolean;
  customerId: string;
  onCustomerChange: (value: string) => void;
  dealId: string;
  onDealChange: (value: string) => void;
  customerError?: string;
  dealHint?: string;
  /** id DOM cho o khach hang — de bang tom tat loi focus thang toi no. */
  customerFieldId?: string;
  /**
   * Goi kem doi tuong co hoi vua chon, de noi goi tu dien san cac truong ma he
   * thong DA BIET (ten, gia tri, du an). Chi truyen id thi form phai bat nguoi
   * dung go lai dung nhung thu vua chon xong.
   */
  onDealSelected?: (deal: Deal | null) => void;
}

/** Cặp trường khách hàng/cơ hội dùng chung, cùng cache và tự xóa cơ hội khi đổi khách hàng. */
export function CustomerDealFields({
  open,
  customerId,
  onCustomerChange,
  dealId,
  onDealChange,
  customerError,
  dealHint,
  customerFieldId,
  onDealSelected,
}: CustomerDealFieldsProps) {
  const { data: customers = [] } = useCustomerOptions(open);
  const { data: deals = [] } = useDealsByCustomer(customerId, open);

  return (
    <>
      <Field label={t.card.customer} required error={customerError}>
        <Combobox
          id={customerFieldId}
          value={customerId === '' ? '' : Number(customerId)}
          onChange={(value) => {
            const next = value === '' ? '' : String(value);
            if (next !== customerId) onDealChange('');
            onCustomerChange(next);
          }}
          options={customers.map((customer) => ({ id: customer.id, label: customer.name }))}
          placeholder={t.common.selectCustomer}
          searchPlaceholder="Tìm khách hàng…"
          emptyText="Không tìm thấy khách hàng."
          ariaLabel={t.card.customer}
        />
      </Field>
      <Field label={t.contract.relatedDeal} hint={dealHint}>
        <Combobox
          value={dealId === '' ? '' : Number(dealId)}
          onChange={(value) => {
            const next = value === '' ? '' : String(value);
            onDealChange(next);
            onDealSelected?.(
              next === '' ? null : (deals.find((d) => String(d.id) === next) ?? null)
            );
          }}
          options={deals.map((deal) => ({ id: deal.id, label: deal.title }))}
          placeholder={`— ${t.common.none} —`}
          searchPlaceholder="Tìm cơ hội…"
          emptyText="Không tìm thấy cơ hội."
          ariaLabel={t.contract.relatedDeal}
        />
      </Field>
    </>
  );
}
