// Menu operacional no WhatsApp: opções curtas, com lista interativa e fallback por números.
export const ownerMenuItems = Object.freeze([
  {id:'menu_today',title:'📅 Atender hoje',description:'Visitas registradas para hoje',filter:'today'},
  {id:'menu_unanswered',title:'💬 Sem resposta',description:'Clientes precisando de resposta',filter:'unanswered'},
  {id:'menu_quotes',title:'🧾 Orçamentos',description:'Orçamentos pendentes ou em análise',filter:'quotes'},
  {id:'menu_reviews',title:'⭐ Avaliações',description:'Pós-venda e avaliação a conferir',filter:'reviews'},
  {id:'menu_followups',title:'🔔 Retornos',description:'Acompanhamentos e lembretes',filter:'followups'},
  {id:'menu_visits',title:'🔧 Visitas',description:'Visitas combinadas e serviços',filter:'visits'},
  {id:'menu_done',title:'✅ Concluídos',description:'Serviços realizados e confirmados',filter:'done'},
  {id:'menu_pending',title:'📋 Prioridades',description:'Resumo comercial prioritário',filter:'priority'}
]);

export const ownerMenuText = [
  '👋 Olá, Valdemir! O que deseja fazer agora?',
  '',
  ...ownerMenuItems.map((x,i)=>(i+1)+'. '+x.title),
  '',
  'Responda com o número desejado.',
  '0 — Voltar ao menu',
  'Para selecionar um cliente: ATENDER + telefone.'
].join('\n');

export function ownerMenuInteractive() {
  return {
    type:'interactive',
    interactive: {
      type:'list',
      body:{text:'👋 Olá, Valdemir! O que deseja fazer agora? Escolha uma opção abaixo.'},
      footer:{text:'Valtec • assistente privado'},
      action:{
        button:'📋 Abrir menu',
        sections:[{title:'Meus atendimentos',rows:ownerMenuItems.map(x=>({
          id:x.id,title:x.title,description:x.description
        }))}]
      }
    }
  };
}

export function parseOwnerMenu(text) {
  const raw=String(text || '').trim();
  const n=raw.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(/^(menu|inicio|voltar|0|ajuda)$/i.test(n)) return {type:'menu'};
  if(/^(sair|fechar)$/i.test(n)) return {type:'menu'};
  const digit=/^[1-8]$/.test(n)?Number(n)-1:-1;
  const found=digit>=0?ownerMenuItems[digit]:ownerMenuItems.find(x=>x.id===n);
  return found?{type:'queue',filter:found.filter}:null;
}

export function currentBahiaDay(date=new Date()) {
  return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bahia',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}
function orderDay(order={}) {
  const when=order.scheduled_for;
  if(!when) return '';
  const parsed=new Date(when);
  return Number.isNaN(parsed.getTime())?'':currentBahiaDay(parsed);
}

export function filterAssistantMenuQueue(assessed, filter, today=currentBahiaDay()) {
  const items=(assessed||[]);
  const pick=x=>{
    const cat=x.evaluation?.category||'';
    const next=String(x.lead?.next_action||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    switch(filter){
      case 'today': return cat==='retorno_programado'||(cat==='visita_programada' && orderDay(x.order)===today);
      case 'unanswered': return ['responder_cliente','triagem_inicial','audio_a_revisar','midia_a_revisar'].includes(cat);
      case 'quotes': return /(?:enviar|preparar|concluir)\s+(?:o\s+)?orcamento/.test(next)||cat==='orcamento_em_avaliacao';
      case 'reviews': return ['pos_venda','conclusao_a_conferir'].includes(cat)||/avaliacao|pos.venda/.test(next);
      case 'followups': return ['retorno_programado','cliente_prometeu_retorno','retorno_comercial','aguardando_midia','orcamento_em_avaliacao'].includes(cat);
      case 'visits': return ['visita_programada','visita_a_conferir','conclusao_a_conferir'].includes(cat);
      case 'done': return cat==='pos_venda';
      default: return (x.evaluation?.priority||0)>=2;
    }
  };
  return items.filter(pick).sort((a,b)=>(b.evaluation?.priority||0)-(a.evaluation?.priority||0)
    ||Date.parse(b.thread?.last_message_at||'')-Date.parse(a.thread?.last_message_at||'')).slice(0,8);
}

export function renderAssistantMenuQueue(items,filter) {
  const names={
    today:'📅 ATENDIMENTOS DE HOJE',
    unanswered:'💬 CLIENTES SEM RESPOSTA',
    quotes:'🧾 ORÇAMENTOS A CONFERIR',
    reviews:'⭐ PÓS-VENDA / AVALIAÇÕES A CONFERIR',
    followups:'🔔 RETORNOS A ACOMPANHAR',
    visits:'🔧 VISITAS / SERVIÇOS A CONFERIR',
    done:'✅ SERVIÇOS CONCLUÍDOS',
    priority:'📋 PRIORIDADES'
  };
  const title=names[filter]||'ATENDIMENTOS';
  if(!items.length) return title+'\n\nNenhum caso identificado com dados suficientes neste momento.'+
    '\nSe algum atendimento não estiver atualizado no sistema, informe o resultado ao assistente.'+
    '\n\n0 — Voltar ao menu';
  return title+'\n\n'+items.map((x,i)=>
    (i+1)+'. '+(x.thread?.display_name||'Cliente')+
    '\n'+(x.evaluation?.label||'Conferir atendimento')+
    '\n'+(x.evaluation?.reason||'Revisar o histórico')+
    '\nATENDER '+String(x.thread?.phone||'').replace(/\D/g,'')
  ).join('\n\n')+
    '\n\nAs situações são sugestões; confirme antes de enviar qualquer coisa ao cliente.'+
    '\n0 — Voltar ao menu';
}
