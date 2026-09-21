import { getSupabase, isSupabaseConfigured } from './supabase.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
const local = (value) => value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

const DEMO_SESSIONS = [
  {
    id: 'evidence-demo-1',
    customer_name: 'Carlos Santos',
    customer_phone: '5571999991111',
    equipment: 'Fogão residencial',
    status: 'open',
    started_at: new Date(Date.now() - 90 * 60000).toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'evidence-demo-2',
    customer_name: 'Marina Oliveira',
    customer_phone: '5571999992222',
    equipment: 'Cooktop',
    status: 'closed',
    started_at: new Date(Date.now() - 86400000).toISOString(),
    closed_at: new Date(Date.now() - 82800000).toISOString(),
    updated_at: new Date(Date.now() - 82800000).toISOString()
  }
];

const DEMO_ITEMS = {
  'evidence-demo-1': [
    { id: 'ei1', phase: 'before', media_type: 'video', description: 'Chama irregular no queimador dianteiro.', captured_at: new Date(Date.now() - 80 * 60000).toISOString() },
    { id: 'ei2', phase: 'during', media_type: 'image', description: 'Queimador desmontado para limpeza.', captured_at: new Date(Date.now() - 45 * 60000).toISOString() }
  ],
  'evidence-demo-2': [
    { id: 'ei3', phase: 'before', media_type: 'image', description: 'Acendimento falhando antes do serviço.', captured_at: new Date(Date.now() - 86000000).toISOString() },
    { id: 'ei4', phase: 'after', media_type: 'video', description: 'Teste final com todas as bocas funcionando.', captured_at: new Date(Date.now() - 83000000).toISOString() }
  ]
};

const state = {
  supabase: null,
  demo: false,
  sessions: [],
  items: [],
  selectedId: null,
  search: '',
  status: 'all',
  loading: false
};

function injectStyles() {
  if ($('#valtec-evidence-css')) return;
  const link = document.createElement('link');
  link.id = 'valtec-evidence-css';
  link.rel = 'stylesheet';
  link.href = 'service-evidence.css?v=20260921-1';
  document.head.appendChild(link);
}

function injectUi() {
  if ($('#valtec-evidence-nav')) return;
  const nav = $('.central-nav');
  const main = $('.central-main');
  if (!nav || !main) return;

  const button = document.createElement('button');
  button.id = 'valtec-evidence-nav';
  button.type = 'button';
  button.dataset.adminTab = 'evidence';
  button.innerHTML = '<span class="evidence-nav-mark">AD</span> Antes / Depois';
  const whatsappButton = nav.querySelector('[data-admin-tab="whatsapp"]');
  if (whatsappButton?.nextSibling) nav.insertBefore(button, whatsappButton.nextSibling);
  else nav.appendChild(button);

  const panel = document.createElement('section');
  panel.className = 'admin-tab service-evidence-tab';
  panel.dataset.tabPanel = 'evidence';
  panel.innerHTML = `
    <div class="evidence-header">
      <div>
        <span class="kicker">Registro técnico</span>
        <h2>Antes, durante e depois</h2>
        <p class="muted">Fotos, vídeos e observações enviadas pela equipe no WhatsApp ficam organizadas por atendimento.</p>
      </div>
      <button id="evidence-refresh" class="btn btn-light" type="button">Atualizar</button>
    </div>

    <section class="evidence-command-card">
      <div>
        <strong>Fluxo rápido pelo WhatsApp</strong>
        <span>ATENDIMENTO Cliente → ANTES → DURANTE → DEPOIS → ENCERRAR</span>
      </div>
      <small>O arquivo original fica privado no armazenamento da Valtec e só é aberto por link temporário.</small>
    </section>

    <section class="panel evidence-toolbar">
      <input id="evidence-search" class="input" placeholder="Buscar cliente, telefone ou equipamento">
      <select id="evidence-status" class="input compact">
        <option value="all">Todos</option>
        <option value="open">Em andamento</option>
        <option value="closed">Encerrados</option>
      </select>
    </section>

    <div class="evidence-layout">
      <section class="panel evidence-list-panel">
        <div class="panel-head">
          <div><span class="kicker">Atendimentos</span><h2>Registros</h2></div>
          <span id="evidence-count" class="badge">0</span>
        </div>
        <div id="evidence-list" class="evidence-list"></div>
      </section>

      <section class="panel evidence-detail-panel">
        <div id="evidence-empty" class="evidence-empty">
          <strong>Selecione um atendimento</strong>
          <span>A linha do tempo do serviço aparecerá aqui.</span>
        </div>
        <div id="evidence-detail" class="hidden">
          <div class="evidence-detail-head">
            <div>
              <span class="kicker">Dossiê do serviço</span>
              <h2 id="evidence-name">Cliente</h2>
              <p id="evidence-meta" class="muted"></p>
            </div>
            <span id="evidence-detail-status" class="badge"></span>
          </div>
          <div id="evidence-timeline" class="evidence-timeline"></div>
        </div>
      </section>
    </div>`;

  const whatsappPanel = main.querySelector('[data-tab-panel="whatsapp"]');
  if (whatsappPanel?.nextSibling) main.insertBefore(panel, whatsappPanel.nextSibling);
  else main.appendChild(panel);

  button.addEventListener('click', openEvidenceTab);
  $('#evidence-refresh')?.addEventListener('click', () => loadSessions({ keepSelection: true }));
  $('#evidence-search')?.addEventListener('input', (event) => { state.search = event.target.value.trim().toLowerCase(); renderList(); });
  $('#evidence-status')?.addEventListener('change', (event) => { state.status = event.target.value; renderList(); });
}

