import {getSupabase} from './supabase.js';
const $=s=>document.querySelector(s);
const make=(t,text)=>{const e=document.createElement(t);e.textContent=text||'';return e;};
const opt=(v,text)=>{const e=make('option',text);e.value=v;return e;};
async function render(){
 const root=$('#valtec-transport-review');if(!root)return;
 const db=await getSupabase();
 const [rows,orders]=await Promise.all([
  db.from('valtec_transport_review').select('id,status,notes,service_order_id,created_at,whatsapp_messages(body,created_at),whatsapp_threads(display_name)').order('created_at',{ascending:false}).limit(200),
  db.from('service_orders').select('id,order_number').limit(200)
 ]);
 if(rows.error){root.textContent='Falha na revisão de transporte: '+rows.error.message;return;}
 root.replaceChildren(make('h3','Menções de transporte em conversas anteriores e futuras'),
  make('p','Triagem textual: as falas podem ser propostas, não viagens realizadas. Não há custo lançado nem viagem confirmada automaticamente.'));
 root.append(make('p',(rows.data||[]).length+' menções encontradas no histórico comercial.'));
 for(const x of rows.data||[]){
  const section=make('div');section.className='work-item';
  const content=make('div');content.className='work-main';
  const msg=x.whatsapp_messages||{},thread=x.whatsapp_threads||{};
  content.append(make('b',(thread.display_name||'Contato')+' · '+new Date(msg.created_at||x.created_at).toLocaleDateString('pt-BR')),
   make('span',String(msg.body||'').slice(0,230)));
  const select=make('select');select.className='input';
  [['pendente','Ainda não conferido'],['confirmado','Conversa revisada'],['descartado','Não é deslocamento']].forEach(p=>select.append(opt(...p)));select.value=x.status;
  const os=make('select');os.className='input';os.append(opt('','Sem OS associada'));
  (orders.data||[]).forEach(o=>os.append(opt(o.id,o.order_number||o.id)));os.value=x.service_order_id||'';
  const save=make('button','Salvar classificação');save.type='button';save.className='mini-button';
  save.onclick=async()=>{
   save.disabled=true;const {error}=await db.from('valtec_transport_review').update({status:select.value,service_order_id:os.value||null,reviewed_at:new Date().toISOString()}).eq('id',x.id);
   save.disabled=false;save.textContent=error?'Falha':'Revisado — sem despesa lançada';
  };
  content.append(select,os,save);section.append(content);root.append(section);
 }
}
function boot(){const tab=$('[data-tab-panel="finance"]');if(!tab)return;
 const box=make('section');box.id='valtec-transport-review';box.className='panel';tab.append(box);
 document.addEventListener('click',e=>{if(e.target.closest('[data-admin-tab="finance"]'))render();});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
