// Recupera somente informações declaradas pelo cliente no histórico.
// Não inventa diagnóstico, bairro, preço, agendamento ou outros dados.
const clean = (value, limit = 230) => String(value || '')
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim().slice(0, limit);
const norm = text => clean(text, 1000).normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function recoverCustomerFactsFromHistory(messages = []) {
  const inbound = (Array.isArray(messages) ? messages : [])
    .filter(m => m?.direction === 'inbound' && m?.message_type === 'text' && typeof m?.body === 'string')
    .slice().sort((a, b) => Date.parse(b.created_at || '') - Date.parse(a.created_at || ''));
  let issue = '';
  let neighborhood = '';
  for (const m of inbound) {
    const body = clean(m.body, 260);
    const text = norm(body);
    if (!issue && body.length >= 10 && body.length <= 260 && (
      /\b(?:boca|bocas|botao|acendedor|chama|forno|geladeira|fogao)\b.{0,95}\b(?:desregulad|nao funciona|nao acende|sem funcionar|afundou|quebrou|colocou|apagando|defeito|estragad|entupid|acende so|so acende)\b/.test(text) ||
      /\b(?:nao|num)\s+(?:acend|funcion|lig|esquent|gel)[a-z]*\b/.test(text) ||
      /\b(?:vazamento|escapando gas|cheiro de gas|vazando gas|quebrou|desregulad|entupid)[a-z]*\b/.test(text) ||
      /\b(?:problema|defeito)\b.{0,40}\b(?:e|esta|ta|foi|sao)\b/.test(text)
    )) {
      issue = body;
    }
    if (!neighborhood) {
      const explicit = body.match(/\b(?:bairro\s*:\s*|moro\s+(?:aqui\s+)?em\s+|sou\s+do\s+bairro\s+)([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'\s-]{1,50})/i);
      if (explicit) {
        const candidate = clean(explicit[1], 60).replace(/\s+(?:e|mas|pois|porque|perto|na\s+rua|rua|avenida|travessa)\b[\s\S]*$/i, '').trim();
        if (candidate.length >= 3 && candidate.split(/\s+/).length <= 6 && !/\b(?:qual|voce|atende|pode|bairro|endereco)\b/i.test(candidate)) {
          neighborhood = candidate;
        }
      }
    }
    if (issue && neighborhood) break;
  }
  return {issue, neighborhood};
}
