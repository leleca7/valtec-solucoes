import { getSupabase, isSupabaseConfigured } from './supabase.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
}[char]));
const digits = (value) => String(value || '').replace(/\D/g, '');
const localDateTime = (value) => value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const toLocalInput = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocalInput = (value) => value ? new Date(value).toISOString() : null;

const STATUS = {
  novo: 'Novo lead',
  triagem: 'Triagem',
  contatado: 'Contato realizado',
  contato_realizado: 'Contato realizado',
  orcamento_preparacao: 'Orçamento em preparação',
  orcamento_enviado: 'Orçamento enviado',
  aguardando_cliente: 'Aguardando cliente',
  agendado: 'Agendado',
  em_atendimento: 'Em atendimento',
  concluido: 'Concluído',
  avaliacao_solicitada: 'Avaliação solicitada',
  finalizado: 'Finalizado',
  perdido: 'Perdido',
  arquivado: 'Arquivado'
};

const STATUS_ORDER = Object.keys(STATUS);
const ACTIVE_STATUSES = new Set(['novo', 'triagem', 'contatado', 'contato_realizado', 'orcamento_preparacao', 'orcamento_enviado', 'aguardando_cliente', 'agendado', 'em_atendimento']);
const DEMO_LEADS = [
  {
    id: 'lead-demo-1', customer_name: 'Carla Menezes', phone: '71999990003', neighborhood: 'Costa Azul',
    equipment: 'Fogão residencial', problems: ['Forno não acende'], description: 'O forno parou de acender ontem.',
    source: 'site', status: 'novo', urgency: 'normal', created_at: new Date().toISOString(),
    next_action: 'Fazer primeira triagem por WhatsApp', next_action_at: new Date(Date.now() + 3600000).toISOString()
  },
  {
    id: 'lead-demo-2', customer_name: 'Restaurante Sabor da Vila', phone: '71999990044', neighborhood: 'Boca do Rio',
    equipment: 'Fogão industrial', problems: ['Chama fraca'], description: 'Duas bocas com chama muito baixa.',
    source: 'site', status: 'aguardando_cliente', urgency: 'alta', created_at: new Date(Date.now() - 86400000).toISOString(),
    next_action: 'Retomar orçamento enviado', next_action_at: new Date(Date.now() - 1800000).toISOString()
  }
];

const state = {
  supabase: null,
  leads: [],
  demo: false,
  selectedId: null,
  search: '',
  status: 'ativos',
  loading: false
};

function injectStyles() {
  if ($('#valtec-leads-css')) return;
  const link = document.createElement('link');
  link.id = 'valtec-leads-css';
  link.rel = 'stylesheet';
  link.href = 'leads-central.css?v=20260828-1';
  document.head.appendChild(link);
}

