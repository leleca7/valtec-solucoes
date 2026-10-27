import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCommercialFollowup as classify } from '../server/whatsapp-lead-priority.mjs';
const at=Date.parse('2026-10-26T23:00:00Z');
const message=(direction,body,date='2026-10-23T12:00:00Z')=>({direction,body,created_at:date});
test('ordem concluída vai para pós-venda, não pendente',()=>{
 assert.equal(classify({order:{status:'concluido',completed_at:'2026-10-25T10:00:00Z'},at}).category,'pos_venda');
});
test('visita futura sai da fila de cobrança',()=>{
 assert.equal(classify({order:{status:'agendado',scheduled_for:'2026-10-27T12:00:00Z'},at}).category,'visita_programada');
});
test('área não atendida quando técnico informa deslocamento',()=>{
 const m=[message('outbound','Infelizmente não estamos atendendo essa região por conta do deslocamento')];
 assert.equal(classify({messages:m,at}).category,'fora_area_ou_encerrado');
});
test('orçamento em avaliação admite retorno gentil',()=>{
 const m=[message('inbound','Vou aguardar outros orçamentos')];
 assert.equal(classify({messages:m,at}).category,'orcamento_em_avaliacao');
});
test('cliente promete retorno',()=>{
 assert.equal(classify({messages:[message('inbound','Entrarei em contato em breve')],at}).category,'cliente_prometeu_retorno');
});
test('mídia solicitada sem resposta',()=>{
 const m=[message('outbound','Pode me enviar um vídeo do defeito?')];
 assert.equal(classify({messages:m,thread:{last_outbound_at:'2026-10-23T12:00:00Z'},at}).category,'aguardando_midia');
});
test('recebida sem resposta fica prioritária',()=>{
 const m=[message('inbound','Preciso de atendimento')];
 assert.equal(classify({messages:m,thread:{last_inbound_at:'2026-10-26T20:00:00Z'},at}).category,'responder_cliente');
});
test('não presume conclusão por agradecimento',()=>{
 assert.notEqual(classify({messages:[message('inbound','Muito obrigada, Deus te abençoe')],at}).category,'pos_venda');
});
test('silêncio após resposta vira retorno depois de 24h',()=>{
 const m=[message('inbound','Preciso de ajuda','2026-10-22T12:00:00Z'),message('outbound','Boa tarde, em que posso ajudar?','2026-10-23T12:00:00Z')];
 assert.equal(classify({messages:m,thread:{last_outbound_at:'2026-10-23T12:00:00Z'},at}).category,'retorno_comercial');
});
