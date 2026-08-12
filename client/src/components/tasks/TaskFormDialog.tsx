import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { api, qs } from '../../api/client';
import { Modal } from '../common/Modal';
import { Button, DateInput, Field, FormError, Input, Select, Textarea } from '../common/ui';
import { PRIORITY_ORDER, t } from '../../i18n/vi';
import { invalidateCardViews, invalidateCrmViews } from '../../lib/queryKeys';
import { useUiStore, type TaskContext } from '../../stores/uiStore';
import type { Card, Customer, Priority } from '../../types';

/** Cac khoa lien ket mot cong viec co the mang, theo thu tu tu tong quat den cu the. */
const LINK_KEYS = ['customer_id', 'contact_id', 'deal_id', 'contract_id', 'quotation_id'] as const;
type LinkKey = (typeof LINK_KEYS)[number];

const LINK_LABELS: Record<LinkKey, string> = {
  customer_id: t.card.customer,
  contact_id: 'Người liên hệ',
  deal_id: t.card.deal,
  contract_id: 'Hợp đồng',
  quotation_id: 'Báo giá',
};

interface TaskContextResponse {
  links: Record<LinkKey, number | null>;
  display: {
    customer_name: string | null;
    contact_name: string | null;
    deal_title: string | null;
    contract_name: string | null;
    quotation_code: string | null;
  };
  suggested_list_id: number | null;
  boards: { id: number; name: string; customer_id: number | null }[];
  lists: { id: number; name: string; board_id: number }[];
  contacts: { id: number; full_name: string; title: string | null }[];
  deals: { id: number; title: string; stage: string }[];
  contracts: { id: number; name: string; number: string | null; status: string }[];
  quotations: { id: number; code: string | null; version: number; status: string }[];
}

const DISPLAY_KEY: Record<LinkKey, keyof TaskContextResponse['display']> = {
  customer_id: 'customer_name',
  contact_id: 'contact_name',
  deal_id: 'deal_title',
  contract_id: 'contract_name',
  quotation_id: 'quotation_code',
};

/**
 * Form tao cong viec dung chung cho moi module.
 *
 * Mount mot lan o App va dieu khien qua uiStore.taskComposer — moi trang chi can goi
 * openTaskComposer({ context: { deal_id } }) ma khong phai tu ghep lai form.
 *
 * Cac lua chon lien ket khong duoc tinh o client: moi lan doi mot khoa, form hoi lai
 * GET /api/cards/context de server suy dien cap tren va tra ve dung tap ung vien.
 * Nho vay quy tac chuoi so huu chi ton tai o mot noi.
 */
