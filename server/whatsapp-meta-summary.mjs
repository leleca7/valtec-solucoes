// Extrai somente triagens estruturadas enviadas pelo canal comercial.
// Conteúdo gerado por IA não confirma pagamento, agenda, execução ou diagnóstico.
const placeholders = /^(?:nao informado|nao informada|a confirmar|desconhecido|nao sei|pendente|n\/a|\[.*\]|-+)$/i;
const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
const nonEmpty = (value) => {
  const trimmed=String(value || '').replace(/^\s*[*_`]+|[*_`]+\s*$/g,'').trim();
  return trimmed && !placeholders.test(normalize(trimmed)) ? trimmed : '';
};
export function extractMetaServiceSummary(text='') {
  const source=String(text || '');
  if (!/resumo\s+(?:do|de)\s+(?:seu\s+)?atendimento/i.test(normalize(source))) return null;
  const known={};
  for (const line of source.split(/\r?\n/)) {
    const match=line.match(/^\s*[*_`]*(Cliente|Equipamento|Problema|Bairro|Endere[cç]o|Refer[eê]ncia|Marca|Modelo)\s*:\s*[*_`]*(.*?)\s*$/i);
    if (!match) continue;
    const key=normalize(match[1]);
    const value=nonEmpty(match[2]);
    if (!value || known[key]) continue;
    known[key]=value.slice(0,350);
  }
  // Exigir triagem suficiente impede que listas de campos vazios virem cadastros.
  if (!known.equipamento || !known.problema || !known.bairro) return null;
  const equipment = known.marca && !normalize(known.equipamento).includes(normalize(known.marca))
    ? known.equipamento+' '+known.marca : known.equipamento;
  return {
    customer_name: known.cliente || '',
    equipment,
    problem: known.problema,
    neighborhood: known.bairro,
    address: known.endereco || '',
    reference_point: known.referencia || '',
    model: known.modelo || ''
  };
}
export function metaSummaryLeadPatch(text='',lead={}) {
  const data=extractMetaServiceSummary(text);
  if (!data) return {};
  const patch={};
  const genericName=!nonEmpty(lead.customer_name) || /^(cliente whatsapp|cliente sem nome)$/i.test(String(lead.customer_name||'').trim());
  if (data.customer_name && genericName) patch.customer_name=data.customer_name;
  if (data.equipment && !nonEmpty(lead.equipment)) patch.equipment=data.equipment;
  if (data.problem && (!Array.isArray(lead.problems) || !lead.problems.some(nonEmpty)) && !nonEmpty(lead.description)) {
    patch.problems=[data.problem];
    patch.description=data.problem;
  }
  if (data.neighborhood && !nonEmpty(lead.neighborhood)) patch.neighborhood=data.neighborhood;
  if (data.address && !nonEmpty(lead.address)) patch.address=data.address;
  if (data.reference_point && !nonEmpty(lead.reference_point)) patch.reference_point=data.reference_point;
  if (Object.keys(patch).length) patch.updated_at=new Date().toISOString();
  return patch;
}
