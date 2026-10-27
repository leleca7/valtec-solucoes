import { classifyCommercialFollowup } from './whatsapp-lead-priority.mjs';
import { recoverCustomerFactsFromHistory } from './whatsapp-owner-evidence.mjs';
// Canal privado e opt-in do proprietário. Totalmente separado do WhatsApp comercial.
// Proteções: destinatário único autorizado, remetente TESTE explícito, sem autoenviar para clientes.
import { env, selectRows, insertRow, updateRows } from './whatsapp-lib.mjs';
import { assistantPhone, customerWhatsAppLink, safeCustomerDraft, composeServiceRecord, parseOwnerCommand, ownerHelp, isMetaSandboxSender, knownCustomerFact } from './whatsapp-owner-assistant-core.mjs';

const now = () => new Date().toISOString();
const ownerPhone = () => assistantPhone(env('VALTEC_ASSISTANT_OWNER_PHONE'));
const testPhoneId = () => String(env('VALTEC_ASSISTANT_TEST_PHONE_ID') || '').trim();
const commercialPhoneId = () => String(env('WHATSAPP_PHONE_NUMBER_ID') || '').trim();
const enabled = () => {
  const token = String(env('VALTEC_ASSISTANT_TEST_TOKEN') || '');
  return String(env('VALTEC_ASSISTANT_ENABLED')).toLowerCase() === 'true' &&
    /^\d{8,25}$/.test(testPhoneId()) &&
    testPhoneId() !== commercialPhoneId() &&
    /^55\d{10,11}$/.test(ownerPhone()) &&
    token.length >= 20;
};

export function isPrivateOwnerWebhook(value) {
  return enabled() && String(value?.metadata?.phone_number_id || '') === testPhoneId();
}

function isOwner(message) {
  return assistantPhone(message?.from) === ownerPhone();
}

async function sendOwner(text) {
  if (!enabled()) return null;
  const body = String(text || '').trim().slice(0, 3900);
  if (!body) return null;
  // Nunca usa sendWhatsAppText: essa função emprega o remetente COMERCIAL da Valtec.
  const version = String(env('WHATSAPP_GRAPH_VERSION') || 'v26.0');
  if (!/^v\d+\.\d+$/.test(version)) throw new Error('Versão inválida da Graph API.');
  const response = await fetch('https://graph.facebook.com/' + version + '/' + testPhoneId() + '/messages', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + env('VALTEC_ASSISTANT_TEST_TOKEN'),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: ownerPhone(),
      type: 'text',
      text: { body, preview_url: false }
    })
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    const code = failure?.error?.code || response.status;
    throw new Error('Envio privado recusado pela Meta (código ' + code + ').');
  }
  return (await response.json())?.messages?.[0]?.id || null;
}

async function getSession() {
  const items = await selectRows('whatsapp_assistant_sessions', 'select=*&operator_phone=eq.' + encodeURIComponent(ownerPhone()) + '&limit=1');
  return items?.[0] || null;
}

async function saveSession(patch) {
  const previous = await getSession();
  return insertRow('whatsapp_assistant_sessions', {
    operator_phone: ownerPhone(),
    thread_id: null,
    draft: '',
    overrides: {},
    ...(previous || {}),
    ...patch,
    updated_at: now()
  }, { onConflict: 'operator_phone', upsert: true });
}

