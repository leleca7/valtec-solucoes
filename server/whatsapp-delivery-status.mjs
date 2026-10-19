// Nunca gravar um payload completo de status de envio: pode trazer identificadores pessoais.
// Guardar apenas código, título e descrição curta enviados pela Meta.
export function metaDeliveryFailure(status = {}) {
  if (status.status !== 'failed') return null;
  const source = (Array.isArray(status.errors) ? status.errors[0] : null) || {};
  const code = Number(source.code);
  const compact = (value, limit) => String(value || '').replace(/[\r\n\t]/g, ' ').trim().slice(0, limit);
  return {
    code: Number.isSafeInteger(code) && code > 0 ? code : null,
    title: compact(source.title, 160),
    details: compact(source.error_data?.details, 320)
  };
}

export function isLatestUndeliveredReply(thread = {}, failureAt = '') {
  const failed = Date.parse(failureAt) || 0;
  const latestHuman = Date.parse(thread?.conversation_context?.latest_staff_reply_at || '') || 0;
  return failed > 0 && failed >= latestHuman;
}
