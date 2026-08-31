import { getSupabase, isSupabaseConfigured } from './supabase.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
const localDateTime = (value) => value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Sem data';
const digits = (value) => String(value || '').replace(/\D/g, '');

const DEMO_THREADS = [
  {
    id: 'wa-demo-1', phone: '5571999990001', display_name: 'João Santos', lead_id: 'lead-demo-1', status: 'human',
    workflow_step: 'human', human_required: true, human_reason: 'Foto recebida para avaliação.', unread_count: 2,
    positive_signal: false, last_message_preview: 'Enviei o vídeo também.', last_message_at: new Date().toISOString(),
    last_inbound_at: new Date().toISOString()
  },
  {
    id: 'wa-demo-2', phone: '5571999990002', display_name: 'Marina Souza', lead_id: 'lead-demo-2', status: 'human',
    workflow_step: 'human', human_required: false, unread_count: 0, positive_signal: true,
    last_message_preview: 'Ficou perfeito, muito obrigada!', last_message_at: new Date(Date.now() - 3600000).toISOString(),
    last_inbound_at: new Date(Date.now() - 3600000).toISOString()
  }
];

const DEMO_MESSAGES = {
  'wa-demo-1': [
    { id: 'm1', direction: 'inbound', message_type: 'text', body: 'Meu fogão está com a chama muito alta.', created_at: new Date(Date.now() - 600000).toISOString() },
    { id: 'm2', direction: 'outbound', message_type: 'text', body: 'Qual é o bairro do atendimento?', created_at: new Date(Date.now() - 540000).toISOString() },
    { id: 'm3', direction: 'inbound', message_type: 'image', body: null, media_path: null, created_at: new Date(Date.now() - 300000).toISOString() },
    { id: 'm4', direction: 'inbound', message_type: 'video', body: 'Enviei o vídeo também.', media_path: null, created_at: new Date().toISOString() }
  ],
  'wa-demo-2': [
    { id: 'm5', direction: 'outbound', message_type: 'text', body: 'Serviço concluído. Qualquer dúvida, estamos à disposição.', created_at: new Date(Date.now() - 7200000).toISOString() },
    { id: 'm6', direction: 'inbound', message_type: 'text', body: 'Ficou perfeito, muito obrigada!', positive_signal: true, created_at: new Date(Date.now() - 3600000).toISOString() }
  ]
};

const state = {
  supabase: null,
  demo: false,
  threads: [],
  jobs: [],
  messages: [],
  selectedId: null,
  search: '',
  filter: 'all',
  loading: false,
  pollTimer: null
};

function injectStyles() {
  if ($('#valtec-whatsapp-css')) return;
  const link = document.createElement('link');
  link.id = 'valtec-whatsapp-css';
  link.rel = 'stylesheet';
  link.href = 'whatsapp-central.css?v=20260831-1';
  document.head.appendChild(link);
}

