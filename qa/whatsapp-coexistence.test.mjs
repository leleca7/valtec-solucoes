import test from 'node:test';
import assert from 'node:assert/strict';
import {extractBusinessAppEchoes,feedbackSignal,conversationAttention,canTrackBusinessAppEcho,echoSentAt,leadUpdateAfterBusinessAppReply} from '../server/whatsapp-coexistence.mjs';

test('evento de coexistência identifica respostas que o técnico enviou pelo aplicativo',()=>{
 const change={field:'smb_message_echoes',value:{message_echoes:[
  {id:'wamid.test1',from:'5571981954452',to:'5571999999999',type:'text',text:{body:'Enviei o orçamento'}},
  {id:'wamid.test2',from:'5571981954452',to:'5571888888888',type:'image',image:{}}
 ]}};
 assert.equal(extractBusinessAppEchoes(change).length,2);
 assert.equal(extractBusinessAppEchoes({...change,field:'messages'}).length,0);
});

test('não grava deleção/edição/objeto inválido como nova resposta',()=>{
 assert.deepEqual(extractBusinessAppEchoes({field:'smb_message_echoes',value:{message_echoes:[
  {id:'wamid.xxx',to:'5511988887777',type:'revoke'},
  {id:'wamid.yyy',to:'5511988887777',type:'edit'},
  {id:'',to:'5511988887777',type:'text'},
 ]}}),[]);
});

test('feedback comercial tem prioridade para problemas não resolvidos',()=>{
 assert.equal(feedbackSignal('Ainda não funciona, não resolveu.'),'issue');
 assert.equal(feedbackSignal('O serviço ficou ótimo, funcionando perfeitamente!'),'positive');
 assert.equal(feedbackSignal('Tenho interesse em um fogão'),'unknown');
});

test('a fila distingue cliente aguardando técnico de cliente aguardando resposta',()=>{
 const now=Date.parse('2026-10-17T15:00:00.000Z');
 assert.equal(conversationAttention({contact_type:'personal',human_required:true},now),'fora_do_fluxo');
 assert.equal(conversationAttention({contact_type:'lead',human_required:true,lead_id:'id'},now),'aguardando_tecnico');
 assert.equal(conversationAttention({contact_type:'lead',lead_id:'id',last_inbound_at:'2026-10-17T14:00:00Z',conversation_context:{latest_staff_reply_at:'2026-10-17T14:30:00Z'}},now),'aguardando_cliente');
 assert.equal(conversationAttention({contact_type:'lead',lead_id:'id',last_inbound_at:'2026-10-15T14:00:00Z',conversation_context:{latest_staff_reply_at:'2026-10-15T14:30:00Z'}},now),'retorno_pendente');
});


test('não copia respostas privadas ou mensagens a fornecedores para a Central',()=>{
  assert.equal(canTrackBusinessAppEcho(null), false);
  assert.equal(canTrackBusinessAppEcho({contact_type:'personal',lead_id:'lead'}), false);
  assert.equal(canTrackBusinessAppEcho({contact_type:'supplier',client_id:'client'}), false);
  assert.equal(canTrackBusinessAppEcho({contact_type:'ignore',lead_id:'lead'}), false);
  assert.equal(canTrackBusinessAppEcho({contact_type:'unknown'}), false);
  assert.equal(canTrackBusinessAppEcho({contact_type:'lead',lead_id:'lead',auto_reply_mode:'never'}), true); // organização silenciosa, sem disparo do bot
  assert.equal(canTrackBusinessAppEcho({contact_type:'lead',lead_id:'lead'}), true);
  assert.equal(canTrackBusinessAppEcho({contact_type:'client',client_id:'client'}), true);
});

test('horário original do WhatsApp é preservado para ordenar respostas',()=>{
  const now=Date.parse('2026-10-18T21:00:00Z');
  assert.equal(echoSentAt({timestamp:String(now/1000-600)},now),now-600_000);
  assert.equal(echoSentAt({timestamp:String(now/1000+3600)},now),now);
  assert.equal(echoSentAt({timestamp:String(now/1000-95*86400)},now),now);
  assert.equal(echoSentAt({timestamp:null},now),now);
});

test('resposta humana não apaga data ou tarefa agendada pelo técnico',()=>{
 const lastReply='2026-10-25T12:00:00Z',sentAtMs=Date.parse('2026-10-26T12:00:00Z');
 const lead={status:'contato_realizado',next_action:'Visitar cliente com peça em mãos',next_action_at:'2026-11-03T14:30:00Z'};
 const updated=leadUpdateAfterBusinessAppReply(lead,{priorStaffReplyAt:lastReply,sentAtMs,now:'2026-10-26T12:01:00Z'});
 assert.equal(updated.next_action,undefined);
 assert.equal(updated.next_action_at,undefined);
 assert.ok(updated.contacted_at);
});
test('data editada manualmente fica preservada mesmo se texto de retorno é padrão',()=>{
 const lead={status:'contato_realizado',next_action:'Acompanhar a resposta do cliente no WhatsApp',next_action_at:'2026-11-03T14:30:00Z'};
 const updated=leadUpdateAfterBusinessAppReply(lead,{priorStaffReplyAt:'2026-10-25T12:00:00Z',sentAtMs:Date.parse('2026-10-26T12:00:00Z'),now:'2026-10-26T12:00:00Z'});
 assert.equal(updated.next_action_at,undefined);
});
test('somente lembrete gerado por eco anterior pode ser recalculado por nova resposta',()=>{
 const lead={status:'triagem',next_action:'Acompanhar a resposta do cliente no WhatsApp',next_action_at:'2026-10-26T12:00:00Z'};
 const updated=leadUpdateAfterBusinessAppReply(lead,{priorStaffReplyAt:'2026-10-25T12:00:00Z',sentAtMs:Date.parse('2026-10-26T14:00:00Z'),now:'2026-10-26T14:01:00Z'});
 assert.equal(updated.status,'contato_realizado');
 assert.equal(updated.next_action_at,'2026-10-27T14:00:00.000Z');
});
test('sem planejamento prévio registra próximo passo e alerta de segurança',()=>{
 const updated=leadUpdateAfterBusinessAppReply({status:'novo'},{
   priorStaffReplyAt:'',sentAtMs:Date.parse('2026-10-26T14:00:00Z'),now:'2026-10-26T14:01:00Z',keepSafetyEscalation:true
 });
 assert.equal(updated.next_action,'Técnico deve verificar a situação de segurança ou garantia');
 assert.equal(updated.next_action_at,'2026-10-26T14:01:00.000Z');
});
