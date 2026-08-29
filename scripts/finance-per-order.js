import { getSupabase, isSupabaseConfigured } from './supabase.js';

const $ = (selector, root = document) => root.querySelector(selector);
const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
const numberValue = (selector) => Number($(selector)?.value) || 0;
const toInputDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));

const EXTRA_FIELDS = ['discount_amount','consumables_cost','payment_fee','warranty_rework_cost','technician_minutes','payment_due_at'];
const state = { supabase: null, schemaReady: null, current: null, orders: [], clients: new Map(), period: 'mes' };

async function client() {
  if (state.supabase) return state.supabase;
  if (!isSupabaseConfigured()) return null;
  state.supabase = await getSupabase();
  return state.supabase;
}

function injectStyles() {
  if ($('#valtec-finance-os-css')) return;
  const link = document.createElement('link');
  link.id = 'valtec-finance-os-css';
  link.rel = 'stylesheet';
  link.href = 'finance-per-order.css?v=20260828-1';
  document.head.appendChild(link);
}

async function checkSchema() {
  if (state.schemaReady !== null) return state.schemaReady;
  try {
    const s = await client();
    if (!s) return false;
    const { data: sessionData } = await s.auth.getSession();
    if (!sessionData?.session) return false;
    const { error } = await s.from('service_orders').select(`id,${EXTRA_FIELDS.join(',')},parts_cost,travel_cost,other_variable_cost,amount_received,assigned_technician,service_type,founder_executed`).limit(1);
    state.schemaReady = !error;
    return state.schemaReady;
  } catch {
    state.schemaReady = false;
    return false;
  }
}

function injectOrderFields() {
  const grid = $('#order-ops-section .order-ops-grid');
  const amountField = $('#order-amount-received')?.closest('.field');
  if (!grid || !amountField || $('#order-discount')) return;
  const wrapper = document.createElement('div');
  wrapper.className = 'order-finance-extra';
  wrapper.innerHTML = `
    <div class="field"><label>Desconto concedido</label><input id="order-discount" class="input" type="number" min="0" step="0.01"></div>
    <div class="field"><label>Material de consumo</label><input id="order-consumables-cost" class="input" type="number" min="0" step="0.01"></div>
    <div class="field"><label>Taxa de pagamento</label><input id="order-payment-fee" class="input" type="number" min="0" step="0.01"></div>
    <div class="field"><label>Custo de retrabalho / garantia</label><input id="order-rework-cost" class="input" type="number" min="0" step="0.01"></div>
    <div class="field"><label>Tempo técnico em minutos</label><input id="order-technician-minutes" class="input" type="number" min="0" step="1"></div>
    <div class="field"><label>Vencimento do saldo</label><input id="order-payment-due" class="input" type="datetime-local"></div>`;
  while (wrapper.firstChild) grid.insertBefore(wrapper.firstChild, amountField);

  const saleLabel = $('#order-ops-sale')?.closest('div')?.querySelector('small');
  if (saleLabel) saleLabel.textContent = 'Receita da OS';

  ['#order-discount','#order-consumables-cost','#order-payment-fee','#order-rework-cost','#order-technician-minutes','#order-payment-due','#order-parts','#order-labor','#order-parts-cost','#order-travel-cost','#order-other-cost']
    .forEach((selector) => $(selector)?.addEventListener('input', calculateOrderEconomics));
}

function calculateOrderEconomics() {
  const gross = numberValue('#order-parts') + numberValue('#order-labor');
  const revenue = Math.max(0, gross - numberValue('#order-discount'));
  const cost = numberValue('#order-parts-cost') + numberValue('#order-consumables-cost') + numberValue('#order-travel-cost') + numberValue('#order-payment-fee') + numberValue('#order-rework-cost') + numberValue('#order-other-cost');
  if ($('#order-ops-sale')) $('#order-ops-sale').textContent = money(revenue);
  if ($('#order-ops-cost')) $('#order-ops-cost').textContent = money(cost);
  if ($('#order-ops-margin')) $('#order-ops-margin').textContent = money(revenue - cost);
}

function resetOrderFinance() {
  state.current = null;
  $('#order-discount').value = '';
  $('#order-consumables-cost').value = '';
  $('#order-payment-fee').value = '';
  $('#order-rework-cost').value = '';
  $('#order-technician-minutes').value = '';
  $('#order-payment-due').value = '';
  calculateOrderEconomics();
}

async function loadOrderFinance(orderId) {
  if (!(await checkSchema()) || !orderId) return;
  try {
    const s = await client();
    const { data, error } = await s.from('service_orders').select(`id,${EXTRA_FIELDS.join(',')}`).eq('id', orderId).maybeSingle();
    if (error || !data) return;
    state.current = data;
    $('#order-discount').value = data.discount_amount || '';
    $('#order-consumables-cost').value = data.consumables_cost || '';
    $('#order-payment-fee').value = data.payment_fee || '';
    $('#order-rework-cost').value = data.warranty_rework_cost || '';
    $('#order-technician-minutes').value = data.technician_minutes || '';
    $('#order-payment-due').value = toInputDateTime(data.payment_due_at);
    calculateOrderEconomics();
  } catch {}
}

