// Comandos enviados APENAS por números internos da VALTEC_STAFF_WHATSAPP_PHONES.
// Não interpreta mensagens de clientes como pagamentos. Todo lançamento exige CONFIRMAR.
import { createHash } from 'node:crypto';
import { normalizePhone, normalizeText, selectRows, insertRow, updateRows, sendWhatsAppText } from './whatsapp-lib.mjs';
import { recommendWhatsappAction, draftForWhatsappAction, needsReplyReview } from '../scripts/whatsapp-action-queue.mjs';
import { clientChatLink, readableDraft, reviseOperatorDraft, replaceOperatorDraft } from './whatsapp-staff-assistant.mjs';

function brl(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
}
function parseAmount(input) {
  const text = String(input || '').trim();
  if (!/^\d{1,6}(?:[,.]\d{1,2})?$/.test(text)) return NaN;
  const value = Number(text.replace(',', '.'));
  return value > 0 && value <= 100000 ? Math.round(value * 100) / 100 : NaN;
}
function deterministicId(source, kind) {
  const hex = createHash('sha256').update('valtec:' + kind + ':' + source).digest('hex');
  return [hex.slice(0,8),hex.slice(8,12),'4' + hex.slice(13,16),'a' + hex.slice(17,20),hex.slice(20,32)].join('-');
}
async function send(phone, body) { await sendWhatsAppText(phone, body); }
async function stateFor(phone) {
  const list = await selectRows('staff_whatsapp_states', 'select=*&phone=eq.' + encodeURIComponent(normalizePhone(phone)) + '&limit=1');
  return list?.[0] || null;
}
async function pendingFor(phone, pending) {
  const normalized = normalizePhone(phone);
  const current = await stateFor(normalized);
  if (current) {
    await updateRows('staff_whatsapp_states', 'phone=eq.' + encodeURIComponent(normalized), { finance_pending: pending, updated_at: new Date().toISOString() });
  } else {
    await insertRow('staff_whatsapp_states', { phone: normalized, finance_pending: pending });
  }
}
async function saveAssistantDraft(phone,draft){
  const normalized=normalizePhone(phone);
  const current=await stateFor(normalized);
  if(current)await updateRows('staff_whatsapp_states','phone=eq.'+encodeURIComponent(normalized),{
    assistant_draft:draft,updated_at:new Date().toISOString()
  });
  else await insertRow('staff_whatsapp_states',{phone:normalized,assistant_draft:draft});
}
async function showCurrentDraft(phone){
  const current=await stateFor(phone);
  await send(phone,current?.assistant_draft ? readableDraft(current.assistant_draft)
    : 'Nenhuma resposta em revisão. Envie RESPOSTA com o telefone do cliente para começar.');
}
async function handleDraftEdit(phone,kind,content){
  const row=await stateFor(phone);
  const previous=row?.assistant_draft;
  const result=kind==='operator_text'
    ? replaceOperatorDraft(previous,content)
    : reviseOperatorDraft(previous,content);
  if(result.error)return send(phone,result.error);
  await saveAssistantDraft(phone,result.draft);
  return send(phone,readableDraft(result.draft));
}
function expiresAt() { return new Date(Date.now()+10*60*1000).toISOString(); }
const HELP = [
  'Central Valtec no WhatsApp (apenas equipe):',
  'PAINEL — oportunidades pendentes',
  'FILA — clientes que precisam de resposta',
  'RESPOSTA 71999999999 — prepara texto e link do cliente',
  'AJUSTAR BAIRRO: Pituba — refaz a mensagem usando o dado corrigido',
  'AJUSTAR EQUIPAMENTO: Fogão Brastemp — corrige o equipamento',
  'AJUSTAR PROBLEMA: Não acende — corrige o defeito',
  'TEXTO: mensagem completa — substitui pelo texto revisado pelo técnico',
  'PRONTO — repete o texto e o link para enviar',
  'LIMPAR RASCUNHO — descarta a sugestão sem enviar',
  'AGENDA — próximos retornos e atendimentos',
  'HOJE — mensagens, clientes respondidos e pendências',
  'LEADS — últimas solicitações abertas',
  'CAIXA — recibos válidos e despesas deste mês',
  'RECEBIDO OS-2026-001 150,00 PIX — preparar pagamento',
  'DESPESA TRANSPORTE 25,00 estacionamento — preparar gasto',
  'CONFIRMAR — lançar o valor preparado',
  'CANCELAR — descartar o lançamento',
  '',
  'O bot só registra valores após sua confirmação. Para recibos e OS, também há a Central Valtec.'
].join('\n');

