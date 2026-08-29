import { getSupabase, isSupabaseConfigured } from './supabase.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '"':'&quot;' }[char]));
const norm = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const digits = (value) => String(value || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
const money = (value) => new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(Number(value) || 0);
const localDate = (value) => value ? new Date(value).toLocaleDateString('pt-BR') : '—';
const localDateTime = (value) => value ? new Date(value).toLocaleString('pt-BR', { dateStyle:'short', timeStyle:'short' }) : '—';
const toInputDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,16);
};

const STATUS_LABELS = {
  prospect:'Prospect', contato:'Contato realizado', visita:'Visita / avaliação', proposta:'Proposta enviada', ativo:'Cliente ativo', pausado:'Pausado', perdido:'Perdido'
};
const CONTRACT_LABELS = { sem_contrato:'Sem contrato', proposta:'Proposta', ativo:'Contrato ativo', encerrado:'Encerrado' };
const state = { supabase:null, accounts:[], assets:[], selectedId:null, loaded:false };

async function client() {
  if (state.supabase) return state.supabase;
  if (!isSupabaseConfigured()) return null;
  state.supabase = await getSupabase();
  return state.supabase;
}

async function schemaReady() {
  try {
    const s = await client();
    if (!s) return false;
    const { data: sessionData } = await s.auth.getSession();
    if (!sessionData?.session) return false;
    const [a,b] = await Promise.all([
      s.from('business_accounts').select('id').limit(1),
      s.from('business_assets').select('id').limit(1)
    ]);
    return !a.error && !b.error;
  } catch {
    return false;
  }
}

function injectStyles() {
  if ($('#valtec-business-css')) return;
  const link = document.createElement('link');
  link.id = 'valtec-business-css';
  link.rel = 'stylesheet';
  link.href = 'business-central.css?v=20260828-1';
  document.head.appendChild(link);
}

function injectUi() {
  if ($('[data-admin-tab="business"]')) return;
  const nav = $('.central-nav');
  const clientsButton = nav?.querySelector('[data-admin-tab="clients"]');
  if (nav) {
    const button = document.createElement('button');
    button.dataset.adminTab = 'business';
    button.innerHTML = 'Empresas <span class="business-nav-count" id="business-nav-count">0</span>';
    clientsButton?.insertAdjacentElement('afterend', button) || nav.appendChild(button);
    button.addEventListener('click', () => openTab());
  }

  const section = document.createElement('section');
  section.className = 'admin-tab business-tab';
  section.dataset.tabPanel = 'business';
  section.innerHTML = `
    <div class="business-head">
      <div><span class="kicker">Valtec Empresas</span><h2>Empresas e manutenção preventiva</h2><p>Prospecção, equipamentos, próxima ação e receita recorrente em uma única fila.</p></div>
      <button id="new-business" class="btn btn-primary" type="button">+ Nova empresa</button>
    </div>
    <div class="business-metrics">
      <article><small>Prospects ativos</small><strong id="business-metric-prospects">0</strong></article>
      <article><small>Propostas</small><strong id="business-metric-proposals">0</strong></article>
      <article><small>Contratos ativos</small><strong id="business-metric-contracts">0</strong></article>
      <article><small>Receita recorrente mensal</small><strong id="business-metric-mrr">R$ 0,00</strong></article>
    </div>
    <div class="business-layout">
      <section class="panel business-list-panel">
        <div class="business-toolbar"><input id="business-search" class="input" placeholder="Buscar empresa, contato, bairro ou segmento"><select id="business-filter" class="input"><option value="">Todos</option><option value="prospect">Prospects</option><option value="contato">Contato realizado</option><option value="visita">Visita / avaliação</option><option value="proposta">Proposta enviada</option><option value="ativo">Clientes ativos</option><option value="pausado">Pausados</option><option value="perdido">Perdidos</option></select></div>
        <div id="business-list" class="business-list"></div>
      </section>
      <section class="panel business-detail-panel" id="business-detail"><div class="business-detail-empty"><span class="kicker">Operação B2B</span><h3>Selecione uma empresa</h3><p>Abra um registro para ver follow-up, contrato e equipamentos.</p></div></section>
    </div>`;
  const teamPanel = $('[data-tab-panel="team"]');
  const main = $('.central-main');
  if (teamPanel?.parentNode) teamPanel.parentNode.insertBefore(section, teamPanel);
  else main?.appendChild(section);

  $('#new-business')?.addEventListener('click', () => renderEditor());
  $('#business-search')?.addEventListener('input', renderList);
  $('#business-filter')?.addEventListener('change', renderList);
}

