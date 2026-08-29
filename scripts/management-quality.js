import { getSupabase, isSupabaseConfigured } from './supabase.js';

const $ = (selector, root = document) => root.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '"':'&quot;' }[char]));
const ageHours = (value) => value ? (Date.now() - new Date(value).getTime()) / 3600000 : 0;
const localDateTime = (value) => value ? new Date(value).toLocaleString('pt-BR', { dateStyle:'short', timeStyle:'short' }) : '—';
const ACTIVE_LEADS = new Set(['novo','triagem','contatado','contato_realizado','orcamento_preparacao','orcamento_enviado','aguardando_cliente','agendado','em_atendimento']);
const ACTIVE_ORDERS = new Set(['aberto','agendado','em_atendimento','aguardando_peca','aguardando_cliente']);
const state = { supabase:null, issues:[], counts:{ lead:0, order:0, delegation:0, preventive:0 } };

async function supabase() {
  if (state.supabase) return state.supabase;
  if (!isSupabaseConfigured()) return null;
  state.supabase = await getSupabase();
  return state.supabase;
}

function injectStyles() {
  if ($('#valtec-management-quality-css')) return;
  const link = document.createElement('link');
  link.id = 'valtec-management-quality-css';
  link.rel = 'stylesheet';
  link.href = 'management-quality.css?v=20260829-1';
  document.head.appendChild(link);
}

function ensurePanel() {
  const tab = $('[data-tab-panel="management"]');
  if (!tab || $('#management-quality-panel')) return;
  const panel = document.createElement('section');
  panel.id = 'management-quality-panel';
  panel.className = 'panel management-quality-panel';
  panel.innerHTML = `
    <div class="management-quality-head">
      <div><span class="kicker">Qualidade dos dados</span><h3>Registros que impedem gestão confiável</h3><p>Campo vazio relevante vira pendência operacional, não resultado positivo.</p></div>
      <span class="management-quality-score" id="management-quality-score">Aguardando leitura</span>
    </div>
    <div class="management-quality-metrics">
      <article><small>Leads sem próxima ação</small><strong id="quality-leads">0</strong></article>
      <article><small>OS sem responsável</small><strong id="quality-orders">0</strong></article>
      <article><small>Conclusões sem delegação</small><strong id="quality-delegation">0</strong></article>
      <article><small>Preventivas pendentes</small><strong id="quality-preventive">0</strong></article>
    </div>
    <div id="management-quality-list" class="management-quality-list"></div>`;
  const grid = $('.management-grid', tab);
  if (grid) grid.insertAdjacentElement('afterend', panel);
  else tab.appendChild(panel);
}

async function safeSelect(table, columns) {
  try {
    const s = await supabase();
    if (!s) return [];
    const { data, error } = await s.from(table).select(columns).limit(2000);
    return error ? [] : data || [];
  } catch { return []; }
}

function addIssue(issue) {
  state.issues.push({ severity:'attention', tab:'management', ...issue });
}

