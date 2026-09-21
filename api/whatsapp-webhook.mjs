import {
  env,
  normalizeText,
  getOrCreateThread,
  saveInbound,
  saveOutbound,
  selectRows,
  updateRows,
  sendWhatsAppText,
  previewForMessage,
  persistWhatsAppMedia,
  readRawBody,
  verifyMetaSignature,
  findServiceArea,
  json
} from '../server/whatsapp-lib.mjs';
import {
  cleanKnown,
  parseStructuredFields,
  inferIntent,
  missingLeadFields,
  extractFacts,
  mergeLeadFacts,
  problemSummary,
  contextSnapshot,
  isGreeting,
  isSkipMedia
} from '../server/whatsapp-intelligence.mjs';
import { isStaffWhatsAppPhone, handleStaffEvidenceMessage } from '../server/whatsapp-staff-evidence.mjs';

const HUMAN_SAFETY_REPLY = 'Por segurança, esse tipo de situação precisa ser avaliado por um profissional. Já encaminhei seu atendimento para a equipe da Valtec. Se houver cheiro forte de gás, chama fora do normal ou risco imediato, interrompa o uso do equipamento e mantenha fontes de ignição afastadas.';
const HUMAN_PRICE_REPLY = 'Para te passar um valor correto, a equipe precisa considerar o equipamento e o serviço necessário. Já deixei sua conversa para um profissional da Valtec continuar por aqui.';
const AUDIO_REPLY = 'Recebi seu áudio. Você não precisa escrever tudo de novo — o áudio ficou salvo no atendimento e encaminhei para um profissional da Valtec continuar por aqui.';

function queryValue(req, key) {
  if (req.query && req.query[key] !== undefined) return String(req.query[key]);
  try { return new URL(req.url, 'https://valtec.local').searchParams.get(key) || ''; } catch { return ''; }
}

function isSafetyText(body) {
  const n = normalizeText(body);
  return /cheiro de gas|vazamento|vazando gas|explos|incend|faisca|fumaca|monoxido|pegando fogo|risco imediato/.test(n);
}

function isPriceText(body) {
  const n = normalizeText(body);
  return /quanto custa|qual o valor|preco da peca|valor da peca|quanto fica|quanto e/.test(n);
}

function guessNeighborhoodFromAreaQuestion(body) {
  const raw = String(body || '').trim().replace(/[?!.]+$/g, '');
  const match = raw.match(/atend(?:e|em|emos)\s+(?:no|na|em|o bairro|a regiao de|a região de|bairro)?\s*(.+)$/i);
  return String(match?.[1] || '').trim();
}

async function markHuman(thread, reason) {
  const now = new Date().toISOString();
  const rows = await updateRows('whatsapp_threads', `id=eq.${encodeURIComponent(thread.id)}`, {
    status: 'human',
    human_required: true,
    human_reason: reason,
    workflow_step: 'human',
    updated_at: now
  });
  if (thread.lead_id) {
    await updateRows('leads', `id=eq.${encodeURIComponent(thread.lead_id)}`, {
      status: 'triagem',
      next_action: 'Continuar atendimento humano pelo WhatsApp',
      next_action_at: now,
      updated_at: now
    });
  }
  return rows?.[0] || { ...thread, status: 'human', human_required: true, human_reason: reason, workflow_step: 'human' };
}

async function loadLead(thread) {
  if (!thread?.lead_id) return null;
  const rows = await selectRows('leads', `select=*&id=eq.${encodeURIComponent(thread.lead_id)}&limit=1`);
  return rows?.[0] || null;
}

function leadPatchFromFacts(facts = {}) {
  const patch = {};
  if (facts.customer_name) patch.customer_name = facts.customer_name;
  if (facts.equipment) patch.equipment = facts.equipment;
  if (facts.problem) {
    patch.problems = [facts.problem];
    patch.description = facts.description || facts.problem;
  } else if (facts.description) {
    patch.description = facts.description;
  }
  if (facts.neighborhood) patch.neighborhood = facts.neighborhood;
  if (facts.address) patch.address = facts.address;
  if (facts.reference_point) patch.reference_point = facts.reference_point;
  return patch;
}

