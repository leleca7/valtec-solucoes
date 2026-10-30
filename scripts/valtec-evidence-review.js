import {getSupabase} from './supabase.js';
let db=null;
const $=s=>document.querySelector(s);
const make=(t,v)=>{const e=document.createElement(t);e.textContent=v||'';return e;};
const opt=(v,t)=>{const e=make('option',t);e.value=v;return e;};
const kinds=[['pendente','Pendente'],['relacionado_servico','Relacionado a serviço, ainda não conciliado'],['pessoal','Pessoal, ignorar'],['nao_financeiro','Não financeiro'],['revisado','Revisado por humano']];
async function load(){
 const root=$('#valtec-review-list');if(!root)return;
 db||=await getSupabase();root.textContent='Consultando histórico e anexos comerciais...';
 const [items,orders]=await Promise.all([
  db.from('valtec_finance_review').select('id,status,candidate_type,reported_amount,payment_method,bank_checked,service_executed_checked,review_notes,service_order_id,created_at,whatsapp_messages(body,message_type,media_path,created_at),whatsapp_threads(display_name)').order('created_at',{ascending:false}).limit(300),
  db.from('service_orders').select('id,order_number').limit(200)
 ]);
 if(items.error){root.textContent='Falha ao consultar fila: '+items.error.message;return;}
 root.replaceChildren(make('p',(items.data||[]).length+' evidências comerciais, incluindo registros anteriores à configuração. Nenhum anexo é considerado pagamento automaticamente.'));
 for(const x of items.data||[]){
  const msg=x.whatsapp_messages||{},thread=x.whatsapp_threads||{};
  const card=make('article');card.className='work-item';
  const details=make('div');details.className='work-main';
  details.append(make('b',(thread.display_name||'Contato')+' · '+new Date(msg.created_at||x.created_at).toLocaleString('pt-BR',{timeZone:'America/Bahia'})),
    make('span',x.candidate_type+' · '+(msg.message_type||'mensagem')));
  if(msg.body)details.append(make('p',String(msg.body).slice(0,320)));
  const actions=make('div');actions.className='work-meta';
  if(msg.media_path){
   const view=make('button','Ver anexo');view.type='button';view.className='mini-button';
   view.onclick=async()=>{view.disabled=true;try{const {data,error}=await db.storage.from('lead-media').createSignedUrl(msg.media_path,90);if(error||!data?.signedUrl)throw error||Error('Sem acesso');const a=make('a','Abrir anexo (90s)');a.href=data.signedUrl;a.target='_blank';a.rel='noopener noreferrer';a.className='mini-button';view.replaceWith(a);}catch{view.disabled=false;view.textContent='Arquivo indisponível';}};
   actions.append(view);
  }
  const status=make('select');status.className='input';kinds.forEach(p=>status.append(opt(...p)));status.value=x.status;
  const amount=make('input');amount.type='number';amount.min='0';amount.step='0.01';amount.className='input';amount.placeholder='Valor informado (opcional)';amount.value=x.reported_amount??'';
  const order=make('select');order.className='input';order.append(opt('','OS não identificada'));(orders.data||[]).forEach(o=>order.append(opt(o.id,o.order_number||o.id)));order.value=x.service_order_id||'';
  const bank=make('label');const b=make('input');b.type='checkbox';b.checked=x.bank_checked;bank.append(b,document.createTextNode(' Banco conferido'));
  const service=make('label');const v=make('input');v.type='checkbox';v.checked=x.service_executed_checked;service.append(v,document.createTextNode(' Serviço executado'));
  const save=make('button','Salvar revisão');save.type='button';save.className='mini-button primary';
  save.onclick=async()=>{
   if(status.value==='revisado'&&!(b.checked&&v.checked&&order.value)){alert('Revisão completa exige OS, recebimento bancário e execução conferidos.');return;}
   const n=amount.value.trim()?Number(amount.value):null;if(n!==null&&(!Number.isFinite(n)||n<0)){alert('Valor inválido');return;}
   save.disabled=true;
   const {data:u}=await db.auth.getUser();
   const changes={status:status.value,reported_amount:status.value==='pessoal'?null:n,service_order_id:status.value==='pessoal'?null:order.value||null,
    bank_checked:status.value!=='pessoal'&&b.checked,service_executed_checked:status.value!=='pessoal'&&v.checked,reviewed_at:new Date().toISOString()};
   if(u?.user?.id)changes.reviewed_by=u.user.id;
   const {error}=await db.from('valtec_finance_review').update(changes).eq('id',x.id);
   save.disabled=false;save.textContent=error?'Falha ao salvar':'Revisão salva — recibo NÃO gerado';
  };
  details.append(status,amount,order,bank,service,save);card.append(details,actions);root.append(card);
 }
}
function boot(){const tab=$('[data-tab-panel="finance"]');if(!tab)return;const area=make('section');area.className='panel';area.id='valtec-review-list';area.append(make('h2','Revisão de comprovantes antigos e novos'));
 tab.append(area);document.addEventListener('click',e=>{if(e.target.closest('[data-admin-tab="finance"]'))load();});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
