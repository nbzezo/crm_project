import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWithProvider, listProviderModels } from './providers.ts';
import type { ProviderConnection } from './types.ts';

const connection: ProviderConnection = {
  provider: '9router',
  baseUrl: 'http://127.0.0.1:20128/v1',
  apiKey: 'test-key',
};

test('9Router dong bo model va sinh noi dung qua giao thuc OpenAI-compatible', async () => {
  const originalFetch = globalThis.fetch;
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, init });
    const body = url.endsWith('/models')
      ? { data: [{ id: 'cc/claude-sonnet', name: 'Claude Sonnet', context_window: 200000 }] }
      : {
          choices: [{ message: { content: 'Xin chao' } }],
          usage: { prompt_tokens: 12, completion_tokens: 3 },
        };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const models = await listProviderModels(connection);
    assert.equal(models[0]?.id, 'cc/claude-sonnet');
    assert.equal(models[0]?.inputTokenLimit, 200000);

    const result = await generateWithProvider(connection, {
      model: 'cc/claude-sonnet',
      system: 'Tro ly CRM',
      prompt: 'Viec gi can lam?',
      json: true,
    });
    assert.deepEqual(result, { text: 'Xin chao', inputTokens: 12, outputTokens: 3 });
    assert.equal(calls[0]?.url, 'http://127.0.0.1:20128/v1/models');
    assert.equal(calls[1]?.url, 'http://127.0.0.1:20128/v1/chat/completions');
    assert.equal((calls[1]?.init.headers as Record<string, string>).authorization, 'Bearer test-key');
    assert.equal(JSON.parse(String(calls[1]?.init.body)).response_format.type, 'json_object');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
