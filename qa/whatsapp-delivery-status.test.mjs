import test from 'node:test';
import assert from 'node:assert/strict';
import { metaDeliveryFailure, isLatestUndeliveredReply } from '../server/whatsapp-delivery-status.mjs';
import { recommendWhatsappAction } from '../scripts/whatsapp-action-queue.mjs';

test('captura motivo do erro assíncrono da Meta, sem status pessoal ou IDs',()=>{
 const sample={id:'wamid.secret',recipient_id:'5571999992289',status:'failed',errors:[{code:131042,title:'Business eligibility payment issue',error_data:{details:'A conta precisa de configuração de pagamento'}}]};
 const failure=metaDeliveryFailure(sample);
 assert.deepEqual(failure,{code:131042,title:'Business eligibility payment issue',details:'A conta precisa de configuração de pagamento'});
 assert.ok(!JSON.stringify(failure).includes('5571999992289'));
 assert.ok(!JSON.stringify(failure).includes('wamid.secret'));
 assert.equal(metaDeliveryFailure({...sample,status:'delivered'}),null);
});
test('não substitui resposta humana posterior por falha antiga',()=>{
 assert.equal(isLatestUndeliveredReply({conversation_context:{latest_staff_reply_at:'2026-10-18T22:02:00Z'}},'2026-10-18T22:01:00Z'),false);
 assert.equal(isLatestUndeliveredReply({conversation_context:{latest_staff_reply_at:'2026-10-18T22:02:00Z'}},'2026-10-18T22:03:00Z'),true);
});
test('fila destaca resposta automática não entregue até a equipe responder',()=>{
 const now=Date.parse('2026-10-19T00:32:00Z');
 const base={contact_type:'lead',lead_id:'x1',last_inbound_at:'2026-10-19T00:28:34Z',last_outbound_at:'2026-10-19T00:28:35Z',conversation_context:{latest_bot_delivery_failed_at:'2026-10-19T00:28:36Z'}};
 assert.equal(recommendWhatsappAction(base,{},now).key,'bot_failed');
 assert.equal(recommendWhatsappAction({...base,conversation_context:{...base.conversation_context,latest_staff_reply_at:'2026-10-19T00:29:00Z'}},{},now).key,'waiting');
});
