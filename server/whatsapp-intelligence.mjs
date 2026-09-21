function normalize(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s:/.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function editDistance(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  if (!left) return right.length;
  if (!right) return left.length;
  const prev = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = prev[0];
    prev[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = prev[j];
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + cost);
      diagonal = above;
    }
  }
  return prev[right.length];
}

function hasApproxToken(text, target, maxDistance = 2) {
  const words = normalize(text).split(' ').filter(Boolean);
  return words.some((word) => Math.abs(word.length - target.length) <= maxDistance && editDistance(word, target) <= maxDistance);
}

function cleanKnown(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const normalized = normalize(text);
  if (['a confirmar', 'nao informado', 'não informado', 'desconhecido', 'n/a', '-'].includes(normalized)) return '';
  return text;
}

function cleanProblems(problems) {
  const list = Array.isArray(problems) ? problems : problems ? [problems] : [];
  return list.map(cleanKnown).filter(Boolean);
}

function stripDecorators(value = '') {
  return String(value || '').replace(/^\s*[*_`]+|[*_`]+\s*$/g, '').trim();
}

function structuredLine(text, label) {
  const source = String(text || '');
  const re = new RegExp(`(?:^|\\n)\\s*\\*?${label}:\\*?\\s*(.+)$`, 'im');
  const match = source.match(re);
  return stripDecorators(match?.[1] || '');
}

function parseStructuredFields(text) {
  const customerName = structuredLine(text, 'Cliente');
  const equipment = structuredLine(text, 'Equipamento');
  const problem = structuredLine(text, 'Problema');
  const neighborhood = structuredLine(text, 'Bairro');
  const address = structuredLine(text, 'Endereço');
  const referencePoint = structuredLine(text, 'Referência');
  const description = structuredLine(text, 'Descrição');
  const siteStructured = Boolean(customerName && equipment && neighborhood && (problem || description));
  return {
    siteStructured,
    customerName,
    equipment,
    problem,
    neighborhood,
    address,
    referencePoint,
    description
  };
}

function detectEquipment(text) {
  const n = normalize(text);
  if (!n) return '';
  if (/\b(fogao|fogam|fogaum|fgao)\b.*\bindustrial\b|\bindustrial\b.*\b(fogao|fogam|fogaum|fgao)\b/.test(n)) return 'Fogão industrial';
  if (/\bcook\s*top\b|\bcooktop\b/.test(n) || hasApproxToken(n, 'cooktop', 2)) return 'Cooktop';
  if (/\bforno\b/.test(n)) return 'Forno a gás';
  if (/\b(fogao|fogam|fogaum|fgao)\b/.test(n) || hasApproxToken(n, 'fogao', 2)) return 'Fogão residencial';
  if (/\bboca\b/.test(n) && /\b(chama|acende|entupid|fog)\b/.test(n)) return 'Fogão residencial';
  return '';
}

function detectProblem(text) {
  const raw = String(text || '').trim();
  const n = normalize(raw);
  if (!n) return '';

  if (/\b(cheiro|vazamento|vazando|vaza)\b.*\bgas\b|\bgas\b.*\b(vazamento|vazando|vaza)\b/.test(n)) return 'Vazamento ou cheiro de gás';
  if (/\b(n|nao|num)\s+(acende|ascende|liga|pega)\b|\bnao\s+ta\s+(acendendo|ligando|pegando)\b/.test(n)) return 'Não acende';
  if (/\bchama\b.*\b(fraca|baixa|fraquinha)\b/.test(n)) return 'Chama fraca';
  if (/\bchama\b.*\b(irregular|amarela|vermelha|alta|oscilando)\b/.test(n)) return 'Chama irregular';
  if (/\b(entupid|entupida|entupido|entupiu)\b/.test(n)) return 'Boca entupida';
  if (/\b(apaga|apagando|apaga sozinha|nao fica aceso|nao fica acesa)\b/.test(n)) return 'Está apagando';
  if (/\b(estala|estalando|faisca)\b/.test(n)) return raw;
  if (/\b(defeito|problema|quebrou|quebrado|conserto|consertar|manutencao)\b/.test(n)) return raw;
  return '';
}

function isGreeting(text) {
  const n = normalize(text);
  return /^(oi+|ola+|opa|e ai|ei|bom dia|boa tarde|boa noite|blz|beleza|hello|hey)[!. ]*$/.test(n);
}

