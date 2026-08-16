import { Combobox } from '../common/Combobox';
import { Field } from '../common/ui';
import { t } from '../../i18n/vi';
import { useCustomerOptions, useDealsByCustomer } from '../../lib/useCrmOptions';

interface CustomerDealFieldsProps {
  open: boolean;
  customerId: string;
  onCustomerChange: (value: string) => void;
  dealId: string;
  onDealChange: (value: string) => void;
  customerError?: string;
  dealHint?: string;
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
}: CustomerDealFieldsProps) {
  const { data: customers = [] } = useCustomerOptions(open);
  const { data: deals = [] } = useDealsByCustomer(customerId, open);

  return (
    <>
      <Field label={t.card.customer} required error={customerError}>
        <Combobox
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
          onChange={(value) => onDealChange(value === '' ? '' : String(value))}
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
