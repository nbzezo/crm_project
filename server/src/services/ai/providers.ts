import {
  AiProviderError,
  type AiProviderName,
  type DiscoveredModel,
  type GenerateRequest,
  type GenerateResult,
  type ModelCapabilities,
  type ProviderConnection,
} from './types.ts';

const JSON_HEADERS = { 'content-type': 'application/json' };

function baseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function messageFromError(body: unknown, fallback: string): string {
  const root = asRecord(body);
  const nested = asRecord(root.error);
  const message = nested.message ?? root.message ?? root.error;
  return typeof message === 'string' && message.trim() ? message : fallback;
}

async function fetchJson(
  url: string,
  init: RequestInit,
  timeoutMs = 45_000
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    const timeout = error instanceof Error && error.name === 'TimeoutError';
    throw new AiProviderError(
      timeout ? 'Nhà cung cấp AI phản hồi quá thời gian' : 'Không thể kết nối nhà cung cấp AI',
      timeout ? 'timeout' : 'network_error',
      undefined,
      true
    );
  }

  let body: unknown = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }
  if (!response.ok) {
    const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
    throw new AiProviderError(
      messageFromError(body, `Nhà cung cấp AI trả về lỗi ${response.status}`),
      `provider_${response.status}`,
      response.status,
      retryable
    );
  }
  return asRecord(body);
}

function defaultCapabilities(overrides: Partial<ModelCapabilities> = {}): ModelCapabilities {
  return {
    text: true,
    structuredOutput: true,
    toolCalling: true,
    vision: false,
    documentInput: false,
    reasoning: false,
    audioInput: false,
    ...overrides,
  };
}

function inferDeepSeekCapabilities(id: string): ModelCapabilities {
  const lower = id.toLowerCase();
  return defaultCapabilities({
    reasoning: /reason|pro|r1|thinking/.test(lower),
    toolCalling: !/reasoner/.test(lower),
  });
}

/**
 * 9Router exposes many upstream providers through one OpenAI-compatible model list.
 *
 * Nang luc chi doan duoc tu ten model vi danh sach khong mo ta gi them — cung cach
 * lam nhu listGemini. Doan rong hon la co y: doan thieu thi gateway loai model ra
 * va nguoi dung khong bao gio thu duoc, con doan thua thi cung lam nha cung cap
 * tra ve mot thong bao loi cu the doc duoc.
 */
function infer9RouterCapabilities(id: string): ModelCapabilities {
  const lower = id.toLowerCase();
  const multimodal = /gemini|gpt-4|gpt-5|claude|sonnet|opus|haiku|pixtral|llava|-vl/.test(lower);
  return defaultCapabilities({
    reasoning: /reason|thinking|opus|o[134](?:-|$)|gpt-5|gemini.*pro/.test(lower),
    toolCalling: !/reasoner/.test(lower),
    vision: multimodal,
    documentInput: multimodal,
    audioInput: /gemini|audio/.test(lower),
  });
}

