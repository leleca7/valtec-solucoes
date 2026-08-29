import { getSupabase, isSupabaseConfigured } from './supabase.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '"':'&quot;' }[char]));
const norm = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const money = (value) => new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(Number(value) || 0);
const percent = (value) => Number.isFinite(value) ? `${Math.round(value)}%` : 'Sem base';
const localDateTime = (value) => value ? new Date(value).toLocaleString('pt-BR', { dateStyle:'short', timeStyle:'short' }) : '—';

const CONVERTED_LEAD_STATUS = new Set(['agendado','em_atendimento','concluido','avaliacao_solicitada','finalizado']);
const CLOSED_LEAD_STATUS = new Set(['finalizado','perdido','arquivado']);
const CLOSED_ORDER_STATUS = new Set(['concluido','cancelado']);
const state = {
  supabase:null,
  period:'30',
  leads:[], quotes:[], orders:[], businesses:[], technicians:[], parts:[], warranties:[],
  alerts:[]
};

async function client() {
  if (state.supabase) return state.supabase;
  if (!isSupabaseConfigured()) return null;
  state.supabase = await getSupabase();
  return state.supabase;
}

function injectStyles() {
  if ($('#valtec-management-css')) return;
  const link = document.createElement('link');
  link.id = 'valtec-management-css';
  link.rel = 'stylesheet';
  link.href = 'management-central.css?v=20260828-1';
  document.head.appendChild(link);
}

function injectUi() {
  if ($('[data-admin-tab="management"]')) return;
  const nav = $('.central-nav');
  const todayButton = nav?.querySelector('[data-admin-tab="today"]');
  if (nav) {
    const button = document.createElement('button');
    button.dataset.adminTab = 'management';
    button.innerHTML = 'Gestão <span class="management-nav-count" id="management-nav-count">0</span>';
    todayButton?.insertAdjacentElement('afterend', button) || nav.prepend(button);
    button.addEventListener('click', openTab);
  }

  const section = document.createElement('section');
  section.className = 'admin-tab management-tab';
  section.dataset.tabPanel = 'management';
  section.innerHTML = `
    <div class="management-head">
      <div><span class="kicker">Gestão</span><h2>Desempenho e exceções</h2><p>A gestão acompanha o que saiu do fluxo normal: atrasos, conversão, margem, recebimento, autonomia, recorrência e estoque.</p></div>
      <div class="management-controls"><select id="management-period" class="input"><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="365">Últimos 12 meses</option><option value="all">Todo o histórico</option></select><button id="management-refresh" class="btn btn-light" type="button">Atualizar</button></div>
    </div>
    <div class="management-metrics">
      <article><small>Primeira resposta</small><strong id="mgmt-response">Sem base</strong><span>média dos leads com contato registrado</span></article>
      <article><small>Lead para atendimento</small><strong id="mgmt-conversion">Sem base</strong><span>conversão para etapa operacional</span></article>
      <article><small>Aprovação de orçamento</small><strong id="mgmt-quote-approval">Sem base</strong><span>aprovados entre orçamentos decididos</span></article>
      <article><small>Margem das OS</small><strong id="mgmt-margin">R$ 0,00</strong><span>receita menos custos variáveis</span></article>
      <article><small>Saldo a receber</small><strong id="mgmt-receivable">R$ 0,00</strong><span>valor ainda não recebido</span></article>
      <article><small>Execução sem fundador</small><strong id="mgmt-independence">Sem base</strong><span>OS concluídas com informação preenchida</span></article>
      <article><small>Receita recorrente</small><strong id="mgmt-mrr">R$ 0,00</strong><span>contratos empresariais ativos</span></article>
      <article><small>Estoque abaixo do mínimo</small><strong id="mgmt-low-stock">0</strong><span>itens que pedem reposição</span></article>
    </div>
    <div class="management-grid">
      <section class="panel management-panel">
        <div class="management-panel-head"><div><span class="kicker">Fila gerencial</span><h3>Exceções que exigem decisão</h3><p>Ordenadas por impacto e atraso.</p></div><strong id="management-alert-total">0 pendências</strong></div>
        <div id="management-alerts" class="management-alert-list"></div>
      </section>
      <section class="panel management-panel">
        <div class="management-panel-head"><div><span class="kicker">Comercial</span><h3>Origem dos leads</h3><p>Volume e conversão no período.</p></div></div>
        <div id="management-sources" class="management-breakdown"></div>
        <div class="management-section"><h3>Capacidade técnica</h3><div id="management-technicians" class="management-operating"></div></div>
        <div class="management-data-note" id="management-data-note">Indicadores aparecem conforme os módulos forem ativados e os dados forem registrados. Ausência de dado não é tratada como resultado positivo.</div>
      </section>
    </div>`;

  const todayPanel = $('[data-tab-panel="today"]');
  if (todayPanel?.parentNode) todayPanel.parentNode.insertBefore(section, todayPanel.nextSibling);
  else $('.central-main')?.prepend(section);
  $('#management-period')?.addEventListener('change', (event) => { state.period = event.target.value; render(); });
  $('#management-refresh')?.addEventListener('click', refresh);
}