async function applyFacts(thread, lead, facts) {
  if (!lead || !thread?.lead_id) return lead;
  const patch = leadPatchFromFacts(facts);
  if (!Object.keys(patch).length) return lead;
  patch.status = lead.status === 'novo' ? 'triagem' : lead.status;
  patch.next_action = 'Concluir triagem pelo WhatsApp';
  patch.next_action_at = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  patch.updated_at = new Date().toISOString();
  const rows = await updateRows('leads', `id=eq.${encodeURIComponent(thread.lead_id)}`, patch);
  return rows?.[0] || mergeLeadFacts(lead, facts);
}

async function saveConversationContext(thread, lead, intent, {
  facts = {},
  mediaRequested = false,
  workflowStep = '',
  messageType = 'text'
} = {}) {
  const previous = thread?.conversation_context && typeof thread.conversation_context === 'object' ? thread.conversation_context : {};
  const snapshot = contextSnapshot({
    lead: lead || {},
    intent,
    mediaRequested: mediaRequested || previous.media_requested,
    origin: facts.source_hint || lead?.source || previous.origin || 'whatsapp'
  });
  const context = {
    ...previous,
    ...snapshot,
    last_facts: facts,
    last_message_type: messageType,
    updated_at: new Date().toISOString()
  };
  const patch = {
    conversation_context: context,
    last_intent: intent,
    context_updated_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  if (workflowStep) patch.workflow_step = workflowStep;
  const rows = await updateRows('whatsapp_threads', `id=eq.${encodeURIComponent(thread.id)}`, patch);
  return rows?.[0] || { ...thread, ...patch };
}

async function markMessageProcessed(messageRow, facts, status = 'processed') {
  if (!messageRow?.id) return;
  await updateRows('whatsapp_messages', `id=eq.${encodeURIComponent(messageRow.id)}`, {
    extracted_facts: facts || {},
    processing_status: status
  }).catch(() => {});
}

function nextQuestion(lead, missing) {
  const next = missing?.[0];
  if (next === 'equipment') {
    return 'Me conta qual é o equipamento que está com problema. Pode escrever do seu jeito, por exemplo: fogão, cooktop ou forno.';
  }
  if (next === 'problem') {
    const equipment = cleanKnown(lead?.equipment);
    return equipment
      ? `Entendi, é um ${equipment.toLowerCase()}. O que está acontecendo com ele? Pode escrever do seu jeito.`
      : 'O que está acontecendo com o equipamento? Pode escrever do seu jeito.';
  }
  if (next === 'neighborhood') return 'Certo. Qual é o bairro do atendimento?';
  return '';
}

function knownSummary(lead) {
  const pieces = [];
  if (cleanKnown(lead?.equipment)) pieces.push(cleanKnown(lead.equipment));
  if (problemSummary(lead)) pieces.push(problemSummary(lead));
  if (cleanKnown(lead?.neighborhood)) pieces.push(cleanKnown(lead.neighborhood));
  return pieces.join(' • ');
}

async function decideBotReply({ thread, created, inbound }) {
  const extracted = inbound.extracted;
  const body = extracted.body || '';
  let lead = await loadLead(thread) || {};
  const beforeMissing = missingLeadFields(lead);
  const intent = inferIntent(body);
  const structured = parseStructuredFields(body);
  let facts = extractFacts({ text: body, expectedField: beforeMissing[0] || '' });

  if (intent === 'service_area' && !facts.neighborhood) {
    const neighborhood = guessNeighborhoodFromAreaQuestion(body);
    if (neighborhood) facts = { ...facts, neighborhood };
  }

  lead = await applyFacts(thread, lead, facts) || lead;
  const missing = missingLeadFields(lead);
  await markMessageProcessed(inbound.row, facts, 'processed');

  if (thread.status === 'human' || thread.human_required) {
    await saveConversationContext(thread, lead, intent, { facts, messageType: extracted.type, workflowStep: 'human' });
    return { reply: '', thread, lead };
  }

  if (isSafetyText(body)) {
    const next = await markHuman(thread, 'Situação potencialmente relacionada a segurança/gás.');
    await markMessageProcessed(inbound.row, facts, 'needs_human');
    await saveConversationContext(next, lead, intent, { facts, messageType: extracted.type, workflowStep: 'human' });
    return { reply: HUMAN_SAFETY_REPLY, thread: next, lead };
  }

  if (isPriceText(body)) {
    const next = await markHuman(thread, 'Cliente pediu preço técnico/valor de serviço.');
    await markMessageProcessed(inbound.row, facts, 'needs_human');
    await saveConversationContext(next, lead, intent, { facts, messageType: extracted.type, workflowStep: 'human' });
    return { reply: HUMAN_PRICE_REPLY, thread: next, lead };
  }

  if (intent === 'human') {
    const next = await markHuman(thread, 'Cliente pediu atendimento humano.');
    await markMessageProcessed(inbound.row, facts, 'needs_human');
    await saveConversationContext(next, lead, intent, { facts, messageType: extracted.type, workflowStep: 'human' });
    return { reply: 'Certo. Sua conversa foi encaminhada para um profissional da Valtec, que continuará o atendimento por aqui.', thread: next, lead };
  }

  if (intent === 'quote_followup') {
    const next = await markHuman(thread, 'Cliente quer acompanhar orçamento.');
    await markMessageProcessed(inbound.row, facts, 'needs_human');
    await saveConversationContext(next, lead, intent, { facts, messageType: extracted.type, workflowStep: 'human' });
    return { reply: 'Certo. Já deixei sua conversa para a equipe verificar o orçamento e continuar com você por aqui.', thread: next, lead };
  }

  if (extracted.type === 'audio') {
    const next = await markHuman(thread, 'Áudio recebido para escuta e continuidade humana.');
    await markMessageProcessed(inbound.row, facts, 'needs_human');
    await saveConversationContext(next, lead, intent, { facts, messageType: extracted.type, workflowStep: 'human' });
    return { reply: AUDIO_REPLY, thread: next, lead };
  }

  if (intent === 'service_area') {
    const neighborhood = cleanKnown(lead?.neighborhood) || facts.neighborhood || '';
    if (!neighborhood) {
      const next = await saveConversationContext(thread, lead, intent, { facts, messageType: extracted.type, workflowStep: 'neighborhood' });
      return { reply: 'Claro. Me diga o bairro e eu verifico o atendimento.', thread: next, lead };
    }
    const area = await findServiceArea(neighborhood);
    if (area) {
      const next = await saveConversationContext(thread, lead, intent, { facts, messageType: extracted.type, workflowStep: missing[0] || 'context' });
      return { reply: `Sim, atendemos ${area.neighborhood}. Se você já quiser solicitar o atendimento, pode me contar o que aconteceu com o equipamento.`, thread: next, lead };
    }
    const next = await markHuman(thread, `Bairro precisa de confirmação: ${neighborhood}`);
    await saveConversationContext(next, lead, intent, { facts, messageType: extracted.type, workflowStep: 'human' });
    return { reply: `Vou confirmar o atendimento em ${neighborhood} com a equipe antes de te prometer disponibilidade. Já encaminhei sua conversa.`, thread: next, lead };
  }

  if (['image', 'video'].includes(extracted.type)) {
    if (!missing.length) {
      const next = await markHuman(thread, `${extracted.type === 'image' ? 'Foto' : 'Vídeo'} recebido com triagem completa.`);
      await markMessageProcessed(inbound.row, facts, 'needs_human');
      await saveConversationContext(next, lead, intent, { facts, messageType: extracted.type, workflowStep: 'human' });
      return { reply: 'Perfeito. Já tenho as informações e a mídia do equipamento. Encaminhei tudo organizado para um profissional da Valtec continuar por aqui.', thread: next, lead };
    }
    const next = await saveConversationContext(thread, lead, intent, { facts, messageType: extracted.type, workflowStep: missing[0] });
    return { reply: `${nextQuestion(lead, missing)} A foto/vídeo já ficou salvo, então não precisa enviar novamente.`, thread: next, lead };
  }

  if (missing.length) {
    const allMissing = missing.length === 3;
    const reply = allMissing && (created || isGreeting(body) || intent === 'unknown')
      ? 'Oi! Me conta o que aconteceu com seu equipamento. Pode escrever do seu jeito — se preferir, também pode mandar áudio, foto ou vídeo.'
      : nextQuestion(lead, missing);
    const next = await saveConversationContext(thread, lead, intent, { facts, messageType: extracted.type, workflowStep: missing[0] });
    return { reply, thread: next, lead };
  }

  if (lead?.media_path || isSkipMedia(body)) {
    const next = await markHuman(thread, lead?.media_path ? 'Triagem completa com mídia já recebida pelo site.' : 'Triagem completa sem mídia adicional.');
    await saveConversationContext(next, lead, intent, { facts, messageType: extracted.type, workflowStep: 'human' });
    return { reply: 'Pronto. Já tenho as informações necessárias e encaminhei o atendimento organizado para um profissional da Valtec continuar por aqui.', thread: next, lead };
  }

  const previousContext = thread?.conversation_context && typeof thread.conversation_context === 'object' ? thread.conversation_context : {};
  if (previousContext.media_requested) {
    const next = await saveConversationContext(thread, lead, intent, { facts, mediaRequested: true, messageType: extracted.type, workflowStep: 'media' });
    return { reply: 'Se puder, envie uma foto ou vídeo do equipamento. Se não tiver, pode escrever “seguir” e eu continuo sem mídia.', thread: next, lead };
  }

  const summary = knownSummary(lead);
  const intro = structured.siteStructured || lead?.source === 'site'
    ? 'Recebi os dados que você já preencheu no site, então não vou perguntar tudo de novo.'
    : 'Perfeito, já organizei as informações do seu atendimento.';
  const next = await saveConversationContext(thread, lead, intent, { facts, mediaRequested: true, messageType: extracted.type, workflowStep: 'media' });
  return {
    reply: `${intro}${summary ? `\n\n${summary}` : ''}\n\nSe puder, envie uma foto ou vídeo do equipamento. Se não tiver, pode escrever “seguir”.`,
    thread: next,
    lead
  };
}

async function updateThreadAfterInbound(thread, extracted, positive) {
  const now = new Date().toISOString();
  const rows = await updateRows('whatsapp_threads', `id=eq.${encodeURIComponent(thread.id)}`, {
    unread_count: Number(thread.unread_count || 0) + 1,
    positive_signal: Boolean(thread.positive_signal || positive),
    last_message_preview: previewForMessage(extracted),
    last_message_at: now,
    last_inbound_at: now,
    updated_at: now
  });
  await updateRows('whatsapp_automation_jobs', `thread_id=eq.${encodeURIComponent(thread.id)}&kind=in.(followup_1d,followup_3d)&status=in.(pending,processing)`, {
    status: 'cancelled',
    updated_at: now
  }).catch(() => {});
  return rows?.[0] || { ...thread, positive_signal: Boolean(thread.positive_signal || positive), last_inbound_at: now };
}

async function persistInboundMedia(thread, inbound) {
  if (!inbound?.extracted?.mediaId || !inbound?.row?.id) return;
  try {
    const path = await persistWhatsAppMedia({
      mediaId: inbound.extracted.mediaId,
      threadId: thread.id,
      messageId: inbound.row.provider_message_id || inbound.row.id
    });
    if (!path) return;
    await updateRows('whatsapp_messages', `id=eq.${encodeURIComponent(inbound.row.id)}`, { media_path: path });
    if (thread.lead_id) await updateRows('leads', `id=eq.${encodeURIComponent(thread.lead_id)}`, { media_path: path, updated_at: new Date().toISOString() });
  } catch (error) {
    console.error('Valtec WhatsApp: falha ao persistir mídia', error?.message || error);
  }
}

async function handleInbound(value, message) {
  const phone = message?.from;
  if (!phone) return;
  if (isStaffWhatsAppPhone(phone)) {
    await handleStaffEvidenceMessage({ value, message });
    return;
  }
  const contact = (value?.contacts || []).find((item) => item?.wa_id === phone) || value?.contacts?.[0];
  const name = contact?.profile?.name || 'Cliente WhatsApp';
  const { thread: initialThread, created } = await getOrCreateThread({ phone, name });
  const inbound = await saveInbound({ thread: initialThread, message, rawPayload: message });
  if (inbound.duplicate) return;

  let thread = await updateThreadAfterInbound(initialThread, inbound.extracted, inbound.positive);
  await persistInboundMedia(thread, inbound);

  const decision = await decideBotReply({ thread, created, inbound });
  thread = decision.thread || thread;
  if (!decision.reply) return;

  try {
    const providerMessageId = await sendWhatsAppText(thread.phone, decision.reply);
    await saveOutbound({ threadId: thread.id, providerMessageId, body: decision.reply });
    const now = new Date().toISOString();
    await updateRows('whatsapp_threads', `id=eq.${encodeURIComponent(thread.id)}`, {
      last_message_preview: decision.reply.slice(0, 180),
      last_message_at: now,
      last_outbound_at: now,
      updated_at: now
    });
  } catch (error) {
    console.error('Valtec WhatsApp: mensagem recebida e salva, mas resposta automática falhou', error?.message || error);
    await updateRows('whatsapp_threads', `id=eq.${encodeURIComponent(thread.id)}`, {
      human_required: true,
      human_reason: 'Falha ao enviar resposta automática pelo WhatsApp',
      updated_at: new Date().toISOString()
    }).catch(() => {});
  }
}

async function handleStatuses(statuses = []) {
  const accepted = new Set(['sent', 'delivered', 'read', 'failed']);
  for (const status of statuses) {
    if (!status?.id || !accepted.has(status.status)) continue;
    await updateRows('whatsapp_messages', `provider_message_id=eq.${encodeURIComponent(status.id)}`, {
      delivery_status: status.status
    }).catch(() => {});
  }
}

async function handler(req, res) {
  if (req.method === 'GET') {
    const mode = queryValue(req, 'hub.mode');
    const token = queryValue(req, 'hub.verify_token');
    const challenge = queryValue(req, 'hub.challenge');
    if (mode === 'subscribe') {
      const configuredToken = env('WHATSAPP_VERIFY_TOKEN');
      if (!configuredToken) {
        return json(res, 503, { error: 'Webhook ainda não configurado.', missing: 'WHATSAPP_VERIFY_TOKEN' });
      }
      if (token && token === configuredToken) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.end(challenge);
      }
    }
    return json(res, 403, { error: 'Falha na verificação do webhook.' });
  }

  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' });

  try {
    const rawBody = await readRawBody(req);
    if (!verifyMetaSignature(rawBody, req.headers['x-hub-signature-256'])) {
      return json(res, 401, { error: 'Assinatura do webhook inválida.' });
    }
    const payload = JSON.parse(rawBody.toString('utf8'));
    const tasks = [];
    for (const entry of payload?.entry || []) {
      for (const change of entry?.changes || []) {
        const value = change?.value || {};
        if (value.statuses?.length) tasks.push(handleStatuses(value.statuses));
        for (const message of value.messages || []) tasks.push(handleInbound(value, message));
      }
    }
    await Promise.all(tasks);
    return json(res, 200, { received: true });
  } catch (error) {
    console.error('Valtec WhatsApp webhook:', error);
    return json(res, 500, { error: 'Falha ao processar webhook.', detail: error?.message || String(error) });
  }
}

export default handler;
