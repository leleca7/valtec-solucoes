// Calculadora interna de preços: opera somente dentro da Central autenticada.
// A tabela abaixo é preliminar e pode ser ajustada após coleta de custos reais.
const DEFAULT_SERVICES = Object.freeze({
  diagnostico: {label:'Somente avaliação (sem reparo)', price:0},
  limpeza: {label:'Limpeza/desobstrução de uma boca', price:110},
  bico: {label:'Troca de um bico injetor', price:150},
  automatico: {label:'Correção simples do acendimento automático', price:110},
  eletrodo: {label:'Troca de um eletrodo/acendedor', price:130},
  usina: {label:'Troca da usina de ignição', price:150},
  valvula1: {label:'Troca de uma válvula', price:150},
  valvula2: {label:'Troca de duas válvulas', price:180},
  outro: {label:'Outro serviço (preencher valor)', price:0}
});
const $pricing = id => document.getElementById(id);
const brl = n => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n);
const asNumber = id => {
  const el=$pricing(id);
  const n=Number(el?.value);
  return el && el.value.trim()!=='' && Number.isFinite(n) && n>=0 ? n : 0;
};
function routeFee(km) {
  if(km<=3)return 40;
  if(km<=6)return 65;
  if(km<=10)return 90;
  if(km<=15)return 110;
  if(km<=20)return 130;
  return null;
}
let currentEstimate=null;
function setAmount(id,amount){$pricing(id).textContent=amount===null?'Sob consulta':brl(amount);}
// Estes valores são hipóteses editáveis, não tarifas oficiais da Uber.
const maybePrice = id => {
  const el=$pricing(id);
  if(!el || el.value.trim()==='')return null;
  const value=Number(el.value);
  return Number.isFinite(value)&&value>=0?value:null;
};
const roundToCents = n => Math.round((n+Number.EPSILON)*100)/100;
const roundUpFive = n => Math.ceil((n-1e-8)/5)*5;
function transportCosts(km){
  const type=$pricing('pricing-transport-type').value;
  const minutes=asNumber('pricing-trip-minutes');
  const technicianTime=roundToCents((minutes*2/60)*asNumber('pricing-travel-hour'));
  const diagnostic=asNumber('pricing-diagnostic-value');
  let transport=null,source='';
  if(type==='uber'){
    const simulated=asNumber('pricing-uber-base')+km*asNumber('pricing-uber-km')+minutes*asNumber('pricing-uber-minute');
    const quotedOut=maybePrice('pricing-uber-real-out');
    const quotedBack=maybePrice('pricing-uber-real-back');
    transport=roundToCents((quotedOut===null?simulated:quotedOut)+(quotedBack===null?simulated:quotedBack));
    source=quotedOut!==null&&quotedBack!==null?'Cotações reais informadas para ida e volta.'
      :quotedOut!==null||quotedBack!==null?'Uma cotação real e uma estimativa para o trajeto restante.'
      :'Uber simulado para ida e volta; confirme no aplicativo.';
  }else{
    const fuel=asNumber('pricing-own-fuel');
    const consumption=asNumber('pricing-own-consumption');
    const wear=asNumber('pricing-own-wear');
    if(consumption>0){
      transport=roundToCents(2*km*(fuel/consumption+wear));
      source='Veículo próprio: combustível + desgaste; total ida e volta.';
    }else source='Informe um consumo em km/litro maior que zero.';
  }
  const suggested=transport===null?null:roundUpFive(transport+technicianTime+diagnostic);
  return {type,minutes,transport,technicianTime,diagnostic,suggested,source};
}
function calculatePricing(){
  const km=asNumber('pricing-distance');
  const service=$pricing('pricing-service').value;
  const isWork=service!=='diagnostico';
  const work=isWork?asNumber('pricing-service-price'):0;
  const parts=isWork?asNumber('pricing-parts'):0;
  const extras=asNumber('pricing-extras');
  const transportType=$pricing('pricing-transport-type').value;
  $pricing('pricing-uber-box').classList.toggle('hidden',transportType!=='uber');
  $pricing('pricing-own-box').classList.toggle('hidden',transportType!=='own');
  const details=transportCosts(km);
  const tableVisit=routeFee(km);
  const visitMode=$pricing('pricing-visit-mode').value;
  const visitInput=$pricing('pricing-visit-manual').value.trim();
  const visit=visitInput!==''?asNumber('pricing-visit-manual'):
    visitMode==='detailed'?details.suggested:tableVisit;

  const discountMode=$pricing('pricing-discount-mode').value;
  $pricing('pricing-discount-mode').disabled=!isWork;
  $pricing('pricing-discount-custom').disabled=!isWork||discountMode!=='custom';
  $pricing('pricing-service-price').disabled=!isWork;
  $pricing('pricing-parts').disabled=!isWork;
  const discount=visit===null||!isWork?0:
    discountMode==='half'?roundToCents(visit*.5):
    discountMode==='custom'?Math.min(visit,asNumber('pricing-discount-custom')):0;
  const subtotal=visit===null?null:visit+work+parts+extras;
  const total=subtotal===null?null:Math.max(0,roundToCents(subtotal-discount));
  const alreadyPaid=$pricing('pricing-already-paid').checked;
  const outstanding=total===null?null:Math.max(0,roundToCents(total-(alreadyPaid?visit:0)));
  const risk=$pricing('pricing-leak').checked;

  setAmount('pricing-table-visit-output',tableVisit);
  setAmount('pricing-transport-cost-output',details.transport);
  setAmount('pricing-time-cost-output',details.technicianTime);
  setAmount('pricing-diagnostic-output',details.diagnostic);
  setAmount('pricing-visit-cost-output',details.suggested);
  setAmount('pricing-visit-output',visit);
  setAmount('pricing-service-output',work);
  setAmount('pricing-parts-output',parts);
  setAmount('pricing-extras-output',extras);
  setAmount('pricing-discount-output',-discount);
  setAmount('pricing-total-output',total);
  setAmount('pricing-rest-output',outstanding);
  $pricing('pricing-rest-row').hidden=!alreadyPaid;

  let comparison=details.source;
  if(details.suggested!==null&&tableVisit!==null){
    const gap=roundToCents(tableVisit-details.suggested);
    if(gap>0)comparison+=' A tabela fica '+brl(gap)+' acima da referência detalhada.';
    else if(gap<0)comparison+=' Atenção: a tabela fica '+brl(Math.abs(gap))+' abaixo da referência detalhada.';
    else comparison+=' A tabela e a referência detalhada coincidem.';
  }else if(tableVisit===null)comparison+=' Acima de 20 km, a tabela exige orçamento individual.';
  $pricing('pricing-compare-note').textContent=comparison;
  $pricing('pricing-visit-hint').textContent=visitInput!==''?
    'Valor da visita ajustado manualmente (prevalece sobre a tabela e a simulação).':
    visitMode==='detailed'?
      'Visita calculada pelo transporte de ida e volta + tempo de trajeto configurado + diagnóstico; arredondamento para cima em R$ 5.':
      km>20?'Acima de 20 km: informe uma visita manual ou selecione transporte calculado.':
      'Tabela atual por distância aplicada à visita. Os custos de transporte aparecem somente para comparação.';
  $pricing('pricing-warning').textContent=risk?
    'Suspeita de vazamento: a prioridade é a segurança. Não usar ou testar o equipamento; preço final somente após avaliação adequada por profissional habilitado.':
    'Preço preliminar interno. Confirme transporte, peças, tempo, condições de acesso e custos antes de aprovar.';
  $pricing('pricing-copy').disabled=total===null;
  currentEstimate={km,service,work,visit,parts,extras,discount,total,outstanding,alreadyPaid,risk,
    transportType,visitMode,details,tableVisit,manualVisit:visitInput!==''};
}
function selectedService(){
  const key=$pricing('pricing-service').value;
  $pricing('pricing-service-price').value=DEFAULT_SERVICES[key].price;
  if(key==='diagnostico'){
    $pricing('pricing-discount-mode').value='none';
    $pricing('pricing-parts').value='0';
  }
  calculatePricing();
}
function copyEstimate(){
  const x=currentEstimate;
  if(!x||x.total===null)return;
  const lines=[
    'VALTEC SOLUÇÕES — PRÉ-ORÇAMENTO',
    'Serviço: '+DEFAULT_SERVICES[x.service].label,
    'Distância de ida: '+x.km.toLocaleString('pt-BR')+' km',
    'Visita (deslocamento + diagnóstico): '+brl(x.visit),
    'Serviço / mão de obra: '+brl(x.work),
    'Peças e materiais: '+brl(x.parts),
    'Outras despesas: '+brl(x.extras),
    'Abatimento da visita: -'+brl(x.discount),
    'TOTAL: '+brl(x.total)
  ];
  if(x.alreadyPaid)lines.push('Saldo após visita já paga: '+brl(x.outstanding));
  if(x.risk)lines.push('Suspeita de vazamento: valor apenas indicativo; avaliação segura obrigatória antes de definir o reparo.');
  lines.push('Valores sujeitos a avaliação técnica e confirmação de peças. A visita integra o total e não é somada novamente.');
  const message=lines.join('\n');
  navigator.clipboard.writeText(message)
    .then(()=>$pricing('pricing-copy-status').textContent='Orçamento copiado!')
    .catch(()=>$pricing('pricing-copy-status').textContent='Cópia automática indisponível. Selecione os valores na tela para copiar.');
}
function resetPricing(){
  const defaults={
    'pricing-distance':'3','pricing-service':'bico','pricing-service-price':DEFAULT_SERVICES.bico.price,
    'pricing-parts':'0','pricing-extras':'0','pricing-visit-manual':'','pricing-discount-mode':'none',
    'pricing-discount-custom':'0','pricing-transport-type':'uber','pricing-visit-mode':'table',
    'pricing-uber-real-out':'','pricing-uber-real-back':'',
    'pricing-uber-base':'4','pricing-uber-km':'1.30','pricing-uber-minute':'0.22',
    'pricing-own-fuel':'6.43','pricing-own-consumption':'12','pricing-own-wear':'0.35',
    'pricing-trip-minutes':'20','pricing-diagnostic-value':'40','pricing-travel-hour':'0'
  };
  for(const [id,value] of Object.entries(defaults))$pricing(id).value=value;
  $pricing('pricing-already-paid').checked=false;
  $pricing('pricing-leak').checked=false;
  $pricing('pricing-copy-status').textContent='';
  calculatePricing();
}
function mountPricing(){
  if(!$pricing('pricing-calculator'))return;
  const updating=[
    'pricing-distance','pricing-service-price','pricing-parts','pricing-extras',
    'pricing-visit-manual','pricing-discount-custom','pricing-discount-mode','pricing-already-paid',
    'pricing-leak','pricing-transport-type','pricing-visit-mode','pricing-uber-real-out',
    'pricing-uber-real-back','pricing-uber-base','pricing-uber-km','pricing-uber-minute',
    'pricing-own-fuel','pricing-own-consumption','pricing-own-wear','pricing-trip-minutes',
    'pricing-diagnostic-value','pricing-travel-hour'
  ];
  for(const name of updating){
    $pricing(name)?.addEventListener('input',calculatePricing);
    $pricing(name)?.addEventListener('change',calculatePricing);
  }
  $pricing('pricing-service')?.addEventListener('change',selectedService);
  $pricing('pricing-copy')?.addEventListener('click',copyEstimate);
  $pricing('pricing-reset')?.addEventListener('click',resetPricing);
  resetPricing();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mountPricing,{once:true});
else mountPricing();
