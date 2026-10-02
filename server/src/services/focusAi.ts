import type { Database } from 'better-sqlite3';
import { z } from 'zod';
import { PRIORITIES } from '@workflow/contracts';
import { saveActionProposal } from './ai/actions.ts';
import { runStructured } from './ai/gateway.ts';
import type { AiRunResult } from './ai/types.ts';
import { compactFocusForAi, type FocusData } from './focusService.ts';

/*
 * AI phan tich mot KY cua man hinh Trong tam.
 *
 * Bon dau ra chinh: uu tien, rui ro, goi y xep lich vao khung gio trong, va
 * goi y viec moi. Viec moi KHONG tao thang — di qua ai_action_proposals nhu
 * moi duong AI khac, nguoi dung duyet thi moi thanh viec.
 *
 * Moi id ma AI nhac toi (ref, customer_id, deal_id, card_id) deu bi loc lai
 * theo dung bo du lieu da gui di: AI khong duoc tro toi ban ghi nam ngoai pham
 * vi nguoi hoi, ke ca khi no "doan" ra mot id co that.
 */

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hhmm = z.string().regex(/^\d{2}:\d{2}$/);

const focusPlanSchema = z.object({
  headline: z.string().min(1).max(300),
  summary: z.string().max(2000).default(''),
  priorities: z
    .array(
      z.object({
        title: z.string().min(1).max(300),
        reason: z.string().max(600).default(''),
        ref: z.string().max(60).nullable().optional(),
      })
    )
    .max(8)
    .default([]),
  risks: z.array(z.string().max(500)).max(8).default([]),
  schedule: z
    .array(
      z.object({
        date: dateOnly,
        start: hhmm,
        end: hhmm,
        title: z.string().min(1).max(300),
        ref: z.string().max(60).nullable().optional(),
      })
    )
    .max(25)
    .default([]),
  delegate: z
    .array(
      z.object({
        title: z.string().min(1).max(300),
        to: z.string().max(200).default(''),
        reason: z.string().max(500).default(''),
        card_id: z.number().int().positive().nullable().optional(),
      })
    )
    .max(6)
    .default([]),
  suggested_tasks: z
    .array(
      z.object({
        title: z.string().min(1).max(300),
        reason: z.string().max(600).default(''),
        due_date: dateOnly.nullable().optional(),
        priority: z.enum(PRIORITIES).nullable().optional(),
        customer_id: z.number().int().positive().nullable().optional(),
        deal_id: z.number().int().positive().nullable().optional(),
      })
    )
    .max(6)
    .default([]),
  messages: z
    .array(
      z.object({
        to: z.string().max(200).default(''),
        purpose: z.string().max(300).default(''),
        text: z.string().min(1).max(2000),
      })
    )
    .max(5)
    .default([]),
});

export type FocusPlan = z.infer<typeof focusPlanSchema>;

export interface FocusPlanResult extends FocusPlan {
  proposals: unknown[];
  generated_at: string;
  meta: Pick<AiRunResult, 'provider' | 'model' | 'inputTokens' | 'outputTokens'>;
}

function periodLabel(data: FocusData): string {
  const { from, to, today } = data.range;
  if (to < today)
    return 'kỳ ĐÃ QUA — hãy viết theo hướng nhìn lại: điều gì làm tốt, điều gì trượt, bài học cho kỳ sau';
  if (from === to) return from === today ? 'hôm nay' : `ngày ${from}`;
  return `từ ${from} đến ${to}`;
}

/** Loc moi id AI nhac toi ve dung tap du lieu da gui. */
function sanitize(plan: FocusPlan, data: FocusData): FocusPlan {
  const refs = new Set([...data.items, ...data.carry_over].map((item) => item.key));
  const cardIds = new Set(
    [...data.items, ...data.carry_over].map((item) => item.card_id).filter(Boolean) as number[]
  );
  for (const w of [...data.waiting.on_me, ...data.waiting.on_others]) cardIds.add(w.card_id);
  const customerIds = new Set<number>();
  const dealIds = new Set<number>();
  for (const item of [...data.items, ...data.carry_over]) {
    if (item.customer_id) customerIds.add(item.customer_id);
    if (item.deal_id) dealIds.add(item.deal_id);
  }
  for (const item of data.attention) {
    if (item.customer_id) customerIds.add(item.customer_id);
    if (item.deal_id) dealIds.add(item.deal_id);
    if (item.card_id) cardIds.add(item.card_id);
  }
  const keepRef = (ref: string | null | undefined) => (ref && refs.has(ref) ? ref : null);
  return {
    ...plan,
    priorities: plan.priorities.map((p) => ({ ...p, ref: keepRef(p.ref) })),
    schedule: plan.schedule
      .filter((s) => s.date >= data.range.today && s.end > s.start)
      .map((s) => ({ ...s, ref: keepRef(s.ref) })),
    delegate: plan.delegate.map((d) => ({
      ...d,
      card_id: d.card_id && cardIds.has(d.card_id) ? d.card_id : null,
    })),
    suggested_tasks: plan.suggested_tasks.map((t) => {
      const dealId = t.deal_id && dealIds.has(t.deal_id) ? t.deal_id : null;
      const customerId = t.customer_id && customerIds.has(t.customer_id) ? t.customer_id : null;
      return { ...t, deal_id: dealId, customer_id: customerId };
    }),
  };
}

