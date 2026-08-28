import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Archive,
  ArchiveRestore,
  Bell,
  Link2,
  MoreHorizontal,
  Paperclip,
  Palette,
  Pin,
  PinOff,
  Trash2,
  X,
} from 'lucide-react';
import { Button, Field, focusRing } from '../common/ui';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Popover, usePopover } from '../common/Popover';
import { Combobox } from '../common/Combobox';
import { useDialog } from '../common/useDialog';
import { useCustomerOptions, useDealOptions, useProjectOptions } from '../../lib/useCrmOptions';
import { useThemeStore } from '../../stores/themeStore';
import { useUiStore } from '../../stores/uiStore';
import { formatDateTime } from '../../lib/format';
import { colorForNote, QUICK_NOTE_COLORS } from './palette';
import { LazyQuickNoteBody } from './LazyQuickNoteBody';
import { QuickNoteAttachments } from './QuickNoteAttachments';
import { QuickNoteRelations } from './QuickNoteRelations';
import { useQuickNoteMutations } from './useQuickNotes';
import type { QuickNote } from '../../types';

/** Modal chon Customer/Deal/Project khi "Chuyển thành CRM Note" (FR16). */
function ConvertToCrmNoteDialog({
  open,
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  pending: boolean;
  onClose: () => void;
  onConfirm: (links: {
    customer_id: number | null;
    deal_id: number | null;
    project_id: number | null;
  }) => void;
}) {
  const [customerId, setCustomerId] = useState<number | ''>('');
  const [dealId, setDealId] = useState<number | ''>('');
  const [projectId, setProjectId] = useState<number | ''>('');
  const { data: customers = [] } = useCustomerOptions(open);
  const { data: deals = [] } = useDealOptions(open);
  const { data: projects = [] } = useProjectOptions(open);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Chuyển thành ghi chú CRM"
      width="max-w-md"
      footer={
        <>
          <Button onClick={onClose}>Huỷ</Button>
          <Button
            variant="primary"
            disabled={pending || (customerId === '' && dealId === '' && projectId === '')}
            onClick={() =>
              onConfirm({
                customer_id: customerId === '' ? null : customerId,
                deal_id: dealId === '' ? null : dealId,
                project_id: projectId === '' ? null : projectId,
              })
            }
          >
            {pending ? 'Đang tạo…' : 'Tạo ghi chú CRM'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-tr-subtle">
          Chọn ít nhất một Khách hàng, Cơ hội hoặc Dự án để lưu nội dung này thành ghi chú CRM chính
          thức. Ghi chú nhanh gốc vẫn được giữ nguyên.
        </p>
        <Field label="Khách hàng" hint="Không bắt buộc">
          <Combobox
            value={customerId}
            onChange={setCustomerId}
            options={customers.map((c) => ({ id: c.id, label: c.name }))}
            ariaLabel="Khách hàng"
          />
        </Field>
        <Field label="Cơ hội" hint="Không bắt buộc">
          <Combobox
            value={dealId}
            onChange={setDealId}
            options={deals.map((d) => ({ id: d.id, label: d.title, sublabel: d.customer_name }))}
            ariaLabel="Cơ hội"
          />
        </Field>
        <Field label="Dự án" hint="Không bắt buộc">
          <Combobox
            value={projectId}
            onChange={setProjectId}
            options={projects.map((p) => ({ id: p.id, label: p.name }))}
            ariaLabel="Dự án"
          />
        </Field>
      </div>
    </Modal>
  );
}

/** Noi dung menu "..." — moi thu KHONG co trong Sticky Notes that (Tag/Reminder/CRM/Convert). */
function MoreMenu({
  note,
  liveTitle,
  liveContentText,
  flushNow,
}: {
  note: QuickNote;
  /** Tieu de/noi dung dang go DO — co the chua kip qua 800ms debounce cua ActiveCard. */
  liveTitle: string;
  liveContentText: string;
  /** Luu ngay lap tuc (bo qua debounce) — goi truoc khi chuyen doi sang CRM Note,
   * vi endpoint do doc noi dung THANG tu CSDL, khong qua client nhu Convert Task. */
  flushNow: () => Promise<unknown>;
}) {
  const openTaskComposer = useUiStore((s) => s.openTaskComposer);
  const { setArchived, syncRelations, markConvertedToTask, convertToCrmNote } =
    useQuickNoteMutations();
  const [tags, setTags] = useState(note.tags);
  const [tagDraft, setTagDraft] = useState('');
  const [reminderAt, setReminderAt] = useState(note.reminder_at ?? '');
  const [convertOpen, setConvertOpen] = useState(false);
  const { update } = useQuickNoteMutations();

  const saveTags = (next: string[]) => {
    setTags(next);
    update.mutate({ id: note.id, patch: { tags: next } });
  };
  const addTag = () => {
    const value = tagDraft.trim();
    if (value && !tags.includes(value)) saveTags([...tags, value]);
    setTagDraft('');
  };
  const saveReminder = (value: string) => {
    setReminderAt(value);
    update.mutate({ id: note.id, patch: { reminder_at: value || null } });
  };

  return (
    <div className="w-72">
      <div className="mb-3">
        <div className="mb-1.5 text-xs font-semibold tracking-wide text-tr-muted uppercase">
          Màu
        </div>
        <ColorPickerMenu note={note} />
      </div>

      <div className="mb-3">
        <div className="mb-1.5 text-xs font-semibold tracking-wide text-tr-muted uppercase">
          Tag
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-tr-hover px-2.5 py-1 text-xs text-tr-text"
            >
              #{tag}
              <button
                type="button"
                aria-label={`Bỏ tag ${tag}`}
                onClick={() => saveTags(tags.filter((t) => t !== tag))}
                className="rounded-full p-0.5 hover:bg-tr-hover-strong"
              >
                <X size={11} />
              </button>
            </span>
          ))}
          <input
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTag();
              }
            }}
            onBlur={addTag}
            placeholder="+ Thêm tag"
            aria-label="Thêm tag"
            className={`min-w-20 flex-1 rounded-control bg-transparent px-2 py-1 text-xs text-tr-text outline-none placeholder:text-tr-muted ${focusRing}`}
          />
        </div>
      </div>

      <div className="mb-3">
        <div className="mb-1.5 text-xs font-semibold tracking-wide text-tr-muted uppercase">
          Reminder
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="datetime-local"
            value={reminderAt}
            onChange={(e) => saveReminder(e.target.value)}
            aria-label="Thời gian nhắc"
            className={`rounded-control border border-tr-border bg-tr-list px-2 py-1 text-xs text-tr-text outline-none focus:border-tr-primary ${focusRing}`}
          />
          {reminderAt && (
            <Button size="sm" onClick={() => saveReminder('')}>
              Huỷ nhắc
            </Button>
          )}
        </div>
      </div>

      <div className="mb-3">
        <div className="mb-1.5 text-xs font-semibold tracking-wide text-tr-muted uppercase">
          Gắn vào CRM
        </div>
        <QuickNoteRelations
          relations={note.relations}
          onChange={(relations) => syncRelations.mutate({ id: note.id, relations })}
        />
      </div>

      <div className="mb-3">
        <div className="mb-1.5 text-xs font-semibold tracking-wide text-tr-muted uppercase">
          Đính kèm file
        </div>
        <QuickNoteAttachments noteId={note.id} />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-tr-border pt-3">
        <Button
          size="sm"
          onClick={() =>
            openTaskComposer({
              context: {},
              draft: {
                title: liveTitle.trim() || 'Việc từ ghi chú nhanh',
                description: liveContentText,
              },
              onCreated: (card) => markConvertedToTask.mutate({ id: note.id, cardId: card.id }),
            })
          }
        >
          Chuyển thành Task
        </Button>
        <Button size="sm" onClick={() => setConvertOpen(true)}>
          Chuyển thành ghi chú CRM
        </Button>
        <Button
          size="sm"
          onClick={() => setArchived.mutate({ id: note.id, archived: !note.archived_at })}
        >
          {note.archived_at ? (
            <>
              <ArchiveRestore size={13} /> Bỏ lưu trữ
            </>
          ) : (
            <>
              <Archive size={13} /> Lưu trữ
            </>
          )}
        </Button>
        {note.converted_to_type && (
          <span className="w-full text-xs text-tr-muted">
            Đã chuyển đổi thành{' '}
            {note.converted_to_type === 'task'
              ? `Task #${note.converted_to_id}`
              : `Ghi chú CRM #${note.converted_to_id}`}
          </span>
        )}
      </div>

      <ConvertToCrmNoteDialog
        open={convertOpen}
        pending={convertToCrmNote.isPending}
        onClose={() => setConvertOpen(false)}
        onConfirm={async (links) => {
          // Endpoint /convert/crm-note doc noi dung THANG tu CSDL — phai luu
          // xong phan vua go (co the chua qua 800ms debounce) truoc khi goi.
          await flushNow();
          convertToCrmNote.mutate(
            { id: note.id, links },
            { onSuccess: () => setConvertOpen(false) }
          );
        }}
      />
    </div>
  );
}

