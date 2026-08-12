import fs from 'node:fs';
import { Router } from 'express';
import { z } from 'zod';
import { DOC_TYPES, PRIORITIES } from '@workflow/contracts';
import { taskLinksSchema } from '@workflow/contracts/schemas';
import { db } from '../db/connection.ts';
import { deriveTaskLinks } from '../lib/entityRelations.ts';
import { fold } from '../lib/viSearch.ts';
import { HttpError, intParam, parseBody } from '../lib/validate.ts';
import {
  approveActionProposal,
  listActionProposals,
  proposedActionSchema,
  rejectActionProposal,
  saveActionProposal,
} from '../services/ai/actions.ts';
import { runAutomation } from '../services/ai/automations.ts';
import {
  listProviderConfigs,
  syncProviderModels,
  updateProviderConfig,
} from '../services/ai/configService.ts';
import {
  buildCustomerContext,
  buildDealContext,
  buildTaskAssistContext,
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
import { parseAiJson, runAi, runStructured } from '../services/ai/gateway.ts';
import { AiProviderError, AI_PROVIDERS, type AiProviderName } from '../services/ai/types.ts';

const router = Router();

function providerParam(value: string | undefined): AiProviderName {
  if (!AI_PROVIDERS.includes(value as AiProviderName)) {
    throw new HttpError(400, 'Nhà cung cấp AI không hợp lệ');
  }
  return value as AiProviderName;
}

function asHttpError(error: unknown): never {
  if (error instanceof HttpError) throw error;
  if (error instanceof AiProviderError) {
    const status =
      error.code === 'not_configured' || /quota/.test(error.code)
        ? 409
        : error.status === 401 || error.status === 403
          ? 401
          : 502;
    throw new HttpError(status, error.message, { code: error.code });
  }
  if (error instanceof z.ZodError) {
    throw new HttpError(
      502,
      `Phản hồi AI không đúng cấu trúc: ${error.issues[0]?.message ?? 'không hợp lệ'}`
    );
  }
  throw error;
}

function safeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new HttpError(400, 'API Base URL không hợp lệ');
  }
  const localhost = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
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

