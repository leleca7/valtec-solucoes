import { getSupabase } from './supabase.js';

const $ = (selector, root=document) => root.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const brl = (value) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value)||0);
const dateBR = value => value ? value.split('-').reverse().join('/') : '—';
const digits = value => String(value||'').replace(/\D/g,'');
const tab = () => $('[data-tab-panel="finance"]');
const panel = () => $('#stone-reconciliation-panel');
let working = false;
let refreshTimer;

const labels = {
  conversa_e_comprovante: 'WhatsApp + comprovante',
  recibo_identificado: 'Recibo identificado',
  nome_e_data: 'Nome e data',
  conversa_indireta: 'Possível pagamento por terceiro',
  nao_localizado: 'Não identificado no WhatsApp'
};
function viewing() {
  const admin=$('#admin-view');
  return document.visibilityState==='visible' && panel() && tab()?.classList.contains('active') && admin && !admin.classList.contains('hidden');
}
function message(value) {
  const el=$('#stone-reconciliation-message');
  if(el)el.textContent=value;
}
async function fetchRows() {
  if(working || !viewing())return;
  working=true;
  try {
    const supabase=await getSupabase();
    if(!supabase)throw new Error('Faça login na Central para consultar os lançamentos.');
    const {data:items,error}=await supabase.from('valtec_bank_reconciliation')
      .select('id,payment_date,payer_name,amount,payment_method,matched_client_name,linked_thread_id,match_status,review_status,match_explanation,review_notes')
      .gte('payment_date','2026-10-01').lt('payment_date','2026-11-01')
      .order('payment_date',{ascending:false}).order('payer_name',{ascending:true}).limit(200);
    if(error)throw error;
    const rows=items||[];
    const withThread=[...new Set(rows.map(r=>r.linked_thread_id).filter(Boolean))];
    const phones=new Map();
    if(withThread.length){
      const result=await supabase.from('whatsapp_threads').select('id,phone').in('id',withThread);
      if(!result.error)(result.data||[]).forEach(t=>phones.set(t.id,t.phone));
    }
    render(rows,phones);
    message('Fonte: extrato Stone de 05/10 a 03/11/2026, apenas os lançamentos de outubro. Os dias 1º a 4 de outubro ainda não foram fornecidos.');
  } catch(e) {
    message('Não foi possível consultar a conciliação: '+(e?.message||'erro na consulta'));
  } finally {working=false;}
}
function render(rows,phones) {
  const wrapper=$('#stone-reconciliation-rows');
  if(!wrapper)return;
  const total=rows.reduce((acc,r)=>acc+Number(r.amount||0),0);
  const confirmed=rows.filter(r=>r.review_status==='confirmado_comercial');
  const confirmedAmount=confirmed.reduce((acc,r)=>acc+Number(r.amount||0),0);
  const linked=rows.filter(r=>r.linked_thread_id||r.match_status==='recibo_identificado').length;
  $('#stone-reconciliation-summary').textContent=
    rows.length+' entradas do extrato · '+brl(total)+' recebidos no banco · '+
    linked+' vinculadas a conversa ou recibo · '+
    confirmed.length+' confirmadas como serviço ('+brl(confirmedAmount)+')';
  wrapper.innerHTML=rows.map(row=>{
    const linkedName=row.matched_client_name||'Sem correspondência';
    const phone=phones.get(row.linked_thread_id);
    const wa=phone?'<a href="https://wa.me/'+digits(phone)+'" target="_blank" rel="noopener noreferrer">Abrir conversa</a>':'';
    const status=row.review_status==='confirmado_comercial'?'Confirmado como serviço':
      row.review_status==='pessoal_ou_terceiro'?'Pessoal / não comercial':'Aguardando conferência';
    const actions=row.review_status==='pendente'
      ? '<button class="btn btn-light" type="button" data-bank-action="confirmado_comercial" data-bank-id="'+esc(row.id)+'">Confirmar serviço</button>'+
        '<button class="btn btn-light" type="button" data-bank-action="pessoal_ou_terceiro" data-bank-id="'+esc(row.id)+'">Não comercial</button>'
      : '<button class="btn btn-light" type="button" data-bank-action="pendente" data-bank-id="'+esc(row.id)+'">Reabrir conferência</button>';
    return '<div class="stone-item">'+
      '<div class="stone-main"><strong>'+esc(row.payer_name)+'</strong><small>'+dateBR(row.payment_date)+' · '+esc(row.payment_method)+' · '+esc(status)+'</small>'+
      '<span>Contato: <b>'+esc(linkedName)+'</b> · '+esc(labels[row.match_status]||'Pendente')+' '+wa+'</span>'+
      (row.match_explanation?'<details><summary>Por que foi associado?</summary><p>'+esc(row.match_explanation)+'</p></details>':'')+
      '</div><div class="stone-meta"><b>'+brl(row.amount)+'</b><div class="stone-actions">'+actions+'</div></div></div>';
  }).join('')||'<p>Sem registros neste período.</p>';
}
async function review(id,status) {
  if(working)return;
  const wording=status==='confirmado_comercial'?'Confirmar que este Pix/cartão corresponde a um serviço efetivamente realizado?':
    status==='pessoal_ou_terceiro'?'Marcar como não comercial?':'Reabrir este lançamento para conferência?';
  if(!window.confirm(wording))return;
  working=true;
  try{
    const supabase=await getSupabase();
    if(!supabase)throw new Error('Faça login para atualizar.');
    const {data,error}=await supabase.from('valtec_bank_reconciliation')
      .update({review_status:status}).eq('id',id).select('id').single();
    if(error)throw error;
    if(!data)throw new Error('Atualização não confirmada; verifique as permissões.');
    message('Classificação salva. Nenhuma ordem de serviço ou recibo foi alterado automaticamente.');
  }catch(e){message('Não foi possível salvar: '+(e?.message||'erro na atualização'));}
  finally{working=false;}
  await fetchRows();
}
function boot() {
  const container=panel();
  if(!container)return;
  container.addEventListener('click', e=>{
    const b=e.target.closest('[data-bank-action]');
    if(!b)return;
    void review(b.dataset.bankId,b.dataset.bankAction);
  });
  $('#stone-reconciliation-refresh')?.addEventListener('click',()=>void fetchRows());
  const style=document.createElement('style');
  style.textContent='.stone-list{display:grid;gap:0;margin-top:10px}.stone-item{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;padding:14px 0;border-bottom:1px solid #e5eaf0}.stone-main{flex:1;min-width:220px;display:grid;gap:5px;font-size:13px}.stone-main small{color:#64748b}.stone-main span{color:#415267}.stone-main details summary{cursor:pointer;color:#426b95}.stone-main details p{line-height:1.45;color:#475569;white-space:pre-wrap}.stone-meta{text-align:right;min-width:140px}.stone-meta>b{font-size:18px}.stone-actions{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end;margin-top:8px}.stone-actions button{font-size:11px;padding:7px 9px}.stone-item a{color:#1c638a}@media(max-width:680px){.stone-meta{text-align:left}.stone-actions{justify-content:flex-start}}';
  document.head.append(style);
  const financeTab=tab();
  if(financeTab)new MutationObserver(()=>{if(viewing())void fetchRows();}).observe(financeTab,{attributes:true,attributeFilter:['class']});
  document.addEventListener('visibilitychange',()=>{if(viewing())void fetchRows();});
  window.addEventListener('focus',()=>{if(viewing())void fetchRows();});
  refreshTimer=window.setInterval(()=>{if(viewing())void fetchRows();},60000);
  if(viewing())void fetchRows();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
else boot();
