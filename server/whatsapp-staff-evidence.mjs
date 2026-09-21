import {
  env,
  normalizePhone,
  normalizeText,
  selectRows,
  insertRow,
  updateRows,
  sendWhatsAppText,
  extractMessage,
  persistWhatsAppMedia
} from './whatsapp-lib.mjs';

function configuredStaffPhones() {
  return String(env('VALTEC_STAFF_WHATSAPP_PHONES'))
    .split(',')
    .map((value) => normalizePhone(value))
    .filter(Boolean);
}

function isStaffWhatsAppPhone(phone) {
  const normalized = normalizePhone(phone);
  return Boolean(normalized) && configuredStaffPhones().includes(normalized);
}

function shortPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.slice(-4) || '—';
}

function phaseLabel(phase) {
  return { before: 'ANTES', during: 'DURANTE', after: 'DEPOIS', note: 'OBSERVAÇÃO' }[phase] || String(phase || '').toUpperCase();
}

async function reply(phone, text) {
  await sendWhatsAppText(phone, text);
}

async function getState(phone) {
  const normalized = normalizePhone(phone);
  const rows = await selectRows('staff_whatsapp_states', `select=*&phone=eq.${encodeURIComponent(normalized)}&limit=1`);
  return rows?.[0] || null;
}

async function saveState(phone, patch) {
  const normalized = normalizePhone(phone);
  const current = await getState(normalized);
  const payload = {
    ...(current || {}),
    ...patch,
    phone: normalized,
    updated_at: new Date().toISOString()
  };
  delete payload.created_at;
  if (current) {
    const rows = await updateRows('staff_whatsapp_states', `phone=eq.${encodeURIComponent(normalized)}`, payload);
    return rows?.[0] || payload;
  }
  return insertRow('staff_whatsapp_states', payload);
}

async function clearState(phone) {
  return saveState(phone, {
    session_id: null,
    lead_id: null,
    client_id: null,
    service_order_id: null,
    pending_phase: 'before',
    pending_description: null
  });
}

async function findOrderForClient(clientId) {
  if (!clientId) return null;
  const rows = await selectRows(
    'service_orders',
    `select=id,client_id,order_number,equipment,status,scheduled_for,created_at&client_id=eq.${encodeURIComponent(clientId)}&order=created_at.desc&limit=5`
  ).catch(() => []);
  return rows?.find((row) => !['concluido', 'cancelado'].includes(String(row.status || '').toLowerCase())) || rows?.[0] || null;
}

async function resolveCustomer(query) {
  const raw = String(query || '').trim();
  if (!raw) return { matches: [] };
  const digits = raw.replace(/\D/g, '');
  const isPhone = digits.length >= 8;

  const leadQuery = isPhone
    ? `select=id,customer_name,phone,equipment,status&phone=ilike.*${encodeURIComponent(digits.slice(-8))}*&order=created_at.desc&limit=5`
    : `select=id,customer_name,phone,equipment,status&customer_name=ilike.*${encodeURIComponent(raw)}*&order=created_at.desc&limit=5`;
  const clientQuery = isPhone
    ? `select=id,name,phone,equipment_notes,neighborhood&phone=ilike.*${encodeURIComponent(digits.slice(-8))}*&order=updated_at.desc&limit=5`
    : `select=id,name,phone,equipment_notes,neighborhood&name=ilike.*${encodeURIComponent(raw)}*&order=updated_at.desc&limit=5`;

  const [leads, clients] = await Promise.all([
    selectRows('leads', leadQuery).catch(() => []),
    selectRows('clients', clientQuery).catch(() => [])
  ]);

  const seenPhones = new Set();
  const matches = [];
  for (const lead of leads || []) {
    const key = String(lead.phone || lead.id);
    if (seenPhones.has(key)) continue;
    seenPhones.add(key);
    matches.push({
      kind: 'lead',
      id: lead.id,
      name: lead.customer_name || 'Cliente',
      phone: lead.phone || '',
      equipment: lead.equipment || '',
      source: lead
    });
  }
  for (const client of clients || []) {
    const key = String(client.phone || client.id);
    if (seenPhones.has(key)) continue;
    seenPhones.add(key);
    matches.push({
      kind: 'client',
      id: client.id,
      name: client.name || 'Cliente',
      phone: client.phone || '',
      equipment: client.equipment_notes || '',
      source: client
    });
  }
  return { matches: matches.slice(0, 5) };
}

