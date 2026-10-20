import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { escapeHtml } from '../scripts/html-safety.mjs';

const [mainSource, atendimentoSource, adminSource] = await Promise.all([
  readFile(new URL('../scripts/main.js', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/atendimento.js', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/admin-central.js', import.meta.url), 'utf8')
]);

test('escapeHtml neutraliza markup e preserva caracteres especiais como texto', () => {
  assert.equal(
    escapeHtml(`<img src=x onerror="alert(1)">& 'bairro'`),
    '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp; &#39;bairro&#39;'
  );
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml('Boca do Rio & Pituba'), 'Boca do Rio &amp; Pituba');
});

test('o verificador de bairro escapa a entrada antes de renderizar HTML', () => {
  assert.match(mainSource, /\$\{escapeHtml\(raw\)\}/);
  assert.doesNotMatch(mainSource, /\$\{raw\}\s*<\/strong>/);
});

test('o resumo de atendimento escapa os valores de cliente antes de renderizar HTML', () => {
  assert.match(atendimentoSource, /\$\{escapeHtml\(item\)\}/);
  assert.doesNotMatch(atendimentoSource, /<strong>\$\{item\}<\/strong>/);
});

import { safeHttpUrl } from '../scripts/html-safety.mjs';

test('safeHttpUrl bloqueia esquemas executáveis e aceita links HTTP(S)', () => {
  assert.equal(safeHttpUrl('javascript:alert(1)'), '');
  assert.equal(safeHttpUrl('data:text/html,<script>alert(1)</script>'), '');
  assert.equal(safeHttpUrl('//example.com/source'), '');
  assert.equal(safeHttpUrl('https://example.com/fonte'), 'https://example.com/fonte');
  assert.equal(safeHttpUrl('http://example.com/fonte'), 'http://example.com/fonte');
  assert.equal(safeHttpUrl('https://user:pass@example.com'), '');
});

test('links de origem do catálogo passam por validação de protocolo', () => {
  assert.match(adminSource, /safeHttpUrl\(p\.source_url\)/);
  assert.doesNotMatch(adminSource, /href="\$\{esc\(p\.source_url\)\}"/);
});
