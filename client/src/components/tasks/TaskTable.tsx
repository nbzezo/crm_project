import { useEffect, useMemo, useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  CornerDownRight,
  Trash2,
} from 'lucide-react';
import { api } from '../../api/client';
import { Button, EmptyState, InlineDate, focusRing } from '../common/ui';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { PRIORITY_COLORS, PRIORITY_ORDER, t } from '../../i18n/vi';
import { isOverdue } from '../../lib/format';
import { invalidateCardViews } from '../../lib/queryKeys';
import { undoableDelete } from '../../lib/undo';
import { useUiStore } from '../../stores/uiStore';
import type { Label, Priority, TaskRow } from '../../types';

const columnHelper = createColumnHelper<TaskRow>();
const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
const PAGE_SIZE = 50;

/** Dạng bảng tính: sắp xếp theo cột, sửa trực tiếp trong ô, chọn nhiều để xử lý hàng loạt. */
export function TaskTable({
  tasks,
  onChanged,
  onClearFilters,
}: {
  tasks: TaskRow[];
  onChanged?: () => void;
  onClearFilters?: () => void;
}) {
  const queryClient = useQueryClient();
  const openCard = useUiStore((s) => s.openCard);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'due_date', desc: false }]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  /** Dong dang cho het gio hoan tac — an khoi bang nhung chua goi API xoa. */
  const [pendingDelete, setPendingDelete] = useState<Set<number>>(new Set());

  const { data: labels = [] } = useQuery({
    queryKey: ['labels'],
    queryFn: () => api.get<Label[]>('/api/labels'),
    staleTime: 5 * 60_000,
  });

  const update = useMutation({
    mutationFn: (vars: { id: number; patch: Record<string, unknown> }) =>
      api.patch(`/api/cards/${vars.id}`, vars.patch),
    onSuccess: () => {
      invalidateCardViews(queryClient);
      onChanged?.();
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/api/cards/${id}`),
    onSuccess: () => {
      invalidateCardViews(queryClient);
      onChanged?.();
    },
  });

  // update.mutate giu nguyen tham chieu giua cac lan render, con chinh object
  // `update` thi khong — dua ca object vao deps se dung lai toan bo cot moi render.
  const mutate = update.mutate;

  /* Bo chon nhung dong da bien mat khoi ket qua sau khi loc/xoa. */
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const alive = new Set(tasks.map((task) => task.id));
      const next = new Set([...prev].filter((id) => alive.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [tasks]);

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'select',
        header: () => null,
        cell: (info) => (
          <input
            type="checkbox"
            checked={selected.has(info.row.original.id)}
            onChange={(e) =>
              setSelected((prev) => {
                const next = new Set(prev);
                if (e.target.checked) next.add(info.row.original.id);
                else next.delete(info.row.original.id);
                return next;
              })
            }
            aria-label={`Chọn: ${info.row.original.title}`}
            className="h-4 w-4 rounded-control border-tr-border accent-tr-primary"
          />
        ),
      }),
      columnHelper.accessor('is_done', {
        header: () => <span className="sr-only">{t.common.done}</span>,
        enableSorting: false,
        cell: (info) => (
          <input
            type="checkbox"
            checked={!!info.getValue()}
            onChange={(e) => mutate({ id: info.row.original.id, patch: { is_done: e.target.checked } })}
            aria-label={`${t.card.markDone}: ${info.row.original.title}`}
            className="h-4 w-4 rounded-control border-tr-border accent-tr-primary"
          />
        ),
      }),
      columnHelper.accessor('title', {
        header: 'Tiêu đề',
        cell: (info) => (
          <button
            type="button"
            onClick={() => openCard(info.row.original.id)}
            className={`flex max-w-md items-center gap-1.5 truncate text-left font-medium ${focusRing} ${
              info.row.original.is_done ? 'text-tr-muted line-through' : 'text-tr-text'
            } hover:text-tr-primary hover:underline`}
          >
            {info.row.original.parent_id && (
              <CornerDownRight size={13} className="shrink-0 text-tr-muted" aria-hidden="true" />
            )}
            {info.getValue()}
            {(info.row.original.subtask_total ?? 0) > 0 && (
              <span className="shrink-0 rounded-control bg-tr-hover-strong px-1.5 text-2xs text-tr-subtle">
                {info.row.original.subtask_done}/{info.row.original.subtask_total}
              </span>
            )}
          </button>
        ),
      }),
      columnHelper.accessor('board_name', { header: 'Bảng' }),
      columnHelper.accessor('list_name', { header: 'Danh sách' }),
      columnHelper.accessor('customer_name', {
        header: t.card.customer,
        cell: (info) => info.getValue() ?? '—',
      }),
      columnHelper.accessor('priority', {
        header: t.card.priority,
        sortingFn: (a, b) => PRIORITY_RANK[a.original.priority] - PRIORITY_RANK[b.original.priority],
        cell: (info) => (
          <select
            value={info.getValue()}
            onChange={(e) => mutate({ id: info.row.original.id, patch: { priority: e.target.value } })}
            aria-label={`${t.card.priority}: ${info.row.original.title}`}
            className={`rounded-control border border-transparent bg-transparent px-1 py-0.5 text-xs hover:border-tr-border ${focusRing}`}
            style={{ color: PRIORITY_COLORS[info.getValue()] }}
          >
            {PRIORITY_ORDER.map((p) => (
              <option key={p} value={p} className="text-tr-text">
                {t.priority[p]}
              </option>
            ))}
          </select>
        ),
      }),
      columnHelper.accessor('start_date', {
        header: t.card.startDate,
        cell: (info) => (
          <InlineDate
            value={info.getValue()}
            onChange={(v) => mutate({ id: info.row.original.id, patch: { start_date: v } })}
          />
        ),
      }),
      columnHelper.accessor('due_date', {
        header: t.card.dueDate,
        cell: (info) => (
          <InlineDate
            value={info.getValue()}
            highlight={isOverdue(info.getValue(), info.row.original.is_done)}
            onChange={(v) => mutate({ id: info.row.original.id, patch: { due_date: v } })}
          />
        ),
      }),
      columnHelper.accessor('label_ids', {
        header: t.card.labels,
        enableSorting: false,
        cell: (info) => (
          <div className="flex gap-1">
            {(info.getValue() ?? []).map((id) => {
              const label = labels.find((l) => l.id === id);
              if (!label) return null;
              return (
                /* Mau khong phai kenh truyen tin duy nhat: ten nhan van doc duoc
                   bang trinh doc man hinh, khong chi nam trong thuoc tinh title. */
                <span key={id} title={label.name} className="inline-flex items-center">
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: label.color }}
                  />
                  <span className="sr-only">{label.name}</span>
                </span>
              );
            })}
          </div>
        ),
      }),
    ],
    [labels, openCard, mutate, selected]
  );

  const visibleTasks = useMemo(
    () => (pendingDelete.size === 0 ? tasks : tasks.filter((task) => !pendingDelete.has(task.id))),
    [tasks, pendingDelete]
  );

  const table = useReactTable({
    data: visibleTasks,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    // Phan trang giu so o nhap trong DOM o muc co dinh: truoc day 500 cong viec
    // dung nghia 500 checkbox + 500 select + 1000 o ngay, go chu bi giat.
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: PAGE_SIZE } },
  });

  const pageRows = table.getRowModel().rows;
  const allOnPageSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(r.original.id));

  const bulkSet = (patch: Record<string, unknown>) => {
    selected.forEach((id) => mutate({ id, patch }));
    setSelected(new Set());
  };

  if (tasks.length === 0) {
    return (
      <EmptyState
        message="Không có công việc nào khớp bộ lọc."
        hint="Thử nới bộ lọc hoặc thêm công việc mới từ bảng Kanban."
        action={onClearFilters && <Button onClick={onClearFilters}>{t.common.clearFilter}</Button>}
      />
    );
  }

  return (
    <>
      {/* Thanh hanh dong hang loat — truoc day xoa 20 viec la 20 lan xac nhan. */}
      {selected.size > 0 && (
        <div
          role="region"
          aria-label="Thao tác hàng loạt"
          className="mb-2 flex flex-wrap items-center gap-2 rounded-panel border border-tr-primary/40 bg-tr-primary/10 px-3 py-2 text-sm"
        >
          <span className="font-medium text-tr-text">
            {selected.size} {t.common.selected}
          </span>
          <Button size="sm" onClick={() => bulkSet({ is_done: true })}>
            {t.card.markDone}
          </Button>
          <Button size="sm" onClick={() => bulkSet({ is_done: false })}>
            {t.card.markUndone}
          </Button>
          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) bulkSet({ priority: e.target.value });
              e.target.value = '';
            }}
            aria-label={`Đổi ${t.card.priority.toLowerCase()} cho mục đã chọn`}
            className={`rounded-control border border-tr-border bg-tr-panel px-2 py-1 text-xs text-tr-text ${focusRing}`}
          >
            <option value="">{t.card.priority}…</option>
            {PRIORITY_ORDER.map((p) => (
              <option key={p} value={p}>
                {t.priority[p]}
              </option>
            ))}
          </select>
          <Button size="sm" variant="danger" onClick={() => setConfirmBulkDelete(true)}>
            <Trash2 size={13} aria-hidden="true" /> {t.common.delete}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            {t.common.clearSelection}
          </Button>
        </div>
      )}

      <div className="tr-scroll overflow-x-auto rounded-panel border border-tr-border bg-tr-panel shadow-sm">
        <table className="w-full text-sm">
          <caption className="sr-only">Danh sách công việc</caption>
          <thead className="bg-tr-surface text-left text-xs tracking-wide text-tr-subtle uppercase">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      scope="col"
                      key={header.id}
                      aria-sort={
                        sorted === 'asc'
                          ? 'ascending'
                          : sorted === 'desc'
                            ? 'descending'
                            : header.column.getCanSort()
                              ? 'none'
                              : undefined
                      }
                      className="px-3 py-2.5 whitespace-nowrap"
                    >
                      {header.id === 'select' ? (
                        <input
                          type="checkbox"
                          checked={allOnPageSelected}
                          onChange={(e) =>
                            setSelected((prev) => {
                              const next = new Set(prev);
                              pageRows.forEach((r) =>
                                e.target.checked
                                  ? next.add(r.original.id)
                                  : next.delete(r.original.id)
                              );
                              return next;
                            })
                          }
                          aria-label={t.common.selectAll}
                          className="h-4 w-4 rounded-control border-tr-border accent-tr-primary"
                        />
                      ) : header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={`inline-flex items-center gap-1 rounded-control hover:text-tr-text ${focusRing}`}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === 'asc' ? (
                            <ArrowUp size={12} aria-hidden="true" />
                          ) : sorted === 'desc' ? (
                            <ArrowDown size={12} aria-hidden="true" />
                          ) : (
                            <ChevronsUpDown size={12} className="opacity-40" aria-hidden="true" />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-tr-border">
            {pageRows.map((row) => (
              <tr
                key={row.id}
                className={`transition hover:bg-tr-hover ${
                  selected.has(row.original.id) ? 'bg-tr-primary/10' : ''
                }`}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2 whitespace-nowrap text-tr-subtle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-tr-muted">
        <span>
          {t.table.showing} {pageRows.length}/{tasks.length} {t.table.tasks}
        </span>
        {table.getPageCount() > 1 && (
          <nav aria-label="Phân trang" className="ml-auto flex items-center gap-1">
            <Button
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Trang trước"
            >
              <ChevronLeft size={14} aria-hidden="true" />
            </Button>
            <span aria-live="polite">
              Trang {table.getState().pagination.pageIndex + 1}/{table.getPageCount()}
            </span>
            <Button
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Trang sau"
            >
              <ChevronRight size={14} aria-hidden="true" />
            </Button>
          </nav>
        )}
      </div>

      <ConfirmDialog
        open={confirmBulkDelete}
        message={`Xóa ${selected.size} công việc đã chọn? Việc con bên trong cũng bị xóa.`}
        onCancel={() => setConfirmBulkDelete(false)}
        onConfirm={() => {
          setConfirmBulkDelete(false);
          const ids = [...selected];
          setSelected(new Set());
          setPendingDelete((prev) => new Set([...prev, ...ids]));
          undoableDelete({
            message: `Đã xóa ${ids.length} công việc`,
            commit: () => ids.forEach((id) => remove.mutate(id)),
            revert: () =>
              setPendingDelete((prev) => {
                const next = new Set(prev);
                ids.forEach((id) => next.delete(id));
                return next;
              }),
          });
        }}
      />
    </>
  );
}