async function findThreadForLead(leadId) {
  if (!leadId) return null;
  const rows = await selectRows(
    'whatsapp_threads',
    `select=id,client_id,lead_id&lead_id=eq.${encodeURIComponent(leadId)}&order=updated_at.desc&limit=1`
  ).catch(() => []);
  return rows?.[0] || null;
}

async function getOrCreateEvidenceSession(phone, match) {
  const normalized = normalizePhone(phone);
  let leadId = match.kind === 'lead' ? match.id : null;
  let clientId = match.kind === 'client' ? match.id : null;
  let thread = leadId ? await findThreadForLead(leadId) : null;
  if (!clientId && thread?.client_id) clientId = thread.client_id || null;
  const order = await findOrderForClient(clientId);

  let query = `select=*&created_by_phone=eq.${encodeURIComponent(normalized)}&status=eq.open&order=started_at.desc&limit=1`;
  if (leadId) query += `&lead_id=eq.${encodeURIComponent(leadId)}`;
  else if (clientId) query += `&client_id=eq.${encodeURIComponent(clientId)}`;
  const existing = await selectRows('service_evidence_sessions', query).catch(() => []);
  let session = existing?.[0] || null;

  if (!session) {
    session = await insertRow('service_evidence_sessions', {
      lead_id: leadId,
      client_id: clientId,
      service_order_id: order?.id || null,
      whatsapp_thread_id: thread?.id || null,
      customer_name: match.name || null,
      customer_phone: normalizePhone(match.phone) || null,
      equipment: order?.equipment || match.equipment || null,
      status: 'open',
      created_by_phone: normalized
    });
  }

  await saveState(normalized, {
    session_id: session.id,
    lead_id: leadId,
    client_id: clientId,
    service_order_id: order?.id || null,
    pending_phase: 'before',
    pending_description: null
  });
  return { session, order };
}

async function loadSession(state) {
  if (!state?.session_id) return null;
  const rows = await selectRows(
    'service_evidence_sessions',
    `select=*&id=eq.${encodeURIComponent(state.session_id)}&limit=1`
  );
  return rows?.[0] || null;
}

async function sessionCounts(sessionId) {
  const rows = await selectRows(
    'service_evidence_items',
    `select=phase,media_type&id=neq.00000000-0000-0000-0000-000000000000&session_id=eq.${encodeURIComponent(sessionId)}&order=captured_at.asc`
  ).catch(() => []);
  const counts = { before: 0, during: 0, after: 0, note: 0 };
  for (const row of rows || []) counts[row.phase] = Number(counts[row.phase] || 0) + 1;
  return counts;
}

async function saveTextNote({ sessionId, phone, description, message }) {
  if (!description) return null;
  return insertRow('service_evidence_items', {
    session_id: sessionId,
    phase: 'note',
    media_type: 'text',
    provider_message_id: message?.id || null,
    description,
    captured_by_phone: normalizePhone(phone),
    raw_payload: message || {}
  });
}

