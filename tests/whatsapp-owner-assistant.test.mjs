import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assistantPhone, customerWhatsAppLink, safeCustomerDraft,
  composeServiceRecord, parseOwnerCommand, isMetaSandboxSender
} from '../server/whatsapp-owner-assistant-core.mjs';

test('normaliza o DDD e telefone brasileiro legado', () => {
  assert.equal(assistantPhone('(71) 98195-4452'), '5571981954452');
  assert.equal(assistantPhone('71 8195-4452'), '5571981954452');
});
test('link abre cliente com texto codificado e nunca envia automaticamente', () => {
  const link = customerWhatsAppLink('71 98765-4321', 'Olá, João! Pode enviar foto?');
  assert.ok(link.startsWith('https://wa.me/5571987654321?text='));
  assert.ok(decodeURIComponent(link.split('?text=')[1]).includes('João'));
  assert.equal(customerWhatsAppLink('123', 'Oi'), '');
});
test('bloqueia o sandbox da Meta e não transforma número dos EUA em brasileiro', () => {
  assert.equal(assistantPhone('15551784163'), '15551784163');
  assert.equal(assistantPhone('+1 (555) 178-4163'), '15551784163');
  assert.ok(isMetaSandboxSender('15551784163'));
  assert.ok(isMetaSandboxSender('5515551784163'));
  assert.equal(customerWhatsAppLink('15551784163', 'Olá!'), '');
  assert.equal(customerWhatsAppLink('5515551784163', 'Olá!'), '');
  assert.equal(customerWhatsAppLink('+12125550123', 'Oi!'), '');
  assert.equal(isMetaSandboxSender('5571981954452'), false);
});

test('resposta não inventa valor, diagnóstico nem data', () => {
  const draft = safeCustomerDraft({ name: 'João', equipment: 'Fogão Brastemp', issue: 'não acende', neighborhood: 'Itapuã' });
  assert.match(draft, /João/);
  assert.match(draft, /Fogão Brastemp/);
  assert.match(draft, /não acende/);
  assert.doesNotMatch(draft, /R\$|agendad[oa]|garantid[oa]|diagnóstico confirmado/i);
});
test('não repete perguntas já respondidas pelo cliente', () => {
  const draft = safeCustomerDraft({ name: 'Ana', equipment: 'Geladeira', issue: 'não gela', neighborhood: 'Brotas' });
  assert.doesNotMatch(draft, /qual é o equipamento|em qual bairro|pode descrever/i);
});
test('interpreta comandos básicos e evita editar instrução ambígua', () => {
  assert.equal(parseOwnerCommand('PENDENTES').type, 'pending');
  assert.equal(parseOwnerCommand('ATENDER 71981954452').type, 'attend');
  assert.equal(parseOwnerCommand('AJUSTAR: peça uma foto').type, 'photo');
  assert.deepEqual(parseOwnerCommand('AJUSTAR: equipamento: Fogão Brastemp'), { type: 'field', field: 'equipment', value: 'Fogão Brastemp' });
  assert.equal(parseOwnerCommand('AJUSTAR: altere isso aí').type, 'unclear');
  assert.equal(parseOwnerCommand('TEXTO: Olá cliente!').type, 'replace');
});
test('ficha identifica dados desconhecidos e não se apresenta como orçamento', () => {
  const doc = composeServiceRecord({ name: 'Ana', phone: '71987654321', equipment: 'Geladeira' });
  assert.match(doc, /não realizado/);
  assert.match(doc, /não informado/);
  assert.match(doc, /não agendada/);
  assert.match(doc, /A confirmar/);
});
