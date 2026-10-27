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

test('Rose: agendamento na conversa tem precedência sobre última mensagem desconhecida',()=>{
  const m=[
    message('inbound','Pode ser terça, vou estar em casa o dia todo','2026-10-24T21:45:00Z'),
    message('outbound','Agendado para terça feira.as 8:30','2026-10-24T21:49:00Z'),
    message('inbound','Tá certo mas é amanhã e não hoje','2026-10-26T11:31:00Z'),
    message('outbound','Isso mesmo!','2026-10-26T11:39:00Z'),
    {...message('inbound','', '2026-10-26T11:51:00Z'),message_type:'unknown'}
  ];
  const evaluated=classify({thread:{last_inbound_at:'2026-10-26T11:51:00Z',last_outbound_at:'2026-10-26T11:39:00Z'},messages:m,at});
  assert.equal(evaluated.category,'visita_a_conferir');
  assert.equal(evaluated.priority,1);
});
test('Nélia: horário e endereço após pedido de visita não viram cobrança comercial',()=>{
  const m=[
    message('inbound','Boca do rio, escapando gás','2026-10-22T15:32:00Z'),
    message('inbound','Boa tarde! Vc pode vir amanhã?','2026-10-26T18:37:00Z'),
    message('outbound','Só a tarde às 14 horas! Qual o bairro e endereço completo','2026-10-26T19:46:00Z'),
    message('inbound','Boca do rio Rua Eduardo Campos','2026-10-26T19:48:00Z')
  ];
  const evaluated=classify({messages:m,thread:{last_inbound_at:'2026-10-26T19:48:00Z',last_outbound_at:'2026-10-26T19:46:00Z'},at});
  assert.equal(evaluated.category,'visita_a_conferir');
  assert.match(evaluated.label,/GÁS/);
});
test('Cristina: último áudio sem transcrição deve ser ouvido antes de resposta',()=>{
  const m=[message('outbound','Visita técnica 30 reais','2026-10-23T15:37:00Z'),
    {...message('inbound','','2026-10-23T17:28:00Z'),message_type:'audio'}];
  assert.equal(classify({messages:m,at}).category,'audio_a_revisar');
});
test('Nazinha: mensagem genérica sem retorno é primeiro contato, não defeito conhecido',()=>{
  const m=[message('inbound','Olá! Posso ter mais informações sobre isso?','2026-10-25T12:54:00Z')];
  assert.equal(classify({messages:m,at}).category,'triagem_inicial');
});
