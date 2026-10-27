// Respostas determinísticas para o assistente privado da Valtec.
// Nunca presume diagnóstico, valor, disponibilidade ou agendamento.
const clean = (value, limit = 250) => String(value || '')
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, limit);

export function assistantPhone(value) {
  let phone = String(value || '').replace(/\D/g, '');
  if (phone && !phone.startsWith('55')) phone = '55' + phone;
  if (/^55\d{2}[6-9]\d{7}$/.test(phone)) phone = phone.slice(0, 4) + '9' + phone.slice(4);
  return phone;
}

export function customerWhatsAppLink(phone, draft) {
  const normalized = assistantPhone(phone);
  if (!/^55\d{10,11}$/.test(normalized) || !clean(draft, 3000)) return '';
  return 'https://wa.me/' + normalized + '?text=' + encodeURIComponent(clean(draft, 3000));
}

export function safeCustomerDraft({ name, equipment, issue, neighborhood, requestPhoto = false } = {}) {
  const firstName = clean(name, 70).split(' ')[0];
  const device = clean(equipment, 100);
  const defect = clean(issue, 190);
  const area = clean(neighborhood, 100);
  const intro = 'Olá' + (firstName && !/^(cliente|whatsapp)$/i.test(firstName) ? ', ' + firstName : '') + '! ';
  let draft = intro + 'Recebemos sua mensagem';
  if (device) draft += ' sobre ' + device;
  draft += '. ';
  if (defect) draft += 'Anotamos o problema informado: ' + defect + '. ';
  if (!device) draft += 'Pode nos informar qual é o equipamento e a marca? ';
  if (!defect) draft += 'Pode descrever o que está acontecendo com ele? ';
  if (!area) draft += 'Em qual bairro você está? ';
  if (requestPhoto) draft += 'Se possível, pode enviar uma foto do equipamento? ';
  draft += 'Vamos conferir as informações para orientar o próximo passo do atendimento.';
  return draft.trim();
}

export function composeServiceRecord({ name, phone, equipment, issue, neighborhood } = {}) {
  return [
    'VALTEC — FICHA DE ATENDIMENTO (RASCUNHO)',
    'Cliente: ' + (clean(name, 90) || 'A confirmar'),
    'Contato: ' + (assistantPhone(phone) || 'A confirmar'),
    'Equipamento: ' + (clean(equipment, 100) || 'A confirmar'),
    'Relato do cliente: ' + (clean(issue, 250) || 'A confirmar'),
    'Bairro: ' + (clean(neighborhood, 90) || 'A confirmar'),
    'Diagnóstico técnico: não realizado',
    'Valor: não informado',
    'Visita: não agendada',
    'Documento para revisão e aprovação do responsável.'
  ].join('\n');
}

export function parseOwnerCommand(text) {
  const input = String(text || '').trim();
  const upper = input.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (/^(AJUDA|MENU|INICIO|OL[AÁ])\s*[!.]?$/.test(upper)) return { type: 'help' };
  if (/^(PENDENTES|FILA|ATENDIMENTOS)$/.test(upper)) return { type: 'pending' };
  if (/^(ABRIR|LINK|ENVIAR)$/.test(upper)) return { type: 'open' };
  if (/^(DOCUMENTO|FICHA|RELATORIO)$/.test(upper)) return { type: 'record' };
  const attend = input.match(/^(?:ATENDER|CLIENTE)\s+(.+)$/i);
  if (attend) return { type: 'attend', value: clean(attend[1], 90) };
  const exact = input.match(/^(?:TEXTO|MENSAGEM)\s*:\s*([\s\S]+)$/i);
  if (exact) return { type: 'replace', value: String(exact[1]).trim().slice(0, 3000) };
  const correction = input.match(/^(?:AJUSTAR|CORRIGIR|ALTERAR)\s*:\s*([\s\S]+)$/i);
  if (correction) {
    const instruction = correction[1].trim();
    const field = instruction.match(/^(equipamento|aparelho|bairro|defeito|problema)\s*:\s*(.+)$/i);
    if (field) return { type: 'field', field: /equipamento|aparelho/i.test(field[1]) ? 'equipment' : /bairro/i.test(field[1]) ? 'neighborhood' : 'issue', value: clean(field[2], 200) };
    if (/foto|imagem/i.test(instruction) && /ped|solicit|envi|mand|precis/i.test(instruction)) return { type: 'photo' };
    return { type: 'unclear', value: instruction };
  }
  return { type: 'unknown' };
}

export const ownerHelp = [
  'ASSISTENTE VALTEC — COMANDOS',
  'PENDENTES — ver clientes que aguardam retorno',
  'ATENDER 55719XXXXXXXX — selecionar cliente',
  'AJUSTAR: pedir foto do equipamento',
  'AJUSTAR: equipamento: Fogão Brastemp',
  'AJUSTAR: bairro: Itapuã',
  'AJUSTAR: defeito: não acende',
  'TEXTO: [sua mensagem completa]',
  'DOCUMENTO — ficha de atendimento sem preços inventados',
  'ABRIR — link para o WhatsApp do cliente; o envio é manual',
  'Nada é enviado automaticamente ao cliente.'
].join('\n');
