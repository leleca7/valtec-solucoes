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
function calculatePricing(){
  const km=asNumber('pricing-distance');
  const service=$pricing('pricing-service').value;
  const work=asNumber('pricing-service-price');
  const parts=asNumber('pricing-parts');
  const extras=asNumber('pricing-extras');
  const visitInput=$pricing('pricing-visit-manual').value.trim();
  const visit=visitInput===''?routeFee(km):asNumber('pricing-visit-manual');
  const isWork=service!=='diagnostico';
  const discountMode=$pricing('pricing-discount-mode').value;
  $pricing('pricing-discount-mode').disabled=!isWork;
  $pricing('pricing-discount-custom').disabled=!isWork || discountMode!=='custom';
  const discount=visit===null||!isWork?0:
    discountMode==='half'?visit*.5:discountMode==='custom'?Math.min(visit,asNumber('pricing-discount-custom')):0;
  const subtotal=visit===null?null:visit+work+parts+extras;
  const total=subtotal===null?null:Math.max(0,Math.round((subtotal-discount)*100)/100);
  const alreadyPaid=$pricing('pricing-already-paid').checked;
  const outstanding=total===null?null:Math.max(0,total-(alreadyPaid?visit:0));
  const risk=$pricing('pricing-leak').checked;
  setAmount('pricing-visit-output',visit);
  setAmount('pricing-service-output',work);
  setAmount('pricing-parts-output',parts);
  setAmount('pricing-extras-output',extras);
  setAmount('pricing-discount-output',-discount);
  setAmount('pricing-total-output',total);
  setAmount('pricing-rest-output',outstanding);
  $pricing('pricing-rest-row').hidden=!alreadyPaid;
  $pricing('pricing-visit-hint').textContent=visitInput!==''?
    'Valor de visita ajustado manualmente.':km>20?
    'Acima de 20 km: informe manualmente a visita após analisar o trajeto.':
    'Tabela preliminar por distância de ida, calculando deslocamento e diagnóstico.';
  $pricing('pricing-warning').textContent=risk?
    'Suspeita de vazamento: a prioridade é a segurança. Não usar ou testar o equipamento; preço final somente após avaliação adequada por profissional habilitado.':
    'Preço preliminar interno. Confirme peças, tempo, condições de acesso e custos antes de aprovar.';
  $pricing('pricing-copy').disabled=total===null;
  currentEstimate={km,service,work,visit,parts,extras,discount,total,outstanding,alreadyPaid,risk};
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
  $pricing('pricing-distance').value='3';
  $pricing('pricing-service').value='bico';
  $pricing('pricing-service-price').value=DEFAULT_SERVICES.bico.price;
  $pricing('pricing-parts').value='0';
  $pricing('pricing-extras').value='0';
  $pricing('pricing-visit-manual').value='';
  $pricing('pricing-discount-mode').value='none';
  $pricing('pricing-discount-custom').value='0';
  $pricing('pricing-already-paid').checked=false;
  $pricing('pricing-leak').checked=false;
  $pricing('pricing-copy-status').textContent='';
  calculatePricing();
}
function mountPricing(){
  if(!$pricing('pricing-calculator'))return;
  for(const name of ['pricing-distance','pricing-service-price','pricing-parts','pricing-extras',
    'pricing-visit-manual','pricing-discount-custom','pricing-discount-mode','pricing-already-paid','pricing-leak']){
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