async function contextFor(thread, overrides = {}) {
  let lead = null;
  let client = null;
  if (thread.lead_id) {
    const rows = await selectRows('leads', 'select=customer_name,phone,equipment,problems,description,neighborhood&' +
      'id=eq.' + encodeURIComponent(thread.lead_id) + '&limit=1');
    lead = rows?.[0] || null;
  }
  if (thread.client_id && !lead) {
    const rows = await selectRows('clients', 'select=name,phone,equipment_notes,neighborhood&id=eq.' + encodeURIComponent(thread.client_id) + '&limit=1');
    client = rows?.[0] || null;
  }
  const problems = Array.isArray(lead?.problems) ? lead.problems : [];
  const firstKnown = (...values) => values.map(knownCustomerFact).find(Boolean) || '';
  const equipment = firstKnown(overrides.equipment, lead?.equipment, client?.equipment_notes);
  let issue = firstKnown(overrides.issue, ...problems, lead?.description);
  let neighborhood = firstKnown(overrides.neighborhood, lead?.neighborhood, client?.neighborhood);
  let evidenceSource = '';
  if (!issue || !neighborhood) {
    const history = await selectRows('whatsapp_messages',
      'select=direction,message_type,body,created_at&thread_id=eq.' + encodeURIComponent(thread.id) +
      '&order=created_at.desc&limit=80');
    const evidence = recoverCustomerFactsFromHistory(history || []);
    if (!issue && evidence.issue) {
      issue = evidence.issue;
      evidenceSource = 'Relato do cliente no WhatsApp; diagnóstico não confirmado';
    }
    if (!neighborhood && evidence.neighborhood) neighborhood = evidence.neighborhood;
  }
  return {
    name: lead?.customer_name || client?.name || thread.display_name || 'Cliente',
    phone: thread.phone,
    equipment, issue, neighborhood, evidenceSource,
    requestPhoto: Boolean(overrides.requestPhoto)
  };
}

async function getSelected() {
  const session = await getSession();
  if (!session?.thread_id) return { session, thread: null, context: null };
  const list = await selectRows('whatsapp_threads', 'select=*&id=eq.' + encodeURIComponent(session.thread_id) + '&limit=1');
  const thread = list?.[0] || null;
  if (!thread || !['lead', 'client'].includes(thread.contact_type) || assistantPhone(thread.phone) === ownerPhone() || isMetaSandboxSender(thread.phone)) {
    return { session, thread: null, context: null };
  }
  return { session, thread, context: await contextFor(thread, session.overrides || {}) };
}

function responseWithLink(draft, phone, title = 'RESPOSTA PREPARADA') {
  const link = customerWhatsAppLink(phone, draft);
  return title + '\n\n' + draft + '\n\n' +
    (link ? 'Abrir o cliente com o texto pronto:\n' + link + '\n\nConfira e toque em enviar no WhatsApp.' : 'Telefone do cliente inválido. Confira o cadastro.');
}

async function findCustomer(value) {
  const target = String(value || '').trim();
  const tail = target.replace(/\D/g, '');
  const filter = tail.length >= 8
    ? 'phone=ilike.*' + encodeURIComponent(tail.slice(-8)) + '*'
    : 'display_name=ilike.*' + encodeURIComponent(target.slice(0, 60)) + '*';
  const rows = await selectRows('whatsapp_threads', 'select=*&' + filter + '&order=updated_at.desc&limit=8');
  return (rows || []).filter(row => ['lead', 'client'].includes(row.contact_type) && assistantPhone(row.phone) !== ownerPhone() && !isMetaSandboxSender(row.phone));
}

async function assessSelectedThread(thread) {
  const [leads, byLead, byClient, messages] = await Promise.all([
    thread.lead_id ? selectRows('leads','select=id,status,next_action,lost_reason,internal_notes,updated_at&id=eq.'+encodeURIComponent(thread.lead_id)+'&limit=1') : [],
    thread.lead_id ? selectRows('service_orders','select=status,scheduled_for,completed_at,internal_notes,completion_notes,created_at&lead_id=eq.'+encodeURIComponent(thread.lead_id)+'&order=created_at.desc&limit=1') : [],
    thread.client_id ? selectRows('service_orders','select=status,scheduled_for,completed_at,internal_notes,completion_notes,created_at&client_id=eq.'+encodeURIComponent(thread.client_id)+'&order=created_at.desc&limit=1') : [],
    selectRows('whatsapp_messages','select=direction,body,message_type,created_at&thread_id=eq.'+encodeURIComponent(thread.id)+'&order=created_at.desc&limit=36')
  ]);
  const order=[...(byLead||[]),...(byClient||[])].sort((a,b)=>Date.parse(b.created_at||'')-Date.parse(a.created_at||''))[0]||{};
  return classifyCommercialFollowup({thread,lead:leads?.[0]||{},order,messages:messages||[]});
}