function injectUi() {
  if ($('#valtec-whatsapp-nav')) return;
  const nav = $('.central-nav');
  const main = $('.central-main');
  if (!nav || !main) return;

  const button = document.createElement('button');
  button.id = 'valtec-whatsapp-nav';
  button.type = 'button';
  button.dataset.adminTab = 'whatsapp';
  button.innerHTML = '<span class="wa-nav-mark">WA</span> WhatsApp <span id="wa-nav-count" class="wa-nav-count hidden">0</span>';
  const clientsButton = nav.querySelector('[data-admin-tab="clients"]');
  nav.insertBefore(button, clientsButton || nav.children[1] || null);

  const panel = document.createElement('section');
  panel.className = 'admin-tab valtec-whatsapp-tab';
  panel.dataset.tabPanel = 'whatsapp';
  panel.innerHTML = `
    <div class="wa-header">
      <div>
        <span class="kicker">Atendimento conectado</span>
        <h2>Caixa de entrada WhatsApp</h2>
        <p class="muted">Triagem automática por regras, mídia anexada ao lead e passagem clara para atendimento humano.</p>
      </div>
      <button id="wa-refresh" class="btn btn-light" type="button">Atualizar</button>
    </div>

    <section class="wa-metrics" aria-label="Indicadores do WhatsApp">
      <article><small>Não lidas</small><strong id="wa-metric-unread">0</strong><span>mensagens aguardando ação</span></article>
      <article><small>Precisa de humano</small><strong id="wa-metric-human">0</strong><span>handoffs e dúvidas técnicas</span></article>
      <article><small>Follow-ups</small><strong id="wa-metric-followups">0</strong><span>automações pendentes</span></article>
      <article><small>Sinal positivo</small><strong id="wa-metric-positive">0</strong><span>possíveis clientes satisfeitos</span></article>
    </section>

    <section class="panel wa-toolbar-panel">
      <div class="wa-toolbar">
        <input id="wa-search" class="input" placeholder="Buscar nome ou telefone">
        <select id="wa-filter" class="input compact">
          <option value="all">Todas as conversas</option>
          <option value="human">Precisa de humano</option>
          <option value="unread">Não lidas</option>
          <option value="positive">Sinal positivo</option>
          <option value="bot">No fluxo automático</option>
          <option value="closed">Encerradas</option>
        </select>
      </div>
    </section>

    <div class="wa-layout">
      <section class="panel wa-list-panel">
        <div class="panel-head"><div><span class="kicker">Conversas</span><h2>Fila de atendimento</h2></div><span id="wa-list-count" class="badge">0</span></div>
        <div id="wa-thread-list" class="wa-thread-list"></div>
      </section>

      <section class="panel wa-chat-panel">
        <div id="wa-chat-empty" class="wa-empty-chat">
          <span class="wa-empty-mark">WA</span>
          <h3>Selecione uma conversa</h3>
          <p>Abra um contato para ver mensagens, fotos, vídeos, lead e ações operacionais.</p>
        </div>
        <div id="wa-chat" class="hidden">
          <div class="wa-chat-head">
            <div><span class="kicker">Atendimento</span><h2 id="wa-chat-name">Cliente</h2><p id="wa-chat-meta" class="muted"></p></div>
            <div id="wa-chat-status" class="wa-status"></div>
          </div>
          <div id="wa-human-alert" class="wa-human-alert hidden"></div>
          <div class="wa-operator-actions">
            <button id="wa-open-lead" class="btn btn-light" type="button">Abrir lead</button>
            <button id="wa-takeover" class="btn btn-secondary" type="button">Assumir atendimento</button>
            <button id="wa-return-bot" class="btn btn-light" type="button">Voltar ao bot</button>
            <button id="wa-followup" class="btn btn-light" type="button">Follow-up em 24h</button>
            <button id="wa-satisfied" class="btn btn-green" type="button">Cliente satisfeito</button>
            <button id="wa-close-thread" class="btn btn-light" type="button">Encerrar</button>
          </div>
          <div id="wa-action-message" class="wa-action-message hidden"></div>
          <div id="wa-messages" class="wa-messages"></div>
          <form id="wa-compose" class="wa-compose">
            <textarea id="wa-compose-text" rows="2" placeholder="Responder pelo WhatsApp"></textarea>
            <button class="btn btn-primary" type="submit">Enviar</button>
          </form>
          <p class="wa-window-note">Respostas livres dependem da janela ativa do WhatsApp. Follow-ups agendados usam templates aprovados.</p>
        </div>
      </section>
    </div>`;

  const clientsPanel = main.querySelector('[data-tab-panel="clients"]');
  main.insertBefore(panel, clientsPanel || null);

  button.addEventListener('click', openWhatsAppTab);
  $('#wa-refresh')?.addEventListener('click', () => loadThreads({ keepSelection: true }));
  $('#wa-search')?.addEventListener('input', (event) => { state.search = event.target.value.trim().toLowerCase(); renderThreads(); });
  $('#wa-filter')?.addEventListener('change', (event) => { state.filter = event.target.value; renderThreads(); });
  $('#wa-compose')?.addEventListener('submit', sendReply);
  $('#wa-open-lead')?.addEventListener('click', openSelectedLead);
  $('#wa-takeover')?.addEventListener('click', () => setSelectedMode('human'));
  $('#wa-return-bot')?.addEventListener('click', () => setSelectedMode('bot'));
  $('#wa-close-thread')?.addEventListener('click', () => setSelectedMode('closed'));
  $('#wa-followup')?.addEventListener('click', scheduleFollowup);
  $('#wa-satisfied')?.addEventListener('click', markSatisfied);
}