async function showLeads(phone) {
  const rows = await selectRows('leads', 'select=customer_name,phone,equipment,status,next_action,created_at&status=in.(novo,triagem,contato_realizado,orcamento_preparacao,orcamento_enviado,aguardando_cliente)&order=created_at.desc&limit=8');
  const lines = (rows || []).map((r, index) => (index+1) + '. ' + (r.customer_name || 'Contato') + ' | ' + (r.equipment || 'Equipamento não informado') + ' | ' + r.status + (r.next_action ? ' | ' + r.next_action : ''));
  await send(phone, 'Leads recentes em aberto:\n' + (lines.length ? lines.join('\n') : 'Nenhum lead pendente.'));
}
async function showPanel(phone) {
  const [leads, orders] = await Promise.all([
    selectRows('leads', 'select=id,status&status=in.(novo,triagem,contato_realizado,orcamento_preparacao,orcamento_enviado,aguardando_cliente)&limit=1000'),
    selectRows('service_orders', 'select=id,status,payment_status,total_amount,amount_received&status=neq.cancelado&limit=1000')
  ]);
  const pendingPay = (orders || []).filter((x) => x.payment_status !== 'pago');
  await send(phone, 'Painel Valtec:\n' +
    (leads?.length || 0) + ' leads aguardando andamento\n' +
    pendingPay.length + ' ordens de serviço sem quitação completa\n' +
    'Saldo declarado como pendente nas OS: ' + brl(pendingPay.reduce((sum,x)=>sum+Math.max(0,Number(x.total_amount||0)-Number(x.amount_received||0)),0)) +
    '\nEnvie LEADS para detalhar ou CAIXA para os lançamentos.');
}
async function showCash(phone) {
  const month = new Date().toISOString().slice(0,7);
  const [receipts, expenses] = await Promise.all([
    selectRows('receipts', 'select=amount&voided_at=is.null&issued_at=gte.' + month + '-01&limit=2000'),
    selectRows('expenses', 'select=amount&occurred_on=gte.' + month + '-01&limit=2000')
  ]);
  const received = (receipts || []).reduce((sum,r)=>sum+Number(r.amount||0),0);
  const spent = (expenses || []).reduce((sum,r)=>sum+Number(r.amount||0),0);
  await send(phone, 'Caixa Valtec (' + month + '):\nRecibos válidos: ' + brl(received) + '\nDespesas lançadas: ' + brl(spent) + '\nDiferença simples: ' + brl(received - spent) + '\nNão representa lucro nem conciliação bancária.');
}
const outside=(row)=>['personal','supplier','ignore','tester'].includes(row.contact_type);
const safeName=(value)=>String(value||'Cliente').trim().slice(0,60);
const friendlyDate=(value)=>value?new Date(value).toLocaleString('pt-BR',{timeZone:'America/Bahia',dateStyle:'short',timeStyle:'short'}):'—';
async function showQueue(phone){
  const list=await selectRows('whatsapp_threads','select=display_name,phone,contact_type,lead_id,client_id,human_required,last_inbound_at,last_outbound_at,conversation_context&order=last_message_at.desc&limit=150');
  const rows=(list||[]).filter(row=>needsReplyReview(row))
    .sort((a,b)=>Number(Boolean(b.human_required))-Number(Boolean(a.human_required))||Date.parse(a.last_inbound_at||0)-Date.parse(b.last_inbound_at||0));
  const lines=rows.slice(0,8).map((row,i)=>(i+1)+'. '+safeName(row.display_name)+' · '+String(row.phone||'').slice(-4)+' · '+friendlyDate(row.last_inbound_at)+(row.human_required?' · técnico':''));
  await send(phone,'Fila Valtec: '+rows.length+' conversa(s) com resposta não confirmada na amostra recente.\n'+(lines.join('\n')||'Nenhuma pendência identificada.')+'\n\nConfira o aplicativo antes de enviar: respostas manuais podem não estar sincronizadas. Envie RESPOSTA seguido do telefone completo para uma sugestão.');
}
async function showTodayMessages(phone){
  const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Bahia',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const dayStart=Date.parse(day+'T03:00:00.000Z');
  // Só contar registros do banco. Mensagem não equivale a cliente atendido.
  const [messages,threads]=await Promise.all([
    selectRows('whatsapp_messages','select=thread_id,direction,delivery_status&created_at=gte.'+encodeURIComponent(new Date(dayStart).toISOString())+'&limit=1000'),
    selectRows('whatsapp_threads','select=id,contact_type,lead_id,client_id,human_required,last_inbound_at,last_outbound_at,conversation_context&limit=1000')
  ]);
  const active=(threads||[]).filter(t=>['lead','client'].includes(t.contact_type));
  const known=new Set(active.map(t=>t.id));
  const replied=new Set();
  for(const msg of messages||[]){
    if(msg.direction==='outbound' && known.has(msg.thread_id) && !['failed','queued'].includes(msg.delivery_status))replied.add(msg.thread_id);
  }
  // O responsável pode confirmar manualmente que já respondeu, sem um eco da Meta.
  for(const t of active){
    if((Date.parse(t.conversation_context?.latest_staff_reply_at||'')||0)>=dayStart)replied.add(t.id);
  }
  const inbound=(messages||[]).filter(x=>x.direction==='inbound').length;
  const outbound=(messages||[]).filter(x=>x.direction==='outbound').length;
  const pending=active.filter(needsReplyReview).length;
  const unknown=(threads||[]).filter(t=>t.contact_type==='unknown'&&!t.lead_id&&!t.client_id).length;
  const limitReached=(messages||[]).length>=1000||(threads||[]).length>=1000;
  await send(phone, 'WhatsApp Valtec — '+day+'\n'+
    'Mensagens recebidas: '+inbound+'\n'+
    'Saídas registradas: '+outbound+'\n'+
    'Clientes com resposta registrada hoje: '+replied.size+'\n'+
    'Conversas comerciais a conferir: '+pending+'\n'+
    'Conversas ainda não classificadas: '+unknown+'\n\n'+
    'Somente registros sincronizados. Uma conversa pode conter várias mensagens; contatos desconhecidos não são presumidos clientes.'+
    (limitReached?' ATENÇÃO: consulta atingiu limite; totais podem estar incompletos.':''));
}
async function showAgenda(phone){
  const since=new Date(Date.now()-24*3600000).toISOString(),until=new Date(Date.now()+14*86400000).toISOString();
  const [leads,orders]=await Promise.all([
    selectRows('leads','select=customer_name,next_action,next_action_at,status&next_action_at=gte.'+encodeURIComponent(since)+'&next_action_at=lte.'+encodeURIComponent(until)+'&order=next_action_at.asc&limit=8'),
    selectRows('service_orders','select=order_number,scheduled_for,status&scheduled_for=gte.'+encodeURIComponent(since)+'&scheduled_for=lte.'+encodeURIComponent(until)+'&order=scheduled_for.asc&limit=8')
  ]);
  const items=[
    ...(leads||[]).filter(x=>!['concluido','finalizado','perdido','arquivado'].includes(x.status)).map(x=>({at:x.next_action_at,line:'Retorno: '+safeName(x.customer_name)+' · '+(x.next_action||'Acompanhar cliente')})),
    ...(orders||[]).filter(x=>!['concluido','cancelado'].includes(x.status)).map(x=>({at:x.scheduled_for,line:'OS '+(x.order_number||'agendada')}))
  ].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)).slice(0,10);
  await send(phone,'Agenda Valtec — próximos compromissos:\n'+(items.map((x,i)=>(i+1)+'. '+friendlyDate(x.at)+' · '+x.line).join('\n')||'Nenhum compromisso no período consultado.')+'\n\nConfirme disponibilidade com o cliente antes de prometer horário.');
}
async function showSuggestedReply(phone,target){
  const digits=String(target||'').replace(/\D/g,'');
  if(digits.length<10||digits.length>13)return send(phone,'Envie o telefone completo. Exemplo: RESPOSTA 71999999999');
  const normalized=normalizePhone(digits);
  const rows=await selectRows('whatsapp_threads','select=id,phone,display_name,contact_type,lead_id,client_id,last_inbound_at,last_outbound_at,last_message_preview,conversation_context,human_required,human_reason,last_intent&phone=eq.'+encodeURIComponent(normalized)+'&limit=1');
  const thread=rows?.[0];
  if(!thread)return send(phone,'Conversa não localizada pelo telefone informado. Confira o número na Central.');
  if(outside(thread)||(!thread.lead_id&&!thread.client_id))return send(phone,'Conversa fora do atendimento comercial confirmado. Não vou sugerir uma resposta até a classificação ser revisada.');
  const [leads,messages,quotes,orders]=await Promise.all([
    thread.lead_id?selectRows('leads','select=id,customer_name,equipment,neighborhood,description,problems,status,next_action,next_action_at&id=eq.'+encodeURIComponent(thread.lead_id)+'&limit=1'):Promise.resolve([]),
    selectRows('whatsapp_messages','select=direction,body,transcript,created_at&thread_id=eq.'+encodeURIComponent(thread.id)+'&order=created_at.desc&limit=4'),
    selectRows('quotes','select=id,lead_id,client_id,status,quote_number,created_at,updated_at&'+(thread.lead_id?'lead_id=eq.'+encodeURIComponent(thread.lead_id):'client_id=eq.'+encodeURIComponent(thread.client_id))+'&order=created_at.desc&limit=8'),
    selectRows('service_orders','select=id,lead_id,client_id,status,payment_status,total_amount,amount_received,updated_at,created_at&'+(thread.lead_id?'lead_id=eq.'+encodeURIComponent(thread.lead_id):'client_id=eq.'+encodeURIComponent(thread.client_id))+'&order=created_at.desc&limit=8')
  ]);
  const context={lead:leads?.[0]||null,quotes:quotes||[],orders:orders||[],receipts:[]};
  const guidance=recommendWhatsappAction(thread,context);
  const draft=draftForWhatsappAction(guidance,thread,context);
  const unresolvedMessage=needsReplyReview(thread) && guidance.kind!=='reply'
    ? 'ATENÇÃO: há mensagem recente sem resposta confirmada, além da tarefa de '+guidance.label.toLowerCase()+'. Confira a conversa antes de responder.\n\n'
    : '';
  const lastCustomer=(messages||[]).find(x=>x.direction==='inbound');
  const preview=String(lastCustomer?.body||lastCustomer?.transcript||thread.last_message_preview||'Sem texto sincronizado').slice(0,240);
  const name=safeName(context.lead?.customer_name||thread.display_name);
  const link=clientChatLink(thread.phone,draft);
  // Orientação sobre orçamento/recibo não pode acidentalmente virar mensagem ao cliente.
  if(!link){
    await saveAssistantDraft(phone,null);
    return send(phone,'AÇÃO INTERNA — '+name+'\nÚltima mensagem: '+preview+'\n\n'+unresolvedMessage+draft+
      '\n\nEsse item precisa de conferência humana antes de gerar ou enviar documento. Abra a Central: https://valtec-solucoes.vercel.app/admin.html');
  }
  const draftState={
    thread_id:thread.id,phone:thread.phone,name, text:draft,
    facts:{
      nome:name,bairro:context.lead?.neighborhood||'',
      equipamento:context.lead?.equipment||'',
      problema:(Array.isArray(context.lead?.problems)?context.lead.problems.filter(Boolean).join(', '):'')||context.lead?.description||''
    },
    source:'template',updated_at:new Date().toISOString()
  };
  await saveAssistantDraft(phone,draftState);
  await send(phone,'CLIENTE: '+name+'\nÚLTIMA MENSAGEM: '+preview+'\nSITUAÇÃO: '+guidance.label+'\n\n'+unresolvedMessage+readableDraft(draftState));
}
async function paymentDraft(phone, messageId, number, amount, method) {
  const code = number.toUpperCase();
  const orders = await selectRows('service_orders', 'select=id,order_number,total_amount,client_id,service_description&order_number=eq.' + encodeURIComponent(code) + '&limit=1');
  if (!orders?.length) return send(phone, 'OS não encontrada. Confira o número exato na Central.');
  const order = orders[0];
  if (Number(order.total_amount || 0) <= 0) return send(phone, 'A OS está sem valor total positivo. Confira o orçamento na Central antes de registrar pagamento.');
  const receipts = await selectRows('receipts', 'select=amount&service_order_id=eq.' + encodeURIComponent(order.id) + '&voided_at=is.null&limit=1000');
  const paid = (receipts || []).reduce((sum,r)=>sum+Number(r.amount||0),0);
  const remaining = Math.max(0, Number(order.total_amount || 0) - paid);
  if (Number(order.total_amount || 0) > 0 && amount > remaining+0.01) return send(phone,'O valor excede o saldo dos recibos ligados à OS (' + brl(remaining) + '). Confira manualmente antes de registrar.');
  const pending = { kind:'payment',source_message_id:messageId,order_id:order.id,order_number:code,amount,method,expires_at:expiresAt() };
  await pendingFor(phone, pending);
  await send(phone, 'Conferir antes de lançar:\nOS: ' + code + '\nValor: ' + brl(amount) + '\nForma: ' + method + '\nJá registrado em recibos: ' + brl(paid) + '\nSaldo antes deste pagamento: ' + brl(remaining) + '\nResponda CONFIRMAR ou CANCELAR em até 10 minutos.');
}
async function expenseDraft(phone, messageId, category, amount, description) {
  if (!description.trim()) return send(phone,'Informe uma descrição. Ex.: DESPESA TRANSPORTE 25,00 estacionamento');
  const pending = { kind:'expense',source_message_id:messageId,category,amount,description:description.trim().slice(0,300),expires_at:expiresAt() };
  await pendingFor(phone,pending);
  await send(phone,'Conferir despesa:\nCategoria: ' + category + '\nValor: ' + brl(amount) + '\nDescrição: ' + pending.description + '\nResponda CONFIRMAR ou CANCELAR em até 10 minutos.');
}
async function confirm(phone) {
  const state = await stateFor(phone);
  const pending = state?.finance_pending;
  if (!pending) return send(phone,'Não existe lançamento pendente. Envie AJUDA FINANCEIRO para ver os comandos.');
  if (Date.parse(pending.expires_at || 0) <= Date.now()) {
    await pendingFor(phone,null);
    return send(phone,'Confirmação expirada. Envie o comando novamente.');
  }
  if (!pending.source_message_id) return send(phone,'Mensagem original sem identificador; não é seguro registrar. Envie o comando novamente.');
  const now = new Date().toISOString();
  const id = deterministicId(pending.source_message_id, pending.kind);
  if (pending.kind === 'expense') {
    const existing = await selectRows('expenses','select=id&id=eq.'+encodeURIComponent(id)+'&limit=1');
    if (!existing?.length) {
      try {
        await insertRow('expenses',{id,category:pending.category,description:pending.description,amount:pending.amount,occurred_on:now.slice(0,10)});
      } catch(error) {
        const replay = await selectRows('expenses','select=id&id=eq.'+encodeURIComponent(id)+'&limit=1');
        if (!replay?.length) throw error;
      }
    }
    await pendingFor(phone,null);
    return send(phone,'Despesa registrada no financeiro: ' + brl(pending.amount) + '. Identificador: ' + id.slice(0,8));
  }
  if (pending.kind === 'payment') {
    const orders = await selectRows('service_orders', 'select=id,client_id,total_amount,service_description&id=eq.' + encodeURIComponent(pending.order_id) + '&limit=1');
    const order = orders?.[0];
    if (!order) return send(phone,'OS não encontrada. Registro não efetuado.');
    const client = order.client_id
      ? (await selectRows('clients','select=name&id=eq.'+encodeURIComponent(order.client_id)+'&limit=1'))?.[0]
      : null;
    const existing = await selectRows('receipts','select=id,voided_at&id=eq.'+encodeURIComponent(id)+'&limit=1');
    if (existing?.[0]?.voided_at) {
      await pendingFor(phone, null);
      return send(phone, 'Este lançamento já foi cancelado no financeiro. Não é possível reativá-lo; confira a OS e prepare um novo lançamento, se necessário.');
    }
    if (!existing?.length) {
      try {
        await insertRow('receipts',{
          id,service_order_id:order.id,client_id:order.client_id||null,
          receipt_number:'WA-' + id.slice(0,8).toUpperCase(),
          client_name:client?.name||'Cliente Valtec',amount:pending.amount,
          service_description:order.service_description||'Pagamento de ordem de serviço',
          observation:'Lançamento confirmado pelo WhatsApp interno da Valtec.',
          payment_method:pending.method,issued_at:now.slice(0,10)
        });
      } catch(error) {
        const replay = await selectRows('receipts','select=id&id=eq.'+encodeURIComponent(id)+'&limit=1');
        if (!replay?.length) throw error;
      }
    }
    const records=await selectRows('receipts','select=amount&service_order_id=eq.'+encodeURIComponent(order.id)+'&voided_at=is.null&limit=1000');
    const received=(records||[]).reduce((sum,r)=>sum+Number(r.amount||0),0);
    const status=received>=Number(order.total_amount||0)?'pago':'parcial';
    await updateRows('service_orders','id=eq.'+encodeURIComponent(order.id),{
      amount_received:received,payment_status:status,payment_method:pending.method,
      payment_received_at:status==='pago'?now:null,updated_at:now
    });
    await pendingFor(phone,null);
    return send(phone,'Pagamento confirmado na Central: ' + pending.order_number + ' · ' + brl(pending.amount) + '. Recibo criado e OS atualizada. Total registrado: ' + brl(received) + '.');
  }
  await pendingFor(phone,null);
  return send(phone,'Tipo de lançamento não reconhecido. Nenhum valor foi gravado.');
}
async function handleStaffOperationalCommand({ phone, text, messageId }) {
  const normalized = normalizeText(text || '');
  if (!normalized) return false;
  if (['ajuda financeiro','financeiro ajuda','ajuda operacao'].includes(normalized)) { await send(phone,HELP); return true; }
  if (normalized === 'painel') { await showPanel(phone); return true; }
  if (normalized === 'fila') { await showQueue(phone); return true; }
  if (normalized === 'agenda') { await showAgenda(phone); return true; }
  if (normalized === 'hoje') { await showTodayMessages(phone); return true; }
  if (normalized === 'pronto') { await showCurrentDraft(phone); return true; }
  if (normalized === 'limpar rascunho') {
    await saveAssistantDraft(phone,null);
    await send(phone,'Rascunho descartado. Nenhuma mensagem foi enviada ao cliente.');
    return true;
  }
  const edit=String(text||'').trim().match(/^AJUSTAR\s+([\s\S]+)$/i);
  if(edit) { await handleDraftEdit(phone,'facts',edit[1]); return true; }
  const textOverride=String(text||'').trim().match(/^TEXTO\s*:\s*([\s\S]+)$/i);
  if(textOverride) { await handleDraftEdit(phone,'operator_text',textOverride[1]); return true; }
  const replyRequest=String(text||'').trim().match(/^RESPOSTA\s+([+\d\s().-]+)$/i);
  if(replyRequest){await showSuggestedReply(phone,replyRequest[1]);return true;}
  if(normalized==='resposta'){await send(phone,'Envie RESPOSTA com o telefone completo do cliente. Ex.: RESPOSTA 71999999999');return true;}
  if (normalized === 'leads') { await showLeads(phone); return true; }
  if (normalized === 'caixa') { await showCash(phone); return true; }
  if (normalized === 'confirmar') { await confirm(phone); return true; }
  if (normalized === 'cancelar') { await pendingFor(phone,null); await send(phone,'Lançamento descartado, sem alteração no financeiro.'); return true; }

  const payment = String(text).trim().match(/^RECEBIDO\s+(OS-[\d-]+)\s+(\d{1,6}(?:[.,]\d{1,2})?)\s+(PIX|DINHEIRO|CART[AÃ]O|TRANSFER[EÊ]NCIA)$/i);
  if (payment) {
    if (!messageId) { await send(phone,'Identificador da mensagem indisponível. Não é seguro lançar; tente novamente.'); return true; }
    const amount=parseAmount(payment[2]);
    if (!Number.isFinite(amount)) { await send(phone,'Valor inválido. Ex.: RECEBIDO OS-2026-001 150,00 PIX'); return true; }
    await paymentDraft(phone,messageId,payment[1],amount,payment[3].toUpperCase()); return true;
  }
  const expense = String(text).trim().match(/^DESPESA\s+(PE[CÇ]AS|TRANSPORTE|MATERIAL|TERCEIROS|OUTROS)\s+(\d{1,6}(?:[.,]\d{1,2})?)\s+(.+)$/i);
  if (expense) {
    if (!messageId) { await send(phone,'Identificador da mensagem indisponível. Não é seguro lançar; tente novamente.'); return true; }
    const amount=parseAmount(expense[2]);
    if (!Number.isFinite(amount)) { await send(phone,'Valor inválido. Ex.: DESPESA TRANSPORTE 25,00 estacionamento'); return true; }
    await expenseDraft(phone,messageId,expense[1].toUpperCase(),amount,expense[3]); return true;
  }
  if (/^(recebido|despesa)\b/.test(normalized)) {
    await send(phone,'Formato incompleto. Envie AJUDA FINANCEIRO para ver exemplos.'); return true;
  }
  return false;
}

export { handleStaffOperationalCommand, parseAmount, deterministicId };