async function getPendingText() {
  const threads = await selectRows('whatsapp_threads',
    'select=id,phone,display_name,human_required,last_message_at,last_inbound_at,last_outbound_at,contact_type,lead_id,client_id&contact_type=in.(lead,client)&order=last_message_at.desc&limit=80');
  const allowed = (threads || []).filter(t => assistantPhone(t.phone) !== ownerPhone() && !isMetaSandboxSender(t.phone));
  if (!allowed.length) return 'Nenhum cliente comercial encontrado para triagem.';
  // Consultar o banco em blocos. Nunca utilizar apenas o horário da última mensagem.
  const leadIds = [...new Set(allowed.map(t=>t.lead_id).filter(Boolean))];
  const clientIds = [...new Set(allowed.map(t=>t.client_id).filter(Boolean))];
  const threadIds = allowed.map(t=>t.id);
  const safeIn = values => values.map(v=>String(v).replace(/[^a-zA-Z0-9-]/g,'')).filter(Boolean).join(',');
  const [leads, leadOrders, clientOrders, history] = await Promise.all([
    leadIds.length ? selectRows('leads','select=id,status,next_action,lost_reason,internal_notes,updated_at&id=in.(' + safeIn(leadIds) + ')&limit=100') : [],
    leadIds.length ? selectRows('service_orders','select=lead_id,client_id,status,scheduled_for,completed_at,internal_notes,completion_notes,created_at&lead_id=in.(' + safeIn(leadIds) + ')&order=created_at.desc&limit=150') : [],
    clientIds.length ? selectRows('service_orders','select=lead_id,client_id,status,scheduled_for,completed_at,internal_notes,completion_notes,created_at&client_id=in.(' + safeIn(clientIds) + ')&order=created_at.desc&limit=150') : [],
    selectRows('whatsapp_messages','select=thread_id,direction,body,message_type,created_at&thread_id=in.(' + safeIn(threadIds) + ')&order=created_at.desc&limit=1000')
  ]);
  const leadsById = new Map((leads||[]).map(x=>[x.id,x]));
  const ordersByLead = new Map();
  const ordersByClient = new Map();
  for(const order of [...(leadOrders||[]),...(clientOrders||[])].sort((a,b)=>Date.parse(b.created_at||'')-Date.parse(a.created_at||''))) {
    if(order.lead_id && !ordersByLead.has(order.lead_id)) ordersByLead.set(order.lead_id,order);
    if(order.client_id && !ordersByClient.has(order.client_id)) ordersByClient.set(order.client_id,order);
  }
  const messagesByThread = new Map();
  for(const msg of history||[]) {
    const list=messagesByThread.get(msg.thread_id)||[];
    if(list.length<36) list.push(msg);
    messagesByThread.set(msg.thread_id,list);
  }
  const assessed=allowed.map(t=>({
    thread:t,
    evaluation:classifyCommercialFollowup({
      thread:t,lead:leadsById.get(t.lead_id)||{},order:ordersByLead.get(t.lead_id)||ordersByClient.get(t.client_id)||{},
      messages:messagesByThread.get(t.id)||[]
    })
  }));
  const actionable=assessed.filter(x=>x.evaluation.priority>=2)
    .sort((a,b)=>b.evaluation.priority-a.evaluation.priority ||
      Date.parse(b.thread.last_message_at||'')-Date.parse(a.thread.last_message_at||'')).slice(0,8);
  const parked=assessed.filter(x=>['fora_area_ou_encerrado','visita_programada','visita_a_conferir','conclusao_a_conferir','pos_venda'].includes(x.evaluation.category));
  if(!actionable.length) {
    const visits=parked.filter(x=>['visita_programada','visita_a_conferir','conclusao_a_conferir'].includes(x.evaluation.category)).slice(0,5);
    return 'VALTEC — TRIAGEM\nNenhuma cobrança comercial imediata identificada.\n' +
      (visits.length ? '\nVISITAS/SERVIÇOS A CONFERIR:\n'+visits.map(x=>
        '• '+(x.thread.display_name||'Cliente')+' — '+x.evaluation.label+'\nATENDER '+assistantPhone(x.thread.phone)).join('\n')+'\n' : '') +
      '\nOutros estados separados: '+Math.max(0,parked.length-visits.length)+'. Nada foi enviado ao cliente.';
  }
  const out='VALTEC — RETORNOS PRIORITÁRIOS\n\n' + actionable.map((x,i)=>
    (i+1)+'. '+(x.thread.display_name||'Cliente')+'\n'+x.evaluation.label+
    '\nMotivo: '+x.evaluation.reason+'\nATENDER '+assistantPhone(x.thread.phone)
  ).join('\n\n');
  const visits=parked.filter(x=>['visita_programada','visita_a_conferir','conclusao_a_conferir'].includes(x.evaluation.category)).slice(0,3);
  const review=visits.length ? '\n\nVISITAS/SERVIÇOS A CONFERIR:\n'+visits.map(x=>
    '• '+(x.thread.display_name||'Cliente')+': '+x.evaluation.label+
    '\nATENDER '+assistantPhone(x.thread.phone)).join('\n') : '';
  return out + review + '\n\nDemais contatos separados da cobrança: ' +
    Math.max(0,parked.length-visits.length) + '.\nRevise o histórico antes de enviar. Nada foi disparado ao cliente.';
}