function openWhatsAppTab() {
  $$('[data-admin-tab]').forEach((item) => item.classList.toggle('active', item.dataset.adminTab === 'whatsapp'));
  $$('[data-tab-panel]').forEach((item) => item.classList.toggle('active', item.dataset.tabPanel === 'whatsapp'));
  loadThreads({ keepSelection: true });
  startPolling();
}

function startPolling() {
  if (state.pollTimer) return;
  state.pollTimer = window.setInterval(() => {
    const visible = $('[data-tab-panel="whatsapp"]')?.classList.contains('active') && !$('#admin-view')?.classList.contains('hidden');
    if (visible && !document.hidden) loadThreads({ keepSelection: true, quiet: true });
  }, 30000);
}

async function getClient() {
  if (state.supabase) return state.supabase;
  if (!isSupabaseConfigured()) return null;
  state.supabase = await getSupabase();
  return state.supabase;
}

async function loadThreads({ keepSelection = false, quiet = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  if (!quiet && $('#wa-thread-list')) $('#wa-thread-list').innerHTML = '<div class="wa-loading">Carregando conversas...</div>';
  try {
    if (state.demo || sessionStorage.getItem('valtec_whatsapp_demo') === '1') {
      state.demo = true;
      if (!state.threads.length) state.threads = structuredClone(DEMO_THREADS);
      state.jobs = [{ id: 'job-demo', thread_id: 'wa-demo-1', kind: 'followup_1d', status: 'pending', due_at: new Date(Date.now() + 86400000).toISOString() }];
      renderAll();
      if (keepSelection && state.selectedId) await selectThread(state.selectedId, { quiet: true });
      return;
    }

    const supabase = await getClient();
    if (!supabase) throw new Error('Supabase não configurado neste ambiente.');
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session) throw new Error('Entre na Central Valtec para visualizar o WhatsApp.');

    const [threadResult, jobResult] = await Promise.all([
      supabase.from('whatsapp_threads').select('*').order('last_message_at', { ascending: false, nullsFirst: false }).limit(200),
      supabase.from('whatsapp_automation_jobs').select('*').in('status', ['pending', 'processing']).order('due_at', { ascending: true }).limit(200)
    ]);
    if (threadResult.error) throw threadResult.error;
    if (jobResult.error) throw jobResult.error;
    state.threads = threadResult.data || [];
    state.jobs = jobResult.data || [];
    if (!keepSelection || !state.threads.some((thread) => thread.id === state.selectedId)) state.selectedId = null;
    renderAll();
    if (keepSelection && state.selectedId) await selectThread(state.selectedId, { quiet: true });
  } catch (error) {
    renderError(error?.message || 'Não foi possível carregar as conversas.');
  } finally {
    state.loading = false;
  }
}

function renderAll() {
  renderMetrics();
  renderThreads();
}

function filteredThreads() {
  return state.threads.filter((thread) => {
    const query = state.search;
    const filterMatch = state.filter === 'all'
      || (state.filter === 'human' && (thread.human_required || thread.status === 'human'))
      || (state.filter === 'unread' && Number(thread.unread_count || 0) > 0)
      || (state.filter === 'positive' && thread.positive_signal)
      || thread.status === state.filter;
    if (!filterMatch) return false;
    if (!query) return true;
    return [thread.display_name, thread.phone, thread.last_message_preview, thread.human_reason]
      .filter(Boolean).join(' ').toLowerCase().includes(query);
  });
}

function renderMetrics() {
  const unread = state.threads.reduce((sum, thread) => sum + Number(thread.unread_count || 0), 0);
  const human = state.threads.filter((thread) => thread.human_required).length;
  const followups = state.jobs.filter((job) => job.status === 'pending').length;
  const positive = state.threads.filter((thread) => thread.positive_signal).length;
  $('#wa-metric-unread').textContent = unread;
  $('#wa-metric-human').textContent = human;
  $('#wa-metric-followups').textContent = followups;
  $('#wa-metric-positive').textContent = positive;
  const navCount = $('#wa-nav-count');
  if (navCount) {
    navCount.textContent = human || unread;
    navCount.classList.toggle('hidden', !(human || unread));
  }
}

