import { getSupabase, isSupabaseConfigured } from './supabase.js';

const $ = (selector, root = document) => root.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '"':'&quot;' }[char]));
const digits = (value) => String(value || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
const money = (value) => new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(Number(value) || 0);
const localDate = (value) => value ? new Date(value).toLocaleDateString('pt-BR') : '—';
const localDateTime = (value) => value ? new Date(value).toLocaleString('pt-BR', { dateStyle:'short', timeStyle:'short' }) : '—';

const state = { supabase:null, enabled:false, client:null, leads:[], quotes:[], orders:[], receipts:[], warranties:[] };

async function client() {
  if (state.supabase) return state.supabase;
  if (!isSupabaseConfigured()) return null;
  state.supabase = await getSupabase();
  return state.supabase;
}

function injectStyles() {
  if ($('#valtec-client360-css')) return;
  const link = document.createElement('link');
  link.id = 'valtec-client360-css';
  link.rel = 'stylesheet';
  link.href = 'client-360.css?v=20260828-1';
  document.head.appendChild(link);
}

function ensureOverlay() {
  let overlay = $('#client360-overlay');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'client360-overlay';
  overlay.className = 'client360-overlay hidden';
  overlay.innerHTML = '<aside class="client360-sheet" id="client360-sheet"><div class="client360-loading">Carregando histórico do cliente...</div></aside>';
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay || event.target.closest('[data-client360-close]')) close360();
  });
  return overlay;
}

function close360() {
  $('#client360-overlay')?.classList.add('hidden');
}

async function loadData(clientId) {
  const s = await client();
  const [clientRes, leadsRes, quotesRes, ordersRes, receiptsRes, warrantiesRes] = await Promise.all([
    s.from('clients').select('*').eq('id', clientId).maybeSingle(),
    s.from('leads').select('*').eq('client_id', clientId).order('created_at', { ascending:false }).limit(200),
    s.from('quotes').select('*').eq('client_id', clientId).order('created_at', { ascending:false }).limit(200),
    s.from('service_orders').select('*').eq('client_id', clientId).order('created_at', { ascending:false }).limit(300),
    s.from('receipts').select('*').eq('client_id', clientId).order('issued_at', { ascending:false }).limit(200),
    s.from('warranties').select('*').eq('client_id', clientId).order('ends_at', { ascending:false }).limit(200)
  ]);
  if (clientRes.error || !clientRes.data) throw clientRes.error || new Error('Cliente não encontrado.');
  state.client = clientRes.data;
  state.leads = leadsRes.error ? [] : leadsRes.data || [];
  state.quotes = quotesRes.error ? [] : quotesRes.data || [];
  state.orders = ordersRes.error ? [] : ordersRes.data || [];
  state.receipts = receiptsRes.error ? [] : receiptsRes.data || [];
  state.warranties = warrantiesRes.error ? [] : warrantiesRes.data || [];
}

function orderAmount(order) {
  return Number(order.total_amount || (Number(order.parts_amount || 0) + Number(order.labor_amount || 0)) || 0);
}

function quoteAmount(quote) {
  return Number(quote.negotiated_total ?? quote.original_total ?? 0);
}

