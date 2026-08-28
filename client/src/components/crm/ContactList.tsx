import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Linkedin,
  ListPlus,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Star,
  Trash2,
} from 'lucide-react';
import { api } from '../../api/client';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import {
  Button,
  EmptyState,
  Field,
  FormError,
  FormModalActions,
  IconButton,
  Input,
  Select,
  Textarea,
} from '../common/ui';
import { t } from '../../i18n/vi';
import { useUiStore } from '../../stores/uiStore';
import type { Contact } from '../../types';

/** Handle điều khiển từ bên ngoài — dùng khi CTA "+ Thành viên" nằm ở header của khối cha (company card). */
export interface ContactListHandle {
  openAdd: () => void;
}

const EMPTY = {
  full_name: '',
  title: '',
  department: '',
  phone: '',
  email: '',
  zalo: '',
  linkedin: '',
  buying_role: '',
  relationship: '',
  is_primary: false,
  is_me: false,
  is_active: true,
  notes: '',
};

/** Màu chữ theo mức độ quan hệ (FR-CON-03) — dùng trong card chi tiết. */
const RELATION_COLORS: Record<string, string> = {
  excellent: 'text-tr-success',
  good: 'text-tr-relation-good',
  normal: 'text-tr-subtle',
  new: 'text-tr-muted',
  difficult: 'text-tr-danger',
};

/**
 * Badge nen mo (translucent) theo muc do quan he — dung chung cho hang nhan su gon
 * va cot "Quan he" cua bang to chuc. Tai su dung token badge da co (done/overdue)
 * thay vi bia mau moi, giu dung dark mode chuyen nghiep (khong neon).
 */
export const RELATIONSHIP_BADGE_CLASS: Record<string, string> = {
  excellent: 'tr-badge-done',
  good: 'tr-badge-done',
  normal: 'bg-tr-hover text-tr-subtle',
  new: 'bg-tr-hover text-tr-muted',
  difficult: 'tr-badge-overdue',
};

export const ContactList = forwardRef<
  ContactListHandle,
  { customerId: number; contacts: Contact[]; compact?: boolean }
