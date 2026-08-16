import { Pencil, Table2, Trash2 } from 'lucide-react';
import { IconButton } from '../common/ui';
import { t } from '../../i18n/vi';
import type { RevenueLine } from '../../types';

export function RevenueLineActions({
  line,
  onMonths,
  onEdit,
  onDelete,
}: {
  line: RevenueLine;
  onMonths: (line: RevenueLine) => void;
  onEdit: (line: RevenueLine) => void;
  onDelete: (line: RevenueLine) => void;
}) {
  return (
    <div className="flex justify-end gap-0.5">
      <IconButton label={t.revenue.enterMonths} tone="primary" onClick={() => onMonths(line)}>
        <Table2 size={14} aria-hidden="true" />
      </IconButton>
      <IconButton label={t.common.edit} onClick={() => onEdit(line)}>
        <Pencil size={14} aria-hidden="true" />
      </IconButton>
      <IconButton label={t.common.delete} tone="danger" onClick={() => onDelete(line)}>
        <Trash2 size={14} aria-hidden="true" />
      </IconButton>
    </div>
  );
}
