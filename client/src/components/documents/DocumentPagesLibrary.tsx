import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { ArchiveRestore, FileText, FolderKanban, Target, Trash2, Users } from 'lucide-react';
import { api, qs } from '../../api/client';
import { EmptyState, ErrorState, Select, Skeleton, SkeletonRows, focusRing } from '../common/ui';
import { LoadMoreSentinel } from '../common/LoadMoreSentinel';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { MeetingNoteEditor } from '../crm/meetingNotes/MeetingNoteEditor';
import { DocumentTemplatePicker } from '../crm/meetingNotes/DocumentTemplatePicker';
import {
  DOCUMENT_TEMPLATES,
  createDocumentFromTemplate,
  documentPurposeLabel,
  type DocumentPurpose,
} from '../crm/meetingNotes/documentTemplates';
import { formatDateTime } from '../../lib/format';
import { useCustomerOptions } from '../../lib/useCrmOptions';
import { useUiStore } from '../../stores/uiStore';
import type { MeetingNote, MeetingNoteFacets, MeetingNoteListItem } from '../../types';
import { DocumentsToolbar, type LibraryView } from './DocumentsToolbar';
import { groupByRecency } from './recency';

type LinkFilter = '' | 'deal' | 'project' | 'none';
type SortKey = 'updated' | 'meeting';

const LINK_LABELS: Record<Exclude<LinkFilter, ''>, string> = {
  deal: 'Cơ hội',
  project: 'Dự án',
  none: 'Trang riêng',
};

/** Ngay gio SQLite (`YYYY-MM-DD HH:MM:SS`) → dang formatDateTime doc duoc. */
function sqlTime(value: string): string {
  return formatDateTime(value.replace(' ', 'T').slice(0, 16));
}

function ContextBadge({ note }: { note: MeetingNoteListItem }) {
  if (note.deal_id && note.deal_title) {
    return (
      <Link
        to={`/deals/${note.deal_id}`}
        className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-tr-primary/10 px-2 py-0.5 text-tr-primary hover:underline"
      >
        <Target size={11} aria-hidden="true" /> {note.deal_title}
      </Link>
    );
  }
  if (note.project_id && note.project_name) {
    return (
      <Link
        to={`/projects/${note.project_id}`}
        className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-tr-primary/10 px-2 py-0.5 text-tr-primary hover:underline"
      >
        <FolderKanban size={11} aria-hidden="true" /> {note.project_name}
      </Link>
    );
  }
  return <span className="italic">Trang riêng</span>;
}

/**
 * Tab "Trang tài liệu" cua trang Tai lieu (1.28.0). Thay cho MeetingNotesPanel o
 * che do "liet ke tat ca": tim, loc theo mau / noi gan / khach hang, nhom theo
 * thoi gian, tai dan khi cuon, thung rac. MeetingNotesPanel van dung cho tab ghi
 * chu trong mot Co hoi / Du an (it dong, khong can cac thu nay).
 *
 * Trang dang mo nam tren URL (`?open=<id>`): Back cua trinh duyet quay ve danh
 * sach, F5 va chia se link mo dung trang.
 */