router.post('/brief', async (req, res) => {
  try {
    const body = parseBody(briefRequestSchema, req);
    if (body.context_type !== 'today' && !body.context_id) {
      throw new HttpError(400, 'Thiếu context_id');
    }
    const context =
      body.context_type === 'today'
        ? buildTodayContext(db)
        : body.context_type === 'customer'
          ? buildCustomerContext(db, body.context_id!)
          : buildDealContext(db, body.context_id!);
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

const interactionAssistSchema = z.object({
  customer_id: z.number().int().positive(),
  deal_id: z.number().int().positive().nullable().optional(),
  raw_notes: z.string().trim().min(10).max(20_000),
});
const interactionAssistResponse = z.object({
  summary: z.string().min(1),
  result: z.string().default(''),
  next_action: z.string().default(''),
  next_action_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
  confidence: z.number().min(0).max(1).default(0.5),
});

router.post('/assist/interaction', async (req, res) => {
  try {
    const body = parseBody(interactionAssistSchema, req);
    const context = body.deal_id
      ? buildDealContext(db, body.deal_id)
      : buildCustomerContext(db, body.customer_id);
    const result = await runAi(db, {
      task: 'interaction_assist',
      mode: 'fast',
      contextType: body.deal_id ? 'deal' : 'customer',
      contextId: body.deal_id ?? body.customer_id,
      json: true,
      system:
        'Bạn chuẩn hóa ghi chú CRM tiếng Việt. Không thêm sự kiện không có trong ghi chú. Ngày phải YYYY-MM-DD hoặc null. Trả JSON hợp lệ.',
      prompt: `Từ ghi chú, điền JSON {"summary":"tóm tắt rõ ràng","result":"kết quả","next_action":"hành động cụ thể","next_action_date":null,"confidence":0.0}. Hôm nay: ${new Date().toISOString().slice(0, 10)}. Ghi chú:\n${body.raw_notes}\nNgữ cảnh tham khảo:\n${compactJson(context, 20_000)}`,
      maxOutputTokens: 1000,
    });
    res.json({ ...interactionAssistResponse.parse(parseAiJson(result.text)), meta: result });
  } catch (error) {
    asHttpError(error);
  }
});

const taskAssistSchema = z.object({
  draft: z.string().trim().min(3).max(5000),
  context: taskLinksSchema.optional(),
  list_id: z.number().int().positive().nullable().optional(),
  mode: z.enum(['fast', 'balanced', 'reasoning']).optional(),
});

const taskAssistResponse = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(5000).default(''),
  priority: z.enum(PRIORITIES).default('medium'),
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
  checklist: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  links: taskLinksSchema.default({}),
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
    const context = buildTaskAssistContext(db, anchor);

    const { data, meta } = await runStructured(
      db,
      {
        task: 'task_assist',
        mode: body.mode ?? 'fast',
        contextType: 'task',
        contextId: anchor.customer_id ?? undefined,
        maxOutputTokens: 1200,
        system:
          'Bạn giúp hoàn thiện phiếu công việc CRM tiếng Việt. Chỉ dùng dữ kiện có trong bản nháp và ngữ cảnh, ' +
          'không bịa thêm sự kiện. Với các trường liên kết, chỉ được chọn id có trong candidates; không chắc thì để null. ' +
          'Ngày phải đúng YYYY-MM-DD hoặc null.',
        prompt:
          'Từ bản nháp dưới đây, điền JSON ' +
          '{"title":"tiêu đề ngắn, bắt đầu bằng động từ","description":"","priority":"low|medium|high|urgent",' +
          '"start_date":null,"due_date":null,"checklist":["bước 1"],' +
          '"links":{"contact_id":null,"deal_id":null,"contract_id":null,"quotation_id":null},' +
          '"confidence":0.0,"rationale":"vì sao chọn như vậy"}.\n' +
          `Bản nháp:\n${body.draft}\n\nNgữ cảnh:\n${compactJson(context, 25_000)}`,
      },
      taskAssistResponse
    );

    const warnings: string[] = [];
    const known = keepKnownIds(data.links, context.candidates, warnings);
    // Lien ket neo cua nguoi dung luon thang goi y cua mo hinh.
    let links = anchor;
    try {
      links = deriveTaskLinks(db, { ...known, ...stripNull(anchor) });
    } catch {
      warnings.push('Bỏ qua liên kết AI đề xuất vì mâu thuẫn với ngữ cảnh đang mở.');
    }

    res.json({ ...data, links, warnings, meta });
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
  doc_type: z.enum(DOC_TYPES).default('other'),
  description: z.string().max(2000).default(''),
  tags: z.string().max(500).default(''),
  owner: z.string().max(200).nullable().default(null),
  effective_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
  expires_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
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
          DOC_TYPES.join('|') +
          '","description":"tóm tắt 1-3 câu","tags":"nhãn, cách nhau bởi dấu phẩy",' +
          '"owner":null,"effective_date":null,"expires_at":null,' +
          '"confidentiality":"public|internal|confidential","customer_name":null,"confidence":0.0}.\n' +
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

function searchCrm(query: string) {
  const q = fold(query);
  const like = `%${q}%`;
  return {
    customers: db
      .prepare(
        `SELECT id, name, industry, status, notes FROM customers
          WHERE org_kind = 'customer' AND search_text LIKE ?
          ORDER BY updated_at DESC LIMIT 8`
      )
      .all(like),
    deals: db
      .prepare(
        `SELECT d.id, d.title, d.stage, d.value_vnd, d.next_action, d.next_action_date,
                c.name AS customer_name,
                (SELECT MAX(i.occurred_at) FROM interactions i WHERE i.deal_id = d.id) AS last_interaction
           FROM deals d JOIN customers c ON c.id = d.customer_id
          WHERE d.search_text LIKE ? OR c.search_text LIKE ?
          ORDER BY d.updated_at DESC LIMIT 12`
      )
      .all(like, like),
    contracts: db
      .prepare(
        `SELECT k.id, k.name, k.number, k.status, k.value_vnd, k.end_date, c.name AS customer_name
           FROM contracts k JOIN customers c ON c.id = k.customer_id
          WHERE k.search_text LIKE ? OR c.search_text LIKE ? ORDER BY k.end_date LIMIT 8`
      )
      .all(like, like),
    tasks: db
      .prepare(
        `SELECT k.id, k.title, k.priority, k.due_date, k.is_done, c.name AS customer_name,
                d.title AS deal_title
           FROM cards k LEFT JOIN customers c ON c.id = k.customer_id
           LEFT JOIN deals d ON d.id = k.deal_id
          WHERE k.search_text LIKE ? AND k.is_archived = 0 ORDER BY k.updated_at DESC LIMIT 12`
      )
      .all(like),
  };
}

const askSchema = z.object({
  question: z.string().trim().min(3).max(10_000),
  scope: z.enum(['crm', 'documents', 'all']).default('all'),
  mode: z.enum(['fast', 'balanced', 'reasoning']).optional(),
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
      crm: body.scope === 'documents' ? null : searchCrm(body.question),
      documents:
        body.scope === 'crm'
          ? []
          : searchDocumentChunks(db, body.question, body.scope === 'all' ? 8 : 12),
    };
    const result = await runAi(db, {
      task: 'crm_ask',
      mode: body.mode,
      json: true,
      system:
        'Bạn là trợ lý phân tích CRM. Chỉ dùng ngữ cảnh được cung cấp, nói rõ khi thiếu dữ liệu. Không tự thực thi hành động. Nếu có hành động phù hợp, chỉ đề xuất đúng một action theo schema. Trả JSON hợp lệ.',
      prompt: `Câu hỏi: ${body.question}\nTrả JSON {"answer":"...","sources":["..."],"follow_up_questions":["..."],"proposed_action":null}. proposed_action nếu có phải là một trong: create_task, create_reminder, update_deal_next_action, create_interaction với payload đầy đủ. Không đưa action nếu thiếu ID hoặc ngày chính xác. Ngữ cảnh:\n${compactJson(context)}`,
      maxOutputTokens: 2400,
    });
    const parsed = askResponseSchema.parse(parseAiJson(result.text));
    const proposal = parsed.proposed_action
      ? saveActionProposal(db, result.requestId, parsed.proposed_action)
      : null;
    res.json({
      answer: parsed.answer,
      sources: parsed.sources,
      follow_up_questions: parsed.follow_up_questions,
      proposal,
      meta: result,
    });
  } catch (error) {
    asHttpError(error);
  }
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
  res.json(listActionProposals(db, status));
});
router.post('/actions/:id/approve', (req, res) =>
  res.json(approveActionProposal(db, intParam(req.params.id)))
);
router.post('/actions/:id/reject', (req, res) =>
  res.json(rejectActionProposal(db, intParam(req.params.id)))
);

router.post('/documents/index', async (_req, res) => res.json(await indexAllDocuments(db)));
router.post('/documents/:id/index', async (req, res) =>
  res.json(await indexDocument(db, intParam(req.params.id)))
);
router.get('/documents/search', (req, res) => {
  const query = String(req.query.q ?? '').trim();
  res.json(query ? searchDocumentChunks(db, query) : []);
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
router.patch('/automations/:id', (req, res) => {
  const id = intParam(req.params.id);
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
    db
      .prepare(
        `SELECT * FROM ai_notifications ${unread ? 'WHERE is_read = 0' : ''}
          ORDER BY created_at DESC LIMIT 100`
      )
      .all()
      .map((item) => ({
        ...(item as object),
        is_read: Boolean((item as { is_read: number }).is_read),
      }))
  );
});
router.patch('/notifications/:id/read', (req, res) => {
  db.prepare(`UPDATE ai_notifications SET is_read = 1 WHERE id = ?`).run(intParam(req.params.id));
  res.json({ ok: true });
});

export default router;