async function handleCommand(command) {
  if (command.type === 'help' || command.type === 'unknown') return ownerHelp;
  if (command.type === 'pending') return getPendingText();
  if (command.type === 'attend') {
    const matches = await findCustomer(command.value);
    if (!matches.length) return 'Não encontrei esse contato entre os clientes comerciais da Valtec. Confira o telefone.';
    if (matches.length > 1) return 'Encontrei mais de um contato. Selecione pelo telefone:\n' +
      matches.map(t => (t.display_name || 'Cliente') + ': ATENDER ' + assistantPhone(t.phone)).join('\n');
    const thread = matches[0];
    const context = await contextFor(thread);
    const assessment = await assessSelectedThread(thread);
    const needsReview = ['visita_programada','visita_a_conferir','conclusao_a_conferir','pos_venda','fora_area_ou_encerrado','audio_a_revisar','midia_a_revisar'].includes(assessment.category);
    const draft = needsReview ? '' : (assessment.draft || safeCustomerDraft(context));
    await saveSession({ thread_id: thread.id, draft, overrides: {} });
    const summary = 'ATENDIMENTO SELECIONADO: ' + context.name +
      '\nSituação: ' + assessment.label +
      '\nMotivo: ' + assessment.reason +
      '\nEquipamento: ' + (context.equipment || 'Não informado') +
      '\nDefeito relatado: ' + (context.issue || 'Não informado') +
      (context.evidenceSource ? '\nFonte: ' + context.evidenceSource : '') +
      '\nBairro: ' + (context.neighborhood || 'Não informado');
    if (needsReview) return summary +
      '\n\nREVISÃO DO TÉCNICO NECESSÁRIA. Sem nova mensagem sugerida para evitar contato indevido.' +
      '\n' + (assessment.action || 'Verificar histórico e a situação do serviço.') +
      '\nSe desejar preparar outra mensagem, use TEXTO: [mensagem completa].';
    return summary + '\n\n' + responseWithLink(draft,thread.phone);
  }

  const selected = await getSelected();
  if (!selected.thread) return 'Primeiro escolha um cliente com ATENDER 55719XXXXXXXX ou envie PENDENTES.\n\n' + ownerHelp;

  if (command.type === 'record') {
    const document = composeServiceRecord(selected.context);
    return responseWithLink(document, selected.thread.phone, 'FICHA DE ATENDIMENTO — RASCUNHO (NÃO É ORÇAMENTO)');
  }
  if (command.type === 'open') {
    if (!selected.session?.draft) return 'Nenhuma mensagem foi preparada para este atendimento. Verifique a visita ou conclusão e, se necessário, envie TEXTO: [mensagem completa].';
    return responseWithLink(selected.session.draft,selected.thread.phone);
  }
  if (command.type === 'replace') {
    if (!command.value || command.value.length < 3) return 'Informe o texto completo após TEXTO:.';
    await saveSession({ draft: command.value });
    return responseWithLink(command.value, selected.thread.phone, 'TEXTO ATUALIZADO');
  }
  if (command.type === 'photo' || command.type === 'field') {
    const overrides = { ...(selected.session?.overrides || {}) };
    if (command.type === 'photo') overrides.requestPhoto = true;
    else overrides[command.field] = command.value;
    const context = await contextFor(selected.thread, overrides);
    const draft = safeCustomerDraft(context);
    await saveSession({ overrides, draft });
    return responseWithLink(draft, selected.thread.phone, 'RESPOSTA CORRIGIDA');
  }
  return 'Não consegui interpretar a correção sem arriscar alterar informações. Use AJUSTAR: pedir foto, AJUSTAR: equipamento: [nome] ou TEXTO: [mensagem completa].';
}

