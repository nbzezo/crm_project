import { useState } from 'react';
import { Link2, X } from 'lucide-react';
import { Button, Segmented } from '../common/ui';
import { Combobox, type ComboboxOption } from '../common/Combobox';
import { useCustomerOptions, useDealOptions, useProjectOptions } from '../../lib/useCrmOptions';
import { useAssignees } from '../tasks/AssigneePicker';
import type { QuickNoteRelation, QuickNoteRelationType } from '../../types';

const TYPE_OPTIONS: { value: QuickNoteRelationType; label: string }[] = [
  { value: 'customer', label: 'Khách hàng' },
  { value: 'contact', label: 'Người liên hệ' },
  { value: 'deal', label: 'Cơ hội' },
  { value: 'project', label: 'Dự án' },
];

/**
 * FR15: gan Quick Note vao mot CRM Object CO SAN, sau khi da tao ghi chu — khong
 * bao gio tu tao Customer/Contact/Deal/Project moi (AC11).
 */
export function QuickNoteRelations({
  relations,
  onChange,
}: {
  relations: QuickNoteRelation[];
  onChange: (relations: { object_type: QuickNoteRelationType; object_id: number }[]) => void;
}) {
  const [type, setType] = useState<QuickNoteRelationType>('customer');
  const [selected, setSelected] = useState<number | ''>('');

  const { data: customers = [] } = useCustomerOptions(type === 'customer');
  const { data: contacts = [] } = useAssignees();
  const { data: deals = [] } = useDealOptions(type === 'deal');
  const { data: projects = [] } = useProjectOptions(type === 'project');

  const options: ComboboxOption[] =
    type === 'customer'
      ? customers.map((c) => ({ id: c.id, label: c.name }))
      : type === 'contact'
        ? contacts.map((c) => ({ id: c.id, label: c.full_name, sublabel: c.org_name }))
        : type === 'deal'
          ? deals.map((d) => ({ id: d.id, label: d.title, sublabel: d.customer_name }))
          : projects.map((p) => ({ id: p.id, label: p.name }));

  const addRelation = () => {
    if (selected === '') return;
    if (relations.some((r) => r.object_type === type && r.object_id === selected)) return;
    onChange([
      ...relations.map((r) => ({ object_type: r.object_type, object_id: r.object_id })),
      { object_type: type, object_id: selected },
    ]);
    setSelected('');
  };

  const removeRelation = (target: QuickNoteRelation) => {
    onChange(
      relations
        .filter((r) => r.id !== target.id)
        .map((r) => ({ object_type: r.object_type, object_id: r.object_id }))
    );
  };

  return (
    <div>
      {relations.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {relations.map((r) => (
            <span
              key={r.id}
              className="inline-flex items-center gap-1 rounded-full bg-tr-hover px-2.5 py-1 text-xs text-tr-text"
            >
              <Link2 size={11} className="text-tr-primary" aria-hidden="true" />
              {TYPE_OPTIONS.find((t) => t.value === r.object_type)?.label} ·{' '}
              {r.object_label ?? `#${r.object_id}`}
              <button
                type="button"
                aria-label={`Bỏ liên kết ${r.object_label ?? ''}`}
                onClick={() => removeRelation(r)}
                className="rounded-full p-0.5 hover:bg-tr-hover-strong"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <Segmented value={type} onChange={setType} options={TYPE_OPTIONS} label="Loại đối tượng" />
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <Combobox
              value={selected}
              onChange={setSelected}
              options={options}
              placeholder="— Chọn bản ghi —"
              ariaLabel="Chọn bản ghi để gắn"
            />
          </div>
          <Button size="sm" onClick={addRelation} disabled={selected === ''} className="shrink-0">
            Gắn
          </Button>
        </div>
      </div>
    </div>
  );
}
