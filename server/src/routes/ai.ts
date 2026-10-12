import fs from 'node:fs';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { PRIORITIES, type PermissionResource } from '@workflow/contracts';
import { getPicklist } from '../lib/picklists.ts';
import { TASK_LINK_KEYS, taskLinksSchema } from '@workflow/contracts/schemas';
import { db } from '../db/connection.ts';
import { accessOf, actorContactId, requirePermission } from '../middleware/currentUser.ts';
import { assertInScope } from '../lib/scope.ts';
import { deriveTaskLinks } from '../lib/entityRelations.ts';
import { fold } from '../lib/viSearch.ts';
import { HttpError, intParam, parseBody } from '../lib/validate.ts';
import {
  approveActionProposal,
  listActionProposals,
  proposalForCheck,
  proposedActionSchema,
  rejectActionProposal,
  saveActionProposal,
} from '../services/ai/actions.ts';
import {
  assertCardAccess,
  assertLinkTargetsInScope,
  assertListPlaceable,
  ownerInScope,
} from '../lib/recordAccess.ts';
import { aiNotificationVisible } from './notifications.ts';
import { getMeetingNote, saveAiSummary } from '../services/meetingNoteService.ts';
import { runAutomation } from '../services/ai/automations.ts';
import { ASSESSMENT_GRID, getAssessment, saveAiReview } from '../services/assessmentService.ts';
import { QUICK_QUESTIONS, getQuickAssessment } from '../services/quickAssessmentService.ts';
import { ASSESSMENT_CRITERIA, DEAL_DECISIONS, SCORE_FACTORS } from '../lib/crm.ts';
import {
  appendTurn,
  createSession,
  deleteSession,
  getSession,
  listMessages,
  listSessions,
  renameSession,
} from '../services/ai/chatSessions.ts';
import {
  listProviderConfigs,
  providerConnection,
  syncProviderModels,
  updateProviderConfig,
} from '../services/ai/configService.ts';
import {
  buildCustomerContext,
  buildDealContext,
  buildQuickNoteContext,
  buildSearchContext,
  type AiScopes,
  buildTodayContext,
  compactJson,
} from '../services/ai/contextBuilder.ts';
import {
  indexAllDocuments,
  indexDocument,
  readDocumentText,
  safeFilePath,
  searchDocumentChunks,
} from '../services/ai/documentIndex.ts';
import { describeAiError } from '../services/ai/describeError.ts';
import { parseAiJson, runAi, runStructured } from '../services/ai/gateway.ts';
import { assistCustomer } from '../services/ai/companyLookup.ts';
import { buildFocus, canSeeTeam, focusScopeOf } from '../services/focusService.ts';
import {
  diffSnapshot,
  generateFocusPlan,
  loadFocusPlan,
  saveFocusPlan,
  snapshotOf,
} from '../services/focusAi.ts';
import { listNineRouterSearchModels } from '../services/ai/providers.ts';
import {
  careStatusOf,
  churnRiskOf,
  customerTimeline,
  expiringItems,
  refreshSuggestions,
} from '../services/customerCare.ts';
import { AI_PROVIDERS, type AiProviderName } from '../services/ai/types.ts';
import {
  getVoiceModel,
  getVoicePromptTemplates,
  getWebSearchModel,
  saveWebSearchModel,
  saveVoiceModel,
  saveVoicePromptTemplates,
  type VoicePromptTemplate,
} from '../services/ai/promptTemplates.ts';
import { assertMeetingNoteInScope } from '../lib/meetingNoteScope.ts';
import { assertDocumentsInScope, documentScope } from '../lib/documentScope.ts';
import { isRealDate, todayLocal } from '../lib/dates.ts';

const router = Router();

/** Ai duoc thay de xuat hanh dong: chinh nguoi hoi; quan tri thay ca de xuat cu vo chu. */
function proposalViewer(req: Request): 'all' | number | null {
  if (accessOf(req).visibleContactIds('ai', 'read') === 'all') return 'all';
  return actorContactId(req);
}

/**
 * Duyet mot de xuat = thuc hien hanh dong DUOI TEN nguoi bam. Phai la de xuat cua
 * minh, va hanh dong phai qua dung cac kiem tra pham vi nhu khi tu lam bang tay —
 * neu khong, "de xuat AI" la cach sua co hoi / gan viec vao du lieu phong khac.
 */
function assertProposalAccess(req: Request, id: number, executing: boolean): void {
  const proposal = proposalForCheck(db, id);
  const viewer = proposalViewer(req);
  if (!proposal || viewer === null || (viewer !== 'all' && proposal.owner_contact_id !== viewer)) {
    throw new HttpError(404, 'Không tìm thấy đề xuất AI');
  }
  if (!executing) return;
  const payload = proposal.payload;
  assertLinkTargetsInScope(req, payload);
  if (typeof payload.card_id === 'number') assertCardAccess(req, payload.card_id, 'read');
  if (typeof payload.parent_id === 'number') assertCardAccess(req, payload.parent_id, 'read');
  if (typeof payload.list_id === 'number') assertListPlaceable(req, payload.list_id);
  if (proposal.action_type === 'update_deal_next_action' && typeof payload.deal_id === 'number') {
    const deal = db
      .prepare(`SELECT owner_contact_id FROM deals WHERE id = ?`)
      .get(payload.deal_id) as { owner_contact_id: number | null } | undefined;
    if (!deal || !ownerInScope(req, 'deals', 'update', deal.owner_contact_id)) {
      throw new HttpError(404, 'Không tìm thấy cơ hội');
    }
  }
}

function providerParam(value: string | undefined): AiProviderName {
  if (!AI_PROVIDERS.includes(value as AiProviderName)) {
    throw new HttpError(400, 'Nhà cung cấp AI không hợp lệ');
  }
  return value as AiProviderName;
}

/**
 * Loi AI -> 424 kem nguyen nhan (describeAiError). Truoc day tra 502: proxy phia truoc
 * nginx thay than 502 bang trang loi cua no, nguoi dung chi thay "Loi 502 ... proxy"
 * du ung dung van chay; 401 cho loi key thi lam client dang xuat nguoi dung.
 */
function asHttpError(error: unknown): never {
  if (error instanceof HttpError) throw error;
  throw describeAiError(error) ?? error;
}

function safeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new HttpError(400, 'API Base URL không hợp lệ');
  }
  const localhost = ['localhost', '127.0.0.1', '::1', 'host.docker.internal'].includes(
    url.hostname
  );
  if (url.protocol !== 'https:' && !(localhost && url.protocol === 'http:')) {
    throw new HttpError(400, 'API Base URL phải dùng HTTPS (trừ localhost)');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new HttpError(400, 'API Base URL không được chứa tài khoản, query hoặc fragment');
  }
  return url.toString().replace(/\/$/, '');
}

const providerUpdateSchema = z.object({
  base_url: z.string().min(1).optional(),
  api_key: z.string().max(500).optional(),
  clear_api_key: z.boolean().optional(),
  enabled: z.boolean().optional(),
  default_model: z.string().max(200).nullable().optional(),
  fast_model: z.string().max(200).nullable().optional(),
  reasoning_model: z.string().max(200).nullable().optional(),
  daily_token_limit: z.number().int().min(0).max(1_000_000_000).optional(),
  daily_cost_limit_usd: z.number().min(0).max(1_000_000).nullable().optional(),
  input_cost_per_million_usd: z.number().min(0).max(1_000_000).nullable().optional(),
  output_cost_per_million_usd: z.number().min(0).max(1_000_000).nullable().optional(),
});

router.get('/providers', (_req, res) => res.json(listProviderConfigs(db)));

router.put('/providers/:provider', (req, res) => {
  const provider = providerParam(req.params.provider);
  const body = parseBody(providerUpdateSchema, req);
  updateProviderConfig(db, provider, {
    baseUrl: body.base_url === undefined ? undefined : safeBaseUrl(body.base_url),
    apiKey: body.api_key,
    clearApiKey: body.clear_api_key,
    enabled: body.enabled,
    defaultModel: body.default_model,
    fastModel: body.fast_model,
    reasoningModel: body.reasoning_model,
    dailyTokenLimit: body.daily_token_limit,
    dailyCostLimitUsd: body.daily_cost_limit_usd,
    inputCostPerMillionUsd: body.input_cost_per_million_usd,
    outputCostPerMillionUsd: body.output_cost_per_million_usd,
  });
  res.json(listProviderConfigs(db).find((item) => item.provider === provider));
});

router.post('/providers/:provider/sync', async (req, res) => {
  try {
    const provider = providerParam(req.params.provider);
    const models = await syncProviderModels(db, provider);
    res.json({ provider, count: models.length, models });
  } catch (error) {
    asHttpError(error);
  }
});

const briefRequestSchema = z.object({
  context_type: z.enum(['today', 'customer', 'deal']),
  context_id: z.number().int().positive().optional(),
  mode: z.enum(['fast', 'balanced', 'reasoning']).optional(),
});
const briefResponseSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  risks: z.array(z.string()).max(8).default([]),
  next_actions: z.array(z.string()).max(8).default([]),
  sources: z.array(z.string()).max(20).default([]),
});

/**
 * Pham vi du lieu cua tro ly AI cho request hien tai.
 *
 * Dung `deals:read` lam thuoc do chung cho ngu canh "hom nay": do la du lieu
 * thuong mai, va mot nguoi khong doc duoc pipeline thi cung khong duoc nghe AI
 * ke lai noi dung cua no.
 */
function aiScope(req: Request): number[] | null {
  return scopeOf(req, 'deals');
}