>(function ContactList({ customerId, contacts, compact = false }, ref) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Contact | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const openTaskComposer = useUiStore((s) => s.openTaskComposer);

  useImperativeHandle(ref, () => ({
    openAdd: () => {
      setEditing(null);
      setOpen(true);
    },
  }));

  useEffect(() => {
    if (!open) return;
    setForm(
      editing
        ? {
            full_name: editing.full_name,
            title: editing.title ?? '',
            department: editing.department ?? '',
            phone: editing.phone ?? '',
            email: editing.email ?? '',
            zalo: editing.zalo ?? '',
            linkedin: editing.linkedin ?? '',
            buying_role: editing.buying_role ?? '',
            relationship: editing.relationship ?? '',
            is_primary: !!editing.is_primary,
            is_me: !!editing.is_me,
            /* Ban ghi cu (truoc v15) da duoc migration dat is_active = 1, nhung
               `?? true` giu form dung ngay ca khi API tra ve thieu cot. */
            is_active: editing.is_active == null ? true : !!editing.is_active,
            notes: editing.notes ?? '',
          }
        : EMPTY
    );
  }, [open, editing?.id]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['customer', customerId] });
    // Danh ba nguoi phu trach doc tu chinh bang contacts — khong nap lai thi cac o
    // chon giao viec van hien ten cu cho toi khi tai lai trang.
    queryClient.invalidateQueries({ queryKey: ['assignees'] });
  };

  const save = useMutation({
    mutationFn: () =>
      editing
        ? api.patch(`/api/contacts/${editing.id}`, form)
        : api.post(`/api/customers/${customerId}/contacts`, form),
    onSuccess: () => {
      refresh();
      setOpen(false);
      setEditing(null);
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/api/contacts/${id}`),
    onSuccess: refresh,
  });

  const set = (key: keyof typeof EMPTY, value: string | boolean) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div>
      {!compact && (
        <div className="mb-3 flex justify-end">
          <Button
            variant="primary"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus size={15} /> {t.contact.addContact}
          </Button>
        </div>
      )}

      {contacts.length === 0 ? (
        <EmptyState message="Chưa có người liên hệ nào." />
      ) : compact ? (
        <div className="divide-y divide-tr-border">
          {contacts.map((c) => (
            <CompactMemberRow
              key={c.id}
              contact={c}
              onEdit={() => {
                setEditing(c);
                setOpen(true);
              }}
              onCreateTask={() => openTaskComposer({ context: { contact_id: c.id } })}
              onDelete={() => setDeleteId(c.id)}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {contacts.map((c) => (
            <div
              key={c.id}
              className="group rounded-lg border border-tr-border bg-tr-panel p-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate font-medium text-tr-text">{c.full_name}</span>
                    {!!c.is_primary && (
                      <span className="inline-flex items-center gap-0.5 rounded bg-tr-warning/15 px-1.5 py-0.5 text-xs font-medium text-tr-warning">
                        <Star size={10} /> {t.contact.primary}
                      </span>
                    )}
                    {!!c.is_me && (
                      <span className="rounded bg-tr-primary/15 px-1.5 py-0.5 text-xs font-medium text-tr-primary">
                        Tôi
                      </span>
                    )}
                    {c.is_active === 0 && (
                      <span className="rounded bg-tr-hover px-1.5 py-0.5 text-xs text-tr-muted">
                        Ngừng hoạt động
                      </span>
                    )}
                    {c.buying_role && (
                      <span className="rounded bg-tr-hover px-1.5 py-0.5 text-xs text-tr-subtle">
                        {t.buyingRole[c.buying_role] ?? c.buying_role}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-tr-muted">
                    {[c.title, c.department].filter(Boolean).join(' · ') || '—'}
                  </div>
                </div>
                {/* opacity-0 + group-hover khien nut vo hinh tren thiet bi cam ung
                    va khi Tab toi — nen hien lai khi nhan focus, va luon hien
                    tren thiet bi khong co con tro di chuot. */}
                <div className="flex gap-0.5 opacity-100 transition group-hover:opacity-100 hoverable:opacity-0 hoverable:focus-within:opacity-100">
                  <IconButton
                    onClick={() => {
                      setEditing(c);
                      setOpen(true);
                    }}
                    label={`${t.common.edit}: ${c.full_name}`}
                  >
                    <Pencil size={13} aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    onClick={() => openTaskComposer({ context: { contact_id: c.id } })}
                    label={`Tạo công việc cho ${c.full_name}`}
                    title="Tạo công việc"
                  >
                    <ListPlus size={13} aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    onClick={() => setDeleteId(c.id)}
                    label={`${t.common.delete}: ${c.full_name}`}
                    tone="danger"
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </IconButton>
                </div>
              </div>

              <div className="mt-2 space-y-1 text-sm">
                {c.phone && (
                  <a
                    href={`tel:${c.phone}`}
                    className="flex items-center gap-1.5 text-tr-subtle hover:text-tr-primary"
                  >
                    <Phone size={13} /> {c.phone}
                  </a>
                )}
                {c.email && (
                  <a
                    href={`mailto:${c.email}`}
                    className="flex items-center gap-1.5 text-tr-subtle hover:text-tr-primary"
                  >
                    <Mail size={13} /> {c.email}
                  </a>
                )}
                {c.zalo && (
                  <span className="flex items-center gap-1.5 text-tr-subtle">
                    <MessageCircle size={13} /> Zalo: {c.zalo}
                  </span>
                )}
                {c.linkedin && (
                  <a
                    href={c.linkedin.startsWith('http') ? c.linkedin : `https://${c.linkedin}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-tr-subtle hover:text-tr-primary"
                  >
                    <Linkedin size={13} /> LinkedIn
                  </a>
                )}
              </div>

              {c.relationship && (
                <div
                  className={`mt-2 text-xs font-medium ${RELATION_COLORS[c.relationship] ?? 'text-tr-subtle'}`}
                >
                  Quan hệ: {t.relationship[c.relationship] ?? c.relationship}
                </div>
              )}
              {c.notes && <p className="mt-1 text-xs text-tr-muted">{c.notes}</p>}
            </div>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `${t.common.edit}: ${editing.full_name}` : t.contact.addContact}
        width="max-w-2xl"
        footer={
          <FormModalActions
            onCancel={() => setOpen(false)}
            onSubmit={() => save.mutate()}
            pending={save.isPending}
            disabled={!form.full_name.trim()}
          />
        }
      >
        <FormError error={save.error} />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t.contact.fullName} required>
            <Input
              autoFocus
              value={form.full_name}
              onChange={(e) => set('full_name', e.target.value)}
            />
          </Field>
          <Field label={t.contact.title}>
            <Input value={form.title} onChange={(e) => set('title', e.target.value)} />
          </Field>
          <Field label="Phòng ban">
            <Input value={form.department} onChange={(e) => set('department', e.target.value)} />
          </Field>
          <Field label="Vai trò trong quyết định mua">
            <Select value={form.buying_role} onChange={(e) => set('buying_role', e.target.value)}>
              <option value="">— {t.common.none} —</option>
              {Object.entries(t.buyingRole).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.customer.phone}>
            <Input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
            />
          </Field>
          <Field label={t.customer.email}>
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
            />
          </Field>
          <Field label={t.contact.zalo}>
            <Input value={form.zalo} onChange={(e) => set('zalo', e.target.value)} />
          </Field>
          <Field label="LinkedIn">
            <Input value={form.linkedin} onChange={(e) => set('linkedin', e.target.value)} />
          </Field>
          <Field label="Mức độ quan hệ">
            <Select value={form.relationship} onChange={(e) => set('relationship', e.target.value)}>
              <option value="">— {t.common.none} —</option>
              {Object.entries(t.relationship).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="mt-6 space-y-1.5">
            <label className="flex items-center gap-2 text-sm text-tr-subtle">
              <input
                type="checkbox"
                checked={form.is_primary}
                onChange={(e) => set('is_primary', e.target.checked)}
                className="h-4 w-4 rounded border-tr-border"
              />
              {t.contact.primary}
            </label>
            <label className="flex items-center gap-2 text-sm text-tr-subtle">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => set('is_active', e.target.checked)}
                className="h-4 w-4 rounded border-tr-border"
              />
              Đang hoạt động
              <span className="text-xs text-tr-muted">(tắt thì ẩn khỏi ô giao việc)</span>
            </label>
            {/* "Tôi" là duy nhất toàn sổ danh bạ — bật ở đây thì bản ghi cũ tự tắt. */}
            <label className="flex items-center gap-2 text-sm text-tr-subtle">
              <input
                type="checkbox"
                checked={form.is_me}
                onChange={(e) => set('is_me', e.target.checked)}
                className="h-4 w-4 rounded border-tr-border"
              />
              Đây là tôi
              <span className="text-xs text-tr-muted">(dùng cho bộ lọc “{t.card.mine}”)</span>
            </label>
          </div>
          <div className="sm:col-span-2">
            <Field label={t.customer.notes}>
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
              />
            </Field>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteId !== null}
        message="Xóa người liên hệ này?"
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) remove.mutate(deleteId);
          setDeleteId(null);
        }}
      />
    </div>
  );
});

