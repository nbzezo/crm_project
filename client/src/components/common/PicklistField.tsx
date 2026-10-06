import type { PicklistKey } from '@workflow/contracts';
import { Field, Select } from './ui';
import { usePicklist } from '../../lib/crmConfig';
import { t } from '../../i18n/vi';

/**
 * Ô chọn một giá trị trong danh mục động (Cài đặt → Danh mục).
 *
 * Bản ghi đang mang một giá trị không có trong danh mục (dữ liệu cũ, hoặc AI vừa
 * điền) vẫn hiện thành một dòng riêng kèm lời nhắc — máy chủ sẽ từ chối lưu giá trị
 * đó, nên người dùng phải biết trước thay vì gặp lỗi khi bấm Lưu.
 */
export function PicklistField({
  label,
  list,
  value,
  onChange,
}: {
  label: string;
  list: PicklistKey;
  value: string;
  onChange: (value: string) => void;
}) {
  const choices = usePicklist().choices(list, value);
  const missing = choices.some((choice) => choice.missing && choice.value === value);
  return (
    <Field
      label={label}
      hint={
        missing
          ? 'Giá trị này chưa có trong danh mục — chọn giá trị khác, hoặc nhờ quản trị viên thêm ở Cài đặt → Danh mục.'
          : undefined
      }
    >
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">— {t.common.none} —</option>
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.missing ? `${choice.label} (chưa có trong danh mục)` : choice.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}