function timeline() {
  const events = [];
  state.leads.forEach((lead) => events.push({
    date: lead.created_at,
    type: 'Lead',
    title: lead.equipment || 'Novo contato',
    text: (lead.problems || []).join(', ') || lead.description || `Origem: ${lead.source || 'não informada'}`,
    status: lead.status || 'novo'
  }));
  state.quotes.forEach((quote) => events.push({
    date: quote.created_at,
    type: 'Orçamento',
    title: quote.quote_number || quote.title || 'Orçamento Valtec',
    text: `Valor: ${money(quoteAmount(quote))}`,
    status: quote.status || 'rascunho'
  }));
  state.orders.forEach((order) => events.push({
    date: order.completed_at || order.scheduled_for || order.created_at,
    type: 'Ordem de serviço',
    title: `${order.order_number || 'OS'} · ${order.equipment || 'Equipamento'}`,
    text: order.service_description || order.diagnosis || order.problem || `Valor: ${money(orderAmount(order))}`,
    status: order.status || 'aberto'
  }));
  state.receipts.forEach((receipt) => events.push({
    date: receipt.issued_at || receipt.created_at,
    type: 'Recebimento',
    title: receipt.receipt_number || 'Recibo',
    text: `${money(receipt.amount)}${receipt.payment_method ? ` · ${receipt.payment_method}` : ''}`,
    status: 'registrado'
  }));
  state.warranties.forEach((warranty) => events.push({
    date: warranty.starts_at || warranty.created_at,
    type: 'Garantia',
    title: `Cobertura até ${localDate(warranty.ends_at)}`,
    text: warranty.notes || 'Garantia vinculada ao atendimento.',
    status: warranty.status || 'ativa'
  }));
  return events.filter((event) => event.date).sort((a,b) => new Date(b.date) - new Date(a.date));
}

function nextAction() {
  const activeLead = state.leads
    .filter((lead) => !['finalizado','perdido','arquivado','concluido'].includes(lead.status))
    .sort((a,b) => new Date(a.next_action_at || a.created_at) - new Date(b.next_action_at || b.created_at))[0];
  if (activeLead?.next_action) return `${activeLead.next_action}${activeLead.next_action_at ? ` · ${localDateTime(activeLead.next_action_at)}` : ''}`;
  const nextOrder = state.orders
    .filter((order) => order.scheduled_for && !['concluido','cancelado'].includes(order.status) && new Date(order.scheduled_for) >= new Date())
    .sort((a,b) => new Date(a.scheduled_for) - new Date(b.scheduled_for))[0];
  if (nextOrder) return `Atendimento agendado para ${localDateTime(nextOrder.scheduled_for)}.`;
  return 'Nenhuma ação pendente registrada para este cliente.';
}

function equipmentHistory() {
  const values = state.orders.map((order) => [order.equipment, order.equipment_brand, order.equipment_model].filter(Boolean).join(' · ')).filter(Boolean);
  const unique = [...new Set(values)];
  return unique.length ? unique.join('; ') : state.client.equipment_notes || 'Nenhum equipamento registrado no histórico.';
}

