// Priorização explicável: sinais explícitos têm precedência sobre horários.
const norm = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const has = (text, regex) => regex.test(norm(text));
const time = x => Date.parse(x || '') || 0;
export function classifyCommercialFollowup({ thread = {}, lead = {}, order = {}, messages = [], at = Date.now() } = {}) {
  const status = norm(lead.status);
  const orderStatus = norm(order.status);
  const notes = norm([lead.next_action, lead.lost_reason, lead.internal_notes, order.internal_notes, order.completion_notes].filter(Boolean).join(' | '));
  // Mídias sem transcrição não equivalem a uma solicitação de resposta em texto.
  const chronological = messages.filter(m => ['inbound','outbound'].includes(m.direction))
    .slice().sort((a,b)=>time(a.created_at)-time(b.created_at));
  const relevant = messages.filter(m => m.body && ['inbound','outbound'].includes(m.direction)).slice().sort((a,b)=>time(a.created_at)-time(b.created_at));
  const last = relevant.at(-1) || {};
  const lastIncoming = [...relevant].reverse().find(m => m.direction === 'inbound') || {};
  const lastOutgoing = [...relevant].reverse().find(m => m.direction === 'outbound') || {};
  const recentText = relevant.slice(-14).map(m => ({ direction:m.direction, body:norm(m.body), date:time(m.created_at) }));
  const recentAll = recentText.map(m=>m.body).join(' | ');
  const latestHumanText = norm(lastOutgoing.body);
  const latestCustomerText = norm(lastIncoming.body);
  const latestInboundEvent = [...chronological].reverse().find(m => m.direction === 'inbound') || {};
  const lastOutboundEvent = [...chronological].reverse().find(m => m.direction === 'outbound') || {};
  const inbound = time(thread.last_inbound_at) || time(lastIncoming.created_at);
  const outbound = time(thread.last_outbound_at) || time(lastOutgoing.created_at);
  const ageHours = Math.max(0,(at-Math.max(inbound,outbound,time(thread.last_message_at),time(lead.updated_at)))/3600000);
  const result = (category,label,reason,priority,draft='',action='')=>({category,label,reason,priority,draft,action});
  if (order.completed_at || ['concluido','finalizado','cancelado'].includes(orderStatus) || ['concluido','finalizado','convertido'].includes(status)) {
    return result('pos_venda','CONCLUÍDO — verificar pós-venda','Ordem/lead com conclusão registrada',0,'','Confira se já foi solicitado o feedback.');
  }
  if (['arquivado','perdido','descartado'].includes(status) || /fora da area|nao atendemos (?:essa|esta) (?:area|regiao)|deslocamento.*(?:caro|longe)/.test(notes)) {
    return result('fora_area_ou_encerrado','ENCERRADO / ÁREA NÃO ATENDIDA','Status ou justificativa operacional existente',0);
  }
  if (order.scheduled_for && !order.completed_at && !['cancelado','concluido'].includes(orderStatus)) {
    return result('visita_programada','VISITA PROGRAMADA','Agendamento existente na ordem de serviço',1,'','Conferir agenda, sem pedir nova triagem.');
  }

  // Horário confirmado em conversa: a ausência de OS não torna o cliente 'sem resposta'.
  // Nunca inferir que o atendimento foi realizado só por existir agendamento.
  const freshMessages = recentText.filter(m => m.date && at - m.date >= -3600000 && at - m.date <= 10 * 86400000);
  const booked = freshMessages.some(m => m.direction === 'outbound' &&
    /\\b(?:agendad[oa]|confirmad[oa]|marcad[oa])\\s+(?:para|as?|na|no|dia|segunda|terca|quarta|quinta|sexta|sabado|domingo)/.test(m.body));
  const customerAskedVisit = freshMessages.some(m => m.direction === 'inbound' &&
    /(?:pode|consegue)\\s+(?:vir|passar).{0,40}(?:amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo)/.test(m.body));
  const professionalOfferedTime = freshMessages.some(m => m.direction === 'outbound' &&
    /(?:so a tarde|\\b(?:as|a)\\s*\\d{1,2}\\s*(?:h|horas?)\\b|vou (?:ai|passar|amanha)|pode ser)/.test(m.body));
  const locationSent = freshMessages.some(m => m.direction === 'inbound' &&
    /\\b(?:rua|avenida|travessa|endereco|procurar)\\b/.test(m.body));
  if (booked || (customerAskedVisit && professionalOfferedTime && locationSent)) {
    const gasConcern = /(?:escapando gas|vazamento de gas|cheiro (?:forte )?de gas)/.test(recentAll);
    return result('visita_a_conferir',gasConcern?'VISITA / GÁS — VERIFICAR':'VISITA COMBINADA — VERIFICAR',
      'A conversa indica visita combinada, mas a conclusão não consta na OS',1,'',
      'Confirmar se a visita ocorreu; não cobrar uma nova triagem do cliente.');
  }
  if (latestInboundEvent && latestInboundEvent.message_type === 'audio' &&
      time(latestInboundEvent.created_at) >= time(lastOutboundEvent.created_at)) {
    return result('audio_a_revisar','ÁUDIO RECEBIDO — OUVIR',
      'Última comunicação do cliente foi áudio sem transcrição segura',4,'',
      'Ouvir o áudio e confirmar se há visita, orçamento ou retorno combinado.');
  }
  if (latestInboundEvent?.message_type === 'unknown' && !latestCustomerText && !latestHumanText) {
    return result('midia_a_revisar','MENSAGEM SEM TEXTO — CONFERIR',
      'Conteúdo recebido não está legível como texto no histórico',3,'',
      'Verificar mensagem original antes de responder.');
  }
  if (!outbound && latestCustomerText &&
      /^(?:ola|oi|bom dia|boa tarde|boa noite).{0,80}(?:mais informacoes|sobre isso)/.test(latestCustomerText)) {
    return result('triagem_inicial','PRIMEIRO CONTATO — INICIAR',
      'Cliente enviou mensagem genérica e não há resposta registrada',4,
      'Olá! Obrigado por procurar a Valtec. Qual equipamento precisa de atendimento?',
      'Não presumir defeito nem solicitar várias informações de uma só vez.');
  }
  const explicitDistance = recentText.some(m => m.direction === 'outbound' && /(?:nao (?:estamos )?atendendo|fora (?:da|de nossa) area|deslocamento.*(?:caro|longe)|nao atendemos.*(?:bairro|regiao|area))/.test(m.body));
  if (explicitDistance) return result('fora_area_ou_encerrado','FORA DA ÁREA — CONFIRMAR','Técnico informou restrição de deslocamento',0,'','Confirmar antes de arquivar definitivamente.');
  if (/(?:comprovante|pagamento realizado|servico (?:realizado|concluido)|conserto (?:feito|finalizado))/.test(recentAll)) {
    return result('conclusao_a_conferir','POSSÍVEL SERVIÇO CONCLUÍDO','Indícios no histórico, confirmar no sistema',1,'','Não presumir pagamento ou serviço concluído.');
  }
  if (/(?:aguardar outros orcamentos|comparar orcamentos|outros orcamentos)/.test(latestCustomerText)) {
    return result('orcamento_em_avaliacao','ORÇAMENTO EM AVALIAÇÃO','Cliente declarou que está comparando opções',3,
      'Olá! Passando para saber se ainda precisa de ajuda com o serviço. Fico à disposição caso queira esclarecer alguma dúvida sobre o orçamento.');
  }
  if (/(?:vou entrar em contato|entrarei em contato|retorno em breve|falo com (?:o senhor|voce) depois|vou verificar e retorno|vou mandar (?:a )?(?:foto|video) (?:amanha|depois))/.test(latestCustomerText)) {
    return result('cliente_prometeu_retorno','RETORNO PROMETIDO PELO CLIENTE','Cliente sinalizou contato posterior',2,
      'Olá! Passando para saber se ainda precisa de ajuda com o atendimento. Se preferir retomar depois, fique à vontade.');
  }
  if (/(?:envia|mande|pode mandar|me mande|pode enviar|me envia).{0,35}(?:foto|video)/.test(latestHumanText) && outbound >= inbound) {
    return result('aguardando_midia','AGUARDANDO FOTO/VÍDEO','Técnico solicitou mídia; não há resposta posterior identificada',2,
      'Olá! Quando puder, envie a foto ou o vídeo do equipamento para continuarmos seu atendimento.');
  }
  if (inbound > outbound || thread.human_required) {
    return result('responder_cliente','CLIENTE AGUARDANDO RESPOSTA','Cliente enviou mensagem mais recente ou atendimento requer humano',5,'','Responder prioritariamente.');
  }
  if (outbound > inbound && ageHours >= 24) {
    return result('retorno_comercial','RETORNO COMERCIAL','Houve mensagem do técnico sem resposta e intervalo superior a 24 horas',2,
      'Olá! Tudo bem? Gostaria de saber se ainda precisa de ajuda com o equipamento. Estamos à disposição.');
  }
  return result('acompanhamento','ACOMPANHAR','Sem evidência suficiente para uma conclusão ou cobrança imediata',0);
}
