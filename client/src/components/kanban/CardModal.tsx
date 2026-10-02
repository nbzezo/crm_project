import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlignLeft,
  Archive,
  ArrowRight,
  Bell,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  Flag,
  FolderKanban,
  Image,
  Link2,
  ListTree,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Plus,
  SlidersHorizontal,
  SquareCheck,
  Tag,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { Combobox } from '../common/Combobox';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Popover, PopoverItem, usePopover } from '../common/Popover';
import { useDialog } from '../common/useDialog';
import {
  Button,
  DateInput,
  DateTimeInput,
  Field as FormField,
  focusRing,
  selectOptionContrast,
  IconButton,
} from '../common/ui';
import { AttachmentSection } from './AttachmentSection';
import { ChecklistSection } from './ChecklistSection';
import { CustomFieldsSection } from './CustomFieldsSection';
import { LabelsPopover, ListPopover } from './CardModalPopovers';
import { SubtaskSection } from './SubtaskSection';
import { ScheduleSection } from './ScheduleSection';
import { AssigneeChip, AssigneePicker } from '../tasks/AssigneePicker';
import { CARD_STATUS_TONE } from '../tasks/CardStatusControl';
import { CARD_STATUSES } from '@workflow/contracts';
import { api } from '../../api/client';
import { COVER_COLORS } from '../../lib/backgrounds';
import { PRIORITY_COLORS, PRIORITY_ORDER, t } from '../../i18n/vi';
import { contrastInk, formatDate, formatDateTime, nowLocalInput } from '../../lib/format';
import { invalidateCardViews, invalidateCrmViews } from '../../lib/queryKeys';
import { useUiStore } from '../../stores/uiStore';
import type { Board, BoardFull, CardDetail, Customer, Deal, Priority, Project } from '../../types';

