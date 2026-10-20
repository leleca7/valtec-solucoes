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


test('eco humano durante preparação cancela o envio e mantém a conversa em modo humano', { timeout: 8000 }, async () => {
  const originalFetch = globalThis.fetch;
  const names = [
    'WHATSAPP_APP_SECRET','SUPABASE_URL','SUPABASE_SECRET_KEY',
    'WHATSAPP_ACCESS_TOKEN','WHATSAPP_PHONE_NUMBER_ID','WHATSAPP_GRAPH_VERSION',
    'VALTEC_WHATSAPP_COMMERCIAL_AUTO_REPLY_ENABLED','VALTEC_WHATSAPP_COMMERCIAL_AUTO_REPLY_PHONES',
    'VALTEC_WHATSAPP_COMMERCIAL_AUTO_REPLY_DISABLED','VALTEC_WHATSAPP_COMMERCIAL_NEUTRAL_GREETING_ENABLED',
    'VALTEC_WHATSAPP_AUTO_REPLY_ENABLED','VALTEC_WHATSAPP_AUTO_REPLY_TEST_PHONES','VALTEC_STAFF_WHATSAPP_PHONES'
  ];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const fixtureSecret = 'fixture-only-human-race-secret';
  Object.assign(process.env, {
    WHATSAPP_APP_SECRET: fixtureSecret,
    SUPABASE_URL: 'https://supabase.invalid',
    SUPABASE_SECRET_KEY: 'fixture-secret',
    WHATSAPP_ACCESS_TOKEN: 'fixture-meta-token',
    WHATSAPP_PHONE_NUMBER_ID: 'fixture-phone-id',
    WHATSAPP_GRAPH_VERSION: 'v99.0',
    VALTEC_WHATSAPP_COMMERCIAL_AUTO_REPLY_ENABLED: 'true',
    VALTEC_WHATSAPP_COMMERCIAL_AUTO_REPLY_PHONES: '5571999990001',
    VALTEC_WHATSAPP_COMMERCIAL_AUTO_REPLY_DISABLED: 'false',
    VALTEC_WHATSAPP_COMMERCIAL_NEUTRAL_GREETING_ENABLED: 'false',
    VALTEC_WHATSAPP_AUTO_REPLY_ENABLED: 'false',
    VALTEC_WHATSAPP_AUTO_REPLY_TEST_PHONES: '',
    VALTEC_STAFF_WHATSAPP_PHONES: ''
  });

  const clone = value => JSON.parse(JSON.stringify(value));
  let thread = {
    id: 'thread-fixture', phone: '5571999990001', display_name: 'Contato fictício',
    contact_type: 'lead', auto_reply_mode: 'commercial_only', status: 'bot',
    human_required: false, human_reason: null, lead_id: 'lead-fixture', client_id: null,
    last_inbound_at: '2026-10-19T00:00:00.000Z', last_outbound_at: '2026-10-18T00:00:00.000Z',
    last_message_at: '2026-10-19T00:00:00.000Z', unread_count: 0, workflow_step: 'context',
    classification_source: 'manual_commercial', classified_at: '2026-10-19T00:00:00.000Z',
    conversation_context: {}
  };
  let lead = {
    id: 'lead-fixture', customer_name: 'Cliente fictício', phone: '5571999990001',
    equipment: 'Fogão Consul', problems: [], description: '', neighborhood: '',
    status: 'triagem', source: 'whatsapp', next_action: 'Triagem'
  };
  const messages = [];
  let phoneReads = 0;
  let graphCalls = 0;
  let resolveDecision;
  let resolveEcho;
  const decisionPrepared = new Promise(resolve => { resolveDecision = resolve; });
  const echoUpdated = new Promise(resolve => { resolveEcho = resolve; });

  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(String(url));
    const method = options.method || 'GET';
    if (parsed.hostname === 'supabase.invalid') {
      const table = parsed.pathname.split('/').pop();
      const query = parsed.searchParams;
      const body = options.body ? JSON.parse(options.body) : {};
      if (method === 'GET') {
        if (table === 'whatsapp_threads') {
          const select = query.get('select') || '';
          if (select.startsWith('status,human_required,human_reason,last_inbound_at,conversation_context')) {
            await echoUpdated;
            return response(200, [clone(thread)]);
          }
          if (query.has('phone')) {
            phoneReads++;
            if (phoneReads === 2) await decisionPrepared;
            return response(200, [clone(thread)]);
          }
          return response(200, [clone(thread)]);
        }
        if (table === 'whatsapp_messages') {
          const id = (query.get('provider_message_id') || '').replace(/^eq\./, '');
          const found = messages.filter(item => item.provider_message_id === id);
          return response(200, found.map(clone));
        }
        if (table === 'leads') {
          if (query.has('phone_normalized')) return response(200, []);
          return response(200, [clone(lead)]);
        }
        return response(200, []);
      }
      if (method === 'POST') {
        if (table === 'whatsapp_messages') {
          const row = { id: 'db-' + (body.provider_message_id || String(messages.length + 1)), ...body };
          messages.push(row);
          return response(201, [clone(row)]);
        }
        return response(201, [{ id: 'fixture-row', ...body }]);
      }
      if (method === 'PATCH') {
        const id = (query.get('id') || '').replace(/^eq\./, '');
        if (table === 'whatsapp_threads') {
          thread = { ...thread, ...body };
          if (body.conversation_context && body.last_intent) resolveDecision();
          if (body.status === 'human' && body.conversation_context?.latest_staff_reply_at) resolveEcho();
          return response(200, [clone(thread)]);
        }
        if (table === 'leads') {
          lead = { ...lead, ...body };
          return response(200, [clone(lead)]);
        }
        if (table === 'whatsapp_messages') {
          const row = messages.find(item => item.id === id);
          if (row) Object.assign(row, body);
          return response(200, row ? [clone(row)] : []);
        }
        return response(200, []);
      }
      return response(200, []);
    }
    if (parsed.hostname === 'graph.facebook.com') {
      graphCalls++;
      return response(200, { messages: [{ id: 'fixture-should-not-send' }] });
    }
    throw new Error('Unexpected mocked network host: ' + parsed.hostname);
  };

  const post = async payload => {
    const raw = Buffer.from(JSON.stringify(payload), 'utf8');
    const req = {
      method: 'POST', body: raw,
      headers: { 'x-hub-signature-256': signature(raw, fixtureSecret) }
    };
    const res = resStub();
    await webhook(req, res);
    return res;
  };

  try {
    const echoTimestamp = String(Math.floor(Date.now() / 1000) + 30);
    const first = await Promise.race([
      post({ entry: [{ changes: [{
        field: 'smb_message_echoes',
        value: {
          contacts: [{ wa_id: '5571999990001', profile: { name: 'Contato fictício' } }],
          messages: [{ id: 'customer-inbound-1', from: '5571999990001', timestamp: echoTimestamp, type: 'text', text: { body: 'Meu fogão não acende' } }],
          message_echoes: [{ id: 'staff-echo-1', to: '5571999990001', timestamp: echoTimestamp, type: 'text', text: { body: 'Já respondi manualmente' } }]
        }
      }]}] }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('mock human-takeover race timed out')), 6000))
    ]);
    assert.equal(first.statusCode, 200);
    assert.equal(thread.status, 'human');
    assert.equal(thread.conversation_context.last_staff_reply_source, 'whatsapp_business_app');
    assert.equal(graphCalls, 0, 'o bot não deve enviar após o eco humano chegar durante a preparação');

    const second = await post({ entry: [{ changes: [{
      field: 'messages',
      value: {
        contacts: [{ wa_id: '5571999990001', profile: { name: 'Contato fictício' } }],
        messages: [{ id: 'customer-inbound-2', from: '5571999990001', type: 'text', text: { body: 'O bairro é Imbuí' } }]
      }
    }]}] });
    assert.equal(second.statusCode, 200);
    assert.equal(thread.status, 'human');
    assert.equal(graphCalls, 0, 'uma mensagem posterior do cliente não deve reativar o bot');
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