function scopeOf(req: Request, resource: PermissionResource): number[] | null {
  const visible = accessOf(req).visibleContactIds(resource, 'read');
  return visible === 'all' ? null : visible;
}

/**
 * Pham vi rieng cho TUNG loai du lieu khi tra cuu theo tu khoa.
 *
 * Mot thuoc do chung se sai theo ca hai chieu: nguoi chi duoc xem hop dong se
 * bi giau mat hop dong, con nguoi duoc xem hop dong ma khong duoc xem pipeline
 * lai nghe ke ca pipeline. Moi truc doc mot quyen cua chinh no.
 */
function aiScopes(req: Request): AiScopes {
  return {
    customers: scopeOf(req, 'customers'),
    deals: scopeOf(req, 'deals'),
    contracts: scopeOf(req, 'contracts'),
    tasks: scopeOf(req, 'tasks'),
    notes: scopeOf(req, 'notes'),
    me: accessOf(req).contactId,
  };
}

/**
 * Nguoi so huu phien chat cua request hien tai.
 *
 * `null` khi tat xac thuc (`createApp({ auth: false })` trong test) — luc do
 * khong co "nguoi" nao de gan, va chatSessions.ts hieu null la khong loc.
 */
function chatOwner(req: Request): number | null {
  return accessOf(req).userId || null;
}

/** Chan hoi AI ve mot khach hang / co hoi nam ngoai pham vi cua nguoi hoi. */
/** Ten hien thi cua ban ghi dang xem — lay tu chinh ho so vua dung cho ngu canh. */
function focusLabel(data: unknown, type: 'customer' | 'deal'): string {
  const record = (data as Record<string, Record<string, unknown> | undefined>)[type];
  const value = type === 'customer' ? record?.name : record?.title;
  return typeof value === 'string' && value.trim() ? value.trim() : `#${String(record?.id ?? '')}`;
}

function assertContextInScope(req: Request, type: string, id: number | undefined): void {
  if (id == null) return;
  if (type === 'customer') {
    const row = db.prepare('SELECT owner_contact_id FROM customers WHERE id = ?').get(id) as
      { owner_contact_id: number | null } | undefined;
    assertInScope(req, 'customers', 'read', row?.owner_contact_id, 'Không tìm thấy khách hàng');
  } else if (type === 'deal') {
    const row = db.prepare('SELECT owner_contact_id FROM deals WHERE id = ?').get(id) as
      { owner_contact_id: number | null } | undefined;
    assertInScope(req, 'deals', 'read', row?.owner_contact_id, 'Không tìm thấy cơ hội');
  }
}

router.post('/brief', async (req, res) => {
  try {
    const body = parseBody(briefRequestSchema, req);
    if (body.context_type !== 'today' && !body.context_id) {
      throw new HttpError(400, 'Thiếu context_id');
    }
    assertContextInScope(req, body.context_type, body.context_id);
    const context =
      body.context_type === 'today'
        ? buildTodayContext(db, aiScope(req))
        : body.context_type === 'customer'
          ? buildCustomerContext(db, body.context_id!, aiScopes(req))
          : buildDealContext(db, body.context_id!, aiScopes(req));
    const result = await runAi(db, {
      task: `brief_${body.context_type}`,
      mode: body.mode,
      contextType: body.context_type,
      contextId: body.context_id,
      json: true,
      system:
        'Bạn là AI Copilot cho CRM B2B Việt Nam. Chỉ kết luận từ dữ liệu đã cung cấp, không bịa. Ưu tiên rủi ro và hành động cụ thể. Trả JSON hợp lệ.',
      prompt: `Hãy tạo bản brief theo JSON: {"headline":"...","summary":"...","risks":["..."],"next_actions":["..."],"sources":["mô tả nguồn dữ liệu"]}. Dữ liệu:\n${compactJson(context)}`,
      maxOutputTokens: 1800,
    });
    res.json({ ...briefResponseSchema.parse(parseAiJson(result.text)), meta: result });
  } catch (error) {
    asHttpError(error);
  }
});

const focusPlanQuery = z.object({
  from: z.string(),
  to: z.string(),
  mode: z.enum(['me', 'team']).default('me'),
});
const focusPlanRequest = focusPlanQuery.extend({
  ai_mode: z.enum(['fast', 'balanced', 'reasoning']).default('balanced'),
});

/*
 * Ket qua AI cua man Trong tam LUU TRONG CSDL (v55), moi nguoi mot ban cho moi
 * (che do, ky). Chi thay khi nguoi dung bam "Phân tích lại" (POST) — mo lai
 * trang, doi may khong goi AI lai. GET kem `changes`: so voi anh chup luc phan
 * tich, du lieu ky da doi bao nhieu — man hinh dua vao do de nhac "da cu".
 */
function focusPlanContext(req: Request, query: z.infer<typeof focusPlanQuery>) {
  const access = accessOf(req);
  if (!access.can('tasks', 'read')) throw new HttpError(403, 'Bạn không có quyền xem công việc');
  const mode: 'me' | 'team' = query.mode === 'team' && canSeeTeam(access) ? 'team' : 'me';
  const data = buildFocus(db, {
    from: query.from,
    to: query.to,
    scope: focusScopeOf(access, mode),
  });
  /* userId 0 = che do tat xac thuc (test) — khong co tai khoan de gan ket qua. */
  const key =
    access.userId > 0 ? { userId: access.userId, mode, from: query.from, to: query.to } : null;
  return { access, data, key };
}

router.get('/focus-plan', (req, res) => {
  const parsed = focusPlanQuery.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, 'Thiếu khoảng ngày cần xem');
  const { data, key } = focusPlanContext(req, parsed.data);
  const stored = key ? loadFocusPlan(db, key) : null;
  if (!stored) {
    res.json(null);
    return;
  }
  res.json({
    ...stored.plan,
    generated_at: stored.generated_at,
    changes: diffSnapshot(stored.snapshot, data),
  });
});

router.post('/focus-plan', async (req, res) => {
  try {
    const body = parseBody(focusPlanRequest, req);
    const { access, data, key } = focusPlanContext(req, body);
    const result = await generateFocusPlan(db, data, {
      mode: body.ai_mode,
      assigneeContactId: access.contactId,
      withProposals: true,
    });
    const generatedAt = key
      ? saveFocusPlan(db, key, result, snapshotOf(data))
      : result.generated_at;
    res.json({
      ...result,
      generated_at: generatedAt,
      changes: { done: 0, added: 0, moved: 0, total: 0 },
    });
  } catch (error) {
    asHttpError(error);
  }
});

/* ---------- Cham soc khach hang (v55): soan tin + danh gia nguy co mat khach ---------- */

const careAssistSchema = z.object({
  customer_id: z.number().int().positive(),
  contact_id: z.number().int().positive().nullable().optional(),
  channel: z.enum(['email', 'zalo']).default('email'),
  /** Muc dich tu chon — de trong thi AI tu chon theo tinh hinh (qua nhip, sap gia han...). */
  purpose: z.string().trim().max(500).optional(),
  mode: z.enum(['fast', 'balanced', 'reasoning']).default('balanced'),
});
const careAssistResponse = z.object({
  churn_level: z.enum(['low', 'medium', 'high']).catch('medium'),
  churn_summary: z.string().default(''),
  churn_reasons: z.array(z.string()).default([]),
  retention_actions: z.array(z.string()).default([]),
  message_subject: z.string().default(''),
  message_body: z.string().min(1),
});

router.post('/assist/customer-care', async (req, res) => {
  try {
    const body = parseBody(careAssistSchema, req);
    assertContextInScope(req, 'customer', body.customer_id);
    const customer = db
      .prepare(`SELECT id, care_tier, care_cadence_days, created_at FROM customers WHERE id = ?`)
      .get(body.customer_id) as
      | { id: number; care_tier: string; care_cadence_days: number | null; created_at: string }
      | undefined;
    if (!customer) throw new HttpError(404, 'Không tìm thấy khách hàng');
    const contact = body.contact_id
      ? (db
          .prepare(
            `SELECT id, full_name, title, buying_role, relationship FROM contacts
              WHERE id = ? AND customer_id = ?`
          )
          .get(body.contact_id, customer.id) ?? null)
      : null;
    const care = careStatusOf(db, customer);
    const churn = churnRiskOf(db, customer.id, care);
    const context = {
      ...buildCustomerContext(db, customer.id, aiScopes(req)),
      care,
      churn_signals: churn,
      expiring: expiringItems(db, customer.id),
      timeline: customerTimeline(db, customer.id, 25),
      open_suggestions: refreshSuggestions(db, customer.id).map((s) => ({
        kind: s.kind,
        title: s.title,
        reason: s.reason,
      })),
      recipient: contact,
    };
    const result = await runAi(db, {
      task: 'assist_customer_care',
      mode: body.mode,
      contextType: 'customer',
      contextId: customer.id,
      json: true,
      system:
        'Bạn là chuyên viên chăm sóc khách hàng B2B tại Việt Nam. Chỉ dựa vào dữ liệu được cung cấp, không bịa số liệu hay cam kết. Văn phong lịch sự, ngắn gọn, xưng hô phù hợp văn hoá doanh nghiệp Việt. Trả JSON hợp lệ.',
      prompt: `Đánh giá nguy cơ mất khách và soạn một tin ${body.channel === 'zalo' ? 'Zalo (ngắn, thân thiện, không tiêu đề)' : 'email (có tiêu đề)'} chăm sóc${contact ? ' gửi người nhận trong "recipient"' : ' gửi người liên hệ chính'}.
Mục đích: ${body.purpose || 'tự chọn theo tình hình: quá nhịp liên hệ, hợp đồng/dịch vụ sắp hết hạn, sau bán, hoặc gợi ý đang mở'}.
"churn_signals" là điểm tính sẵn từ dữ liệu — dùng làm căn cứ, có thể điều chỉnh mức nếu dữ liệu cho thấy khác.
Trả JSON: {"churn_level":"low|medium|high","churn_summary":"1-2 câu","churn_reasons":["..."],"retention_actions":["việc cụ thể"],"message_subject":"...","message_body":"..."}
Dữ liệu:
${compactJson(context)}`,
      maxOutputTokens: 1800,
    });
    res.json({
      ...careAssistResponse.parse(parseAiJson(result.text)),
      churn_score: churn.score,
      meta: result,
    });
  } catch (error) {
    asHttpError(error);
  }
});