function activateTab() {
  $$('[data-admin-tab]').forEach((button) => button.classList.toggle('active', button.dataset.adminTab === 'business'));
  $$('[data-tab-panel]').forEach((panel) => panel.classList.toggle('active', panel.dataset.tabPanel === 'business'));
}

async function openTab() {
  activateTab();
  await load();
  renderAll();
}

async function load() {
  const s = await client();
  const [accountsRes, assetsRes] = await Promise.all([
    s.from('business_accounts').select('*').order('updated_at', { ascending:false }).limit(500),
    s.from('business_assets').select('*').order('created_at', { ascending:false }).limit(1000)
  ]);
  if (!accountsRes.error) state.accounts = accountsRes.data || [];
  if (!assetsRes.error) state.assets = assetsRes.data || [];
  state.loaded = true;
}

function assetsFor(id) {
  return state.assets.filter((asset) => asset.business_id === id);
}

function renderMetrics() {
  const liveProspects = state.accounts.filter((account) => !['ativo','perdido','pausado'].includes(account.status)).length;
  const proposals = state.accounts.filter((account) => account.status === 'proposta' || account.contract_status === 'proposta').length;
  const contracts = state.accounts.filter((account) => account.contract_status === 'ativo').length;
  const mrr = state.accounts.filter((account) => account.contract_status === 'ativo').reduce((sum, account) => sum + Number(account.monthly_value || 0), 0);
  $('#business-metric-prospects').textContent = liveProspects;
  $('#business-metric-proposals').textContent = proposals;
  $('#business-metric-contracts').textContent = contracts;
  $('#business-metric-mrr').textContent = money(mrr);
  $('#business-nav-count').textContent = state.accounts.filter((account) => account.next_action_at && new Date(account.next_action_at) <= new Date() && !['perdido','pausado'].includes(account.status)).length;
}

function renderList() {
  const q = norm($('#business-search')?.value);
  const filter = $('#business-filter')?.value || '';
  const list = state.accounts.filter((account) => {
    if (filter && account.status !== filter) return false;
    if (!q) return true;
    return [account.name, account.contact_name, account.phone, account.neighborhood, account.segment, account.document_number].some((value) => norm(value).includes(q));
  }).sort((a,b) => {
    const aDue = a.next_action_at && new Date(a.next_action_at) <= new Date() ? 0 : 1;
    const bDue = b.next_action_at && new Date(b.next_action_at) <= new Date() ? 0 : 1;
    return aDue - bDue || new Date(b.updated_at) - new Date(a.updated_at);
  });
  $('#business-list').innerHTML = list.length ? list.map((account) => {
    const overdue = account.next_action_at && new Date(account.next_action_at) <= new Date() && !['perdido','pausado'].includes(account.status);
    return `<button class="business-row ${account.id === state.selectedId ? 'selected' : ''}" data-business-id="${account.id}" type="button"><div class="business-row-top"><div><b>${esc(account.name)}</b><span>${esc(account.segment || 'Segmento não informado')} · ${esc(account.neighborhood || 'Bairro não informado')}</span></div><span class="business-status ${esc(account.status)}">${esc(STATUS_LABELS[account.status] || account.status)}</span></div><p>${account.next_action ? `${overdue ? 'Ação pendente: ' : 'Próxima ação: '}${esc(account.next_action)}${account.next_action_at ? ` · ${localDateTime(account.next_action_at)}` : ''}` : 'Sem próxima ação registrada.'}</p></button>`;
  }).join('') : '<div class="business-empty">Nenhuma empresa encontrada.</div>';
  $$('[data-business-id]').forEach((button) => button.addEventListener('click', () => selectAccount(button.dataset.businessId)));
}

function renderAll() {
  renderMetrics();
  renderList();
  if (state.selectedId) renderDetail(state.selectedId);
}

