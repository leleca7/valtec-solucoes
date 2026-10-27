// Triagem curta e reutilizável no WhatsApp e no simulador interno.
// Nenhum diagnóstico ou preço automático: o técnico confirma o atendimento.

export function intakeWelcomeMessage() {
  return [
    'Olá! 👋 Sou o assistente da *Valtec Soluções*, do técnico Valdemir.',
    'Obrigado por chamar! 🔧',
    '',
    'Para começar, em qual bairro você precisa do atendimento?',
    '',
    'Se desejar, pode enviar uma foto ou vídeo para facilitar a análise. Não é obrigatório.'
  ].join('\n');
}

function stripAccents(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function isGenericInterest(text) {
  const norm = stripAccents(text).replace(/\s+/g, ' ');
  if (!norm) return false;
  return /(?:mais informac(?:ao|oes)|tenho interesse|gostaria de saber mais|queria saber mais|quero saber mais|vi (?:seu |o )?anuncio|gostaria de (?:um )?orcamento)/.test(norm);
}

export function isAdTemplateGreeting(text) {
  const norm = stripAccents(text).replace(/[?!.,]/g, ' ').replace(/\s+/g, ' ').trim();
  if (norm.length > 160) return false;
  return /^(?:oi |ola |bom dia |boa tarde |boa noite )*(?:posso ter mais informacoes(?: sobre isso)?|gostaria de mais informacoes(?: sobre isso)?|quero saber mais(?: sobre isso)?|queria saber mais(?: sobre isso)?|tenho interesse(?: no anuncio| nos servicos| em atendimento)?|gostaria de atendimento|gostaria de um orcamento|vi seu anuncio e tenho interesse)$/.test(norm);
}

function cleanField(value, maxLength) {
  const v = String(value || '').replace(/\s+/g, ' ').trim();
  if (!v || v.length > maxLength) return '';
  if (/^(?:[-•:.]|\?+|a confirmar|nao sei|não sei)$/i.test(v)) return '';
  return v;
}

export function extractIntakeForm(text) {
  const fields = {};
  const numbered = {};
  for (const rawLine of String(text || '').split(/\r?\n/).slice(0, 20)) {
    const line = rawLine.trim().replace(/\*/g, '').trim();
    if (!line) continue;
    const numberOnly = line.match(/^([123])\s*[\).:\-]\s*(.+)$/);
    const segment = numberOnly ? numberOnly[2] : line;
    const labeled = segment.match(/^(?:(?:📍|🔥|🔧)\s*)?(bairro|local(?: do atendimento)?|equipamento(?:\s*(?:e|\/)\s*(?:marca|modelo)(?:\/modelo)?)?|marca\s*(?:e|\/)\s*modelo|modelo|tipo(?: de equipamento)?|problema|defeito|o que (?:est[aá] acontecendo|aconteceu))\s*[:\-]\s*(.+)$/i);
    if (labeled) {
      const name = stripAccents(labeled[1]);
      const value = cleanField(labeled[2], name.includes('problema') || name.includes('defeito') || name.includes('aconte') ? 500 : 150);
      if (!value) continue;
      if (/bairro|local/.test(name)) fields.neighborhood = value;
      else if (/equipamento|tipo/.test(name)) fields.equipment = value;
      else if (/modelo|marca/.test(name)) fields.model = value;
      else fields.problem = value;
    } else if (numberOnly) {
      numbered[numberOnly[1]] = cleanField(segment, numberOnly[1] === '3' ? 500 : 150);
    }
  }
  // A pessoa pode informar o bairro naturalmente, sem copiar o formulário.
  // Ex.: "Preciso de atendimento para um fogão no bairro Boca do Rio."
  if (!fields.neighborhood) {
    const mentioned = String(text || '').match(/\b(?:no|na|do|em)\s+bairro\s+(?:de\s+)?([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9' -]{1,70})(?=[.!?;,\n]|$)/i);
    if (mentioned) {
      const location = mentioned[1].split(/\s+(?:mas|porque|pois|e\s+(?:o|a|meu|minha)|com\s+(?:o|a))\b/i)[0];
      const validLocation = cleanField(location, 80);
      if (validLocation) fields.neighborhood = validLocation;
    }
  }
  if (!fields.neighborhood && numbered[1]) fields.neighborhood = numbered[1];
  if (!fields.equipment && numbered[2]) fields.equipment = numbered[2];
  if (!fields.problem && numbered[3]) fields.problem = numbered[3];
  if (fields.model) {
    if (fields.equipment && !stripAccents(fields.equipment).includes(stripAccents(fields.model))) {
      fields.equipment = (fields.equipment + ' — ' + fields.model).slice(0, 200);
    } else if (!fields.equipment) {
      fields.equipment = fields.model;
    }
    delete fields.model;
  }
  return fields;
}

export function nextIntakeQuestion(missing = []) {
  if (missing.includes('neighborhood')) return 'Qual é o bairro onde precisa do atendimento?';
  if (missing.includes('equipment')) return 'Qual é o equipamento e, se souber, a marca ou modelo? (Ex.: fogão Consul 4 bocas)';
  if (missing.includes('problem')) return 'E qual problema está apresentando? Pode explicar do seu jeito.';
  return '';
}

export function intakeDoneMessage({ equipment = '', problem = '', neighborhood = '' } = {}) {
  return [
    'Obrigado! ✅ Já organizei sua solicitação para o técnico Valdemir:',
    '📍 Bairro: ' + (neighborhood || 'A confirmar'),
    '🔥 Equipamento: ' + (equipment || 'A confirmar'),
    '🔧 Problema: ' + (problem || 'A confirmar'),
    '',
    'Ele continuará o atendimento por aqui e poderá confirmar avaliação, disponibilidade e valores.',
    'Se quiser, pode enviar uma foto ou vídeo depois, mas não é obrigatório.'
  ].join('\n');
}
