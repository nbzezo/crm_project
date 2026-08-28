import { Table2 } from 'lucide-react';
import { focusRing } from './ui';

export interface ChartRow {
  name: string;
  value: string;
}

/**
 * Bang so lieu di kem mot bieu do.
 *
 * Truoc day ReportsPage co mot ban `sr-only` (ChartSrData) — dung huong, nhung
 * chi phuc vu trinh doc man hinh. Nguoi dung ban phim SANG MAT van khong co
 * duong nao xem duoc con so: tooltip cua recharts chi bat khi re chuot, con SVG
 * thi khong Tab toi duoc. Hai trang con lai (Doanh thu, Ma tran co hoi) khong
 * co gi ca.
 *
 * Mo ra thanh `<details>` nhin thay duoc phuc vu ca hai nhom bang mot lop duy
 * nhat, va van la cung mang du lieu da dung de ve bieu do nen khong the lech.
 * Dong lai theo mac dinh de khong lam loang trang bao cao.
 */
export function ChartDataTable({
  caption,
  rows,
  valueLabel = 'Giá trị',
}: {
  caption: string;
  rows: ChartRow[];
  valueLabel?: string;
}) {
  if (rows.length === 0) return null;

  return (
    <details className="mt-1.5">
      <summary
        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-control px-1.5 py-1 text-xs text-tr-muted transition hover:text-tr-text ${focusRing}`}
      >
        <Table2 size={13} aria-hidden="true" />
        Xem dạng bảng
      </summary>
      {/* Bang co the dai hon panel — cho no tu cuon thay vi day panel gian ra. */}
      <div className="tr-scroll mt-2 max-h-56 overflow-auto rounded-control border border-tr-border">
        <table className="w-full text-xs">
          <caption className="sr-only">{caption}</caption>
          <thead className="tr-table-head sticky top-0 bg-tr-surface text-left text-tr-subtle">
            <tr>
              <th scope="col" className="px-2.5 py-1.5 font-semibold">
                Mục
              </th>
              <th scope="col" className="px-2.5 py-1.5 text-right font-semibold">
                {valueLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="border-t border-tr-border">
                <th scope="row" className="px-2.5 py-1.5 font-normal text-tr-text">
                  {row.name}
                </th>
                <td className="px-2.5 py-1.5 text-right tabular-nums text-tr-subtle">
                  {row.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
