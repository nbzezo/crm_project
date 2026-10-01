import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, CircleCheck, Download, FileSpreadsheet, Plus, RefreshCw } from 'lucide-react';
import { api, qs } from '../../api/client';
import { Modal } from '../common/Modal';
import { Button, FormError, TableHead, focusRing } from '../common/ui';
import { t } from '../../i18n/vi';
import { formatVND, formatVNDInput } from '../../lib/format';
import { formatPeriod } from '../../lib/revenue';

interface ImportRow {
  row: number;
  action: 'create' | 'update' | 'error';
  line_id: number | null;
  customer_name: string | null;
  service_name: string | null;
  months: number;
  amount_vnd: number;
  baseline: number | null;
  anchor: { mode: 'auto' | 'manual' | 'base'; period: string | null } | null;
  errors: string[];
}

interface ImportResult {
  year: number;
  year_from_file: boolean;
  committed: boolean;
  summary: {
    total: number;
    create: number;
    update: number;
    error: number;
    cells: number;
    amount_vnd: number;
  };
  rows: ImportRow[];
}

const ACTION_LABEL: Record<ImportRow['action'], string> = {
  create: 'Thêm mới',
  update: 'Cập nhật',
  error: 'Lỗi',
};

function anchorText(anchor: ImportRow['anchor']): string {
  if (!anchor) return '';
  if (anchor.mode === 'base') return 'Mốc: toàn bộ là Nền';
  if (anchor.mode === 'manual') return `Mốc: ${formatPeriod(anchor.period)}`;
  return 'Mốc: tự động';
}

/**
 * Nhập doanh thu từ Excel: tải file mẫu (điền sẵn các dòng đang có) → điền →
 * tải lên để xem trước từng dòng → xác nhận mới ghi. Dòng lỗi được bỏ qua.
 */