function activateTab() {
  $$('[data-admin-tab]').forEach((button) => button.classList.toggle('active', button.dataset.adminTab === 'management'));
  $$('[data-tab-panel]').forEach((panel) => panel.classList.toggle('active', panel.dataset.tabPanel === 'management'));
}

async function safeTable(table, limit = 1500) {
  try {
    const s = await client();
    const { data, error } = await s.from(table).select('*').limit(limit);
    return error ? [] : data || [];
  } catch { return []; }
}

async function load() {
  const [leads, quotes, orders, businesses, technicians, parts, warranties] = await Promise.all([
    safeTable('leads'), safeTable('quotes'), safeTable('service_orders', 2500), safeTable('business_accounts'), safeTable('technicians'), safeTable('parts_catalog'), safeTable('warranties')
  ]);
  state.leads = leads;
  state.quotes = quotes;
  state.orders = orders;
  state.businesses = businesses;
  state.technicians = technicians;
  state.parts = parts;
  state.warranties = warranties;
  buildAlerts();
}

function inPeriod(value) {
  if (state.period === 'all') return true;
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date >= new Date(Date.now() - Number(state.period) * 86400000);
}

function leadDate(lead) { return lead.created_at; }
function orderDate(order) { return order.completed_at || order.scheduled_for || order.created_at; }
function quoteDate(quote) { return quote.created_at; }

function orderEconomics(order) {
  const gross = Number(order.total_amount || (Number(order.parts_amount || 0) + Number(order.labor_amount || 0)) || 0);
  const revenue = Math.max(0, gross - Number(order.discount_amount || 0));
  const cost = Number(order.parts_cost || 0) + Number(order.consumables_cost || 0) + Number(order.travel_cost || 0) + Number(order.payment_fee || 0) + Number(order.warranty_rework_cost || 0) + Number(order.other_variable_cost || 0);
  const explicitReceived = Number(order.amount_received || 0);
  const received = explicitReceived > 0 ? explicitReceived : order.payment_status === 'pago' ? revenue : 0;
  return { revenue, cost, margin:revenue - cost, receivable:Math.max(0, revenue - received) };
}

function ageHours(value) { return value ? (Date.now() - new Date(value).getTime()) / 3600000 : 0; }
function dueHours(value) { return value ? (Date.now() - new Date(value).getTime()) / 3600000 : 0; }

