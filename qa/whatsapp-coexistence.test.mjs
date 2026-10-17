import test from 'node:test';
import assert from 'node:assert/strict';
import {extractBusinessAppEchoes,feedbackSignal,conversationAttention} from '../server/whatsapp-coexistence.mjs';

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