const interactionAssistSchema = z.object({
  customer_id: z.number().int().positive(),
  deal_id: z.number().int().positive().nullable().optional(),
  raw_notes: z.string().trim().min(10).max(20_000),
});
const interactionAssistResponse = z.object({
  summary: z.string().min(1),
  result: z.string().default(''),
  next_action: z.string().default(''),
  next_action_date: z.string().refine(isRealDate, 'Ngày không hợp lệ').nullable().default(null),
  confidence: z.number().min(0).max(1).default(0.5),
});

router.post('/assist/interaction', async (req, res) => {
  try {
    const body = parseBody(interactionAssistSchema, req);
    assertContextInScope(req, body.deal_id ? 'deal' : 'customer', body.deal_id ?? body.customer_id);
    const context = body.deal_id
      ? buildDealContext(db, body.deal_id, aiScopes(req))
      : buildCustomerContext(db, body.customer_id, aiScopes(req));
    const result = await runAi(db, {
      task: 'interaction_assist',
      mode: 'fast',
      contextType: body.deal_id ? 'deal' : 'customer',
      contextId: body.deal_id ?? body.customer_id,
      json: true,
      system:
        'Bạn chuẩn hóa ghi chú CRM tiếng Việt. Không thêm sự kiện không có trong ghi chú. Ngày phải YYYY-MM-DD hoặc null. Trả JSON hợp lệ.',
      prompt: `Từ ghi chú, điền JSON {"summary":"tóm tắt rõ ràng","result":"kết quả","next_action":"hành động cụ thể","next_action_date":null,"confidence":0.0}. Hôm nay: ${todayLocal()}. Ghi chú:\n${body.raw_notes}\nNgữ cảnh tham khảo:\n${compactJson(context, 20_000)}`,
      maxOutputTokens: 1000,
    });
    res.json({ ...interactionAssistResponse.parse(parseAiJson(result.text)), meta: result });
  } catch (error) {
    asHttpError(error);
  }
});

/* ---------- Nhan dinh co hoi theo 4 cau hoi (v70) ---------- */

/** Mo ta ngan 9 tieu chi bo sung cho mo hinh — ban day du nam o i18n/assessment.ts. */
const ASSESSMENT_CRITERIA_BRIEF: Record<string, string> = {
  profit: 'Lợi nhuận: biên lợi nhuận sau chiết khấu có đạt ngưỡng của mình không',
  follow_on: 'Cơ hội tiếp nối: ký được hợp đồng này mở ra doanh thu gì trong 1 năm và 3 năm tới',
  strategic:
    'Giá trị chiến lược: khách hàng tham chiếu, mở ngành/phòng ban mới, cải thiện sản phẩm',
  resources:
    'Công sức hợp lý: công sức đội bán/kỹ thuật và chi phí bán hàng có tương xứng, có làm hụt deal khác không (3 = rất tương xứng)',
  delivery_risk:
    'Mức an toàn khi triển khai: khả năng dự án thất bại do ta hoặc do khách và hậu quả với uy tín (3 = rất an toàn)',
  financial_health: 'Sức khỏe tài chính của khách: doanh thu, lợi nhuận, khả năng thanh toán',
  unique_value:
    'Giá trị khác biệt: kết quả kinh doanh đo được mà chỉ ta mang lại, khách đã công nhận',
  exec_relationship: 'Quan hệ lãnh đạo: ta có quan hệ tin cậy với lãnh đạo cao nhất liên quan',
  informal_decision:
    'Quyết định không chính thức: ta hiểu quyết định thực sự được đưa ra thế nào, ai muốn chọn ta',
};

const assessmentReviewSchema = z.object({
  summary: z.string().trim().min(1).max(4000),
  recommendation: z.enum(DEAL_DECISIONS),
  criteria: z
    .array(
      z.object({
        key: z.string(),
        score: z.number().int().min(0).max(3),
        reason: z.string().max(600).default(''),
      })
    )
    .max(20)
    .default([]),
  factors: z
    .array(
      z.object({
        key: z.string(),
        score: z.number().int().min(0).max(3),
        reason: z.string().max(600).default(''),
      })
    )
    .max(20)
    .default([]),
  unknowns: z
    .array(z.object({ cell: z.number().int(), question: z.string().trim().min(1).max(400) }))
    .max(10)
    .default([]),
  risks: z.array(z.string().trim().min(1).max(400)).max(6).default([]),
  actions: z.array(z.string().trim().min(1).max(300)).max(6).default([]),
});

/**
 * AI doc ho so co hoi va nhan dinh theo 4 cau hoi. Ket qua luu vao nhat ky quyet dinh
 * (author_kind = 'ai') va dien diem DE XUAT cho tieu chi chua co diem nguoi cham —
 * nguoi dung tu xac nhan hoac sua. Khong dong toi diem BANT/4P da xac nhan.
 */
router.post('/assist/deal/:id/assessment', async (req, res) => {
  try {
    const dealId = intParam(req.params.id);
    // Chan TRUOC khi gui ho so co hoi cho nha cung cap AI.
    assertContextInScope(req, 'deal', dealId);
    const context = buildDealContext(db, dealId, aiScopes(req));
    const assessment = getAssessment(db, dealId);
    const cells = ASSESSMENT_GRID.map((cell) => {
      const current = assessment.grid.find((g) => g.no === cell.no);
      return `#${cell.no} [${cell.question}] ${cell.source.kind}:${cell.source.key} = ${current?.score ?? 'chưa chấm'}`;
    }).join('\n');

    const { data, meta } = await runStructured(
      db,
      {
        task: 'deal_assessment',
        mode: 'reasoning',
        contextType: 'deal',
        contextId: dealId,
        maxOutputTokens: 2500,
        system:
          'Bạn là chuyên gia bán hàng B2B, đánh giá cơ hội theo khung Opportunity Assessment: 4 câu hỏi ' +
          '(1. Khách có nhu cầu THẬT? 2. Ta có LỢI THẾ hơn đối thủ? 3. Ta có KÝ ĐƯỢC hợp đồng? 4. Có ĐÁNG ĐẦU TƯ — ký được hợp đồng thì ta được gì?), ' +
          'mỗi câu 5 tiêu chí, tổng 20 ô. Chấm 0–3: 0 = chưa biết, 1 = yếu, 2 = khá, 3 = mạnh. ' +
          'CHỈ dựa vào dữ liệu được cung cấp; thiếu dữ liệu thì chấm 0 và đưa vào danh sách điều chưa biết kèm câu hỏi nên hỏi khách. ' +
          'Nói thẳng, kể cả khi kết luận là nên rút. Viết tiếng Việt có dấu, ngắn gọn.',
        prompt:
          'Trả JSON {"summary":"2–4 câu: theo hay rút, vì sao, rủi ro lớn nhất",' +
          `"recommendation":"${DEAL_DECISIONS.join('|')}",` +
          '"criteria":[{"key":"<một trong 9 tiêu chí>","score":0,"reason":"căn cứ ngắn"}],' +
          '"factors":[{"key":"<một trong 8 yếu tố BANT/4P>","score":0,"reason":"căn cứ ngắn"}],' +
          '"unknowns":[{"cell":1,"question":"câu hỏi nên hỏi để làm rõ"}],' +
          '"risks":["rủi ro"],"actions":["việc cụ thể nên làm tuần này"]}.\n' +
          `9 tiêu chí (key): ${ASSESSMENT_CRITERIA.map((k) => `${k} = ${ASSESSMENT_CRITERIA_BRIEF[k]}`).join('; ')}\n` +
          `8 yếu tố BANT/4P (key): ${SCORE_FACTORS.join(', ')}\n` +
          `Hiện trạng 20 ô:\n${cells}\n` +
          `Ô ma trận hiện tại: ${assessment.quadrant}; BANT ${assessment.bant_total}/12; 4P ${assessment.p4_total}/12.\n` +
          `Hôm nay: ${todayLocal()}.\n` +
          `Hồ sơ cơ hội:\n${compactJson(context, 30_000)}`,
      },
      assessmentReviewSchema
    );

    res.json({ assessment: saveAiReview(db, dealId, data, actorContactId(req)), meta });
  } catch (error) {
    asHttpError(error);
  }
});

/* ---------- Danh gia nhanh: "Ke cho AI" (v71) ---------- */

const QUICK_QUESTION_TEXT: Record<string, string> = {
  need: 'Khách có vấn đề thật sự cần giải quyết không?',
  budget: 'Khách đã có (hoặc chắc chắn sẽ có) tiền cho việc này chưa?',
  deadline: 'Khách có hạn chót buộc phải xong không?',
  decision_maker: 'Người bán đã nói chuyện trực tiếp với người duyệt chi chưa?',
  supporter: 'Bên khách có người ủng hộ ta, chịu báo tin cho ta không?',
  fit: 'Giải pháp của ta đáp ứng được yêu cầu chính của khách không?',
  advantage: 'Ta có điểm hơn hẳn đối thủ mà khách công nhận không?',
  process: 'Người bán có biết khách sẽ chọn nhà cung cấp thế nào, ai thật sự quyết không?',
  profit: 'Ký được hợp đồng này có lãi đủ không?',
  future: 'Sau hợp đồng này còn việc tiếp theo hoặc lợi ích lâu dài không?',
};