function statusLabel(thread) {
  if (thread.status === 'closed') return 'Encerrado';
  if (thread.human_required) return 'Precisa de humano';
  if (thread.status === 'human') return 'Atendimento humano';
  return 'Fluxo automático';
}

function renderThreads() {
  const list = $('#wa-thread-list');
  if (!list) return;
  const threads = filteredThreads();
  $('#wa-list-count').textContent = `${threads.length} conversa${threads.length === 1 ? '' : 's'}`;
  if (!threads.length) {
    list.innerHTML = '<div class="wa-empty-list"><strong>Nenhuma conversa neste filtro.</strong><span>Novos contatos do WhatsApp aparecerão aqui depois que o webhook estiver configurado.</span></div>';
    return;
  }
  list.innerHTML = threads.map((thread) => `
    <button type="button" class="wa-thread-card ${thread.id === state.selectedId ? 'selected' : ''} ${thread.human_required ? 'needs-human' : ''}" data-wa-thread="${esc(thread.id)}">
      <div class="wa-thread-top">
        <div><strong>${esc(thread.display_name || 'Cliente WhatsApp')}</strong><span>${esc(formatPhone(thread.phone))}</span></div>
        ${Number(thread.unread_count || 0) ? `<b class="wa-unread">${Number(thread.unread_count)}</b>` : ''}
      </div>
      <p>${esc(thread.last_message_preview || 'Sem mensagens recentes')}</p>
      <div class="wa-thread-foot"><span>${esc(statusLabel(thread))}</span><time>${localDateTime(thread.last_message_at)}</time></div>
    </button>`).join('');
  $$('[data-wa-thread]', list).forEach((button) => button.addEventListener('click', () => selectThread(button.dataset.waThread)));
}

async function selectThread(id, { quiet = false } = {}) {
  const thread = state.threads.find((item) => String(item.id) === String(id));
  if (!thread) return;
  state.selectedId = thread.id;
  renderThreads();
  $('#wa-chat-empty')?.classList.add('hidden');
  $('#wa-chat')?.classList.remove('hidden');
  renderThreadHeader(thread);
  if (!quiet) $('#wa-messages').innerHTML = '<div class="wa-loading">Carregando histórico...</div>';

  if (state.demo) {
    state.messages = structuredClone(DEMO_MESSAGES[thread.id] || []);
    thread.unread_count = 0;
    renderMessages();
    renderMetrics();
    return;
  }

  try {
    const supabase = await getClient();
    const { data, error } = await supabase.from('whatsapp_messages').select('*').eq('thread_id', thread.id).order('created_at', { ascending: true }).limit(500);
    if (error) throw error;
    state.messages = data || [];
    if (Number(thread.unread_count || 0) > 0) {
      const { error: updateError } = await supabase.from('whatsapp_threads').update({ unread_count: 0, updated_at: new Date().toISOString() }).eq('id', thread.id);
      if (!updateError) thread.unread_count = 0;
    }
    renderMessages();
    renderMetrics();
  } catch (error) {
    $('#wa-messages').innerHTML = `<div class="wa-error">${esc(error?.message || 'Não foi possível abrir o histórico.')}</div>`;
  }
}

function renderThreadHeader(thread) {
  $('#wa-chat-name').textContent = thread.display_name || 'Cliente WhatsApp';
  $('#wa-chat-meta').textContent = `${formatPhone(thread.phone)} · ${thread.workflow_step || 'sem etapa'} · ${localDateTime(thread.last_message_at)}`;
  $('#wa-chat-status').textContent = statusLabel(thread);
  $('#wa-chat-status').className = `wa-status status-${thread.status}${thread.human_required ? ' needs-human' : ''}`;
  const alert = $('#wa-human-alert');
  if (thread.human_required) {
    alert.textContent = thread.human_reason || 'Esta conversa precisa de intervenção humana.';
    alert.classList.remove('hidden');
  } else {
    alert.classList.add('hidden');
  }
  $('#wa-return-bot').disabled = thread.status === 'bot' && !thread.human_required;
  $('#wa-takeover').disabled = thread.status === 'human' && !thread.human_required;
  $('#wa-close-thread').disabled = thread.status === 'closed';
  $('#wa-compose-text').disabled = thread.status === 'closed';
  $('#wa-compose button').disabled = thread.status === 'closed';
}