async function saveMediaEvidence({ session, state, phone, message, extracted, phase, description }) {
  if (!extracted.mediaId || !message?.id) throw new Error('Mídia sem identificador do WhatsApp.');
  const duplicate = await selectRows(
    'service_evidence_items',
    `select=id&provider_message_id=eq.${encodeURIComponent(message.id)}&limit=1`
  ).catch(() => []);
  if (duplicate?.length) return { duplicate: true, item: duplicate[0] };

  const path = await persistWhatsAppMedia({
    mediaId: extracted.mediaId,
    threadId: `staff-${normalizePhone(phone)}`,
    messageId: message.id
  });
  const item = await insertRow('service_evidence_items', {
    session_id: session.id,
    phase,
    media_type: extracted.type,
    media_path: path,
    provider_media_id: extracted.mediaId,
    provider_message_id: message.id,
    description: description || null,
    captured_by_phone: normalizePhone(phone),
    raw_payload: message || {}
  });
  await updateRows('service_evidence_sessions', `id=eq.${encodeURIComponent(session.id)}`, {
    updated_at: new Date().toISOString()
  });
  await saveState(phone, {
    ...state,
    pending_description: null,
    pending_phase: phase
  });
  return { duplicate: false, item };
}

function extractCommand(rawBody, command) {
  const raw = String(rawBody || '').trim();
  const normalized = normalizeText(raw);
  const target = normalizeText(command);
  if (normalized === target) return '';
  if (!normalized.startsWith(`${target} `) && !normalized.startsWith(`${target}:`) && !normalized.startsWith(`${target} -`)) return null;
  const index = raw.search(/[\s:-]/);
  return index >= 0 ? raw.slice(index + 1).replace(/^\s*[:\-]\s*/, '').trim() : '';
}

function helpText() {
  return [
    'Evidências Valtec — comandos rápidos:',
    '',
    'ATENDIMENTO Nome ou telefone',
    'ANTES: descrição',
    'DURANTE: descrição',
    'DEPOIS: descrição',
    'OBS: observação técnica',
    'STATUS',
    'ENCERRAR',
    '',
    'Depois de escolher a etapa, mande a foto ou vídeo. Também pode enviar a mídia já com a legenda, por exemplo: “ANTES: queimador com chama irregular”.'
  ].join('\n');
}

async function describeCurrent(phone, state, session) {
  if (!session) return reply(phone, 'Nenhum atendimento de evidência está aberto. Envie: ATENDIMENTO Nome do cliente');
  const counts = await sessionCounts(session.id);
  return reply(phone, [
    `Atendimento atual: ${session.customer_name || 'Cliente'}`,
    session.equipment ? `Equipamento: ${session.equipment}` : '',
    `Etapa ativa: ${phaseLabel(state.pending_phase)}`,
    '',
    `ANTES: ${counts.before}`,
    `DURANTE: ${counts.during}`,
    `DEPOIS: ${counts.after}`,
    `OBSERVAÇÕES: ${counts.note}`
  ].filter(Boolean).join('\n'));
}

async function startAttendance(phone, query) {
  if (!String(query || '').trim()) return reply(phone, 'Informe o cliente. Exemplo: ATENDIMENTO Carlos ou ATENDIMENTO 71999999999');
  const { matches } = await resolveCustomer(query);
  if (!matches.length) {
    return reply(phone, 'Não encontrei esse cliente no sistema. Confira o nome/telefone ou cadastre o atendimento primeiro.');
  }
  if (matches.length > 1) {
    const lines = matches.map((match, index) => `${index + 1}. ${match.name} — final ${shortPhone(match.phone)}`);
    return reply(phone, [
      'Encontrei mais de um resultado. Para evitar salvar no cliente errado, envie o telefone:',
      ...lines,
      '',
      'Exemplo: ATENDIMENTO 71999999999'
    ].join('\n'));
  }
  const match = matches[0];
  const { session, order } = await getOrCreateEvidenceSession(phone, match);
  return reply(phone, [
    `Contexto aberto: ${session.customer_name || match.name}`,
    order?.order_number ? `OS: ${order.order_number}` : '',
    session.equipment ? `Equipamento: ${session.equipment}` : '',
    '',
    'Etapa inicial: ANTES.',
    'Explique o que está mostrando e envie a foto ou vídeo.'
  ].filter(Boolean).join('\n'));
}