export function CardModal() {
  const cardId = useUiStore((s) => s.openCardId);
  const presentation = useUiStore((s) => s.cardPresentation);
  const close = useUiStore((s) => s.closeCard);
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [mobileTab, setMobileTab] = useState<'detail' | 'activity'>('detail');
  const panelRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  const addPop = usePopover();
  const labelPop = usePopover();
  const datePop = usePopover();
  const priorityPop = usePopover();
  const customerPop = usePopover();
  const assigneePop = usePopover();
  const projectPop = usePopover();
  const statusPop = usePopover();
  const coverPop = usePopover();
  const movePop = usePopover();
  const reminderPop = usePopover();
  const listPop = usePopover();
  const menuPop = usePopover();

  const { data: card } = useQuery({
    queryKey: ['card', cardId],
    queryFn: () => api.get<CardDetail>(`/api/cards/${cardId}`),
    enabled: cardId !== null,
  });

  /* O tieu de la <textarea> tu gian theo noi dung (mockup 1d/2c): tieu de dai
     xuong dong thay vi bi cat ngang nhu <input>. Do lai khi doi chu va doi the. */
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const fit = () => {
      el.style.height = 'auto';
      // border-box: scrollHeight khong tinh vien (border-2) nen phai cong vao, neu
      // khong dau duoi chu (ị, ụ, g, p) bi cat.
      el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
    };
    fit();
    // Do lai khi webfont tai xong (font du phong thap hon -> cat dau duoi chu)
    // va khi be ngang o doi (cua so, chuyen tab mobile, mo drawer).
    let alive = true;
    void document.fonts?.ready.then(() => alive && fit());
    // Chi phan ung khi BE NGANG doi: chinh fit() doi chieu cao, neu nghe ca chieu
    // cao thi observer tu kich hoat lai chinh no.
    let lastWidth = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === lastWidth) return;
      lastWidth = el.clientWidth;
      fit();
    });
    observer.observe(el);
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [title, card?.id]);

  useEffect(() => {
    if (card) {
      setTitle(card.title);
      setDescription(card.description ?? '');
      setEditingDesc(false);
    }
  }, [card?.id]);

  const refresh = () => {
    const cardRefresh = queryClient.invalidateQueries({ queryKey: ['card', cardId] });
    invalidateCardViews(queryClient);
    void queryClient.invalidateQueries({ queryKey: ['customer'] });
    return cardRefresh;
  };

  const update = useMutation({
    mutationFn: (patch: Record<string, unknown>) => api.patch(`/api/cards/${cardId}`, patch),
    // Chờ query chi tiết tải lại trước khi callback cục bộ đóng popover. Nhờ vậy
    // chip dự án/danh sách không giữ tên cũ sau một thao tác chọn thành công.
    onSuccess: () => refresh(),
  });

  const remove = useMutation({
    mutationFn: () => api.del(`/api/cards/${cardId}`),
    onSuccess: () => {
      refresh();
      close();
    },
  });

  const archive = useMutation({
    mutationFn: () => api.patch(`/api/cards/${cardId}`, { is_archived: true }),
    onSuccess: () => {
      refresh();
      close();
    },
  });

  const copy = useMutation({
    mutationFn: () => api.post<CardDetail>(`/api/cards/${cardId}/copy`),
    onSuccess: (created) => {
      refresh();
      menuPop.close();
      useUiStore.getState().openCard(created.id);
    },
  });

  /**
   * Truoc day bam ra nen dong the ngay, ke ca khi tieu de/mo ta dang go do:
   * tieu de chi luu khi blur nen thao tac do lam mat han phan vua nhap.
   */
  const isDirty =
    !!card &&
    ((title.trim() !== card.title && title.trim() !== '') ||
      (editingDesc && description !== (card.description ?? '')));

  const requestClose = useCallback(() => {
    if (isDirty) setConfirmDiscard(true);
    else close();
  }, [isDirty, close]);

  useDialog({ open: cardId !== null, onClose: requestClose, containerRef: panelRef });

  if (cardId === null) return null;

  if (!card) {
    return (
      <div
        className={`tr-anim-fade fixed inset-0 z-modal flex bg-tr-overlay ${
          presentation === 'drawer' ? 'justify-end' : 'items-start justify-center p-4 pt-16'
        }`}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={t.common.loading}
          aria-busy="true"
          className={`bg-tr-panel p-8 text-center text-sm text-tr-muted ${
            presentation === 'drawer'
              ? 'h-full w-[min(32rem,100vw)] border-s border-tr-border'
              : 'w-full max-w-5xl rounded-modal'
          }`}
        >
          {t.common.loading}
        </div>
      </div>
    );
  }

  const dateLabel =
    card.start_date && card.due_date
      ? `${formatDate(card.start_date)} → ${formatDate(card.due_date)}`
      : formatDate(card.due_date ?? card.start_date);
  // Hai cot chi khi la hop thoai; drawer luon mot cot.
  const wide = presentation !== 'drawer';
  const detailVisibility = mobileTab === 'activity' ? 'hidden lg:block' : '';
  const activityVisibility = mobileTab === 'detail' ? 'hidden lg:block' : '';

  return (
    <>
      <div
        className={`tr-anim-fade fixed inset-0 z-modal flex bg-tr-overlay ${
          presentation === 'drawer'
            ? 'justify-end'
            : 'p-0 sm:overflow-y-auto sm:p-4 sm:pt-10 sm:pb-10'
        }`}
        onMouseDown={(e) => e.target === e.currentTarget && requestClose()}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={card.title}
          className={
            presentation === 'drawer'
              ? 'tr-anim-slide-right flex h-full w-full flex-col overflow-hidden border-s border-tr-border bg-tr-panel shadow-2xl sm:tr-scroll sm:w-[min(32rem,100vw)] sm:overflow-y-auto'
              : 'tr-anim-pop fixed inset-0 flex w-full flex-col overflow-hidden rounded-none bg-tr-panel shadow-2xl sm:static sm:mx-auto sm:block sm:max-w-5xl sm:rounded-modal'
          }
        >
          {/* ----- Thanh dieu khien tren cung ----- */}
          <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-tr-border bg-tr-panel px-3 py-2.5 pt-[calc(0.625rem+env(safe-area-inset-top))] sm:static sm:border-0 sm:bg-transparent sm:pt-2.5">
            <button
              type="button"
              onClick={listPop.toggle}
              className={`inline-flex min-h-11 items-center gap-1 rounded-control bg-tr-hover px-2.5 py-1 text-sm font-medium text-tr-text transition hover:bg-tr-hover-strong fine:min-h-0 ${focusRing}`}
              aria-label={`Cột: ${card.board?.list_name}. Chuyển sang cột khác`}
              aria-haspopup="dialog"
            >
              {card.board?.list_name}
              <ChevronDown size={14} aria-hidden="true" />
            </button>

            <div className="ml-auto flex items-center gap-1">
              <IconButton label="Ảnh bìa" onClick={coverPop.toggle} aria-haspopup="dialog">
                <Image size={17} aria-hidden="true" />
              </IconButton>
              <IconButton label="Thao tác khác" onClick={menuPop.toggle} aria-haspopup="dialog">
                <MoreHorizontal size={18} aria-hidden="true" />
              </IconButton>
              <IconButton label={t.common.close} onClick={requestClose}>
                <X size={18} aria-hidden="true" />
              </IconButton>
            </div>
          </div>

          {card.cover_color && (
            <div
              className="mx-3 h-24 rounded-panel"
              style={{ backgroundColor: card.cover_color }}
            />
          )}

          <div
            className="flex shrink-0 border-b border-tr-border bg-tr-panel p-2 lg:hidden"
            role="tablist"
            aria-label="Nội dung thẻ"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mobileTab === 'detail'}
              onClick={() => setMobileTab('detail')}
              className={`min-h-11 flex-1 rounded-control text-sm font-semibold ${mobileTab === 'detail' ? 'bg-tr-primary text-tr-on-primary' : 'text-tr-subtle'}`}
            >
              Chi tiết
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mobileTab === 'activity'}
              onClick={() => setMobileTab('activity')}
              className={`min-h-11 flex-1 rounded-control text-sm font-semibold ${mobileTab === 'activity' ? 'bg-tr-primary text-tr-on-primary' : 'text-tr-subtle'}`}
            >
              Hoạt động ({card.comments?.length ?? 0})
            </button>
          </div>

          {/*
           * Bo cuc theo mockup 2c. Tren lg (dang hop thoai): tieu de trai het be
           * ngang; cot trai la noi dung roi nhan xet, cot phai nen xam la thuoc
           * tinh va thao tac. Duoi lg va o dang drawer: mot cot, thuoc tinh nam ngay
           * duoi tieu de (mockup 1d), tab Chi tiet/Hoat dong giu nguyen.
           */}
          <div
            className={`min-h-0 flex-1 overflow-y-auto grid grid-cols-1 sm:min-h-0 sm:flex-none sm:overflow-visible ${
              wide ? 'lg:grid-cols-[minmax(0,1fr)_300px]' : ''
            }`}
          >
            {/* ================= Tieu de ================= */}
            <div
              className={`px-4 pt-3 pb-4 sm:px-6 ${wide ? 'lg:col-span-2 lg:border-b lg:border-tr-border' : ''} ${detailVisibility}`}
            >
              {card.board && (
                <p className="tr-eyebrow mb-1 truncate text-xs font-semibold text-tr-muted">
                  {card.board.name} · {card.board.list_name}
                </p>
              )}
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => update.mutate({ is_done: !card.is_done })}
                  className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full fine:mt-2.5 fine:h-5 fine:w-5 ${focusRing}`}
                  aria-pressed={Boolean(card.is_done)}
                  aria-label={card.is_done ? t.card.markUndone : t.card.markDone}
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition ${card.is_done ? 'border-tr-success bg-tr-success text-tr-on-success' : 'border-tr-muted text-transparent hover:border-tr-text'}`}
                  >
                    <Check size={13} aria-hidden="true" />
                  </span>
                </button>
                <textarea
                  ref={titleRef}
                  rows={1}
                  value={title}
                  // Tieu de la mot dong logic: dan chuoi nhieu dong thi gop thanh mot.
                  onChange={(e) => setTitle(e.target.value.replace(/\s*\n\s*/g, ' '))}
                  onBlur={() =>
                    title.trim() && title !== card.title && update.mutate({ title: title.trim() })
                  }
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing) return;
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }
                    if (e.key === 'Escape') setTitle(card.title);
                  }}
                  aria-label="Tiêu đề thẻ"
                  className="tr-display tr-card-title w-full resize-none overflow-hidden rounded-control border-2 border-transparent bg-transparent px-1.5 py-0.5 text-xl leading-tight font-semibold text-tr-text outline-none focus:border-tr-primary focus:bg-tr-surface"
                />
              </div>
              {/* tr-rule: moc theme Don sac, nam DUOI hang tieu de (khong trong hang
                  flex), le trai = nut hoan thanh + gap-3 + px-1.5 cua o tieu de. */}
              <span className="tr-rule ml-[62px] fine:ml-[38px]" aria-hidden="true" />
            </div>

            {/* ================= Thuoc tinh (cot phai) ================= */}
            <aside
              aria-label="Thuộc tính thẻ"
              className={`flex flex-col gap-4 px-4 pb-4 sm:px-6 ${
                wide
                  ? 'lg:col-start-2 lg:row-span-2 lg:row-start-2 lg:border-l lg:border-tr-border lg:bg-tr-surface lg:px-5 lg:py-5'
                  : ''
              } ${mobileTab === 'activity' ? 'hidden lg:flex' : ''}`}
            >
              {/* Luon hien, ke ca khi chua giao: viec khong co nguoi phu trach la
                  thu can nhin thay chu khong phai thu nen an di. */}
              <Field row label="Trạng thái">
                <button
                  onClick={statusPop.toggle}
                  className={`inline-flex min-h-7 items-center gap-1.5 rounded px-2.5 text-xs font-medium ${CARD_STATUS_TONE[card.status ?? 'todo']}`}
                >
                  {t.cardStatus[card.status ?? 'todo']}
                </button>
              </Field>

              <Field row label={t.card.priority}>
                <button
                  onClick={priorityPop.toggle}
                  className="inline-flex min-h-7 items-center rounded px-2.5 text-xs font-medium"
                  style={{
                    backgroundColor: PRIORITY_COLORS[card.priority],
                    color: contrastInk(PRIORITY_COLORS[card.priority]),
                  }}
                >
                  {t.priority[card.priority]}
                </button>
              </Field>

              <Field row label="Ngày">
                <button
                  type="button"
                  onClick={datePop.toggle}
                  aria-haspopup="dialog"
                  className={`inline-flex min-h-7 items-center gap-1.5 rounded bg-tr-hover px-2.5 text-xs text-tr-text transition hover:bg-tr-hover-strong ${focusRing}`}
                >
                  {card.start_date || card.due_date ? (
                    dateLabel
                  ) : (
                    <span className="text-tr-muted">Chưa đặt ngày</span>
                  )}
                  {!!card.is_done && (
                    <span className="tr-badge-done rounded px-1.5 text-xs font-medium">
                      {t.common.done}
                    </span>
                  )}
                </button>
              </Field>

              <Field row label={t.card.assignee}>
                <button
                  onClick={assigneePop.toggle}
                  className="inline-flex min-h-7 items-center gap-1.5 rounded bg-tr-hover px-2.5 text-xs text-tr-text transition hover:bg-tr-hover-strong"
                >
                  {card.assignee_name ? (
                    <AssigneeChip
                      name={card.assignee_name}
                      orgKind={card.assignee_org_kind}
                      orgName={card.assignee_org_name}
                    />
                  ) : (
                    <>
                      <UserRound size={13} />
                      <span className="text-tr-muted">{t.card.unassigned}</span>
                    </>
                  )}
                </button>
              </Field>

              <Field row label={t.nav.projects}>
                <button
                  type="button"
                  onClick={projectPop.toggle}
                  aria-label={`Dự án: ${card.project_name ?? 'Chưa chọn'}`}
                  aria-haspopup="dialog"
                  className={`inline-flex min-h-7 items-center gap-1.5 rounded bg-tr-hover px-2.5 text-xs text-tr-text transition hover:bg-tr-hover-strong ${focusRing}`}
                >
                  <FolderKanban size={13} aria-hidden="true" />
                  <span className={card.project_name ? '' : 'text-tr-muted'}>
                    {card.project_name ?? 'Chưa chọn'}
                  </span>
                  <ChevronDown size={12} className="text-tr-muted" aria-hidden="true" />
                </button>
              </Field>

              <Field row label={t.card.customer}>
                <button
                  type="button"
                  onClick={customerPop.toggle}
                  aria-haspopup="dialog"
                  className={`inline-flex min-h-7 max-w-full items-center gap-1.5 rounded bg-tr-hover px-2.5 text-left text-xs text-tr-text transition hover:bg-tr-hover-strong ${focusRing}`}
                >
                  <Building2 size={13} className="shrink-0" aria-hidden="true" />
                  {card.customer_name ? (
                    <span className="min-w-0">
                      {card.customer_name}
                      {card.deal_title && (
                        <span className="text-tr-muted"> · {card.deal_title}</span>
                      )}
                    </span>
                  ) : (
                    <span className="text-tr-muted">Chưa liên kết</span>
                  )}
                </button>
              </Field>

              {/* Thao tac cuoi cot (mockup 2c). Van con trong menu "Thao tác khác". */}
              {/* Chi o hop thoai tren lg: duoi do (mobile, drawer) nut Xoa do nam ngay tren
                  noi dung qua noi bat cho mot thao tac nguy hiem — van con trong menu "…". */}
              <div
                className={`mt-auto hidden flex-col gap-2 border-t border-tr-border pt-4 ${wide ? 'lg:flex' : ''}`}
              >
                <Button
                  variant="secondary"
                  disabled={archive.isPending}
                  onClick={() => archive.mutate()}
                >
                  <Archive size={15} aria-hidden="true" /> Lưu trữ thẻ
                </Button>
                <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                  <Trash2 size={15} aria-hidden="true" /> {t.card.deleteCard}
                </Button>
              </div>
            </aside>

            {/* ================= Noi dung (cot trai) ================= */}
            <div
              className={`min-w-0 px-4 pt-1 sm:px-6 ${wide ? 'lg:col-start-1 lg:row-start-2 lg:pt-5' : ''} ${detailVisibility}`}
            >
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Button variant="ghost" onClick={addPop.toggle}>
                  <Plus size={14} aria-hidden="true" /> Thêm mục
                </Button>
              </div>

              {/* Việc bị chặn phải nói rõ vì sao ngay dưới tiêu đề — một thẻ “bị
                  chặn” không lý do thì không nhắc được ai. */}
              {card.status === 'blocked' && card.blocked_reason && (
                <div className="mb-4 ml-8 rounded-panel border border-tr-danger/40 bg-tr-danger/10 px-3 py-2 text-sm">
                  <span className="font-medium text-tr-danger">Bị chặn: </span>
                  <span className="text-tr-text">{card.blocked_reason}</span>
                  {card.blocked_since && (
                    <span className="ml-1 text-xs text-tr-muted">
                      (từ {formatDateTime(card.blocked_since.replace(' ', 'T').slice(0, 16))})
                    </span>
                  )}
                </div>
              )}

              <div className="mb-5 pl-8">
                <Field label={t.card.labels}>
                  <div className="flex flex-wrap items-center gap-1">
                    {card.labels.map((l) => (
                      <span
                        key={l.id}
                        className="inline-flex min-h-7 items-center rounded px-2.5 text-xs font-medium"
                        style={{ backgroundColor: l.color, color: contrastInk(l.color) }}
                      >
                        {l.name}
                      </span>
                    ))}
                    <button
                      onClick={labelPop.toggle}
                      className="flex h-7 w-7 items-center justify-center rounded bg-tr-hover text-tr-subtle transition hover:bg-tr-hover-strong"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </Field>
              </div>

              {/* Mo ta */}
              <section className="mb-5">
                <div className="mb-1.5 flex items-center gap-2.5">
                  <AlignLeft size={16} className="text-tr-subtle" />
                  <h3 className="flex-1 text-sm font-semibold text-tr-text">
                    {t.card.description}
                  </h3>
                  {!editingDesc && card.description && (
                    <Button size="sm" onClick={() => setEditingDesc(true)}>
                      Chỉnh sửa
                    </Button>
                  )}
                </div>
                <div className="pl-8">
                  {editingDesc ? (
                    <>
                      <textarea
                        autoFocus
                        rows={6}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        aria-label={t.card.description}
                        className="w-full resize-y rounded-control border-2 border-tr-primary bg-tr-surface px-3 py-2 text-sm leading-relaxed text-tr-text outline-none"
                      />
                      <div className="mt-2 flex gap-2">
                        <Button
                          variant="primary"
                          disabled={update.isPending}
                          onClick={() => {
                            update.mutate({ description });
                            setEditingDesc(false);
                          }}
                        >
                          {update.isPending ? t.common.saving : t.common.save}
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setDescription(card.description ?? '');
                            setEditingDesc(false);
                          }}
                        >
                          {t.common.cancel}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingDesc(true)}
                      className={`min-h-14 w-full rounded-control bg-tr-hover px-3 py-2 text-left text-sm transition hover:bg-tr-hover-strong ${focusRing} ${
                        card.description
                          ? 'leading-relaxed whitespace-pre-wrap text-tr-text'
                          : 'text-tr-muted'
                      }`}
                    >
                      {card.description || t.card.descriptionPlaceholder}
                    </button>
                  )}
                </div>
              </section>

              {/* Viec con — cong viec doc lap.
                  Dat truoc "Truong thong tin": day la muc duoc dung nhieu nhat,
                  con truong tuy chinh thi hiem khi mo. */}
              <CardSection
                id={SECTION_IDS.subtasks}
                icon={<ListTree size={16} className="text-tr-subtle" />}
                title="Việc con"
                hint="Công việc độc lập, có hạn và ưu tiên riêng, hiện ở trang Công việc."
                count={card.subtasks?.length ?? 0}
              >
                <SubtaskSection cardId={card.id} subtasks={card.subtasks ?? []} />
              </CardSection>

              {/* Viec can lam — danh sach kiem */}
              <CardSection
                id={SECTION_IDS.checklist}
                icon={<SquareCheck size={16} className="text-tr-subtle" />}
                title={t.card.checklist}
                hint="Các bước cần hoàn tất, chỉ nằm trong thẻ này."
                count={card.checklist.length}
              >
                <ChecklistSection cardId={card.id} items={card.checklist} />
              </CardSection>

              {/* Ke hoach: uoc luong, moc, phu thuoc va lich su doi han */}
              <CardSection
                id={SECTION_IDS.schedule}
                icon={<Link2 size={16} className="text-tr-subtle" />}
                title="Kế hoạch & phụ thuộc"
                hint="Ước lượng, mốc quan trọng, việc phải xong trước và số lần đã dời hạn."
                count={(card.dependencies?.predecessors.length ?? 0) + (card.slip_count ?? 0)}
              >
                <ScheduleSection card={card} onChanged={refresh} />
              </CardSection>

              {/* Tep dinh kem */}
              <CardSection
                id={SECTION_IDS.attachments}
                icon={<Paperclip size={16} className="text-tr-subtle" />}
                title="Tệp đính kèm"
                count={card.attachments?.length ?? 0}
              >
                <AttachmentSection cardId={card.id} attachments={card.attachments ?? []} />
              </CardSection>

              {/* Truong thong tin tuy chinh */}
              <CardSection
                id={SECTION_IDS.fields}
                icon={<SlidersHorizontal size={16} className="text-tr-subtle" />}
                title="Trường thông tin"
                hint="Cột dữ liệu riêng của luồng việc — áp dụng cho mọi công việc trong đó."
                count={card.fields?.length ?? 0}
              >
                <CustomFieldsSection
                  cardId={card.id}
                  boardId={card.board?.id ?? null}
                  fields={card.fields ?? []}
                />
              </CardSection>

              {/* Nhac hen */}
              {card.reminders.length > 0 && (
                <section>
                  <div className="mb-1.5 flex items-center gap-2.5">
                    <Bell size={16} className="text-tr-subtle" />
                    <h3 className="text-sm font-semibold text-tr-text">{t.reminder.reminders}</h3>
                  </div>
                  <ul className="space-y-1 pl-8">
                    {card.reminders.map((r) => (
                      <li key={r.id} className="flex items-center gap-2 text-sm text-tr-subtle">
                        <span className={r.is_done ? 'text-tr-muted line-through' : ''}>
                          {r.title}
                        </span>
                        <span className="text-xs text-tr-muted">{formatDateTime(r.due_at)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>

            {/* ================= Nhan xet va hoat dong ================= */}
            <div
              className={`min-w-0 px-4 pt-2 pb-6 sm:px-6 ${wide ? 'lg:col-start-1 lg:row-start-3' : ''} ${activityVisibility}`}
            >
              <ActivityColumn card={card} />
            </div>
          </div>
        </div>
      </div>

      {/* ---------- Cac popover ---------- */}
      <Popover
        open={addPop.open}
        anchor={addPop.anchor}
        onClose={addPop.close}
        title="Thêm vào thẻ"
      >
        <PopoverItem icon={<Tag size={15} />} onClick={() => handoff(addPop, labelPop)}>
          {t.card.labels}
        </PopoverItem>
        <PopoverItem icon={<Clock size={15} />} onClick={() => handoff(addPop, datePop)}>
          Ngày bắt đầu / hạn
        </PopoverItem>
        <PopoverItem icon={<Flag size={15} />} onClick={() => handoff(addPop, priorityPop)}>
          {t.card.priority}
        </PopoverItem>
        <PopoverItem icon={<Building2 size={15} />} onClick={() => handoff(addPop, customerPop)}>
          {t.card.customer}
        </PopoverItem>

        <div className="my-2 border-t border-tr-border" />

        <PopoverItem
          icon={<ListTree size={15} />}
          onClick={() => scrollToSection(addPop, SECTION_IDS.subtasks)}
        >
          Việc con
        </PopoverItem>
        <PopoverItem
          icon={<SquareCheck size={15} />}
          onClick={() => scrollToSection(addPop, SECTION_IDS.checklist)}
        >
          {t.card.checklist}
        </PopoverItem>
        <PopoverItem
          icon={<Paperclip size={15} />}
          onClick={() => scrollToSection(addPop, SECTION_IDS.attachments)}
        >
          Tệp đính kèm
        </PopoverItem>
        <PopoverItem
          icon={<SlidersHorizontal size={15} />}
          onClick={() => scrollToSection(addPop, SECTION_IDS.fields)}
        >
          Trường thông tin
        </PopoverItem>

        <div className="my-2 border-t border-tr-border" />

        <PopoverItem icon={<Image size={15} />} onClick={() => handoff(addPop, coverPop)}>
          Ảnh bìa
        </PopoverItem>
        <PopoverItem icon={<Bell size={15} />} onClick={() => handoff(addPop, reminderPop)}>
          {t.card.addReminder}
        </PopoverItem>
      </Popover>

      <Popover
        open={menuPop.open}
        anchor={menuPop.anchor}
        onClose={menuPop.close}
        title="Thao tác với thẻ"
        width={272}
      >
        <PopoverItem icon={<ArrowRight size={15} />} onClick={() => handoff(menuPop, movePop)}>
          Di chuyển
        </PopoverItem>
        <PopoverItem icon={<Copy size={15} />} onClick={() => copy.mutate()}>
          Sao chép
        </PopoverItem>
        <PopoverItem
          icon={<CheckCircle2 size={15} />}
          onClick={() => (menuPop.close(), update.mutate({ is_done: !card.is_done }))}
        >
          {card.is_done ? t.card.markUndone : t.card.markDone}
        </PopoverItem>
        <div className="my-2 border-t border-tr-border" />
        <PopoverItem icon={<Archive size={15} />} onClick={() => archive.mutate()}>
          Lưu trữ
        </PopoverItem>
        <PopoverItem
          icon={<Trash2 size={15} />}
          danger
          onClick={() => (menuPop.close(), setConfirmDelete(true))}
        >
          {t.card.deleteCard}
        </PopoverItem>
      </Popover>

      <ListPopover card={card} pop={listPop} onDone={refresh} />
      <LabelsPopover card={card} pop={labelPop} onDone={refresh} />
      <DatesPopover card={card} pop={datePop} onChange={(p) => update.mutate(p)} />
      <PriorityPopover
        card={card}
        pop={priorityPop}
        onChange={(p) => update.mutate({ priority: p })}
      />
      <CustomerPopover card={card} pop={customerPop} onChange={(p) => update.mutate(p)} />
      <AssigneePopover card={card} pop={assigneePop} onChange={(p) => update.mutate(p)} />
      <ProjectPopover
        card={card}
        pop={projectPop}
        onChange={(projectId) =>
          update.mutate({ project_id: projectId }, { onSuccess: () => projectPop.close() })
        }
      />
      <StatusPopover card={card} pop={statusPop} onChange={(p) => update.mutate(p)} />
      <CoverPopover
        card={card}
        pop={coverPop}
        onChange={(c) => update.mutate({ cover_color: c })}
      />
      <MovePopover card={card} pop={movePop} onDone={refresh} />
      <ReminderPopover card={card} pop={reminderPop} />

      <ConfirmDialog
        open={confirmDelete}
        message="Thẻ này sẽ bị xóa vĩnh viễn cùng toàn bộ việc con, việc cần làm, tệp đính kèm và nhận xét bên trong."
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          remove.mutate();
        }}
      />

      <ConfirmDialog
        open={confirmDiscard}
        title={t.common.unsavedTitle}
        message={t.common.unsavedBody}
        confirmLabel={t.common.discard}
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          setTitle(card.title);
          setDescription(card.description ?? '');
          setEditingDesc(false);
          close();
        }}
      />
    </>
  );
}