async function listGemini(connection: ProviderConnection): Promise<DiscoveredModel[]> {
  const body = await fetchJson(`${baseUrl(connection.baseUrl)}/v1beta/models?pageSize=1000`, {
    headers: { 'x-goog-api-key': connection.apiKey },
  });
  return asArray(body.models)
    .map(asRecord)
    .filter((model) => {
      const methods = asArray(model.supportedGenerationMethods ?? model.supportedActions).map(
        String
      );
      return methods.length === 0 || methods.includes('generateContent');
    })
    .map((model) => {
      const rawName = String(model.name ?? model.baseModelId ?? '');
      const id = rawName.replace(/^models\//, '');
      return {
        id,
        displayName: String(model.displayName ?? id),
        capabilities: defaultCapabilities({
          vision: /gemini/i.test(id),
          documentInput: /gemini/i.test(id),
          audioInput: /gemini/i.test(id),
          reasoning: Boolean(model.thinking) || /pro|thinking/i.test(id),
        }),
        inputTokenLimit: asNumber(model.inputTokenLimit),
        outputTokenLimit: asNumber(model.outputTokenLimit),
      };
    })
    .filter((model) => Boolean(model.id));
}

async function listAnthropic(connection: ProviderConnection): Promise<DiscoveredModel[]> {
  const body = await fetchJson(`${baseUrl(connection.baseUrl)}/v1/models?limit=1000`, {
    headers: {
      'x-api-key': connection.apiKey,
      'anthropic-version': '2023-06-01',
    },
  });
  return asArray(body.data)
    .map(asRecord)
    .map((model) => {
      const id = String(model.id ?? '');
      const capabilities = asRecord(model.capabilities);
      const supported = (name: string, fallback: boolean) => {
        const item = asRecord(capabilities[name]);
        return typeof item.supported === 'boolean' ? item.supported : fallback;
      };
      return {
        id,
        displayName: String(model.display_name ?? id),
        capabilities: defaultCapabilities({
          structuredOutput: supported('structured_outputs', true),
          vision: supported('image_input', true),
          documentInput: supported('pdf_input', true),
          reasoning: supported('thinking', /opus|sonnet/i.test(id)),
        }),
        inputTokenLimit: asNumber(model.max_input_tokens),
        outputTokenLimit: asNumber(model.max_tokens),
      };
    })
    .filter((model) => Boolean(model.id));
}

async function listDeepSeek(connection: ProviderConnection): Promise<DiscoveredModel[]> {
  const body = await fetchJson(`${baseUrl(connection.baseUrl)}/models`, {
    headers: { authorization: `Bearer ${connection.apiKey}` },
  });
  return asArray(body.data)
    .map(asRecord)
    .map((model) => {
      const id = String(model.id ?? '');
      return {
        id,
        displayName: id,
        capabilities: inferDeepSeekCapabilities(id),
      };
    })
    .filter((model) => Boolean(model.id));
}

async function list9Router(connection: ProviderConnection): Promise<DiscoveredModel[]> {
  const body = await fetchJson(`${baseUrl(connection.baseUrl)}/models`, {
    headers: { authorization: `Bearer ${connection.apiKey}` },
  });
  return asArray(body.data)
    .map(asRecord)
    .map((model) => {
      const id = String(model.id ?? '');
      return {
        id,
        displayName: String(model.name ?? model.display_name ?? id),
        capabilities: infer9RouterCapabilities(id),
        inputTokenLimit: asNumber(model.context_window ?? model.contextWindow),
      };
    })
    .filter((model) => Boolean(model.id));
}

export async function listProviderModels(
  connection: ProviderConnection
): Promise<DiscoveredModel[]> {
  if (connection.provider === 'gemini') return listGemini(connection);
  if (connection.provider === 'anthropic') return listAnthropic(connection);
  if (connection.provider === '9router') return list9Router(connection);
  return listDeepSeek(connection);
}

async function generateGemini(
  connection: ProviderConnection,
  request: GenerateRequest
): Promise<GenerateResult> {
  const body = await fetchJson(
    `${baseUrl(connection.baseUrl)}/v1beta/models/${encodeURIComponent(request.model)}:generateContent`,
    {
      method: 'POST',
      headers: { ...JSON_HEADERS, 'x-goog-api-key': connection.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: request.system }] },
        contents: [
          {
            role: 'user',
            parts: [
              ...(request.attachments ?? []).map((file) => ({
                inline_data: { mime_type: file.mime, data: file.dataBase64 },
              })),
              { text: request.prompt },
            ],
          },
        ],
        // Mo hinh tu quyet dinh co can tim Google hay khong (grounding).
        ...(request.webSearch ? { tools: [{ google_search: {} }] } : {}),
        generationConfig: {
          maxOutputTokens: request.maxOutputTokens ?? 2048,
          temperature: request.temperature ?? 0.2,
          // Gemini tu choi ep JSON khi co cong cu — luc do dua vao loi nhac + parseAiJson.
          ...(request.json && !request.webSearch ? { responseMimeType: 'application/json' } : {}),
        },
      }),
    },
    request.timeoutMs
  );
  const candidate = asRecord(asArray(body.candidates)[0]);
  const content = asRecord(candidate.content);
  const text = asArray(content.parts)
    .map((part) => String(asRecord(part).text ?? ''))
    .join('')
    .trim();
  const usage = asRecord(body.usageMetadata);
  const grounding = asRecord(candidate.groundingMetadata);
  const webSources = asArray(grounding.groundingChunks)
    .map((chunk) => asRecord(asRecord(chunk).web))
    .filter((web) => typeof web.uri === 'string')
    .map((web) => ({ url: String(web.uri), title: String(web.title ?? web.uri) }));
  return {
    text,
    inputTokens: asNumber(usage.promptTokenCount) ?? 0,
    outputTokens: asNumber(usage.candidatesTokenCount) ?? 0,
    webSearched: asArray(grounding.webSearchQueries).length > 0 || webSources.length > 0,
    webSources: dedupeSources(webSources),
  };
}