function renderMessages() {
  const box = $('#wa-messages');
  if (!box) return;
  if (!state.messages.length) {
    box.innerHTML = '<div class="wa-empty-list">Sem mensagens registradas.</div>';
    return;
  }
  box.innerHTML = state.messages.map((message) => {
    const inbound = message.direction === 'inbound';
    const media = message.media_path ? `<button type="button" class="wa-media-button" data-wa-media="${esc(message.media_path)}">Abrir ${esc(mediaLabel(message.message_type))}</button>`
      : ['image', 'video', 'audio', 'document'].includes(message.message_type) ? `<span class="wa-media-missing">${esc(mediaLabel(message.message_type))} registrado${state.demo ? ' na demonstração' : ''}</span>` : '';
    return `<article class="wa-message ${inbound ? 'inbound' : 'outbound'}">
      ${message.body ? `<p>${esc(message.body)}</p>` : ''}
      ${media}
      <footer><span>${inbound ? 'Cliente' : 'Valtec'}${message.positive_signal ? ' · sinal positivo' : ''}</span><time>${localDateTime(message.created_at)}</time></footer>
    </article>`;
  }).join('');
  $$('[data-wa-media]', box).forEach((button) => button.addEventListener('click', () => openMedia(button.dataset.waMedia)));
  box.scrollTop = box.scrollHeight;
}

function mediaLabel(type) {
  return ({ image: 'foto', video: 'vídeo', audio: 'áudio', document: 'documento' }[type] || 'mídia');
}

function formatPhone(value) {
  const phone = digits(value).replace(/^55/, '');
  if (phone.length === 11) return `(${phone.slice(0, 2)}) ${phone.slice(2, 7)}-${phone.slice(7)}`;
  if (phone.length === 10) return `(${phone.slice(0, 2)}) ${phone.slice(2, 6)}-${phone.slice(6)}`;
  return value || 'Sem telefone';
}

function selectedThread() {
  return state.threads.find((thread) => String(thread.id) === String(state.selectedId));
}

async function sendReply(event) {
  event.preventDefault();
  const thread = selectedThread();
  const input = $('#wa-compose-text');
  const message = input.value.trim();
  if (!thread || !message) return;
  try {
    setActionMessage('Enviando...', 'info');
    if (state.demo) {
      state.messages.push({ id: `demo-${Date.now()}`, direction: 'outbound', message_type: 'text', body: message, created_at: new Date().toISOString() });
      thread.status = 'human';
      thread.human_required = false;
      thread.unread_count = 0;
      thread.last_message_preview = message;
      thread.last_message_at = new Date().toISOString();
      input.value = '';
      renderMessages();
      renderThreadHeader(thread);
      renderThreads();
      return setActionMessage('Mensagem registrada na demonstração.', 'success');
    }
    const supabase = await getClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) throw new Error('Sessão administrativa expirada.');
    const response = await fetch('/api/whatsapp-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ threadId: thread.id, message })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || payload.error || 'Falha no envio.');
    input.value = '';
    await loadThreads({ keepSelection: true, quiet: true });
    setActionMessage('Mensagem enviada.', 'success');
  } catch (error) {
    setActionMessage(error?.message || 'Não foi possível enviar a mensagem.', 'error');
  }
}