function render() {
  const sheet = $('#client360-sheet');
  const c = state.client;
  if (!sheet || !c) return;
  const totalServices = state.orders.reduce((sum, order) => sum + orderAmount(order), 0);
  const activeWarranties = state.warranties.filter((warranty) => warranty.status === 'ativa' && (!warranty.ends_at || new Date(`${warranty.ends_at}T23:59:59`) >= new Date())).length;
  const events = timeline();
  const recurring = state.orders.length > 1 ? 'Recorrente' : 'Primeiro ciclo';

  sheet.innerHTML = `
    <div class="client360-head">
      <div><span class="kicker">Cliente 360</span><h2>${esc(c.name || 'Cliente')}</h2><p>${esc(c.phone || 'Sem telefone')} · ${esc(c.neighborhood || 'Bairro não informado')} · ${recurring}</p></div>
      <button type="button" class="client360-close" data-client360-close aria-label="Fechar">×</button>
    </div>
    <div class="client360-actions">
      ${c.phone ? `<a class="btn btn-secondary" target="_blank" rel="noopener" href="https://wa.me/55${digits(c.phone)}">WhatsApp</a>` : ''}
      <button class="btn btn-primary" type="button" data-client360-quote>Novo orçamento</button>
      <button class="btn btn-light" type="button" data-client360-order>Nova OS</button>
    </div>
    <div class="client360-metrics">
      <article><small>Ordens de serviço</small><strong>${state.orders.length}</strong></article>
      <article><small>Total em serviços</small><strong>${money(totalServices)}</strong></article>
      <article><small>Orçamentos</small><strong>${state.quotes.length}</strong></article>
      <article><small>Garantias ativas</small><strong>${activeWarranties}</strong></article>
    </div>
    <div class="client360-next"><small>Próxima ação</small><strong>${esc(nextAction())}</strong></div>
    <section class="client360-section">
      <div class="client360-section-head"><h3>Cadastro e contexto</h3><span>Cliente desde ${localDate(c.created_at)}</span></div>
      <div class="client360-info">
        <div><small>Telefone</small><strong>${esc(c.phone || '—')}</strong></div>
        <div><small>E-mail</small><strong>${esc(c.email || '—')}</strong></div>
        <div><small>Bairro</small><strong>${esc(c.neighborhood || '—')}</strong></div>
        <div><small>Endereço</small><strong>${esc(c.address || '—')}</strong></div>
        <div class="wide"><small>Equipamentos já atendidos</small><p>${esc(equipmentHistory())}</p></div>
        <div class="wide"><small>Observação interna</small><p>${esc(c.notes || 'Nenhuma observação cadastrada.')}</p></div>
      </div>
    </section>
    <section class="client360-section">
      <div class="client360-section-head"><h3>Histórico completo</h3><span>${events.length} registros</span></div>
      <div class="client360-timeline">
        ${events.length ? events.map((event) => `<article class="client360-event"><time>${localDateTime(event.date)}</time><div><b>${esc(event.type)} · ${esc(event.title)}</b><p>${esc(event.text)}</p></div><span class="client360-event-status">${esc(event.status)}</span></article>`).join('') : '<div class="client360-empty">Ainda não há movimentações vinculadas a este cliente.</div>'}
      </div>
    </section>`;

  $('[data-client360-quote]', sheet)?.addEventListener('click', createQuote);
  $('[data-client360-order]', sheet)?.addEventListener('click', createOrder);
}

function createQuote() {
  const c = state.client;
  close360();
  document.querySelector('[data-admin-tab="quotes"]')?.click();
  setTimeout(() => {
    $('#clear-quote')?.click();
    if ($('#quote-client')) $('#quote-client').value = c.name || '';
    if ($('#quote-phone')) $('#quote-phone').value = c.phone || '';
    if ($('#quote-address')) $('#quote-address').value = [c.address, c.neighborhood].filter(Boolean).join(' · ');
    $('#quote-client')?.dispatchEvent(new Event('input', { bubbles:true }));
  }, 40);
}

function createOrder() {
  const c = state.client;
  close360();
  document.querySelector('[data-admin-tab="orders"]')?.click();
  setTimeout(() => {
    $('#new-order')?.click();
    setTimeout(() => {
      if ($('#order-client')) $('#order-client').value = c.name || '';
      if ($('#order-client-id')) $('#order-client-id').value = c.id || '';
    }, 20);
  }, 30);
}

async function open360(clientId) {
  const overlay = ensureOverlay();
  const sheet = $('#client360-sheet');
  sheet.innerHTML = '<div class="client360-loading">Carregando histórico do cliente...</div>';
  overlay.classList.remove('hidden');
  try {
    await loadData(clientId);
    render();
  } catch (error) {
    sheet.innerHTML = `<div class="client360-head"><div><span class="kicker">Cliente 360</span><h2>Não foi possível carregar</h2><p>${esc(error?.message || 'Erro ao consultar o histórico.')}</p></div><button type="button" class="client360-close" data-client360-close>×</button></div>`;
  }
}

function bind() {
  document.addEventListener('click', (event) => {
    const history = event.target.closest('[data-client-orders]');
    if (!history || !state.enabled) return;
    event.preventDefault();
    event.stopPropagation();
    open360(history.dataset.clientOrders);
  }, true);
}

async function boot() {
  injectStyles();
  if (!isSupabaseConfigured()) return;
  const s = await client();
  const { data } = await s.auth.getSession();
  if (!data?.session) return;
  state.enabled = true;
  ensureOverlay();
  bind();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
else boot();