async function getClient() {
  if (state.supabase) return state.supabase;
  if (!isSupabaseConfigured()) return null;
  state.supabase = await getSupabase();
  return state.supabase;
}

function openEvidenceTab() {
  $$('[data-admin-tab]').forEach((item) => item.classList.toggle('active', item.dataset.adminTab === 'evidence'));
  $$('[data-tab-panel]').forEach((item) => item.classList.toggle('active', item.dataset.tabPanel === 'evidence'));
  loadSessions({ keepSelection: true });
}

async function loadSessions({ keepSelection = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  $('#evidence-list').innerHTML = '<div class="evidence-loading">Carregando evidências...</div>';
  try {
    if (state.demo || sessionStorage.getItem('valtec_evidence_demo') === '1') {
      state.demo = true;
      state.sessions = structuredClone(DEMO_SESSIONS);
      renderList();
      if (keepSelection && state.selectedId) await selectSession(state.selectedId);
      return;
    }
    const supabase = await getClient();
    if (!supabase) throw new Error('Supabase não configurado neste ambiente.');
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session) throw new Error('Entre na Central Valtec para visualizar as evidências.');
    const { data, error } = await supabase
      .from('service_evidence_sessions')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(300);
    if (error) throw error;
    state.sessions = data || [];
    if (!keepSelection || !state.sessions.some((item) => item.id === state.selectedId)) state.selectedId = null;
    renderList();
    if (keepSelection && state.selectedId) await selectSession(state.selectedId);
  } catch (error) {
    $('#evidence-list').innerHTML = `<div class="evidence-error"><strong>Não foi possível carregar.</strong><span>${esc(error?.message || error)}</span><small>A migration 017 precisa estar aplicada no Supabase.</small></div>`;
  } finally {
    state.loading = false;
  }
}

function filteredSessions() {
  const q = state.search;
  return state.sessions.filter((session) => {
    const statusMatch = state.status === 'all' || session.status === state.status;
    const haystack = [session.customer_name, session.customer_phone, session.equipment].join(' ').toLowerCase();
    return statusMatch && (!q || haystack.includes(q));
  });
}

function renderList() {
  const rows = filteredSessions();
  $('#evidence-count').textContent = rows.length;
  $('#evidence-list').innerHTML = rows.map((session) => `
    <button class="evidence-session ${session.id === state.selectedId ? 'active' : ''}" data-evidence-session="${esc(session.id)}" type="button">
      <div class="evidence-session-main">
        <strong>${esc(session.customer_name || 'Cliente')}</strong>
        <span>${esc(session.equipment || 'Equipamento não informado')}</span>
      </div>
      <div class="evidence-session-meta">
        <span class="badge ${session.status === 'open' ? 'orange' : 'green'}">${session.status === 'open' ? 'Em andamento' : 'Encerrado'}</span>
        <small>${local(session.updated_at || session.started_at)}</small>
      </div>
    </button>`).join('') || '<div class="evidence-empty-list">Nenhum registro encontrado.</div>';
  $$('[data-evidence-session]').forEach((button) => button.addEventListener('click', () => selectSession(button.dataset.evidenceSession)));
}

