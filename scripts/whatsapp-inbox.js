import { getSupabase, isSupabaseConfigured } from './supabase.js';
import { recommendWhatsappAction, draftForWhatsappAction } from './whatsapp-action-queue.mjs';

// Apenas mostra conversas que realmente chegaram pelo webhook oficial.
const $=(selector,root=document)=>root.querySelector(selector);
const digits=(v)=>String(v||'').replace(/\D/g,'');
const formatDate=(v)=>v?new Date(v).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'Sem registro';
let busy=false;
let activeFilter='all';
let cached=[];
function attention(row) {
  if (['personal','supplier','ignore'].includes(row.contact_type)) return {text:'Fora do atendimento',urgent:false};
  if (row.human_required) return {text:'Aguardando o técnico',urgent:true};
  if (!row.lead_id && !row.client_id) return {text:'Revisar classificação',urgent:false};
  const lastCustomer=Date.parse(row.last_inbound_at||'')||0;
  const staff=Date.parse(row.conversation_context?.latest_staff_reply_at||'')||0;
  if (staff && staff >= lastCustomer) return {text:Date.now()-staff>86400000?'Retorno pendente':'Aguardando cliente',urgent:Date.now()-staff>86400000};
  return {text:'Em acompanhamento',urgent:false};
}


function boot() {
  if ($('#valtec-wa-inbox'))return;
  const root=$('.valtec-leads-tab');
  if(!root)return;
  const section=document.createElement('section');
  section.id='valtec-wa-inbox';section.className='panel';
  section.innerHTML='<div class="panel-head"><div><span class="kicker">WhatsApp • organização</span><h2>Fila inteligente de atendimentos</h2><p class="muted">Quem precisa de resposta, retorno, orçamento ou recibo. Rascunhos para copiar; nenhum envio automático.</p></div><button id="valtec-wa-refresh" type="button" class="btn btn-light">Atualizar conversas</button></div><div class="valtec-wa-tools"><label for="valtec-wa-filter">Mostrar</label><select id="valtec-wa-filter" class="input compact"><option value="all">Todos os atendimentos</option><option value="reply">Precisam de resposta</option><option value="return">Retornos pendentes</option><option value="document">Orçamentos e recibos</option><option value="waiting">Aguardando cliente</option></select></div><p id="valtec-wa-info" class="muted">Atualize para consultar as mensagens recebidas.</p><p class="muted" style="font-size:12px">Se as respostas enviadas pelo WhatsApp Business ainda não estiverem sincronizadas, verifique a conversa antes de cobrar retorno.</p><div id="valtec-wa-list"></div>';
  const toolbar=root.querySelector('.lead-toolbar-panel');
  if(toolbar)root.insertBefore(section,toolbar);
  else root.append(section);
  const style=document.createElement('style');
  style.textContent='#valtec-wa-inbox{margin:12px 0}#valtec-wa-inbox .panel-head{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}#valtec-wa-inbox .panel-head p{font-size:12px}.valtec-wa-row{border-top:1px solid #e4e7ec;padding:13px 0;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}.valtec-wa-row>div:first-child{flex:1;min-width:190px}.valtec-wa-row p{font-size:12px;color:#62707b;margin:4px 0}.valtec-wa-actions{display:flex;flex-wrap:wrap;align-items:center;gap:7px}.valtec-wa-actions a,.valtec-wa-actions button{font-size:12px;padding:7px 10px;border:1px solid #dce0e4;border-radius:7px;background:#fff;text-decoration:none;color:#182b3e;cursor:pointer}.valtec-wa-tag{padding:4px 7px;font-size:11px;background:#eaf2fd;border-radius:7px}.valtec-wa-tag.urgent{background:#ffedd5;color:#9a3412}';
  style.textContent+='.valtec-wa-tools{display:flex;align-items:center;gap:10px;margin:12px 0}.valtec-wa-tools select{max-width:255px}.valtec-wa-suggest{margin:8px 0;padding:9px 12px;border-left:3px solid #aac9e6;background:#f4f7fb;border-radius:6px;white-space:pre-wrap;font-size:12px;line-height:1.5}.valtec-wa-actions button:disabled{cursor:wait;opacity:.6}.valtec-wa-confirm{font-size:12px;color:#9a3412}';
  document.head.append(style);
  $('#valtec-wa-filter').addEventListener('change',e=>{activeFilter=e.target.value;render(cached);});
  $('#valtec-wa-refresh').addEventListener('click',refresh);
  $('#lead-refresh')?.addEventListener('click',refresh);
}
async function client() {
  if(!isSupabaseConfigured())return null;
  const s=await getSupabase();
  const {data:{user}}=await s.auth.getUser();
  return user?s:null;
}
function action(label, onClick) {
  const btn=document.createElement('button');btn.type='button';btn.textContent=label;
  btn.addEventListener('click',onClick);return btn;
}
function tag(text,urgent=false) {
  const node=document.createElement('span');
  node.className='valtec-wa-tag'+(urgent?' urgent':'');
  node.textContent=text;return node;
}
function actionPriority(item){return item.advice.priority||0;}
function render(items) {
  const info=$('#valtec-wa-info'),list=$('#valtec-wa-list');
  if(!info||!list)return;
  const commercial=items.filter(x=>x.advice.kind!=='excluded');
  const needsReply=commercial.filter(x=>x.advice.kind==='reply').length;
  const followups=commercial.filter(x=>x.advice.kind==='return').length;
  const docs=commercial.filter(x=>x.advice.kind==='document').length;
  info.textContent=commercial.length+' conversa(s) comerciais • '+needsReply+' para verificar resposta • '+followups+' retorno(s) • '+docs+' ação(ões) de orçamento/recibo.';
  const ordered=[...items].filter(x=>x.advice.kind!=='excluded').filter(x=>activeFilter==='all'||x.advice.kind===activeFilter)
    .sort((a,b)=>actionPriority(b)-actionPriority(a)||new Date(b.thread.last_message_at||b.thread.created_at||0)-new Date(a.thread.last_message_at||a.thread.created_at||0));
  list.replaceChildren();
  if(!ordered.length){const empty=document.createElement('p');empty.className='muted';empty.textContent='Nenhuma conversa nesta categoria.';list.append(empty);return;}
  for(const {thread:item,advice,ctx} of ordered) {
    const container=document.createElement('article');container.className='valtec-wa-row';
    const left=document.createElement('div');
    const name=document.createElement('strong');name.textContent=ctx.lead?.customer_name||item.display_name||item.phone||'Contato';
    const summary=document.createElement('p');summary.textContent=(item.last_message_preview||'Sem prévia')+' · '+formatDate(item.last_message_at||item.created_at);
    const reason=document.createElement('p');reason.textContent=advice.detail||item.human_reason||'';
    const status=document.createElement('p');status.append(tag(advice.label,advice.priority>=4));
    left.append(name,summary,status,reason);
    const suggestion=draftForWhatsappAction(advice,item,ctx);
    if(advice.kind!=='waiting' && suggestion) {
      const draft=document.createElement('div');draft.className='valtec-wa-suggest';draft.textContent=suggestion;left.append(draft);
    }
    const right=document.createElement('div');right.className='valtec-wa-actions';
    if(item.contact_type==='lead')right.append(tag('Lead'));
    if(item.contact_type==='client')right.append(tag('Cliente'));
    if(item.classification_source==='meta_ads_referral')right.append(tag('Meta Ads'));
    if(item.conversation_context?.latest_staff_reply_at)right.append(tag(item.conversation_context?.last_staff_reply_source==='manual_admin_confirmation'?'Resposta confirmada manualmente':'Respondido no app'));
    if(Number(item.unread_count||0)>0)right.append(tag(item.unread_count+' não lida(s)',true));
    const open=document.createElement('a');
    open.textContent='Abrir conversa';open.href='https://wa.me/'+digits(item.phone);
    open.target='_blank';open.rel='noopener noreferrer';right.append(open);
    if(suggestion && advice.kind!=='waiting')right.append(action(advice.kind==='document'?'Copiar orientação':'Copiar sugestão',()=>copyText(suggestion)));
    if(advice.kind==='document') {
      const tab=['make_receipt','receipt'].includes(advice.key)?'receipts':advice.key==='payment'?'orders':'quotes';
      right.append(action('Abrir '+(tab==='receipts'?'recibos':tab==='orders'?'OS':'orçamentos'),()=>document.querySelector('[data-admin-tab="'+tab+'"]')?.click()));
    }
    if(advice.key==='check_reply' || advice.key==='human' || advice.key==='intake' || advice.key==='review')
      right.append(action('Confirmar que já respondi',()=>confirmStaffReply(item)));
    if(!item.lead_id&&!item.client_id&&!['personal','supplier','ignore'].includes(item.contact_type)) {
      right.append(action('Marcar pessoal',()=>classifyManually(item,'personal')));
      right.append(action('Marcar fornecedor',()=>classifyManually(item,'supplier')));
    } else if(['personal','supplier','ignore'].includes(item.contact_type)) {
      right.append(action('Revisar classificação',()=>classifyManually(item,'unknown')));
    }
    if(item.lead_id)right.append(action('Localizar lead',()=>{
      const search=$('#lead-search');if(!search)return;
      search.value=item.phone||'';search.dispatchEvent(new Event('input',{bubbles:true}));search.focus();
    }));
    if(Number(item.unread_count||0)>0)right.append(action('Marcar revisada',()=>markRead(item.id)));
    container.append(left,right);list.append(container);
  }
}
async function copyText(value) {
  try{await navigator.clipboard.writeText(value);$('#valtec-wa-info').textContent='Texto copiado. Confira no WhatsApp antes de enviar.';}
  catch{window.prompt('Selecione e copie este texto:',value);}
}
async function confirmStaffReply(thread) {
  if(!window.confirm('Confirma que respondeu a esta conversa pelo WhatsApp Business? Isso não envia mensagem.'))return;
  try{
    const s=await client();if(!s)throw Error('Faça login na Central.');
    const now=new Date().toISOString();
    const context={...(thread.conversation_context||{}),latest_staff_reply_at:now,last_staff_reply_source:'manual_admin_confirmation',waiting_on:'customer'};
    const {error}=await s.from('whatsapp_threads').update({conversation_context:context}).eq('id',thread.id);
    if(error)throw error;
    await refresh();
  }catch(error){$('#valtec-wa-info').textContent='Falha ao registrar confirmação: '+(error?.message||'tente novamente');}
}