/* ---------------- cac manh nho ---------------- */

type Pop = ReturnType<typeof usePopover>;

/** Dong popover hien tai va mo popover khac ngay tai cung vi tri neo. */
function handoff(from: Pop, to: Pop): void {
  const anchor = from.anchor;
  from.close();
  to.showAt(anchor);
}

/** Neo cuon toi tung khoi khi chon muc tuong ung trong menu "Thêm vào thẻ". */
const SECTION_IDS = {
  fields: 'card-sec-fields',
  subtasks: 'card-sec-subtasks',
  checklist: 'card-sec-checklist',
  schedule: 'card-sec-schedule',
  attachments: 'card-sec-attachments',
} as const;

function scrollToSection(pop: Pop, id: string): void {
  pop.close();
  requestAnimationFrame(() =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  );
}

/**
 * Khoi noi dung trong cot trai: icon + tieu de + mot dong giai thich ngan.
 * Thu gon duoc — the co du bon khoi truoc day dai toi muc phai cuon nhieu man hinh.
 * Khoi rong mac dinh dong lai de phan con lai len cao hon.
 */
function CardSection({
  id,
  icon,
  title,
  hint,
  count,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  hint?: string;
  count?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(count === undefined || count > 0);
  const bodyId = `${id}-body`;

  return (
    <section id={id} className="mb-5 scroll-mt-4">
      <div className="mb-1.5 flex items-start gap-2.5">
        <span className="mt-0.5" aria-hidden="true">
          {icon}
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={bodyId}
          className={`min-w-0 flex-1 rounded-control text-left ${focusRing}`}
        >
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-tr-text">
            {title}
            {count !== undefined && count > 0 && (
              <span className="rounded-full bg-tr-hover px-1.5 text-xs font-medium text-tr-subtle">
                {count}
              </span>
            )}
            <ChevronDown
              size={14}
              aria-hidden="true"
              className={`text-tr-muted transition-transform duration-150 ${open ? '' : '-rotate-90'}`}
            />
          </h3>
          {hint && <p className="text-xs text-tr-muted">{hint}</p>}
        </button>
      </div>
      <div id={bodyId} hidden={!open}>
        {children}
      </div>
    </section>
  );
}

function Field({
  label,
  children,
  row = false,
}: {
  label: string;
  children: React.ReactNode;
  /** Duoi lg xep "nhan — gia tri" tren mot hang (mockup 1d); tu lg xep doc. */
  row?: boolean;
}) {
  return (
    <div
      className={
        row ? 'grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-3 lg:block' : undefined
      }
    >
      <h4 className={`tr-eyebrow text-xs font-semibold text-tr-subtle ${row ? 'lg:mb-1' : 'mb-1'}`}>
        {label}
      </h4>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Cot "Nhận xét và hoạt động" ben phai — ghi chu ca nhan theo dong thoi gian. */
function ActivityColumn({ card }: { card: CardDetail }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);

  const add = useMutation({
    mutationFn: () => api.post(`/api/cards/${card.id}/comments`, { body: draft.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['card', card.id] });
      setDraft('');
      setFocused(false);
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/api/comments/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['card', card.id] }),
  });

  const activity = [
    card.completed_at ? { text: 'Đánh dấu hoàn thành', at: card.completed_at } : null,
    card.created_at
      ? {
          text: `Đã thêm thẻ này vào cột ${card.board?.list_name ?? ''}`,
          at: card.created_at,
        }
      : null,
  ].filter(Boolean) as { text: string; at: string }[];

  const stamp = (value: string) => formatDateTime(value.replace(' ', 'T').slice(0, 16));

  return (
    <aside className="flex min-h-full min-w-0 flex-col lg:block">
      <div className="mb-2.5 flex items-center gap-2.5">
        <MessageSquare size={16} className="text-tr-subtle" />
        <h3 className="text-sm font-semibold text-tr-text">Nhận xét và hoạt động</h3>
      </div>

      <div className="order-2 sticky bottom-0 z-10 border-t border-tr-border bg-tr-panel p-2 pb-[calc(0.5rem+var(--tr-safe-bottom))] lg:static lg:order-none lg:border-0 lg:bg-transparent lg:p-0">
        <textarea
          rows={focused ? 3 : 1}
          value={draft}
          onFocus={() => setFocused(true)}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Viết bình luận…"
          className="tr-card-shadow tr-field-control max-h-[7.5rem] w-full resize-none rounded-lg border border-tr-border bg-tr-card px-3 py-2 text-tr-text outline-none focus:border-tr-primary"
        />
        {focused && (
          <div className="mt-2 flex gap-2">
            <button
              disabled={!draft.trim()}
              onClick={() => add.mutate()}
              className="min-h-11 rounded-compact bg-tr-primary px-3 py-1.5 text-sm font-medium text-tr-on-primary transition hover:bg-tr-primary-hover disabled:opacity-50 fine:min-h-0"
            >
              {t.common.save}
            </button>
            <button
              onClick={() => {
                setDraft('');
                setFocused(false);
              }}
              className="min-h-11 rounded-compact px-3 py-1.5 text-sm text-tr-subtle transition hover:bg-tr-hover fine:min-h-0"
            >
              {t.common.cancel}
            </button>
          </div>
        )}
      </div>

      <ul className="order-1 mt-4 flex-1 space-y-3 lg:order-none">
        {(card.comments ?? []).map((comment) => (
          <li key={comment.id} className="group flex gap-2">
            <Avatar />
            <div className="min-w-0 flex-1">
              <div className="tr-card-shadow rounded-lg bg-tr-card px-3 py-2 text-sm whitespace-pre-wrap text-tr-text">
                {comment.body}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-tr-muted">
                <span>{stamp(comment.created_at)}</span>
                <button
                  onClick={() => remove.mutate(comment.id)}
                  className="min-h-11 underline opacity-100 transition hover:text-tr-danger hoverable:min-h-0 hoverable:opacity-0 hoverable:group-hover:opacity-100"
                >
                  {t.common.delete}
                </button>
              </div>
            </div>
          </li>
        ))}

        {activity.map((item, i) => (
          <li key={`a-${i}`} className="flex gap-2 text-sm">
            <Avatar muted />
            <div className="min-w-0">
              <span className="text-tr-text">{item.text}</span>
              <div className="text-xs text-tr-muted">{stamp(item.at)}</div>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function Avatar({ muted }: { muted?: boolean }) {
  return (
    <span
      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
        muted ? 'bg-tr-hover-strong text-tr-subtle' : 'bg-tr-primary text-tr-on-primary'
      }`}
    >
      Tôi
    </span>
  );
}

const POPOVER_INPUT = `w-full rounded border border-tr-border bg-tr-card px-2.5 py-1.5 text-sm text-tr-text outline-none focus:border-tr-primary ${selectOptionContrast}`;

function DatesPopover({
  card,
  pop,
  onChange,
}: {
  card: CardDetail;
  pop: Pop;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  return (
    <Popover open={pop.open} anchor={pop.anchor} onClose={pop.close} title="Ngày">
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-tr-subtle">
            {t.card.startDate}
          </span>
          <DateInput
            value={card.start_date ?? null}
            onChange={(value) => onChange({ start_date: value })}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-tr-subtle">{t.card.dueDate}</span>
          <DateInput
            value={card.due_date ?? null}
            onChange={(value) => onChange({ due_date: value })}
          />
        </label>
        <button
          onClick={() => onChange({ start_date: null, due_date: null })}
          className="w-full rounded-compact bg-tr-hover py-1.5 text-sm text-tr-subtle transition hover:bg-tr-hover-strong"
        >
          Gỡ ngày
        </button>
      </div>
    </Popover>
  );
}

function PriorityPopover({
  card,
  pop,
  onChange,
}: {
  card: CardDetail;
  pop: Pop;
  onChange: (p: Priority) => void;
}) {
  return (
    <Popover open={pop.open} anchor={pop.anchor} onClose={pop.close} title={t.card.priority}>
      <div className="space-y-1.5">
        {PRIORITY_ORDER.map((p) => (
          <button
            key={p}
            onClick={() => {
              onChange(p);
              pop.close();
            }}
            className={`flex h-8 w-full items-center justify-between rounded px-3 text-sm font-medium transition hover:brightness-95 ${
              card.priority === p ? 'ring-2 ring-tr-text ring-offset-1' : ''
            }`}
            style={{ backgroundColor: PRIORITY_COLORS[p], color: contrastInk(PRIORITY_COLORS[p]) }}
          >
            {t.priority[p]}
            {card.priority === p && <Check size={14} />}
          </button>
        ))}
      </div>
    </Popover>
  );
}

function CustomerPopover({
  card,
  pop,
  onChange,
}: {
  card: CardDetail;
  pop: Pop;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const queryClient = useQueryClient();
  const { data: customers = [] } = useQuery({
    queryKey: ['customers', 'select'],
    queryFn: () => api.get<Customer[]>('/api/customers'),
    staleTime: 60_000,
    enabled: pop.open,
  });
  const { data: dealsData } = useQuery({
    queryKey: ['deals', 'byCustomer', card.customer_id],
    queryFn: () =>
      api.get<{ stages: Record<string, Deal[]> }>(`/api/deals?customer_id=${card.customer_id}`),
    enabled: pop.open && !!card.customer_id,
  });
  const deals = dealsData ? Object.values(dealsData.stages).flat() : [];

  return (
    <Popover open={pop.open} anchor={pop.anchor} onClose={pop.close} title={t.card.customer}>
      <div className="space-y-3">
        <Combobox
          value={card.customer_id ?? ''}
          onChange={(v) => onChange({ customer_id: v === '' ? null : v })}
          options={customers.map((c) => ({ id: c.id, label: c.name }))}
          placeholder={`— ${t.common.none} —`}
          searchPlaceholder="Tìm khách hàng…"
          emptyText="Không tìm thấy khách hàng."
          ariaLabel={t.card.customer}
          onQuickCreate={async (name) => {
            const created = await api.post<Customer>('/api/customers', { name });
            invalidateCrmViews(queryClient);
            return { id: created.id, label: created.name };
          }}
          quickCreateLabel={(q) => `+ Tạo khách hàng "${q}"`}
        />

        {card.customer_id && (
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-tr-subtle">{t.card.deal}</span>
            <Combobox
              value={card.deal_id ?? ''}
              onChange={(v) => onChange({ deal_id: v === '' ? null : v })}
              options={deals.map((d) => ({ id: d.id, label: `${d.title} (${t.stage[d.stage]})` }))}
              placeholder={`— ${t.common.none} —`}
              searchPlaceholder="Tìm cơ hội…"
              emptyText="Không tìm thấy cơ hội."
              ariaLabel={t.card.deal}
              onQuickCreate={async (title) => {
                const created = await api.post<Deal>('/api/deals', {
                  customer_id: card.customer_id,
                  title,
                });
                queryClient.invalidateQueries({
                  queryKey: ['deals', 'byCustomer', card.customer_id],
                });
                return { id: created.id, label: created.title };
              }}
              quickCreateLabel={(q) => `+ Tạo cơ hội "${q}"`}
            />
          </label>
        )}
      </div>
    </Popover>
  );
}

/** Lich lap — luu duoi dang JSON de doi don vi ma khong phai them cot moi. */
function parseRecur(raw: string | null | undefined): { unit: string; interval: number } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { unit?: string; interval?: number };
    if (!parsed.unit || !parsed.interval) return null;
    return { unit: parsed.unit, interval: parsed.interval };
  } catch {
    return null;
  }
}

/**
 * Vong doi cong viec + he qua di kem.
 *
 * Ly do chan nam CUNG cho voi o chon trang thai: chon 'Bi chan' roi phai di tim
 * cho khac de go ly do la cach chac chan de co mot the bi chan ma khong ai biet
 * vi sao. `blocked_reason` cung duoc gui kem trong dung mot lan PATCH.
 */
function StatusPopover({
  card,
  pop,
  onChange,
}: {
  card: CardDetail;
  pop: Pop;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const status = card.status ?? 'todo';
  const [reason, setReason] = useState(card.blocked_reason ?? '');
  const recur = parseRecur(card.recur_rule);

  // Nap lai o ly do khi mo popover cho mot the khac.
  const [loadedId, setLoadedId] = useState(card.id);
  if (loadedId !== card.id) {
    setLoadedId(card.id);
    setReason(card.blocked_reason ?? '');
  }

  return (
    <Popover open={pop.open} anchor={pop.anchor} onClose={pop.close} title="Trạng thái" width={300}>
      <div className="space-y-3">
        <div className="space-y-0.5">
          {CARD_STATUSES.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() =>
                onChange(
                  value === 'blocked'
                    ? { status: value, blocked_reason: reason.trim() || null }
                    : { status: value }
                )
              }
              className={`flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-sm transition hover:bg-tr-hover ${focusRing} ${
                status === value ? 'font-semibold text-tr-text' : 'text-tr-subtle'
              }`}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${CARD_STATUS_TONE[value]}`} />
              {t.cardStatus[value]}
              {status === value && <Check size={13} className="ml-auto text-tr-primary" />}
            </button>
          ))}
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-tr-subtle">
            Lý do bị chặn / đang chờ ai
          </span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onBlur={() => {
              if ((card.blocked_reason ?? '') === reason) return;
              onChange({ status: 'blocked', blocked_reason: reason.trim() || null });
            }}
            placeholder="Chờ khách gửi dữ liệu đầu vào…"
            className={POPOVER_INPUT}
          />
        </label>

        <div className="border-t border-tr-border pt-3">
          <span className="mb-1 block text-xs font-semibold text-tr-subtle">Lặp lại</span>
          <select
            value={recur ? `${recur.unit}:${recur.interval}` : ''}
            onChange={(e) => {
              if (e.target.value === '') {
                onChange({ recur_rule: null, recur_until: null });
                return;
              }
              const [unit, interval] = e.target.value.split(':');
              onChange({ recur_rule: JSON.stringify({ unit, interval: Number(interval) }) });
            }}
            className={POPOVER_INPUT}
          >
            <option value="">Không lặp</option>
            <option value="day:1">Hằng ngày</option>
            <option value="week:1">Hằng tuần</option>
            <option value="week:2">2 tuần một lần</option>
            <option value="month:1">Hằng tháng</option>
            <option value="month:3">Hằng quý</option>
          </select>
          {recur && (
            <p className="mt-1.5 text-xs text-tr-muted">
              Khi đánh dấu hoàn thành, bản kế tiếp được tạo dựa trên hạn hiện tại
              {card.due_date ? '' : ' (cần đặt hạn hoặc ngày bắt đầu)'}.
            </p>
          )}
        </div>
      </div>
    </Popover>
  );
}

