import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AiProviderError, type AiProviderName } from './types.ts';

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-ai-gateway-'));
process.env.WORKFLOW_DATA_DIR = fixtureRoot;
process.env.WORKFLOW_DB_PATH = ':memory:';

const { db } = await import('../../db/connection.ts');
const { runAi } = await import('./gateway.ts');
const { updateProviderConfig } = await import('./configService.ts');

/** Dua mot nha cung cap ve trang thai 'ready' kem dung mot model da biet nang luc. */
function makeReady(provider: AiProviderName, model: string, audioInput: boolean): void {
  updateProviderConfig(db, provider, {
    apiKey: 'test-key',
    enabled: true,
    defaultModel: model,
    fastModel: model,
  });
  db.prepare(`UPDATE ai_provider_configs SET status = 'ready' WHERE provider = ?`).run(provider);
  db.prepare(
    `INSERT INTO ai_models (provider, model_id, display_name, capabilities_json, is_available)
     VALUES (?, ?, ?, ?, 1)
     ON CONFLICT(provider, model_id) DO UPDATE SET capabilities_json = excluded.capabilities_json`
  ).run(provider, model, model, JSON.stringify({ text: true, audioInput }));
}

function withFetch(handler: typeof globalThis.fetch, run: () => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

const audioRequest = {
  task: 'voice_note_convert',
  mode: 'fast' as const,
  system: 'he thong',
  prompt: 'chuyen ghi am',
  attachments: [{ mime: 'audio/webm', dataBase64: 'AAAA', fileName: 'ghi-am.webm' }],
};

test('loi that su cua nha cung cap khong bi ly do bo qua cua nha cung cap sau ghi de', async () => {
  makeReady('gemini', 'gemini-2.5-flash', true);
  makeReady('anthropic', 'claude-sonnet-4', false);

  await withFetch(
    async () =>
      new Response(JSON.stringify({ error: { message: 'Gemini qua tai' } }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      }),
    async () => {
      const error = await runAi(db, {
        ...audioRequest,
        provider: 'gemini',
        requiresCapability: 'audioInput',
      }).then(
        () => null,
        (caught: unknown) => caught
      );

      assert.ok(error instanceof AiProviderError);
      // Truoc day Anthropic bi bo qua vi thieu audioInput se ghi de loi that cua Gemini,
      // nguoi dung nhan 502 kem thong bao "khong doc duoc tep dinh kem" hoan toan sai.
      assert.equal(error.code, 'provider_503');
      assert.match(error.message, /Gemini qua tai/);
    }
  );
});

test('ghim provider + model thi chi goi dung nha cung cap do, dung dung model do', async () => {
  makeReady('gemini', 'gemini-2.5-flash', true);
  makeReady('anthropic', 'claude-sonnet-4', false);

  const calls: { url: string; model: unknown }[] = [];
  await withFetch(
    async (input, init = {}) => {
      calls.push({
        url: String(input),
        model: JSON.parse(String(init.body ?? '{}')).model as unknown,
      });
      return new Response(
        JSON.stringify({
          content: [{ type: 'text', text: 'noi dung ban ghi' }],
          usage: { input_tokens: 5, output_tokens: 2 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    },
    async () => {
      const result = await runAi(db, {
        ...audioRequest,
        provider: 'anthropic',
        model: 'claude-sonnet-4',
      });

      assert.equal(result.text, 'noi dung ban ghi');
      assert.equal(result.provider, 'anthropic');
      assert.equal(result.model, 'claude-sonnet-4');
      // Mot lan goi duy nhat: khong fallback, va khong bi bang nang luc chan lai
      // du model nay khong duoc danh dau audioInput.
      assert.equal(calls.length, 1);
      assert.match(calls[0].url, /\/v1\/messages$/);
      assert.equal(calls[0].model, 'claude-sonnet-4');
    }
  );
});

test('model duoc ghim khong bi gui nham sang nha cung cap khac khi fallback', async () => {
  makeReady('gemini', 'gemini-2.5-flash', true);
  makeReady('anthropic', 'claude-sonnet-4', false);

  const models: unknown[] = [];
  await withFetch(
    async (input, init = {}) => {
      models.push(JSON.parse(String(init.body ?? '{}')).model);
      return String(input).includes('generateContent')
        ? new Response(JSON.stringify({ error: { message: 'het han muc' } }), {
            status: 429,
            headers: { 'content-type': 'application/json' },
          })
        : new Response(
            JSON.stringify({
              content: [{ type: 'text', text: 'du phong' }],
              usage: { input_tokens: 1, output_tokens: 1 },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
    },
    async () => {
      // Chi uu tien Gemini (khong ghim): khi Gemini loi, Anthropic phai chay bang
      // model cua chinh no chu khong phai 'gemini-2.5-flash'.
      const result = await runAi(db, { ...audioRequest, provider: 'gemini' });

      assert.equal(result.provider, 'anthropic');
      assert.equal(result.model, 'claude-sonnet-4');
      assert.deepEqual(models, [undefined, 'claude-sonnet-4']);
    }
  );
});