function selectAccount(id) {
  state.selectedId = id;
  renderList();
  renderDetail(id);
}

function renderDetail(id) {
  const account = state.accounts.find((item) => item.id === id);
  const detail = $('#business-detail');
  if (!account || !detail) return;
  const assets = assetsFor(id);
  detail.innerHTML = `
    <div class="business-detail-head"><div><span class="kicker">${esc(STATUS_LABELS[account.status] || account.status)}</span><h2>${esc(account.name)}</h2><p>${esc(account.contact_name || 'Contato não informado')} · ${esc(account.phone || 'Sem telefone')}</p></div><button type="button" class="btn btn-light" id="edit-business">Editar</button></div>
    <div class="business-actions">
      ${account.phone ? `<a class="btn btn-secondary" target="_blank" rel="noopener" href="https://wa.me/55${digits(account.phone)}">WhatsApp</a>` : ''}
      <button class="btn btn-primary" type="button" id="business-new-quote">Novo orçamento</button>
      <button class="btn btn-light" type="button" id="business-new-order">Nova OS</button>
    </div>
    <div id="business-message"></div>
    <div class="business-info">
      <div><small>Segmento</small><strong>${esc(account.segment || '—')}</strong></div>
      <div><small>CNPJ / documento</small><strong>${esc(account.document_number || '—')}</strong></div>
      <div><small>Contato responsável</small><strong>${esc(account.contact_name || '—')}</strong></div>
      <div><small>E-mail</small><strong>${esc(account.email || '—')}</strong></div>
      <div><small>Endereço</small><strong>${esc(account.address || '—')}</strong></div>
      <div><small>Bairro</small><strong>${esc(account.neighborhood || '—')}</strong></div>
      <div><small>Contrato</small><strong>${esc(CONTRACT_LABELS[account.contract_status] || account.contract_status)}</strong></div>
      <div><small>Valor mensal</small><strong>${money(account.monthly_value)}</strong></div>
      <div><small>Periodicidade preventiva</small><strong>${account.preventive_frequency_days ? `${account.preventive_frequency_days} dias` : '—'}</strong></div>
      <div><small>Próxima visita</small><strong>${localDateTime(account.next_visit_at)}</strong></div>
      <div><small>Responsável técnico</small><strong>${esc(account.assigned_technician || '—')}</strong></div>
      <div><small>Vigência</small><strong>${account.contract_start ? localDate(account.contract_start) : '—'} a ${account.contract_end ? localDate(account.contract_end) : '—'}</strong></div>
      <div class="wide"><small>Próxima ação comercial</small><p>${esc(account.next_action || 'Nenhuma ação registrada.')} ${account.next_action_at ? `· ${localDateTime(account.next_action_at)}` : ''}</p></div>
      <div class="wide"><small>Observações</small><p>${esc(account.notes || 'Nenhuma observação cadastrada.')}</p></div>
    </div>
    <section class="business-section"><div class="business-section-head"><h3>Equipamentos</h3><button class="btn btn-light" id="new-business-asset" type="button">+ Adicionar equipamento</button></div><div id="business-assets" class="business-assets">${renderAssets(assets)}</div><div id="business-asset-editor"></div></section>`;

  $('#edit-business')?.addEventListener('click', () => renderEditor(account));
  $('#new-business-asset')?.addEventListener('click', () => renderAssetEditor(account.id));
  $('#business-new-quote')?.addEventListener('click', () => startQuote(account));
  $('#business-new-order')?.addEventListener('click', () => startOrder(account));
  $$('[data-business-asset-order]').forEach((button) => button.addEventListener('click', () => startOrder(account, assets.find((asset) => asset.id === button.dataset.businessAssetOrder))));
}

function renderAssets(assets) {
  if (!assets.length) return '<div class="business-empty">Nenhum equipamento cadastrado para esta empresa.</div>';
  return assets.map((asset) => `<div class="business-asset"><div><b>${esc(asset.quantity || 1)} × ${esc(asset.equipment_type)}</b><span>${esc([asset.brand, asset.model].filter(Boolean).join(' · ') || 'Marca/modelo não informado')}</span></div><div><span>Preventiva</span><b>${asset.next_preventive_at ? localDate(asset.next_preventive_at) : 'Sem data'}</b></div><div class="business-asset-right"><span>${esc(asset.condition || 'Condição não informada')}</span><br><button class="mini-button" type="button" data-business-asset-order="${asset.id}">Abrir OS</button></div></div>`).join('');
}

