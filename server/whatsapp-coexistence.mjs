// Eventos opcionais de coexistência com o WhatsApp Business App.
// Exige assinatura da Meta em smb_message_echoes; sem ela, o app não é visível à API.
export function extractBusinessAppEchoes(change) {
  if (change?.field !== 'smb_message_echoes') return [];
  const items = change?.value?.message_echoes;
  if (!Array.isArray(items)) return [];
  return items.filter((item) =>
    item && typeof item === 'object' &&
    typeof item.to === 'string' && item.to.replace(/\D/g, '').length >= 10 &&
    typeof item.id === 'string' && item.id.length > 0 &&
    ['text','image','video','audio','document','interactive','location'].includes(item.type)
  );
}

export function feedbackSignal(text) {
  const normalized = String(text || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) return 'unknown';
  // Questões sem resolver têm prioridade sobre elogios eventuais.
  if (/\b(nao resolveu|nao ficou bom|ficou ruim|continua com defeito|ainda nao funciona|voltou a dar problema|insatisfeit[oa]|reclamac(?:ao|oes))\b/.test(normalized)) return 'issue';
  if (/\b(ficou otimo|ficou excelente|muito satisfeit[oa]|servico muito bom|funcionando perfeitamente|resolvido|problema resolvido|gostei do servico)\b/.test(normalized)) return 'positive';
  return 'unknown';
}

export function conversationAttention(thread = {}, now = Date.now()) {
  if (['personal','supplier','ignore'].includes(thread.contact_type)) return 'fora_do_fluxo';
  if (thread.human_required) return 'aguardando_tecnico';
  if (!thread.lead_id && !thread.client_id) return 'aguardando_classificacao';
  const lastInbound = Date.parse(thread.last_inbound_at || '') || 0;
  const lastStaffReply = Date.parse(thread?.conversation_context?.latest_staff_reply_at || '') || 0;
  if (lastInbound > lastStaffReply && !thread.human_required) return 'em_triagem';
  if (lastStaffReply > 0 && lastStaffReply >= lastInbound) {
    if (now - lastStaffReply > 24 * 60 * 60 * 1000) return 'retorno_pendente';
    return 'aguardando_cliente';
  }
  return 'em_acompanhamento';
}
