import {
  env,
  normalizeText,
  needsTechnicalHuman,
  getOrCreateThread,
  saveInbound,
  saveOutbound,
  updateRows,
  sendWhatsAppText,
  previewForMessage,
  persistWhatsAppMedia,
  readRawBody,
  verifyMetaSignature,
  findServiceArea,
  json
} from '../server/whatsapp-lib.mjs';

const WELCOME = [
  'Olá! Seja bem-vindo à Valtec Soluções.',
  'Para agilizar seu atendimento, escolha uma opção:',
  '',
  '1 - Solicitar conserto',
  '2 - Acompanhar orçamento',
  '3 - Saber se atendemos meu bairro',
  '4 - Falar com um profissional'
].join('\n');

const EQUIPMENT_MENU = [
  'Qual equipamento apresentou problema?',
  '',
  '1 - Fogão residencial',
  '2 - Fogão industrial',
  '3 - Cooktop',
  '4 - Outro'
].join('\n');

const HUMAN_SAFETY_REPLY = 'Por segurança, esse tipo de orientação precisa ser avaliado por um profissional. Encaminhei seu atendimento para a equipe da Valtec. Se houver cheiro forte de gás, chama fora do normal ou risco imediato, interrompa o uso do equipamento e mantenha fontes de ignição afastadas.';

function queryValue(req, key) {
  if (req.query && req.query[key] !== undefined) return String(req.query[key]);
  try { return new URL(req.url, 'https://valtec.local').searchParams.get(key) || ''; } catch { return ''; }
}

function firstChoice(body) {
  return normalizeText(body).match(/^([1-4])(?:\b|\s|[-.)])?/)?.[1] || '';
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

async function patchLead(thread, patch) {
  if (!thread.lead_id) return;
  await updateRows('leads', `id=eq.${encodeURIComponent(thread.lead_id)}`, {
    ...patch,
    updated_at: new Date().toISOString()
  });
}