function accountForm(account = {}) {
  return `<form id="business-editor" class="business-editor">
    <input type="hidden" id="business-id" value="${esc(account.id || '')}">
    <div class="business-editor-grid">
      <div class="field"><label>Empresa</label><input id="business-name" class="input" required value="${esc(account.name || '')}"></div>
      <div class="field"><label>Segmento</label><input id="business-segment" class="input" value="${esc(account.segment || '')}" placeholder="Restaurante, padaria, escola..."></div>
      <div class="field"><label>Contato responsável</label><input id="business-contact" class="input" value="${esc(account.contact_name || '')}"></div>
      <div class="field"><label>WhatsApp</label><input id="business-phone" class="input" required value="${esc(account.phone || '')}"></div>
      <div class="field"><label>E-mail</label><input id="business-email" class="input" type="email" value="${esc(account.email || '')}"></div>
      <div class="field"><label>CNPJ / documento</label><input id="business-document" class="input" value="${esc(account.document_number || '')}"></div>
      <div class="field"><label>Bairro</label><input id="business-neighborhood" class="input" value="${esc(account.neighborhood || '')}"></div>
      <div class="field"><label>Endereço</label><input id="business-address" class="input" value="${esc(account.address || '')}"></div>
      <div class="field"><label>Status comercial</label><select id="business-status" class="input">${Object.entries(STATUS_LABELS).map(([value,label]) => `<option value="${value}" ${account.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
      <div class="field"><label>Status do contrato</label><select id="business-contract-status" class="input">${Object.entries(CONTRACT_LABELS).map(([value,label]) => `<option value="${value}" ${account.contract_status === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
      <div class="field"><label>Valor mensal</label><input id="business-monthly-value" class="input" type="number" min="0" step="0.01" value="${Number(account.monthly_value || 0) || ''}"></div>
      <div class="field"><label>Periodicidade preventiva em dias</label><input id="business-frequency" class="input" type="number" min="1" value="${account.preventive_frequency_days || ''}"></div>
      <div class="field"><label>Início do contrato</label><input id="business-contract-start" class="input" type="date" value="${account.contract_start || ''}"></div>
      <div class="field"><label>Fim do contrato</label><input id="business-contract-end" class="input" type="date" value="${account.contract_end || ''}"></div>
      <div class="field"><label>Responsável técnico</label><input id="business-technician" class="input" value="${esc(account.assigned_technician || '')}"></div>
      <div class="field"><label>Próxima visita</label><input id="business-next-visit" class="input" type="datetime-local" value="${toInputDateTime(account.next_visit_at)}"></div>
      <div class="field"><label>Próxima ação</label><input id="business-next-action" class="input" value="${esc(account.next_action || '')}"></div>
      <div class="field"><label>Data da próxima ação</label><input id="business-next-action-at" class="input" type="datetime-local" value="${toInputDateTime(account.next_action_at)}"></div>
    </div>
    <div class="field"><label>Observações</label><textarea id="business-notes">${esc(account.notes || '')}</textarea></div>
    <div class="business-editor-actions"><button class="btn btn-light" type="button" id="business-editor-cancel">Cancelar</button><button class="btn btn-primary" type="submit">Salvar empresa</button></div>
  </form>`;
}

function renderEditor(account = null) {
  state.selectedId = account?.id || null;
  const detail = $('#business-detail');
  detail.innerHTML = `<div class="business-detail-head"><div><span class="kicker">Valtec Empresas</span><h2>${account ? 'Editar empresa' : 'Nova empresa'}</h2><p>Registre somente o necessário para próximo passo, preventiva e relação comercial.</p></div></div>${accountForm(account || {})}`;
  $('#business-editor')?.addEventListener('submit', saveAccount);
  $('#business-editor-cancel')?.addEventListener('click', () => account ? renderDetail(account.id) : (detail.innerHTML = '<div class="business-detail-empty"><span class="kicker">Operação B2B</span><h3>Selecione uma empresa</h3><p>Abra um registro para ver follow-up, contrato e equipamentos.</p></div>'));
}

async function saveAccount(event) {
  event.preventDefault();
  const id = $('#business-id').value || null;
  const payload = {
    name:$('#business-name').value.trim(), segment:$('#business-segment').value.trim() || null,
    contact_name:$('#business-contact').value.trim() || null, phone:$('#business-phone').value.trim(), email:$('#business-email').value.trim() || null,
    document_number:$('#business-document').value.trim() || null, neighborhood:$('#business-neighborhood').value.trim() || null, address:$('#business-address').value.trim() || null,
    status:$('#business-status').value, contract_status:$('#business-contract-status').value, monthly_value:Number($('#business-monthly-value').value) || 0,
    preventive_frequency_days:Number($('#business-frequency').value) || null, contract_start:$('#business-contract-start').value || null, contract_end:$('#business-contract-end').value || null,
    assigned_technician:$('#business-technician').value.trim() || null, next_visit_at:$('#business-next-visit').value ? new Date($('#business-next-visit').value).toISOString() : null,
    next_action:$('#business-next-action').value.trim() || null, next_action_at:$('#business-next-action-at').value ? new Date($('#business-next-action-at').value).toISOString() : null,
    notes:$('#business-notes').value.trim() || null, updated_at:new Date().toISOString()
  };
  if (!payload.name || !payload.phone) return showMessage('Empresa e WhatsApp são obrigatórios.', 'error');
  const s = await client();
  const result = id ? await s.from('business_accounts').update(payload).eq('id', id).select().single() : await s.from('business_accounts').insert(payload).select().single();
  if (result.error) return showMessage('Não foi possível salvar a empresa.', 'error');
  await load();
  state.selectedId = result.data.id;
  renderAll();
  showMessage('Empresa salva.', 'success');
}

function showMessage(text, type = '') {
  const box = $('#business-message') || $('#business-detail');
  if (!box) return;
  if (box.id === 'business-message') box.innerHTML = `<div class="business-message ${type}">${esc(text)}</div>`;
}

function renderAssetEditor(businessId) {
  const box = $('#business-asset-editor');
  if (!box) return;
  box.innerHTML = `<form id="business-asset-form" class="business-editor"><input type="hidden" id="business-asset-business" value="${businessId}"><div class="business-editor-grid"><div class="field"><label>Equipamento</label><input id="business-asset-type" class="input" required placeholder="Fogão industrial, forno, chapa..."></div><div class="field"><label>Quantidade</label><input id="business-asset-quantity" class="input" type="number" min="1" value="1"></div><div class="field"><label>Marca</label><input id="business-asset-brand" class="input"></div><div class="field"><label>Modelo</label><input id="business-asset-model" class="input"></div><div class="field"><label>Condição atual</label><input id="business-asset-condition" class="input" placeholder="Operando, atenção, parado..."></div><div class="field"><label>Próxima preventiva</label><input id="business-asset-next" class="input" type="datetime-local"></div></div><div class="field"><label>Localização / observação</label><textarea id="business-asset-notes" placeholder="Ex.: cozinha principal, linha quente, acesso pelo estoque."></textarea></div><div class="business-editor-actions"><button class="btn btn-light" type="button" id="business-asset-cancel">Cancelar</button><button class="btn btn-primary" type="submit">Salvar equipamento</button></div></form>`;
  $('#business-asset-form')?.addEventListener('submit', saveAsset);
  $('#business-asset-cancel')?.addEventListener('click', () => { box.innerHTML = ''; });
}

async function saveAsset(event) {
  event.preventDefault();
  const payload = {
    business_id:$('#business-asset-business').value, equipment_type:$('#business-asset-type').value.trim(), quantity:Number($('#business-asset-quantity').value) || 1,
    brand:$('#business-asset-brand').value.trim() || null, model:$('#business-asset-model').value.trim() || null, condition:$('#business-asset-condition').value.trim() || null,
    next_preventive_at:$('#business-asset-next').value ? new Date($('#business-asset-next').value).toISOString() : null, notes:$('#business-asset-notes').value.trim() || null
  };
  const s = await client();
  const { error } = await s.from('business_assets').insert(payload);
  if (error) return showMessage('Não foi possível salvar o equipamento.', 'error');
  await load();
  renderDetail(payload.business_id);
  showMessage('Equipamento cadastrado.', 'success');
}

async function ensureLinkedClient(account) {
  if (account.client_id) return account.client_id;
  const s = await client();
  let existing = null;
  if (account.phone) {
    const { data } = await s.from('clients').select('id').eq('phone', account.phone).limit(1).maybeSingle();
    existing = data;
  }
  let clientId = existing?.id || null;
  if (!clientId) {
    const { data, error } = await s.from('clients').insert({ name:account.name, phone:account.phone, neighborhood:account.neighborhood, address:account.address, notes:`Cliente empresarial. Contato: ${account.contact_name || 'não informado'}.` }).select('id').single();
    if (error) throw error;
    clientId = data.id;
  }
  await s.from('business_accounts').update({ client_id:clientId, updated_at:new Date().toISOString() }).eq('id', account.id);
  account.client_id = clientId;
  return clientId;
}

async function startQuote(account) {
  try { await ensureLinkedClient(account); } catch { return showMessage('Não foi possível vincular a empresa ao cadastro de cliente.', 'error'); }
  document.querySelector('[data-admin-tab="quotes"]')?.click();
  setTimeout(() => {
    $('#clear-quote')?.click();
    if ($('#quote-client')) $('#quote-client').value = account.name;
    if ($('#quote-phone')) $('#quote-phone').value = account.phone || '';
    if ($('#quote-address')) $('#quote-address').value = [account.address, account.neighborhood].filter(Boolean).join(' · ');
    if ($('#quote-note')) $('#quote-note').value = `Atendimento Valtec Empresas. ${account.segment ? `Segmento: ${account.segment}.` : ''}`;
    $('#quote-client')?.dispatchEvent(new Event('input', { bubbles:true }));
  }, 40);
}

async function startOrder(account, asset = null) {
  let clientId;
  try { clientId = await ensureLinkedClient(account); } catch { return showMessage('Não foi possível vincular a empresa ao cadastro de cliente.', 'error'); }
  sessionStorage.setItem('valtec_business_order_link', JSON.stringify({ businessId:account.id, assetId:asset?.id || null }));
  document.querySelector('[data-admin-tab="orders"]')?.click();
  setTimeout(() => {
    $('#new-order')?.click();
    setTimeout(() => {
      if ($('#order-client')) $('#order-client').value = account.name;
      if ($('#order-client-id')) $('#order-client-id').value = clientId;
      if (asset && $('#order-equipment')) $('#order-equipment').value = [asset.equipment_type, asset.brand, asset.model].filter(Boolean).join(' · ');
      if (asset && $('#order-equipment-brand')) $('#order-equipment-brand').value = asset.brand || '';
      if (asset && $('#order-equipment-model')) $('#order-equipment-model').value = asset.model || '';
      if ($('#order-service-type')) $('#order-service-type').value = 'preventiva';
    }, 30);
  }, 30);
}

async function linkSavedOrder() {
  const raw = sessionStorage.getItem('valtec_business_order_link');
  if (!raw) return;
  let link;
  try { link = JSON.parse(raw); } catch { sessionStorage.removeItem('valtec_business_order_link'); return; }
  let orderId = $('#order-id')?.value || null;
  for (let i=0; i<12 && !orderId; i+=1) {
    await new Promise((resolve) => setTimeout(resolve, 180));
    orderId = $('#order-id')?.value || null;
  }
  if (!orderId) return;
  const s = await client();
  const { error } = await s.from('service_orders').update({ business_account_id:link.businessId, business_asset_id:link.assetId || null, updated_at:new Date().toISOString() }).eq('id', orderId);
  if (!error) sessionStorage.removeItem('valtec_business_order_link');
}

function bindOrderLink() {
  const form = $('#order-form');
  if (!form || form.dataset.businessLinkBound) return;
  form.dataset.businessLinkBound = '1';
  form.addEventListener('submit', () => { if (sessionStorage.getItem('valtec_business_order_link')) linkSavedOrder(); });
}

async function boot() {
  if (!(await schemaReady())) return;
  injectStyles();
  injectUi();
  bindOrderLink();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
else boot();
