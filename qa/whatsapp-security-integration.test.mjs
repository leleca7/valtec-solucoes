import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyMetaSignature, saveInbound, sendWhatsAppText } from '../server/whatsapp-lib.mjs';
import webhook from '../api/whatsapp-webhook.mjs';

const originalSecret = process.env.WHATSAPP_APP_SECRET;
const originalVerifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
const originalSupabaseUrl = process.env.SUPABASE_URL;
const originalSupabaseSecret = process.env.SUPABASE_SECRET_KEY;
const secret = 'fixture-only-whatsapp-app-secret';
const raw = Buffer.from(JSON.stringify({ entry: [] }), 'utf8');
const signature = (body, key = secret) =>
  `sha256=${createHmac('sha256', key).update(body).digest('hex')}`;

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return typeof body === 'string' ? body : JSON.stringify(body); }
  };
}

function resStub() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(name, value) { this.headers[name] = value; },
    end(value = '') { this.body = String(value); }
  };
}

test('HMAC aceita assinatura válida e rejeita corpo alterado', () => {
  process.env.WHATSAPP_APP_SECRET = secret;
  assert.equal(verifyMetaSignature(raw, signature(raw)), true);
  assert.equal(verifyMetaSignature(Buffer.from(raw.toString() + ' '), signature(raw)), false);
});

test('HMAC rejeita assinatura errada, ausente e malformada', () => {
  process.env.WHATSAPP_APP_SECRET = secret;
  assert.equal(verifyMetaSignature(raw, signature(raw, 'wrong-secret')), false);
  assert.equal(verifyMetaSignature(raw, ''), false);
  assert.equal(verifyMetaSignature(raw, 'sha256=xyz-not-hex'), false);
  assert.equal(verifyMetaSignature(raw, 'sha1=' + 'a'.repeat(64)), false);
});

test('HMAC exige segredo configurado', () => {
  delete process.env.WHATSAPP_APP_SECRET;
  assert.throws(() => verifyMetaSignature(raw, signature(raw)), /WHATSAPP_APP_SECRET/);
});

test('webhook POST bloqueia assinatura inválida antes de processar payload', async () => {
  process.env.WHATSAPP_APP_SECRET = secret;
  const req = { method: 'POST', headers: { 'x-hub-signature-256': signature(raw, 'wrong-secret') }, body: raw };
  const res = resStub();
  await webhook(req, res);
  assert.equal(res.statusCode, 401);
  assert.match(res.body, /Assinatura do webhook inválida/);
});

test('webhook POST sem segredo falha fechado e não processa payload', async () => {
  delete process.env.WHATSAPP_APP_SECRET;
  const req = { method: 'POST', headers: { 'x-hub-signature-256': signature(raw) }, body: raw };
  const res = resStub();
  await webhook(req, res);
  assert.equal(res.statusCode, 500);
  assert.match(res.body, /Falha ao processar webhook/);
});

test('GET challenge valida token independentemente da assinatura HMAC do POST', async () => {
  process.env.WHATSAPP_VERIFY_TOKEN = 'fixture-verify-token';
  const good = resStub();
  await webhook({ method: 'GET', query: {
    'hub.mode': 'subscribe', 'hub.verify_token': 'fixture-verify-token', 'hub.challenge': 'fixture-challenge'
  }, headers: {} }, good);
  assert.equal(good.statusCode, 200);
  assert.equal(good.body, 'fixture-challenge');

  const bad = resStub();
  await webhook({ method: 'GET', query: {
    'hub.mode': 'subscribe', 'hub.verify_token': 'wrong-token', 'hub.challenge': 'fixture-challenge'
  }, headers: {} }, bad);
  assert.equal(bad.statusCode, 403);
  delete process.env.WHATSAPP_VERIFY_TOKEN;
});

test('saveInbound reconhece mensagem já persistida sem inserir novamente', async () => {
  const originalFetch = globalThis.fetch;
  process.env.SUPABASE_URL = 'https://supabase.invalid';
  process.env.SUPABASE_SECRET_KEY = 'fixture-secret';
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return response(200, [{ id: 'message-fixture', thread_id: 'thread-fixture' }]);
  };
  try {
    const result = await saveInbound({
      thread: { id: 'thread-fixture' },
      message: { id: 'provider-message-fixture', type: 'text', text: { body: 'Mensagem fictícia' } },
      rawPayload: {}
    });
    assert.equal(result.duplicate, true);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('saveInbound trata corrida de identificador único como duplicata, não erro 500', async () => {
  const originalFetch = globalThis.fetch;
  process.env.SUPABASE_URL = 'https://supabase.invalid';
  process.env.SUPABASE_SECRET_KEY = 'fixture-secret';
  let selects = 0;
  let inserts = 0;
  globalThis.fetch = async (url, options = {}) => {
    if (options.method === 'POST') {
      inserts++;
      return response(409, { code: '23505', message: 'duplicate key value violates unique constraint' });
    }
    selects++;
    if (selects === 1) return response(200, []);
    return response(200, [{ id: 'message-winner', thread_id: 'thread-fixture' }]);
  };
  try {
    const result = await saveInbound({
      thread: { id: 'thread-fixture' },
      message: { id: 'provider-message-race', type: 'text', text: { body: 'Corrida fictícia' } },
      rawPayload: {}
    });
    assert.equal(result.duplicate, true);
    assert.equal(result.row.id, 'message-winner');
    assert.equal(inserts, 1);
    assert.equal(selects, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test('falha de leitura do banco não é tratada como autorização comercial', async () => {
  const originalFetch = globalThis.fetch;
  process.env.SUPABASE_URL = 'https://supabase.invalid';
  process.env.SUPABASE_SECRET_KEY = 'fixture-secret';
  globalThis.fetch = async () => response(503, { message: 'fixture database unavailable' });
  try {
    await assert.rejects(saveInbound({
      thread: { id: 'thread-fixture' },
      message: { id: 'provider-message-db-failure', type: 'text', text: { body: 'Fogão com defeito' } },
      rawPayload: {}
    }), /fixture database unavailable/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('falha da Meta no envio é propagada sem chamada externa real', async () => {
  const originalFetch = globalThis.fetch;
  const names = ['WHATSAPP_ACCESS_TOKEN','WHATSAPP_PHONE_NUMBER_ID','WHATSAPP_GRAPH_VERSION'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  process.env.WHATSAPP_ACCESS_TOKEN = 'fixture-token-only';
  process.env.WHATSAPP_PHONE_NUMBER_ID = 'fixture-phone-id';
  process.env.WHATSAPP_GRAPH_VERSION = 'v99.0';
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls++;
    assert.match(String(url), /^https:\/\/graph\.facebook\.com\//);
    return response(500, { error: { message: 'fixture Meta unavailable' } });
  };
  try {
    await assert.rejects(sendWhatsAppText('5571999990001', 'mensagem fictícia'), /fixture Meta unavailable/);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});

test.after(() => {
  if (originalSecret === undefined) delete process.env.WHATSAPP_APP_SECRET;
  else process.env.WHATSAPP_APP_SECRET = originalSecret;
  if (originalSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalSupabaseUrl;
  if (originalSupabaseSecret === undefined) delete process.env.SUPABASE_SECRET_KEY;
  else process.env.SUPABASE_SECRET_KEY = originalSupabaseSecret;
  if (originalVerifyToken === undefined) delete process.env.WHATSAPP_VERIFY_TOKEN;
  else process.env.WHATSAPP_VERIFY_TOKEN = originalVerifyToken;
});