async function decideBotReply({ thread, created, extracted }) {
  const body = extracted.body;
  const normalized = normalizeText(body);

  if (thread.status === 'human' || thread.human_required) return { reply: '', thread };

  if (needsTechnicalHuman(body)) {
    const next = await markHuman(thread, 'Pergunta técnica, preço técnico ou situação de segurança.');
    return { reply: HUMAN_SAFETY_REPLY, thread: next };
  }

  if (created) return { reply: WELCOME, thread };

  const step = thread.workflow_step || 'menu';

  if (step === 'menu') {
    const choice = firstChoice(body);
    if (choice === '1') {
      const rows = await updateRows('whatsapp_threads', `id=eq.${encodeURIComponent(thread.id)}`, { workflow_step: 'equipment', updated_at: new Date().toISOString() });
      return { reply: EQUIPMENT_MENU, thread: rows?.[0] || { ...thread, workflow_step: 'equipment' } };
    }
    if (choice === '2') {
      const next = await markHuman(thread, 'Cliente quer acompanhar orçamento.');
      return { reply: 'Certo. Vou encaminhar sua conversa para a equipe verificar o orçamento e continuar com você por aqui.', thread: next };
    }
    if (choice === '3') {
      const rows = await updateRows('whatsapp_threads', `id=eq.${encodeURIComponent(thread.id)}`, { workflow_step: 'service_area', updated_at: new Date().toISOString() });
      return { reply: 'Qual é o seu bairro?', thread: rows?.[0] || { ...thread, workflow_step: 'service_area' } };
    }
    if (choice === '4') {
      const next = await markHuman(thread, 'Cliente solicitou atendimento de um profissional.');
      return { reply: 'Certo. Sua conversa foi encaminhada para um profissional da Valtec, que continuará o atendimento por aqui.', thread: next };
    }
    return { reply: WELCOME, thread };
  }

  if (step === 'service_area') {
    if (!body) return { reply: 'Digite o nome do seu bairro para verificarmos a área de atendimento.', thread };
    const area = await findServiceArea(body);
    if (area) {
      const rows = await updateRows('whatsapp_threads', `id=eq.${encodeURIComponent(thread.id)}`, { workflow_step: 'menu', updated_at: new Date().toISOString() });
      return { reply: `Sim, atendemos ${area.neighborhood}. Se quiser abrir uma solicitação agora, responda 1.`, thread: rows?.[0] || { ...thread, workflow_step: 'menu' } };
    }
    const next = await markHuman(thread, `Bairro precisa de confirmação: ${body}`);
    return { reply: 'Esse bairro precisa de uma confirmação da equipe antes de prometermos o atendimento. Já encaminhei sua conversa para um profissional da Valtec.', thread: next };
  }

  if (step === 'equipment') {
    const equipment = { '1': 'Fogão residencial', '2': 'Fogão industrial', '3': 'Cooktop' }[firstChoice(body)];
    if (equipment) {
      await patchLead(thread, { equipment, status: 'triagem' });
      const rows = await updateRows('whatsapp_threads', `id=eq.${encodeURIComponent(thread.id)}`, { workflow_step: 'problem', updated_at: new Date().toISOString() });
      return { reply: 'O que está acontecendo com o equipamento? Descreva o problema com suas palavras.', thread: rows?.[0] || { ...thread, workflow_step: 'problem' } };
    }
    if (firstChoice(body) === '4') {
      const rows = await updateRows('whatsapp_threads', `id=eq.${encodeURIComponent(thread.id)}`, { workflow_step: 'equipment_other', updated_at: new Date().toISOString() });
      return { reply: 'Qual é o equipamento?', thread: rows?.[0] || { ...thread, workflow_step: 'equipment_other' } };
    }
    return { reply: EQUIPMENT_MENU, thread };
  }

  if (step === 'equipment_other') {
    if (!body) return { reply: 'Digite o nome do equipamento para continuarmos.', thread };
    await patchLead(thread, { equipment: body, status: 'triagem' });
    const rows = await updateRows('whatsapp_threads', `id=eq.${encodeURIComponent(thread.id)}`, { workflow_step: 'problem', updated_at: new Date().toISOString() });
    return { reply: 'O que está acontecendo com o equipamento? Descreva o problema com suas palavras.', thread: rows?.[0] || { ...thread, workflow_step: 'problem' } };
  }

  if (step === 'problem') {
    if (!body) return { reply: 'Além da foto ou vídeo, descreva em uma frase o problema que está acontecendo.', thread };
    await patchLead(thread, { problems: [body], description: body, status: 'triagem' });
    const rows = await updateRows('whatsapp_threads', `id=eq.${encodeURIComponent(thread.id)}`, { workflow_step: 'neighborhood', updated_at: new Date().toISOString() });
    return { reply: 'Qual é o bairro do atendimento?', thread: rows?.[0] || { ...thread, workflow_step: 'neighborhood' } };
  }

  if (step === 'neighborhood') {
    if (!body) return { reply: 'Digite o bairro do atendimento para continuarmos.', thread };
    await patchLead(thread, { neighborhood: body, status: 'triagem' });
    const rows = await updateRows('whatsapp_threads', `id=eq.${encodeURIComponent(thread.id)}`, { workflow_step: 'media', updated_at: new Date().toISOString() });
    return { reply: 'Obrigado. Se puder, envie agora uma foto ou vídeo do equipamento. Se não tiver, digite PULAR.', thread: rows?.[0] || { ...thread, workflow_step: 'media' } };
  }

  if (step === 'media') {
    if (['image', 'video'].includes(extracted.type) || normalized === 'pular') {
      const next = await markHuman(thread, extracted.type === 'image' ? 'Foto recebida para avaliação.' : extracted.type === 'video' ? 'Vídeo recebido para avaliação.' : 'Triagem administrativa concluída sem mídia.');
      return { reply: 'Pronto. Registrei sua solicitação e encaminhei para um profissional da Valtec continuar o atendimento por aqui.', thread: next };
    }
    return { reply: 'Envie uma foto ou vídeo do equipamento. Se preferir continuar sem mídia, digite PULAR.', thread };
  }

  return { reply: '', thread };
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
  const contact = (value?.contacts || []).find((item) => item?.wa_id === phone) || value?.contacts?.[0];
  const name = contact?.profile?.name || 'Cliente WhatsApp';
  const { thread: initialThread, created } = await getOrCreateThread({ phone, name });
  const inbound = await saveInbound({ thread: initialThread, message, rawPayload: message });
  if (inbound.duplicate) return;

  let thread = await updateThreadAfterInbound(initialThread, inbound.extracted, inbound.positive);
  await persistInboundMedia(thread, inbound);

  const decision = await decideBotReply({ thread, created, extracted: inbound.extracted });
  thread = decision.thread || thread;
  if (!decision.reply) return;

  const providerMessageId = await sendWhatsAppText(thread.phone, decision.reply);
  await saveOutbound({ threadId: thread.id, providerMessageId, body: decision.reply });
  const now = new Date().toISOString();
  await updateRows('whatsapp_threads', `id=eq.${encodeURIComponent(thread.id)}`, {
    last_message_preview: decision.reply.slice(0, 180),
    last_message_at: now,
    last_outbound_at: now,
    updated_at: now
  });
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
    if (mode === 'subscribe' && token && token === env('WHATSAPP_VERIFY_TOKEN', { required: true })) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.end(challenge);
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