async function classifyManually(row, type) {
  if (!['personal','supplier','ignore','unknown'].includes(type)) return;
  const labels={personal:'pessoal',supplier:'fornecedor',ignore:'ignorada',unknown:'não classificada'};
  if(!window.confirm('Classificar a conversa como '+labels[type]+'? Nenhuma mensagem será enviada.'))return;
  try {
    const s=await client();
    if(!s)throw Error('Faça login na Central.');
    const {error}=await s.from('whatsapp_threads').update({
      contact_type:type,
      auto_reply_mode:type==='unknown'?'commercial_only':'never',
      classification_source:'manual_admin',
      classified_at:new Date().toISOString()
    }).eq('id',row.id);
    if(error)throw error;
    await refresh();
  }catch(error){$('#valtec-wa-info').textContent='Não foi possível classificar: '+(error?.message||'tente novamente');}
}
async function markRead(id) {
  try {
    const s=await client();if(!s)throw Error('Faça login na Central.');
    const {error}=await s.from('whatsapp_threads').update({unread_count:0}).eq('id',id);
    if(error)throw error;
    await refresh();
  }catch(error){$('#valtec-wa-info').textContent='Não foi possível revisar a conversa: '+(error?.message||'tente novamente');}
}
async function refresh() {
  if(busy||!$('#valtec-wa-list'))return;
  busy=true;const button=$('#valtec-wa-refresh');
  if(button){button.disabled=true;button.textContent='Carregando...';}
  try{
    const s=await client();if(!s)throw Error('Faça login na Central.');
    const {data:threads,error}=await s.from('whatsapp_threads')
      .select('id,display_name,phone,lead_id,client_id,status,workflow_step,last_intent,created_at,last_message_at,last_inbound_at,last_outbound_at,last_message_preview,unread_count,contact_type,human_required,human_reason,classification_source,conversation_context')
      .order('last_message_at',{ascending:false,nullsFirst:false}).limit(80);
    if(error)throw error;
    const commercial=(threads||[]).filter(t=>!['personal','supplier','ignore','tester'].includes(t.contact_type));
    const loads=[
      s.from('leads').select('id,customer_name,phone,status,neighborhood,equipment,description,problems,next_action,next_action_at').order('created_at',{ascending:false}).limit(300),
      s.from('quotes').select('id,lead_id,client_id,quote_number,status,created_at,updated_at').order('created_at',{ascending:false}).limit(300),
      s.from('service_orders').select('id,lead_id,client_id,status,payment_status,total_amount,amount_received,created_at,updated_at').order('created_at',{ascending:false}).limit(300),
      s.from('receipts').select('id,client_id,service_order_id,receipt_number,voided_at,created_at').order('created_at',{ascending:false}).limit(300)
    ];
    const documents=commercial.length?await Promise.all(loads):[];
    const [leads,quotes,orders,receipts]=documents.map(x=>x?.error?[]:x?.data||[]);
    const ctx={leads:leads||[],quotes:quotes||[],orders:orders||[],receipts:receipts||[]};
    const now=Date.now();
    cached=(threads||[]).map(thread=>{
      const lead=ctx.leads.find(l=>l.id===thread.lead_id)||null;
      const local={lead,quotes:ctx.quotes,orders:ctx.orders,receipts:ctx.receipts};
      return {thread,ctx:local,advice:recommendWhatsappAction(thread,local,now)};
    });
    render(cached);
    const failures=documents.filter(x=>x?.error);
    if(failures.length){const info=$('#valtec-wa-info');info.textContent+=' Alguns registros de documentos não puderam ser consultados; confira na aba correspondente.';}
  }catch(error){$('#valtec-wa-info').textContent='Consulta indisponível: '+(error?.message||'tente novamente');}
  finally{busy=false;if(button){button.disabled=false;button.textContent='Atualizar conversas';}}
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
else boot();
