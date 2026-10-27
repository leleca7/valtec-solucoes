import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverCustomerFactsFromHistory as recover } from '../server/whatsapp-owner-evidence.mjs';

const inbound = (body, created_at = '2026-10-24T16:51:00Z') =>
 ({ direction:'inbound',message_type:'text',body,created_at });

test('Rose: recupera exatamente o defeito dito pela cliente, sem diagnóstico',()=>{
  const customer = [
    inbound('Bom dia!! Tá certo mas é amanhã e não hoje','2026-10-26T11:31:00Z'),
    inbound('As bocas estão desreguladas e tem um acendedor que minha abençoanda colocou pra dentro','2026-10-24T16:51:00Z'),
    inbound('Pode sim','2026-10-24T16:48:00Z')
  ];
  const found=recover(customer);
  assert.match(found.issue,/As bocas estão desreguladas/);
  assert.match(found.issue,/acendedor/);
  assert.equal(found.neighborhood,'');
});
test('Fernandes: aproveita o bairro declarado diretamente',()=>{
  const found=recover([inbound('Moro em Santomé 🫣')]);
  assert.equal(found.neighborhood,'Santomé');
});
test('não atribui problema ou bairro por pergunta genérica ou mensagem do técnico',()=>{
  const found=recover([
    inbound('Olá! Posso ter mais informações sobre isso?'),
    {direction:'outbound',message_type:'text',body:'Qual o bairro? Seu fogão não acende?',created_at:'2026-10-24T16:52:00Z'},
    inbound('Obrigado, vou pensar')
  ]);
  assert.deepEqual(found,{issue:'',neighborhood:''});
});
test('relato de vazamento de gás é preservado como relato e não diagnóstico',()=>{
  const found=recover([inbound('Meu forno está escapando gás')]);
  assert.match(found.issue,/escapando gás/);
});