function injectUi() {
  if ($('#valtec-leads-nav')) return;
  const nav = $('.central-nav');
  const main = $('.central-main');
  if (!nav || !main) return;

  const button = document.createElement('button');
  button.id = 'valtec-leads-nav';
  button.type = 'button';
  button.dataset.adminTab = 'leads';
  button.innerHTML = '<span class="lead-nav-icon">◎</span> Leads <span id="lead-nav-count" class="lead-nav-count">0</span>';
  const clientsButton = nav.querySelector('[data-admin-tab="clients"]');
  nav.insertBefore(button, clientsButton || nav.children[1] || null);

  const panel = document.createElement('section');
  panel.className = 'admin-tab valtec-leads-tab';
  panel.dataset.tabPanel = 'leads';
  panel.innerHTML = `
    <div class="lead-header">
      <div>
        <span class="kicker">Entrada de oportunidades</span>
        <h2>Leads e atendimento</h2>
        <p class="muted">Todo novo contato ganha responsável, status e próximo passo. Nada fica perdido no WhatsApp.</p>
      </div>
      <button id="lead-refresh" class="btn btn-light" type="button">Atualizar</button>
    </div>

    <section class="lead-metrics" aria-label="Indicadores de leads">
      <article><small>Novos</small><strong id="lead-metric-new">0</strong><span>aguardando primeira ação</span></article>
      <article><small>Em andamento</small><strong id="lead-metric-active">0</strong><span>com atendimento aberto</span></article>
      <article><small>Atrasados</small><strong id="lead-metric-overdue">0</strong><span>próxima ação vencida</span></article>
      <article><small>Convertidos</small><strong id="lead-metric-converted">0</strong><span>agendados ou concluídos</span></article>
    </section>

    <section class="panel lead-toolbar-panel">
      <div class="lead-toolbar">
        <input id="lead-search" class="input" placeholder="Buscar nome, telefone, bairro, equipamento ou problema">
        <select id="lead-status-filter" class="input compact">
          <option value="ativos">Leads ativos</option>
          <option value="todos">Todos</option>
          ${STATUS_ORDER.map((status) => `<option value="${status}">${STATUS[status]}</option>`).join('')}
        </select>
      </div>
      <div id="lead-pipeline" class="lead-pipeline"></div>
    </section>

    <div class="lead-layout">
      <section class="panel lead-list-panel">
        <div class="panel-head">
          <div><span class="kicker">Fila</span><h2>O que precisa de ação</h2></div>
          <span id="lead-list-count" class="badge">0</span>
        </div>
        <div id="lead-list" class="lead-list"></div>
      </section>

      <aside class="panel lead-detail-panel" id="lead-detail">
        <div class="lead-empty-detail">
          <span>◎</span>
          <h3>Selecione um lead</h3>
          <p>Abra um contato para fazer a triagem, chamar no WhatsApp ou avançar para orçamento e OS.</p>
        </div>
      </aside>
    </div>`;

  const clientsPanel = main.querySelector('[data-tab-panel="clients"]');
  main.insertBefore(panel, clientsPanel || null);

  button.addEventListener('click', openLeadsTab);
  $('#lead-refresh')?.addEventListener('click', loadLeads);
  $('#lead-search')?.addEventListener('input', (event) => { state.search = event.target.value.trim().toLowerCase(); renderLeads(); });
  $('#lead-status-filter')?.addEventListener('change', (event) => { state.status = event.target.value; renderLeads(); });
}

function openLeadsTab() {
  $$('[data-admin-tab]').forEach((item) => item.classList.toggle('active', item.dataset.adminTab === 'leads'));
  $$('[data-tab-panel]').forEach((item) => item.classList.toggle('active', item.dataset.tabPanel === 'leads'));
  loadLeads();
}

async function getClient() {
  if (state.supabase) return state.supabase;
  if (!isSupabaseConfigured()) return null;
  state.supabase = await getSupabase();
  return state.supabase;
}

async function loadLeads() {
  if (state.loading) return;
  state.loading = true;
  const list = $('#lead-list');
  if (list) list.innerHTML = '<div class="lead-loading">Carregando leads...</div>';
  try {
    if (state.demo || sessionStorage.getItem('valtec_leads_demo') === '1') {
      state.demo = true;
      if (!state.leads.length) state.leads = structuredClone(DEMO_LEADS);
      renderAll();
      return;
    }
    const supabase = await getClient();
    if (!supabase) {
      renderError('O Supabase ainda não está configurado neste ambiente.');
      return;
    }
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session) {
      renderError('Entre na Central Valtec para visualizar os leads.');
      return;
    }
    const { data, error } = await supabase.from('leads').select('*').order('created_at', { ascending: false }).limit(500);
    if (error) throw error;
    state.leads = data || [];
    renderAll();
  } catch (error) {
    console.error('Leads Valtec:', error);
    renderError(error?.message || 'Não foi possível carregar os leads.');
  } finally {
    state.loading = false;
  }
}

function renderAll() {
  updateMetrics();
  renderPipeline();
  renderLeads();
  if (state.selectedId) renderDetail(state.selectedId);
}