export function TaskFormDialog() {
  const composer = useUiStore((s) => s.taskComposer);
  const close = useUiStore((s) => s.closeTaskComposer);
  const openCard = useUiStore((s) => s.openCard);
  const pushToast = useUiStore((s) => s.pushToast);
  const queryClient = useQueryClient();
  const open = composer !== null;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [startDate, setStartDate] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [listId, setListId] = useState<number | ''>('');
  const [checklistText, setChecklistText] = useState('');
  /** Lua chon lien ket cua nguoi dung — dau vao cho truy van ngu canh. */
  const [links, setLinks] = useState<TaskContext>({});
  /** Khoa duoc mo dau vao: hien dang khoa cho toi khi nguoi dung bam "Đổi". */
  const [anchors, setAnchors] = useState<LinkKey[]>([]);
  const [submitted, setSubmitted] = useState(false);
  /** Nguoi dung da tu chon danh sach thi khong de goi y cua server ghi de nua. */
  const [listTouched, setListTouched] = useState(false);

  const { data: context } = useQuery({
    queryKey: ['card-context', links],
    queryFn: () => api.get<TaskContextResponse>(`/api/cards/context${qs({ ...links })}`),
    enabled: open,
  });
  const { data: customers = [] } = useQuery({
    queryKey: ['customers', 'select'],
    queryFn: () => api.get<Customer[]>('/api/customers'),
    staleTime: 60_000,
    enabled: open,
  });

  useEffect(() => {
    if (!composer) return;
    setTitle(composer.draftTitle ?? '');
    setDescription('');
    setPriority('medium');
    setStartDate(null);
    setDueDate(null);
    setChecklistText('');
    setListId(composer.listId ?? '');
    setListTouched(composer.listId !== undefined);
    setLinks(composer.context);
    setAnchors(LINK_KEYS.filter((key) => composer.context[key] != null));
    setSubmitted(false);
    save.reset();
  }, [composer]);

  // Goi y danh sach chi ap dung khi nguoi dung chua tu chon.
  useEffect(() => {
    if (!listTouched && context?.suggested_list_id) setListId(context.suggested_list_id);
  }, [context?.suggested_list_id, listTouched]);

  const derived = context?.links;
  const valueOf = (key: LinkKey): number | '' => derived?.[key] ?? links[key] ?? '';
  const boardId = useMemo(
    () => context?.lists.find((l) => l.id === listId)?.board_id ?? '',
    [context?.lists, listId]
  );

  /**
   * Doi mot khoa thi phai bo cac khoa cu the hon: chung thuoc ve thuc the cu va
   * server se tu choi bang 422 CROSS_CUSTOMER_LINK neu con giu lai.
   */
  const changeLink = (key: LinkKey, value: number | null) => {
    const cutoff = LINK_KEYS.indexOf(key);
    const next: TaskContext = {};
    for (const other of LINK_KEYS.slice(0, cutoff)) {
      const current = valueOf(other);
      if (current !== '') next[other] = current;
    }
    if (value != null) next[key] = value;
    setLinks(next);
    setAnchors((prev) => prev.filter((k) => next[k] != null));
  };

  const save = useMutation({
    mutationFn: () =>
      api.post<Card>('/api/cards', {
        list_id: listId === '' ? null : listId,
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        start_date: startDate,
        due_date: dueDate,
        ...Object.fromEntries(
          LINK_KEYS.map((key) => [key, valueOf(key) === '' ? null : valueOf(key)])
        ),
        checklist: checklistText
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
      }),
    onSuccess: (created) => {
      invalidateCardViews(queryClient, boardId === '' ? undefined : boardId);
      invalidateCrmViews(queryClient, created.customer_id ?? undefined);
      pushToast('Đã tạo công việc', 'success', {
        label: 'Mở công việc',
        run: () => openCard(created.id),
      });
      close();
    },
  });

  const titleMissing = !title.trim();
  const listMissing = listId === '';
  const dirty = Boolean(title.trim() || description.trim() || checklistText.trim());

  return (
    <Modal
      open={open}
      onClose={close}
      width="max-w-3xl"
      title="Tạo công việc"
      dirty={dirty && !save.isPending}
      footer={
        <>
          <Button onClick={close}>{t.common.cancel}</Button>
          <Button
            variant="primary"
            disabled={titleMissing || listMissing || save.isPending}
            onClick={() => {
              setSubmitted(true);
              save.mutate();
            }}
          >
            {save.isPending ? t.common.saving : 'Tạo công việc'}
          </Button>
        </>
      }
    >
      <FormError error={save.error} />

      {anchors.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-control bg-tr-hover px-3 py-2">
          <span className="text-xs font-semibold text-tr-subtle">Tạo từ</span>
          {anchors.map((key) => (
            <span
              key={key}
              className="inline-flex items-center gap-1 rounded-full bg-tr-list px-2 py-0.5 text-xs text-tr-text"
            >
              <Lock size={11} aria-hidden="true" className="text-tr-muted" />
              {LINK_LABELS[key]}: {context?.display[DISPLAY_KEY[key]] ?? '…'}
              <button
                type="button"
                onClick={() => setAnchors((prev) => prev.filter((k) => k !== key))}
                className="ml-1 text-tr-primary underline-offset-2 hover:underline"
              >
                Đổi
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field
            label="Tiêu đề"
            required
            error={submitted && titleMissing ? t.common.required : undefined}
          >
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Gọi lại khách hàng, gửi báo giá…"
            />
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Field label={t.card.description}>
            <Textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t.card.descriptionPlaceholder}
            />
          </Field>
        </div>

        <Field label="Bảng">
          <Select
            value={boardId}
            onChange={(e) => {
              const nextBoard = Number(e.target.value);
              const first = context?.lists.find((l) => l.board_id === nextBoard);
              setListTouched(true);
              setListId(first?.id ?? '');
            }}
          >
            <option value="">{t.common.selectPlaceholder}</option>
            {context?.boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Danh sách"
          required
          error={submitted && listMissing ? t.common.required : undefined}
        >
          <Select
            value={listId}
            onChange={(e) => {
              setListTouched(true);
              setListId(e.target.value === '' ? '' : Number(e.target.value));
            }}
          >
            <option value="">{t.common.selectPlaceholder}</option>
            {context?.lists
              .filter((l) => boardId === '' || l.board_id === boardId)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
          </Select>
        </Field>

        <Field label={t.card.priority}>
          <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {PRIORITY_ORDER.map((p) => (
              <option key={p} value={p}>
                {t.priority[p]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.card.startDate}>
            <DateInput value={startDate} onChange={setStartDate} />
          </Field>
          <Field label={t.card.dueDate}>
            <DateInput value={dueDate} onChange={setDueDate} />
          </Field>
        </div>

        <div className="sm:col-span-2 grid grid-cols-1 gap-3 border-t border-tr-border pt-3 sm:grid-cols-2">
          <LinkSelect
            linkKey="customer_id"
            value={valueOf('customer_id')}
            locked={anchors.includes('customer_id')}
            /* Khach hang duoc suy ra tu lien ket cu the hon — go lien ket do truoc moi doi duoc. */
            disabledBy={LINK_KEYS.slice(1).find((k) => valueOf(k) !== '')}
            onChange={(v) => changeLink('customer_id', v)}
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </LinkSelect>

          <LinkSelect
            linkKey="contact_id"
            value={valueOf('contact_id')}
            locked={anchors.includes('contact_id')}
            onChange={(v) => changeLink('contact_id', v)}
          >
            {context?.contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
                {c.title ? ` — ${c.title}` : ''}
              </option>
            ))}
          </LinkSelect>

          <LinkSelect
            linkKey="deal_id"
            value={valueOf('deal_id')}
            locked={anchors.includes('deal_id')}
            disabledBy={(['contract_id', 'quotation_id'] as const).find((k) => valueOf(k) !== '')}
            onChange={(v) => changeLink('deal_id', v)}
          >
            {context?.deals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </LinkSelect>

          <LinkSelect
            linkKey="contract_id"
            value={valueOf('contract_id')}
            locked={anchors.includes('contract_id')}
            onChange={(v) => changeLink('contract_id', v)}
          >
            {context?.contracts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.number ? ` — ${c.number}` : ''}
              </option>
            ))}
          </LinkSelect>

          <LinkSelect
            linkKey="quotation_id"
            value={valueOf('quotation_id')}
            locked={anchors.includes('quotation_id')}
            onChange={(v) => changeLink('quotation_id', v)}
          >
            {context?.quotations.map((q) => (
              <option key={q.id} value={q.id}>
                {q.code ?? `Báo giá #${q.id}`} (v{q.version})
              </option>
            ))}
          </LinkSelect>
        </div>

        <div className="sm:col-span-2">
          <Field label={t.card.checklist} hint="Mỗi dòng là một mục việc cần làm">
            <Textarea
              rows={3}
              value={checklistText}
              onChange={(e) => setChecklistText(e.target.value)}
              placeholder={'Chuẩn bị tài liệu\nGửi email xác nhận'}
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

/** O chon mot lien ket CRM; khoa lai khi dang la diem neo hoac bi khoa khac quyet dinh. */
function LinkSelect({
  linkKey,
  value,
  locked,
  disabledBy,
  onChange,
  children,
}: {
  linkKey: LinkKey;
  value: number | '';
  locked: boolean;
  disabledBy?: LinkKey;
  onChange: (value: number | null) => void;
  children: React.ReactNode;
}) {
  const disabled = locked || disabledBy !== undefined;
  const hint = locked
    ? 'Đang tạo từ mục này — bấm "Đổi" ở trên để chỉnh.'
    : disabledBy
      ? `Được suy ra từ ${LINK_LABELS[disabledBy].toLowerCase()} đã chọn.`
      : undefined;

  return (
    <Field label={LINK_LABELS[linkKey]} hint={hint}>
      <Select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      >
        <option value="">— {t.common.none} —</option>
        {children}
      </Select>
    </Field>
  );
}