function renderMetrics() {
  const leads = state.leads.filter((lead) => inPeriod(leadDate(lead)));
  const contacted = leads.filter((lead) => lead.contacted_at && new Date(lead.contacted_at) >= new Date(lead.created_at));
  const avgResponseHours = contacted.length ? contacted.reduce((sum, lead) => sum + (new Date(lead.contacted_at) - new Date(lead.created_at)) / 3600000, 0) / contacted.length : null;
  const converted = leads.filter((lead) => lead.converted_at || CONVERTED_LEAD_STATUS.has(lead.status)).length;
  const conversionRate = leads.length ? (converted / leads.length) * 100 : NaN;

  const quotes = state.quotes.filter((quote) => inPeriod(quoteDate(quote)));
  const decidedQuotes = quotes.filter((quote) => ['aprovado','recusado','cancelado'].includes(quote.status));
  const approvedQuotes = decidedQuotes.filter((quote) => quote.status === 'aprovado').length;
  const approval = decidedQuotes.length ? (approvedQuotes / decidedQuotes.length) * 100 : NaN;

  const orders = state.orders.filter((order) => order.status !== 'cancelado' && inPeriod(orderDate(order)));
  const completed = orders.filter((order) => order.status === 'concluido');
  const margin = completed.reduce((sum, order) => sum + orderEconomics(order).margin, 0);
  const receivable = orders.reduce((sum, order) => sum + orderEconomics(order).receivable, 0);
  const founderKnown = completed.filter((order) => typeof order.founder_executed === 'boolean');
  const independent = founderKnown.filter((order) => order.founder_executed === false).length;
  const independence = founderKnown.length ? (independent / founderKnown.length) * 100 : NaN;

  const mrr = state.businesses.filter((business) => business.contract_status === 'ativo').reduce((sum, business) => sum + Number(business.monthly_value || 0), 0);
  const lowStock = state.parts.filter((part) => Number(part.min_stock || 0) > 0 && Number(part.stock_qty || 0) <= Number(part.min_stock || 0)).length;

  $('#mgmt-response').textContent = avgResponseHours === null ? 'Sem base' : avgResponseHours < 1 ? `${Math.round(avgResponseHours * 60)} min` : `${avgResponseHours.toFixed(avgResponseHours < 10 ? 1 : 0)} h`;
  $('#mgmt-conversion').textContent = percent(conversionRate);
  $('#mgmt-quote-approval').textContent = percent(approval);
  $('#mgmt-margin').textContent = money(margin);
  $('#mgmt-receivable').textContent = money(receivable);
  $('#mgmt-independence').textContent = percent(independence);
  $('#mgmt-mrr').textContent = money(mrr);
  $('#mgmt-low-stock').textContent = lowStock;
}

function addAlert(alerts, alert) {
  alerts.push({ severity:'attention', time:new Date().toISOString(), ...alert });
}