const quickAssistSchema = z.object({
  story: z.string().trim().max(4000).optional(),
});

const quickAssistResponse = z.object({
  answers: z
    .array(
      z.object({
        question: z.string(),
        answer: z.enum(['yes', 'unsure', 'no']),
        reason: z.string().max(400).default(''),
      })
    )
    .max(20)
    .default([]),
});

/**
 * Nguoi ban ke tu do vai cau ve khach (go hoac dung micro ban phim dien thoai); AI doc
 * kem ho so co hoi va goi y 10 cau tra loi. KHONG luu — giao dien dien san vao trinh hoi
 * tung cau, nguoi dung xem lai roi tu bam Luu.
 */
router.post('/assist/deal/:id/quick-assessment', async (req, res) => {
  try {
    const dealId = intParam(req.params.id);
    assertContextInScope(req, 'deal', dealId);
    const body = parseBody(quickAssistSchema, req);
    const context = buildDealContext(db, dealId, aiScopes(req));
    const current = getQuickAssessment(db, dealId);
    const { data, meta } = await runStructured(
      db,
      {
        task: 'deal_quick_assessment',
        mode: 'fast',
        contextType: 'deal',
        contextId: dealId,
        maxOutputTokens: 1500,
        system:
          'Bạn giúp nhân viên kinh doanh trả lời nhanh 10 câu hỏi đánh giá cơ hội. Trả lời "yes" (Có), ' +
          '"no" (Không) hoặc "unsure" (Chưa rõ). CHỈ dựa vào lời kể và hồ sơ được cung cấp; không đủ căn cứ ' +
          'thì chọn "unsure". Lý do ngắn, tiếng Việt có dấu, nêu căn cứ cụ thể.',
        prompt:
          'Trả JSON {"answers":[{"question":"<key>","answer":"yes|unsure|no","reason":"căn cứ ngắn"}]} cho đủ 10 câu.\n' +
          `Các câu (key = câu hỏi):\n${QUICK_QUESTIONS.map((q) => `${q} = ${QUICK_QUESTION_TEXT[q]}`).join('\n')}\n` +
          `Câu trả lời hiện có: ${current.items.map((i) => `${i.question}=${i.answer ?? 'chưa có'}`).join(', ')}\n` +
          (body.story ? `Lời kể của người bán:\n${body.story}\n` : '') +
          `Hồ sơ cơ hội:\n${compactJson(context, 25_000)}`,
      },
      quickAssistResponse
    );
    const answers = data.answers.filter((a) =>
      (QUICK_QUESTIONS as readonly string[]).includes(a.question)
    );
    res.json({ answers, meta });
  } catch (error) {
    asHttpError(error);
  }
});

const customerAssistSchema = z.object({
  query: z.string().trim().min(2).max(300),
  /** Cho phep AI tim tren web khi can (cham va ton phi hon). */
  web_search: z.boolean().optional(),
});

/**
 * Goi y dien form khach hang tu MST hoac ten. Chi TRA VE goi y — khong ghi gi
 * vao CRM; nguoi dung chon truong nao ap dung roi tu bam Luu.
 */
router.post('/assist/customer', async (req, res) => {
  try {
    const body = parseBody(customerAssistSchema, req);
    res.json(await assistCustomer(db, body.query, { webSearch: body.web_search }));
  } catch (error) {
    asHttpError(error);
  }
});

const taskAssistSchema = z.object({
  draft: z.string().trim().min(3).max(5000),
  context: taskLinksSchema.optional(),
  list_id: z.number().int().positive().nullable().optional(),
  project_id: z.number().int().positive().nullable().optional(),
  assignee_contact_id: z.number().int().positive().nullable().optional(),
  mode: z.enum(['fast', 'balanced', 'reasoning']).optional(),
});

const taskAssistResponse = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(5000).default(''),
  priority: z.enum(PRIORITIES).nullable().default(null),
  start_date: z.string().nullable().default(null),
  due_date: z.string().nullable().default(null),
  checklist: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  links: taskLinksSchema.default({}),
  project_id: z.number().int().positive().nullable().default(null),
  assignee_contact_id: z.number().int().positive().nullable().default(null),
  confidence: z.number().min(0).max(1).default(0.5),
  rationale: z.string().max(1000).default(''),
});

/**
 * Loai bo moi id khong nam trong tap ung vien da gui cho mo hinh.
 *
 * Mo hinh doi khi "nho" mot id tu ngu canh khac hoac don gian la doan. Mot id sai
 * o day khong chi la goi y sai — no se ghi lien ket sai vao CRM neu nguoi dung bam
 * Luu ngay. Nen thu gi khong chung minh duoc thi bo, va noi ro da bo cai gi.
 */
function keepKnownIds(
  proposed: Record<string, number | null | undefined>,
  candidates: Record<string, unknown[]>,
  warnings: string[]
) {
  const kept: Record<string, number> = {};
  const sources = {
    customer_id: 'customers',
    contact_id: 'contacts',
    deal_id: 'deals',
    contract_id: 'contracts',
    quotation_id: 'quotations',
  } as const;
  const hasId = (list: unknown[] | undefined, id: number) =>
    (list ?? []).some((item) => (item as { id?: unknown }).id === id);

  for (const [key, source] of Object.entries(sources)) {
    const value = proposed[key];
    if (value == null) continue;
    if (hasId(candidates[source], value)) kept[key] = value;
    else warnings.push(`Bỏ qua ${key}=${value} do không nằm trong dữ liệu của khách hàng này.`);
  }
  return kept;
}

interface TaskCandidateRow {
  id: number;
  customer_id: number | null;
  owner_contact_id: number | null;
  name?: string | null;
  short_name?: string | null;
  full_name?: string | null;
  title?: string | null;
  number?: string | null;
  code?: string | null;
  project_id?: number | null;
}

/** Chi dua vao prompt nhung ban ghi nguoi hoi duoc xem va co kha nang lien quan. */
function taskAssistCandidates(
  req: Request,
  draft: string,
  anchor: ReturnType<typeof deriveTaskLinks>,
  currentProjectId: number | null,
  currentAssigneeId: number | null
) {
  const normalized = fold(draft);
  const mentioned = (value: string | null | undefined) => {
    const name = fold(value ?? '').trim();
    return name.length >= 3 && normalized.includes(name);
  };
  const personMentioned = (value: string | null | undefined) => {
    if (mentioned(value)) return true;
    const lastName =
      fold(value ?? '')
        .trim()
        .split(/\s+/)
        .at(-1) ?? '';
    return (
      lastName.length >= 3 &&
      normalized.split(/[^a-z0-9]+/).includes(lastName) &&
      /\b(giao|phu trach|anh|chi|ban)\b/.test(normalized)
    );
  };
  const visible = (resource: PermissionResource, sql: string): TaskCandidateRow[] => {
    const records = db.prepare(sql).all() as TaskCandidateRow[];
    const ids = scopeOf(req, resource);
    if (ids === null) return records;
    const allowed = new Set(ids);
    return records.filter(
      (row) => row.owner_contact_id != null && allowed.has(row.owner_contact_id)
    );
  };

  const customers = visible(
    'customers',
    `SELECT id, id AS customer_id, name, short_name, owner_contact_id FROM customers ORDER BY id DESC`
  );
  const contacts = visible(
    'contacts',
    `SELECT ct.id, ct.customer_id, ct.full_name, c.owner_contact_id
       FROM contacts ct JOIN customers c ON c.id = ct.customer_id
      WHERE ct.is_active = 1 ORDER BY ct.id DESC`
  );
  const deals = visible(
    'deals',
    `SELECT id, customer_id, title, project_id, owner_contact_id FROM deals ORDER BY id DESC`
  );
  const contracts = visible(
    'contracts',
    `SELECT ct.id, ct.customer_id, ct.name, ct.number, c.owner_contact_id
       FROM contracts ct JOIN customers c ON c.id = ct.customer_id ORDER BY ct.id DESC`
  );
  const quotations = visible(
    'quotations',
    `SELECT q.id, q.customer_id, q.code, c.owner_contact_id
       FROM quotations q JOIN customers c ON c.id = q.customer_id ORDER BY q.id DESC`
  );
  const projects = visible(
    'projects',
    `SELECT id, customer_id, name, code, owner_contact_id FROM projects
      WHERE is_archived = 0 ORDER BY id DESC`
  );
  // Giong o chon nguoi phu trach: co the giao cho nhan su cua bat ky to chuc nao.
  const assignees = db
    .prepare(`SELECT id, customer_id, full_name FROM contacts WHERE is_active = 1 ORDER BY id DESC`)
    .all() as TaskCandidateRow[];

  const namedContacts = contacts.filter((row) => personMentioned(row.full_name));
  const namedDeals = deals.filter((row) => mentioned(row.title));
  const namedContracts = contracts.filter((row) => mentioned(row.name) || mentioned(row.number));
  const namedQuotations = quotations.filter((row) => mentioned(row.code));
  const namedProjects = projects.filter((row) => mentioned(row.name) || mentioned(row.code));
  const customerIds = new Set<number>(
    [
      anchor.customer_id,
      ...customers
        .filter((row) => mentioned(row.name) || mentioned(row.short_name))
        .map((row) => row.id),
      ...[
        ...namedContacts,
        ...namedDeals,
        ...namedContracts,
        ...namedQuotations,
        ...namedProjects,
      ].map((row) => row.customer_id),
      projects.find((row) => row.id === currentProjectId)?.customer_id,
    ].filter((id): id is number => id != null)
  );
  const related = (row: TaskCandidateRow) =>
    row.customer_id != null && customerIds.has(row.customer_id);
  return {
    customers: customers.filter((row) => customerIds.has(row.id)).slice(0, 20),
    contacts: contacts.filter((row) => related(row) || personMentioned(row.full_name)).slice(0, 35),
    deals: deals.filter((row) => related(row) || mentioned(row.title)).slice(0, 35),
    contracts: contracts
      .filter((row) => related(row) || mentioned(row.name) || mentioned(row.number))
      .slice(0, 25),
    quotations: quotations.filter((row) => related(row) || mentioned(row.code)).slice(0, 25),
    projects: projects
      .filter(
        (row) =>
          row.id === currentProjectId || related(row) || mentioned(row.name) || mentioned(row.code)
      )
      .slice(0, 25),
    assignees: assignees
      .filter(
        (row) =>
          row.id === currentAssigneeId ||
          row.id === actorContactId(req) ||
          personMentioned(row.full_name)
      )
      .slice(0, 25),
  };
}

