import { getSupabase, isSupabaseConfigured } from './supabase.js';

// Apenas mostra conversas que realmente chegaram pelo webhook oficial.
const $=(selector,root=document)=>root.querySelector(selector);
const digits=(v)=>String(v||'').replace(/\D/g,'');
const formatDate=(v)=>v?new Date(v).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'Sem registro';
let busy=false;

function boot() {
  if ($('#valtec-wa-inbox'))return;
  const root=$('.valtec-leads-tab');
  if(!root)return;
  const section=document.createElement('section');
  section.id='valtec-wa-inbox';section.className='panel';
  section.innerHTML='<div class="panel-head"><div><span class="kicker">WhatsApp • organização</span><h2>Conversas que precisam de atenção</h2><p class="muted">Prioridade para conversas que exigem um técnico. Mostra apenas mensagens sincronizadas com o bot.</p></div><button id="valtec-wa-refresh" type="button" class="btn btn-light">Atualizar conversas</button></div><p id="valtec-wa-info" class="muted">Atualize para consultar as mensagens recebidas.</p><div id="valtec-wa-list"></div>';
  const toolbar=root.querySelector('.lead-toolbar-panel');
  if(toolbar)root.insertBefore(section,toolbar);
  else root.append(section);
  const style=document.createElement('style');
  style.textContent='#valtec-wa-inbox{margin:12px 0}#valtec-wa-inbox .panel-head{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}#valtec-wa-inbox .panel-head p{font-size:12px}.valtec-wa-row{border-top:1px solid #e4e7ec;padding:13px 0;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}.valtec-wa-row>div:first-child{flex:1;min-width:190px}.valtec-wa-row p{font-size:12px;color:#62707b;margin:4px 0}.valtec-wa-actions{display:flex;flex-wrap:wrap;align-items:center;gap:7px}.valtec-wa-actions a,.valtec-wa-actions button{font-size:12px;padding:7px 10px;border:1px solid #dce0e4;border-radius:7px;background:#fff;text-decoration:none;color:#182b3e;cursor:pointer}.valtec-wa-tag{padding:4px 7px;font-size:11px;background:#eaf2fd;border-radius:7px}.valtec-wa-tag.urgent{background:#ffedd5;color:#9a3412}';
  document.head.append(style);
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
function render(rows) {
  const info=$('#valtec-wa-info'), list=$('#valtec-wa-list');
  if(!info||!list)return;
  rows.sort((a,b)=>Number(Boolean(b.human_required))-Number(Boolean(a.human_required))||new Date(b.last_message_at||b.created_at||0)-new Date(a.last_message_at||a.created_at||0));
  const urgent=rows.filter(r=>r.human_required).length;
  const unread=rows.reduce((sum,r)=>sum+Number(r.unread_count||0),0);
  info.textContent=rows.length?rows.length+' conversa(s) sincronizada(s) • '+urgent+' aguardando técnico • '+unread+' mensagem(ns) não revisada(s).':'Nenhuma conversa sincronizada. O WhatsApp Business pode ter mensagens que não chegaram ao webhook; conferir integração Meta.';
  list.replaceChildren();
  for(const item of rows) {
    const row=document.createElement('article');row.className='valtec-wa-row';
    const left=document.createElement('div');
    const name=document.createElement('strong');name.textContent=item.display_name||item.phone||'Contato';
    const summary=document.createElement('p');summary.textContent=(item.last_message_preview||'Sem prévia')+' · '+formatDate(item.last_message_at||item.created_at);
    const reason=document.createElement('p');reason.textContent=item.human_reason||'';
    left.append(name,summary,reason);
    const right=document.createElement('div');right.className='valtec-wa-actions';
    right.append(tag(item.human_required?'Aguardando técnico':item.contact_type==='lead'?'Lead':item.contact_type==='tester'?'Teste':'Contato',Boolean(item.human_required)));
    if(item.classification_source==='meta_ads_referral')right.append(tag('Meta Ads'));
    if(Number(item.unread_count||0)>0)right.append(tag(item.unread_count+' não lida(s)',true));
    const open=document.createElement('a');open.textContent='Abrir WhatsApp';open.href='https://wa.me/'+digits(item.phone);open.target='_blank';open.rel='noopener noreferrer';right.append(open);
    if(item.lead_id)right.append(action('Localizar lead',()=>{
      const search=$('#lead-search');if(!search)return;
      search.value=item.phone||'';search.dispatchEvent(new Event('input',{bubbles:true}));search.focus();
    }));
    if(Number(item.unread_count||0)>0)right.append(action('Marcar revisada',()=>markRead(item.id)));
    row.append(left,right);list.append(row);
  }
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
  busy=true;
  const button=$('#valtec-wa-refresh');
  if(button){button.disabled=true;button.textContent='Carregando...';}
  try {
    const s=await client();if(!s)throw Error('Faça login na Central para consultar as conversas.');
    const {data,error}=await s.from('whatsapp_threads').select('id,display_name,phone,lead_id,created_at,last_message_at,last_message_preview,unread_count,contact_type,human_required,human_reason,classification_source').order('last_message_at',{ascending:false,nullsFirst:false}).limit(60);
    if(error)throw error;
    render(data||[]);
  }catch(error){$('#valtec-wa-info').textContent='Consulta indisponível: '+(error?.message||'tente novamente');}
  finally{busy=false;if(button){button.disabled=false;button.textContent='Atualizar conversas';}}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
else boot();