function updateMetrics() {
  const now = Date.now();
  const newCount = state.leads.filter((lead) => lead.status === 'novo').length;
  const activeCount = state.leads.filter((lead) => ACTIVE_STATUSES.has(lead.status)).length;
  const overdueCount = state.leads.filter((lead) => ACTIVE_STATUSES.has(lead.status) && lead.next_action_at && new Date(lead.next_action_at).getTime() < now).length;
  const convertedCount = state.leads.filter((lead) => ['agendado', 'em_atendimento', 'concluido', 'avaliacao_solicitada', 'finalizado'].includes(lead.status)).length;
  if ($('#lead-metric-new')) $('#lead-metric-new').textContent = newCount;
  if ($('#lead-metric-active')) $('#lead-metric-active').textContent = activeCount;
  if ($('#lead-metric-overdue')) $('#lead-metric-overdue').textContent = overdueCount;
  if ($('#lead-metric-converted')) $('#lead-metric-converted').textContent = convertedCount;
  if ($('#lead-nav-count')) {
    $('#lead-nav-count').textContent = newCount;
    $('#lead-nav-count').classList.toggle('hidden', newCount === 0);
  }
}

function renderPipeline() {
  const container = $('#lead-pipeline');
  if (!container) return;
  const visibleStatuses = ['novo', 'triagem', 'contato_realizado', 'orcamento_preparacao', 'orcamento_enviado', 'aguardando_cliente', 'agendado', 'em_atendimento'];
  container.innerHTML = visibleStatuses.map((status) => {
    const aliases = status === 'contato_realizado' ? ['contato_realizado', 'contatado'] : [status];
    const count = state.leads.filter((lead) => aliases.includes(lead.status)).length;
    return `<button type="button" data-pipeline-status="${status}"><span>${esc(STATUS[status])}</span><strong>${count}</strong></button>`;
  }).join('');
  $$('[data-pipeline-status]', container).forEach((button) => {
    button.addEventListener('click', () => {
      state.status = button.dataset.pipelineStatus;
      if ($('#lead-status-filter')) $('#lead-status-filter').value = state.status;
      renderLeads();
    });
  });
}

