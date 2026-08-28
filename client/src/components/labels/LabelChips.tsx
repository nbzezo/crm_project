import { contrastInk } from '../../lib/format';
import type { Label } from '../../types';

/**
 * Dai nhan dang badge (FR-TAG-25).
 *
 * Chi hien `max` nhan dau, phan con lai gom thanh "+N" de dong danh sach
 * khong bi day di — bam vao "+N" khong lam gi, chi de bao con nhan khac.
 * Tooltip luon co ten nhom (FR-TAG-27) nen hai nhan trung ten o hai nhom
 * khac nhau van phan biet duoc (C6).
 */
export function LabelChips({
  labels,
  max = 5,
  small,
  className = '',
}: {
  labels: Label[];
  max?: number;
  small?: boolean;
  className?: string;
}) {
  if (labels.length === 0) return null;
  const shown = labels.slice(0, max);
  const rest = labels.length - shown.length;

  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className}`}>
      {shown.map((label) => (
        <LabelChip key={label.id} label={label} small={small} />
      ))}
      {rest > 0 && (
        <span
          className={`rounded-md bg-tr-hover font-medium text-tr-subtle ${
            small ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-0.5 text-xs'
          }`}
          title={labels
            .slice(max)
            .map((l) => l.name)
            .join(', ')}
        >
          +{rest}
        </span>
      )}
    </span>
  );
}

export function LabelChip({ label, small }: { label: Label; small?: boolean }) {
  const title = [
    label.group_name ? `${label.group_name} / ${label.name}` : label.name,
    label.description || null,
    label.status === 'inactive' ? '(đã vô hiệu hóa)' : null,
  ]
    .filter(Boolean)
    .join(' — ');

  return (
    <span
      title={title}
      className={`inline-flex max-w-[14rem] items-center gap-1 truncate rounded-md font-medium whitespace-nowrap ${
        small ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-0.5 text-xs'
      } ${label.status === 'inactive' ? 'opacity-60' : ''}`}
      style={{ backgroundColor: label.color, color: contrastInk(label.color) }}
    >
      {label.name}
    </span>
  );
}