function dedupeSources(sources: { url: string; title: string }[]) {
  const seen = new Set<string>();
  return sources.filter((source) => !seen.has(source.url) && seen.add(source.url)).slice(0, 10);
}

/** Server tool tim web cua Claude — ban co ban, chay duoc tren ca model cu lan moi. */
const ANTHROPIC_WEB_SEARCH_TOOL = { type: 'web_search_20250305', name: 'web_search', max_uses: 3 };

async function generateAnthropic(
  connection: ProviderConnection,
  request: GenerateRequest
): Promise<GenerateResult> {
  const userTurn = {
    role: 'user',
    content: [
      ...(request.attachments ?? []).map((file) => ({
        // Anthropic tach anh va tai lieu thanh hai loai khoi noi dung khac nhau.
        type: file.mime.startsWith('image/') ? 'image' : 'document',
        source: { type: 'base64', media_type: file.mime, data: file.dataBase64 },
      })),
      { type: 'text', text: request.prompt },
    ],
  };
  /*
   * Anthropic khong co tham so ep JSON nhu Gemini/DeepSeek. Moi cho mot luot
   * assistant bang dau '{' la cach duy nhat lam mo hinh bat dau ngay bang doi
   * tuong JSON thay vi mot cau dan nhap — phan mo dau nay khong nam trong
   * phan hoi nen phai tu ghep lai ben duoi. Khi cho tim web thi KHONG moi: mo
   * hinh phai duoc goi cong cu truoc khi viet JSON.
   */
  const prefill = request.json && !request.webSearch;
  const messages: unknown[] = [userTurn, ...(prefill ? [{ role: 'assistant', content: '{' }] : [])];

  let inputTokens = 0;
  let outputTokens = 0;
  let blocks: Record<string, unknown>[] = [];
  /*
   * Vong tim web dai co the dung o `pause_turn`: gui lai nguyen phan da sinh lam
   * luot assistant de may chu chay tiep. Gioi han so vong de khong treo mai.
   */
  for (let round = 0; round < 3; round += 1) {
    const body = await fetchJson(
      `${baseUrl(connection.baseUrl)}/v1/messages`,
      {
        method: 'POST',
        headers: {
          ...JSON_HEADERS,
          'x-api-key': connection.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: request.model,
          max_tokens: request.maxOutputTokens ?? 2048,
          temperature: request.temperature ?? 0.2,
          system: request.system,
          messages,
          ...(request.webSearch ? { tools: [ANTHROPIC_WEB_SEARCH_TOOL] } : {}),
        }),
      },
      request.timeoutMs
    );
    const usage = asRecord(body.usage);
    inputTokens += asNumber(usage.input_tokens) ?? 0;
    outputTokens += asNumber(usage.output_tokens) ?? 0;
    const content = asArray(body.content).map((part) => asRecord(part));
    blocks = [...blocks, ...content];
    if (body.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content });
  }

  // Chi lay chu SAU lan tim cuoi: phan truoc thuong la cau dan "De toi tim...".
  const lastSearch = blocks.map((part) => part.type).lastIndexOf('web_search_tool_result');
  const raw = blocks
    .slice(lastSearch + 1)
    .filter((part) => part.type === 'text')
    .map((part) => String(part.text ?? ''))
    .join('')
    .trim();
  const text = prefill && raw && !raw.startsWith('{') ? `{${raw}` : raw;
  const webSources = blocks
    .filter((part) => part.type === 'web_search_tool_result' && Array.isArray(part.content))
    .flatMap((part) => asArray(part.content).map((item) => asRecord(item)))
    .filter((item) => item.type === 'web_search_result' && typeof item.url === 'string')
    .map((item) => ({ url: String(item.url), title: String(item.title ?? item.url) }));
  return {
    text,
    inputTokens,
    outputTokens,
    webSearched: blocks.some((part) => part.type === 'server_tool_use'),
    webSources: dedupeSources(webSources),
  };
}