async function setSelectedMode(mode) {
  const thread = selectedThread();
  if (!thread) return;
  const patch = mode === 'bot'
    ? { status: 'bot', human_required: false, human_reason: null, workflow_step: 'menu', unread_count: 0 }
    : mode === 'human'
      ? { status: 'human', human_required: false, human_reason: null, workflow_step: 'human', unread_count: 0 }
      : { status: 'closed', human_required: false, human_reason: null, workflow_step: 'closed', unread_count: 0 };
  try {
    if (state.demo) Object.assign(thread, patch, { updated_at: new Date().toISOString() });
    else {
      const supabase = await getClient();
      const { error } = await supabase.from('whatsapp_threads').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', thread.id);
      if (error) throw error;
      Object.assign(thread, patch);
    }
    renderThreadHeader(thread);
    renderThreads();
    renderMetrics();
    setActionMessage(mode === 'closed' ? 'Conversa encerrada.' : mode === 'bot' ? 'Fluxo automático reativado a partir do menu.' : 'Atendimento assumido pela equipe.', 'success');
  } catch (error) {
    setActionMessage(error?.message || 'Não foi possível atualizar a conversa.', 'error');
  }
}

async function scheduleFollowup() {
  const thread = selectedThread();
  if (!thread) return;
  const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  try {
    if (state.demo) state.jobs.push({ id: `job-${Date.now()}`, thread_id: thread.id, lead_id: thread.lead_id, kind: 'followup_1d', status: 'pending', due_at: dueAt });
    else {
      const supabase = await getClient();
      const { error } = await supabase.from('whatsapp_automation_jobs').insert({ thread_id: thread.id, lead_id: thread.lead_id || null, kind: 'followup_1d', due_at: dueAt });
      if (error && error.code !== '23505') throw error;
    }
    renderMetrics();
    setActionMessage('Follow-up programado para 24 horas. A mensagem será enviada por template aprovado.', 'success');
  } catch (error) {
    setActionMessage(error?.message || 'Não foi possível programar o follow-up.', 'error');
  }
}

async function markSatisfied() {
  const thread = selectedThread();
  if (!thread) return;
  try {
    if (state.demo) thread.positive_signal = true;
    else {
      const supabase = await getClient();
      const { error } = await supabase.from('whatsapp_threads').update({ positive_signal: true, updated_at: new Date().toISOString() }).eq('id', thread.id);
      if (error) throw error;
      thread.positive_signal = true;
    }
    renderMetrics();
    renderThreads();
    setActionMessage('Cliente marcado como satisfeito. Se o lead já estiver concluído, a avaliação será agendada automaticamente.', 'success');
  } catch (error) {
    setActionMessage(error?.message || 'Não foi possível registrar a satisfação.', 'error');
  }
}

function openSelectedLead() {
  const thread = selectedThread();
  if (!thread) return;
  const leadButton = $('[data-admin-tab="leads"]');
  if (!leadButton) return setActionMessage('Módulo de leads indisponível.', 'error');
  leadButton.click();
  setTimeout(() => {
    const search = $('#lead-search');
    if (search) {
      search.value = thread.phone || '';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      search.focus();
    }
  }, 0);
}

async function openMedia(path) {
  if (state.demo) return setActionMessage('A mídia real não é carregada na demonstração.', 'info');
  try {
    const supabase = await getClient();
    const { data, error } = await supabase.storage.from('lead-media').createSignedUrl(path, 600);
    if (error) throw error;
    window.open(data.signedUrl, '_blank', 'noopener');
  } catch (error) {
    setActionMessage(error?.message || 'Não foi possível abrir a mídia.', 'error');
  }
}

function setActionMessage(text, type = 'success') {
  const box = $('#wa-action-message');
  if (!box) return;
  box.textContent = text;
  box.className = `wa-action-message ${type}`;
  clearTimeout(setActionMessage.timer);
  setActionMessage.timer = setTimeout(() => box.classList.add('hidden'), 4500);
}

function renderError(message) {
  const list = $('#wa-thread-list');
  if (list) list.innerHTML = `<div class="wa-error"><strong>Não foi possível abrir o WhatsApp.</strong><span>${esc(message)}</span><small>Se a migration 016 ainda não foi aplicada, as tabelas deste módulo ainda não existem.</small></div>`;
}

function bindDemoHooks() {
  $('#demo-button')?.addEventListener('click', () => sessionStorage.setItem('valtec_whatsapp_demo', '1'));
  $('#logout-button')?.addEventListener('click', () => sessionStorage.removeItem('valtec_whatsapp_demo'));
}

function boot() {
  injectStyles();
  injectUi();
  bindDemoHooks();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