function isSkipMedia(text) {
  const n = normalize(text);
  return ['pular', 'seguir', 'continuar', 'sem foto', 'sem video', 'nao tenho foto', 'nao tenho video', 'n tenho foto', 'n tenho video'].includes(n);
}

function inferIntent(text) {
  const n = normalize(text);
  const structured = parseStructuredFields(text);
  if (structured.siteStructured) return 'repair_request';
  if (!n) return 'unknown';
  if (/\b(falar|quero falar|atendente|humano|pessoa|profissional|tecnico)\b/.test(n)) return 'human';
  if (/\b(acompanhar|status|retorno|andamento)\b.*\borcamento\b|\borcamento\b.*\b(acompanhar|status|retorno|andamento)\b/.test(n)) return 'quote_followup';
  if (/\b(atende|atendem|atendimento)\b.*\b(bairro|regiao|area|aqui)\b/.test(n)) return 'service_area';
  if (detectEquipment(text) || detectProblem(text) || /\b(conserto|consertar|assistencia|manutencao|quebrou|defeito)\b/.test(n)) return 'repair_request';
  if (isGreeting(text)) return 'greeting';
  return 'unknown';
}

function missingLeadFields(lead = {}) {
  const missing = [];
  if (!cleanKnown(lead.equipment)) missing.push('equipment');
  if (!cleanProblems(lead.problems).length && !cleanKnown(lead.description)) missing.push('problem');
  if (!cleanKnown(lead.neighborhood)) missing.push('neighborhood');
  return missing;
}

function extractFacts({ text, expectedField = '' } = {}) {
  const raw = String(text || '').trim();
  const structured = parseStructuredFields(raw);
  const facts = {};

  if (structured.customerName) facts.customer_name = structured.customerName;
  if (structured.equipment) facts.equipment = structured.equipment;
  if (structured.problem) facts.problem = structured.problem;
  if (structured.neighborhood) facts.neighborhood = structured.neighborhood;
  if (structured.address) facts.address = structured.address;
  if (structured.referencePoint) facts.reference_point = structured.referencePoint;
  if (structured.description) facts.description = structured.description;
  if (structured.siteStructured) facts.source_hint = 'site';

  if (!facts.equipment) facts.equipment = detectEquipment(raw) || undefined;
  if (!facts.problem) facts.problem = detectProblem(raw) || undefined;

  if (expectedField === 'equipment' && !facts.equipment && raw && !isGreeting(raw) && raw.length <= 60) {
    facts.equipment = raw;
  }
  if (expectedField === 'problem' && !facts.problem && raw && !isGreeting(raw) && raw.length >= 4) {
    facts.problem = raw;
  }
  if (expectedField === 'neighborhood' && !facts.neighborhood && raw && !isGreeting(raw) && raw.length <= 80) {
    facts.neighborhood = raw;
  }

  return Object.fromEntries(Object.entries(facts).filter(([, value]) => value !== undefined && value !== ''));
}

function mergeLeadFacts(lead = {}, facts = {}) {
  const next = { ...lead };
  if (facts.customer_name) next.customer_name = facts.customer_name;
  if (facts.equipment) next.equipment = facts.equipment;
  if (facts.problem) {
    next.problems = [facts.problem];
    if (!facts.description) next.description = facts.problem;
  }
  if (facts.description) next.description = facts.description;
  if (facts.neighborhood) next.neighborhood = facts.neighborhood;
  if (facts.address) next.address = facts.address;
  if (facts.reference_point) next.reference_point = facts.reference_point;
  return next;
}

function problemSummary(lead = {}) {
  return cleanProblems(lead.problems)[0] || cleanKnown(lead.description) || '';
}

function contextSnapshot({ lead = {}, intent = 'unknown', mediaRequested = false, origin = '' } = {}) {
  return {
    known: {
      customer_name: cleanKnown(lead.customer_name) || null,
      equipment: cleanKnown(lead.equipment) || null,
      problem: problemSummary(lead) || null,
      neighborhood: cleanKnown(lead.neighborhood) || null,
      address: cleanKnown(lead.address) || null
    },
    missing: missingLeadFields(lead),
    intent,
    media_requested: Boolean(mediaRequested),
    origin: origin || cleanKnown(lead.source) || 'whatsapp'
  };
}

export {
  normalize,
  cleanKnown,
  cleanProblems,
  parseStructuredFields,
  detectEquipment,
  detectProblem,
  isGreeting,
  isSkipMedia,
  inferIntent,
  missingLeadFields,
  extractFacts,
  mergeLeadFacts,
  problemSummary,
  contextSnapshot
};
