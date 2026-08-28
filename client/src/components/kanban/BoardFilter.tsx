import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Combobox } from '../common/Combobox';
import { Popover } from '../common/Popover';
import { selectOptionContrast } from '../common/ui';
import { LabelModeToggle } from '../labels/LabelFilter';
import { PRIORITY_COLORS, PRIORITY_ORDER, t } from '../../i18n/vi';
import { contrastInk } from '../../lib/format';
import { useUiStore, type BoardFilters } from '../../stores/uiStore';
import { useAssignees } from '../tasks/AssigneePicker';
import { CARD_STATUSES } from '@workflow/contracts';
import type { CardStatus, Customer, Label, Priority } from '../../types';

/** `<select>` chỉ trả chuỗi — đưa về đúng kiểu ba nhánh của bộ lọc. */
export function parseAssigneeFilter(raw: string): BoardFilters['assignee'] {
  if (raw === '' || raw === 'mine' || raw === 'none') return raw;
  return Number(raw);
}

export function BoardFilter({
  open,
  anchor,
  onClose,
  labels,
}: {
  open: boolean;
  anchor: HTMLElement | null;
  onClose: () => void;
  labels: Label[];
}) {
  const filters = useUiStore((s) => s.boardFilters);
  const setFilters = useUiStore((s) => s.setBoardFilters);
  const reset = useUiStore((s) => s.resetBoardFilters);

  const { data: customers = [] } = useQuery({
    queryKey: ['customers', 'select'],
    queryFn: () => api.get<Customer[]>('/api/customers'),
    staleTime: 60_000,
    enabled: open,
  });
  const { data: assignees = [] } = useAssignees();

  const toggleLabel = (id: number) =>
    setFilters({
      labelIds: filters.labelIds.includes(id)
        ? filters.labelIds.filter((x) => x !== id)
        : [...filters.labelIds, id],
    });

  const togglePriority = (p: Priority) =>
    setFilters({
      priorities: filters.priorities.includes(p)
        ? filters.priorities.filter((x) => x !== p)
        : [...filters.priorities, p],
    });

  return (
    <Popover open={open} anchor={anchor} onClose={onClose} title="Bộ lọc" width={340}>
      <div className="space-y-4">
        <Section title="Từ khóa">
          <input
            value={filters.q}
            onChange={(e) => setFilters({ q: e.target.value })}
            placeholder="Tìm trong thẻ (không cần dấu)…"
            className="w-full rounded border border-tr-border px-2.5 py-1.5 text-sm outline-none focus:border-tr-primary"
          />
        </Section>

        <Section title="Trạng thái">
          {(
            [
              ['all', t.common.all],
              ['open', t.common.open],
              ['done', t.common.done],
            ] as const
          ).map(([value, label]) => (
            <Row
              key={value}
              checked={filters.status === value}
              onToggle={() => setFilters({ status: value })}
              type="radio"
            >
              {label}
            </Row>
          ))}
        </Section>

        <Section title={t.card.dueDate}>
          {(
            [
              ['', 'Bất kỳ'],
              ['overdue', t.common.overdue],
              ['today', 'Đến hạn hôm nay'],
              ['week', 'Trong 7 ngày tới'],
              ['none', 'Không có ngày hạn'],
            ] as const
          ).map(([value, label]) => (
            <Row
              key={value}
              checked={filters.due === value}
              onToggle={() => setFilters({ due: value })}
              type="radio"
            >
              {label}
            </Row>
          ))}
        </Section>

        <Section title={t.card.priority}>
          {PRIORITY_ORDER.map((p) => (
            <Row
              key={p}
              checked={filters.priorities.includes(p)}
              onToggle={() => togglePriority(p)}
            >
              <span className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: PRIORITY_COLORS[p] }}
                />
                {t.priority[p]}
              </span>
            </Row>
          ))}
        </Section>

        {labels.length > 0 && (
          <Section title={t.card.labels}>
            {/* FR-TAG-22: VÀ/HOẶC — mặc định HOẶC, đúng như bộ lọc trước đây */}
            <div className="mb-1.5">
              <LabelModeToggle
                mode={filters.labelMode}
                disabled={filters.labelIds.length < 2}
                onChange={(labelMode) => setFilters({ labelMode })}
              />
            </div>
            {labels.map((label) => (
              <Row
                key={label.id}
                checked={filters.labelIds.includes(label.id)}
                onToggle={() => toggleLabel(label.id)}
              >
                <span
                  className="inline-flex min-h-6 min-w-24 items-center rounded px-2 text-xs font-medium"
                  style={{ backgroundColor: label.color, color: contrastInk(label.color) }}
                >
                  {label.name}
                </span>
              </Row>
            ))}
          </Section>
        )}

        {/* Vòng đời tách khỏi "Trạng thái" ở trên: cái kia là xong/chưa xong,
            cái này là việc đang nằm ở đâu trong quy trình. */}
        <Section title="Vòng đời công việc">
          <select
            value={filters.cardStatus}
            onChange={(e) => setFilters({ cardStatus: e.target.value as CardStatus | '' })}
            className={`w-full rounded border border-tr-border px-2.5 py-1.5 text-sm outline-none focus:border-tr-primary ${selectOptionContrast}`}
          >
            <option value="">Mọi vòng đời</option>
            {CARD_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t.cardStatus[status]}
              </option>
            ))}
          </select>
        </Section>

        <Section title={t.card.assignee}>
          <select
            value={filters.assignee}
            onChange={(e) => setFilters({ assignee: parseAssigneeFilter(e.target.value) })}
            className={`w-full rounded border border-tr-border px-2.5 py-1.5 text-sm outline-none focus:border-tr-primary ${selectOptionContrast}`}
          >
            <option value="">Mọi người</option>
            <option value="mine">{t.card.mine}</option>
            <option value="none">{t.card.unassigned}</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.full_name} · {a.org_name}
              </option>
            ))}
          </select>
        </Section>

        <Section title={t.card.customer}>
          <Combobox
            value={filters.customerId}
            onChange={(v) => setFilters({ customerId: v })}
            options={customers.map((c) => ({ id: c.id, label: c.name }))}
            placeholder="Mọi khách hàng"
            searchPlaceholder="Tìm khách hàng…"
            emptyText="Không tìm thấy khách hàng."
            ariaLabel={t.card.customer}
          />
        </Section>

        <button
          onClick={reset}
          className="w-full rounded-compact bg-tr-hover py-1.5 text-sm font-medium text-tr-subtle transition hover:bg-tr-hover-strong"
        >
          Xóa bộ lọc
        </button>
      </div>
    </Popover>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold text-tr-subtle">{title}</h3>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Row({
  checked,
  onToggle,
  children,
  type = 'checkbox',
}: {
  checked: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  type?: 'checkbox' | 'radio';
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm text-tr-text transition hover:bg-tr-hover">
      <input
        type={type}
        checked={checked}
        onChange={onToggle}
        className="h-4 w-4 border-tr-border text-tr-primary"
      />
      {children}
    </label>
  );
}