/**
 * Nguoi phu trach — popover RIENG, khong gop vao CustomerPopover.
 *
 * Hai o trong CustomerPopover rang buoc nhau theo chuoi so huu (doi khach hang thi
 * co hoi bi xoa). Nguoi phu trach doc lap: doi khach hang cua the KHONG lam mat
 * nguoi dang lam no.
 */
function AssigneePopover({
  card,
  pop,
  onChange,
}: {
  card: CardDetail;
  pop: Pop;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  return (
    <Popover open={pop.open} anchor={pop.anchor} onClose={pop.close} title={t.card.assignee}>
      <AssigneePicker
        label=""
        value={card.assignee_contact_id ?? null}
        onChange={(v) => onChange({ assignee_contact_id: v })}
        hint="Ai sẽ làm việc này — người của bất kỳ tổ chức nào."
      />
    </Popover>
  );
}

/**
 * Dự án là quan hệ suy từ bảng chứa thẻ, nên chọn dự án sẽ nhờ API chuyển thẻ
 * sang một bảng của dự án đó (ưu tiên cột có cùng trạng thái hiện tại).
 */
function ProjectPopover({
  card,
  pop,
  onChange,
}: {
  card: CardDetail;
  pop: Pop;
  onChange: (projectId: number | null) => void;
}) {
  const { data: projects = [] } = useQuery({
    queryKey: ['projects', 'picker'],
    queryFn: () => api.get<Project[]>('/api/projects'),
    enabled: pop.open,
    staleTime: 60_000,
  });

  return (
    <Popover open={pop.open} anchor={pop.anchor} onClose={pop.close} title={t.nav.projects}>
      <FormField
        label="Chọn dự án"
        hint="Công việc sẽ chuyển sang luồng việc của dự án và giữ nguyên trạng thái nếu luồng đích có cột tương ứng."
      >
        <Combobox
          value={card.project_id ?? ''}
          onChange={(value) => onChange(value === '' ? null : value)}
          options={projects.map((project) => ({
            id: project.id,
            label: project.name,
            sublabel: project.customer_name ?? 'Dự án nội bộ',
          }))}
          placeholder="— Không thuộc dự án —"
          searchPlaceholder="Tìm dự án…"
          emptyText="Không tìm thấy dự án."
          ariaLabel="Chọn dự án cho công việc"
        />
      </FormField>
    </Popover>
  );
}

function CoverPopover({
  card,
  pop,
  onChange,
}: {
  card: CardDetail;
  pop: Pop;
  onChange: (color: string | null) => void;
}) {
  return (
    <Popover open={pop.open} anchor={pop.anchor} onClose={pop.close} title="Ảnh bìa">
      <div className="grid grid-cols-5 gap-2">
        {COVER_COLORS.map((color) => (
          <button
            key={color}
            onClick={() => onChange(color)}
            className={`h-10 rounded transition hover:brightness-95 ${
              card.cover_color === color ? 'ring-2 ring-tr-primary ring-offset-1' : ''
            }`}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
      {card.cover_color && (
        <button
          onClick={() => onChange(null)}
          className="mt-3 w-full rounded-compact bg-tr-hover py-1.5 text-sm text-tr-subtle transition hover:bg-tr-hover-strong"
        >
          Gỡ ảnh bìa
        </button>
      )}
    </Popover>
  );
}

function MovePopover({ card, pop, onDone }: { card: CardDetail; pop: Pop; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [boardId, setBoardId] = useState<number | null>(null);
  const targetBoardId = boardId ?? card.board?.id ?? null;

  const { data: boards = [] } = useQuery({
    queryKey: ['boards', false],
    queryFn: () => api.get<Board[]>('/api/boards'),
    enabled: pop.open,
  });
  const { data: target } = useQuery({
    queryKey: ['board', targetBoardId],
    queryFn: () => api.get<BoardFull>(`/api/boards/${targetBoardId}/full`),
    enabled: pop.open && targetBoardId !== null,
  });

  const move = useMutation({
    mutationFn: (listId: number) =>
      api.patch(`/api/cards/${card.id}/move`, { list_id: listId, beforeId: null, afterId: null }),
    onSuccess: () => {
      onDone();
      pop.close();
    },
  });

  return (
    <Popover open={pop.open} anchor={pop.anchor} onClose={pop.close} title="Di chuyển thẻ">
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-tr-subtle">Luồng việc</span>
          <Combobox
            value={targetBoardId ?? ''}
            onChange={(v) => {
              if (v !== '') setBoardId(v);
            }}
            options={boards.map((b) => ({ id: b.id, label: b.name }))}
            searchPlaceholder="Tìm luồng việc…"
            emptyText="Không tìm thấy luồng việc."
            ariaLabel="Luồng việc"
            allowClear={false}
            onQuickCreate={async (name) => {
              const created = await api.post<Board>('/api/boards', { name });
              queryClient.invalidateQueries({ queryKey: ['boards'] });
              return { id: created.id, label: created.name };
            }}
            quickCreateLabel={(q) => `+ Tạo luồng việc "${q}"`}
          />
        </label>
        <div>
          <span className="mb-1 block text-xs font-semibold text-tr-subtle">Danh sách</span>
          <div className="space-y-1">
            {target?.lists.map((l) => (
              <button
                key={l.id}
                onClick={() => move.mutate(l.id)}
                className={`w-full rounded px-3 py-1.5 text-left text-sm transition hover:bg-tr-hover ${
                  l.id === card.list_id ? 'font-semibold text-tr-primary' : 'text-tr-text'
                }`}
              >
                {l.name}
                {l.id === card.list_id && ' (hiện tại)'}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Popover>
  );
}

function ReminderPopover({ card, pop }: { card: CardDetail; pop: Pop }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState(nowLocalInput);

  useEffect(() => {
    if (pop.open) setTitle(card.title);
  }, [pop.open, card.title]);

  const create = useMutation({
    mutationFn: () =>
      api.post('/api/reminders', {
        title: title.trim() || card.title,
        due_at: dueAt,
        card_id: card.id,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      queryClient.invalidateQueries({ queryKey: ['card', card.id] });
      pop.close();
    },
  });

  return (
    <Popover open={pop.open} anchor={pop.anchor} onClose={pop.close} title={t.reminder.newReminder}>
      <div className="space-y-3">
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={POPOVER_INPUT} />
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-tr-subtle">
            {t.reminder.dueAt}
          </span>
          <DateTimeInput value={dueAt || null} onChange={(value) => setDueAt(value ?? '')} />
        </label>
        <button
          onClick={() => create.mutate()}
          className="w-full rounded-compact bg-tr-primary py-1.5 text-sm font-medium text-tr-on-primary transition hover:bg-tr-primary-hover"
        >
          {t.common.save}
        </button>
      </div>
    </Popover>
  );
}
