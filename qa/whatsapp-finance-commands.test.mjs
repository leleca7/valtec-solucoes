import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, deterministicId } from '../server/whatsapp-staff-ops.mjs';

test('valores aceitam vírgula e ponto, mas não aceitam formato ambíguo', () => {
  assert.equal(parseAmount('150,00'), 150);
  assert.equal(parseAmount('22.5'), 22.5);
  assert.equal(parseAmount('0'), Number.NaN);
  assert.ok(Number.isNaN(parseAmount('1.234,56')));
  assert.ok(Number.isNaN(parseAmount('-15')));
  assert.ok(Number.isNaN(parseAmount('5000000')));
});

test('mesmo comando financeiro sempre usa o mesmo id para evitar duplicação', () => {
  const a = deterministicId('wamid.123', 'payment');
  assert.equal(a, deterministicId('wamid.123', 'payment'));
  assert.notEqual(a, deterministicId('wamid.124', 'payment'));
  assert.notEqual(a, deterministicId('wamid.123', 'expense'));
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
});
