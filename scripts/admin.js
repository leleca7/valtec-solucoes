import { getSupabase, isSupabaseConfigured } from './supabase.js';

const loginView = document.querySelector('#login-view');
const adminView = document.querySelector('#admin-view');
const loginForm = document.querySelector('#login-form');
const loginMessage = document.querySelector('#login-message');
const logoutButton = document.querySelector('#logout-button');
const demoButton = document.querySelector('#demo-button');
let supabase = null;
let demoMode = false;

const demoLeads = [
  { customer_name: 'João', neighborhood: 'Boca do Rio', equipment: 'Fogão residencial', problems: ['Chama irregular'], created_at: new Date().toISOString(), status: 'novo' },
  { customer_name: 'Marina', neighborhood: 'Imbuí', equipment: 'Cooktop', problems: ['Não acende'], created_at: new Date(Date.now()-86400000).toISOString(), status: 'contatado' },
  { customer_name: 'Carlos', neighborhood: 'Pituba', equipment: 'Fogão industrial', problems: ['Chama fraca'], created_at: new Date(Date.now()-172800000).toISOString(), status: 'novo' }
];

async function isAuthorizedAdmin() {
  if (!supabase) return false;
  const { data, error } = await supabase
    .from('admin_profiles')
    .select('user_id, display_name, active')
    .eq('active', true)
    .maybeSingle();
  return !error && Boolean(data?.active);
}

async function init() {
  if (isSupabaseConfigured()) {
    supabase = await getSupabase();
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      if (await isAuthorizedAdmin()) return openAdmin();
      await supabase.auth.signOut();
      setLoginError('Este e-mail não está autorizado para acessar o painel.');
    }
  }
  loginView.classList.remove('hidden');
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginMessage.className = 'notice hidden';
  if (!supabase) return setLoginError('O Supabase ainda não está configurado. Use o modo demonstração.');

  const email = document.querySelector('#admin-email').value.trim().toLowerCase();
  const configuredEmail = (window.VALTEC_CONFIG?.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!email) return setLoginError('Informe o e-mail de acesso.');
  if (configuredEmail && email !== configuredEmail) return setLoginError('Este e-mail não está autorizado para acessar o painel.');

  const redirectTo = window.location.href.split('#')[0].split('?')[0];
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: redirectTo
    }
  });
  if (error) return setLoginError('Não foi possível enviar o link de acesso. Tente novamente.');

  loginMessage.innerHTML = '<strong>Link enviado.</strong><br>Abra o e-mail e clique no link para entrar no painel.';
  loginMessage.className = 'notice success';
});

demoButton.addEventListener('click', () => { demoMode = true; openAdmin(); });
logoutButton.addEventListener('click', async () => {
  if (supabase && !demoMode) await supabase.auth.signOut();
  location.reload();
});

function setLoginError(text) {
  loginMessage.textContent = text;
  loginMessage.className = 'notice error';
}

async function openAdmin() {
  loginView.classList.add('hidden');
  adminView.classList.remove('hidden');
  await refreshDashboard();
}