export function DocumentPagesLibrary({
  term,
  onTermChange,
  query,
  crossHint,
  createOpen,
  onCreateOpenChange,
}: {
  term: string;
  onTermChange: (value: string) => void;
  /** Tu khoa da debounce — dung de goi API. */
  query: string;
  crossHint: ReactNode;
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const openId = Number(params.get('open')) || null;
  /* Vua tao (o day, hoac tu nut tao nhanh — QuickCreateFab) thi con tro vao
     trinh soan ngay. */
  const [newlyCreatedId, setNewlyCreatedId] = useState<number | null>(() =>
    (location.state as { created?: boolean } | null)?.created ? openId : null
  );

  const [view, setView] = useState<LibraryView>('active');
  const [purpose, setPurpose] = useState<DocumentPurpose | ''>('');
  const [linked, setLinked] = useState<LinkFilter>('');
  const [customerId, setCustomerId] = useState('');
  const [sort, setSort] = useState<SortKey>('updated');
  const { data: customers = [] } = useCustomerOptions();

  const filterParams = {
    q: query,
    purpose_key: purpose,
    linked,
    customer_id: customerId,
    sort,
    trash: view === 'trash' ? 1 : undefined,
  };
  const {
    data: pages,
    isLoading,
    error,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ['meeting-notes', 'library', filterParams],
    queryFn: ({ pageParam }) =>
      api.get<{ items: MeetingNoteListItem[]; next_cursor: string | null }>(
        `/api/meeting-notes/page${qs({ ...filterParams, cursor: pageParam, limit: 50 })}`
      ),
    initialPageParam: '',
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    enabled: openId === null,
  });
  const notes = useMemo(() => pages?.pages.flatMap((page) => page.items) ?? [], [pages]);
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const { data: facets } = useQuery({
    queryKey: ['meeting-notes', 'facets', { q: query, customerId, purpose, linked, view }],
    queryFn: () =>
      api.get<MeetingNoteFacets>(
        `/api/meeting-notes/facets${qs({
          q: query,
          customer_id: customerId,
          purpose_key: purpose,
          linked,
          trash: view === 'trash' ? 1 : undefined,
        })}`
      ),
    enabled: openId === null,
  });

  const { data: openNote, isLoading: openLoading } = useQuery({
    queryKey: ['meeting-notes', 'one', openId],
    queryFn: () => api.get<MeetingNote>(`/api/meeting-notes/${openId}`),
    enabled: openId !== null,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['meeting-notes'] });

  const openPage = (id: number) => {
    const next = new URLSearchParams(params);
    next.set('tab', 'pages');
    next.set('open', String(id));
    setParams(next, { state: { fromList: true } });
  };
  const closePage = () => {
    setNewlyCreatedId(null);
    void invalidate();
    // Mo tu danh sach: lui lai dung buoc lich su; vao thang bang link: bo `open`.
    if ((location.state as { fromList?: boolean } | null)?.fromList) {
      void navigate(-1);
      return;
    }
    const next = new URLSearchParams(params);
    next.delete('open');
    setParams(next, { replace: true });
  };

  const create = useMutation({
    mutationFn: (key: DocumentPurpose) =>
      api.post<MeetingNote>('/api/meeting-notes', {
        customer_id: customerId ? Number(customerId) : null,
        ...createDocumentFromTemplate(key),
      }),
    onSuccess: (note) => {
      queryClient.setQueryData(['meeting-notes', 'one', note.id], note);
      onCreateOpenChange(false);
      setNewlyCreatedId(note.id);
      setView('active');
      openPage(note.id);
    },
  });

  const restore = useMutation({
    mutationFn: (id: number) => api.post(`/api/meeting-notes/${id}/restore`),
    onSuccess: () => {
      void invalidate();
      pushToast('Đã khôi phục trang tài liệu', 'success');
    },
  });

  /* Xoa vinh vien: may chu huy ca tep dinh kem (vd. ghi am) tren o dia. */
  const [purgeTarget, setPurgeTarget] = useState<MeetingNoteListItem | null>(null);
  const purge = useMutation({
    mutationFn: (id: number) => api.del(`/api/meeting-notes/${id}/permanent`),
    onSuccess: () => {
      void invalidate();
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
      pushToast('Đã xoá vĩnh viễn trang tài liệu', 'success');
    },
    onError: (err) =>
      pushToast(err instanceof Error ? err.message : 'Không xoá được trang tài liệu'),
  });

  // Mo / dong mot trang la doi man: dua ve dau trang thay vi giu vi tri cuon cu.
  useEffect(() => {
    if (openId === null) window.scrollTo({ top: 0 });
  }, [openId]);

  const picker = (
    <DocumentTemplatePicker
      open={createOpen}
      pending={create.isPending}
      error={
        create.isError
          ? create.error instanceof Error
            ? create.error.message
            : 'Không tạo được trang'
          : null
      }
      onClose={() => {
        if (!create.isPending) {
          onCreateOpenChange(false);
          create.reset();
        }
      }}
      onSelect={(key) => create.mutate(key)}
    />
  );

  if (openId !== null) {
    if (openLoading) return <Skeleton className="h-40 rounded-panel" />;
    if (!openNote) {
      return (
        <EmptyState
          message="Không mở được trang tài liệu"
          hint="Trang có thể đã bị xoá hoặc bạn không có quyền xem."
          action={
            <button
              type="button"
              onClick={closePage}
              className={`text-sm text-tr-primary underline ${focusRing}`}
            >
              Về danh sách trang
            </button>
          }
        />
      );
    }
    return (
      <>
        <MeetingNoteEditor
          key={openNote.id}
          note={openNote}
          autoFocus={openNote.id === newlyCreatedId}
          links={{}}
          onBack={closePage}
          onDeleted={() => {
            pushToast('Đã chuyển trang vào thùng rác', 'success', {
              label: 'Hoàn tác',
              run: () => restore.mutate(openNote.id),
            });
            closePage();
          }}
        />
        {picker}
      </>
    );
  }

  const hasFilters = Boolean(query || purpose || linked || customerId);
  const clearFilters = () => {
    onTermChange('');
    setPurpose('');
    setLinked('');
    setCustomerId('');
  };
  const groups: { key: string; label: string; items: MeetingNoteListItem[] }[] =
    sort === 'updated' || view === 'trash'
      ? groupByRecency(
          notes,
          (note) => (view === 'trash' ? note.deleted_at : null) ?? note.updated_at
        )
      : [{ key: 'all', label: '', items: notes }];

  const facetButton = (label: string, count: number, active: boolean, onClick: () => void) => (
    <button
      key={label}
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex min-h-9 w-full items-center justify-between gap-2 rounded-control px-2.5 text-left text-sm transition ${focusRing} ${
        active ? 'bg-tr-primary/10 font-semibold text-tr-primary' : 'text-tr-text hover:bg-tr-hover'
      }`}
    >
      <span className="min-w-0 truncate">{label}</span>
      <span className="text-xs text-tr-muted tabular-nums">{count}</span>
    </button>
  );
  const purposeTotal = Object.values(facets?.by_purpose ?? {}).reduce((a, b) => a + (b ?? 0), 0);
  const linkTotal = facets ? facets.by_link.deal + facets.by_link.project + facets.by_link.none : 0;

  return (
    <div className="space-y-3">
      <DocumentsToolbar
        term={term}
        onTermChange={onTermChange}
        placeholder="Tìm tiêu đề, nội dung trang…"
        view={view}
        onViewChange={setView}
      >
        {/* Mau va Noi gan: tren man rong da co cot loc nhanh ben trai. */}
        <Select
          value={purpose}
          onChange={(event) => setPurpose(event.target.value as DocumentPurpose | '')}
          aria-label="Lọc theo mẫu"
          fullWidth={false}
          className="w-[calc(50%-0.25rem)] sm:w-44 lg:hidden"
        >
          <option value="">Mọi mẫu</option>
          {DOCUMENT_TEMPLATES.map((template) => (
            <option key={template.key} value={template.key}>
              {template.label}
            </option>
          ))}
        </Select>
        <Select
          value={linked}
          onChange={(event) => setLinked(event.target.value as LinkFilter)}
          aria-label="Lọc theo nơi gắn"
          fullWidth={false}
          className="w-[calc(50%-0.25rem)] sm:w-40 lg:hidden"
        >
          <option value="">Gắn với: tất cả</option>
          {Object.entries(LINK_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Select
          value={customerId}
          onChange={(event) => setCustomerId(event.target.value)}
          aria-label="Lọc khách hàng"
          fullWidth={false}
          className="w-[calc(50%-0.25rem)] sm:w-56"
        >
          <option value="">Mọi khách hàng</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </Select>
        {view === 'active' && (
          <Select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            aria-label="Sắp xếp"
            fullWidth={false}
            className="w-[calc(50%-0.25rem)] sm:w-40"
          >
            <option value="updated">Sửa gần nhất</option>
            <option value="meeting">Ngày họp</option>
          </Select>
        )}
      </DocumentsToolbar>

      {(hasFilters || crossHint) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          {hasFilters && (
            <>
              <span className="text-tr-subtle" role="status">
                {facets ? `${facets.total} trang khớp` : 'Đang lọc…'}
              </span>
              <button
                type="button"
                onClick={clearFilters}
                className={`text-tr-subtle underline hover:text-tr-text ${focusRing}`}
              >
                Xoá lọc
              </button>
            </>
          )}
          {crossHint && <span className="sm:ml-auto">{crossHint}</span>}
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <nav
          aria-label="Lọc nhanh trang tài liệu"
          className="hidden w-56 shrink-0 space-y-4 lg:block"
        >
          <div className="space-y-0.5">
            <h3 className="px-2.5 pb-1 text-xs font-semibold text-tr-muted">Theo mẫu</h3>
            {facetButton('Tất cả', purposeTotal, purpose === '', () => setPurpose(''))}
            {DOCUMENT_TEMPLATES.map((template) =>
              facetButton(
                template.label,
                facets?.by_purpose[template.key] ?? 0,
                purpose === template.key,
                () => setPurpose(purpose === template.key ? '' : template.key)
              )
            )}
          </div>
          <div className="space-y-0.5">
            <h3 className="px-2.5 pb-1 text-xs font-semibold text-tr-muted">Gắn với</h3>
            {facetButton('Tất cả', linkTotal, linked === '', () => setLinked(''))}
            {(Object.keys(LINK_LABELS) as Exclude<LinkFilter, ''>[]).map((key) =>
              facetButton(LINK_LABELS[key], facets?.by_link[key] ?? 0, linked === key, () =>
                setLinked(linked === key ? '' : key)
              )
            )}
          </div>
        </nav>

        <section aria-label="Danh sách trang tài liệu" className="min-w-0 flex-1 space-y-4">
          {isLoading ? (
            <div className="rounded-panel border border-tr-border bg-tr-panel">
              <SkeletonRows rows={6} cols={3} />
            </div>
          ) : error ? (
            <ErrorState onRetry={() => refetch()} />
          ) : notes.length === 0 ? (
            <EmptyState
              message={
                view === 'trash'
                  ? 'Thùng rác đang trống'
                  : hasFilters
                    ? 'Không có trang khớp bộ lọc'
                    : 'Chưa có trang tài liệu nào'
              }
              hint={
                view === 'trash'
                  ? 'Trang đã xoá sẽ nằm ở đây để bạn khôi phục.'
                  : hasFilters
                    ? 'Thử bỏ bớt bộ lọc hoặc dùng từ khoá khác.'
                    : 'Bấm "Tạo trang" và chọn một mẫu để bắt đầu.'
              }
            />
          ) : (
            groups.map((group) => (
              <div key={group.key} className="space-y-1.5">
                {group.label && (
                  <h3 className="pl-1 text-xs font-semibold text-tr-subtle">{group.label}</h3>
                )}
                <ul className="divide-y divide-tr-border overflow-hidden rounded-panel border border-tr-border bg-tr-card shadow-sm">
                  {group.items.map((note) => (
                    <li key={note.id} className="flex items-start gap-3 px-3 py-3 sm:px-4">
                      <span className="mt-0.5 hidden h-8 w-8 shrink-0 items-center justify-center rounded-control bg-tr-surface sm:inline-flex">
                        <FileText size={16} className="text-tr-subtle" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        {view === 'active' ? (
                          <button
                            type="button"
                            onClick={() => openPage(note.id)}
                            className={`block max-w-full truncate text-left font-semibold text-tr-text hover:text-tr-primary ${focusRing}`}
                          >
                            {note.title || 'Trang không tiêu đề'}
                          </button>
                        ) : (
                          <div className="truncate font-semibold text-tr-text">
                            {note.title || 'Trang không tiêu đề'}
                          </div>
                        )}
                        {note.excerpt.trim() && (
                          <div className="mt-0.5 line-clamp-2 text-xs text-tr-subtle sm:line-clamp-1">
                            {note.excerpt.trim().replace(/\s+/g, ' ')}
                          </div>
                        )}
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-tr-muted">
                          <span className="rounded-full bg-tr-surface px-2 py-0.5 font-medium text-tr-subtle">
                            {documentPurposeLabel(note.purpose_key)}
                          </span>
                          <ContextBadge note={note} />
                          {note.customer_name && (
                            <span className="truncate">{note.customer_name}</span>
                          )}
                          {note.owner_name && <span className="truncate">· {note.owner_name}</span>}
                          {note.attendee_count > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <Users size={11} aria-hidden="true" /> {note.attendee_count}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-tr-muted tabular-nums">
                        <span>
                          {view === 'trash' && note.deleted_at
                            ? `Xoá ${sqlTime(note.deleted_at)}`
                            : sort === 'meeting' && note.meeting_at
                              ? `Họp ${sqlTime(note.meeting_at)}`
                              : sqlTime(note.updated_at)}
                        </span>
                        {view === 'trash' && (
                          <button
                            type="button"
                            onClick={() => restore.mutate(note.id)}
                            disabled={restore.isPending}
                            className={`inline-flex min-h-9 items-center gap-1 rounded-control px-2 text-xs font-medium text-tr-primary hover:bg-tr-hover ${focusRing}`}
                          >
                            <ArchiveRestore size={14} aria-hidden="true" /> Khôi phục
                          </button>
                        )}
                        {view === 'trash' && (
                          <button
                            type="button"
                            onClick={() => setPurgeTarget(note)}
                            disabled={purge.isPending}
                            className={`inline-flex min-h-9 items-center gap-1 rounded-control px-2 text-xs font-medium text-tr-danger hover:bg-tr-hover ${focusRing}`}
                          >
                            <Trash2 size={14} aria-hidden="true" /> Xoá vĩnh viễn
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
          {!isLoading && !error && notes.length > 0 && (
            <LoadMoreSentinel
              hasMore={Boolean(hasNextPage)}
              loading={isFetchingNextPage}
              onLoadMore={loadMore}
              label="Tải thêm trang cũ hơn"
            />
          )}
        </section>
      </div>
      {picker}
      <ConfirmDialog
        open={purgeTarget !== null}
        title="Xoá vĩnh viễn trang tài liệu"
        confirmLabel="Xoá vĩnh viễn"
        message={`Xoá vĩnh viễn trang "${purgeTarget?.title || 'Trang không tiêu đề'}"? Nội dung và tệp đính kèm của trang sẽ bị xoá khỏi máy chủ, không khôi phục được.`}
        onCancel={() => setPurgeTarget(null)}
        onConfirm={() => {
          if (purgeTarget) purge.mutate(purgeTarget.id);
          setPurgeTarget(null);
        }}
      />
    </div>
  );
}