function snapshotOrderFinance() {
  return {
    discount_amount: numberValue('#order-discount'),
    consumables_cost: numberValue('#order-consumables-cost'),
    payment_fee: numberValue('#order-payment-fee'),
    warranty_rework_cost: numberValue('#order-rework-cost'),
    technician_minutes: Math.max(0, Math.round(numberValue('#order-technician-minutes'))) || null,
    payment_due_at: $('#order-payment-due')?.value ? new Date($('#order-payment-due').value).toISOString() : null
  };
}

async function persistOrderFinance(payload, originalId) {
  let orderId = originalId;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 180));
    orderId = orderId || $('#order-id')?.value || null;
    const message = $('#central-message')?.textContent || '';
    if (/não foi possível salvar a os/i.test(message)) return;
    if (orderId) break;
  }
  if (!orderId) return;
  try {
    const s = await client();
    const { error } = await s.from('service_orders').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', orderId);
    if (!error) state.current = { ...(state.current || {}), ...payload };
  } catch {}
}

function injectFinancePanel() {
  const tab = $('[data-tab-panel="finance"]');
  if (!tab || $('#finance-os-panel')) return;
  const existingGrid = tab.querySelector('.admin-grid');
  const panel = document.createElement('section');
  panel.id = 'finance-os-panel';
  panel.className = 'panel finance-os-panel';
  panel.innerHTML = `
    <div class="finance-os-head">
      <div><span class="kicker">Resultado por atendimento</span><h2>Margem por ordem de serviço</h2><p>Receita contratada menos desconto e custos variáveis diretamente ligados a cada OS.</p></div>
      <select id="finance-os-period" class="input finance-os-period"><option value="mes">Mês atual</option><option value="90">Últimos 90 dias</option><option value="ano">Ano atual</option><option value="todos">Todo o histórico</option></select>
    </div>
    <div class="finance-os-metrics">
      <article><small>Receita das OS</small><strong id="finance-os-revenue">R$ 0,00</strong></article>
      <article><small>Custo variável</small><strong id="finance-os-cost">R$ 0,00</strong></article>
      <article><small>Margem</small><strong id="finance-os-margin">R$ 0,00</strong></article>
      <article><small>Saldo a receber</small><strong id="finance-os-receivable">R$ 0,00</strong></article>
      <article><small>Receita por hora</small><strong id="finance-os-hour">Sem base</strong></article>
    </div>
    <div class="finance-os-table" id="finance-os-table"></div>
    <div class="finance-os-foot"><span id="finance-os-overdue">Nenhum saldo vencido identificado.</span><span id="finance-os-independence">Execução sem fundador: sem base suficiente.</span></div>`;
  tab.insertBefore(panel, existingGrid || tab.querySelector('#expense-form') || null);
  $('#finance-os-period')?.addEventListener('change', (event) => { state.period = event.target.value; renderFinancePanel(); });
}

function orderDate(order) {
  return new Date(order.completed_at || order.scheduled_for || order.created_at || 0);
}