function buildAlerts() {
  const alerts = [];
  const now = new Date();
  const activeLeadStatuses = new Set(['novo','triagem','contatado','contato_realizado','orcamento_preparacao','orcamento_enviado','aguardando_cliente','agendado','em_atendimento']);

  state.leads.forEach((lead) => {
    if (!activeLeadStatuses.has(lead.status)) return;
    if (lead.next_action_at && new Date(lead.next_action_at) < now) {
      const overdue = dueHours(lead.next_action_at);
      addAlert(alerts, { severity:overdue >= 24 ? 'critical' : 'attention', type:'Lead', title:lead.customer_name || 'Lead sem nome', text:`${lead.next_action || 'Próxima ação atrasada'} · previsto ${localDateTime(lead.next_action_at)}`, tab:'leads', time:lead.next_action_at });
    } else if (lead.status === 'novo' && ageHours(lead.created_at) >= 2) {
      addAlert(alerts, { severity:ageHours(lead.created_at) >= 6 ? 'critical' : 'attention', type:'Lead', title:lead.customer_name || 'Lead sem nome', text:`Lead novo sem primeiro contato registrado há ${Math.round(ageHours(lead.created_at))} h.`, tab:'leads', time:lead.created_at });
    }
  });

  state.quotes.forEach((quote) => {
    if (quote.status !== 'enviado') return;
    const reference = quote.updated_at || quote.created_at;
    if (ageHours(reference) >= 48) addAlert(alerts, { severity:ageHours(reference) >= 96 ? 'critical' : 'attention', type:'Orçamento', title:quote.quote_number || quote.title || 'Orçamento enviado', text:`Sem decisão registrada há ${Math.round(ageHours(reference) / 24)} dias.`, tab:'quotes', time:reference });
  });

  state.orders.forEach((order) => {
    const economics = orderEconomics(order);
    if (order.scheduled_for && new Date(order.scheduled_for) < now && !CLOSED_ORDER_STATUS.has(order.status)) {
      addAlert(alerts, { severity:dueHours(order.scheduled_for) >= 24 ? 'critical' : 'attention', type:'Agenda', title:order.order_number || 'OS agendada', text:`Atendimento previsto para ${localDateTime(order.scheduled_for)} ainda está em ${order.status || 'aberto'}.`, tab:'orders', time:order.scheduled_for });
    }
    if (order.payment_due_at && new Date(order.payment_due_at) < now && economics.receivable > 0) {
      addAlert(alerts, { severity:'critical', type:'Financeiro', title:order.order_number || 'OS com saldo', text:`Saldo vencido de ${money(economics.receivable)} desde ${localDateTime(order.payment_due_at)}.`, tab:'finance', time:order.payment_due_at });
    }
    if (order.return_required && order.return_scheduled_for && new Date(order.return_scheduled_for) < now && order.status !== 'cancelado') {
      addAlert(alerts, { severity:'critical', type:'Retorno', title:order.order_number || 'Retorno técnico', text:`Retorno previsto para ${localDateTime(order.return_scheduled_for)} ainda exige acompanhamento.`, tab:'orders', time:order.return_scheduled_for });
    }
  });

  state.businesses.forEach((business) => {
    if (business.next_action_at && new Date(business.next_action_at) < now && !['perdido','pausado'].includes(business.status)) {
      addAlert(alerts, { severity:dueHours(business.next_action_at) >= 48 ? 'critical' : 'attention', type:'Empresa', title:business.name || 'Empresa', text:`${business.next_action || 'Ação comercial'} estava prevista para ${localDateTime(business.next_action_at)}.`, tab:'business', time:business.next_action_at });
    }
    if (business.next_visit_at) {
      const diff = new Date(business.next_visit_at) - now;
      if (diff >= 0 && diff <= 7 * 86400000) addAlert(alerts, { severity:'planned', type:'Preventiva', title:business.name || 'Empresa', text:`Visita prevista para ${localDateTime(business.next_visit_at)}.`, tab:'business', time:business.next_visit_at });
      if (diff < 0 && business.contract_status === 'ativo') addAlert(alerts, { severity:'critical', type:'Preventiva', title:business.name || 'Empresa', text:`Visita preventiva vencida desde ${localDateTime(business.next_visit_at)}.`, tab:'business', time:business.next_visit_at });
    }
  });

  state.parts.forEach((part) => {
    const stock = Number(part.stock_qty || 0);
    const min = Number(part.min_stock || 0);
    if (min <= 0 || stock > min) return;
    addAlert(alerts, { severity:stock <= 0 ? 'critical' : 'attention', type:'Estoque', title:part.name || 'Peça', text:stock <= 0 ? `Sem estoque. Mínimo configurado: ${min}.` : `Saldo ${stock}; mínimo configurado: ${min}.`, tab:'inventory', time:now.toISOString() });
  });

  const rank = { critical:0, attention:1, planned:2 };
  state.alerts = alerts.sort((a,b) => rank[a.severity] - rank[b.severity] || new Date(a.time) - new Date(b.time));
}