async function finishAttendance(phone, state, session) {
  if (!session) return reply(phone, 'Não há atendimento de evidência aberto.');
  await updateRows('service_evidence_sessions', `id=eq.${encodeURIComponent(session.id)}`, {
    status: 'closed',
    closed_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  const counts = await sessionCounts(session.id);
  await clearState(phone);
  return reply(phone, [
    `Registro encerrado: ${session.customer_name || 'Cliente'}`,
    `ANTES: ${counts.before} · DURANTE: ${counts.during} · DEPOIS: ${counts.after} · OBS: ${counts.note}`,
    'Tudo ficou salvo no histórico de evidências da Valtec.'
  ].join('\n'));
}

async function handleStaffEvidenceMessage({ value, message }) {
  const phone = normalizePhone(message?.from);
  if (!phone || !isStaffWhatsAppPhone(phone)) return false;

  const extracted = extractMessage(message);
  const body = String(extracted.body || '').trim();
  const normalized = normalizeText(body);
  let state = await getState(phone);
  let session = await loadSession(state);

  if (['ajuda', 'menu', 'comandos'].includes(normalized)) {
    await reply(phone, helpText());
    return true;
  }

  const attendance = extractCommand(body, 'atendimento');
  const client = extractCommand(body, 'cliente');
  if (attendance !== null || client !== null) {
    await startAttendance(phone, attendance !== null ? attendance : client);
    return true;
  }

  if (['status', 'resumo'].includes(normalized)) {
    await describeCurrent(phone, state, session);
    return true;
  }

  if (['encerrar', 'finalizar', 'fechar'].includes(normalized)) {
    await finishAttendance(phone, state, session);
    return true;
  }

  if (!session) {
    await reply(phone, [
      'Para eu saber onde salvar, primeiro informe o cliente.',
      'Exemplo: ATENDIMENTO Carlos',
      '',
      'Envie AJUDA para ver os comandos.'
    ].join('\n'));
    return true;
  }

  const phaseCommands = [
    ['antes', 'before'],
    ['durante', 'during'],
    ['depois', 'after']
  ];
  let selectedPhase = null;
  let phaseDescription = null;
  for (const [command, phase] of phaseCommands) {
    const valueText = extractCommand(body, command);
    if (valueText !== null) {
      selectedPhase = phase;
      phaseDescription = valueText;
      break;
    }
  }

  const note = extractCommand(body, 'obs');
  if (note !== null) {
    if (!note) {
      await reply(phone, 'Escreva a observação depois de OBS:.');
      return true;
    }
    await saveTextNote({ sessionId: session.id, phone, description: note, message });
    await reply(phone, 'Observação salva no atendimento.');
    return true;
  }

  if (selectedPhase) {
    state = await saveState(phone, {
      ...state,
      pending_phase: selectedPhase,
      pending_description: phaseDescription || null
    });
    if (!['image', 'video', 'audio', 'document'].includes(extracted.type)) {
      await reply(phone, `${phaseLabel(selectedPhase)} selecionado. ${phaseDescription ? 'Descrição anotada. ' : ''}Agora envie a foto ou vídeo.`);
      return true;
    }
  }

  if (['image', 'video', 'audio', 'document'].includes(extracted.type)) {
    const phase = selectedPhase || state?.pending_phase || 'before';
    const description = phaseDescription || body || state?.pending_description || null;
    const saved = await saveMediaEvidence({ session, state: state || {}, phone, message, extracted, phase, description });
    if (!saved.duplicate) {
      await reply(phone, [
        `${phaseLabel(phase)} salvo para ${session.customer_name || 'o cliente'}.`,
        description ? `Descrição: ${description}` : 'Sem descrição.',
        'Pode continuar enviando arquivos ou trocar a etapa com DURANTE / DEPOIS.'
      ].join('\n'));
    }
    return true;
  }

  if (body) {
    await saveState(phone, {
      ...state,
      pending_description: body
    });
    await reply(phone, `Anotado para o próximo arquivo em ${phaseLabel(state?.pending_phase || 'before')}: “${body}”`);
    return true;
  }

  await reply(phone, helpText());
  return true;
}

export {
  isStaffWhatsAppPhone,
  handleStaffEvidenceMessage
};