function filteredLeads() {
  const query = state.search;
  return state.leads.filter((lead) => {
    const statusMatch = state.status === 'todos'
      || (state.status === 'ativos' && ACTIVE_STATUSES.has(lead.status))
      || (state.status === 'contato_realizado' && ['contato_realizado', 'contatado'].includes(lead.status))
      || lead.status === state.status;
    if (!statusMatch) return false;
    if (!query) return true;
    const haystack = [
      lead.customer_name, lead.phone, lead.neighborhood, lead.equipment, lead.description,
      ...(lead.problems || []), lead.source, lead.next_action
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(query);
  }).sort((a, b) => priorityScore(a) - priorityScore(b) || new Date(b.created_at) - new Date(a.created_at));
}

function priorityScore(lead) {
  const now = Date.now();
  if (lead.next_action_at && new Date(lead.next_action_at).getTime() < now && ACTIVE_STATUSES.has(lead.status)) return 0;
  if (lead.status === 'novo') return 1;
  if (lead.urgency === 'alta') return 2;
  if (lead.next_action_at) return 3;
  return 4;
}

function renderLeads() {
  const list = $('#lead-list');
  if (!list) return;
  const leads = filteredLeads();
  if ($('#lead-list-count')) $('#lead-list-count').textContent = `${leads.length} lead${leads.length === 1 ? '' : 's'}`;
  if (!leads.length) {
    list.innerHTML = '<div class="lead-empty-list"><strong>Nenhum lead neste filtro.</strong><span>Quando uma solicitação entrar pelo site, ela aparecerá aqui.</span></div>';
    return;
  }
  list.innerHTML = leads.map((lead) => {
    const overdue = lead.next_action_at && new Date(lead.next_action_at).getTime() < Date.now() && ACTIVE_STATUSES.has(lead.status);
    const selected = lead.id === state.selectedId;
    return `<button type="button" class="lead-card ${selected ? 'selected' : ''} ${overdue ? 'overdue' : ''}" data-lead-id="${esc(lead.id)}">
      <div class="lead-card-top">
        <div><strong>${esc(lead.customer_name || 'Sem nome')}</strong><span>${esc(lead.neighborhood || 'Bairro não informado')} · ${esc(lead.equipment || 'Equipamento')}</span></div>
        <span class="lead-status status-${esc(lead.status || 'novo')}">${esc(STATUS[lead.status] || lead.status || 'Novo')}</span>
      </div>
      <p>${esc((lead.problems || []).join(', ') || lead.description || 'Problema não informado')}</p>
      <div class="lead-card-foot">
        <span>${esc(lead.source || 'site')} · ${localDateTime(lead.created_at)}</span>
        <b class="${overdue ? 'lead-due-overdue' : ''}">${lead.next_action ? `${esc(lead.next_action)}${lead.next_action_at ? ` · ${localDateTime(lead.next_action_at)}` : ''}` : 'Sem próxima ação'}</b>
      </div>
    </button>`;
  }).join('');
  $$('[data-lead-id]', list).forEach((card) => card.addEventListener('click', () => {
    state.selectedId = card.dataset.leadId;
    renderLeads();
    renderDetail(state.selectedId);
  }));
}

function renderDetail(id) {
  const lead = state.leads.find((item) => String(item.id) === String(id));
  const detail = $('#lead-detail');
  if (!lead || !detail) return;
  const problems = (lead.problems || []).join(', ') || 'Não informado';
  detail.innerHTML = `
    <div class="lead-detail-head">
      <div><span class="kicker">Lead</span><h2>${esc(lead.customer_name || 'Sem nome')}</h2><p>${esc(lead.phone || '')} · ${esc(lead.neighborhood || '')}</p></div>
      <button type="button" class="lead-detail-close" id="lead-detail-close" aria-label="Fechar">×</button>
    </div>

    <div class="lead-quick-actions">
      <button class="btn btn-green" type="button" id="lead-whatsapp">WhatsApp</button>
      <button class="btn btn-light" type="button" id="lead-create-client">Criar cliente</button>
      <button class="btn btn-secondary" type="button" id="lead-prepare-quote">Preparar orçamento</button>
      <button class="btn btn-primary" type="button" id="lead-prepare-order">Criar OS</button>
      ${lead.media_path ? '<button class="btn btn-light" type="button" id="lead-open-media">Abrir foto/vídeo</button>' : ''}
    </div>

    <section class="lead-summary-box">
      <div><small>Equipamento</small><strong>${esc(lead.equipment || '—')}</strong></div>
      <div><small>Problema</small><strong>${esc(problems)}</strong></div>
      <div><small>Origem</small><strong>${esc(lead.source || 'site')}</strong></div>
      <div><small>Entrada</small><strong>${localDateTime(lead.created_at)}</strong></div>
      ${lead.address ? `<div class="wide"><small>Endereço</small><strong>${esc(lead.address)}${lead.reference_point ? ` · ${esc(lead.reference_point)}` : ''}</strong></div>` : ''}
      ${lead.description ? `<div class="wide"><small>Relato do cliente</small><p>${esc(lead.description)}</p></div>` : ''}
    </section>

    <form id="lead-editor" class="lead-editor">
      <div class="choice-grid">
        <div class="field"><label>Status</label><select id="lead-edit-status" class="input">${STATUS_ORDER.map((status) => `<option value="${status}" ${normalizeStatus(lead.status) === status ? 'selected' : ''}>${STATUS[status]}</option>`).join('')}</select></div>
        <div class="field"><label>Urgência</label><select id="lead-edit-urgency" class="input"><option value="baixa" ${lead.urgency === 'baixa' ? 'selected' : ''}>Baixa</option><option value="normal" ${!lead.urgency || lead.urgency === 'normal' ? 'selected' : ''}>Normal</option><option value="alta" ${lead.urgency === 'alta' ? 'selected' : ''}>Alta</option></select></div>
      </div>
      <div class="field"><label>Próxima ação</label><input id="lead-edit-next-action" class="input" value="${esc(lead.next_action || '')}" placeholder="Ex.: retornar orçamento pelo WhatsApp"></div>
      <div class="field"><label>Quando</label><input id="lead-edit-next-at" class="input" type="datetime-local" value="${toLocalInput(lead.next_action_at)}"></div>
      <div class="field"><label>Observação interna</label><textarea id="lead-edit-notes" placeholder="Informações úteis para quem continuar este atendimento">${esc(lead.internal_notes || '')}</textarea></div>
      <div class="field ${normalizeStatus(lead.status) === 'perdido' ? '' : 'hidden'}" id="lead-lost-field"><label>Motivo da perda</label><input id="lead-edit-lost-reason" class="input" value="${esc(lead.lost_reason || '')}" placeholder="Ex.: preço, sem retorno, fora da área"></div>
      <div class="lead-editor-actions"><button class="btn btn-primary" type="submit">Salvar lead</button><button class="btn btn-light" type="button" id="lead-archive">Arquivar</button></div>
    </form>
    <div id="lead-action-message" class="lead-action-message hidden"></div>`;

  $('#lead-detail-close')?.addEventListener('click', () => {
    state.selectedId = null;
    detail.innerHTML = '<div class="lead-empty-detail"><span>◎</span><h3>Selecione um lead</h3><p>Abra um contato para continuar o atendimento.</p></div>';
    renderLeads();
  });
  $('#lead-whatsapp')?.addEventListener('click', () => openWhatsApp(lead));
  $('#lead-create-client')?.addEventListener('click', () => createClientFromLead(lead));
  $('#lead-prepare-quote')?.addEventListener('click', () => prepareQuote(lead));
  $('#lead-prepare-order')?.addEventListener('click', () => prepareOrder(lead));
  $('#lead-open-media')?.addEventListener('click', () => openLeadMedia(lead));
  $('#lead-edit-status')?.addEventListener('change', (event) => $('#lead-lost-field')?.classList.toggle('hidden', event.target.value !== 'perdido'));
  $('#lead-editor')?.addEventListener('submit', (event) => saveLeadEditor(event, lead));
  $('#lead-archive')?.addEventListener('click', () => updateLead(lead.id, { status: 'arquivado', next_action: null, next_action_at: null }, 'Lead arquivado.'));
}

function normalizeStatus(status) {
  return status === 'contatado' ? 'contato_realizado' : (status || 'novo');
}

async function saveLeadEditor(event, lead) {
  event.preventDefault();
  const status = $('#lead-edit-status').value;
  const payload = {
    status,
    urgency: $('#lead-edit-urgency').value,
    next_action: $('#lead-edit-next-action').value.trim() || null,
    next_action_at: fromLocalInput($('#lead-edit-next-at').value),
    internal_notes: $('#lead-edit-notes').value.trim() || null,
    lost_reason: status === 'perdido' ? ($('#lead-edit-lost-reason').value.trim() || null) : null
  };
  if (['contato_realizado', 'contatado'].includes(status) && !lead.contacted_at) payload.contacted_at = new Date().toISOString();
  await updateLead(lead.id, payload, 'Lead atualizado.');
}

async function updateLead(id, payload, successMessage = '') {
  const patch = { ...payload, updated_at: new Date().toISOString() };
  try {
    if (state.demo) {
      const lead = state.leads.find((item) => String(item.id) === String(id));
      if (lead) Object.assign(lead, patch);
    } else {
      const supabase = await getClient();
      const { error } = await supabase.from('leads').update(patch).eq('id', id);
      if (error) throw error;
      const lead = state.leads.find((item) => String(item.id) === String(id));
      if (lead) Object.assign(lead, patch);
    }
    renderAll();
    if (successMessage) showActionMessage(successMessage, 'success');
    return true;
  } catch (error) {
    console.error(error);
    showActionMessage(error?.message || 'Não foi possível atualizar o lead.', 'error');
    return false;
  }
}

function showActionMessage(text, type = 'success') {
  const box = $('#lead-action-message');
  if (!box) return;
  box.textContent = text;
  box.className = `lead-action-message ${type}`;
  setTimeout(() => box.classList.add('hidden'), 3500);
}

function openWhatsApp(lead) {
  let phone = digits(lead.phone);
  if (!phone) return showActionMessage('Este lead não tem telefone válido.', 'error');
  if (!phone.startsWith('55')) phone = `55${phone}`;
  const firstName = String(lead.customer_name || '').trim().split(/\s+/)[0] || 'tudo bem';
  const message = `Olá, ${firstName}! Aqui é da Valtec Assistência Técnica. Recebemos sua solicitação sobre ${String(lead.equipment || 'seu equipamento').toLowerCase()}. Podemos fazer algumas perguntas rápidas para organizar o atendimento?`;
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
  if (lead.status === 'novo') updateLead(lead.id, {
    status: 'contato_realizado',
    contacted_at: new Date().toISOString(),
    next_action: 'Dar continuidade à triagem',
    next_action_at: new Date(Date.now() + 2 * 3600000).toISOString()
  });
}

async function ensureClient(lead) {
  if (state.demo) return { id: `client-${lead.id}`, name: lead.customer_name, phone: lead.phone };
  const supabase = await getClient();
  const phone = String(lead.phone || '').trim();
  const { data: existing, error: findError } = await supabase.from('clients').select('*').eq('phone', phone).limit(1).maybeSingle();
  if (findError) throw findError;
  if (existing) {
    if (lead.client_id !== existing.id) await updateLead(lead.id, { client_id: existing.id });
    return existing;
  }
  const notes = [`Origem: lead ${lead.source || 'site'}.`, lead.equipment ? `Equipamento: ${lead.equipment}.` : '', (lead.problems || []).length ? `Problema: ${(lead.problems || []).join(', ')}.` : '', lead.description || ''].filter(Boolean).join(' ');
  const payload = {
    name: lead.customer_name || 'Cliente Valtec',
    phone,
    neighborhood: lead.neighborhood || null,
    address: lead.address || null,
    notes: notes || null
  };
  const { data, error } = await supabase.from('clients').insert(payload).select().single();
  if (error) throw error;
  await updateLead(lead.id, { client_id: data.id });
  return data;
}

async function createClientFromLead(lead) {
  try {
    const client = await ensureClient(lead);
    await updateLead(lead.id, {
      status: ['novo', 'triagem'].includes(lead.status) ? 'contato_realizado' : normalizeStatus(lead.status),
      next_action: lead.next_action || 'Definir orçamento ou agendamento'
    });
    showActionMessage(`Cliente ${client.name || lead.customer_name} vinculado ao lead.`, 'success');
  } catch (error) {
    showActionMessage(error?.message || 'Não foi possível criar o cliente.', 'error');
  }
}

function clickAdminTab(name) {
  const button = $(`[data-admin-tab="${name}"]`);
  button?.click();
}

async function prepareQuote(lead) {
  try {
    const client = await ensureClient(lead);
    sessionStorage.setItem('valtec_active_lead_quote', String(lead.id));
    await updateLead(lead.id, {
      status: 'orcamento_preparacao',
      next_action: 'Concluir e enviar orçamento',
      next_action_at: new Date(Date.now() + 4 * 3600000).toISOString()
    });
    clickAdminTab('quotes');
    setTimeout(() => {
      $('#clear-quote')?.click();
      if ($('#quote-client')) $('#quote-client').value = client.name || lead.customer_name || '';
      if ($('#quote-phone')) $('#quote-phone').value = client.phone || lead.phone || '';
      if ($('#quote-address')) $('#quote-address').value = [lead.address, lead.neighborhood].filter(Boolean).join(' · ');
      if ($('#quote-note')) $('#quote-note').value = `Solicitação: ${lead.equipment || 'equipamento'} — ${(lead.problems || []).join(', ') || lead.description || 'avaliação técnica'}.`;
      $('#quote-client')?.dispatchEvent(new Event('change', { bubbles: true }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 0);
  } catch (error) {
    showActionMessage(error?.message || 'Não foi possível preparar o orçamento.', 'error');
  }
}

async function prepareOrder(lead) {
  try {
    const client = await ensureClient(lead);
    sessionStorage.setItem('valtec_active_lead_order', String(lead.id));
    await updateLead(lead.id, {
      status: 'contato_realizado',
      next_action: 'Definir data do atendimento'
    });
    clickAdminTab('orders');
    setTimeout(() => {
      $('#new-order')?.click();
      if ($('#order-client')) $('#order-client').value = client.name || lead.customer_name || '';
      if ($('#order-client-id')) $('#order-client-id').value = client.id || '';
      if ($('#order-equipment')) $('#order-equipment').value = lead.equipment || '';
      if ($('#order-problem')) $('#order-problem').value = [(lead.problems || []).join(', '), lead.description].filter(Boolean).join(' — ');
      if ($('#order-service')) $('#order-service').value = 'Avaliação, diagnóstico e serviço conforme autorização do cliente.';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 0);
  } catch (error) {
    showActionMessage(error?.message || 'Não foi possível preparar a OS.', 'error');
  }
}

async function openLeadMedia(lead) {
  try {
    if (state.demo) return showActionMessage('Mídia indisponível na demonstração.', 'error');
    const supabase = await getClient();
    const { data, error } = await supabase.storage.from('lead-media').createSignedUrl(lead.media_path, 600);
    if (error) throw error;
    window.open(data.signedUrl, '_blank', 'noopener');
  } catch (error) {
    showActionMessage(error?.message || 'Não foi possível abrir a mídia.', 'error');
  }
}

async function linkSavedQuote() {
  const leadId = sessionStorage.getItem('valtec_active_lead_quote');
  if (!leadId || state.demo) return;
  const supabase = await getClient();
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const quoteId = $('#quote-id')?.value;
    if (!quoteId) continue;
    const { error } = await supabase.from('quotes').update({ lead_id: leadId }).eq('id', quoteId);
    if (error) return console.error('Não foi possível vincular orçamento ao lead:', error);
    const quoteStatus = $('#quote-status')?.value;
    await updateLead(leadId, {
      status: quoteStatus === 'enviado' ? 'orcamento_enviado' : 'orcamento_preparacao',
      next_action: quoteStatus === 'enviado' ? 'Acompanhar resposta do orçamento' : 'Concluir e enviar orçamento',
      next_action_at: new Date(Date.now() + (quoteStatus === 'enviado' ? 24 : 4) * 3600000).toISOString()
    });
    sessionStorage.removeItem('valtec_active_lead_quote');
    return;
  }
}

async function linkSavedOrder() {
  const leadId = sessionStorage.getItem('valtec_active_lead_order');
  if (!leadId || state.demo) return;
  const supabase = await getClient();
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const orderId = $('#order-id')?.value;
    if (!orderId) continue;
    const { error } = await supabase.from('service_orders').update({ lead_id: leadId }).eq('id', orderId);
    if (error) return console.error('Não foi possível vincular OS ao lead:', error);
    const orderStatus = $('#order-status')?.value || 'aberto';
    const leadStatus = orderStatus === 'agendado' ? 'agendado' : orderStatus === 'concluido' ? 'concluido' : orderStatus === 'em_andamento' ? 'em_atendimento' : 'contato_realizado';
    await updateLead(leadId, {
      status: leadStatus,
      next_action: orderStatus === 'agendado' ? 'Realizar atendimento agendado' : orderStatus === 'concluido' ? 'Solicitar avaliação' : 'Acompanhar ordem de serviço',
      next_action_at: orderStatus === 'concluido' ? new Date(Date.now() + 2 * 3600000).toISOString() : null,
      converted_at: ['agendado', 'concluido'].includes(orderStatus) ? new Date().toISOString() : null
    });
    sessionStorage.removeItem('valtec_active_lead_order');
    return;
  }
}

function bindCrossFlowHooks() {
  $('#save-quote')?.addEventListener('click', () => { linkSavedQuote().catch(console.error); });
  $('#order-form')?.addEventListener('submit', () => { linkSavedOrder().catch(console.error); });
  $('#demo-button')?.addEventListener('click', () => sessionStorage.setItem('valtec_leads_demo', '1'));
  $('#logout-button')?.addEventListener('click', () => {
    sessionStorage.removeItem('valtec_leads_demo');
    sessionStorage.removeItem('valtec_active_lead_quote');
    sessionStorage.removeItem('valtec_active_lead_order');
  });
}

function renderError(message) {
  const list = $('#lead-list');
  if (list) list.innerHTML = `<div class="lead-error"><strong>Não foi possível abrir os leads.</strong><span>${esc(message)}</span></div>`;
}

function boot() {
  injectStyles();
  injectUi();
  bindCrossFlowHooks();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