export function RevenueImportDialog({
  year,
  filters,
  onClose,
}: {
  year: number;
  filters: Record<string, string | undefined>;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);

  const send = (target: File, commit: boolean) => {
    const body = new FormData();
    body.append('file', target);
    return api.post<ImportResult>(
      `/api/revenues/import${qs({ year, commit: commit ? 1 : undefined })}`,
      body
    );
  };

  const preview = useMutation({ mutationFn: (target: File) => send(target, false) });
  const commit = useMutation({
    mutationFn: (target: File) => send(target, true),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['revenues'] }),
  });

  const result = commit.data ?? preview.data;
  const done = Boolean(commit.data);
  const okCount = result ? result.summary.create + result.summary.update : 0;
  const templateUrl = `/api/revenues/import-template.xlsx${qs({ year, ...filters })}`;

  const pick = (next: File | undefined) => {
    if (!next) return;
    setFile(next);
    commit.reset();
    preview.mutate(next);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Nhập doanh thu từ Excel"
      width="max-w-4xl"
      dirty={Boolean(preview.data) && !done}
      footer={
        done ? (
          <Button variant="primary" onClick={onClose}>
            Xong
          </Button>
        ) : (
          <>
            <Button onClick={onClose}>{t.common.cancel}</Button>
            <Button
              variant="primary"
              disabled={!file || !result || okCount === 0 || commit.isPending || preview.isPending}
              onClick={() => file && commit.mutate(file)}
            >
              {result && result.summary.error > 0
                ? `Nhập ${okCount} dòng hợp lệ, bỏ qua ${result.summary.error} dòng lỗi`
                : `Nhập ${okCount} dòng`}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4 text-sm">
        <ol className="space-y-2 text-tr-subtle">
          <li>
            <span className="font-medium text-tr-text">1. Tải file mẫu năm {year}</span> — đã điền
            sẵn các dòng doanh thu đang xem để sửa trực tiếp.{' '}
            <a
              href={templateUrl}
              className={`inline-flex items-center gap-1 rounded-control px-1 font-medium text-tr-primary hover:underline ${focusRing}`}
            >
              <Download size={14} aria-hidden="true" /> Tải file mẫu (.xlsx)
            </a>
          </li>
          <li>
            <span className="font-medium text-tr-text">2. Điền số liệu</span> — ô để trống là giữ
            nguyên; xoá dòng khỏi file không xoá dữ liệu. Xem sheet "Hướng dẫn" trong file.
          </li>
          <li>
            <span className="font-medium text-tr-text">3. Tải lên để xem trước</span>, kiểm tra rồi
            bấm nhập.
          </li>
        </ol>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            aria-label="Chọn file Excel doanh thu"
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <Button onClick={() => inputRef.current?.click()} disabled={commit.isPending}>
            <FileSpreadsheet size={15} aria-hidden="true" />
            {file ? 'Chọn file khác' : 'Chọn file Excel'}
          </Button>
          {file && <span className="truncate text-tr-muted">{file.name}</span>}
          {preview.isPending && <span className="text-tr-muted">Đang đọc file…</span>}
        </div>

        <FormError error={commit.error ?? preview.error} />

        {result && (
          <>
            {result.year !== year && (
              <p
                role="alert"
                className="rounded-control bg-tr-warning/10 px-3 py-2 text-xs text-tr-text"
              >
                File này là mẫu của năm {result.year} — số tiền T1–T12 sẽ ghi vào năm {result.year},
                không phải năm {year} đang xem.
              </p>
            )}
            <div
              role="status"
              className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-control border px-3 py-2 ${
                done ? 'border-tr-success/40 bg-tr-success/10' : 'border-tr-border bg-tr-surface'
              }`}
            >
              {done ? (
                <span className="flex items-center gap-1.5 font-medium text-tr-text">
                  <CircleCheck size={16} className="text-tr-success" aria-hidden="true" /> Đã nhập
                  xong
                </span>
              ) : (
                <span className="font-medium text-tr-text">Xem trước — chưa ghi gì</span>
              )}
              <span className="flex items-center gap-1 text-tr-subtle">
                <Plus size={14} aria-hidden="true" /> {result.summary.create} thêm mới
              </span>
              <span className="flex items-center gap-1 text-tr-subtle">
                <RefreshCw size={14} aria-hidden="true" /> {result.summary.update} cập nhật
              </span>
              <span
                className={`flex items-center gap-1 ${result.summary.error ? 'text-tr-danger' : 'text-tr-subtle'}`}
              >
                <CircleAlert size={14} aria-hidden="true" /> {result.summary.error} lỗi
              </span>
              <span className="text-tr-subtle">
                {result.summary.cells} ô tháng mới / thay đổi ·{' '}
                {formatVND(result.summary.amount_vnd)}
              </span>
            </div>

            {result.rows.length === 0 ? (
              <p className="text-tr-muted">File không có dòng dữ liệu nào.</p>
            ) : (
              <div className="tr-scroll max-h-[45vh] overflow-auto rounded-control border border-tr-border">
                <table className="w-full text-sm">
                  <TableHead className="sticky top-0 z-10">
                    <tr>
                      <th scope="col" className="px-3 py-2 text-right">
                        Dòng
                      </th>
                      <th scope="col" className="px-3 py-2">
                        Kết quả
                      </th>
                      <th scope="col" className="px-3 py-2">
                        Khách hàng · dịch vụ
                      </th>
                      <th scope="col" className="px-3 py-2 text-right whitespace-nowrap">
                        Ô thay đổi
                      </th>
                      <th scope="col" className="px-3 py-2 text-right">
                        Số tiền
                      </th>
                      <th scope="col" className="px-3 py-2">
                        Ghi chú
                      </th>
                    </tr>
                  </TableHead>
                  <tbody className="divide-y divide-tr-border">
                    {[...result.rows]
                      .sort((a, b) => Number(b.action === 'error') - Number(a.action === 'error'))
                      .map((row) => (
                        <tr
                          key={row.row}
                          className={row.action === 'error' ? 'bg-tr-danger/5' : ''}
                        >
                          <td className="px-3 py-1.5 text-right tabular-nums text-tr-muted">
                            {row.row}
                          </td>
                          <td className="px-3 py-1.5 whitespace-nowrap">
                            <span
                              className={
                                row.action === 'error'
                                  ? 'font-medium text-tr-danger'
                                  : row.action === 'create'
                                    ? 'text-tr-success'
                                    : 'text-tr-subtle'
                              }
                            >
                              {ACTION_LABEL[row.action]}
                            </span>
                          </td>
                          <td className="px-3 py-1.5">
                            <div className="text-tr-text">{row.customer_name ?? '—'}</div>
                            <div className="text-xs text-tr-muted">
                              {row.service_name ?? 'Chưa gán dịch vụ'}
                            </div>
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {row.months || '—'}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {row.months ? formatVNDInput(row.amount_vnd) || '0' : '—'}
                          </td>
                          <td className="px-3 py-1.5 text-xs">
                            {row.errors.length > 0 ? (
                              <ul className="list-disc space-y-0.5 pl-4 text-tr-danger">
                                {row.errors.map((e) => (
                                  <li key={e}>{e}</li>
                                ))}
                              </ul>
                            ) : (
                              <span className="text-tr-muted">
                                {[
                                  row.baseline !== null &&
                                    `TB năm trước ${formatVNDInput(row.baseline)}`,
                                  anchorText(row.anchor),
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