function renderAlerts() {
  const box = $('#management-alerts');
  const alerts = state.alerts.slice(0,60);
  $('#management-alert-total').textContent = `${state.alerts.length} pendência${state.alerts.length === 1 ? '' : 's'}`;
  $('#management-nav-count').textContent = state.alerts.filter((alert) => alert.severity !== 'planned').length;
  box.innerHTML = alerts.length ? alerts.map((alert, index) => `<article class="management-alert ${alert.severity}"><span class="management-alert-type">${esc(alert.type)}</span><div><b>${esc(alert.title)}</b><p>${esc(alert.text)}</p></div><button class="mini-button" type="button" data-management-open="${index}">Abrir</button></article>`).join('') : '<div class="management-empty">Nenhuma exceção operacional foi identificada nos dados disponíveis. Isso não substitui conferência de qualidade nem valida dados que ainda não estejam sendo registrados.</div>';
  $$('[data-management-open]').forEach((button) => button.addEventListener('click', () => goToAlert(alerts[Number(button.dataset.managementOpen)])));
}

function goToAlert(alert) {
  const tab = alert?.tab;
  if (!tab) return;
  const button = document.querySelector(`[data-admin-tab="${tab}"]`);
  if (button) button.click();
}

function renderSources() {
  const leads = state.leads.filter((lead) => inPeriod(leadDate(lead)));
  const groups = new Map();
  leads.forEach((lead) => {
    const source = lead.source || 'Não informada';
    const current = groups.get(source) || { total:0, converted:0 };
    current.total += 1;
    if (lead.converted_at || CONVERTED_LEAD_STATUS.has(lead.status)) current.converted += 1;
    groups.set(source, current);
  });
  const rows = [...groups.entries()].sort((a,b) => b[1].total - a[1].total);
  $('#management-sources').innerHTML = rows.length ? rows.map(([source, data]) => `<div class="management-breakdown-row"><b>${esc(source)}</b><span>${data.total} leads</span><strong>${data.total ? Math.round((data.converted / data.total) * 100) : 0}%</strong></div>`).join('') : '<div class="management-empty">Ainda não há leads no período selecionado.</div>';
}

function ordersForTechnician(technician, completedOnly = true) {
  return state.orders.filter((order) => {
    if (completedOnly && order.status !== 'concluido') return false;
    if (!inPeriod(orderDate(order))) return false;
    return order.technician_id === technician.id || (!order.technician_id && norm(order.assigned_technician) === norm(technician.name));
  });
}

function renderTechnicians() {
  const active = state.technicians.filter((technician) => technician.active !== false && !['inativo','candidato'].includes(technician.status));
  $('#management-technicians').innerHTML = active.length ? active.map((technician) => {
    const orders = ordersForTechnician(technician);
    const returns = orders.filter((order) => order.return_required).length;
    const known = orders.filter((order) => typeof order.founder_executed === 'boolean');
    const independent = known.filter((order) => order.founder_executed === false).length;
    return `<div class="management-operating-row"><div><b>${esc(technician.name)}</b><p>${orders.length} OS concluídas · ${returns} retorno${returns === 1 ? '' : 's'}</p></div><strong>${known.length ? `${Math.round((independent / known.length) * 100)}% sem fundador` : technician.can_work_solo ? 'Autônomo cadastrado' : 'Sem base'}</strong></div>`;
  }).join('') : '<div class="management-empty">A capacidade por técnico aparecerá quando o módulo de equipe tiver profissionais ativos.</div>';
}

function render() {
  buildAlerts();
  renderMetrics();
  renderAlerts();
  renderSources();
  renderTechnicians();
}

async function refresh() {
  const button = $('#management-refresh');
  if (button) button.disabled = true;
  await load();
  render();
  if (button) button.disabled = false;
}

async function openTab() {
  activateTab();
  await refresh();
}

async function boot() {
  if (!isSupabaseConfigured()) return;
  const s = await client();
  const { data } = await s.auth.getSession();
  if (!data?.session) return;
  injectStyles();
  injectUi();
  await load();
  $('#management-nav-count').textContent = state.alerts.filter((alert) => alert.severity !== 'planned').length;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
else boot();
