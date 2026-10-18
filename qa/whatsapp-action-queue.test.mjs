import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendWhatsappAction, draftForWhatsappAction, getLinkedDocuments, getMissingFields } from '../scripts/whatsapp-action-queue.mjs';
const now=Date.parse('2026-10-18T20:00:00Z');
const thread={id:'t1',lead_id:'l1',client_id:'c1',contact_type:'lead',display_name:'Alan',last_inbound_at:'2026-10-18T19:00:00Z'};
const lead={id:'l1',customer_name:'Alan',equipment:'Fogão residencial',neighborhood:'Boca do Rio',problems:['Forno não acende']};
test('primeira mensagem sem eco de resposta não é marcada como lida ou respondida',()=>{
 const a=recommendWhatsappAction(thread,{lead},now);
 assert.equal(a.key,'check_reply');
 assert.match(a.detail,/app/);
 assert.match(draftForWhatsappAction(a,thread,{lead}),/técnico/);
});
test('confirmar resposta do pai passa conversa para aguardando cliente',()=>{
 const t={...thread,conversation_context:{latest_staff_reply_at:'2026-10-18T19:30:00Z'}};
 assert.equal(recommendWhatsappAction(t,{lead},now).key,'waiting');
 assert.equal(recommendWhatsappAction(t,{lead},now+25*3600_000).key,'followup');
});
test('contatos pessoais, fornecedores e testes nunca geram sugestões comerciais',()=>{
 for(const type of ['personal','supplier','ignore','tester']){
   assert.equal(recommendWhatsappAction({...thread,contact_type:type},{lead},now).key,'excluded');
 }
});
test('bot pede apenas os campos da triagem que estão ausentes',()=>{
 const incomplete={...lead,neighborhood:'A confirmar',problems:['A confirmar']};
 assert.deepEqual(getMissingFields(incomplete),['bairro','defeito']);
 const t={...thread,last_inbound_at:'',last_outbound_at:''};
 const a=recommendWhatsappAction(t,{lead:incomplete},now);
 assert.equal(a.key,'intake');
 assert.match(draftForWhatsappAction(a,t,{lead:incomplete}),/bairro/);
 assert.match(draftForWhatsappAction(a,t,{lead:incomplete}),/defeito/);
});
test('somente orçamento relacionado ao cliente é sugerido',()=>{
 const data={lead,quotes:[{id:'wrong',client_id:'c-other',status:'rascunho'},{id:'right',lead_id:'l1',quote_number:'ORC-7',status:'rascunho'}]};
 const a=recommendWhatsappAction(thread,data,now);
 assert.equal(a.key,'quote_review');
 assert.match(draftForWhatsappAction(a,thread,data),/ORC-7/);
});
test('recibo de outro serviço e recibo anulado não podem ser sugeridos',()=>{
 const order={id:'os-01',lead_id:'l1',client_id:'c1',status:'concluido',payment_status:'pago',created_at:'2026-10-17T00:00:00Z'};
 const data={lead,orders:[order],receipts:[
 {service_order_id:'os-99',receipt_number:'ERRADO'},
 {service_order_id:'os-01',receipt_number:'ANULADO',voided_at:'2026-10-18T00:00:00Z'}
 ]};
 assert.equal(getLinkedDocuments(thread,data).receipt,null);
 assert.equal(recommendWhatsappAction(thread,data,now).key,'make_receipt');
 data.receipts.push({service_order_id:'os-01',receipt_number:'R-123',created_at:'2026-10-18T17:00:00Z'});
 assert.equal(recommendWhatsappAction(thread,data,now).key,'receipt');
 assert.match(draftForWhatsappAction(recommendWhatsappAction(thread,data,now),thread,data),/R-123/);
});
test('nunca recomenda comprovante de pagamento sem pagamento confirmado',()=>{
 const data={lead,orders:[{id:'os-01',lead_id:'l1',status:'concluido',payment_status:'pendente',total_amount:300,amount_received:0}]};
 const a=recommendWhatsappAction(thread,data,now);
 assert.equal(a.key,'payment');
 assert.match(draftForWhatsappAction(a,thread,data),/não informar pagamento como confirmado/i);
});
test('urgência: reclamação de serviço concluído precede pedido de recibo',()=>{
 const t={...thread,conversation_context:{feedback_signal:'issue'}};
 const data={lead,orders:[{id:'os-01',lead_id:'l1',status:'concluido',payment_status:'pago'}],receipts:[{service_order_id:'os-01',receipt_number:'R-1'}]};
 assert.equal(recommendWhatsappAction(t,data,now).key,'complaint');
});

test('sem lead nem cliente a mensagem não vira automaticamente conversa comercial',()=>{
 const unknown={id:'u1',contact_type:'unknown',last_inbound_at:'2026-10-18T19:00:00Z'};
 assert.equal(recommendWhatsappAction(unknown,{},now).key,'classify');
});