/**
 * Nhap lieu thong minh: nguoi dung go noi dung cong viec, AI dien not cac truong.
 *
 * KHONG di qua ai_action_proposals — day la goi y dien vao form, nguoi dung xem lai
 * roi moi bam Luu, giong het luong /assist/interaction da chay on. Ket qua van phai
 * qua deriveTaskLinks + assertEntityLinks nen mot goi y sai lien ket bi chan ngay
 * tai day chu khong doi den luc ghi.
 */
router.post('/assist/task', async (req, res) => {
  try {
    const body = parseBody(taskAssistSchema, req);
    const anchor = deriveTaskLinks(db, body.context ?? {});
    assertContextInScope(req, 'customer', anchor.customer_id ?? undefined);
    assertContextInScope(req, 'deal', anchor.deal_id ?? undefined);
    assertLinkTargetsInScope(req, { project_id: body.project_id ?? undefined });
    const candidates = taskAssistCandidates(
      req,
      body.draft,
      anchor,
      body.project_id ?? null,
      body.assignee_contact_id ?? null
    );
    const context = {
      today: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()),
      time_zone: 'Asia/Ho_Chi_Minh',
      current_links: anchor,
      current_project_id: body.project_id ?? null,
      current_assignee_contact_id: body.assignee_contact_id ?? null,
      candidates: Object.fromEntries(
        Object.entries(candidates).map(([key, rows]) => [
          key,
          rows.map(({ owner_contact_id: _ownerContactId, ...row }) => row),
        ])
      ),
    };

    const { data, meta } = await runStructured(
      db,
      {
        task: 'task_assist',
        mode: body.mode ?? 'fast',
        contextType: 'task',
        contextId: anchor.customer_id ?? undefined,
        maxOutputTokens: 1800,
        system:
          'Bạn giúp hoàn thiện phiếu công việc CRM tiếng Việt. Đề xuất mọi trường có thể suy ra chắc chắn từ bản nháp hoặc ngữ cảnh; ' +
          'không bịa dữ kiện và không lấy một ứng viên chỉ vì nó xuất hiện trong danh sách. ' +
          'Mọi id phải thuộc đúng tập candidates tương ứng; không chắc thì để null. ' +
          'Ngày bắt đầu là start_date, ngày kết thúc hoặc hạn là due_date. ' +
          'Diễn giải ngày tương đối theo today/time_zone; không có căn cứ thì để null. ' +
          'priority chỉ đặt khi bản nháp có dấu hiệu rõ, nếu không để null.',
        prompt:
          'Từ bản nháp dưới đây, điền JSON ' +
          '{"title":"tiêu đề ngắn, bắt đầu bằng động từ","description":"","priority":null,' +
          '"start_date":null,"due_date":null,"checklist":["bước 1"],' +
          '"links":{"customer_id":null,"contact_id":null,"deal_id":null,"contract_id":null,"quotation_id":null},' +
          '"project_id":null,"assignee_contact_id":null,' +
          '"confidence":0.0,"rationale":"vì sao chọn như vậy"}.\n' +
          `Bản nháp:\n${body.draft}\n\nNgữ cảnh:\n${compactJson(context, 25_000)}`,
      },
      taskAssistResponse
    );

    const warnings: string[] = [];
    const validDate = (value: string | null, label: string): string | null => {
      if (value == null) return null;
      const parsed = new Date(`${value}T00:00:00Z`);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        Number.isNaN(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== value
      ) {
        warnings.push(`Bỏ qua ${label} vì ngày AI đề xuất không hợp lệ.`);
        return null;
      }
      return value;
    };
    const startDate = validDate(data.start_date, 'ngày bắt đầu');
    let dueDate = validDate(data.due_date, 'ngày kết thúc');
    if (startDate && dueDate && startDate > dueDate) {
      warnings.push('Bỏ qua ngày kết thúc vì sớm hơn ngày bắt đầu.');
      dueDate = null;
    }
    const known = keepKnownIds(data.links, candidates, warnings);
    // Lien ket neo cua nguoi dung luon thang goi y cua mo hinh.
    let links = anchor;
    for (const key of [
      'customer_id',
      'contact_id',
      'deal_id',
      'contract_id',
      'quotation_id',
    ] as const) {
      const id = known[key];
      if (id == null || anchor[key] != null) continue;
      try {
        links = deriveTaskLinks(db, { ...stripNull(links), [key]: id });
      } catch {
        warnings.push(`Bỏ qua ${key}=${id} vì mâu thuẫn với các liên kết đã chọn.`);
      }
    }

    const dealProject = links.deal_id
      ? ((
          db.prepare(`SELECT project_id FROM deals WHERE id = ?`).get(links.deal_id) as
            { project_id: number | null } | undefined
        )?.project_id ?? null)
      : null;
    const proposedProjectId = data.project_id ?? dealProject;
    const project = candidates.projects.find((row) => row.id === proposedProjectId);
    const projectId =
      project &&
      (links.customer_id == null || project.customer_id === links.customer_id) &&
      (dealProject == null || project.id === dealProject)
        ? project.id
        : null;
    if (proposedProjectId != null && projectId == null) {
      warnings.push(
        'Bỏ qua dự án AI đề xuất vì không thuộc ngữ cảnh công việc hoặc không có quyền xem.'
      );
    }
    const assigneeId = candidates.assignees.some((row) => row.id === data.assignee_contact_id)
      ? data.assignee_contact_id
      : null;
    if (data.assignee_contact_id != null && assigneeId == null) {
      warnings.push('Bỏ qua người phụ trách AI đề xuất vì không có trong danh bạ đang hoạt động.');
    }

    const label = (rows: TaskCandidateRow[], id: number | null | undefined) => {
      const row = rows.find((candidate) => candidate.id === id);
      return row?.name ?? row?.full_name ?? row?.title ?? row?.number ?? row?.code ?? null;
    };
    const labels = {
      customer_id: label(candidates.customers, links.customer_id),
      contact_id: label(candidates.contacts, links.contact_id),
      deal_id: label(candidates.deals, links.deal_id),
      contract_id: label(candidates.contracts, links.contract_id),
      quotation_id: label(candidates.quotations, links.quotation_id),
      project_id: label(candidates.projects, projectId),
      assignee_contact_id: label(candidates.assignees, assigneeId),
    };
    const completeLinks = Object.fromEntries(
      TASK_LINK_KEYS.map((key) => [key, links[key] ?? null])
    );

    res.json({
      ...data,
      start_date: startDate,
      due_date: dueDate,
      links: completeLinks,
      project_id: projectId,
      assignee_contact_id: assigneeId,
      labels,
      warnings,
      meta,
    });
  } catch (error) {
    asHttpError(error);
  }
});

/** Chi giu cac khoa co gia tri — de `{...known, ...anchor}` khong bi null cua anchor de len. */
function stripNull(links: Record<string, number | null | undefined>) {
  return Object.fromEntries(Object.entries(links).filter(([, value]) => value != null));
}

const documentAssistResponse = z.object({
  name: z.string().trim().min(1).max(300),
  doc_type: z.string().trim().max(100).default('other'),
  description: z.string().max(2000).default(''),
  tags: z.string().max(500).default(''),
  owner: z.string().max(200).nullable().default(null),
  effective_date: z.string().refine(isRealDate, 'Ngày không hợp lệ').nullable().default(null),
  expires_at: z.string().refine(isRealDate, 'Ngày không hợp lệ').nullable().default(null),
  confidentiality: z.enum(['public', 'internal', 'confidential']).default('internal'),
  customer_name: z.string().max(300).nullable().default(null),
  confidence: z.number().min(0).max(1).default(0.5),
});

/** Do dai toi thieu de coi la "doc duoc" — duoi muc nay coi nhu PDF scan / anh. */
const MIN_USEFUL_CHARS = 200;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/**
 * AI doc noi dung tai lieu roi de xuat metadata.
 *
 * KHONG tu ghi vao documents — chi tra de xuat de nguoi dung duyet, giong luong
 * /assist/task. Doc bang parser cuc bo truoc; chi khi parser khong ra chu (PDF scan,
 * anh) moi gui nguyen tep cho model doc duoc tai lieu, va chi voi tep <= 10 MB.
 */