/** Hàng nhân sự gọn — thay cho card lớn khi hiển thị trong company card / hàng mở rộng của tổ chức. */
function CompactMemberRow({
  contact: c,
  onEdit,
  onCreateTask,
  onDelete,
}: {
  contact: Contact;
  onEdit: () => void;
  onCreateTask: () => void;
  onDelete: () => void;
}) {
  const initials =
    c.full_name
      .trim()
      .split(/\s+/)
      .slice(-2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || '?';

  return (
    <div className="group flex items-center gap-3 px-1 py-2 transition hover:bg-tr-hover">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tr-hover-strong text-xs font-semibold text-tr-subtle">
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-medium text-tr-text">{c.full_name}</span>
          {!!c.is_me && (
            <span className="rounded bg-tr-primary/15 px-1.5 py-0.5 text-xs font-medium text-tr-primary">
              Tôi
            </span>
          )}
          {!!c.is_primary && (
            <span className="inline-flex items-center gap-0.5 rounded bg-tr-warning/15 px-1.5 py-0.5 text-xs font-medium text-tr-warning">
              <Star size={10} /> {t.contact.primary}
            </span>
          )}
          {c.is_active === 0 && (
            <span className="rounded bg-tr-hover px-1.5 py-0.5 text-xs text-tr-muted">
              Ngừng hoạt động
            </span>
          )}
        </div>
        <div className="truncate text-xs text-tr-muted">
          {[c.title, c.department].filter(Boolean).join(' · ') || '—'}
        </div>
      </div>
      {c.relationship && (
        <span
          className={`hidden shrink-0 rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap sm:inline-block ${
            RELATIONSHIP_BADGE_CLASS[c.relationship] ?? 'bg-tr-hover text-tr-subtle'
          }`}
        >
          ● {t.relationship[c.relationship] ?? c.relationship}
        </span>
      )}
      <div className="flex shrink-0 gap-0.5 opacity-100 transition group-hover:opacity-100 hoverable:opacity-0 hoverable:focus-within:opacity-100">
        <IconButton onClick={onEdit} label={`${t.common.edit}: ${c.full_name}`}>
          <Pencil size={13} aria-hidden="true" />
        </IconButton>
        <IconButton
          onClick={onCreateTask}
          label={`Tạo công việc cho ${c.full_name}`}
          title="Tạo công việc"
        >
          <ListPlus size={13} aria-hidden="true" />
        </IconButton>
        <IconButton onClick={onDelete} label={`${t.common.delete}: ${c.full_name}`} tone="danger">
          <Trash2 size={13} aria-hidden="true" />
        </IconButton>
      </div>
    </div>
  );
}