function inPeriod(order) {
  if (state.period === 'todos') return true;
  const date = orderDate(order);
  const now = new Date();
  if (Number.isNaN(date.getTime())) return false;
  if (state.period === '90') return date >= new Date(Date.now() - 90 * 86400000);
  if (state.period === 'ano') return date.getFullYear() === now.getFullYear();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function economics(order) {
  const gross = Number(order.parts_amount || 0) + Number(order.labor_amount || 0);
  const revenue = Math.max(0, gross - Number(order.discount_amount || 0));
  const cost = Number(order.parts_cost || 0) + Number(order.consumables_cost || 0) + Number(order.travel_cost || 0) + Number(order.payment_fee || 0) + Number(order.warranty_rework_cost || 0) + Number(order.other_variable_cost || 0);
  const receivedRaw = Number(order.amount_received || 0);
  const received = receivedRaw > 0 ? receivedRaw : order.payment_status === 'pago' ? revenue : 0;
  return { gross, revenue, cost, margin: revenue - cost, received, receivable: Math.max(0, revenue - received) };
}

async function loadFinanceData() {
  if (!(await checkSchema())) return false;
  try {
    const s = await client();
    const [ordersRes, clientsRes] = await Promise.all([
      s.from('service_orders').select('id,client_id,order_number,status,parts_amount,labor_amount,payment_status,payment_method,created_at,scheduled_for,completed_at,assigned_technician,service_type,founder_executed,technician_minutes,discount_amount,parts_cost,consumables_cost,travel_cost,payment_fee,warranty_rework_cost,other_variable_cost,amount_received,payment_due_at').order('created_at', { ascending: false }).limit(1000),
      s.from('clients').select('id,name').limit(1000)
    ]);
    if (ordersRes.error) return false;
    state.orders = ordersRes.data || [];
    state.clients = new Map((clientsRes.data || []).map((row) => [row.id, row.name]));
    return true;
  } catch {
    return false;
  }
}

function renderFinancePanel() {
  const table = $('#finance-os-table');
  if (!table) return;
  const orders = state.orders.filter((order) => order.status !== 'cancelado' && inPeriod(order));
  const completed = orders.filter((order) => order.status === 'concluido');
  const resultBase = completed.length ? completed : orders;
  const totals = resultBase.reduce((acc, order) => {
    const e = economics(order);
    acc.revenue += e.revenue;
    acc.cost += e.cost;
    acc.margin += e.margin;
    acc.minutes += Number(order.technician_minutes || 0);
    return acc;
  }, { revenue: 0, cost: 0, margin: 0, minutes: 0 });
  const receivable = orders.reduce((sum, order) => sum + economics(order).receivable, 0);
  const overdueOrders = orders.filter((order) => economics(order).receivable > 0 && order.payment_due_at && new Date(order.payment_due_at) < new Date());
  const knownFounder = completed.filter((order) => typeof order.founder_executed === 'boolean');
  const independent = knownFounder.filter((order) => order.founder_executed === false).length;
  const revenueHour = totals.minutes > 0 ? totals.revenue / (totals.minutes / 60) : null;

  $('#finance-os-revenue').textContent = money(totals.revenue);
  $('#finance-os-cost').textContent = money(totals.cost);
  $('#finance-os-margin').textContent = money(totals.margin);
  $('#finance-os-receivable').textContent = money(receivable);
  $('#finance-os-hour').textContent = revenueHour === null ? 'Sem base' : money(revenueHour);
  $('#finance-os-overdue').textContent = overdueOrders.length ? `${overdueOrders.length} OS com saldo vencido, total ${money(overdueOrders.reduce((sum, order) => sum + economics(order).receivable, 0))}.` : 'Nenhum saldo vencido identificado.';
  $('#finance-os-independence').textContent = knownFounder.length ? `Execução sem fundador: ${Math.round((independent / knownFounder.length) * 100)}% das OS com informação preenchida.` : 'Execução sem fundador: sem base suficiente.';

  const visible = orders.slice(0, 40);
  table.innerHTML = visible.length ? `
    <div class="finance-os-row header"><span>OS / cliente</span><span class="finance-os-value">Receita</span><span class="finance-os-value">Custo</span><span class="finance-os-value">Margem</span><span class="finance-os-value">A receber</span></div>
    ${visible.map((order) => {
      const e = economics(order);
      const clientName = state.clients.get(order.client_id) || 'Cliente';
      const marginClass = e.margin < 0 ? 'finance-os-margin-negative' : 'finance-os-margin-positive';
      return `<div class="finance-os-row"><div><b>${esc(order.order_number || 'OS')} · ${esc(clientName)}</b><span>${esc(order.assigned_technician || 'Sem responsável')} · ${esc(order.service_type || 'serviço')}</span></div><span class="finance-os-value">${money(e.revenue)}</span><span class="finance-os-value">${money(e.cost)}</span><strong class="finance-os-value ${marginClass}">${money(e.margin)}</strong><span class="finance-os-value">${money(e.receivable)}</span></div>`;
    }).join('')}` : '<div class="finance-os-empty">Nenhuma OS encontrada no período selecionado.</div>';
}

async function refreshFinancePanel() {
  const ready = await loadFinanceData();
  if (!ready) return;
  renderFinancePanel();
}

function bind() {
  document.addEventListener('click', (event) => {
    if (event.target.closest('#new-order')) setTimeout(resetOrderFinance, 0);
    const edit = event.target.closest('[data-edit-order]');
    if (edit) setTimeout(() => loadOrderFinance(edit.dataset.editOrder), 0);
    if (event.target.closest('[data-admin-tab="finance"]') || event.target.closest('[data-go-tab="finance"]')) setTimeout(refreshFinancePanel, 0);
  });

  const form = $('#order-form');
  if (form && !form.dataset.financeOsBound) {
    form.dataset.financeOsBound = '1';
    form.addEventListener('submit', () => {
      if (state.schemaReady !== true) return;
      const payload = snapshotOrderFinance();
      const originalId = $('#order-id')?.value || null;
      persistOrderFinance(payload, originalId);
    });
  }
}

async function boot() {
  injectStyles();
  const ready = await checkSchema();
  if (!ready) return;
  injectOrderFields();
  injectFinancePanel();
  bind();
  calculateOrderEconomics();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