router.post('/assist/document/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    /* Noi dung tep duoc gui cho nha cung cap AI — phai la tep nguoi goi doc duoc. */
    assertDocumentsInScope(req, [id], 'read');
    const { document, text, method, reason } = await readDocumentText(db, id);
    const warnings: string[] = [];

    const usable = text.trim().length >= MIN_USEFUL_CHARS;
    let attachments: { mime: string; dataBase64: string; fileName: string }[] | undefined;
    if (!usable) {
      if (reason) warnings.push(reason);
      if (document.size <= MAX_ATTACHMENT_BYTES) {
        attachments = [
          {
            mime: document.mime ?? 'application/octet-stream',
            dataBase64: fs.readFileSync(safeFilePath(document.stored_name)).toString('base64'),
            fileName: document.file_name,
          },
        ];
        warnings.push('Không tách được chữ nên đã gửi tệp cho AI đọc trực tiếp.');
      } else {
        warnings.push('Tệp quá lớn để gửi cho AI đọc trực tiếp — chỉ suy đoán từ tên tệp.');
      }
    }

    const customers = db
      .prepare(
        `SELECT id, name FROM customers WHERE org_kind = 'customer'
          ORDER BY updated_at DESC LIMIT 200`
      )
      .all() as { id: number; name: string }[];
    const docTypes = getPicklist(db, 'doc_type').filter((item) => item.is_active === 1);

    const { data, meta } = await runStructured(
      db,
      {
        task: 'document_assist',
        mode: 'balanced',
        contextType: 'document',
        contextId: id,
        maxOutputTokens: 1200,
        requiresCapability: attachments ? 'documentInput' : undefined,
        attachments,
        system:
          'Bạn đọc tài liệu kinh doanh tiếng Việt và rút ra metadata. Chỉ dùng thông tin có trong tài liệu; ' +
          'không suy đoán. Không chắc thì để null hoặc chuỗi rỗng. Ngày phải đúng YYYY-MM-DD.',
        prompt:
          'Trả JSON {"name":"tên tài liệu ngắn gọn","doc_type":"' +
          docTypes.map((item) => item.item_key).join('|') +
          '","description":"tóm tắt 1-3 câu","tags":"nhãn, cách nhau bởi dấu phẩy",' +
          '"owner":null,"effective_date":null,"expires_at":null,' +
          '"confidentiality":"public|internal|confidential","customer_name":null,"confidence":0.0}.\n' +
          `Ý nghĩa doc_type: ${docTypes.map((item) => `${item.item_key} = ${item.label}`).join('; ')}\n` +
          `Tên tệp: ${document.file_name}\n` +
          (usable
            ? `Nội dung (đã trích bằng ${method}):\n${text.slice(0, 12_000)}`
            : 'Nội dung tệp được gửi kèm; nếu không đọc được thì chỉ suy ra từ tên tệp.'),
      },
      documentAssistResponse
    );

    /*
     * Mo hinh tra ve TEN khach hang chu khong phai id — khop lai bang chuoi da bo dau
     * de mot ten viet hoa/thieu dau van tim ra. Khong khop thi bo, khong doan bua.
     */
    const { customer_name: proposedName, ...metadata } = data;
    /* Danh muc loai tai lieu la dong (v62): mo hinh tra khoa la thi roi ve 'other'. */
    if (!docTypes.some((item) => item.item_key === metadata.doc_type)) metadata.doc_type = 'other';
    let customerId: number | null = null;
    if (proposedName) {
      const needle = fold(proposedName);
      const match = customers.find(
        (c) =>
          fold(c.name) === needle || fold(c.name).includes(needle) || needle.includes(fold(c.name))
      );
      if (match) customerId = match.id;
      else warnings.push(`Không tìm thấy khách hàng "${proposedName}" trong hệ thống.`);
    }

    res.json({ ...metadata, customer_id: customerId, extraction: method, warnings, meta });
  } catch (error) {
    asHttpError(error);
  }
});

const meetingNoteSummarySchema = z.object({
  summary: z.string().min(1),
  action_items: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(300),
        due_date: z.string().refine(isRealDate, 'Ngày không hợp lệ').nullable().default(null),
      })
    )
    .max(20)
    .default([]),
});

/**
 * Tom tat ghi chu hop + de xuat viec can lam.
 *
 * De xuat KHONG tao Task truc tiep — di qua ai_action_proposals (saveActionProposal,
 * da co san o ai/actions.ts) dung y het luong /ask, de nguoi dung duyet qua
 * /api/ai/actions/:id/approve thay vi mot duong tao task rieng chi cho man hinh nay.
 */
router.post('/assist/meeting-note/:id/summarize', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    // Chan TRUOC khi gui noi dung cho nha cung cap AI (xem lib/meetingNoteScope.ts).
    assertMeetingNoteInScope(req, id, 'read');
    const note = getMeetingNote(db, id) as {
      title: string;
      purpose_key: string;
      content_text: string;
      customer_id: number | null;
      deal_id: number | null;
      project_id: number | null;
    };
    if (!note.content_text.trim()) {
      throw new HttpError(400, 'Trang chưa có nội dung để tóm tắt');
    }
    const { data, meta } = await runStructured(
      db,
      {
        task: 'meeting_note_summarize',
        mode: 'fast',
        contextType: note.deal_id ? 'deal' : 'project',
        contextId: note.deal_id ?? note.project_id ?? undefined,
        maxOutputTokens: 1200,
        system:
          'Bạn tóm tắt tài liệu tiếng Việt theo đúng mục đích của trang. Chỉ dùng nội dung đã cho, không bịa thêm sự kiện hay số liệu. Chỉ nêu việc cần làm khi nội dung có đề cập. Ngày phải đúng YYYY-MM-DD hoặc null.',
        prompt:
          'Trả JSON {"summary":"tóm tắt 2-4 câu","action_items":[{"title":"việc cần làm, bắt đầu bằng động từ","due_date":null}]}.\n' +
          `Mục đích: ${note.purpose_key}\nTiêu đề: ${note.title}\nNội dung:\n${note.content_text.slice(0, 20_000)}`,
      },
      meetingNoteSummarySchema
    );

    saveAiSummary(db, id, data);
    const proposals = data.action_items.map((item) =>
      saveActionProposal(
        db,
        meta.requestId,
        {
          type: 'create_task',
          title: item.title,
          payload: {
            title: item.title,
            due_date: item.due_date,
            customer_id: note.customer_id ?? undefined,
            deal_id: note.deal_id ?? undefined,
            project_id: note.project_id ?? undefined,
          },
        },
        actorContactId(req)
      )
    );
    res.json({ summary: data.summary, action_items: data.action_items, proposals, meta });
  } catch (error) {
    asHttpError(error);
  }
});

const meetingNoteInlineSchema = z.object({
  instruction: z.enum(['continue', 'fix_grammar', 'rewrite', 'shorten']),
  selection_text: z.string().max(20_000).default(''),
  surrounding_text: z.string().max(20_000).default(''),
});
const meetingNoteInlineResponse = z.object({ text: z.string() });

const INLINE_INSTRUCTION: Record<string, string> = {
  continue:
    'Viết tiếp đoạn văn bản, giữ nguyên văn phong. Chỉ trả về phần viết tiếp, không lặp lại đoạn đã có.',
  fix_grammar:
    'Sửa lỗi chính tả và ngữ pháp tiếng Việt của đoạn đã chọn, giữ nguyên ý. Chỉ trả về đoạn đã sửa.',
  rewrite:
    'Viết lại đoạn đã chọn cho rõ ràng, chuyên nghiệp hơn, giữ nguyên ý chính. Chỉ trả về đoạn đã viết lại.',
  shorten: 'Rút gọn đoạn đã chọn, giữ ý chính. Chỉ trả về đoạn đã rút gọn.',
};

/**
 * Ho tro viet trong luc soan ghi chu hop.
 *
 * KHONG streaming — ai/gateway.ts la request/response. Client hien trang thai dang
 * xu ly roi chen/thay ket qua mot lan, khac Notion AI go chu dan.
 */
router.post('/assist/meeting-note/:id/inline', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    assertMeetingNoteInScope(req, id, 'update');
    const note = getMeetingNote(db, id) as { deal_id: number | null; project_id: number | null };
    const body = parseBody(meetingNoteInlineSchema, req);

    const result = await runAi(db, {
      task: 'meeting_note_inline',
      mode: 'fast',
      contextType: note.deal_id ? 'deal' : 'project',
      contextId: note.deal_id ?? note.project_id ?? undefined,
      maxOutputTokens: 600,
      system:
        'Bạn hỗ trợ soạn tài liệu tiếng Việt. Chỉ trả về đúng đoạn văn bản được yêu cầu, không giải thích, không markdown thừa.',
      prompt:
        `${INLINE_INSTRUCTION[body.instruction]}\n` +
        (body.surrounding_text
          ? `Ngữ cảnh xung quanh:\n${body.surrounding_text.slice(0, 4000)}\n`
          : '') +
        `Đoạn văn bản:\n${body.selection_text}`,
    });
    res.json(meetingNoteInlineResponse.parse({ text: result.text.trim() }));
  } catch (error) {
    asHttpError(error);
  }
});

/**
 * Gemini gioi han ~20MB cho TOAN BO request chua `inline_data`, con multer cho
 * phep tai len 25MB (documents.ts). Chan som o day de nguoi dung nhan mot cau
 * giai thich thay vi mot loi 400 tu nha cung cap dich thanh 502.
 */
const MAX_INLINE_AUDIO_BYTES = 18 * 1024 * 1024;
/** Doc het mot ban ghi vai phut lau hon nhieu so voi mac dinh 45s cua providers.ts. */
const VOICE_CONVERT_TIMEOUT_MS = 180_000;

const voicePromptTemplateSchema = z.object({
  key: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(100),
  prompt: z.string().trim().min(1).max(4000),
});
const voicePromptTemplatesSchema = z.array(voicePromptTemplateSchema).max(30);