/** Popup 12 mau + "dùng lại màu tự động" — dung chung cho hover nhanh tren the va MoreMenu day du. */
function ColorPickerMenu({ note }: { note: QuickNote }) {
  const { update } = useQuickNoteMutations();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {QUICK_NOTE_COLORS.map((c) => (
        <button
          key={c.key}
          type="button"
          aria-label={`Đổi màu ${c.name}`}
          aria-pressed={colorForNote(note.id, note.color).key === c.key}
          onClick={() => update.mutate({ id: note.id, patch: { color: c.key } })}
          className={`h-6 w-6 shrink-0 rounded-full ring-offset-2 transition ${
            colorForNote(note.id, note.color).key === c.key ? 'ring-2 ring-tr-primary' : ''
          }`}
          style={{ backgroundColor: c.bgLight }}
        />
      ))}
      {note.color && (
        <button
          type="button"
          aria-label="Dùng lại màu tự động"
          onClick={() => update.mutate({ id: note.id, patch: { color: null } })}
          className="ml-1 rounded-full p-1 text-tr-muted hover:bg-tr-hover-strong"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

function PreviewCard({
  note,
  bg,
  fg,
  layout = 'grid',
  onActivate,
}: {
  note: QuickNote;
  bg: string;
  fg: string;
  layout?: 'grid' | 'list';
  onActivate: () => void;
}) {
  const { setPinned, setArchived, remove, restore, permanentlyDelete } = useQuickNoteMutations();
  const colorPopover = usePopover();
  const [confirmForever, setConfirmForever] = useState(false);
  const preview = note.content_text.trim();
  const isList = layout === 'list';

  return (
    <div
      className={`group relative rounded-lg shadow-sm transition hover:shadow-md ${isList ? 'p-2' : 'p-2.5'}`}
      style={{ backgroundColor: bg, color: fg }}
    >
      <button
        type="button"
        // Ghi chu trong Thung rac chi xem/khoi phuc duoc, khong mo sang che do
        // sua — ActiveCard se autosave va bi may chu tu choi (404) vi ban ghi
        // da `deleted_at`, mat am tham khong bao loi cho nguoi dung.
        onClick={note.deleted_at ? undefined : onActivate}
        disabled={Boolean(note.deleted_at)}
        className="block w-full text-left disabled:cursor-default"
        aria-label={`${note.deleted_at ? 'Xem' : 'Mở'} ghi chú: ${note.title || 'Ghi chú không tiêu đề'}`}
      >
        <div className={`pr-28 text-sm font-semibold break-words ${isList ? 'truncate' : ''}`}>
          {note.title || 'Ghi chú không tiêu đề'}
        </div>
        {preview && (
          <div
            className={`mt-1 text-xs break-words whitespace-pre-line opacity-90 ${
              isList ? 'truncate' : 'line-clamp-[12]'
            }`}
          >
            {preview}
          </div>
        )}
      </button>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs opacity-80">
        <span>{formatDateTime(note.updated_at.replace(' ', 'T').slice(0, 16))}</span>
        {note.reminder_at && (
          <span className="inline-flex items-center gap-0.5">
            <Bell size={11} aria-hidden="true" />
          </span>
        )}
        {note.relations.length > 0 && (
          <span className="inline-flex items-center gap-0.5">
            <Link2 size={11} aria-hidden="true" />
          </span>
        )}
        {note.attachment_count > 0 && (
          <span className="inline-flex items-center gap-0.5">
            <Paperclip size={11} aria-hidden="true" /> {note.attachment_count}
          </span>
        )}
        {note.tags.map((tag) => (
          <span key={tag} className="rounded-full bg-black/10 px-1.5 py-0.5 leading-none">
            #{tag}
          </span>
        ))}
      </div>

      {/* Nut hover: bam duoc ma khong can mo ghi chu, giong Sticky Notes that + Google Keep. */}
      <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
        {note.deleted_at ? (
          <>
            <button
              type="button"
              aria-label="Khôi phục ghi chú"
              onClick={() => restore.mutate(note.id)}
              className="rounded-full p-1.5 hover:bg-black/10"
              style={{ color: fg }}
            >
              <ArchiveRestore size={14} />
            </button>
            <button
              type="button"
              aria-label="Xoá vĩnh viễn"
              onClick={() => setConfirmForever(true)}
              className="rounded-full p-1.5 hover:bg-black/10"
              style={{ color: fg }}
            >
              <Trash2 size={14} />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              aria-label="Đổi màu"
              onClick={colorPopover.show}
              className="rounded-full p-1.5 hover:bg-black/10"
              style={{ color: fg }}
            >
              <Palette size={14} />
            </button>
            <button
              type="button"
              aria-label={note.archived_at ? 'Bỏ lưu trữ' : 'Lưu trữ ghi chú'}
              onClick={() => setArchived.mutate({ id: note.id, archived: !note.archived_at })}
              className="rounded-full p-1.5 hover:bg-black/10"
              style={{ color: fg }}
            >
              {note.archived_at ? <ArchiveRestore size={14} /> : <Archive size={14} />}
            </button>
            <button
              type="button"
              aria-label={note.is_pinned ? 'Bỏ ghim' : 'Ghim ghi chú'}
              onClick={() => setPinned.mutate({ id: note.id, pinned: !note.is_pinned })}
              className="rounded-full p-1.5 hover:bg-black/10"
              style={{ color: fg }}
            >
              {note.is_pinned ? <PinOff size={14} /> : <Pin size={14} />}
            </button>
            <button
              type="button"
              aria-label="Xoá ghi chú"
              onClick={() => {
                remove.mutate(note.id, {
                  onSuccess: () =>
                    useUiStore.getState().pushToast('Đã xoá ghi chú', 'success', {
                      label: 'Hoàn tác',
                      run: () => restore.mutate(note.id),
                    }),
                });
              }}
              className="rounded-full p-1.5 hover:bg-black/10"
              style={{ color: fg }}
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>

      {Boolean(note.is_pinned) && (
        <Pin
          size={12}
          className="absolute top-2 left-2 opacity-70"
          style={{ color: fg }}
          aria-hidden="true"
        />
      )}

      <Popover
        open={colorPopover.open}
        onClose={colorPopover.close}
        anchor={colorPopover.anchor}
        title="Đổi màu"
        width={252}
      >
        <ColorPickerMenu note={note} />
      </Popover>

      <ConfirmDialog
        open={confirmForever}
        title="Xoá vĩnh viễn ghi chú"
        message="Ghi chú và toàn bộ tệp đính kèm của nó sẽ bị xoá vĩnh viễn, không thể khôi phục."
        confirmLabel="Xoá vĩnh viễn"
        onConfirm={() => {
          permanentlyDelete.mutate(note.id);
          setConfirmForever(false);
        }}
        onCancel={() => setConfirmForever(false)}
      />
    </div>
  );
}

/**
 * Noi dung ghi chu dang mo — luon hien trong QuickNoteEditorModal (phong to,
 * can giua man hinh, xem export o cuoi file), khong con nam lan trong luoi
 * nhu truoc: giong cach Google Keep phong to mot ghi chu ra giua man hinh
 * thay vi mo rong tai cho trong luoi.
 */
function ActiveCard({
  note,
  bg,
  fg,
  onDeactivate,
}: {
  note: QuickNote;
  bg: string;
  fg: string;
  onDeactivate: () => void;
}) {
  const { update, setPinned, remove, restore, discardIfEmpty } = useQuickNoteMutations();
  const [title, setTitle] = useState(note.title);
  const bodyRef = useRef({ contentJson: note.content_json, contentText: note.content_text });
  const [bodyVersion, setBodyVersion] = useState(0);
  const skipNextSave = useRef(true);
  /** Da xoa tuong minh qua nut Xoa — cleanup luc unmount khong duoc flush/discard lai (xem duoi). */
  const finishedRef = useRef(false);
  const latestTitleRef = useRef(title);
  latestTitleRef.current = title;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);

  const buildPatch = () => ({
    title: latestTitleRef.current,
    content_json: bodyRef.current.contentJson,
    content_text: bodyRef.current.contentText,
  });

  /**
   * Luu ngay lap tuc, bo qua debounce — dung truoc khi "Chuyển thành ghi chú
   * CRM" (endpoint do doc noi dung THANG tu CSDL nen phai luu xong truoc).
   */
  const flushNow = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (skipNextSave.current) return Promise.resolve();
    return update.mutateAsync({ id: note.id, patch: buildPatch() });
  };

  useEffect(() => {
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    timeoutRef.current = setTimeout(() => update.mutate({ id: note.id, patch: buildPatch() }), 800);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [title, bodyVersion]);

  /**
   * Dong ActiveCard (Đóng/Escape/bam nen, xem QuickNoteEditorModal) luon UNMOUNT
   * component nay — dung luc cleanup nay chay. Hai viec:
   * 1) Flush neu con thay doi chua kip qua 800ms debounce (khong thi mat trang vua go).
   * 2) Sau khi chac chan da luu xong, tu huy ghi chu neu no HOAN TOAN rong —
   *    giong Google Keep, tranh rac danh sach voi ghi chu rong (xem discardIfEmptyQuickNote).
   * `finishedRef` chan ca hai buoc nay khi ghi chu da bi xoa tuong minh qua nut
   * Xoa (xem duoi) — ban ghi da co `deleted_at`, flush lai se 404 vo ich.
   *
   * Hoan viec nay lai mot nhip (setTimeout 0) thay vi chay THANG trong cleanup:
   * StrictMode (dev) mount-cleanup-mount lai MOI component ngay khi no vua mo de
   * do bug — luc do effect nay CUNG bi "dong roi mo lai" gia dung y muon dong that
   * su, dan toi tu huy nham mot ghi chu vua tao con dang mo tren man hinh. Neu day
   * la remount gia, setup ngay sau do se huy kip lich hen truoc khi no kip chay;
   * dong that su thi khong co setup nao theo sau nen se chay dung nhu du dinh.
   */
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    return () => {
      closeTimerRef.current = setTimeout(() => {
        closeTimerRef.current = null;
        if (finishedRef.current) return;
        // `.mutate(vars, {onSuccess})` khong dang tin cay goi lai duoc sau khi
        // component da unmount (da kiem chung) — dung mutateAsync().then() la
        // mot Promise thuan, khong phu thuoc vong doi component.
        flushNow()
          .then(() => discardIfEmpty.mutateAsync(note.id))
          .catch(() => {});
      }, 0);
    };
  }, [note.id]);

  const saveStatus = update.isPending ? 'Đang lưu…' : update.isSuccess ? 'Đã lưu' : '';

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: bg, color: fg }}>
      <div className="flex items-start gap-2 px-5 pt-5 pb-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Tiêu đề"
          aria-label="Tiêu đề ghi chú nhanh"
          className={`w-full min-w-0 rounded-control border border-transparent bg-transparent px-1 py-0.5 text-lg font-semibold outline-none placeholder:opacity-50 focus:border-current/30 ${focusRing}`}
          style={{ color: fg }}
        />
        <button
          type="button"
          aria-label={note.is_pinned ? 'Bỏ ghim' : 'Ghim ghi chú'}
          onClick={() => setPinned.mutate({ id: note.id, pinned: !note.is_pinned })}
          className="mt-0.5 shrink-0 rounded-full p-1.5 hover:bg-black/10"
          style={{ color: fg }}
        >
          {note.is_pinned ? <PinOff size={18} /> : <Pin size={18} />}
        </button>
      </div>

      <div className="tr-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-3">
        <LazyQuickNoteBody
          noteId={note.id}
          initialContentJson={note.content_json}
          onChange={(payload) => {
            bodyRef.current = payload;
            setBodyVersion((v) => v + 1);
          }}
        />
      </div>

      <div className="flex items-center gap-0.5 border-t border-current/15 px-3 py-1.5">
        <div className="flex items-center gap-0.5">
          <button
            ref={moreButtonRef}
            type="button"
            aria-label="Tuỳ chọn khác"
            onClick={() => setMoreOpen((v) => !v)}
            className="shrink-0 rounded-full p-2 hover:bg-black/10"
            style={{ color: fg }}
          >
            <MoreHorizontal size={16} />
          </button>
          <button
            type="button"
            aria-label="Xoá ghi chú"
            onClick={() =>
              remove.mutate(note.id, {
                onSuccess: () => {
                  finishedRef.current = true;
                  onDeactivate();
                  useUiStore.getState().pushToast('Đã xoá ghi chú', 'success', {
                    label: 'Hoàn tác',
                    run: () => restore.mutate(note.id),
                  });
                },
              })
            }
            className="shrink-0 rounded-full p-2 hover:bg-black/10"
            style={{ color: fg }}
          >
            <Trash2 size={16} />
          </button>
        </div>
        <span className="flex-1 truncate px-1 text-right text-xs opacity-70">{saveStatus}</span>
        <Button size="sm" onClick={onDeactivate}>
          Đóng
        </Button>
      </div>

      <Popover
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        anchor={moreButtonRef.current}
        title="Tuỳ chọn khác"
        width={328}
      >
        <MoreMenu
          note={note}
          liveTitle={title}
          liveContentText={bodyRef.current.contentText}
          flushNow={flushNow}
        />
      </Popover>
    </div>
  );
}

