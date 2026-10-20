import test from 'node:test';
import assert from 'node:assert/strict';
import { selectRows } from '../server/whatsapp-lib.mjs';

const PRODUCTION_URL = 'https://msgwcwpvjgjtqhktuust.supabase.co';
const keys = ['VERCEL_ENV', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
const originalEnv = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;

function restore() {
  for (const key of keys) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  globalThis.fetch = originalFetch;
}

test('Preview refuses production Supabase before any network request', async () => {
  process.env.VERCEL_ENV = 'preview';
  process.env.SUPABASE_URL = PRODUCTION_URL;
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_only';
  let fetchCalled = false;
  globalThis.fetch = async () => { fetchCalled = true; throw new Error('unexpected network call'); };

  try {
    await assert.rejects(selectRows('clients'), /produção bloqueado fora do ambiente Production/i);
    assert.equal(fetchCalled, false, 'the API must fail before calling fetch');
  } finally {
    restore();
  }
});

test('local development also refuses the production Supabase URL', async () => {
  delete process.env.VERCEL_ENV;
  process.env.SUPABASE_URL = PRODUCTION_URL;
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_only';
  let fetchCalled = false;
  globalThis.fetch = async () => { fetchCalled = true; throw new Error('unexpected network call'); };

  try {
    await assert.rejects(selectRows('clients'), /produção bloqueado fora do ambiente Production/i);
    assert.equal(fetchCalled, false, 'the API must fail before calling fetch');
  } finally {
    restore();
  }
});

test('Production environment keeps the configured production database path', async () => {
  process.env.VERCEL_ENV = 'production';
  process.env.SUPABASE_URL = PRODUCTION_URL;
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_only';
  let requestedUrl = '';
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return { ok: true, status: 200, text: async () => '[]' };
  };

  try {
    assert.deepEqual(await selectRows('clients'), []);
    assert.equal(requestedUrl, `${PRODUCTION_URL}/rest/v1/clients?`);
  } finally {
    restore();
  }
});
