import { useMemo, useState } from 'react';
import { ListFilter } from 'lucide-react';
import { Popover, usePopover } from '../common/Popover';
import { Input, focusRing } from '../common/ui';
import { foldText } from '../../lib/format';
import type { RevenueCustomerOption } from '../../types';

/**
 * Nút lọc ở tiêu đề cột Khách hàng của bảng doanh thu, kiểu bộ lọc cột của
 * Excel: tìm theo tên, tích chọn nhiều khách. Chọn rỗng = không lọc.
 */
export function RevenueCustomerFilter({
  options,
  selected,
  onChange,
}: {
  options: RevenueCustomerOption[];
  selected: number[];
  onChange: (next: number[]) => void;
}) {
  const popover = usePopover();
  const [query, setQuery] = useState('');
  const chosen = useMemo(() => new Set(selected), [selected]);
  const visible = useMemo(() => {
    const q = foldText(query.trim());
    return q ? options.filter((o) => foldText(o.name).includes(q)) : options;
  }, [options, query]);

  const toggle = (id: number) =>
    onChange(chosen.has(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  /* "Chọn các mục đang hiện": cộng thêm vào lựa chọn sẵn có, không thay thế. */
  const selectVisible = () => onChange([...new Set([...selected, ...visible.map((o) => o.id)])]);

  const active = selected.length > 0;
  return (
    <>
      <button
        type="button"
        onClick={popover.show}
        aria-label={active ? `Lọc khách hàng: đang chọn ${selected.length}` : 'Lọc khách hàng'}
        title="Lọc khách hàng"
        className={`inline-flex items-center gap-1 rounded-control-inner px-1 py-0.5 text-xs transition hover:bg-tr-hover ${active ? 'font-semibold text-tr-primary' : 'text-tr-muted hover:text-tr-primary'} ${focusRing}`}
      >
        <ListFilter size={14} aria-hidden="true" />
        {active && <span className="tabular-nums">{selected.length}</span>}
      </button>
      <Popover
        open={popover.open}
        anchor={popover.anchor}
        onClose={() => {
          popover.close();
          setQuery('');
        }}
        title="Lọc khách hàng"
        width={320}
      >
        <div className="flex min-h-0 flex-col gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm khách hàng…"
            aria-label="Tìm khách hàng trong bộ lọc"
          />
          <div className="flex items-center justify-between text-xs text-tr-muted">
            <button
              type="button"
              onClick={selectVisible}
              disabled={visible.length === 0}
              className={`rounded-control-inner px-1 py-0.5 hover:text-tr-primary disabled:opacity-50 ${focusRing}`}
            >
              {query ? `Chọn ${visible.length} mục đang hiện` : 'Chọn tất cả'}
            </button>
            <button
              type="button"
              onClick={() => onChange([])}
              disabled={!active}
              className={`rounded-control-inner px-1 py-0.5 hover:text-tr-primary disabled:opacity-50 ${focusRing}`}
            >
              Bỏ lọc
            </button>
          </div>
          <ul className="-mx-1" aria-label="Danh sách khách hàng">
            {visible.length === 0 ? (
              <li className="px-2 py-3 text-center text-sm text-tr-muted">
                Không có khách hàng phù hợp
              </li>
            ) : (
              visible.map((o) => (
                <li key={o.id}>
                  <label className="flex min-h-9 cursor-pointer items-center gap-2 rounded-control px-2 py-1 text-sm text-tr-text hover:bg-tr-hover">
                    <input
                      type="checkbox"
                      checked={chosen.has(o.id)}
                      onChange={() => toggle(o.id)}
                      className="h-4 w-4 shrink-0 rounded border-tr-border"
                    />
                    <span className="min-w-0 flex-1 truncate">{o.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-tr-muted">
                      {o.line_count}
                    </span>
                  </label>
                </li>
              ))
            )}
          </ul>
        </div>
      </Popover>
    </>
  );
}
