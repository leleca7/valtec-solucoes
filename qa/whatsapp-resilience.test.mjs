import test from 'node:test';
import assert from 'node:assert/strict';
import { dbRequest, getOrCreateThread } from '../server/whatsapp-lib.mjs';

const originalFetch = globalThis.fetch;
const originalUrl = process.env.SUPABASE_URL;
const originalSecret = process.env.SUPABASE_SECRET_KEY;

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_fake_not_a_credential';

function mockResponse(status, data) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(data) };
}

test.after(() => {
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalUrl;
  if (originalSecret === undefined) delete process.env.SUPABASE_SECRET_KEY;
  else process.env.SUPABASE_SECRET_KEY = originalSecret;
});

test('race no webhook reaproveita conversa criada em paralelo sem duplicar', async () => {
  let reads = 0;
  const existing = {
    id: 'existing-thread', phone: '5571999999999', status: 'bot',
    workflow_step: 'idle', contact_type: 'unknown',
    auto_reply_mode: 'commercial_only', display_name: 'Contato Teste'
  };
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/whatsapp_threads')) {
      if (options.method === 'POST') {
        return mockResponse(409, {
          code: '23505', message: 'duplicate key value violates unique constraint "whatsapp_threads_phone_key"'
        });
      }
      reads += 1;
      return mockResponse(200, reads === 1 ? [] : [existing]);
    }
    if (url.pathname.endsWith('/leads') || url.pathname.endsWith('/clients')) {
      return mockResponse(200, []);
    }
    throw new Error('Unexpected request: ' + url.pathname);
  };

  const { thread, created } = await getOrCreateThread({ phone: '5571999999999', name: 'Contato Teste' });
  assert.equal(created, false);
  assert.equal(thread.id, 'existing-thread');
  assert.equal(reads, 2);
});

test('erro PGRST303 transitório permite recuperar consulta na tentativa seguinte', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return calls === 1
      ? mockResponse(401, { code: 'PGRST303', message: 'JWT issued at future' })
      : mockResponse(200, [{ id: 'ok' }]);
  };
  const rows = await dbRequest('whatsapp_threads?select=id&limit=1');
  assert.deepEqual(rows, [{ id: 'ok' }]);
  assert.equal(calls, 2);
});

test('outros erros 401 não acionam repetição de requisições', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return mockResponse(401, { code: 'PGRST301', message: 'invalid token' });
  };
  await assert.rejects(dbRequest('whatsapp_threads?select=id&limit=1'), /invalid token/);
  assert.equal(calls, 1);
});
