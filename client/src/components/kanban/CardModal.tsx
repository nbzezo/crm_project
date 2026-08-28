import { useCallback, useEffect, useRef, useState } from 'react';
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
  CircleDot,
  Clock,
  Copy,
  Flag,
  FolderKanban,
  Image,
  Link2,
  ListTree,
  MessageSquare,
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
import { Button, Field as FormField, focusRing, selectOptionContrast } from '../common/ui';
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
  const panelRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (card) {
      setTitle(card.title);
      setDescription(card.description ?? '');
      setEditingDesc(false);
    }
  }, [card?.id]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['card', cardId] });
    invalidateCardViews(queryClient);
    queryClient.invalidateQueries({ queryKey: ['customer'] });
  };

  const update = useMutation({
    mutationFn: (patch: Record<string, unknown>) => api.patch(`/api/cards/${cardId}`, patch),
    onSuccess: refresh,
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
              : 'w-full max-w-4xl rounded-modal'
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

  return (
    <>
      <div
        className={`tr-anim-fade fixed inset-0 z-modal flex bg-tr-overlay ${
          presentation === 'drawer' ? 'justify-end' : 'overflow-y-auto p-4 pt-10 pb-10'
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
              ? 'tr-anim-slide-right tr-scroll h-full w-[min(32rem,100vw)] overflow-y-auto border-s border-tr-border bg-tr-panel shadow-2xl'
              : 'tr-anim-pop mx-auto w-full max-w-4xl overflow-hidden rounded-modal bg-tr-panel shadow-2xl'
          }
        >
          {/* ----- Thanh dieu khien tren cung ----- */}
          <div className="flex items-center gap-2 px-3 py-2.5">
            <button
              type="button"
              onClick={listPop.toggle}
              className={`inline-flex items-center gap-1 rounded-control bg-tr-hover px-2.5 py-1 text-sm font-medium text-tr-text transition hover:bg-tr-hover-strong ${focusRing}`}
              aria-label={`Danh sách: ${card.board?.list_name}. Chuyển sang danh sách khác`}
              aria-haspopup="dialog"
            >
              {card.board?.list_name}
              <ChevronDown size={14} aria-hidden="true" />
            </button>

            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={coverPop.toggle}
                className={`rounded-control p-1.5 text-tr-subtle transition hover:bg-tr-hover ${focusRing}`}
                aria-label="Ảnh bìa"
                aria-haspopup="dialog"
              >
                <Image size={17} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={menuPop.toggle}
                className={`rounded-full px-2 py-1 text-tr-subtle transition hover:bg-tr-hover ${focusRing}`}
                aria-label="Thao tác khác"
                aria-haspopup="dialog"
              >
                <span className="block text-base leading-tight font-bold" aria-hidden="true">
                  ···
                </span>
              </button>
              <button
                type="button"
                onClick={requestClose}
                className={`rounded-full p-1.5 text-tr-subtle transition hover:bg-tr-hover ${focusRing}`}
                aria-label={t.common.close}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
          </div>

          {card.cover_color && (
            <div
              className="mx-3 h-24 rounded-panel"
              style={{ backgroundColor: card.cover_color }}
            />
          )}

          <div
            className={`grid grid-cols-1 gap-6 px-4 pt-3 pb-6 sm:px-6 ${
              presentation === 'drawer' ? '' : 'sm:grid-cols-[1fr_320px]'
            }`}
          >
            {/* ================= Cot trai ================= */}
            <div className="min-w-0">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => update.mutate({ is_done: !card.is_done })}
                  className={`mt-2.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${focusRing} ${
                    card.is_done
                      ? 'border-tr-success bg-tr-success text-tr-on-success'
                      : 'border-tr-muted text-transparent hover:border-tr-text'
                  }`}
                  aria-pressed={Boolean(card.is_done)}
                  aria-label={card.is_done ? t.card.markUndone : t.card.markDone}
                >
                  <Check size={13} aria-hidden="true" />
                </button>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() =>
                    title.trim() && title !== card.title && update.mutate({ title: title.trim() })
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape') setTitle(card.title);
                  }}
                  aria-label="Tiêu đề thẻ"
                  className="w-full rounded-control border-2 border-transparent bg-transparent px-1.5 py-0.5 text-xl leading-tight font-semibold text-tr-text outline-none focus:border-tr-primary focus:bg-tr-surface"
                />
              </div>

              {/* Hang nut hanh dong ngang (giong Trello moi) */}
              <div className="mt-2.5 mb-4 flex flex-wrap gap-1.5 pl-8">
                <ActionChip icon={<Plus size={14} />} onClick={addPop.toggle}>
                  Thêm
                </ActionChip>
                <ActionChip icon={<Clock size={14} />} onClick={datePop.toggle}>
                  Ngày
                </ActionChip>
                <ActionChip icon={<Flag size={14} />} onClick={priorityPop.toggle}>
                  Ưu tiên
                </ActionChip>
                <ActionChip icon={<Building2 size={14} />} onClick={customerPop.toggle}>
                  {t.card.customer}
                </ActionChip>
                <ActionChip icon={<UserRound size={14} />} onClick={assigneePop.toggle}>
                  {t.card.assignee}
                </ActionChip>
                <ActionChip icon={<CircleDot size={14} />} onClick={statusPop.toggle}>
                  Trạng thái
                </ActionChip>
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

              {/* Thuoc tinh */}
              <div className="mb-5 flex flex-wrap items-start gap-x-6 gap-y-3 pl-8">
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

                <Field label={t.card.priority}>
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

                {(card.start_date || card.due_date) && (
                  <Field label="Ngày">
                    <button
                      onClick={datePop.toggle}
                      className="inline-flex min-h-7 items-center gap-1.5 rounded bg-tr-hover px-2.5 text-xs text-tr-text transition hover:bg-tr-hover-strong"
                    >
                      {dateLabel}
                      {!!card.is_done && (
                        <span className="tr-badge-done rounded px-1.5 text-xs font-medium">
                          {t.common.done}
                        </span>
                      )}
                    </button>
                  </Field>
                )}

                {/* Luon hien, ke ca khi chua giao: viec khong co nguoi phu trach la
                    thu can nhin thay chu khong phai thu nen an di. */}
                <Field label="Trạng thái">
                  <button
                    onClick={statusPop.toggle}
                    className={`inline-flex min-h-7 items-center gap-1.5 rounded px-2.5 text-xs font-medium ${CARD_STATUS_TONE[card.status ?? 'todo']}`}
                  >
                    {t.cardStatus[card.status ?? 'todo']}
                  </button>
                </Field>

                <Field label={t.card.assignee}>
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

                <Field label={t.nav.projects}>
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

                {card.customer_name && (
                  <Field label={t.card.customer}>
                    <button
                      onClick={customerPop.toggle}
                      className="inline-flex min-h-7 items-center gap-1.5 rounded bg-tr-hover px-2.5 text-xs text-tr-text transition hover:bg-tr-hover-strong"
                    >
                      <Building2 size={13} /> {card.customer_name}
                      {card.deal_title && (
                        <span className="text-tr-muted">· {card.deal_title}</span>
                      )}
                    </button>
                  </Field>
                )}
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
                hint="Cột dữ liệu riêng của bảng — áp dụng cho mọi thẻ."
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

            {/* ================= Cot phai ================= */}
            <ActivityColumn card={card} />
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
      <div id={bodyId} hidden={!open} className="pl-8">
        {children}
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-1 text-xs font-semibold text-tr-subtle">{label}</h4>
      {children}
    </div>
  );
}

function ActionChip({
  icon,
  children,
  onClick,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-control bg-tr-hover px-2.5 text-xs font-medium text-tr-text transition hover:bg-tr-hover-strong fine:min-h-0 fine:py-1 fine:text-sm ${focusRing}`}
    >
      {icon}
      {children}
    </button>
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
          text: `Đã thêm thẻ này vào danh sách ${card.board?.list_name ?? ''}`,
          at: card.created_at,
        }
      : null,
  ].filter(Boolean) as { text: string; at: string }[];

  const stamp = (value: string) => formatDateTime(value.replace(' ', 'T').slice(0, 16));

  return (
    <aside className="min-w-0">
      <div className="mb-2.5 flex items-center gap-2.5">
        <MessageSquare size={16} className="text-tr-subtle" />
        <h3 className="text-sm font-semibold text-tr-text">Nhận xét và hoạt động</h3>
      </div>

      <textarea
        rows={focused ? 3 : 1}
        value={draft}
        onFocus={() => setFocused(true)}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Viết bình luận…"
        className="tr-card-shadow w-full resize-none rounded-lg border border-tr-border bg-tr-card px-3 py-2 text-sm text-tr-text outline-none focus:border-tr-primary"
      />
      {focused && (
        <div className="mt-2 flex gap-2">
          <button
            disabled={!draft.trim()}
            onClick={() => add.mutate()}
            className="rounded-compact bg-tr-primary px-3 py-1.5 text-sm font-medium text-tr-on-primary transition hover:bg-tr-primary-hover disabled:opacity-50"
          >
            {t.common.save}
          </button>
          <button
            onClick={() => {
              setDraft('');
              setFocused(false);
            }}
            className="rounded-compact px-3 py-1.5 text-sm text-tr-subtle transition hover:bg-tr-hover"
          >
            {t.common.cancel}
          </button>
        </div>
      )}

      <ul className="mt-4 space-y-3">
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
                  className="underline opacity-0 transition group-hover:opacity-100 hover:text-tr-danger"
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
          <input
            type="date"
            value={card.start_date ?? ''}
            onChange={(e) => onChange({ start_date: e.target.value || null })}
            className={POPOVER_INPUT}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-tr-subtle">{t.card.dueDate}</span>
          <input
            type="date"
            value={card.due_date ?? ''}
            onChange={(e) => onChange({ due_date: e.target.value || null })}
            className={POPOVER_INPUT}
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
        hint="Công việc sẽ chuyển sang bảng của dự án và giữ nguyên trạng thái nếu bảng đích có cột tương ứng."
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
          <span className="mb-1 block text-xs font-semibold text-tr-subtle">Bảng</span>
          <Combobox
            value={targetBoardId ?? ''}
            onChange={(v) => {
              if (v !== '') setBoardId(v);
            }}
            options={boards.map((b) => ({ id: b.id, label: b.name }))}
            searchPlaceholder="Tìm bảng…"
            emptyText="Không tìm thấy bảng."
            ariaLabel="Bảng"
            allowClear={false}
            onQuickCreate={async (name) => {
              const created = await api.post<Board>('/api/boards', { name });
              queryClient.invalidateQueries({ queryKey: ['boards'] });
              return { id: created.id, label: created.name };
            }}
            quickCreateLabel={(q) => `+ Tạo bảng "${q}"`}
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
          <input
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className={POPOVER_INPUT}
          />
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
