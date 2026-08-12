import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Sparkles } from 'lucide-react';
import { api, qs } from '../../api/client';
import { Modal } from '../common/Modal';
import { Button, DateInput, Field, FormError, Input, Select, Textarea } from '../common/ui';
import { PRIORITY_ORDER, t } from '../../i18n/vi';
import { invalidateCardViews, invalidateCrmViews } from '../../lib/queryKeys';
import { useUiStore, type TaskComposerState, type TaskContext } from '../../stores/uiStore';
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

interface TaskAssistResult {
  title: string;
  description: string;
  priority: Priority;
  start_date: string | null;
  due_date: string | null;
  checklist: string[];
  links: Record<LinkKey, number | null>;
  confidence: number;
  rationale: string;
  warnings: string[];
  meta: { requestId: string; provider: string; model: string };
}

/** Bo cac khoa rong de goi y cua AI khong xoa mat lien ket dang co. */
function stripEmpty(links: Record<string, number | null>): TaskContext {
  return Object.fromEntries(
    Object.entries(links).filter(([, value]) => value != null)
  ) as TaskContext;
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
  /** Ten cac truong vua duoc AI dien — de deo huy hieu nhac nguoi dung kiem lai. */
  const [aiFilled, setAiFilled] = useState<string[]>([]);
  const [aiMeta, setAiMeta] = useState<{ requestId: string; warnings: string[] } | null>(null);
  /** Nguoi dung co sua lai sau khi AI dien khong — gui kem phan hoi chat luong. */
  const [aiEdited, setAiEdited] = useState(false);

  /**
   * Nap lai form ngay trong luc render khi phien soan thao doi.
   *
   * Neu dat trong useEffect thi lan render dau tien sau khi mo van mang `links` rong,
   * lam form ban mot truy van ngu canh KHONG co tham so roi moi ban lai truy van dung
   * — nguoi dung thay o lien ket nhay tu rong sang co. React chay lai component ngay
   * ma khong commit, nen render duoc commit dau tien da co du ngu canh.
   */
  const [loaded, setLoaded] = useState<TaskComposerState | null>(null);
  if (composer !== loaded) {
    setLoaded(composer);
    setTitle(composer?.draftTitle ?? '');
    setDescription('');
    setPriority('medium');
    setStartDate(null);
    setDueDate(null);
    setChecklistText('');
    setListId(composer?.listId ?? '');
    setListTouched(composer?.listId !== undefined);
    setLinks(composer?.context ?? {});
    setAnchors(composer ? LINK_KEYS.filter((key) => composer.context[key] != null) : []);
    setSubmitted(false);
    setAiFilled([]);
    setAiMeta(null);
    setAiEdited(false);
  }

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

  // Xoa loi cua lan truoc — goi mutation la tac dung phu nen khong dat trong render.
  useEffect(() => {
    save.reset();
    assist.reset();
  }, [composer]);

  // Goi y danh sach chi ap dung khi nguoi dung chua tu chon.
  useEffect(() => {
    if (!listTouched && context?.suggested_list_id) setListId(context.suggested_list_id);
  }, [context?.suggested_list_id, listTouched]);

  const derived = context?.links;
  const valueOf = (key: LinkKey): number | '' => derived?.[key] ?? links[key] ?? '';
  /** Ghi nhan nguoi dung da chinh lai sau khi AI dien — di kem phan hoi chat luong. */
  const markEdited = () => {
    if (aiMeta) setAiEdited(true);
  };
  const boardId = useMemo(
    () => context?.lists.find((l) => l.id === listId)?.board_id ?? '',
    [context?.lists, listId]
  );

  /**
   * Doi mot khoa thi phai bo cac khoa cu the hon: chung thuoc ve thuc the cu va
   * server se tu choi bang 422 CROSS_CUSTOMER_LINK neu con giu lai.
   */
  const changeLink = (key: LinkKey, value: number | null) => {
    markEdited();
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

  /**
   * Nhap lieu thong minh: AI chi dien vao o DANG TRONG.
   *
   * Nguoi dung go gi thi giu nguyen cai do — mot goi y de hon la mot goi y ghi de.
   * Cac o duoc dien se deo huy hieu "AI" de ho biet cho nao can kiem lai.
   */
  const assist = useMutation({
    mutationFn: () =>
      api.post<TaskAssistResult>('/api/ai/assist/task', {
        draft: [title, description].filter(Boolean).join('\n'),
        context: Object.fromEntries(
          LINK_KEYS.map((key) => [key, valueOf(key) === '' ? undefined : valueOf(key)]).filter(
            ([, value]) => value !== undefined
          )
        ),
        list_id: listId === '' ? null : listId,
      }),
    onSuccess: (result) => {
      const filled: string[] = [];
      const fill = (key: string, isEmpty: boolean, apply: () => void) => {
        if (!isEmpty) return;
        apply();
        filled.push(key);
      };
      fill('title', !title.trim(), () => setTitle(result.title));
      fill('description', !description.trim(), () => setDescription(result.description));
      fill('priority', priority === 'medium', () => setPriority(result.priority));
      fill('start_date', startDate === null, () => setStartDate(result.start_date));
      fill('due_date', dueDate === null, () => setDueDate(result.due_date));
      fill('checklist', !checklistText.trim() && result.checklist.length > 0, () =>
        setChecklistText(result.checklist.join('\n'))
      );

      const nextLinks = stripEmpty(result.links);
      if (Object.keys(nextLinks).length > 0) {
        setLinks(nextLinks);
        filled.push('liên kết');
      }
      setAiFilled(filled);
      setAiMeta({ requestId: result.meta.requestId, warnings: result.warnings });
      pushToast(
        filled.length > 0
          ? 'AI đã điền nháp — hãy kiểm tra trước khi lưu'
          : 'Các trường đã có nội dung nên AI không ghi đè',
        'success'
      );
    },
  });

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
      // Bao cho AI biet goi y duoc giu nguyen hay da bi sua — dung de danh gia chat luong prompt.
      if (aiMeta) {
        void api
          .post('/api/ai/feedback', {
            request_id: aiMeta.requestId,
            action: aiEdited ? 'edited' : 'accepted',
          })
          .catch(() => undefined);
      }
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
          <Button
            disabled={!title.trim() || assist.isPending}
            onClick={() => assist.mutate()}
            title="AI đọc nội dung đang gõ và điền các trường còn trống"
          >
            <Sparkles size={15} />
            {assist.isPending ? 'Đang phân tích…' : 'Gợi ý bằng AI'}
          </Button>
          <span className="flex-1" />
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
      <FormError error={assist.error} />

      {aiFilled.length > 0 && (
        <div className="mb-3 rounded-control border border-tr-border bg-tr-hover px-3 py-2 text-xs text-tr-subtle">
          <span className="inline-flex items-center gap-1 font-semibold text-tr-text">
            <Sparkles size={12} aria-hidden="true" /> AI đã điền: {aiFilled.join(', ')}
          </span>
          <span className="ml-1">— hãy kiểm tra trước khi lưu.</span>
          {aiMeta?.warnings.map((warning) => (
            <div key={warning} className="mt-1 text-tr-danger">
              {warning}
            </div>
          ))}
        </div>
      )}

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
              onChange={(e) => {
                markEdited();
                setTitle(e.target.value);
              }}
              placeholder="Gọi lại khách hàng, gửi báo giá…"
            />
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Field label={t.card.description}>
            <Textarea
              rows={3}
              value={description}
              onChange={(e) => {
                markEdited();
                setDescription(e.target.value);
              }}
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
            /*
             * Khach hang duoc suy ra tu lien ket cu the hon — go lien ket do truoc moi
             * doi duoc. Duyet nguoc de chi dung mat xich CU THE NHAT: tao tu mot co hoi
             * thi nguoi lien he cung da duoc dien theo, noi "suy ra tu nguoi lien he"
             * la chi sai cho.
             */
            disabledBy={[...LINK_KEYS]
              .slice(1)
              .reverse()
              .find((k) => valueOf(k) !== '')}
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
