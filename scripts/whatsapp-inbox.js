import { getSupabase, isSupabaseConfigured } from './supabase.js';
import { recommendWhatsappAction, draftForWhatsappAction, needsReplyReview } from './whatsapp-action-queue.mjs';

// Apenas mostra conversas que realmente chegaram pelo webhook oficial.
const $=(selector,root=document)=>root.querySelector(selector);
const digits=(v)=>String(v||'').replace(/\D/g,'');
const formatDate=(v)=>v?new Date(v).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'Sem registro';
const localInputDate=(v)=>{if(!v)return '';const d=new Date(v);return Number.isFinite(d.getTime())?new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16):'';};
const businessContact=(thread)=>!['personal','supplier','ignore','tester'].includes(thread.contact_type);
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
  section.innerHTML='<div class="panel-head"><div><span class="kicker">WhatsApp • organização</span><h2>Fila inteligente de atendimentos</h2><p class="muted">Quem precisa de resposta, retorno, orçamento ou recibo. Rascunhos para copiar; nenhum envio automático.</p></div><button id="valtec-wa-refresh" type="button" class="btn btn-light">Atualizar conversas</button></div><div class="valtec-wa-tools"><label for="valtec-wa-filter">Mostrar</label><select id="valtec-wa-filter" class="input compact"><option value="all">Todos os atendimentos</option><option value="reply">Precisam de resposta</option><option value="return">Retornos pendentes</option><option value="document">Orçamentos e recibos</option><option value="waiting">Aguardando cliente</option><option value="classification">Revisar classificação</option><option value="excluded">Pessoais e fornecedores</option></select></div><p id="valtec-wa-info" class="muted">Atualize para consultar as mensagens recebidas.</p><p id="valtec-wa-echo-status" class="muted" style="font-size:12px">Respostas enviadas no WhatsApp Business: aguardando confirmação de sincronização.</p><p class="muted" style="font-size:12px">Se as respostas enviadas pelo WhatsApp Business ainda não estiverem sincronizadas, verifique a conversa antes de cobrar retorno.</p><div id="valtec-wa-list"></div>';
  section.innerHTML=section.innerHTML.replace('<p id="valtec-wa-info"', '<div id="valtec-wa-day-metrics" class="valtec-wa-day-metrics" aria-label="Resumo do WhatsApp de hoje"><div><small>Mensagens recebidas hoje</small><strong id="valtec-wa-received">—</strong></div><div><small>Saídas registradas hoje</small><strong id="valtec-wa-sent">—</strong></div><div><small>Clientes respondidos hoje</small><strong id="valtec-wa-answered">—</strong></div><div><small>Respostas para conferir</small><strong id="valtec-wa-pending">—</strong></div><div><small>Retornos vencidos</small><strong id="valtec-wa-overdue">—</strong></div><div><small>Próximos retornos</small><strong id="valtec-wa-scheduled">—</strong></div></div><p id="valtec-wa-info"');
  const toolbar=root.querySelector('.lead-toolbar-panel');
  if(toolbar)root.insertBefore(section,toolbar);
  else root.append(section);
  const style=document.createElement('style');
  style.textContent='#valtec-wa-inbox{margin:12px 0}#valtec-wa-inbox .panel-head{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}#valtec-wa-inbox .panel-head p{font-size:12px}.valtec-wa-row{border-top:1px solid #e4e7ec;padding:13px 0;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}.valtec-wa-row>div:first-child{flex:1;min-width:190px}.valtec-wa-row p{font-size:12px;color:#62707b;margin:4px 0}.valtec-wa-actions{display:flex;flex-wrap:wrap;align-items:center;gap:7px}.valtec-wa-actions a,.valtec-wa-actions button{font-size:12px;padding:7px 10px;border:1px solid #dce0e4;border-radius:7px;background:#fff;text-decoration:none;color:#182b3e;cursor:pointer}.valtec-wa-tag{padding:4px 7px;font-size:11px;background:#eaf2fd;border-radius:7px}.valtec-wa-tag.urgent{background:#ffedd5;color:#9a3412}';
  style.textContent+='.valtec-wa-tools{display:flex;align-items:center;gap:10px;margin:12px 0}.valtec-wa-tools select{max-width:255px}.valtec-wa-suggest{margin:8px 0;padding:9px 12px;border-left:3px solid #aac9e6;background:#f4f7fb;border-radius:6px;white-space:pre-wrap;font-size:12px;line-height:1.5}.valtec-wa-actions button:disabled{cursor:wait;opacity:.6}.valtec-wa-confirm{font-size:12px;color:#9a3412}';
  style.textContent+='.valtec-wa-day-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:12px 0}.valtec-wa-day-metrics>div{padding:12px;border:1px solid #e1e8f0;border-radius:12px;background:#f8fbff}.valtec-wa-day-metrics small{display:block;font-size:11px;color:#526579}.valtec-wa-day-metrics strong{display:block;font-size:23px;margin-top:5px;color:#102c45}.valtec-wa-history{margin-top:9px;padding:9px;background:#f8fafc;border:1px solid #e3e9ef;border-radius:10px;font-size:12px}.valtec-wa-history p{white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0}.valtec-wa-history b{color:#243c53}.valtec-wa-schedule{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:8px}.valtec-wa-schedule input{max-width:230px;min-height:35px}.valtec-wa-schedule button{min-height:35px}.valtec-wa-reminder{font-weight:700;color:#28537c!important}.valtec-wa-reminder.late{color:#a24410!important}@media(max-width:760px){.valtec-wa-day-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}';
  document.head.append(style);
  $('#valtec-wa-filter').addEventListener('change',e=>{activeFilter=e.target.value;render(cached);});
  $('#valtec-wa-refresh').addEventListener('click',refresh);
  $('#lead-refresh')?.addEventListener('click',refresh);
  $('#valtec-leads-nav')?.addEventListener('click',refresh);
  installQuickAccess();
}
function installQuickAccess(){
  const nav=$('.central-nav'),leadsNav=$('#valtec-leads-nav');
  if(nav&&leadsNav&&!$('#valtec-wa-shortcut')){
    const button=document.createElement('button');button.id='valtec-wa-shortcut';button.type='button';button.textContent='WhatsApp - Atendimento';
    button.addEventListener('click',()=>openInbox());
    leadsNav.after(button);
  }
  const quick=$('.quick-actions');
  if(quick&&!$('#valtec-wa-quick')){
    const button=document.createElement('button');button.id='valtec-wa-quick';button.type='button';button.className='quick-card green';
    button.innerHTML='<span>WA</span><b>Atender no WhatsApp</b><small>Mensagens, sugestões e retornos</small>';
    button.addEventListener('click',()=>openInbox());quick.prepend(button);
  }
}
function openInbox(){
  $('#valtec-leads-nav')?.click();
  $('#valtec-wa-inbox')?.scrollIntoView({behavior:'smooth',block:'start'});
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
  // Contato desconhecido NÃO é automaticamente cliente; contar separadamente.
  const commercial=items.filter(x=>['lead','client'].includes(x.thread.contact_type));
  const needsReply=commercial.filter(x=>x.needsReply||x.advice.kind==='reply').length;
  const followups=commercial.filter(x=>x.advice.kind==='return').length;
  const docs=commercial.filter(x=>x.advice.kind==='document').length;
  const classifiedPending=items.filter(x=>x.advice.kind==='classification').length;
  const validLead=x=>x.ctx.lead?.next_action_at && !['concluido','finalizado','perdido','arquivado'].includes(x.ctx.lead?.status);
  const scheduled=commercial.filter(x=>validLead(x)&&Date.parse(x.ctx.lead.next_action_at)>Date.now()).length;
  const overdue=commercial.filter(x=>validLead(x)&&Date.parse(x.ctx.lead.next_action_at)<=Date.now()).length;
  info.textContent=commercial.length+' conversa(s) comerciais identificadas • '+needsReply+' resposta(s) para conferir • '+overdue+' retorno(s) vencido(s) • '+docs+' ação(ões) de documento • '+classifiedPending+' conversa(s) a classificar. Uma conversa pode precisar de resposta E de documento.';
  const pending=$('#valtec-wa-pending'),scheduledEl=$('#valtec-wa-scheduled'),overdueEl=$('#valtec-wa-overdue');
  if(pending)pending.textContent=String(needsReply);
  if(scheduledEl)scheduledEl.textContent=String(scheduled);
  if(overdueEl)overdueEl.textContent=String(overdue);
  const ordered=[...items].filter(x=>activeFilter==='excluded'?x.advice.kind==='excluded':x.advice.kind!=='excluded').filter(x=>activeFilter==='all'||activeFilter==='excluded'||(activeFilter==='reply'?(x.needsReply||x.advice.kind==='reply'):x.advice.kind===activeFilter))
    .sort((a,b)=>actionPriority(b)-actionPriority(a)||new Date(b.thread.last_message_at||b.thread.created_at||0)-new Date(a.thread.last_message_at||a.thread.created_at||0));
  list.replaceChildren();
  if(!ordered.length){const empty=document.createElement('p');empty.className='muted';empty.textContent='Nenhuma conversa nesta categoria.';list.append(empty);return;}
  for(const {thread:item,advice,ctx,needsReply} of ordered) {
    const container=document.createElement('article');container.className='valtec-wa-row';
    const left=document.createElement('div');
    const name=document.createElement('strong');name.textContent=ctx.lead?.customer_name||item.display_name||item.phone||'Contato';
    const summary=document.createElement('p');summary.textContent=(item.last_message_preview||'Sem prévia')+' · '+formatDate(item.last_message_at||item.created_at);
    const reason=document.createElement('p');reason.textContent=advice.detail||item.human_reason||'';
    const status=document.createElement('p');status.append(tag(advice.label,advice.priority>=4));
    if(needsReply&&advice.kind!=='reply')status.append(tag('Mensagem do cliente: conferir resposta',true));
    left.append(name,summary,status,reason);
    if(ctx.lead?.next_action_at){
      const reminder=document.createElement('p'),overdue=Date.parse(ctx.lead.next_action_at)<Date.now();
      reminder.className='valtec-wa-reminder'+(overdue?' late':'');
      reminder.textContent=(overdue?'Retorno previsto passou: ':'Próximo retorno: ')+formatDate(ctx.lead.next_action_at)+(ctx.lead.next_action?' · '+ctx.lead.next_action:'');
      left.append(reminder);
    }
    const suggestion=draftForWhatsappAction(advice,item,ctx);
    if(!['waiting','classification','excluded'].includes(advice.kind) && suggestion) {
      const draft=document.createElement('div');draft.className='valtec-wa-suggest';draft.textContent=suggestion;left.append(draft);
    }
    const right=document.createElement('div');right.className='valtec-wa-actions';
    if(item.contact_type==='lead')right.append(tag('Lead'));
    if(['personal','supplier'].includes(item.contact_type))right.append(tag(item.contact_type==='personal'?'Pessoal':'Fornecedor'));
    if(item.contact_type==='tester')right.append(tag('Teste'));
    if(item.contact_type==='client')right.append(tag('Cliente'));
    if(item.classification_source==='meta_ads_referral')right.append(tag('Meta Ads'));
    if(item.conversation_context?.latest_staff_reply_at)right.append(tag(item.conversation_context?.last_staff_reply_source==='manual_admin_confirmation'?'Resposta confirmada manualmente':'Respondido no app'));
    if(Number(item.unread_count||0)>0)right.append(tag(item.unread_count+' não lida(s)',true));
    const open=document.createElement('a');
    open.textContent='Abrir conversa';open.href='https://wa.me/'+digits(item.phone);
    open.target='_blank';open.rel='noopener noreferrer';right.append(open);
    if(suggestion && !['waiting','classification','excluded'].includes(advice.kind)){
      right.append(action(advice.kind==='document'?'Copiar orientação':'Copiar sugestão',()=>copyText(suggestion)));
      if(!suggestion.startsWith('AÇÃO INTERNA:')){
        const ready=document.createElement('a');ready.textContent='Abrir com sugestão';
        ready.href='https://wa.me/'+digits(item.phone)+'?text='+encodeURIComponent(suggestion.slice(0,1400));
        ready.target='_blank';ready.rel='noopener noreferrer';right.append(ready);
      }
    }
    if(businessContact(item) && (item.lead_id||item.client_id)){
      const history=document.createElement('div');history.className='valtec-wa-history hidden';left.append(history);
      right.append(action('Ver histórico',()=>loadMessageHistory(item,history)));
    }
    if(ctx.lead?.id && businessContact(item)){
      const scheduler=document.createElement('div');scheduler.className='valtec-wa-schedule hidden';
      const when=document.createElement('input');when.type='datetime-local';when.className='input';when.setAttribute('aria-label','Data e hora do retorno');when.value=localInputDate(ctx.lead.next_action_at);
      const save=action('Salvar retorno',()=>scheduleFollowup(ctx.lead,when.value,save));scheduler.append(when,save);left.append(scheduler);
      right.append(action('Agendar retorno',()=>{scheduler.classList.toggle('hidden');if(!scheduler.classList.contains('hidden'))when.focus();}));
    }
    if(advice.kind==='document') {
      const tab=['make_receipt','receipt'].includes(advice.key)?'receipts':advice.key==='payment'?'orders':'quotes';
      right.append(action('Abrir '+(tab==='receipts'?'recibos':tab==='orders'?'OS':'orçamentos'),()=>document.querySelector('[data-admin-tab="'+tab+'"]')?.click()));
    }
    const lastIn=Date.parse(item.last_inbound_at||'')||0;
    const lastOut=Math.max(Date.parse(item.last_outbound_at||'')||0,Date.parse(item.conversation_context?.latest_staff_reply_at||'')||0);
    if(['lead','client'].includes(item.contact_type) && lastIn>lastOut)
      right.append(action('Confirmar que já respondi',()=>confirmStaffReply(item)));
    if(!item.lead_id&&!item.client_id&&!['personal','supplier','ignore'].includes(item.contact_type)) {
      right.append(action('Marcar pessoal',()=>classifyManually(item,'personal')));
      right.append(action('Marcar fornecedor',()=>classifyManually(item,'supplier')));
      // A decisão de tratar um desconhecido como cliente é sempre humana.
      // O cadastro é exibido para revisão antes de criar qualquer lead.
      right.append(action('Cadastrar como atendimento',()=>{
        const entry=$('#lead-new-manual');
        if(!entry){$('#valtec-wa-info').textContent='Abra a aba Clientes potenciais e use + Novo lead.';return;}
        entry.click();
        const form=$('#lead-manual-form');
        if(!form)return;
        form.dataset.linkWhatsappThread=item.id;
        const name=$('#lead-manual-name'),phone=$('#lead-manual-phone');
        if(name && item.display_name && !/^(cliente|contato) whatsapp$/i.test(item.display_name))name.value=item.display_name;
        if(phone)phone.value=item.phone||'';
      }));
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
async function loadMessageHistory(thread,holder){
  if(!holder.classList.contains('hidden')){holder.classList.add('hidden');return;}
  holder.classList.remove('hidden');holder.textContent='Carregando últimas mensagens...';
  try{
    const s=await client();if(!s)throw Error('Faça login na Central.');
    const {data,error}=await s.from('whatsapp_messages')
      .select('direction,body,transcript,message_type,created_at,delivery_status')
      .eq('thread_id',thread.id).order('created_at',{ascending:false}).limit(15);
    if(error)throw error;
    holder.replaceChildren();
    if(!data?.length){holder.textContent='Não existem mensagens sincronizadas para esta conversa.';return;}
    for(const message of [...data].reverse()){
      const row=document.createElement('p');const label=document.createElement('b');
      label.textContent=(message.direction==='inbound'?'Cliente':'Valtec')+' · '+formatDate(message.created_at)+(message.direction==='outbound'&&message.delivery_status?' · '+message.delivery_status:'');
      const content=document.createElement('span');
      content.textContent='\n'+(message.body||message.transcript||'[Mídia: '+(message.message_type||'arquivo')+']');
      row.append(label,content);holder.append(row);
    }
  }catch(error){holder.textContent='Não foi possível consultar o histórico: '+(error?.message||'tente novamente');}
}
async function scheduleFollowup(lead,input,button){
  const date=new Date(input||'');
  if(!Number.isFinite(date.getTime())){window.alert('Informe uma data e hora válidas para o retorno.');return;}
  if(!window.confirm('Salvar lembrete de retorno para '+formatDate(date.toISOString())+'? Isso NÃO envia mensagem ao cliente.'))return;
  button.disabled=true;
  try{
    const s=await client();if(!s)throw Error('Faça login na Central.');
    const patch={next_action_at:date.toISOString()};
    if(!lead.next_action)patch.next_action='Retomar atendimento pelo WhatsApp';
    const {error}=await s.from('leads').update(patch).eq('id',lead.id);
    if(error)throw error;
    await refresh();
    $('#valtec-wa-info').textContent='Retorno salvo na ficha do cliente. O lembrete não envia mensagens automaticamente.';
  }catch(error){window.alert('Não foi possível agendar: '+(error?.message||'tente novamente'));}finally{button.disabled=false;}
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
      .order('last_message_at',{ascending:false,nullsFirst:false}).limit(200);
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
      return {thread,ctx:local,advice:recommendWhatsappAction(thread,local,now),needsReply:needsReplyReview(thread)};
    });
    render(cached);
    const startOfToday=new Date();startOfToday.setHours(0,0,0,0);
    const [incoming,outgoing,replyRows]=await Promise.all([
      s.from('whatsapp_messages').select('id',{count:'exact',head:true}).eq('direction','inbound').gte('created_at',startOfToday.toISOString()),
      s.from('whatsapp_messages').select('id',{count:'exact',head:true}).eq('direction','outbound').gte('created_at',startOfToday.toISOString()),
      s.from('whatsapp_messages').select('thread_id,delivery_status').eq('direction','outbound').gte('created_at',startOfToday.toISOString()).limit(1000)
    ]);
    const received=$('#valtec-wa-received'),sent=$('#valtec-wa-sent');
    if(received)received.textContent=incoming.error?'—':String(incoming.count??0);
    if(sent)sent.textContent=outgoing.error?'—':String(outgoing.count??0);
    // Mensagem não é atendimento: cada conversa comercial conta uma vez por dia.
    const knownCommercial=new Set(cached.filter(x=>['lead','client'].includes(x.thread.contact_type)).map(x=>x.thread.id));
    const answeredToday=new Set();
    if(!replyRows.error && (replyRows.data||[]).length<1000){
      for(const row of replyRows.data||[]){
        if(knownCommercial.has(row.thread_id)&&!['failed','queued'].includes(row.delivery_status))answeredToday.add(row.thread_id);
      }
      for(const item of cached){
        const stamp=Date.parse(item.thread.conversation_context?.latest_staff_reply_at||'')||0;
        if(knownCommercial.has(item.thread.id)&&stamp>=startOfToday.getTime())answeredToday.add(item.thread.id);
      }
    }
    const answered=$('#valtec-wa-answered');
    if(answered)answered.textContent=replyRows.error||(replyRows.data||[]).length>=1000?'—':String(answeredToday.size);
    if(incoming.error||outgoing.error||replyRows.error||(replyRows.data||[]).length>=1000)$('#valtec-wa-info').textContent+=' Alguns totais de hoje estão incompletos; confira antes de usar em relatórios.';
    const syncCount=cached.filter(x=>x.thread.conversation_context?.last_staff_reply_source==='whatsapp_business_app').length;
    const status=$('#valtec-wa-echo-status');
    if(status)status.textContent=syncCount
      ? syncCount+' conversa(s) com resposta sincronizada do aplicativo WhatsApp Business.'
      : 'Respostas enviadas pelo aplicativo: nenhum evento confirmado nesta fila. A Meta precisa entregar smb_message_echoes e o número deve estar habilitado para coexistência.';
    const failures=documents.filter(x=>x?.error);
    if(failures.length){const info=$('#valtec-wa-info');info.textContent+=' Alguns registros de documentos não puderam ser consultados; confira na aba correspondente.';}
  }catch(error){$('#valtec-wa-info').textContent='Consulta indisponível: '+(error?.message||'tente novamente');}
  finally{busy=false;if(button){button.disabled=false;button.textContent='Atualizar conversas';}}
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
else boot();
