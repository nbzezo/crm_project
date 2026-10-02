import { useState, type ComponentProps } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Combobox } from '../common/Combobox';
import { invalidateCrmViews } from '../../lib/queryKeys';
import type { Customer } from '../../types';
import { CustomerForm } from './CustomerForm';

type ComboboxProps = ComponentProps<typeof Combobox>;

/**
 * Ô chọn khách hàng kèm hai lối tạo mới ngay tại chỗ: tạo nhanh theo tên, hoặc mở
 * biểu mẫu đầy đủ chồng lên form đang mở. Tạo xong thì chọn luôn khách hàng đó.
 *
 * Dùng bên trong một Modal (form cơ hội, form dự án): biểu mẫu khách hàng là một
 * Modal khác nằm trong component này, nên form ngoài phải còn mount suốt lúc đó.
 * Ô nằm trong Popover sẽ đóng theo khi bấm ra ngoài — chỗ đó tự giữ biểu mẫu ở
 * cấp cao hơn (xem CardModal).
 */
export function CustomerCombobox({
  options,
  onChange,
  ...rest
}: Omit<ComboboxProps, 'onQuickCreate' | 'quickCreateLabel' | 'onCreateFull' | 'createFullLabel'>) {
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState<string | null>(null);

  return (
    <>
      <Combobox
        {...rest}
        options={options}
        onChange={onChange}
        onQuickCreate={async (name) => {
          const created = await api.post<Customer>('/api/customers', { name });
          invalidateCrmViews(queryClient);
          return { id: created.id, label: created.name };
        }}
        quickCreateLabel={(q) => `+ Tạo nhanh khách hàng "${q}"`}
        onCreateFull={(q) => setFullName(q)}
        createFullLabel={(q) => (q ? `Tạo khách hàng "${q}" đầy đủ…` : 'Tạo khách hàng mới…')}
      />
      <CustomerForm
        open={fullName !== null}
        onClose={() => setFullName(null)}
        defaultName={fullName ?? ''}
        onCreated={(customer) => onChange(customer.id)}
      />
    </>
  );
}
