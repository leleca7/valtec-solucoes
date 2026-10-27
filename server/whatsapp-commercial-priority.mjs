// Leitura comercial conservadora: consulta histórico sem alterar CRM nem enviar mensagens.
const norm = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
export const known = (v) => {
  const s = String(v || '').trim();
  return /^(?:a confirmar|nao informado|não informado|desconhecido|n\/a|-|indefinido)$/i.test(norm(s)) ? '' : s;
};
const positive = (v) => Number.isFinite(Date.parse(v || '')) ? Date.parse(v) : 0;
const hoursSince = (stamp, now) => positive(stamp) ? Math.max(0, (now - positive(stamp)) / 3600000) : Infinity;
const has = (m, re) => re.test(norm(m.body || ''));
function response(kind, priority, label, reason, draft = '') {
  return { kind, priority, label, reason, draft };
}
export function leadEvidence(messages = []) {
  const ordered = [...messages].sort((a,b)=>positive(a.created_at) - positive(b.created_at));
  const inbound = ordered.filter(m=>m.direction === 'inbound' && (m.body || '').trim());
  const latest = inbound.at(-1);
  const texts = ordered.map(m=>({...m, n:norm(m.body)}));
  const explicitArea = [...inbound].reverse().find(m=>/\b(?:moro|resido|estou)\s+(?:no|na|em)\s+([a-z \u00c0-\u00ff]{3,45})/i.test(m.body||''));
  const area = explicitArea?.body?.match(/\b(?:moro|resido|estou)\s+(?:no|na|em)\s+([a-z \u00c0-\u00ff]{3,45})/i)?.[1]?.trim() || '';
  const problems = [...inbound].reverse().filter(m=>/\b(?:nao (?:acend|funcion|gel|esquent|liga)|sem funcionar|escapando gas|vazando gas|vazamento de gas|botao nao|bocas? sem|acende no fosforo|pino do acendimento)\b/i.test(norm(m.body)) && !/mais informacoes sobre isso/i.test(norm(m.body)));
  return {
    latest,
    inbound,
    ordered,
    area: known(area),
    problem: known(problems[0]?.body || ''),
    lastText: norm(latest?.body),
    raw: texts
  };
}
export function triageCase({thread = {}, lead = {}, messages = [], orders = [], now = new Date(), manualStatus = ''} = {}) {
  const current = new Date(now).getTime();
  const ev = leadEvidence(messages);
  const all = ev.ordered;
  const last = all.at(-1);
  const lastOwner = [...all].reverse().find(m=>m.direction === 'outbound');
  const lastClient = [...all].reverse().find(m=>m.direction === 'inbound');
  const hrs = hoursSince(last?.created_at || thread.last_message_at, current);
  const ownerHrs = hoursSince(lastOwner?.created_at || thread.last_outbound_at, current);
  const clientHrs = hoursSince(lastClient?.created_at || thread.last_message_at, current);
  const history = all.map(m=>norm(m.body)).filter(Boolean);
  const technicianTexts = all.filter(m=>m.direction === 'outbound');
  const leadStatus = norm(lead.status);
  const orderDone = orders.some(o=>['concluido','finalizado'].includes(norm(o.status)) || Boolean(o.completed_at));
  const orderScheduled = orders.some(o=>positive(o.scheduled_for) > current && !['cancelado','concluido','finalizado'].includes(norm(o.status)));
  const outOfArea = technicianTexts.some(m => /(?:nao (?:estamos )?atend|fora (?:da|de) (?:area|regiao)|deslocamento|muito longe)/.test(norm(m.body)) && /(?:area|regiao|deslocamento|distancia|longe|local)/.test(norm(m.body)));
  const declined = ['perdido','cancelado','nao_atendido'].includes(leadStatus);
  const evidenceDone = all.some(m=>m.direction==='inbound' && (/comprovante(?:\.pdf)?/i.test(m.body||''))) &&
    technicianTexts.some(m=>/obrigad|deus aben[cç]oe/i.test(norm(m.body)));
  const scheduledTexts = technicianTexts.some(m=>/\b(?:agendad[oa]|marcad[oa]|combinad[oa] para)\b/i.test(norm(m.body)));
  const promiseSchedule = history.some(x=>/vc pode vir amanha|voce pode vir amanha/.test(x)) &&
    technicianTexts.some(m=>/\b(?:14 horas|8:30|as \d{1,2}(?::\d{2})?)/i.test(norm(m.body)));
  const futureTalk = ev.inbound.some(m=>/(?:entrarei em contato|vou entrar em contato|entro em contato|proxima semana|depois eu falo|depois eu retorno)/.test(norm(m.body)));
  const quoteShopping = ev.inbound.some(m=>/(?:aguard(?:ar|ando) os? outros? orcamentos?|pesquisando.*orcamento|levantando? o orcamento)/.test(norm(m.body)));
  const hazardous = ev.inbound.some(m=>/escapando gas|vazando gas|vazamento de gas|cheiro de gas/.test(norm(m.body)));
  const pendingMedia = lastClient && (!String(lastClient.body||'').trim()) && ['audio','video','image','document'].includes(lastClient.message_type || '');
  const priceMention = technicianTexts.some(m=>/r\$\s*\d|visita tecnica\s*\d|mao de obra\s*\d/.test(norm(m.body)));
  const hasConversation = all.length > 0;
  if (manualStatus === 'fora_area' || outOfArea) return response('fora_area',99,'Fora da área atendida','Técnico informou impossibilidade ou custo de deslocamento. Não retomar automaticamente.');
  if (manualStatus === 'concluido' || orderDone || ['concluido','convertido','finalizado'].includes(leadStatus))
    return response('concluido',90,'Serviço concluído','Conferir se avaliação já foi solicitada; nunca mandar sem revisão.');
  if (manualStatus === 'visita_marcada' || orderScheduled || scheduledTexts)
    return response('visita',85,'Visita combinada','Conferir data/horário; não solicitar novamente dados da triagem.');
  if (manualStatus === 'aguardar_cliente')
    return response('aguardar_cliente',75,'Cliente pediu para aguardar','Sem insistência. Retorno leve somente se fizer sentido.');
  if (manualStatus === 'orcamento')
    return response('orcamento',3,'Orçamento em avaliação','Preparar um retorno curto, sem inventar desconto ou preço.','Olá! Passando para saber se ainda precisa de ajuda com o atendimento. Se quiser dar continuidade, estou à disposição.');
  if (declined) return response('encerrado',95,'Encerrado no cadastro','Não abordar novamente sem novo contato do cliente.');
  if (evidenceDone) return response('confirmar_conclusao',60,'Provável serviço concluído','Há comprovante e agradecimento. Confirmar execução antes de pedir avaliação.');
  if (promiseSchedule)
    return response('alinhar_visita',7,'Visita em alinhamento','Cliente pediu visita e houve proposta de horário. Confirmar agendamento sem repetir triagem.');
  if (futureTalk && !quoteShopping && clientHrs < 72)
    return response('aguardar_cliente',76,'Cliente disse que retornará','Respeitar prazo informado. Ainda não é caso de cobrança.');
  if (futureTalk && !quoteShopping)
    return response('retorno_leve',6,'Recontato delicado','Cliente indicou que retornaria. Verificar se deseja retomar, sem pressionar.','Olá! Passando para saber se ainda precisa de ajuda com seu atendimento. Caso prefira falar em outro momento, sem problema.');
  if (quoteShopping && clientHrs >= 36)
    return response('orcamento',3,'Aguardando outros orçamentos','Retomar com educação, sem repetir um valor não confirmado.','Olá! Passando para saber se ainda precisa de ajuda com o seu atendimento. Caso queira continuar, estou à disposição.');
  if (quoteShopping)
    return response('aguardar_orcamento',77,'Comparando orçamentos','Aguardar um período razoável antes de novo contato.');
  if (pendingMedia)
    return response('revisar_midia',2,'Verificar mídia ou áudio','Há mídia recente sem transcrição confiável. Não presumir o conteúdo.');
  if (hazardous && !scheduledTexts)
    return response('seguranca',1,'Prioridade técnica: gás','Situação relatada exige avaliação humana; não sugerir procedimentos ou diagnóstico à distância.');
  if (last?.direction === 'inbound' && (clientHrs > 0.08 || thread.human_required))
    return response('responder',1,'Cliente aguardando resposta','Ler a última pergunta antes de propor nova triagem.');
  if (last?.direction === 'outbound' && ownerHrs >= 24)
    return response('sem_retorno',5,'Sem retorno após contato','Considerar uma retomada contextual, sem reapresentação longa.','Olá! Conseguiu verificar as informações que combinamos? Se ainda precisar do atendimento, posso ajudar a dar continuidade.');
  if (hasConversation)
    return response('acompanhamento',80,'Acompanhar','Sem ação urgente identificada; evitar mensagens repetitivas.');
  return response('triagem',10,'Novo atendimento','Informações insuficientes; fazer uma pergunta por vez.');
}