/** `audio/webm;codecs=opus` -> `webm`: truong `format` la ten dinh dang, khong phai mime. */
function audioFormat(mime: string): string {
  const subtype = mime.slice('audio/'.length).replace(/^x-/, '');
  return subtype === 'mpeg' ? 'mp3' : subtype;
}

/**
 * Dich mot tep dinh kem sang phan noi dung cua giao thuc OpenAI chat completions.
 *
 * Ba dang khac han nhau chu khong phai mot: anh di trong `image_url` duoi dang
 * data URL, audio di trong `input_audio` (base64 tran kem ten dinh dang rieng),
 * con lai la `file`. Cac router OpenAI-compatible (9Router, LiteLLM…) dich tiep
 * nhung phan nay sang API goc cua nha cung cap thuc su phia sau.
 */
function openAiAttachmentPart(file: NonNullable<GenerateRequest['attachments']>[number]) {
  const mime = (file.mime.split(';')[0] ?? '').trim().toLowerCase();
  if (mime.startsWith('image/')) {
    return { type: 'image_url', image_url: { url: `data:${mime};base64,${file.dataBase64}` } };
  }
  if (mime.startsWith('audio/')) {
    return {
      type: 'input_audio',
      input_audio: { data: file.dataBase64, format: audioFormat(mime) },
    };
  }
  return {
    type: 'file',
    file: { filename: file.fileName, file_data: `data:${mime};base64,${file.dataBase64}` },
  };
}

async function generateOpenAiCompatible(
  connection: ProviderConnection,
  request: GenerateRequest
): Promise<GenerateResult> {
  const body = await fetchJson(
    `${baseUrl(connection.baseUrl)}/chat/completions`,
    {
      method: 'POST',
      headers: { ...JSON_HEADERS, authorization: `Bearer ${connection.apiKey}` },
      body: JSON.stringify({
        model: request.model,
        messages: [
          { role: 'system', content: request.system },
          {
            role: 'user',
            // Chuoi tran khi khong co tep: mot so may chu OpenAI-compatible cu van
            // tu choi dang mang noi dung cho cau hoi chi co chu.
            content: request.attachments?.length
              ? [
                  ...request.attachments.map(openAiAttachmentPart),
                  { type: 'text', text: request.prompt },
                ]
              : request.prompt,
          },
        ],
        max_tokens: request.maxOutputTokens ?? 2048,
        temperature: request.temperature ?? 0.2,
        stream: false,
        ...(request.json ? { response_format: { type: 'json_object' } } : {}),
      }),
    },
    request.timeoutMs
  );
  const choice = asRecord(asArray(body.choices)[0]);
  const message = asRecord(choice.message);
  const usage = asRecord(body.usage);
  return {
    text: String(message.content ?? '').trim(),
    inputTokens: asNumber(usage.prompt_tokens) ?? 0,
    outputTokens: asNumber(usage.completion_tokens) ?? 0,
  };
}

export async function generateWithProvider(
  connection: ProviderConnection,
  request: GenerateRequest
): Promise<GenerateResult> {
  // DeepSeek khong co API da phuong thuc nao de gui tep vao, khac voi 9Router —
  // 9Router chi la router OpenAI-compatible nen tep di duoc qua `openAiAttachmentPart`.
  if (request.attachments?.length && connection.provider === 'deepseek') {
    throw new AiProviderError(
      'DeepSeek chưa hỗ trợ đọc tệp đính kèm trong ứng dụng',
      'attachment_unsupported'
    );
  }
  const result =
    connection.provider === 'gemini'
      ? await generateGemini(connection, request)
      : connection.provider === 'anthropic'
        ? await generateAnthropic(connection, request)
        : await generateOpenAiCompatible(connection, request);
  if (!result.text) {
    throw new AiProviderError('Mô hình không trả về nội dung', 'empty_response', undefined, true);
  }
  return result;
}

export function defaultProviderUrl(provider: AiProviderName): string {
  if (provider === 'gemini') return 'https://generativelanguage.googleapis.com';
  if (provider === 'anthropic') return 'https://api.anthropic.com';
  if (provider === '9router') return 'http://127.0.0.1:20128/v1';
  return 'https://api.deepseek.com';
}