async function refreshDashboard() {
  let leads = demoLeads;
  let events = [];
  let quotes = [];
  if (supabase && !demoMode) {
    const [leadResult, eventResult, quoteResult] = await Promise.all([
      supabase.from('leads').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('analytics_events').select('*').gte('created_at', new Date(Date.now()-7*86400000).toISOString()),
      supabase.from('quotes').select('*').order('created_at', { ascending: false }).limit(20)
    ]);
    if (!leadResult.error) leads = leadResult.data || [];
    if (!eventResult.error) events = eventResult.data || [];
    if (!quoteResult.error) quotes = quoteResult.data || [];
  }

  const visits = demoMode ? 37 : events.filter(e => e.event_name === 'page_view').length;
  const checks = demoMode ? 14 : events.filter(e => e.event_name === 'neighborhood_check').length;
  const whatsapp = demoMode ? 11 : events.filter(e => e.event_name === 'whatsapp_click').length;
  document.querySelector('#metric-visits').textContent = visits;
  document.querySelector('#metric-checks').textContent = checks;
  document.querySelector('#metric-leads').textContent = leads.length;
  document.querySelector('#metric-whatsapp').textContent = whatsapp;

  document.querySelector('#leads-body').innerHTML = leads.map(lead => `
    <tr>
      <td><strong>${escapeHtml(lead.customer_name || '—')}</strong><br><span class="muted">${escapeHtml(lead.phone || '')}</span></td>
      <td>${escapeHtml(lead.neighborhood || '—')}</td>
      <td>${escapeHtml(lead.equipment || '—')}</td>
      <td>${escapeHtml((lead.problems || []).join(', ') || '—')}</td>
      <td><span class="badge ${lead.status === 'novo' ? 'orange' : 'green'}">${escapeHtml(lead.status || 'novo')}</span></td>
    </tr>`).join('') || '<tr><td colspan="5">Nenhum lead ainda.</td></tr>';

  const neighborhoodCounts = {};
  (demoMode ? [
    'Boca do Rio','Boca do Rio','Boca do Rio','Imbuí','Imbuí','Costa Azul','Stiep','Pituba'
  ] : events.filter(e => e.event_name === 'neighborhood_check').map(e => e.neighborhood).filter(Boolean))
    .forEach(name => neighborhoodCounts[name] = (neighborhoodCounts[name] || 0) + 1);
  const top = Object.entries(neighborhoodCounts).sort((a,b)=>b[1]-a[1]).slice(0,5);
  document.querySelector('#neighborhood-ranking').innerHTML = top.map(([name,count],i) => `<div class="summary-row"><span>${i+1}. ${escapeHtml(name)}</span><strong>${count}</strong></div>`).join('') || '<p class="muted">Os dados aparecem conforme as pessoas usam o site.</p>';

  document.querySelector('#quotes-count').textContent = quotes.length;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
}

const quoteItems = document.querySelector('#quote-items');
const addItemButton = document.querySelector('#add-item');
const laborInput = document.querySelector('#labor-value');
const negotiatedInput = document.querySelector('#negotiated-value');

function addQuoteRow(item = '', qty = 1, price = '') {
  const row = document.createElement('div');
  row.className = 'quote-row';
  row.innerHTML = `
    <input class="input quote-name" placeholder="Item" value="${escapeHtml(item)}">
    <input class="input quote-qty" type="number" min="1" value="${qty}">
    <input class="input quote-price" type="number" min="0" step="0.01" placeholder="R$" value="${price}">
    <button class="btn btn-light quote-remove" type="button" aria-label="Remover">×</button>`;
  row.querySelectorAll('input').forEach(input => input.addEventListener('input', calculateQuote));
  row.querySelector('.quote-remove').addEventListener('click', () => { row.remove(); calculateQuote(); });
  quoteItems.appendChild(row);
}

function calculateQuote() {
  const parts = [...quoteItems.querySelectorAll('.quote-row')].reduce((sum, row) => {
    const qty = Number(row.querySelector('.quote-qty').value || 0);
    const price = Number(row.querySelector('.quote-price').value || 0);
    return sum + qty * price;
  }, 0);
  const labor = Number(laborInput.value || 0);
  const original = parts + labor;
  const negotiated = negotiatedInput.value === '' ? original : Number(negotiatedInput.value || 0);
  document.querySelector('#parts-total').textContent = money(parts);
  document.querySelector('#labor-total').textContent = money(labor);
  document.querySelector('#original-total').textContent = money(original);
  document.querySelector('#grand-total').textContent = money(negotiated);
}
function money(value) { return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value); }

addItemButton.addEventListener('click', () => addQuoteRow());
laborInput.addEventListener('input', calculateQuote);
negotiatedInput.addEventListener('input', calculateQuote);
addQuoteRow('Mangueira revestida', 3, 110);
addQuoteRow('Niple 1/2', 1, 15);
addQuoteRow('T 1/2', 1, 35);
addQuoteRow('Torneira', 2, 45);
addQuoteRow('Cotovelo', 1, 25);
addQuoteRow('Adaptador', 1, 20);
addQuoteRow('Fita veda-rosca', 1, 10);
laborInput.value = 300;
calculateQuote();

init().catch(console.error);
