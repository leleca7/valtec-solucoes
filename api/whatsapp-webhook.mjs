import {
  env,
  normalizeText,
  getOrCreateThread,
  normalizePhone,
  createLead,
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
import { isMetaClickToWhatsAppAd } from '../server/whatsapp-ad-referral.mjs';
import { extractBusinessAppEchoes, feedbackSignal, canTrackBusinessAppEcho, echoSentAt } from '../server/whatsapp-coexistence.mjs';
import { canAutoReplyInTest } from '../server/whatsapp-test-guard.mjs';
import { evaluateCommercialPilot, canRegisterCommercialLead } from '../server/whatsapp-commercial-pilot-guard.mjs';
import { metaDeliveryFailure, isLatestUndeliveredReply } from '../server/whatsapp-delivery-status.mjs';
import { intakeWelcomeMessage, isGenericInterest, isAdTemplateGreeting, extractIntakeForm, nextIntakeQuestion, intakeDoneMessage } from '../scripts/whatsapp-intake.mjs';

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

function nextQuestion(_lead, missing) {
  return nextIntakeQuestion(missing);
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
  const intent = inferIntent(body);
  const structured = parseStructuredFields(body);
  const contactType = String(thread.contact_type || 'unknown');
  const replyMode = String(thread.auto_reply_mode || 'commercial_only');
  const tester = contactType === 'tester' || canAutoReplyInTest({
    phone: thread.phone, contactType, autoReplyMode: replyMode,
    enabled: env('VALTEC_WHATSAPP_AUTO_REPLY_ENABLED'),
    allowedPhones: env('VALTEC_WHATSAPP_AUTO_REPLY_TEST_PHONES')
  });
  const fromMetaAd = isMetaClickToWhatsAppAd(inbound?.row?.raw_payload?.referral);
  // A user-written structured message or prefilled WhatsApp text is NOT proof of site origin.
  // Only trusted Meta referral metadata or an owner/server-set classification source is trusted.
  const siteOriginVerified = ['site_form', 'website_form', 'manual_commercial', 'commercial_pilot', 'meta_ads_referral'].includes(String(thread.classification_source || ''));
  const neutralGreetingEnabled = env('VALTEC_WHATSAPP_COMMERCIAL_NEUTRAL_GREETING_ENABLED') === 'true';
  const pilotDecision = evaluateCommercialPilot({
    phone: thread.phone,
    contactType,
    autoReplyMode: replyMode,
    enabled: env('VALTEC_WHATSAPP_COMMERCIAL_AUTO_REPLY_ENABLED'),
    allowedPhones: env('VALTEC_WHATSAPP_COMMERCIAL_AUTO_REPLY_PHONES'),
    disabled: env('VALTEC_WHATSAPP_COMMERCIAL_AUTO_REPLY_DISABLED'),
    status: thread.status,
    humanRequired: thread.human_required,
    lastInboundAt: thread.last_inbound_at,
    latestStaffReplyAt: thread?.conversation_context?.latest_staff_reply_at,
    commercialOriginVerified: Boolean(fromMetaAd || siteOriginVerified),
    commercialIntent: ['repair_request', 'service_area', 'quote_followup'].includes(intent) || isSafetyText(body) || isPriceText(body),
    isGreeting: isGreeting(body),
    allowNeutralGreeting: neutralGreetingEnabled
  });
  console.info('Valtec WhatsApp pilot authorization', {
    decision: pilotDecision.allowed ? 'allow' : 'block',
    reason: pilotDecision.reason,
    contactType: ['lead', 'client', 'tester', 'personal', 'supplier', 'ignore', 'unknown'].includes(contactType) ? contactType : 'other'
  });
  const neverReply = ['personal', 'supplier', 'ignore'].includes(contactType) || replyMode === 'never';
  // Intent detection is not authorization. No commercial data/lead is created unless
  // the independent pilot policy has allowed this exact contact and conversation.
  const commercialSignal = Boolean(pilotDecision.allowed && (
    isGreeting(body) || fromMetaAd || isAdTemplateGreeting(body) ||
    ['repair_request', 'service_area', 'quote_followup'].includes(intent) ||
    isSafetyText(body) || isPriceText(body)
  ));

  if (!tester && !pilotDecision.allowed) {
    await markMessageProcessed(inbound.row, {}, 'processed');
    return { reply: '', thread, lead: null };
  }

  if (neverReply && !tester) {
    await markMessageProcessed(inbound.row, {}, 'processed');
    return { reply: '', thread, lead: null };
  }

  const activeWorkflow = Boolean(
    thread.lead_id &&
    ['context', 'equipment', 'problem', 'neighborhood', 'media'].includes(String(thread.workflow_step || ''))
  );

  if (contactType === 'unknown' && !tester && !commercialSignal) {
    await markMessageProcessed(inbound.row, {}, 'processed');
    await updateRows('whatsapp_threads', `id=eq.${encodeURIComponent(thread.id)}`, {
      last_intent: intent,
      bot_label: 'Desconhecido — aguardando contexto comercial',
      classification_source: thread.classification_source || 'system',
      classified_at: thread.classified_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).catch(() => {});
    return { reply: '', thread, lead: null };
  }

  if (replyMode === 'commercial_only' && !tester && !commercialSignal && !activeWorkflow) {
    await markMessageProcessed(inbound.row, {}, 'processed');
    return { reply: '', thread, lead: await loadLead(thread) };
  }

  let lead = await loadLead(thread);
  // Cadastro de lead é autorizado separadamente da intenção e da decisão de resposta.
  // Texto estruturado/preenchido pelo remetente nunca autentica origem do site.
  const leadRegistrationAuthorized = canRegisterCommercialLead({
    pilotAllowed: pilotDecision.allowed,
    tester,
    phone: thread.phone,
    allowedPhones: env('VALTEC_WHATSAPP_COMMERCIAL_AUTO_REPLY_PHONES'),
    contactType,
    commercialOriginVerified: Boolean(fromMetaAd || siteOriginVerified),
    commercialIntent: ['repair_request', 'service_area', 'quote_followup'].includes(intent) ||
      isSafetyText(body) || isPriceText(body)
  });

  if (!lead && leadRegistrationAuthorized) {
    lead = await createLead({
      name: thread.display_name || 'Cliente WhatsApp',
      phone: thread.phone,
      source: tester ? 'whatsapp_teste' : fromMetaAd ? 'meta_ads' : 'whatsapp'
    });
    const promoted = await updateRows('whatsapp_threads', `id=eq.${encodeURIComponent(thread.id)}`, {
      lead_id: lead.id,
      status: 'bot',
      workflow_step: 'context',
      human_required: false,
      human_reason: null,
      contact_type: tester ? 'tester' : 'lead',
      auto_reply_mode: tester ? 'always' : 'commercial_only',
      bot_label: tester ? 'TESTE AUTORIZADO' : 'LEAD — identificado pela conversa',
      classification_source: tester ? 'manual_test' : fromMetaAd ? 'meta_ads_referral' : 'conversation',
      classified_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    thread = promoted?.[0] || { ...thread, lead_id: lead.id, status: 'bot', workflow_step: 'context' };
  }

  lead = lead || {};
  const beforeMissing = missingLeadFields(lead);
  const formFacts = extractIntakeForm(body);
  const genericGreeting = isGenericInterest(body) && !Object.keys(formFacts).length && !structured.siteStructured && ['unknown', 'greeting'].includes(intent);
  const preferredField = ['neighborhood', 'equipment', 'problem'].find((field) => beforeMissing.includes(field)) || '';
  let facts = genericGreeting ? {} : extractFacts({ text: body, expectedField: preferredField });
  facts = { ...facts, ...formFacts };

  // Capture a neighborhood mentioned alongside a repair request, even when the
  // intent classifier correctly prioritizes the equipment defect over service-area intent.
  if (!facts.neighborhood && /\batend(?:e|em|emos)\s+(?:no|na|em)\s+/i.test(body)) {
    const neighborhood = guessNeighborhoodFromAreaQuestion(body);
    if (neighborhood) facts = { ...facts, neighborhood };
  }

  lead = await applyFacts(thread, lead, facts) || lead;
  const missing = missingLeadFields(lead);
  await markMessageProcessed(inbound.row, facts, 'processed');

  if (!tester && (thread.status === 'human' || thread.human_required)) {
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

  // A triagem termina quando bairro, equipamento e defeito estiverem preenchidos.
  // Foto e vídeo complementam o atendimento, mas nunca impedem o encaminhamento.
  if (!missing.length) {
    const next = await markHuman(thread, 'Triagem concluída: informações enviadas ao técnico Valdemir.');
    await markMessageProcessed(inbound.row, facts, 'needs_human');
    await saveConversationContext(next, lead, intent, { facts, messageType: extracted.type, workflowStep: 'human' });
    return {
      reply: intakeDoneMessage({ equipment: cleanKnown(lead?.equipment), problem: problemSummary(lead), neighborhood: cleanKnown(lead?.neighborhood) }),
      thread: next,
      lead
    };
  }

  if (['image', 'video'].includes(extracted.type)) {
    const next = await saveConversationContext(thread, lead, intent, { facts, messageType: extracted.type, workflowStep: missing[0] || 'context' });
    return { reply: `${nextQuestion(lead, missing)} A foto ou vídeo já ficou salvo. Não precisa enviar novamente.`, thread: next, lead };
  }

  if (missing.length) {
    const allMissing = missing.length === 3;
    const reply = allMissing && (created || isGreeting(body) || genericGreeting || fromMetaAd)
      ? intakeWelcomeMessage()
      : nextQuestion(lead, missing);
    const next = await saveConversationContext(thread, lead, intent, { facts, messageType: extracted.type, workflowStep: missing[0] });
    return { reply, thread: next, lead };
  }

  return { reply: '', thread, lead };
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
  // Respeita a separação entre contatos pessoais/fornecedores e clientes.
  // Conversas marcadas como não comerciais não têm conteúdo copiado para o CRM.
  if (['personal','supplier','ignore'].includes(initialThread.contact_type) || initialThread.auto_reply_mode === 'never') return;
  const inbound = await saveInbound({ thread: initialThread, message, rawPayload: message });
  if (inbound.duplicate) return;

  let thread = await updateThreadAfterInbound(initialThread, inbound.extracted, inbound.positive);
  const decision = await decideBotReply({ thread, created, inbound });
  thread = decision.thread || thread;
  await trackCompletedServiceFeedback(thread, inbound.extracted?.body || '');
  // A proteção de teste permanece intacta e independente do piloto comercial.
  const testAuthorized = canAutoReplyInTest({
    phone: thread.phone, contactType: thread.contact_type,
    autoReplyMode: thread.auto_reply_mode,
    enabled: env('VALTEC_WHATSAPP_AUTO_REPLY_ENABLED'),
    allowedPhones: env('VALTEC_WHATSAPP_AUTO_REPLY_TEST_PHONES')
  });
  const originalThread = initialThread;
  const commercialAuthorization = evaluateCommercialPilot({
    phone: thread.phone,
    contactType: thread.contact_type,
    autoReplyMode: thread.auto_reply_mode,
    enabled: env('VALTEC_WHATSAPP_COMMERCIAL_AUTO_REPLY_ENABLED'),
    allowedPhones: env('VALTEC_WHATSAPP_COMMERCIAL_AUTO_REPLY_PHONES'),
    disabled: env('VALTEC_WHATSAPP_COMMERCIAL_AUTO_REPLY_DISABLED'),
    status: originalThread.status,
    humanRequired: originalThread.human_required,
    lastInboundAt: originalThread.last_inbound_at,
    latestStaffReplyAt: originalThread?.conversation_context?.latest_staff_reply_at,
    commercialOriginVerified: Boolean(
      isMetaClickToWhatsAppAd(inbound?.row?.raw_payload?.referral) ||
      ['site_form', 'website_form', 'manual_commercial', 'commercial_pilot', 'meta_ads_referral'].includes(String(originalThread.classification_source || '')) ||
      ['lead', 'client'].includes(String(originalThread.contact_type || ''))
    ),
    commercialIntent: ['repair_request', 'service_area', 'quote_followup'].includes(inferIntent(inbound?.extracted?.body || '')) ||
      isSafetyText(inbound?.extracted?.body || '') || isPriceText(inbound?.extracted?.body || ''),
    isGreeting: isGreeting(inbound?.extracted?.body || ''),
    allowNeutralGreeting: env('VALTEC_WHATSAPP_COMMERCIAL_NEUTRAL_GREETING_ENABLED') === 'true'
  });
  // Do not copy media or conversation text into the CRM until the commercial policy
  // authorizes this contact. Unknown, unauthorized contacts keep only redacted event metadata.
  if (testAuthorized || commercialAuthorization.allowed) {
    await persistInboundMedia(thread, inbound);
  } else if (String(originalThread.contact_type || 'unknown') === 'unknown' && inbound.row?.id) {
    await updateRows('whatsapp_messages', 'id=eq.' + encodeURIComponent(inbound.row.id), {
      body: null, raw_payload: { redacted_by_pilot_authorization: true },
      extracted_facts: {}, transcript: null, media_path: null
    }).catch(() => {});
    await updateRows('whatsapp_threads', 'id=eq.' + encodeURIComponent(thread.id), {
      last_message_preview: 'Mensagem recebida — aguardando classificação',
      conversation_context: {},
      updated_at: new Date().toISOString()
    }).catch(() => {});
  }

  const inboundAt = Date.parse(originalThread.last_inbound_at || '') || 0;
  const staffAt = Date.parse(originalThread?.conversation_context?.latest_staff_reply_at || '') || 0;
  const humanHasControl = originalThread.status === 'human' || originalThread.human_required === true || (staffAt > 0 && staffAt >= inboundAt);
  // Releitura imediatamente antes do envio fecha a janela de corrida com um eco humano.
  // Se a leitura falhar, não enviamos: o atendimento comercial precisa falhar fechado.
  let currentThread;
  try {
    const currentRows = await selectRows('whatsapp_threads',
      'select=status,human_required,human_reason,last_inbound_at,conversation_context&id=eq.' + encodeURIComponent(thread.id) + '&limit=1');
    currentThread = currentRows?.[0];
  } catch {
    return;
  }
  if (!currentThread) return;
  const currentInboundAt = Date.parse(currentThread.last_inbound_at || '') || 0;
  const currentStaffAt = Date.parse(currentThread?.conversation_context?.latest_staff_reply_at || '') || 0;
  const staffTookOverDuringProcessing = currentStaffAt > 0 && currentStaffAt >= currentInboundAt;
  const botHandoffStillBeingSent = originalThread.status !== 'human' &&
    decision.thread?.status === 'human' && decision.thread?.human_required === true &&
    currentThread.status === 'human' && currentThread.human_required === true &&
    currentThread.human_reason === decision.thread.human_reason;
  const currentHumanHasControl = (currentThread.status === 'human' || currentThread.human_required === true) &&
    !botHandoffStillBeingSent;
  const finalHumanHasControl = humanHasControl || staffTookOverDuringProcessing || currentHumanHasControl;
  console.info('Valtec WhatsApp outbound authorization', {
    decision: finalHumanHasControl ? 'block' : (testAuthorized || commercialAuthorization.allowed ? 'allow' : 'block'),
    reason: finalHumanHasControl ? 'human_takeover' : (testAuthorized ? 'approved_test_phone' : commercialAuthorization.reason),
    contactType: ['lead', 'client', 'tester', 'personal', 'supplier', 'ignore', 'unknown'].includes(String(thread.contact_type || '')) ? thread.contact_type : 'other'
  });
  if (!decision.reply || finalHumanHasControl || (!testAuthorized && !commercialAuthorization.allowed)) return;

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
    // Falha de infraestrutura não deve transferir o cliente para atendimento humano.
    // O contexto fica preservado para a próxima tentativa após a credencial ser corrigida.
    // Não reabrir o bot nem desfazer uma eventual intervenção humana concorrente.
    await updateRows('whatsapp_threads', `id=eq.${encodeURIComponent(thread.id)}`, {
      updated_at: new Date().toISOString()
    }).catch(() => {});
  }
}


async function trackCompletedServiceFeedback(thread, inboundText) {
  const sentiment = feedbackSignal(inboundText);
  if (sentiment === 'unknown' || (!thread.lead_id && !thread.client_id)) return;
  // Never infer satisfaction from praise about a quote. Require a completed service.
  let completed = false;
  if (thread.lead_id) {
    const leads = await selectRows('leads',
      'select=status&id=eq.' + encodeURIComponent(thread.lead_id) + '&limit=1');
    completed = ['concluido','finalizado','avaliacao_solicitada'].includes(leads?.[0]?.status);
  }
  if (!completed && thread.client_id) {
    const orders = await selectRows('service_orders',
      'select=id,completed_at&client_id=eq.' + encodeURIComponent(thread.client_id) +
      '&status=eq.concluido&order=completed_at.desc&limit=1');
    const ended = Date.parse(orders?.[0]?.completed_at || '') || 0;
    completed = ended > 0 && Date.now() - ended <= 30 * 24 * 60 * 60 * 1000;
  }
  if (!completed) return;
  const now = new Date().toISOString();
  await updateRows('whatsapp_threads', 'id=eq.' + encodeURIComponent(thread.id), {
    ...(sentiment === 'issue' ? {
      status: 'human',
      human_required: true,
      human_reason: 'Cliente informou problema após serviço concluído; verificar garantia.'
    } : {}),
    conversation_context: {
      ...(thread.conversation_context || {}),
      feedback_signal: sentiment,
      feedback_observed_at: now
    },
    updated_at: now
  });
  if (thread.lead_id) {
    // A complaint must never be hidden by a positive signal earlier in the thread.
    await updateRows('leads', 'id=eq.' + encodeURIComponent(thread.lead_id), {
      next_action: sentiment === 'issue'
        ? 'Retornar ao cliente para verificar problema e possível garantia'
        : 'Pós-venda: satisfação registrada; verificar acompanhamento',
      next_action_at: now,
      updated_at: now
    });
  }
  // Deliberately do not send or schedule a review based only on a positive rating.
  // The public-review request must be neutral and offered consistently after service.
}

async function handleBusinessAppEcho(message) {
  // O eco é uma resposta enviada pelo telefone comercial, NÃO uma entrada do cliente.
  // Excluir conversas privadas/fornecedores e não criar novos registros a partir de envios do app.
  const phone = normalizePhone(message?.to || '');
  if (!phone || !message?.id) return;
  const rows = await selectRows('whatsapp_threads',
    'select=*&phone=eq.' + encodeURIComponent(phone) + '&limit=1');
  const thread = rows?.[0];
  if (!canTrackBusinessAppEcho(thread)) return;

  const prior = await selectRows('whatsapp_messages',
    'select=id&provider_message_id=eq.' + encodeURIComponent(message.id) + '&limit=1');
  if (prior?.length) return;

  const extracted = {
    type: message?.type || 'text',
    body: String(message?.text?.body || message?.[message.type]?.caption || ''),
    mediaId: null
  };
  try {
    await saveOutbound({
      threadId: thread.id, providerMessageId: message.id,
      body: extracted.body, messageType: extracted.type,
      rawPayload: { ...message, source: 'whatsapp_business_app_echo' }
    });
  } catch (error) {
    // A Meta pode reenviar o mesmo evento ou duas instâncias podem processá-lo juntas.
    const replay = await selectRows('whatsapp_messages',
      'select=id&provider_message_id=eq.' + encodeURIComponent(message.id) + '&limit=1');
    if (replay?.length) return;
    throw error;
  }

  const receivedAt = Date.now();
  const sentAtMs = echoSentAt(message, receivedAt);
  const lastCustomerAt = Date.parse(thread.last_inbound_at || '') || 0;
  const lastOutboundAt = Date.parse(thread.last_outbound_at || '') || 0;

  // Guardar o histórico, mas não inverter a fila se a resposta já é antiga
  // e o cliente enviou algo depois (ou houve outra resposta mais recente).
  if (sentAtMs < Math.max(lastCustomerAt, lastOutboundAt)) return;

  const now = new Date().toISOString();
  const sentAt = new Date(sentAtMs).toISOString();
  const keepSafetyEscalation = Boolean(thread.human_required &&
    /(?:risco|seguran[çc]a|vazamento|g[aá]s|garantia|reclama[çc][aã]o)/i.test(thread.human_reason || ''));

  await updateRows('whatsapp_threads', 'id=eq.' + encodeURIComponent(thread.id), {
    status: 'human',
    workflow_step: 'human',
    human_required: keepSafetyEscalation,
    human_reason: keepSafetyEscalation ? thread.human_reason : null,
    unread_count: 0,
    last_message_preview: extracted.body.slice(0, 180) || previewForMessage(extracted),
    last_message_at: sentAt,
    last_outbound_at: sentAt,
    conversation_context: {
      ...(thread.conversation_context || {}),
      latest_staff_reply_at: sentAt,
      waiting_on: keepSafetyEscalation ? 'staff' : 'customer',
      last_staff_reply_source: 'whatsapp_business_app'
    },
    updated_at: now
  });
  if (thread.lead_id) {
    const leads = await selectRows('leads',
      'select=id,status,contacted_at&id=eq.' + encodeURIComponent(thread.lead_id) + '&limit=1');
    const lead = leads?.[0];
    if (lead && !['concluido','finalizado','perdido','arquivado','agendado','em_atendimento'].includes(lead.status)) {
      await updateRows('leads', 'id=eq.' + encodeURIComponent(lead.id), {
        ...(['novo','triagem'].includes(lead.status) ? { status: 'contato_realizado' } : {}),
        contacted_at: lead.contacted_at || sentAt,
        next_action: keepSafetyEscalation
          ? 'Técnico deve verificar a situação de segurança ou garantia'
          : 'Acompanhar a resposta do cliente no WhatsApp',
        next_action_at: keepSafetyEscalation
          ? now : new Date(sentAtMs + 24 * 60 * 60 * 1000).toISOString(),
        updated_at: now
      });
    }
  }
  // Resposta humana registrada: cancelar lembretes programados para não duplicar atendimento.
  await updateRows('whatsapp_automation_jobs',
    'thread_id=eq.' + encodeURIComponent(thread.id) +
    '&kind=in.(followup_1d,followup_3d)&status=in.(pending,processing)',
    { status:'cancelled', updated_at:now }).catch(() => {});
}

async function handleStatuses(statuses = []) {
  const accepted = new Set(['sent', 'delivered', 'read', 'failed']);
  for (const status of statuses) {
    if (!status?.id || !accepted.has(status.status)) continue;
    const failure = metaDeliveryFailure(status);
    if (!failure) {
      await updateRows('whatsapp_messages', `provider_message_id=eq.${encodeURIComponent(status.id)}`, {
        delivery_status: status.status
      }).catch(() => {});
      continue;
    }

    const messages = await selectRows('whatsapp_messages',
      'select=id,thread_id,raw_payload&provider_message_id=eq.' + encodeURIComponent(status.id) + '&limit=1');
    const record = messages?.[0];
    if (!record) {
      console.warn('Valtec WhatsApp: status failed sem mensagem local correspondente', failure.code, failure.title);
      continue;
    }
    await updateRows('whatsapp_messages', 'id=eq.' + encodeURIComponent(record.id), {
      delivery_status: 'failed',
      raw_payload: {
        ...(record.raw_payload && typeof record.raw_payload === 'object' ? record.raw_payload : {}),
        meta_delivery_failure: failure,
        meta_delivery_failed_at: new Date().toISOString()
      }
    });

    const threads = await selectRows('whatsapp_threads',
      'select=id,lead_id,conversation_context,last_outbound_at,last_inbound_at&id=eq.' + encodeURIComponent(record.thread_id) + '&limit=1');
    const thread = threads?.[0];
    if (!thread) continue;
    const failedAt = new Date().toISOString();
    if (!isLatestUndeliveredReply(thread, failedAt)) continue;
    await updateRows('whatsapp_threads', 'id=eq.' + encodeURIComponent(thread.id), {
      conversation_context: {
        ...(thread.conversation_context || {}),
        latest_bot_delivery_failed_at: failedAt,
        latest_bot_delivery_failure_code: failure.code,
        latest_bot_delivery_failure_title: failure.title
      },
      updated_at: failedAt
    });
    if (thread.lead_id) {
      await updateRows('leads','id=eq.' + encodeURIComponent(thread.lead_id), {
        next_action: 'Mensagem automática não entregue; conferir o WhatsApp e responder manualmente',
        next_action_at: failedAt,
        updated_at: failedAt
      }).catch(() => {});
    }
    console.warn('Valtec WhatsApp: falha de entrega Meta', failure.code, failure.title);
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
        for (const message of extractBusinessAppEchoes(change)) tasks.push(handleBusinessAppEcho(message));
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