export async function generateFocusPlan(
  db: Database,
  data: FocusData,
  options: {
    mode?: 'fast' | 'balanced' | 'reasoning';
    assigneeContactId: number | null;
    withProposals: boolean;
  }
): Promise<FocusPlanResult> {
  const team = data.scope.mode === 'team';
  const context = compactFocusForAi(data);
  const { data: raw, meta } = await runStructured(
    db,
    {
      task: 'focus_plan',
      mode: options.mode ?? 'balanced',
      contextType: 'focus',
      maxOutputTokens: 3000,
      system:
        'Bạn là trợ lý điều phối công việc cho một doanh nghiệp B2B Việt Nam. Chỉ kết luận từ dữ liệu được cung cấp, không bịa thêm việc, người hay số liệu. Viết tiếng Việt ngắn gọn, mỗi ý bắt đầu bằng động từ khi là việc cần làm. Trả về JSON hợp lệ.',
      prompt: [
        `Phân tích ${periodLabel(data)} (hôm nay là ${data.range.today}, bây giờ ${data.range.now}) cho ${team ? 'nhóm người dùng đang quản lý' : 'chính người dùng'}.`,
        'Trả JSON đúng cấu trúc:',
        '{"headline":"một câu tóm tắt kỳ","summary":"2-4 câu","priorities":[{"title":"...","reason":"vì sao quan trọng","ref":"key của mục trong dữ liệu, ví dụ card-12, hoặc null"}],"risks":["..."],"schedule":[{"date":"YYYY-MM-DD","start":"HH:mm","end":"HH:mm","title":"việc làm trong khung giờ","ref":"card-12 hoặc null"}],"delegate":[{"title":"việc nên giao","to":"tên người phù hợp trong workload, có thể rỗng","reason":"...","card_id":12}],"suggested_tasks":[{"title":"việc MỚI chưa có trong danh sách","reason":"dựa trên tín hiệu nào","due_date":"YYYY-MM-DD hoặc null","priority":"low|medium|high|urgent","customer_id":null,"deal_id":null}],"messages":[{"to":"người nhận","purpose":"mục đích","text":"tin nhắn soạn sẵn, lịch sự, ngắn"}]}',
        'Quy tắc:',
        '- priorities: tối đa 5, xếp theo tác động (quá hạn, giá trị cơ hội, hạn chót gần, người khác đang chờ).',
        '- schedule: CHỈ xếp vào free_slots, không chồng lên nhau, ưu tiên việc quan trọng vào buổi sáng; bỏ trống mảng nếu kỳ đã qua.',
        `- delegate: ${team ? 'gợi ý chuyển việc từ người quá tải sang người còn trống dựa trên workload' : 'việc người dùng có thể giao cho người khác; để trống nếu không rõ'}.`,
        '- suggested_tasks: tối đa 5 việc mới từ tín hiệu như khách lâu không liên hệ, cơ hội thiếu tương tác, hợp đồng/báo giá sắp hết hạn chưa có việc theo dõi. Không lặp lại việc đã có.',
        '- messages: tối đa 3 tin nhắn soạn sẵn (nhắc người đang trễ việc mình giao, follow-up khách).',
        '- Dùng đúng customer_id/deal_id có trong dữ liệu, không tự đặt id.',
        `Dữ liệu:\n${JSON.stringify(context)}`,
      ].join('\n'),
    },
    focusPlanSchema
  );
  const plan = sanitize(raw, data);

  const proposals = options.withProposals
    ? plan.suggested_tasks.map((task) =>
        saveActionProposal(db, meta.requestId, {
          type: 'create_task',
          title: task.title,
          explanation: task.reason,
          payload: {
            title: task.title,
            due_date: task.due_date ?? undefined,
            priority: task.priority ?? undefined,
            customer_id: task.customer_id ?? undefined,
            deal_id: task.deal_id ?? undefined,
            assignee_contact_id: options.assigneeContactId ?? undefined,
          },
        })
      )
    : [];

  return {
    ...plan,
    proposals,
    generated_at: new Date().toISOString(),
    meta: {
      provider: meta.provider,
      model: meta.model,
      inputTokens: meta.inputTokens,
      outputTokens: meta.outputTokens,
    },
  };
}