export async function handlePrivateOwnerMessage(value, message) {
  if (!isPrivateOwnerWebhook(value)) return;
  if (!isOwner(message)) return; // Recusa silenciosa a qualquer outro número.
  if (!message?.id) return;
  try {
    await insertRow('whatsapp_assistant_commands', {
      provider_message_id: String(message.id),
      operator_phone: ownerPhone()
    });
  } catch (err) {
    if (/23505|duplicate key|conflict/i.test(String(err?.message || err))) return;
    throw err;
  }
  const input = message.type === 'text' ? message?.text?.body || '' : '';
  const reply = input ? await handleCommand(parseOwnerCommand(input)) :
    'Recebi seu arquivo, mas por enquanto os comandos do assistente precisam ser escritos em texto.\n\n' + ownerHelp;
  await sendOwner(reply);
}

export async function notifyOwnerAboutCustomer(value, message, thread) {
  if (!enabled()) return;
  if (String(value?.metadata?.phone_number_id || '') !== commercialPhoneId()) return;
  if (!message?.id || !thread?.id || !['lead','client'].includes(thread.contact_type)) return;
  if (assistantPhone(thread.phone) === ownerPhone() || isMetaSandboxSender(thread.phone) || isMetaSandboxSender(message?.from)) return;
  if (!['text','image','audio','document','video'].includes(message?.type)) return;
  // Evita avisos repetidos e limita os alertas normais a um por cliente a cada 15 minutos.
  const recent = await selectRows('whatsapp_assistant_notices',
    'select=sent_at&thread_id=eq.' + encodeURIComponent(thread.id) + '&status=eq.sent&order=sent_at.desc&limit=1');
  const lastSent = Date.parse(recent?.[0]?.sent_at || '') || 0;
  if (!thread.human_required && Date.now() - lastSent < 15 * 60 * 1000) return;
  try {
    await insertRow('whatsapp_assistant_notices', {
      provider_message_id: String(message.id),
      thread_id: thread.id,
      status: 'pending'
    });
  } catch (err) {
    if (/23505|duplicate key|conflict/i.test(String(err?.message || err))) return;
    throw err;
  }
  const context = await contextFor(thread);
  const draft = safeCustomerDraft(context);
  const incoming = message.type === 'text' ? String(message?.text?.body || '').slice(0, 300) :
    '[Cliente enviou ' + message.type + ']';
  const notification = '🔔 VALTEC — CLIENTE AGUARDANDO\n' +
    'Cliente: ' + context.name + '\n' +
    'Telefone: ' + assistantPhone(thread.phone) + '\n' +
    'Equipamento: ' + (context.equipment || 'Não informado') + '\n' +
    'Defeito: ' + (context.issue || 'Não informado') + '\n' +
    'Bairro: ' + (context.neighborhood || 'Não informado') + '\n' +
    'Última mensagem: ' + incoming + '\n\n' +
    responseWithLink(draft, thread.phone) + '\n\nPara alterar: ATENDER ' + assistantPhone(thread.phone);
  try {
    await sendOwner(notification);
    await updateRows('whatsapp_assistant_notices', 'provider_message_id=eq.' + encodeURIComponent(message.id),
      { status: 'sent', sent_at: now() });
  } catch (err) {
    await updateRows('whatsapp_assistant_notices', 'provider_message_id=eq.' + encodeURIComponent(message.id),
      { status: 'failed' }).catch(() => {});
    console.warn('Assistente privado Valtec: aviso não enviado; verificar janela de atendimento ou credenciais.', err?.message);
  }
}
