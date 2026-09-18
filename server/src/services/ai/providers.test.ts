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
    assert.equal(
      (calls[1]?.init.headers as Record<string, string>).authorization,
      'Bearer test-key'
    );
    assert.equal(JSON.parse(String(calls[1]?.init.body)).response_format.type, 'json_object');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('ban ghi am duoc gui qua 9Router bang phan noi dung input_audio', async () => {
  const originalFetch = globalThis.fetch;
  let sent: Record<string, unknown> = {};
  globalThis.fetch = async (_input, init = {}) => {
    sent = JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: 'Noi dung ban ghi' } }],
        usage: { prompt_tokens: 40, completion_tokens: 8 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  };

  try {
    const result = await generateWithProvider(connection, {
      model: 'ag/gemini-flash',
      system: 'Chuyen ghi am',
      prompt: 'Chuyen doan ghi am dinh kem thanh van ban.',
      attachments: [
        { mime: 'audio/webm;codecs=opus', dataBase64: 'QUJD', fileName: 'ghi-am.webm' },
      ],
    });

    assert.equal(result.text, 'Noi dung ban ghi');
    const messages = sent.messages as { role: string; content: unknown }[];
    // Tham so codecs bi cat va `format` la ten dinh dang chu khong phai mime.
    assert.deepEqual(messages[1].content, [
      { type: 'input_audio', input_audio: { data: 'QUJD', format: 'webm' } },
      { type: 'text', text: 'Chuyen doan ghi am dinh kem thanh van ban.' },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('cau hoi khong kem tep van gui noi dung dang chuoi tran', async () => {
  const originalFetch = globalThis.fetch;
  let sent: Record<string, unknown> = {};
  globalThis.fetch = async (_input, init = {}) => {
    sent = JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: 'Xong' } }],
        usage: { prompt_tokens: 3, completion_tokens: 1 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  };

  try {
    await generateWithProvider(connection, {
      model: 'cc/claude-sonnet',
      system: 'Tro ly CRM',
      prompt: 'Viec gi can lam?',
    });
    const messages = sent.messages as { role: string; content: unknown }[];
    assert.equal(messages[1].content, 'Viec gi can lam?');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('DeepSeek van tu choi tep dinh kem vi khong co API da phuong thuc', async () => {
  const error = await generateWithProvider(
    { provider: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', apiKey: 'k' },
    {
      model: 'deepseek-chat',
      system: 's',
      prompt: 'p',
      attachments: [{ mime: 'audio/webm', dataBase64: 'QUJD', fileName: 'a.webm' }],
    }
  ).then(
    () => null,
    (caught: unknown) => caught
  );
  assert.ok(error instanceof Error);
  assert.match(error.message, /DeepSeek/);
});
