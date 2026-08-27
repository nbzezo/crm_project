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

export async function listProviderModels(
  connection: ProviderConnection
): Promise<DiscoveredModel[]> {
  if (connection.provider === 'gemini') return listGemini(connection);
  if (connection.provider === 'anthropic') return listAnthropic(connection);
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
        generationConfig: {
          maxOutputTokens: request.maxOutputTokens ?? 2048,
          temperature: request.temperature ?? 0.2,
          ...(request.json ? { responseMimeType: 'application/json' } : {}),
        },
      }),
    }
  );
  const candidate = asRecord(asArray(body.candidates)[0]);
  const content = asRecord(candidate.content);
  const text = asArray(content.parts)
    .map((part) => String(asRecord(part).text ?? ''))
    .join('')
    .trim();
  const usage = asRecord(body.usageMetadata);
  return {
    text,
    inputTokens: asNumber(usage.promptTokenCount) ?? 0,
    outputTokens: asNumber(usage.candidatesTokenCount) ?? 0,
  };
}

async function generateAnthropic(
  connection: ProviderConnection,
  request: GenerateRequest
): Promise<GenerateResult> {
  const body = await fetchJson(`${baseUrl(connection.baseUrl)}/v1/messages`, {
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
      messages: [
        {
          role: 'user',
          content: [
            ...(request.attachments ?? []).map((file) => ({
              // Anthropic tach anh va tai lieu thanh hai loai khoi noi dung khac nhau.
              type: file.mime.startsWith('image/') ? 'image' : 'document',
              source: { type: 'base64', media_type: file.mime, data: file.dataBase64 },
            })),
            { type: 'text', text: request.prompt },
          ],
        },
        /*
         * Anthropic khong co tham so ep JSON nhu Gemini/DeepSeek. Moi cho mot luot
         * assistant bang dau '{' la cach duy nhat lam mo hinh bat dau ngay bang doi
         * tuong JSON thay vi mot cau dan nhap — phan mo dau nay khong nam trong
         * phan hoi nen phai tu ghep lai ben duoi.
         */
        ...(request.json ? [{ role: 'assistant', content: '{' }] : []),
      ],
    }),
  });
  const raw = asArray(body.content)
    .map((part) => asRecord(part))
    .filter((part) => part.type === 'text')
    .map((part) => String(part.text ?? ''))
    .join('')
    .trim();
  const text = request.json && raw && !raw.startsWith('{') ? `{${raw}` : raw;
  const usage = asRecord(body.usage);
  return {
    text,
    inputTokens: asNumber(usage.input_tokens) ?? 0,
    outputTokens: asNumber(usage.output_tokens) ?? 0,
  };
}

async function generateDeepSeek(
  connection: ProviderConnection,
  request: GenerateRequest
): Promise<GenerateResult> {
  const body = await fetchJson(`${baseUrl(connection.baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: { ...JSON_HEADERS, authorization: `Bearer ${connection.apiKey}` },
    body: JSON.stringify({
      model: request.model,
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.prompt },
      ],
      max_tokens: request.maxOutputTokens ?? 2048,
      temperature: request.temperature ?? 0.2,
      ...(request.json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
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
  if (request.attachments?.length && connection.provider === 'deepseek') {
    throw new AiProviderError('DeepSeek chưa hỗ trợ đọc tệp đính kèm', 'attachment_unsupported');
  }
  const result =
    connection.provider === 'gemini'
      ? await generateGemini(connection, request)
      : connection.provider === 'anthropic'
        ? await generateAnthropic(connection, request)
        : await generateDeepSeek(connection, request);
  if (!result.text) {
    throw new AiProviderError('Mô hình không trả về nội dung', 'empty_response', undefined, true);
  }
  return result;
}

export function defaultProviderUrl(provider: AiProviderName): string {
  if (provider === 'gemini') return 'https://generativelanguage.googleapis.com';
  if (provider === 'anthropic') return 'https://api.anthropic.com';
  return 'https://api.deepseek.com';
}
