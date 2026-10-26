// Fluxo de revisão do responsável: texto apenas, sem envios a clientes.
// Link wa.me abre a conversa correta e preenche a mensagem para aprovação humana.
const clean = v => String(v || '').trim().replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ');
const digits = v => String(v || '').replace(/\D/g, '');
const FIELDS = Object.freeze({bairro:'bairro',equipamento:'equipamento',modelo:'equipamento',problema:'problema',defeito:'problema',nome:'nome'});
export function safeClientPhone(phone){
  const value=digits(phone);
  return /^\d{12,13}$/.test(value) && value.startsWith('55') ? value : '';
}
export function clientChatLink(phone,text){
  const n=safeClientPhone(phone);
  const body=String(text||'').trim();
  if(!n || !body || body.startsWith('AÇÃO INTERNA:')) return '';
  return 'https://wa.me/'+n+'?text='+encodeURIComponent(body.slice(0,1800));
}
export function reviseOperatorDraft(draft,command){
  if(!draft || !safeClientPhone(draft.phone))return {error:'Nenhuma conversa comercial selecionada. Envie RESPOSTA seguido do telefone completo.'};
  const match=String(command||'').trim().match(/^([^:=]{2,25})\s*[:=]\s*([\s\S]+)$/);
  if(!match)return {error:'Envie AJUSTAR BAIRRO: Itapuã, AJUSTAR EQUIPAMENTO: Fogão, AJUSTAR PROBLEMA: Não acende ou TEXTO: sua resposta completa.'};
  const field=FIELDS[clean(match[1]).toLowerCase()];
  const value=clean(match[2]).slice(0,160);
  if(!field || !value)return {error:'Campo não reconhecido. Use BAIRRO, EQUIPAMENTO, PROBLEMA ou NOME. Datas e valores exigem confirmação separada.'};
  const facts={...(draft.facts||{}),[field]:value};
  const n=clean(facts.nome).split(' ')[0].slice(0,40);
  const greeting='Olá'+(n?', '+n:'')+'!';
  const factsDescription=[
    facts.equipamento ? 'o seu '+clean(facts.equipamento) : '',
    facts.problema ? 'com o problema informado ('+clean(facts.problema)+')' : '',
    facts.bairro ? 'em '+clean(facts.bairro) : ''
  ].filter(Boolean).join(', ');
  const text=greeting+' Recebi as informações'+(factsDescription?' sobre '+factsDescription:' do seu atendimento')+'. Vou conferir os próximos passos com a equipe e retorno por aqui.';
  return {draft:{...draft,facts,text:text.slice(0,1200),updated_at:new Date().toISOString(),source:'structured_review'}};
}
export function replaceOperatorDraft(draft,text){
  if(!draft || !safeClientPhone(draft.phone))return {error:'Primeiro selecione um cliente usando RESPOSTA e o telefone.'};
  const value=String(text||'').trim();
  if(value.length<8||value.length>1400)return {error:'Envie uma mensagem completa entre 8 e 1400 caracteres.'};
  if(/^AÇÃO INTERNA:/i.test(value))return {error:'Orientações internas não devem ser enviadas ao cliente.'};
  return {draft:{...draft,text:value,updated_at:new Date().toISOString(),source:'operator_text'}};
}
export function readableDraft(draft){
  const link=clientChatLink(draft?.phone,draft?.text);
  if(!link)return 'Sem mensagem pronta para envio. Confira o cadastro e a classificação da conversa.';
  return [
    'RESPOSTA PRONTA PARA CONFERIR',
    'Cliente: '+clean(draft.name||'Cliente'),
    '',
    String(draft.text||'').slice(0,1400),
    '',
    'ABRIR O CLIENTE COM A MENSAGEM PREENCHIDA:',
    link,
    '',
    'Ao abrir o link, confira o destinatário e toque em ENVIAR no WhatsApp. O bot não envia ao cliente.',
    'Para corrigir: AJUSTAR BAIRRO: nome do bairro | AJUSTAR EQUIPAMENTO: modelo | AJUSTAR PROBLEMA: defeito',
    'Para escrever a mensagem inteira: TEXTO: sua resposta',
    'Para rever este texto: PRONTO'
  ].join('\n');
}
