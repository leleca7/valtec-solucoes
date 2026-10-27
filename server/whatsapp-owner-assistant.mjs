// Canal privado e opt-in do proprietário. Totalmente separado do WhatsApp comercial.
// Proteções: destinatário único autorizado, remetente TESTE explícito, sem autoenviar para clientes.
import { env, selectRows, insertRow, updateRows } from './whatsapp-lib.mjs';
import { assistantPhone, customerWhatsAppLink, safeCustomerDraft, composeServiceRecord, parseOwnerCommand, ownerHelp, isMetaSandboxSender } from './whatsapp-owner-assistant-core.mjs';
import { triageCase, leadEvidence, known } from './whatsapp-commercial-priority.mjs';

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

async function recentHistory(threadId) {
  const rows = await selectRows('whatsapp_messages',
    'select=direction,body,transcript,message_type,created_at&thread_id=eq.' +
      encodeURIComponent(threadId) + '&order=created_at.desc&limit=40');
  return (rows || []).map(row => ({...row, body: row.body || row.transcript || ''})).reverse();
}
async function ordersFor(thread) {
  const queries = [];
  if (thread.lead_id) queries.push('select=status,scheduled_for,completed_at,review_requested_at,created_at&lead_id=eq.' + encodeURIComponent(thread.lead_id) + '&limit=8');
  if (thread.client_id) queries.push('select=status,scheduled_for,completed_at,review_requested_at,created_at&client_id=eq.' + encodeURIComponent(thread.client_id) + '&limit=8');
  const rows = await Promise.all(queries.map(q => selectRows('service_orders',q).catch(()=>[])));
  return rows.flat();
}
async function contextFor(thread, overrides = {}, history = null, leadRow = null) {
  let lead = leadRow;
  let client = null;
  if (!lead && thread.lead_id) {
    const rows = await selectRows('leads', 'select=customer_name,phone,equipment,problems,description,neighborhood,status,next_action,next_action_at&' +
      'id=eq.' + encodeURIComponent(thread.lead_id) + '&limit=1');
    lead = rows?.[0] || null;
  }
  if (thread.client_id && !lead) {
    const rows = await selectRows('clients', 'select=name,phone,equipment_notes,neighborhood&id=eq.' + encodeURIComponent(thread.client_id) + '&limit=1');
    client = rows?.[0] || null;
  }
  const messages = history || await recentHistory(thread.id);
  const evidence = leadEvidence(messages);
  const problems = Array.isArray(lead?.problems) ? lead.problems : [];
  return {
    name: known(lead?.customer_name) || known(client?.name) || thread.display_name || 'Cliente',
    phone: thread.phone,
    equipment: known(overrides.equipment) || known(lead?.equipment) || known(client?.equipment_notes) || '',
    issue: known(overrides.issue) || known(problems.find(known)) || known(lead?.description) || evidence.problem || '',
    neighborhood: known(overrides.neighborhood) || known(lead?.neighborhood) || known(client?.neighborhood) || evidence.area || '',
    requestPhoto: Boolean(overrides.requestPhoto),
    lead: lead || {}, history: messages
  };
}
async function triageSelected(thread, overrides = {}) {
  const ctx = await contextFor(thread, overrides);
  const orders = await ordersFor(thread);
  const outcome = triageCase({ thread, lead: ctx.lead, messages: ctx.history, orders });
  return {context: ctx, outcome};
}
function draftForCase(context, outcome) {
  if (['fora_area','concluido','encerrado','aguardar_cliente','visita'].includes(outcome.kind)) return '';
  if (outcome.draft) return outcome.draft;
  if (outcome.kind === 'alinhar_visita') return 'Olá! Vi as informações do seu endereço. Vou conferir os detalhes da visita antes de confirmar o atendimento.';
  if (outcome.kind === 'confirmar_conclusao') return '';
  if (outcome.kind === 'revisar_midia') return '';
  return safeCustomerDraft(context);
}
async function getSelected() {
  const session = await getSession();
  if (!session?.thread_id) return { session, thread: null, context: null };
  const list = await selectRows('whatsapp_threads', 'select=*&id=eq.' + encodeURIComponent(session.thread_id) + '&limit=1');
  const thread = list?.[0] || null;
  if (!thread || !['lead', 'client'].includes(thread.contact_type) || assistantPhone(thread.phone) === ownerPhone() || isMetaSandboxSender(thread.phone)) {
    return { session, thread: null, context: null };
  }
  return { session, thread, ...(await triageSelected(thread, session.overrides || {})) };
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

async function getPendingText() {
  // Apenas leitura; não altera lead.status, next_action nem agendamentos do outro fluxo.
  const threads = await selectRows('whatsapp_threads',
    'select=id,phone,display_name,lead_id,client_id,human_required,human_reason,last_message_at,last_outbound_at,contact_type&contact_type=in.(lead,client)&order=last_message_at.desc&limit=80');
  const safe = (threads || []).filter(t => assistantPhone(t.phone) !== ownerPhone() && !isMetaSandboxSender(t.phone));
  if (!safe.length) return 'Nenhum atendimento comercial cadastrado para conferir.';
  const threadIds = safe.map(x=>x.id);
  const leadIds = [...new Set(safe.map(x=>x.lead_id).filter(Boolean))];
  const clientIds = [...new Set(safe.map(x=>x.client_id).filter(Boolean))];
  const list = (ids) => '(' + ids.join(',') + ')';
  const queries = [
    selectRows('whatsapp_messages', 'select=thread_id,direction,body,transcript,message_type,created_at&thread_id=in.'+list(threadIds)+'&order=created_at.desc&limit=1000'),
    leadIds.length ? selectRows('leads','select=id,status,next_action,next_action_at&id=in.'+list(leadIds)+'&limit=100') : Promise.resolve([]),
    leadIds.length ? selectRows('service_orders','select=lead_id,client_id,status,scheduled_for,completed_at,review_requested_at&lead_id=in.'+list(leadIds)+'&limit=100') : Promise.resolve([]),
    clientIds.length ? selectRows('service_orders','select=lead_id,client_id,status,scheduled_for,completed_at,review_requested_at&client_id=in.'+list(clientIds)+'&limit=100') : Promise.resolve([])
  ];
  const [messages, leads, byLead, byClient] = await Promise.all(queries);
  const grouped = new Map();
  for (const msg of (messages||[])) {
    const list = grouped.get(msg.thread_id) || [];
    if (list.length < 25) list.push({...msg,body:msg.body||msg.transcript||''});
    grouped.set(msg.thread_id,list);
  }
  const leadMap = new Map((leads||[]).map(l=>[l.id,l]));
  const evaluations = safe.map(thread => {
    const msgs = (grouped.get(thread.id)||[]).reverse();
    const related = [...(byLead||[]),...(byClient||[])].filter(o =>
      (thread.lead_id && o.lead_id === thread.lead_id) || (thread.client_id && o.client_id === thread.client_id));
    return {thread, outcome:triageCase({thread, lead:leadMap.get(thread.lead_id)||{},messages:msgs,orders:related})};
  });
  const actionable = evaluations.filter(x=>x.outcome.priority < 70).sort((a,b)=>a.outcome.priority - b.outcome.priority ||
    (Date.parse(a.thread.last_message_at||'') - Date.parse(b.thread.last_message_at||'')));
  const display = actionable.slice(0,8);
  const counts = (kinds) => evaluations.filter(x=>kinds.includes(x.outcome.kind)).length;
  if (!display.length) return 'VALTEC — ANÁLISE DOS ATENDIMENTOS\n\nNenhuma resposta comercial urgente identificada entre os contatos consultados.\n' +
    'Agendados: ' + counts(['visita','alinhar_visita']) +
    ' | Fora da área: ' + counts(['fora_area']) +
    ' | Concluídos/confirmar: ' + counts(['concluido','confirmar_conclusao']) +
    ' | Aguardar cliente: ' + counts(['aguardar_cliente','aguardar_orcamento']) +
    '\n\nUse ATENDER + telefone para revisar um caso.';
  return 'VALTEC — PRIORIDADES PARA CONFERIR\n\n' + display.map((x,i)=>
    (i+1)+'. '+(x.thread.display_name||'Cliente')+' — '+x.outcome.label+
    '\n'+x.outcome.reason+'\nATENDER '+assistantPhone(x.thread.phone)
  ).join('\n\n')+
  '\n\nRESUMO: '+actionable.length+' para revisão/retorno; '+
  counts(['visita','alinhar_visita'])+' com visita; '+
  counts(['fora_area'])+' fora da área; '+
  counts(['concluido','confirmar_conclusao'])+' concluídos ou a confirmar; '+
  counts(['aguardar_cliente','aguardar_orcamento'])+' aguardando cliente.'+
  '\n\nNenhum contato será enviado automaticamente.';
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
    const {context,outcome} = await triageSelected(thread);
    const draft = draftForCase(context,outcome);
    await saveSession({ thread_id: thread.id, draft, overrides: {} });
    return 'ATENDIMENTO SELECIONADO: ' + context.name +
      '\nSituação: ' + outcome.label +
      '\nMotivo: ' + outcome.reason +
      '\nEquipamento: ' + (context.equipment || 'Não informado') +
      '\nDefeito relatado: ' + (context.issue || 'Não informado') +
      '\nBairro: ' + (context.neighborhood || 'Não informado') + '\n\n' +
      (draft ? responseWithLink(draft, thread.phone) :
        'Não sugeri uma nova mensagem comercial para este caso. Confira o histórico e, se for necessário, use TEXTO: [mensagem revisada].');
  }

  const selected = await getSelected();
  if (!selected.thread) return 'Primeiro escolha um cliente com ATENDER 55719XXXXXXXX ou envie PENDENTES.\n\n' + ownerHelp;

  if (command.type === 'record') {
    const document = composeServiceRecord(selected.context);
    return responseWithLink(document, selected.thread.phone, 'FICHA DE ATENDIMENTO — RASCUNHO (NÃO É ORÇAMENTO)');
  }
  if (command.type === 'open') {
    const draft = selected.session?.draft || draftForCase(selected.context, selected.outcome);
    return draft ? responseWithLink(draft, selected.thread.phone) : 'Este atendimento está marcado como ' + selected.outcome.label +
      '. Sem resposta comercial sugerida. Use TEXTO: [mensagem completa] se desejar preparar uma exceção.';
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
