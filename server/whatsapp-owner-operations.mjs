// Interpretação restrita: sem IA paga, mudanças só após confirmação do técnico.
function normalized(input) {
  return String(input || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[!.?,;:]+$/g, '').replace(/\s+/g, ' ').trim();
}
export function parseOwnerOperationalCommand(text) {
  const n=normalized(text);
  if (/^(?:confirmar|confirmo|sim confirmo|pode confirmar)$/.test(n)) return {type:'confirm_state'};
  if (/^(?:cancelar|nao confirmar|cancela|descartar)$/.test(n)) return {type:'cancel_state'};
  if (/^(?:ja fiz (?:esse|o) servico|servico (?:ja )?(?:feito|concluido|finalizado)|ja conclui o servico|ja atendi (?:esse|essa) cliente)$/.test(n))
    return {type:'propose_state',status:'servico_realizado'};
  if (/^(?:cliente nao fechou|(?:ela|ele) nao fechou|nao fechou(?: o servico| o orcamento)?|cliente desistiu|cliente recusou o orcamento)$/.test(n))
    return {type:'propose_state',status:'nao_fechou'};
  if (/^(?:nao atendemos (?:essa|esta) area|(?:cliente |servico )?fora da area|deslocamento inviavel)$/.test(n))
    return {type:'propose_state',status:'fora_area'};
  if (/^(?:retornar|retorno|me lembre(?: de retornar| de ligar| de cobrar)?|lembrar de retornar) amanha$/.test(n) ||
      /^(?:amanha (?:preciso )?(?:retornar|ligar|falar com (?:ele|ela)))$/.test(n))
    return {type:'propose_state',status:'retorno_agendado',day:'tomorrow'};
  return null;
}
export function todayBahia(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bahia',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export function tomorrowBahia(now = new Date()) {
  const current=todayBahia(now);
  const d=new Date(current+'T12:00:00Z');
  if (!Number.isFinite(d.getTime())) throw new Error('Data da Bahia inválida');
  return new Date(d.getTime()+86400000).toISOString().slice(0,10);
}
export function ownerStatusLabel(status) {
  return ({
    servico_realizado:'SERVIÇO REALIZADO (CONFIRMADO PELO TÉCNICO)',
    nao_fechou:'NÃO FECHOU (CONFIRMADO PELO TÉCNICO)',
    fora_area:'ÁREA NÃO ATENDIDA (CONFIRMADO PELO TÉCNICO)',
    retorno_agendado:'RETORNO PROGRAMADO PELO TÉCNICO'
  })[status] || 'SITUAÇÃO A CONFERIR';
}
export function noteEvaluation(note, day=todayBahia()) {
  if(!note?.status) return null;
  const reason='Situação registrada e confirmada pelo técnico no assistente privado.';
  if(note.status==='servico_realizado') return {category:'pos_venda',label:ownerStatusLabel(note.status),reason,priority:0,action:'Conferir pagamento e avaliação.'};
  if(note.status==='nao_fechou') return {category:'nao_fechou',label:ownerStatusLabel(note.status),reason,priority:0,action:'Não cobrar automaticamente.'};
  if(note.status==='fora_area') return {category:'fora_area_ou_encerrado',label:ownerStatusLabel(note.status),reason,priority:0,action:'Não insistir.'};
  if(note.status==='retorno_agendado') {
    const scheduled=/^\d{4}-\d{2}-\d{2}$/.test(note.follow_up_on||'') ? note.follow_up_on : '';
    if (!scheduled) return {category:'visita_a_conferir',label:'RETORNO SEM DATA — CONFERIR',reason,priority:1};
    return scheduled<=day
      ? {category:'retorno_programado',label:'RETORNAR HOJE OU ATRASADO',reason:'Técnico programou retorno para '+scheduled,priority:4}
      : {category:'retorno_futuro',label:'RETORNO PROGRAMADO PARA '+scheduled,reason,priority:0};
  }
  return null;
}
