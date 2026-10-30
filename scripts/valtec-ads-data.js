import {getSupabase} from './supabase.js';
const cash=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n)||0);
function text(tag,v){const e=document.createElement(tag);e.textContent=v;return e;}
let loaded=false;
async function renderAds(){
 if(loaded)return;loaded=true;
 const root=document.getElementById('valtec-ads-data');if(!root)return;
 try{
  const db=await getSupabase();
  const [a,b]=await Promise.all([db.from('valtec_marketing_spend').select('spend_date,amount,campaign,snapshot_at').order('spend_date',{ascending:false}).limit(1000),db.from('valtec_cost_settings').select('bus_fare').limit(1)]);
  if(a.error)throw a.error;
  root.replaceChildren();
  const months=new Map();let total=0,latest='';
  for(const row of a.data||[]){const k=String(row.spend_date).slice(0,7);months.set(k,(months.get(k)||0)+Number(row.amount));total+=Number(row.amount);if(row.snapshot_at>latest)latest=row.snapshot_at;}
  root.append(text('p','Meta Ads: '+cash(total)+' registrado nos períodos importados. Os valores não comprovam débito bancário nem pagamento por cliente.'));
  for(const [month,value] of months)root.append(text('p',month+' — '+cash(value)));
  root.append(text('p','Última atualização: '+(latest?new Date(latest).toLocaleString('pt-BR'):'não informada')+'. A atualização dos dados de anúncios exige nova sincronização; não é automática.'));
  root.append(text('p','Passagem de ônibus interna: '+cash(b.data?.[0]?.bus_fare||5.90)+' por trecho. Ida e volta com duas passagens: '+cash(2*Number(b.data?.[0]?.bus_fare||5.90))+'.'));
  root.append(text('p','CAC por serviço somente após conciliar origem do anúncio e serviço efetivamente concluído.'));
 }catch(e){root.textContent='Erro ao consultar publicidade: '+e.message;}
}
function boot(){
 const finance=document.querySelector('[data-tab-panel="finance"]');if(!finance)return;
 const box=document.createElement('section');box.className='panel';box.id='valtec-ads-data';
 finance.prepend(box);
 document.addEventListener('click',e=>{if(e.target.closest('[data-admin-tab="finance"]'))renderAds();});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