async function loadQuality() {
  const [leads, orders, assets, businesses, technicians, parts] = await Promise.all([
    safeSelect('leads','id,customer_name,status,next_action,next_action_at,created_at'),
    safeSelect('service_orders','id,order_number,status,assigned_technician,technician_id,founder_executed,completed_at,created_at'),
    safeSelect('business_assets','id,business_id,equipment_type,next_preventive_at'),
    safeSelect('business_accounts','id,name,status,contract_status,next_visit_at,preventive_frequency_days'),
    safeSelect('technicians','id,name,status,autonomy_level,can_work_solo,route_ready,active'),
    safeSelect('parts_catalog','id,name,stock_qty,min_stock,preferred_supplier_id,active')
  ]);

  state.issues = [];
  state.counts = { lead:0, order:0, delegation:0, preventive:0 };
  const now = new Date();
  const businessById = new Map(businesses.map((business) => [business.id, business]));

  leads.forEach((lead) => {
    if (!ACTIVE_LEADS.has(lead.status)) return;
    if (lead.next_action && lead.next_action_at) return;
    if (ageHours(lead.created_at) < 2) return;
    state.counts.lead += 1;
    addIssue({ severity:ageHours(lead.created_at) >= 24 ? 'critical' : 'attention', type:'Lead', title:lead.customer_name || 'Lead sem nome', text:`Lead ativo há ${Math.round(ageHours(lead.created_at))} h sem próxima ação completa.`, tab:'leads' });
  });

  orders.forEach((order) => {
    if (ACTIVE_ORDERS.has(order.status) && !order.technician_id && !order.assigned_technician) {
      state.counts.order += 1;
      addIssue({ severity:ageHours(order.created_at) >= 24 ? 'critical' : 'attention', type:'OS', title:order.order_number || 'OS sem número', text:'Ordem ativa sem técnico responsável registrado.', tab:'orders' });
    }
    if (order.status === 'concluido' && typeof order.founder_executed !== 'boolean') {
      state.counts.delegation += 1;
      addIssue({ severity:'attention', type:'Delegação', title:order.order_number || 'OS concluída', text:'Conclusão sem registro de participação física do fundador; o indicador de delegação fica incompleto.', tab:'orders' });
    }
  });

  assets.forEach((asset) => {
    if (!asset.next_preventive_at) return;
    const date = new Date(asset.next_preventive_at);
    const diff = date - now;
    if (diff > 7 * 86400000) return;
    const business = businessById.get(asset.business_id);
    state.counts.preventive += 1;
    addIssue({ severity:diff < 0 ? 'critical' : 'planned', type:'Preventiva', title:`${business?.name || 'Empresa'} · ${asset.equipment_type || 'equipamento'}`, text:diff < 0 ? `Preventiva vencida desde ${localDateTime(asset.next_preventive_at)}.` : `Preventiva prevista para ${localDateTime(asset.next_preventive_at)}.`, tab:'business' });
  });

  businesses.forEach((business) => {
    if (business.contract_status !== 'ativo' || business.next_visit_at) return;
    const hasAssetDate = assets.some((asset) => asset.business_id === business.id && asset.next_preventive_at);
    if (hasAssetDate) return;
    state.counts.preventive += 1;
    addIssue({ severity:'attention', type:'Preventiva', title:business.name || 'Empresa ativa', text:'Contrato ativo sem próxima visita ou preventiva registrada.', tab:'business' });
  });

  technicians.forEach((technician) => {
    if (technician.active === false || technician.status === 'inativo') return;
    if (['autonomo','ensina'].includes(technician.autonomy_level) && !technician.can_work_solo) {
      addIssue({ severity:'attention', type:'Técnico', title:technician.name || 'Profissional', text:'Autonomia indica execução independente, mas “pode trabalhar sozinho” está desmarcado.', tab:'technicians' });
    }
    if (technician.route_ready && !technician.can_work_solo) {
      addIssue({ severity:'critical', type:'Técnico', title:technician.name || 'Profissional', text:'Profissional marcado como pronto para rota sem estar liberado para trabalhar sozinho.', tab:'technicians' });
    }
  });

  parts.forEach((part) => {
    if (part.active === false) return;
    const stock = Number(part.stock_qty || 0);
    const min = Number(part.min_stock || 0);
    if (min > 0 && stock <= min && !part.preferred_supplier_id) {
      addIssue({ severity:stock <= 0 ? 'critical' : 'attention', type:'Estoque', title:part.name || 'Peça', text:`Saldo ${stock}, mínimo ${min}, sem fornecedor preferencial definido.`, tab:'inventory' });
    }
  });

  const rank = { critical:0, attention:1, planned:2 };
  state.issues.sort((a,b) => rank[a.severity] - rank[b.severity]);
}

function renderQuality() {
  ensurePanel();
  const list = $('#management-quality-list');
  if (!list) return;
  $('#quality-leads').textContent = state.counts.lead;
  $('#quality-orders').textContent = state.counts.order;
  $('#quality-delegation').textContent = state.counts.delegation;
  $('#quality-preventive').textContent = state.counts.preventive;
  const critical = state.issues.filter((issue) => issue.severity === 'critical').length;
  $('#management-quality-score').textContent = state.issues.length ? `${state.issues.length} ajuste${state.issues.length === 1 ? '' : 's'} · ${critical} crítico${critical === 1 ? '' : 's'}` : 'Registro consistente';
  list.innerHTML = state.issues.length ? state.issues.slice(0,60).map((issue, index) => `<article class="management-quality-row ${issue.severity}"><span>${esc(issue.type)}</span><div><b>${esc(issue.title)}</b><p>${esc(issue.text)}</p></div><button class="mini-button" type="button" data-quality-open="${index}">Abrir</button></article>`).join('') : '<div class="management-quality-empty">Nenhuma inconsistência relevante foi identificada nos dados disponíveis.</div>';
  list.querySelectorAll('[data-quality-open]').forEach((button) => button.addEventListener('click', () => {
    const issue = state.issues[Number(button.dataset.qualityOpen)];
    document.querySelector(`[data-admin-tab="${issue?.tab || 'management'}"]`)?.click();
  }));
}

async function refreshQuality() {
  await loadQuality();
  renderQuality();
}

function bind() {
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-admin-tab="management"]') || event.target.closest('#management-refresh')) setTimeout(refreshQuality, 40);
  });
}

async function boot() {
  if (!isSupabaseConfigured()) return;
  const s = await supabase();
  const { data } = await s.auth.getSession();
  if (!data?.session) return;
  injectStyles();
  ensurePanel();
  bind();
  await refreshQuality();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
else boot();
