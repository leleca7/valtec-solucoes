import test from 'node:test';
import assert from 'node:assert/strict';
import { triageCase, leadEvidence, known } from '../server/whatsapp-commercial-priority.mjs';

const at = '2026-10-26T23:00:00Z';
const m = (direction,body,created_at,message_type='text')=>({direction,body,created_at,message_type});
const run = (messages,lead={},orders=[])=>triageCase({thread:{},lead,messages,orders,now:at});
test('recusa por distância sobrepõe último ok e não sugere contato',()=>{
 const s=run([m('inbound','Moro em Santomé','2026-10-26T22:00:00Z'),m('outbound','Infelizmente não estamos atendendo esta área para o deslocamento não ficar muito caro para o cliente','2026-10-26T22:01:00Z'),m('inbound','Ok','2026-10-26T22:02:00Z')]);
 assert.equal(s.kind,'fora_area'); assert.equal(s.draft,'');
});
test('não persegue cliente que prometeu retornar hoje',()=>{
 const s=run([m('inbound','Entrarei em contato em breve','2026-10-26T21:53:00Z')]);
 assert.equal(s.kind,'aguardar_cliente');
});
test('quem compara orçamentos entra em retorno educado após dois dias',()=>{
 const s=run([m('outbound','Visita técnica R$30 e mão de obra R$150','2026-10-24T21:49:00Z'),m('inbound','Certo vou aguardar os outros orçamentos','2026-10-24T21:55:00Z')]);
 assert.equal(s.kind,'orcamento'); assert.match(s.draft,/à disposição/); assert.doesNotMatch(s.draft,/R\$/);
});
test('visita agendada prevalece sobre obrigado posterior',()=>{
 const s=run([m('outbound','Agendado para terça feira as 8:30','2026-10-24T21:49:00Z'),m('inbound','Muito obrigada','2026-10-24T22:00:00Z')]);
 assert.equal(s.kind,'visita');
});
test('convite de visita com hora requer confirmação e não trata como novo lead',()=>{
 const s=run([m('inbound','Vc pode vir amanhã?','2026-10-26T18:37:00Z'),m('outbound','Só a tarde às 14 horas! Qual bairro e endereço?','2026-10-26T19:46:00Z'),m('inbound','Boca do rio','2026-10-26T19:48:00Z')]);
 assert.equal(s.kind,'alinhar_visita');
});
test('comprovante e agradecimento indicam conclusão provável, nunca conclusão inventada',()=>{
 const s=run([m('inbound','Comprovante.pdf','2026-10-26T14:44:00Z','document'),m('outbound','Obrigado! Deus abençoe','2026-10-26T14:55:00Z')]);
 assert.equal(s.kind,'confirmar_conclusao');
});
test('conclusão confirmada por OS é respeitada',()=>{
 const s=run([m('inbound','Oi','2026-10-26T18:00:00Z')],{},[{status:'concluido',completed_at:'2026-10-26T20:00:00Z'}]);
 assert.equal(s.kind,'concluido');
});
test('áudio recente não transcrito fica para revisão humana',()=>{
 const s=run([m('inbound','','2026-10-26T21:00:00Z','audio')]);
 assert.equal(s.kind,'revisar_midia');
});
test('reapresentação repetida há dias pede retomada contextual, não novo cadastro',()=>{
 const s=run([m('inbound','Olá gostaria de informações','2026-10-23T17:00:00Z'),m('outbound','Sou técnico, mande uma foto e o bairro','2026-10-23T17:05:00Z')]);
 assert.equal(s.kind,'sem_retorno');
});
test('extrai local explicitamente declarado e problema sem tratar A confirmar como dado',()=>{
 const e=leadEvidence([m('inbound','O botão não funciona uma boca e tem uma boca que só acende no fósforo','2026-10-26T22:46:00Z'),m('inbound','Moro em Santomé','2026-10-26T22:47:00Z')]);
 assert.match(e.area,/Santomé/i);assert.match(e.problem,/botão não funciona/);
 assert.equal(known('A confirmar'),'');assert.equal(known('Não informado'),'');
});