/* ---------- Luu ket qua va phat hien ket qua da cu (v55) ---------- */

/** Anh chup du lieu ky luc phan tich: khoa muc -> [ngay, da xong]. */
export interface FocusSnapshot {
  items: Record<string, [string, 0 | 1]>;
}

export interface FocusChanges {
  /** Muc da xong — hoac bien mat khoi ky (thuong la xong, xoa, hay doi ra ngoai ky). */
  done: number;
  /** Muc moi xuat hien tu luc phan tich. */
  added: number;
  /** Muc chua xong nhung da doi sang ngay khac. */
  moved: number;
  total: number;
}

export function snapshotOf(data: FocusData): FocusSnapshot {
  const items: FocusSnapshot['items'] = {};
  for (const item of [...data.items, ...data.carry_over]) {
    items[item.key] = [item.date, item.done ? 1 : 0];
  }
  return { items };
}

export function diffSnapshot(snapshot: FocusSnapshot, data: FocusData): FocusChanges {
  const current = new Map(
    [...data.items, ...data.carry_over].map((item) => [item.key, item] as const)
  );
  let done = 0;
  let moved = 0;
  for (const [key, [date, wasDone]] of Object.entries(snapshot.items ?? {})) {
    if (wasDone) continue;
    const now = current.get(key);
    if (!now || now.done) done += 1;
    else if (now.date !== date) moved += 1;
  }
  let added = 0;
  for (const [key, item] of current) {
    if (!(key in (snapshot.items ?? {})) && !item.done) added += 1;
  }
  return { done, added, moved, total: done + added + moved };
}

interface StoredPlanRow {
  plan_json: string;
  snapshot_json: string;
  generated_at: string;
}

export interface StoredFocusPlan {
  plan: FocusPlanResult;
  snapshot: FocusSnapshot;
  generated_at: string;
}

export function loadFocusPlan(
  db: Database,
  key: { userId: number; mode: string; from: string; to: string }
): StoredFocusPlan | null {
  const row = db
    .prepare(
      `SELECT plan_json, snapshot_json, generated_at FROM focus_ai_plans
        WHERE user_id = ? AND mode = ? AND period_from = ? AND period_to = ?`
    )
    .get(key.userId, key.mode, key.from, key.to) as StoredPlanRow | undefined;
  if (!row) return null;
  const plan = JSON.parse(row.plan_json) as FocusPlanResult;
  /* Trang thai de xuat (cho duyet / da tao / bo qua) doc lai tu bang goc — no
     doi sau luc luu, va hien sai se dan toi duyet trung mot viec. */
  const ids = (plan.proposals as { id: number }[]).map((p) => p.id).filter(Number.isInteger);
  if (ids.length > 0) {
    const statuses = new Map(
      (
        db
          .prepare(
            `SELECT id, status FROM ai_action_proposals WHERE id IN (${ids.map(() => '?').join(',')})`
          )
          .all(...ids) as { id: number; status: string }[]
      ).map((r) => [r.id, r.status])
    );
    plan.proposals = (plan.proposals as { id: number; status: string }[]).map((p) => ({
      ...p,
      status: statuses.get(p.id) ?? p.status,
    }));
  }
  return {
    plan,
    snapshot: JSON.parse(row.snapshot_json) as FocusSnapshot,
    generated_at: row.generated_at,
  };
}

export function saveFocusPlan(
  db: Database,
  key: { userId: number; mode: string; from: string; to: string },
  plan: FocusPlanResult,
  snapshot: FocusSnapshot
): string {
  const row = db
    .prepare(
      `INSERT INTO focus_ai_plans (user_id, mode, period_from, period_to, plan_json, snapshot_json)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, mode, period_from, period_to) DO UPDATE SET
         plan_json = excluded.plan_json, snapshot_json = excluded.snapshot_json,
         generated_at = strftime('%Y-%m-%dT%H:%M:%S','now','localtime')
       RETURNING generated_at`
    )
    .get(
      key.userId,
      key.mode,
      key.from,
      key.to,
      JSON.stringify(plan),
      JSON.stringify(snapshot)
    ) as { generated_at: string };
  return row.generated_at;
}
