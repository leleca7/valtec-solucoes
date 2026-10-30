import {getSupabase} from './supabase.js';
const $=s=>document.querySelector(s);
const make=(tag,label)=>{const e=document.createElement(tag);e.textContent=label||'';return e;};
const option=(v,label)=>{const e=make('option',label);e.value=v;return e;};
const format=x=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(x)||0);
let db=null;
async function refresh(){
 const holder=$('#valtec-transport-data');if(!holder)return;
 db ||= await getSupabase();
 const [cfg,orders,items]=await Promise.all([db.from('valtec_cost_settings').select('bus_fare').limit(1),db.from('service_orders').select('id,order_number,travel_cost').limit(250),db.from('valtec_transport_legs').select('*').order('created_at',{ascending:false}).limit(200)]);
 if(cfg.error||orders.error||items.error){holder.textContent='Não foi possível consultar deslocamentos.';return;}
 const fare=Number(cfg.data?.[0]?.bus_fare||5.90);
 holder.replaceChildren(make('h2','Deslocamento por ordem de serviço'),make('p','Ônibus: '+format(fare)+' por embarque; ida e volta, quando duas passagens foram utilizadas: '+format(fare*2)+'. Uber: custo real. Cliente transportou: gasto monetário do trecho pode ser zero. Não somar o mesmo gasto em despesas gerais e OS.'));
 const form=make('form');const order=make('select');order.className='input';order.append(option('','Selecione a OS'));for(const x of orders.data||[])order.append(option(x.id,x.order_number||'OS'));order.required=true;
 const leg=make('select');leg.className='input';for(const x of [['ida','Ida'],['volta','Volta'],['entre_atendimentos','Entre atendimentos']])leg.append(option(...x));
 const mode=make('select');mode.className='input';for(const x of [['onibus','Ônibus'],['uber','Uber'],['cliente','Transporte pelo cliente'],['outro','Outro']])mode.append(option(...x));
 const paid=make('select');paid.className='input';for(const x of [['valtec','Pago pela Valtec'],['cliente','Pago pelo cliente'],['terceiro','Pago por terceiro']])paid.append(option(...x));
 const count=make('input');count.className='input';count.type='number';count.min='0';count.max='20';count.step='1';count.value='1';
 const cost=make('input');cost.className='input';cost.type='number';cost.min='0';cost.step='0.01';cost.value=fare.toFixed(2);
 const note=make('input');note.className='input';note.placeholder='Observação de trajeto (sem dados pessoais desnecessários)';
 const submit=make('button','Registrar trecho pendente');submit.className='btn btn-light';submit.type='submit';
 const update=()=>{if(mode.value==='cliente')paid.value='cliente';if(mode.value==='cliente'||paid.value!=='valtec')cost.value='0';else if(mode.value==='onibus')cost.value=(fare*Number(count.value||0)).toFixed(2);else cost.value='';};
 mode.onchange=update;paid.onchange=update;count.oninput=()=>{if(mode.value==='onibus')update();};
 form.append(order,leg,mode,paid,count,cost,note,submit);holder.append(form);
 form.onsubmit=async event=>{
  event.preventDefault();const amount=Number(cost.value);
  if(mode.value==='onibus'&&paid.value==='valtec'&&Number(count.value)<1)return alert('Informe a quantidade de passagens efetivamente utilizadas.');
  if(!cost.value||!Number.isFinite(amount)||amount<0)return alert('Confirme o gasto real ou R$ 0 para este trecho.');
  const {error}=await db.from('valtec_transport_legs').insert({service_order_id:order.value,leg:leg.value,mode:mode.value,paid_by:paid.value,fare_count:mode.value==='onibus'?Number(count.value):null,amount,status:'pendente',travel_date:new Date().toISOString().slice(0,10),notes:note.value||null});
  if(error)return alert(error.message);await refresh();
 };
 for(const x of items.data||[]){
  const d=make('p',(orders.data||[]).find(o=>o.id===x.service_order_id)?.order_number+' · '+x.leg+' · '+x.mode+' · '+format(x.amount)+' · '+x.status);
  if(x.status==='pendente'){
   const confirmButton=make('button','Confirmar custo deste trecho');confirmButton.type='button';confirmButton.className='mini-button';
   confirmButton.onclick=async()=>{
    if(!confirm('Confirma o transporte, o pagador e o valor real desta viagem?'))return;
    confirmButton.disabled=true;const {error}=await db.from('valtec_transport_legs').update({status:'confirmado',updated_at:new Date().toISOString()}).eq('id',x.id);
    if(error){confirmButton.disabled=false;return alert(error.message);}await refresh();
   };
   d.append(confirmButton);
  }
  holder.append(d);
 }
 holder.append(make('p','Os trechos são registrados sem alterar automaticamente o custo anterior da OS. Confira e concilie para não duplicar gastos. Hora técnica e anúncios são custos separados.'));
}
function boot(){const tab=$('[data-tab-panel="finance"]');if(!tab)return;const h=make('section');h.id='valtec-transport-data';h.className='panel';tab.append(h);document.addEventListener('click',e=>{if(e.target.closest('[data-admin-tab="finance"]'))refresh();});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