async function selectSession(id) {
  const session = state.sessions.find((item) => item.id === id);
  if (!session) return;
  state.selectedId = id;
  renderList();
  $('#evidence-empty').classList.add('hidden');
  $('#evidence-detail').classList.remove('hidden');
  $('#evidence-name').textContent = session.customer_name || 'Cliente';
  $('#evidence-meta').textContent = [
    session.equipment || '',
    session.customer_phone ? `WhatsApp ${session.customer_phone}` : '',
    `Início ${local(session.started_at)}`
  ].filter(Boolean).join(' · ');
  const status = $('#evidence-detail-status');
  status.textContent = session.status === 'open' ? 'Em andamento' : 'Encerrado';
  status.className = `badge ${session.status === 'open' ? 'orange' : 'green'}`;
  $('#evidence-timeline').innerHTML = '<div class="evidence-loading">Carregando linha do tempo...</div>';

  try {
    if (state.demo) state.items = structuredClone(DEMO_ITEMS[id] || []);
    else {
      const supabase = await getClient();
      const { data, error } = await supabase
        .from('service_evidence_items')
        .select('*')
        .eq('session_id', id)
        .order('captured_at', { ascending: true });
      if (error) throw error;
      state.items = data || [];
    }
    renderTimeline();
  } catch (error) {
    $('#evidence-timeline').innerHTML = `<div class="evidence-error">${esc(error?.message || error)}</div>`;
  }
}

function renderTimeline() {
  const groups = [
    ['before', 'ANTES'],
    ['during', 'DURANTE'],
    ['after', 'DEPOIS'],
    ['note', 'OBSERVAÇÕES']
  ];
  $('#evidence-timeline').innerHTML = groups.map(([phase, label]) => {
    const items = state.items.filter((item) => item.phase === phase);
    if (!items.length) return `
      <section class="evidence-phase empty-phase">
        <div class="evidence-phase-title"><strong>${label}</strong><span>0 registros</span></div>
        <p>Nenhum registro nesta etapa.</p>
      </section>`;
    return `
      <section class="evidence-phase">
        <div class="evidence-phase-title"><strong>${label}</strong><span>${items.length} registro${items.length > 1 ? 's' : ''}</span></div>
        <div class="evidence-items">
          ${items.map(renderItem).join('')}
        </div>
      </section>`;
  }).join('');
  $$('[data-evidence-media]').forEach((button) => button.addEventListener('click', () => openMedia(button.dataset.evidenceMedia)));
}

function renderItem(item) {
  const icon = { image: 'FOTO', video: 'VÍDEO', audio: 'ÁUDIO', document: 'ARQUIVO', text: 'NOTA' }[item.media_type] || 'ITEM';
  return `
    <article class="evidence-item">
      <div class="evidence-item-top">
        <span class="evidence-media-type">${icon}</span>
        <small>${local(item.captured_at)}</small>
      </div>
      <p>${esc(item.description || 'Sem descrição.')}</p>
      ${item.media_path ? `<button class="btn btn-light btn-small" type="button" data-evidence-media="${esc(item.media_path)}">Abrir arquivo</button>` : ''}
    </article>`;
}

async function openMedia(path) {
  if (state.demo) return;
  try {
    const supabase = await getClient();
    const { data, error } = await supabase.storage.from('lead-media').createSignedUrl(path, 600);
    if (error) throw error;
    window.open(data.signedUrl, '_blank', 'noopener');
  } catch (error) {
    alert(error?.message || 'Não foi possível abrir o arquivo.');
  }
}

function bindDemoHooks() {
  $('#demo-button')?.addEventListener('click', () => sessionStorage.setItem('valtec_evidence_demo', '1'));
  $('#logout-button')?.addEventListener('click', () => sessionStorage.removeItem('valtec_evidence_demo'));
}

function boot() {
  injectStyles();
  injectUi();
  bindDemoHooks();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
