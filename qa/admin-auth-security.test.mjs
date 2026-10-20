import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFileSync(path.join(root, name), 'utf8');
const config = read('config.js');
const access = read('scripts/admin-access-v2.js');
const central = read('scripts/admin-central.js');
const html = read('admin.html');
const migration = read('supabase/migrations/024_admin_profile_write_lockdown.sql');
const sqlTest = read('supabase/tests/admin_auth_hardening.test.sql');

test('Preview and local hosts do not initialize the production Supabase client', () => {
  assert.match(config, /VALTEC_PRODUCTION_HOSTS/);
  assert.match(config, /VALTEC_PRODUCTION_HOSTS\.has\(window\.location\.hostname\.toLowerCase\(\)\)/);
  assert.match(config, /PREVIEW_BLOCKED:\s*true/);
  assert.match(config, /SUPABASE_URL:\s*""/);
  assert.match(access, /Este ambiente de validação está isolado do Supabase de produção/);
});

test('login uses Supabase password auth and does not offer demo access', () => {
  assert.match(access, /signInWithPassword/);
  assert.match(access, /resetPasswordForEmail/);
  assert.doesNotMatch(html, /id="demo-button"/);
  assert.match(access, /type="password"/);
  assert.match(html, /Entrar na Central/);
});

test('admin session requires a current active profile with one of the four known roles', () => {
  assert.match(central, /\.eq\('active', true\)/);
  assert.match(central, /ADMIN_ROLES\.has\(data\.role\)/);
  assert.match(central, /if \(error \|\| !data \|\| !ADMIN_ROLES\.has\(data\.role\)\) return null/);
});

test('admin shell is only revealed after re-validating the profile', () => {
  const openAdmin = central.slice(central.indexOf('async function openAdmin()'), central.indexOf('let adminBound'));
  assert.ok(openAdmin.indexOf('await getOwnAdminProfile()') < openAdmin.indexOf("classList.remove('hidden')"));
  assert.match(central, /if \(!profile\)[\s\S]*?auth\.signOut\(\)/);
});

test('logout clears private interface before signing out and replaces history', () => {
  const logout = central.slice(central.indexOf("$('#logout-button')"), central.indexOf("$$('[data-admin-tab]')"));
  assert.ok(logout.indexOf('lockAdminUi(') < logout.indexOf('auth.signOut()'));
  assert.match(logout, /location\.replace\(location\.pathname\)/);
  assert.match(central, /event === 'SIGNED_OUT'[\s\S]*?lockAdminUi/);
  assert.match(central, /event\.persisted[\s\S]*?getSession\(\)/);
});

test('private UI state and rendered data are cleared on auth loss', () => {
  const lock = central.slice(central.indexOf('function lockAdminUi('), central.indexOf('async function openAdmin()'));
  for (const key of ['clients', 'orders', 'quotes', 'receipts', 'expenses', 'leads', 'team', 'audit']) assert.match(lock, new RegExp(\`['"]\${key}['"]\`));
  assert.match(lock, /replaceChildren\(\)/);
  assert.match(lock, /classList\.add\('hidden'\)/);
});

test('browser UI no longer sends direct role changes to admin_profiles', () => {
  assert.doesNotMatch(central, /from\(['"]admin_profiles['"]\)\.update\(/);
  assert.doesNotMatch(central, /data-role-user/);
  assert.match(html, /Alterações de cargo e ativação ficam bloqueadas/);
});

test('migration 024 removes direct write privileges and the broad update policy', () => {
  assert.match(migration, /revoke all privileges on table public\.admin_profiles from public, anon, authenticated/i);
  assert.match(migration, /grant select on table public\.admin_profiles to authenticated/i);
  assert.match(migration, /drop policy if exists "admins can update team profiles"/i);
  assert.doesNotMatch(migration, /insert into public\.(clients|leads|service_orders)/i);
});

test('SQL tests distinguish SQL grants from effective RLS results', () => {
  assert.match(sqlTest, /has_table_privilege\('authenticated','public\.admin_profiles','UPDATE'\)/i);
  assert.match(sqlTest, /set local role anon/i);
  assert.match(sqlTest, /set local role authenticated/i);
  assert.match(sqlTest, /execute format\('select count\(\*\) from public\.%I'/i);
  assert.match(sqlTest, /storage\.buckets/i);
  assert.doesNotMatch(sqlTest, /has_table_privilege\('anon',[\s\S]{0,120}raise exception/i);
});

test('browser configuration contains no service-role or secret key', () => {
  assert.doesNotMatch(config, /SUPABASE_SERVICE_ROLE_KEY\s*[:=]|sb_secret_[A-Za-z0-9_-]{10,}/i);
});
