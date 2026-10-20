import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { escapeHtml } from '../scripts/html-safety.mjs';

const [mainSource, atendimentoSource] = await Promise.all([
  readFile(new URL('../scripts/main.js', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/atendimento.js', import.meta.url), 'utf8')
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
