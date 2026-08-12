import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Modal } from '../common/Modal';
import { Button, Input, Select } from '../common/ui';
import { REVENUE_STAGE_COLORS, REVENUE_STAGE_ORDER, REVENUE_STAGE_TINTS, t } from '../../i18n/vi';
import { formatVND, formatVNDInput, formatVNDShort, parseVNDInput } from '../../lib/format';
import { invalidateRevenueViews } from '../../lib/queryKeys';
import type { RevenueLine, RevenueStage } from '../../types';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

interface Row {
  amount_vnd: number;
  forecast_vnd: number;
  stage: RevenueStage;
  note: string;
}

function emptyRow(): Row {
  return { amount_vnd: 0, forecast_vnd: 0, stage: 'forecast', note: '' };
}

function period(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Nhập doanh thu 12 tháng của một dòng: số dự kiến, số thực tế và trạng thái từng tháng. */
export function MonthlyRevenueModal({
  open,
  onClose,
  line,
  year,
}: {
  open: boolean;
  onClose: () => void;
  line: RevenueLine | null;
  year: number;
}) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<Row[]>(() => MONTHS.map(emptyRow));

  useEffect(() => {
    if (!open || !line) return;
    setRows(
      MONTHS.map((m) => {
        const cell = line.months[period(year, m)];
        return cell
          ? {
              amount_vnd: cell.amount_vnd,
              forecast_vnd: cell.forecast_vnd,
              stage: cell.stage,
              note: cell.note ?? '',
            }
          : emptyRow();
      })
    );
  }, [open, line?.id, year]);

  const save = useMutation({
    mutationFn: () =>
      api.put(`/api/revenues/lines/${line!.id}/revenue-bulk`, {
        cells: rows.map((row, i) => ({ ...row, period: period(year, i + 1) })),
      }),
    onSuccess: () => {
      invalidateRevenueViews(queryClient, line?.customer_id);
      onClose();
    },
  });

  const totals = useMemo(() => {
    const sum = { amount: 0, forecast: 0 };
    for (const row of rows) {
      sum.amount += row.amount_vnd;
      sum.forecast += row.forecast_vnd;
    }
    return sum;
  }, [rows]);

  const setRow = (index: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  /** Đặt trạng thái cho mọi tháng đã có số tiền — dùng khi cả năm cùng bước một giai đoạn. */
  const setStageForAll = (stage: RevenueStage) =>
    setRows((rs) => rs.map((r) => (r.amount_vnd > 0 ? { ...r, stage } : r)));

  if (!line) return null;

  const variance = totals.amount - totals.forecast;

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-4xl"
      title={
        <span className="flex flex-wrap items-baseline gap-2">
          {t.revenue.enterMonths} — {year}
          <span className="text-sm font-normal text-tr-muted">
            {line.customer_name}
            {line.service_name ? ` · ${line.service_name}` : ''}
          </span>
        </span>
      }
      footer={
        <>
          <Button onClick={onClose}>{t.common.cancel}</Button>
          <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>
            {t.common.save}
          </Button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-tr-subtle">
        <span className="font-medium">Đặt trạng thái cho mọi tháng có số liệu:</span>
        {REVENUE_STAGE_ORDER.map((stage) => (
          <button
            key={stage}
            onClick={() => setStageForAll(stage)}
            className="inline-flex items-center gap-1 rounded border border-tr-border px-2 py-0.5 transition hover:bg-tr-hover"
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: REVENUE_STAGE_COLORS[stage] }}
            />
            {t.revenueStage[stage]}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-tr-border">
        <table className="w-full text-sm">
          <thead className="bg-tr-surface text-xs text-tr-subtle">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-semibold">
                {t.revenue.month}
              </th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">
                {t.revenue.forecast}
              </th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">
                {t.revenue.amount}
              </th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">
                Chênh lệch
              </th>
              <th scope="col" className="px-2 py-2 text-left font-semibold">
                {t.revenue.stage}
              </th>
              <th scope="col" className="px-2 py-2 text-left font-semibold">
                Ghi chú
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-tr-border">
            {rows.map((row, i) => {
              const diff = row.amount_vnd - row.forecast_vnd;
              return (
                <tr key={i} style={{ backgroundColor: REVENUE_STAGE_TINTS[row.stage] }}>
                  <td className="px-3 py-1.5 font-medium whitespace-nowrap text-tr-text">
                    {t.revenue.month} {i + 1}
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      inputMode="numeric"
                      value={formatVNDInput(row.forecast_vnd)}
                      onChange={(e) => setRow(i, { forecast_vnd: parseVNDInput(e.target.value) })}
                      placeholder="0"
                      className="w-28 px-2 py-1 text-right text-sm tabular-nums"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      inputMode="numeric"
                      value={formatVNDInput(row.amount_vnd)}
                      onChange={(e) => setRow(i, { amount_vnd: parseVNDInput(e.target.value) })}
                      placeholder="0"
                      className="w-28 px-2 py-1 text-right text-sm tabular-nums"
                    />
                  </td>
                  <td
                    className={`px-2 py-1.5 text-right text-xs tabular-nums ${
                      diff === 0 ? 'text-tr-muted' : diff > 0 ? 'text-tr-success' : 'text-tr-danger'
                    }`}
                  >
                    {diff === 0 ? '—' : `${diff > 0 ? '+' : ''}${formatVNDShort(diff)}`}
                  </td>
                  <td className="px-2 py-1.5">
                    <Select
                      value={row.stage}
                      onChange={(e) => setRow(i, { stage: e.target.value as RevenueStage })}
                      className="w-40 py-1 text-sm"
                    >
                      {REVENUE_STAGE_ORDER.map((stage) => (
                        <option key={stage} value={stage}>
                          {t.revenueStage[stage]}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      value={row.note}
                      onChange={(e) => setRow(i, { note: e.target.value })}
                      className="px-2 py-1 text-sm"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-tr-surface font-semibold">
            <tr>
              <td className="px-3 py-2 text-tr-subtle">{t.revenue.grandTotal}</td>
              <td className="px-2 py-2 text-right tabular-nums text-tr-subtle">
                {formatVND(totals.forecast)}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-tr-text">
                {formatVND(totals.amount)}
              </td>
              <td
                className={`px-2 py-2 text-right text-xs tabular-nums ${
                  variance === 0
                    ? 'text-tr-muted'
                    : variance > 0
                      ? 'text-tr-success'
                      : 'text-tr-danger'
                }`}
              >
                {variance === 0 ? '—' : `${variance > 0 ? '+' : ''}${formatVNDShort(variance)}`}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-2 text-xs text-tr-muted">
        Số tiền không nhân đôi giữa các giai đoạn: mỗi tháng chỉ có một khoản doanh thu, trạng thái
        cho biết khoản đó đang ở bước nào.
      </p>
    </Modal>
  );
}
