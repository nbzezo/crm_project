import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Linkedin, Mail, MessageCircle, Pencil, Phone, Plus, Star, Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Button, EmptyState, Field, FormError, Input, Select, Textarea, focusRing } from '../common/ui';
import { t } from '../../i18n/vi';
import type { Contact } from '../../types';

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
  notes: '',
};

/** Màu theo mức độ quan hệ (FR-CON-03). */
const RELATION_COLORS: Record<string, string> = {
  excellent: 'text-tr-success',
  good: 'text-[#94c748]',
  normal: 'text-tr-subtle',
  new: 'text-tr-muted',
  difficult: 'text-tr-danger',
};

export function ContactList({ customerId, contacts }: { customerId: number; contacts: Contact[] }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Contact | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [deleteId, setDeleteId] = useState<number | null>(null);

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
            notes: editing.notes ?? '',
          }
        : EMPTY
    );
  }, [open, editing?.id]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['customer', customerId] });

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

      {contacts.length === 0 ? (
        <EmptyState message="Chưa có người liên hệ nào." />
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
                      <span className="inline-flex items-center gap-0.5 rounded bg-[#fff7d6] px-1.5 py-0.5 text-[10px] font-medium text-[#7f5f01]">
                        <Star size={10} /> {t.contact.primary}
                      </span>
                    )}
                    {c.buying_role && (
                      <span className="rounded bg-tr-hover px-1.5 py-0.5 text-[10px] text-tr-subtle">
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
                <div className="flex gap-0.5 opacity-100 transition group-hover:opacity-100 sm:opacity-0 sm:focus-within:opacity-100">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(c);
                      setOpen(true);
                    }}
                    aria-label={`${t.common.edit}: ${c.full_name}`}
                    className={`flex h-11 w-11 items-center justify-center rounded-control text-tr-muted hover:bg-tr-hover hover:text-tr-text sm:h-7 sm:w-7 ${focusRing}`}
                  >
                    <Pencil size={13} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteId(c.id)}
                    aria-label={`${t.common.delete}: ${c.full_name}`}
                    className={`flex h-11 w-11 items-center justify-center rounded-control text-tr-muted hover:bg-tr-hover hover:text-tr-danger sm:h-7 sm:w-7 ${focusRing}`}
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
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
          <>
            <Button onClick={() => setOpen(false)}>{t.common.cancel}</Button>
            <Button
              variant="primary"
              disabled={!form.full_name.trim() || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? t.common.saving : t.common.save}
            </Button>
          </>
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
            <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </Field>
          <Field label={t.customer.email}>
            <Input value={form.email} onChange={(e) => set('email', e.target.value)} />
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
          <label className="mt-6 flex items-center gap-2 text-sm text-tr-subtle">
            <input
              type="checkbox"
              checked={form.is_primary}
              onChange={(e) => set('is_primary', e.target.checked)}
              className="h-4 w-4 rounded border-tr-border"
            />
            {t.contact.primary}
          </label>
          <div className="sm:col-span-2">
            <Field label={t.customer.notes}>
              <Textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
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
}