router.get('/voice-prompt-templates', (_req, res) => {
  res.json(getVoicePromptTemplates(db));
});

router.put('/voice-prompt-templates', (req, res) => {
  const body: VoicePromptTemplate[] = parseBody(voicePromptTemplatesSchema, req);
  saveVoicePromptTemplates(db, body);
  res.json(body);
});

const voiceModelSchema = z.object({
  provider: z.enum(AI_PROVIDERS).nullable(),
  model: z.string().trim().max(200).nullable(),
});

/* Model tim kiem cua 9Router — 9Router khong tim web trong chat nen ung dung tu tim. */
router.get('/web-search-model', (_req, res) => {
  res.json({ model: getWebSearchModel(db) });
});
router.put('/web-search-model', (req, res) => {
  const body = parseBody(z.object({ model: z.string().trim().max(200).nullable() }), req);
  saveWebSearchModel(db, body.model);
  res.json({ model: getWebSearchModel(db) });
});
router.get('/web-search-models', async (_req, res) => {
  const connection = providerConnection(db, '9router');
  if (!connection) throw new HttpError(409, 'Chưa cấu hình API key cho 9Router');
  try {
    res.json(await listNineRouterSearchModels(connection));
  } catch (error) {
    asHttpError(error);
  }
});

router.get('/voice-model', (_req, res) => {
  res.json(getVoiceModel(db));
});

router.put('/voice-model', (req, res) => {
  const body = parseBody(voiceModelSchema, req);
  saveVoiceModel(db, body);
  res.json(getVoiceModel(db));
});

const voiceNoteConvertSchema = z.object({
  document_id: z.number().int().positive(),
  template_key: z.string().trim().min(1).max(50).optional(),
});
const voiceNoteConvertResponse = z.object({ text: z.string() });

/**
 * Chuyen mot ban ghi am (da tai len qua POST /api/documents, xem
 * VoiceNoteRecorder.tsx) thanh van ban — nguyen van hoac tom tat theo mot mau
 * prompt da cau hinh. Dung chung cho ca Ghi chu hop lan Ghi chu nhanh: endpoint
 * chi can `document_id`, khong quan tam ban ghi thuoc loai ghi chu nao.
 *
 * Model: neu nguoi dung da chon trong Cai dat thi ghim cung provider + model do;
 * neu de "tu dong" thi `requiresCapability: 'audioInput'` cho gateway.ts tu loc
 * nha cung cap doc duoc audio (hien chi Gemini) — xem providers.ts.
 *
 * Han gio rieng `VOICE_CONVERT_TIMEOUT_MS`: mac dinh 45s cua providers.ts du cho
 * mot cau chat nhung khong du de mot model doc het ban ghi vai phut, va lan het
 * gio do noi len giao dien thanh dung mot con so 502 khong noi len dieu gi.
 */
router.post('/assist/voice-note/convert', async (req, res) => {
  try {
    const body = parseBody(voiceNoteConvertSchema, req);
    assertDocumentsInScope(req, [body.document_id], 'read');
    const doc = db
      .prepare(
        `SELECT stored_name, mime, file_name FROM documents WHERE id = ? AND deleted_at IS NULL`
      )
      .get(body.document_id) as
      { stored_name: string; mime: string; file_name: string } | undefined;
    if (!doc) throw new HttpError(404, 'Không tìm thấy tệp ghi âm');
    if (!doc.mime.startsWith('audio/')) throw new HttpError(422, 'Tệp này không phải bản ghi âm');

    const filePath = safeFilePath(doc.stored_name);
    if (!fs.existsSync(filePath)) throw new HttpError(404, 'Tệp ghi âm không còn trên ổ đĩa');
    const bytes = fs.statSync(filePath).size;
    if (bytes > MAX_INLINE_AUDIO_BYTES) {
      throw new HttpError(
        413,
        `Bản ghi ${(bytes / 1024 / 1024).toFixed(1)}MB vượt giới hạn ` +
          `${MAX_INLINE_AUDIO_BYTES / 1024 / 1024}MB cho một lần chuyển. Hãy chia thành nhiều đoạn ngắn hơn.`
      );
    }
    const dataBase64 = fs.readFileSync(filePath).toString('base64');

    let system: string;
    let prompt: string;
    if (body.template_key) {
      const template = getVoicePromptTemplates(db).find((t) => t.key === body.template_key);
      if (!template) throw new HttpError(404, 'Không tìm thấy mẫu prompt');
      system =
        'Bạn xử lý bản ghi âm cuộc họp/trao đổi tiếng Việt theo đúng yêu cầu bên dưới. Chỉ trả về nội dung được yêu cầu, không thêm lời dẫn hay giải thích ngoài lề.';
      prompt = template.prompt;
    } else {
      system =
        'Bạn chuyển bản ghi âm tiếng Việt thành văn bản. Chép lại NGUYÊN VĂN lời nói, đầy đủ, không tóm tắt, không thêm nhận xét.';
      prompt = 'Chuyển đoạn ghi âm đính kèm thành văn bản đầy đủ.';
    }

    const voiceModel = getVoiceModel(db);
    const result = await runAi(db, {
      task: 'voice_note_convert',
      mode: 'fast',
      ...(voiceModel.provider && voiceModel.model
        ? { provider: voiceModel.provider, model: voiceModel.model }
        : { requiresCapability: 'audioInput' as const }),
      timeoutMs: VOICE_CONVERT_TIMEOUT_MS,
      maxOutputTokens: 4000,
      system,
      prompt,
      attachments: [{ mime: doc.mime, dataBase64, fileName: doc.file_name }],
    });
    res.json(voiceNoteConvertResponse.parse({ text: result.text.trim() }));
  } catch (error) {
    asHttpError(error);
  }
});

const askHistoryItemSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(4000),
});

const askSchema = z.object({
  question: z.string().trim().min(3).max(10_000),
  scope: z.enum(['crm', 'documents', 'all']).default('all'),
  mode: z.enum(['fast', 'balanced', 'reasoning']).optional(),
  history: z.array(askHistoryItemSchema).max(10).default([]),
  /* Co thi luot hoi-dap duoc ghi vao phien do. Bo trong van hoi duoc — cac noi
     goi khac (vd o nhap nhanh) khong bat buoc phai co phien. */
  session_id: z.number().int().positive().optional(),
  /* Ban ghi nguoi dung dang xem khi mo bang Tro ly nhanh. Co thi ho so day du
     cua no vao ngu canh, de "khach hang nay" / "co hoi nay" co nghia. */
  context: z
    .object({
      type: z.enum(['customer', 'deal']),
      id: z.number().int().positive(),
    })
    .optional(),
});
const askResponseSchema = z.object({
  answer: z.string().min(1),
  sources: z.array(z.string()).max(20).default([]),
  follow_up_questions: z.array(z.string()).max(5).default([]),
  proposed_action: proposedActionSchema.nullable().optional(),
});

router.post('/ask', async (req, res) => {
  try {
    const body = parseBody(askSchema, req);
    /* Kiem quyen TRUOC moi viec khac: id do trinh duyet gui len, va ho so ban ghi
       se di thang vao ngu canh cho mo hinh — doan id la doc duoc ho so nguoi khac. */
    let focus: { type: 'customer' | 'deal'; id: number; label: string; data: unknown } | null =
      null;
    if (body.context) {
      const { type, id } = body.context;
      assertContextInScope(req, type, id);
      const data =
        type === 'customer'
          ? buildCustomerContext(db, id, aiScopes(req))
          : buildDealContext(db, id, aiScopes(req));
      focus = { type, id, label: focusLabel(data, type), data };
    }
    if (body.scope !== 'crm') {
      const count = db.prepare(`SELECT COUNT(*) AS n FROM ai_document_chunks`).get() as {
        n: number;
      };
      const documents = db
        .prepare(`SELECT COUNT(*) AS n FROM documents WHERE deleted_at IS NULL`)
        .get() as { n: number };
      if (count.n === 0 && documents.n > 0) await indexAllDocuments(db);
    }
    const context = {
      /* Dat DAU TIEN: compactJson cat tu cuoi khi qua dai, ho so ban ghi dang xem
         la phan khong duoc mat. */
      ...(focus ? { focus: { type: focus.type, record: focus.data } } : {}),
      crm:
        body.scope === 'documents'
          ? null
          : {
              today: buildTodayContext(db, aiScope(req)),
              search_matches: buildSearchContext(db, body.question, aiScopes(req)),
              recent_quick_notes: buildQuickNoteContext(db, scopeOf(req, 'notes')),
            },
      documents:
        body.scope === 'crm'
          ? []
          : searchDocumentChunks(
              db,
              body.question,
              body.scope === 'all' ? 8 : 12,
              documentScope(req, 'read', 'd')
            ),
    };
    const history = body.history
      .map((item) => `${item.role === 'user' ? 'Người dùng' : 'Trợ lý'}: ${item.content}`)
      .join('\n');
    const result = await runAi(db, {
      task: 'crm_ask',
      mode: body.mode,
      contextType: focus?.type,
      contextId: focus?.id,
      json: true,
      system:
        'Bạn là trợ lý công việc và CRM chủ động cho một người dùng Việt Nam. Trả lời trực tiếp, ưu tiên việc cần làm, rủi ro và bước tiếp theo. ' +
        'Chỉ coi dữ liệu trong ngữ cảnh hiện tại là nguồn sự thật; lịch sử hội thoại chỉ giúp hiểu câu hỏi nối tiếp. Nói rõ khi thiếu dữ liệu. ' +
        'Không tự thực thi hành động. Nếu có hành động phù hợp, chỉ đề xuất đúng một action theo schema. Trả JSON hợp lệ.',
      prompt:
        `Hôm nay: ${todayLocal()}\n` +
        (history ? `Lịch sử hội thoại gần nhất:\n${history}\n\n` : '') +
        (focus
          ? `Người dùng đang mở ${focus.type === 'customer' ? 'khách hàng' : 'cơ hội'} "${focus.label}" (id ${focus.id}); hồ sơ đầy đủ nằm ở "focus" trong ngữ cảnh. ` +
            `"${focus.type === 'customer' ? 'Khách hàng này' : 'Cơ hội này'}", "ở đây" hay câu hỏi không nêu tên đều chỉ bản ghi đó.\n`
          : '') +
        `Câu hỏi hiện tại: ${body.question}\n` +
        'Trả JSON {"answer":"...","sources":["..."],"follow_up_questions":["..."],"proposed_action":null}. ' +
        'proposed_action nếu có phải là một trong: create_task, create_reminder, update_deal_next_action, create_interaction với payload đầy đủ. ' +
        `Không đưa action nếu thiếu ID hoặc ngày chính xác. Ngữ cảnh:\n${compactJson(context)}`,
      maxOutputTokens: 2400,
    });
    const parsed = askResponseSchema.parse(parseAiJson(result.text));
    const proposal = parsed.proposed_action
      ? saveActionProposal(db, result.requestId, parsed.proposed_action, actorContactId(req))
      : null;
    const payload = {
      answer: parsed.answer,
      sources: parsed.sources,
      follow_up_questions: parsed.follow_up_questions,
      proposal,
      meta: result,
    };
    /* Ghi sau khi da co cau tra loi: hoi that bai thi khong de lai mot cau hoi
       treo lo lung trong lich su. */
    if (body.session_id && getSession(db, body.session_id, chatOwner(req))) {
      appendTurn(db, body.session_id, body.question, parsed.answer, {
        sources: payload.sources,
        follow_up_questions: payload.follow_up_questions,
        proposal: payload.proposal,
        meta: payload.meta,
        page_context: focus ? { type: focus.type, id: focus.id, label: focus.label } : null,
      });
    }
    res.json(payload);
  } catch (error) {
    asHttpError(error);
  }
});

