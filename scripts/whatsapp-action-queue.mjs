// Sugestões de atendimento: só leitura. Nenhuma mensagem ou documento é enviado aqui.
const PLACEHOLDERS = new Set(['a confirmar', 'não informado', 'nao informado', '']);
const HOUR = 3600_000;
const value = v => {const s=String(v||'').trim();return PLACEHOLDERS.has(s.toLowerCase())?'':s;};
const dateMs = v => Date.parse(v||'')||0;
const latest = (items, field='created_at') => [...(items||[])].sort((a,b)=>dateMs(b[field]||b.created_at)-dateMs(a[field]||a.created_at))[0]||null;
const matches = (thread, item) => Boolean(item && ((thread.lead_id && item.lead_id===thread.lead_id) || (thread.client_id && item.client_id===thread.client_id)));
const completed = order => Boolean(order && ['concluido','finalizado'].includes(String(order.status||'').toLowerCase()));
const paid = order => Boolean(order && (['pago','quitado','recebido','liquidado'].includes(String(order.payment_status||'').toLowerCase()) || (Number(order.total_amount||0)>0 && Number(order.amount_received||0)>=Number(order.total_amount||0))));
const state = (key,label,priority,kind,detail='') => ({key,label,priority,kind,detail});
export function getLinkedDocuments(thread,ctx={}) {
  const order=latest((ctx.orders||[]).filter(x=>matches(thread,x)),'updated_at');
  const quote=latest((ctx.quotes||[]).filter(x=>matches(thread,x)),'updated_at');
  // Um recibo só é associado à conversa se estiver ligado a uma OS do mesmo cliente.
  const receipt=latest((ctx.receipts||[]).filter(x=>!x.voided_at && order && x.service_order_id===order.id));
  return {order,quote,receipt};
}
export function getMissingFields(lead={}) {
  const p=Array.isArray(lead.problems)?lead.problems.map(value).filter(Boolean):[];
  const miss=[];
  if(!value(lead.neighborhood))miss.push('bairro');
  if(!value(lead.equipment))miss.push('equipamento/marca/modelo');
  if(!(p[0]||value(lead.description)))miss.push('defeito');
  return miss;
}
export function recommendWhatsappAction(t={},ctx={},now=Date.now()) {
  if(['personal','supplier','ignore','tester'].includes(t.contact_type)) return state('excluded','Fora da fila comercial',0,'excluded');
  const lead=ctx.lead||null,{order,quote,receipt}=getLinkedDocuments(t,ctx);
  const lastIn=dateMs(t.last_inbound_at),lastOut=Math.max(dateMs(t.last_outbound_at),dateMs(t.conversation_context?.latest_staff_reply_at));
  if(t.conversation_context?.feedback_signal==='issue' && (completed(order)||['concluido','finalizado'].includes(lead?.status)))
    return state('complaint','Resolver reclamação',5,'reply','Cliente relatou problema após serviço concluído.');
  if(receipt && paid(order))return state('receipt','Revisar recibo existente',4,'document','Conferir o recibo vinculado à OS paga antes de enviar.');
  if(completed(order) && paid(order))return state('make_receipt','Preparar recibo',4,'document','Serviço pago; ainda não há recibo desta OS.');
  if(completed(order) && !paid(order))return state('payment','Confirmar pagamento',4,'document','O sistema não confirma pagamento integral nesta OS.');
  if(quote && ['rascunho','em_preparacao','preparacao','pendente'].includes(String(quote.status||'')))
    return state('quote_review','Conferir orçamento',4,'document','Orçamento cadastrado; revisar antes de encaminhar.');
  if(quote && ['enviado','aguardando_cliente'].includes(String(quote.status||'')) && lastOut>0 && now-lastOut>24*HOUR)
    return state('quote_return','Retomar orçamento',3,'return','Confirme o envio anterior antes de enviar lembrete.');
  if(lead?.status==='orcamento_preparacao'||t.last_intent==='quote_followup'||/\b(?:or[çc]amento|quanto custa|valor do servi[çc]o)\b/i.test(t.last_message_preview||''))
    return state('make_quote','Preparar orçamento',4,'document','Não inventar preços ou peças.');
  if(t.human_required)return state('human','Aguardando técnico',5,'reply',t.human_reason||'Precisa de atendimento humano.');
  // Sem evento smb_message_echoes não sabemos se o técnico respondeu no aplicativo.
  if(lastIn>lastOut && lastIn>0)return state('check_reply',now-lastIn>HOUR?'Verificar mensagem sem resposta confirmada':'Nova mensagem para conferir',now-lastIn>HOUR?5:4,'reply','Confira a conversa no app antes de enviar outra mensagem.');
  if(lead && getMissingFields(lead).length)return state('intake','Completar primeira triagem',3,'reply','Faltam dados da solicitação.');
  if(lastOut>=lastIn && lastOut>0 && now-lastOut>24*HOUR)return state('followup','Retorno pendente',3,'return','Confira o histórico antes de retomar.');
  if(lastOut>=lastIn && lastOut>0)return state('waiting','Aguardando cliente',1,'waiting');
  if(lastIn>0)return state('review','Revisar conversa',2,'reply');
  return state('monitor','Acompanhamento',1,'waiting');
}
export function draftForWhatsappAction(action,t={},ctx={}) {
  const lead=ctx.lead||{}, {order,quote,receipt}=getLinkedDocuments(t,ctx);
  const original=value(lead.customer_name)||value(t.display_name);
  const name=/^(cliente whatsapp|contato whatsapp)$/i.test(original)?'':original.split(/\s+/)[0].slice(0,40);
  const greeting='Olá'+(name?', '+name:'')+'!';
  const missing=getMissingFields(lead);
  const drafts={
    complaint:greeting+' Sinto muito que o problema tenha continuado. Pode me explicar o que está acontecendo agora? Vou pedir ao técnico que confira o atendimento e as condições de garantia.',
    human:greeting+' Recebi sua solicitação. O técnico da Valtec vai conferir e continuar o atendimento por aqui.',
    receipt:greeting+' Seu recibo '+(receipt?.receipt_number?'nº '+receipt.receipt_number+' ':'')+'está registrado. Vou confirmar os dados do documento antes de encaminhá-lo.',
    make_receipt:'AÇÃO INTERNA: confirmar o pagamento e os dados da OS, gerar recibo na Central e revisar o documento antes do envio.',
    payment:'AÇÃO INTERNA: confirmar com o responsável o valor recebido e a forma de pagamento antes de criar ou enviar recibo. Não informar pagamento como confirmado.',
    quote_review:'AÇÃO INTERNA: conferir o orçamento '+(quote?.quote_number||'cadastrado')+' na Central, incluindo peças, serviço, valor, prazo e validade. Encaminhar PDF somente após conferência.',
    quote_return:greeting+' Tudo bem? Gostaria de saber se conseguiu analisar o orçamento '+(quote?.quote_number?'nº '+quote.quote_number+' ':'')+'que encaminhamos. Posso ajudar com alguma dúvida?',
    make_quote:'AÇÃO INTERNA: preparar orçamento com base na avaliação técnica, peças e mão de obra. Confirmar valor e prazo antes de encaminhar; nunca estimar preço sem aprovação.',
    followup:greeting+' Passando para acompanhar sua solicitação na Valtec. Ainda precisa de ajuda com seu equipamento?',
    waiting:'A última resposta conhecida foi da equipe. Nenhuma mensagem recomendada agora; aguarde o cliente.'
  };
  if(drafts[action?.key])return drafts[action.key];
  if(missing.length===3)return greeting+' Seja bem-vindo à Valtec Soluções! Para agilizar seu atendimento, me informe bairro, equipamento (marca/modelo, se souber) e o problema. Pode responder de uma vez ou aos poucos.';
  if(missing.length)return greeting+' Para organizar seu atendimento, pode informar '+missing.join(', ').replace(/, ([^,]*)$/,' e $1')+'? Foto ou vídeo são opcionais.';
  if(action?.key==='check_reply'||action?.key==='review')return greeting+' Recebi as informações do seu atendimento. Vou encaminhar ao técnico para confirmar os próximos passos.';
  return 'Confira a conversa e o cadastro antes de responder.';
}
