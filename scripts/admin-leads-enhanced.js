import { getSupabase, isSupabaseConfigured } from './supabase.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
}[char]));
const norm = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const digits = (value) => String(value || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
const formatDateTime = (value) => value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

const leadState = {
  supabase: null,
  leads: [],
  clients: [],
  demo: false,
  loaded: false
};

const demoLeads = [
  {
    id: 'demo-lead-1', customer_name: 'Carla Oliveira', phone: '71999990003',
    equipment: 'Fogão residencial', problems: ['Forno não acende'], neighborhood: 'Costa Azul',
    address: 'Costa Azul, Salvador', description: 'O forno parou de acender ontem.', source: 'site',
    status: 'novo', created_at: new Date().toISOString()
  }
];

function flash(text, type = 'success') {
  const box = $('#central-message');
  if (!box) return;
  box.textContent = text;
  box.className = `notice ${type}`;
  clearTimeout(flash.timer);
  flash.timer = setTimeout(() => box.classList.add('hidden'), 4500);
}

function installStylesheet() {
  if ($('#valtec-leads-css')) return;
  const link = document.createElement('link');
  link.id = 'valtec-leads-css';
  link.rel = 'stylesheet';
  link.href = 'admin-leads.css?v=20260828-1';
  document.head.appendChild(link);
}

function buildUi() {
  const nav = $('.central-nav');
  const main = $('.central-main');
  if (!nav || !main || $('[data-admin-tab="leads"]')) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.adminTab = 'leads';
  button.innerHTML = '📥 Leads <span id="lead-nav-count" class="lead-nav-count hidden">0</span>';
  const todayButton = nav.querySelector('[data-admin-tab="dashboard"]');
  todayButton?.insertAdjacentElement('afterend', button);

  const panel = document.createElement('section');
  panel.className = 'admin-tab';
  panel.dataset.tabPanel = 'leads';
  panel.innerHTML = `
    <div class="section-toolbar lead-toolbar">
      <div>
        <span class="kicker">Entrada de oportunidades</span>
        <h2>Caixa de entrada</h2>
        <p class="muted">Do pedido do site ao atendimento, sem redigitar os dados do cliente.</p>
      </div>
      <button id="refresh-leads" class="btn btn-light" type="button">Atualizar</button>
    </div>

    <div class="lead-metric-grid">
      <article class="metric"><small>Novos</small><strong id="lead-metric-new">0</strong></article>
      <article class="metric"><small>Em andamento</small><strong id="lead-metric-progress">0</strong></article>
      <article class="metric"><small>Agendados</small><strong id="lead-metric-scheduled">0</strong></article>
      <article class="metric"><small>Concluídos</small><strong id="lead-metric-done">0</strong></article>
    </div>

    <section class="panel lead-inbox-panel">
      <div class="lead-filter-row">
        <input id="lead-search" class="input" placeholder="Buscar nome, telefone, bairro, equipamento ou problema">
        <select id="lead-status-filter" class="input compact">
          <option value="">Todos os status</option>
          <option value="novo">Novos</option>
          <option value="contatado">Contatados</option>
          <option value="agendado">Agendados</option>
          <option value="concluido">Concluídos</option>
          <option value="arquivado">Arquivados</option>
        </select>
      </div>
      <div id="lead-list" class="lead-list"><div class="empty-state">Abra esta área para carregar as solicitações.</div></div>
    </section>`;
  main.appendChild(panel);

  button.addEventListener('click', () => {
    $$('[data-admin-tab]').forEach((item) => item.classList.toggle('active', item === button));
    $$('[data-tab-panel]').forEach((item) => item.classList.toggle('active', item === panel));
    loadLeads();
  });
  $('#refresh-leads')?.addEventListener('click', loadLeads);
  $('#lead-search')?.addEventListener('input', renderLeads);
  $('#lead-status-filter')?.addEventListener('change', renderLeads);
}

async function getClient() {
  if (!isSupabaseConfigured()) return null;
  if (!leadState.supabase) leadState.supabase = await getSupabase();
  return leadState.supabase;
}

async function loadLeads() {
  const list = $('#lead-list');
  if (!list) return;
  list.innerHTML = '<div class="empty-state">Carregando solicitações…</div>';

  if (leadState.demo || !isSupabaseConfigured()) {
    leadState.leads = structuredClone(demoLeads);
    leadState.clients = [];
    leadState.loaded = true;
    renderLeads();
    return;
  }

  try {
    const supabase = await getClient();
    const [{ data: leads, error: leadsError }, { data: clients, error: clientsError }] = await Promise.all([
      supabase.from('leads').select('*').order('created_at', { ascending: false }).limit(300),
      supabase.from('clients').select('id,name,phone,neighborhood,address,notes').order('updated_at', { ascending: false }).limit(500)
    ]);
    if (leadsError) throw leadsError;
    if (clientsError) throw clientsError;
    leadState.leads = leads || [];
    leadState.clients = clients || [];
    leadState.loaded = true;
    renderLeads();
  } catch (error) {
    console.error('[Valtec Leads]', error);
    list.innerHTML = '<div class="empty-state">Não foi possível carregar os leads. Confira o acesso da Central e tente novamente.</div>';
  }
}

function renderLeads() {
  const list = $('#lead-list');
  if (!list) return;
  const search = norm($('#lead-search')?.value);
  const status = $('#lead-status-filter')?.value || '';
  const filtered = leadState.leads.filter((lead) => {
    if (status && lead.status !== status) return false;
    if (!search) return true;
    const haystack = [
      lead.customer_name, lead.phone, lead.neighborhood, lead.address, lead.equipment,
      ...(lead.problems || []), lead.description, lead.source
    ].map(norm).join(' ');
    return haystack.includes(search);
  });

  const counts = leadState.leads.reduce((acc, lead) => {
    acc[lead.status] = (acc[lead.status] || 0) + 1;
    return acc;
  }, {});
  $('#lead-metric-new').textContent = counts.novo || 0;
  $('#lead-metric-progress').textContent = counts.contatado || 0;
  $('#lead-metric-scheduled').textContent = counts.agendado || 0;
  $('#lead-metric-done').textContent = counts.concluido || 0;
  const navCount = $('#lead-nav-count');
  const newCount = counts.novo || 0;
  if (navCount) {
    navCount.textContent = String(newCount);
    navCount.classList.toggle('hidden', !newCount);
  }

  list.innerHTML = filtered.map(leadCard).join('') || '<div class="empty-state">Nenhuma solicitação encontrada com esses filtros.</div>';
  bindLeadActions();
}

function leadCard(lead) {
  const problems = (lead.problems || []).join(', ') || 'Problema não detalhado';
  const address = [lead.address, lead.reference_point].filter(Boolean).join(' · ');
  const statusClass = `lead-status-${lead.status || 'novo'}`;
  return `
    <article class="lead-card ${statusClass}">
      <div class="lead-card-main">
        <div class="lead-card-head">
          <div>
            <span class="lead-source">${esc(lead.source || 'site')}</span>
            <h3>${esc(lead.customer_name || 'Cliente')}</h3>
          </div>
          <span class="lead-created">${esc(formatDateTime(lead.created_at))}</span>
        </div>
        <div class="lead-summary-grid">
          <div><small>Telefone</small><b>${esc(lead.phone || '—')}</b></div>
          <div><small>Bairro</small><b>${esc(lead.neighborhood || '—')}</b></div>
          <div><small>Equipamento</small><b>${esc(lead.equipment || '—')}</b></div>
          <div><small>Problema</small><b>${esc(problems)}</b></div>
        </div>
        ${lead.description ? `<p class="lead-description">${esc(lead.description)}</p>` : ''}
        ${address ? `<p class="lead-location">📍 ${esc(address)}</p>` : ''}
      </div>
      <div class="lead-card-actions">
        <label>Status
          <select class="input compact lead-status-select" data-lead-status="${esc(lead.id)}">
            <option value="novo" ${lead.status === 'novo' ? 'selected' : ''}>Novo</option>
            <option value="contatado" ${lead.status === 'contatado' ? 'selected' : ''}>Contatado</option>
            <option value="agendado" ${lead.status === 'agendado' ? 'selected' : ''}>Agendado</option>
            <option value="concluido" ${lead.status === 'concluido' ? 'selected' : ''}>Concluído</option>
            <option value="arquivado" ${lead.status === 'arquivado' ? 'selected' : ''}>Arquivado</option>
          </select>
        </label>
        <div class="lead-action-buttons">
          <button class="mini-button green" type="button" data-lead-whatsapp="${esc(lead.id)}">WhatsApp</button>
          <button class="mini-button primary" type="button" data-lead-order="${esc(lead.id)}">Criar atendimento</button>
          ${lead.media_path ? `<button class="mini-button" type="button" data-lead-media="${esc(lead.id)}">Ver mídia</button>` : ''}
        </div>
      </div>
    </article>`;
}

function bindLeadActions() {
  $$('[data-lead-status]').forEach((select) => {
    select.onchange = () => updateLeadStatus(select.dataset.leadStatus, select.value);
  });
  $$('[data-lead-whatsapp]').forEach((button) => {
    button.onclick = () => contactLead(button.dataset.leadWhatsapp);
  });
  $$('[data-lead-order]').forEach((button) => {
    button.onclick = () => createServiceFromLead(button.dataset.leadOrder, button);
  });
  $$('[data-lead-media]').forEach((button) => {
    button.onclick = () => openLeadMedia(button.dataset.leadMedia);
  });
}

async function updateLeadStatus(id, status, quiet = false) {
  const lead = leadState.leads.find((item) => item.id === id);
  if (!lead) return false;
  if (leadState.demo || !isSupabaseConfigured()) {
    lead.status = status;
    renderLeads();
    if (!quiet) flash('Status do lead atualizado na demonstração.');
    return true;
  }
  try {
    const supabase = await getClient();
    const { error } = await supabase.from('leads').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    lead.status = status;
    renderLeads();
    if (!quiet) flash('Status do lead atualizado.');
    return true;
  } catch (error) {
    console.error('[Valtec Leads] status', error);
    flash('Não foi possível atualizar o status do lead.', 'error');
    return false;
  }
}

async function contactLead(id) {
  const lead = leadState.leads.find((item) => item.id === id);
  if (!lead) return;
  const phone = digits(lead.phone);
  if (!phone) return flash('Este lead não tem telefone válido.', 'error');
  const firstName = String(lead.customer_name || '').trim().split(/\s+/)[0] || 'tudo bem';
  const message = `Olá, ${firstName}! Aqui é da Valtec Soluções. Recebemos sua solicitação sobre ${lead.equipment || 'seu equipamento'} em ${lead.neighborhood || 'Salvador'}. Podemos dar continuidade ao atendimento por aqui?`;
  window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
  if (lead.status === 'novo') await updateLeadStatus(id, 'contatado', true);
}

function findClientByLead(lead) {
  const phone = digits(lead.phone);
  return leadState.clients.find((client) => digits(client.phone) === phone) || null;
}

async function ensureClientForLead(lead) {
  const existing = findClientByLead(lead);
  if (existing) return existing;
  if (leadState.demo || !isSupabaseConfigured()) {
    const client = { id: `demo-client-${Date.now()}`, name: lead.customer_name, phone: lead.phone, neighborhood: lead.neighborhood, address: lead.address };
    leadState.clients.unshift(client);
    return client;
  }
  const supabase = await getClient();
  const payload = {
    name: lead.customer_name,
    phone: lead.phone,
    neighborhood: lead.neighborhood || null,
    address: lead.address || null,
    notes: `Criado a partir do lead do site. Equipamento: ${lead.equipment || 'não informado'}. Problema: ${(lead.problems || []).join(', ') || 'não informado'}.`
  };
  const { data, error } = await supabase.from('clients').insert(payload).select().single();
  if (error) throw error;
  leadState.clients.unshift(data);
  return data;
}

async function createServiceFromLead(id, button) {
  const lead = leadState.leads.find((item) => item.id === id);
  if (!lead) return;
  const originalText = button?.textContent;
  if (button) { button.disabled = true; button.textContent = 'Criando…'; }

  try {
    if (leadState.demo || !isSupabaseConfigured()) {
      await ensureClientForLead(lead);
      lead.status = 'contatado';
      renderLeads();
      return flash('Demonstração: cliente e atendimento criados.');
    }

    const supabase = await getClient();
    const { data: existingOrder, error: existingError } = await supabase
      .from('service_orders')
      .select('id')
      .eq('lead_id', lead.id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existingOrder) {
      sessionStorage.setItem('valtec_lead_resume', JSON.stringify({ tab: 'orders', search: lead.customer_name || '' }));
      flash('Este lead já possui uma ordem de serviço. Abrindo Ordens de serviço.');
      setTimeout(() => location.reload(), 350);
      return;
    }

    const client = await ensureClientForLead(lead);
    const payload = {
      client_id: client.id,
      lead_id: lead.id,
      equipment: lead.equipment || 'Fogão',
      problem: (lead.problems || []).join(', ') || lead.description || null,
      service_description: lead.description || null,
      status: 'aberto'
    };
    const { error: orderError } = await supabase.from('service_orders').insert(payload);
    if (orderError) throw orderError;
    await supabase.from('leads').update({ status: 'contatado', updated_at: new Date().toISOString() }).eq('id', lead.id);

    sessionStorage.setItem('valtec_lead_resume', JSON.stringify({ tab: 'orders', search: lead.customer_name || '' }));
    flash('Cliente e ordem de serviço criados. Abrindo a OS…');
    setTimeout(() => location.reload(), 450);
  } catch (error) {
    console.error('[Valtec Leads] criar atendimento', error);
    flash('Não foi possível criar o atendimento a partir deste lead.', 'error');
    if (button) { button.disabled = false; button.textContent = originalText || 'Criar atendimento'; }
  }
}

async function openLeadMedia(id) {
  const lead = leadState.leads.find((item) => item.id === id);
  if (!lead?.media_path) return;
  if (leadState.demo || !isSupabaseConfigured()) return flash('A mídia aparece aqui quando o lead real envia foto ou vídeo.');
  try {
    const supabase = await getClient();
    const { data, error } = await supabase.storage.from('lead-media').createSignedUrl(lead.media_path, 300);
    if (error) throw error;
    window.open(data.signedUrl, '_blank', 'noopener');
  } catch (error) {
    console.error('[Valtec Leads] mídia', error);
    flash('Não foi possível abrir a mídia deste lead.', 'error');
  }
}

function resumeAfterReload() {
  const raw = sessionStorage.getItem('valtec_lead_resume');
  if (!raw) return;
  sessionStorage.removeItem('valtec_lead_resume');
  let data;
  try { data = JSON.parse(raw); } catch { return; }
  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    const adminVisible = $('#admin-view') && !$('#admin-view').classList.contains('hidden');
    const target = data.tab ? $(`[data-admin-tab="${data.tab}"]`) : null;
    if (adminVisible && target) {
      clearInterval(timer);
      target.click();
      if (data.tab === 'orders' && data.search) {
        setTimeout(() => {
          const input = $('#order-search');
          if (!input) return;
          input.value = data.search;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }, 250);
      }
    }
    if (tries > 40) clearInterval(timer);
  }, 250);
}

function observeAdminOpen() {
  const admin = $('#admin-view');
  if (!admin) return;
  const refreshIfVisible = () => {
    if (!admin.classList.contains('hidden') && !leadState.loaded && !leadState.demo) loadLeadCount();
  };
  new MutationObserver(refreshIfVisible).observe(admin, { attributes: true, attributeFilter: ['class'] });
  refreshIfVisible();
}

async function loadLeadCount() {
  if (!isSupabaseConfigured()) return;
  try {
    const supabase = await getClient();
    const { count, error } = await supabase.from('leads').select('id', { count: 'exact', head: true }).eq('status', 'novo');
    if (error) return;
    const navCount = $('#lead-nav-count');
    if (navCount) {
      navCount.textContent = String(count || 0);
      navCount.classList.toggle('hidden', !(count || 0));
    }
  } catch {}
}

installStylesheet();
buildUi();
$('#demo-button')?.addEventListener('click', () => { leadState.demo = true; leadState.loaded = false; });
observeAdminOpen();
resumeAfterReload();