/* ---------- Phien chat voi Tro ly AI (v37) ---------- */

router.get('/chats', (req, res) => res.json(listSessions(db, chatOwner(req))));

router.post('/chats', (req, res) => {
  const body = parseBody(z.object({ scope: z.enum(['crm', 'documents', 'all']).optional() }), req);
  res.status(201).json(createSession(db, chatOwner(req), body.scope ?? 'all'));
});

router.get('/chats/:id', (req, res) => {
  const id = intParam(req.params.id);
  const owner = chatOwner(req);
  const session = getSession(db, id, owner);
  if (!session) throw new HttpError(404, 'Không tìm thấy phiên chat');
  res.json({ ...session, messages: listMessages(db, id) });
});

router.patch('/chats/:id', (req, res) => {
  const id = intParam(req.params.id);
  const owner = chatOwner(req);
  if (!getSession(db, id, owner)) throw new HttpError(404, 'Không tìm thấy phiên chat');
  const body = parseBody(z.object({ title: z.string().trim().min(1).max(80) }), req);
  renameSession(db, id, body.title, owner);
  res.json(getSession(db, id, owner));
});

router.delete('/chats/:id', (req, res) => {
  const id = intParam(req.params.id);
  const owner = chatOwner(req);
  if (!getSession(db, id, owner)) throw new HttpError(404, 'Không tìm thấy phiên chat');
  deleteSession(db, id, owner);
  res.status(204).end();
});

router.post('/feedback', (req, res) => {
  const body = parseBody(
    z.object({
      request_id: z.string().uuid(),
      action: z.enum(['accepted', 'edited', 'rejected', 'helpful', 'unhelpful']),
      note: z.string().max(2000).optional(),
    }),
    req
  );
  const info = db
    .prepare(`INSERT INTO ai_feedback (request_id, action, note) VALUES (?, ?, ?)`)
    .run(body.request_id, body.action, body.note ?? '');
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

router.get('/actions', (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  res.json(listActionProposals(db, status, proposalViewer(req)));
});
router.post('/actions/:id/approve', (req, res) => {
  const id = intParam(req.params.id);
  assertProposalAccess(req, id, true);
  res.json(approveActionProposal(db, id, actorContactId(req)));
});
router.post('/actions/:id/reject', (req, res) => {
  const id = intParam(req.params.id);
  assertProposalAccess(req, id, false);
  res.json(rejectActionProposal(db, id));
});

/* Lap chi muc lai TOAN BO kho tep la thao tac quan tri; tung tep thi theo quyen doc tep. */
router.post('/documents/index', requirePermission('settings.ai', 'update'), async (_req, res) =>
  res.json(await indexAllDocuments(db))
);
router.post('/documents/:id/index', async (req, res) => {
  const id = intParam(req.params.id);
  assertDocumentsInScope(req, [id], 'read');
  res.json(await indexDocument(db, id));
});
router.get('/documents/search', (req, res) => {
  const query = String(req.query.q ?? '').trim();
  res.json(query ? searchDocumentChunks(db, query, 8, documentScope(req, 'read', 'd')) : []);
});

router.get('/usage', (_req, res) => {
  const totals = db
    .prepare(
      `SELECT COUNT(*) AS requests,
              SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS successful,
              COALESCE(SUM(input_tokens), 0) AS input_tokens,
              COALESCE(SUM(output_tokens), 0) AS output_tokens,
              SUM(estimated_cost_usd) AS estimated_cost_usd,
              CAST(AVG(CASE WHEN status = 'success' THEN latency_ms END) AS INTEGER) AS avg_latency_ms
         FROM ai_usage_logs WHERE created_at >= datetime('now','localtime','-30 days')`
    )
    .get();
  const byProvider = db
    .prepare(
      `SELECT provider, COUNT(*) AS requests, COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens,
              SUM(estimated_cost_usd) AS estimated_cost_usd
         FROM ai_usage_logs WHERE created_at >= datetime('now','localtime','-30 days')
        GROUP BY provider ORDER BY requests DESC`
    )
    .all();
  const daily = db
    .prepare(
      `SELECT date(created_at) AS day, COUNT(*) AS requests,
              COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens,
              SUM(estimated_cost_usd) AS estimated_cost_usd
         FROM ai_usage_logs WHERE created_at >= datetime('now','localtime','-30 days')
        GROUP BY date(created_at) ORDER BY day`
    )
    .all();
  const recent = db.prepare(`SELECT * FROM ai_usage_logs ORDER BY created_at DESC LIMIT 50`).all();
  res.json({ totals, by_provider: byProvider, daily, recent });
});

router.get('/automations', (_req, res) => {
  const items = db.prepare(`SELECT * FROM ai_automations ORDER BY id`).all() as Record<
    string,
    unknown
  >[];
  res.json(
    items.map((item) => ({
      ...item,
      enabled: Boolean(item.enabled),
      config: JSON.parse(String(item.config_json ?? '{}')) as unknown,
      config_json: undefined,
    }))
  );
});
/* Bat / tat / doi chu ky automation la cau hinh chung cua ca he thong. */
router.patch('/automations/:id', requirePermission('settings.ai', 'update'), (req, res) => {
  const id = intParam(String(req.params.id));
  const body = parseBody(
    z.object({
      enabled: z.boolean().optional(),
      interval_minutes: z.number().int().min(15).max(10080).optional(),
      config: z.record(z.string(), z.unknown()).optional(),
    }),
    req
  );
  const current = db.prepare(`SELECT * FROM ai_automations WHERE id = ?`).get(id) as
    Record<string, unknown> | undefined;
  if (!current) throw new HttpError(404, 'Không tìm thấy automation AI');
  db.prepare(
    `UPDATE ai_automations SET enabled = ?, interval_minutes = ?, config_json = ?,
            next_run_at = CASE WHEN ? = 1 THEN datetime('now','localtime') ELSE NULL END,
            updated_at = datetime('now','localtime') WHERE id = ?`
  ).run(
    body.enabled === undefined ? current.enabled : body.enabled ? 1 : 0,
    body.interval_minutes ?? current.interval_minutes,
    JSON.stringify(body.config ?? JSON.parse(String(current.config_json))),
    body.enabled === undefined ? current.enabled : body.enabled ? 1 : 0,
    id
  );
  res.json({ ok: true });
});
router.post('/automations/:id/run', (req, res) =>
  res.json(runAutomation(db, intParam(req.params.id)))
);
router.get('/notifications', (req, res) => {
  const unread = req.query.unread === '1';
  res.json(
    (
      db
        .prepare(
          `SELECT * FROM ai_notifications ${unread ? 'WHERE is_read = 0' : ''}
            ORDER BY created_at DESC LIMIT 100`
        )
        .all() as { link: string | null; is_read: number }[]
    )
      /* Cung luat voi chuong thong bao (routes/notifications.ts). */
      .filter((item) => aiNotificationVisible(req, item.link))
      .map((item) => ({ ...item, is_read: Boolean(item.is_read) }))
  );
});
router.patch('/notifications/:id/read', (req, res) => {
  const id = intParam(req.params.id);
  const row = db.prepare(`SELECT link FROM ai_notifications WHERE id = ?`).get(id) as
    { link: string | null } | undefined;
  if (!row || !aiNotificationVisible(req, row.link)) {
    throw new HttpError(404, 'Không tìm thấy thông báo');
  }
  db.prepare(`UPDATE ai_notifications SET is_read = 1 WHERE id = ?`).run(id);
  res.json({ ok: true });
});

export default router;