export function QuickNoteCard({
  note,
  layout = 'grid',
  onActivate,
}: {
  note: QuickNote;
  layout?: 'grid' | 'list';
  onActivate: () => void;
}) {
  const isDark = useThemeStore((s) => s.isDark());
  const color = colorForNote(note.id, note.color);
  const bg = isDark ? color.bgDark : color.bgLight;
  const fg = isDark ? color.textDark : color.textLight;

  return <PreviewCard note={note} bg={bg} fg={fg} layout={layout} onActivate={onActivate} />;
}

/**
 * Lop overlay giong Google Keep: bam mo mot ghi chu se phong to no ra giua man
 * hinh (thay vi mo rong tai cho trong luoi nhu ban dau) — luoi ghi chu phia
 * sau van hien nhung mo di qua lop nen toi.
 */
export function QuickNoteEditorModal({ note, onClose }: { note: QuickNote; onClose: () => void }) {
  const isDark = useThemeStore((s) => s.isDark());
  const color = colorForNote(note.id, note.color);
  const bg = isDark ? color.bgDark : color.bgLight;
  const fg = isDark ? color.textDark : color.textLight;
  const panelRef = useRef<HTMLDivElement>(null);

  useDialog({ open: true, onClose, containerRef: panelRef });

  return createPortal(
    <div
      className="tr-anim-fade fixed inset-0 z-modal flex items-center justify-center bg-tr-overlay p-4 sm:p-8"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={note.title || 'Ghi chú không tiêu đề'}
        className="tr-anim-pop flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-modal shadow-2xl"
      >
        <ActiveCard key={note.id} note={note} bg={bg} fg={fg} onDeactivate={onClose} />
      </div>
    </div>,
    document.body
  );
}
