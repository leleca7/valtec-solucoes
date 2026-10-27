import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOwnerOperationalCommand, noteEvaluation, tomorrowBahia, ownerStatusLabel } from '../server/whatsapp-owner-operations.mjs';
import { parseOwnerCommand } from '../server/whatsapp-owner-assistant-core.mjs';

test('interações naturais geram proposta, não atualização imediata',()=>{
  assert.deepEqual(parseOwnerCommand('já fiz esse serviço'),{type:'propose_state',status:'servico_realizado'});
  assert.deepEqual(parseOwnerCommand('cliente não fechou'),{type:'propose_state',status:'nao_fechou'});
  assert.deepEqual(parseOwnerCommand('Retornar amanhã'),{type:'propose_state',status:'retorno_agendado',day:'tomorrow'});
  assert.deepEqual(parseOwnerCommand('Não atendemos essa área'),{type:'propose_state',status:'fora_area'});
  assert.deepEqual(parseOwnerCommand('confirmar'),{type:'confirm_state'});
  assert.deepEqual(parseOwnerCommand('cancelar'),{type:'cancel_state'});
  assert.equal(ownerStatusLabel('servico_realizado').includes('TÉCNICO'),true);
});
test('frases ambíguas e texto do cliente não são tratados como conclusões',()=>{
  assert.equal(parseOwnerOperationalCommand('acho que fiz o serviço'),null);
  assert.equal(parseOwnerOperationalCommand('o cliente disse que já fez o serviço'),null);
  assert.equal(parseOwnerOperationalCommand('não sei se ele fechou'),null);
  assert.equal(parseOwnerOperationalCommand('pode marcar uma visita amanhã?'),null);
});
test('retornar amanhã usa dia da Bahia e não inventa hora',()=>{
  assert.equal(tomorrowBahia(new Date('2026-10-27T02:00:00.000Z')),'2026-10-27');
});
test('estado confirmado de serviço realizado não volta à fila de prospecção',()=>{
  const evaluated=noteEvaluation({status:'servico_realizado'},'2026-10-27');
  assert.equal(evaluated.category,'pos_venda');
  assert.equal(evaluated.priority,0);
});
test('retorno só entra na lista prioritária na data combinada ou depois',()=>{
  const scheduled={status:'retorno_agendado',follow_up_on:'2026-10-28'};
  assert.equal(noteEvaluation(scheduled,'2026-10-27').category,'retorno_futuro');
  assert.equal(noteEvaluation(scheduled,'2026-10-28').category,'retorno_programado');
  assert.equal(noteEvaluation(scheduled,'2026-10-29').priority,4);
});
test('não fechado e área não atendida não geram cobrança automática',()=>{
  for(const status of ['nao_fechou','fora_area']){
    assert.equal(noteEvaluation({status},'2026-10-27').priority,0);
  }
});
