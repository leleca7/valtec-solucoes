import { getSupabase, isSupabaseConfigured } from './supabase.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '"':'&quot;' }[char]));
const norm = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const money = (value) => new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(Number(value) || 0);
const localDateTime = (value) => value ? new Date(value).toLocaleString('pt-BR', { dateStyle:'short', timeStyle:'short' }) : '—';

const MOVEMENT_LABELS = { entrada:'Entrada', saida:'Saída', ajuste_entrada:'Ajuste de entrada', ajuste_saida:'Ajuste de saída' };
const state = {
  supabase:null,
  parts:[], suppliers:[], movements:[],
  selectedPartId:null,
  orderItems:[], draftOrderItems:[], currentOrderId:null,
  loaded:false
};

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
    const { data:sessionData } = await s.auth.getSession();
    if (!sessionData?.session) return false;
    const [suppliersRes, movementRes, itemRes, partRes] = await Promise.all([
      s.from('suppliers').select('id').limit(1),
      s.from('inventory_movements').select('id').limit(1),
      s.from('service_order_parts').select('id').limit(1),
      s.from('parts_catalog').select('id,preferred_supplier_id,storage_location,last_purchase_cost').limit(1)
    ]);
    return !suppliersRes.error && !movementRes.error && !itemRes.error && !partRes.error;
  } catch { return false; }
}

function injectStyles() {
  if ($('#valtec-inventory-css')) return;
  const link = document.createElement('link');
  link.id = 'valtec-inventory-css';
  link.rel = 'stylesheet';
  link.href = 'inventory-central.css?v=20260828-1';
  document.head.appendChild(link);
}

function injectUi() {
  if ($('[data-admin-tab="inventory"]')) return;
  const nav = $('.central-nav');
  const catalogButton = nav?.querySelector('[data-admin-tab="catalog"]');
  if (nav) {
    const button = document.createElement('button');
    button.dataset.adminTab = 'inventory';
    button.textContent = 'Estoque';
    catalogButton?.insertAdjacentElement('afterend', button) || nav.appendChild(button);
    button.addEventListener('click', openTab);
  }

  const section = document.createElement('section');
  section.className = 'admin-tab inventory-tab';
  section.dataset.tabPanel = 'inventory';
  section.innerHTML = `
    <div class="inventory-head">
      <div><span class="kicker">Estoque</span><h2>Peças, movimentos e fornecedores</h2><p>O catálogo continua sendo o cadastro mestre da peça. Aqui ficam saldo, entrada, saída, custo e consumo por ordem de serviço.</p></div>
      <div class="inventory-head-actions"><button id="inventory-new-movement" class="btn btn-primary" type="button">Registrar movimento</button><button id="inventory-suppliers" class="btn btn-light" type="button">Fornecedores</button></div>
    </div>
    <div class="inventory-metrics">
      <article><small>Itens abaixo do mínimo</small><strong id="inventory-low-count">0</strong></article>
      <article><small>Valor estimado em estoque</small><strong id="inventory-stock-value">R$ 0,00</strong></article>
      <article><small>Entradas no mês</small><strong id="inventory-entry-value">R$ 0,00</strong></article>
      <article><small>Consumo em OS no mês</small><strong id="inventory-consumption-value">R$ 0,00</strong></article>
    </div>
    <div class="inventory-layout">
      <section class="panel inventory-list-panel">
        <div class="inventory-toolbar"><input id="inventory-search" class="input" placeholder="Buscar peça, código, marca ou localização"><select id="inventory-filter" class="input"><option value="">Todos</option><option value="low">Abaixo do mínimo</option><option value="zero">Sem estoque</option><option value="available">Com estoque</option></select></div>
        <div id="inventory-table" class="inventory-table"></div>
      </section>
      <section class="panel inventory-detail-panel" id="inventory-detail"><div class="inventory-detail-empty"><span class="kicker">Controle de estoque</span><h3>Selecione uma peça</h3><p>Veja saldo, fornecedor, localização e histórico de movimentos.</p></div></section>
    </div>`;

  const catalogPanel = $('[data-tab-panel="catalog"]');
  if (catalogPanel?.parentNode) catalogPanel.parentNode.insertBefore(section, catalogPanel.nextSibling);
  else $('.central-main')?.appendChild(section);

  $('#inventory-search')?.addEventListener('input', renderList);
  $('#inventory-filter')?.addEventListener('change', renderList);
  $('#inventory-new-movement')?.addEventListener('click', () => renderMovementEditor());
  $('#inventory-suppliers')?.addEventListener('click', renderSuppliers);
}

function activateTab() {
  $$('[data-admin-tab]').forEach((button) => button.classList.toggle('active', button.dataset.adminTab === 'inventory'));
  $$('[data-tab-panel]').forEach((panel) => panel.classList.toggle('active', panel.dataset.tabPanel === 'inventory'));
}

async function openTab() {
  activateTab();
  await load();
  renderAll();
}

async function load() {
  const s = await client();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const [partsRes, suppliersRes, movementsRes] = await Promise.all([
    s.from('parts_catalog').select('*').eq('active', true).order('name').limit(1000),
    s.from('suppliers').select('*').eq('active', true).order('name').limit(500),
    s.from('inventory_movements').select('*').gte('occurred_at', monthStart).order('occurred_at', { ascending:false }).limit(1000)
  ]);
  if (!partsRes.error) state.parts = partsRes.data || [];
  if (!suppliersRes.error) state.suppliers = suppliersRes.data || [];
  if (!movementsRes.error) state.movements = movementsRes.data || [];
  state.loaded = true;
  refreshOrderPartOptions();
}

function supplierById(id) { return state.suppliers.find((supplier) => supplier.id === id); }
function partById(id) { return state.parts.find((part) => part.id === id); }
function partUnitCost(part) { return Number(part?.last_purchase_cost ?? part?.purchase_price ?? 0) || 0; }
function stockQty(part) { return Number(part?.stock_qty || 0); }
function minStock(part) { return Number(part?.min_stock || 0); }
function isLow(part) { return minStock(part) > 0 && stockQty(part) <= minStock(part); }

function renderMetrics() {
  const low = state.parts.filter(isLow).length;
  const stockValue = state.parts.reduce((sum, part) => sum + stockQty(part) * partUnitCost(part), 0);
  const entryValue = state.movements.filter((movement) => movement.movement_type === 'entrada').reduce((sum, movement) => sum + Number(movement.quantity || 0) * Number(movement.unit_cost || 0), 0);
  const consumptionValue = state.movements.filter((movement) => movement.movement_type === 'saida' && movement.service_order_id).reduce((sum, movement) => sum + Number(movement.quantity || 0) * Number(movement.unit_cost || 0), 0);
  $('#inventory-low-count').textContent = low;
  $('#inventory-stock-value').textContent = money(stockValue);
  $('#inventory-entry-value').textContent = money(entryValue);
  $('#inventory-consumption-value').textContent = money(consumptionValue);
}

function renderList() {
  const q = norm($('#inventory-search')?.value);
  const filter = $('#inventory-filter')?.value || '';
  const rows = state.parts.filter((part) => {
    if (filter === 'low' && !isLow(part)) return false;
    if (filter === 'zero' && stockQty(part) !== 0) return false;
    if (filter === 'available' && stockQty(part) <= 0) return false;
    if (!q) return true;
    return [part.name,part.code,part.brand,part.category,part.storage_location,...(part.aliases || [])].some((value) => norm(value).includes(q));
  });
  $('#inventory-table').innerHTML = `<div class="inventory-row header"><span>Peça</span><span class="inventory-number">Saldo</span><span class="inventory-number">Mínimo</span><span class="inventory-number">Último custo</span></div>${rows.length ? rows.map((part) => `<div class="inventory-row ${part.id === state.selectedPartId ? 'selected' : ''}" data-inventory-part="${part.id}"><div><b>${esc(part.name)}</b><span>${esc([part.brand,part.code,part.storage_location].filter(Boolean).join(' · ') || part.category || 'Sem referência')}</span></div><span class="inventory-number ${isLow(part) ? 'inventory-stock-low' : ''}">${stockQty(part)}</span><span class="inventory-number">${minStock(part)}</span><span class="inventory-number">${money(partUnitCost(part))}</span></div>`).join('') : '<div class="inventory-empty">Nenhuma peça encontrada.</div>'}`;
  $$('[data-inventory-part]').forEach((row) => row.addEventListener('click', () => selectPart(row.dataset.inventoryPart)));
}

function renderAll() {
  renderMetrics();
  renderList();
  if (state.selectedPartId) renderDetail(state.selectedPartId);
}

function selectPart(id) {
  state.selectedPartId = id;
  renderList();
  renderDetail(id);
}

async function loadMovementsForPart(id) {
  const s = await client();
  const { data, error } = await s.from('inventory_movements').select('*').eq('part_id', id).order('occurred_at', { ascending:false }).limit(100);
  return error ? [] : data || [];
}

async function renderDetail(id) {
  const part = partById(id);
  const detail = $('#inventory-detail');
  if (!part || !detail) return;
  const movements = await loadMovementsForPart(id);
  const supplier = supplierById(part.preferred_supplier_id);
  detail.innerHTML = `
    <div class="inventory-detail-head"><div><span class="kicker">${esc(part.category || 'Peça')}</span><h2>${esc(part.name)}</h2><p>${esc([part.brand,part.code].filter(Boolean).join(' · ') || 'Sem marca/código')}</p></div><button class="btn btn-light" id="inventory-edit-meta" type="button">Editar estoque</button></div>
    <div id="inventory-message"></div>
    <div class="inventory-actions"><button class="btn btn-primary" id="inventory-move-part" type="button">Registrar movimento</button><button class="btn btn-light" id="inventory-open-catalog-part" type="button">Abrir no catálogo</button></div>
    <div class="inventory-info"><div><small>Saldo atual</small><strong class="${isLow(part) ? 'inventory-stock-low' : ''}">${stockQty(part)}</strong></div><div><small>Estoque mínimo</small><strong>${minStock(part)}</strong></div><div><small>Custo cadastrado</small><strong>${money(part.purchase_price)}</strong></div><div><small>Último custo de compra</small><strong>${money(partUnitCost(part))}</strong></div><div><small>Preço de venda</small><strong>${money(part.sale_price)}</strong></div><div><small>Valor em estoque</small><strong>${money(stockQty(part) * partUnitCost(part))}</strong></div><div><small>Fornecedor preferencial</small><strong>${esc(supplier?.name || '—')}</strong></div><div><small>Localização</small><strong>${esc(part.storage_location || '—')}</strong></div></div>
    <section class="inventory-section"><div class="inventory-section-head"><h3>Movimentos</h3><span class="muted small">Últimos ${Math.min(movements.length,100)} registros</span></div><div>${renderMovements(movements)}</div></section>
    <div id="inventory-editor-slot"></div>`;
  $('#inventory-move-part')?.addEventListener('click', () => renderMovementEditor(part));
  $('#inventory-edit-meta')?.addEventListener('click', () => renderMetadataEditor(part));
  $('#inventory-open-catalog-part')?.addEventListener('click', () => openCatalogPart(part));
}

function renderMovements(movements) {
  if (!movements.length) return '<div class="inventory-empty">Ainda não há movimentos registrados para esta peça.</div>';
  return movements.map((movement) => `<div class="inventory-movement"><time>${localDateTime(movement.occurred_at)}</time><div><b>${esc(MOVEMENT_LABELS[movement.movement_type] || movement.movement_type)}</b><span>${esc(movement.note || (movement.service_order_id ? 'Movimento vinculado a OS' : 'Movimento de estoque'))}</span></div><span class="inventory-number">${Number(movement.quantity || 0)}</span><span class="inventory-number">${money(movement.unit_cost)}</span></div>`).join('');
}

function supplierOptions(selected = '') {
  return `<option value="">Não informado</option>${state.suppliers.map((supplier) => `<option value="${supplier.id}" ${supplier.id === selected ? 'selected' : ''}>${esc(supplier.name)}</option>`).join('')}`;
}

function partOptions(selected = '') {
  return `<option value="">Selecione uma peça</option>${state.parts.map((part) => `<option value="${part.id}" ${part.id === selected ? 'selected' : ''}>${esc(part.name)} · saldo ${stockQty(part)}</option>`).join('')}`;
}

function renderMovementEditor(part = null) {
  const detail = $('#inventory-detail');
  if (!detail) return;
  const slot = $('#inventory-editor-slot') || detail;
  slot.innerHTML = `<form id="inventory-movement-form" class="inventory-editor"><div class="inventory-section-head"><h3>Registrar movimento</h3><span class="muted small">Entrada, saída ou ajuste com histórico.</span></div><div class="inventory-editor-grid"><div class="field"><label>Peça</label><select id="inventory-movement-part" class="input" required>${partOptions(part?.id || '')}</select></div><div class="field"><label>Tipo</label><select id="inventory-movement-type" class="input"><option value="entrada">Entrada</option><option value="saida">Saída avulsa</option><option value="ajuste_entrada">Ajuste de entrada</option><option value="ajuste_saida">Ajuste de saída</option></select></div><div class="field"><label>Quantidade</label><input id="inventory-movement-quantity" class="input" type="number" min="0.001" step="0.001" required></div><div class="field"><label>Custo unitário</label><input id="inventory-movement-cost" class="input" type="number" min="0" step="0.01"></div><div class="field"><label>Fornecedor</label><select id="inventory-movement-supplier" class="input">${supplierOptions(part?.preferred_supplier_id || '')}</select></div><div class="field"><label>Observação</label><input id="inventory-movement-note" class="input" placeholder="Compra, correção de contagem, descarte..."></div></div><div class="inventory-editor-actions"><button class="btn btn-light" type="button" id="inventory-movement-cancel">Cancelar</button><button class="btn btn-primary" type="submit">Salvar movimento</button></div></form>`;
  const partSelect = $('#inventory-movement-part');
  const fillCost = () => {
    const selectedPart = partById(partSelect.value);
    if (selectedPart && !$('#inventory-movement-cost').value) $('#inventory-movement-cost').value = partUnitCost(selectedPart) || '';
  };
  partSelect?.addEventListener('change', fillCost);
  fillCost();
  $('#inventory-movement-form')?.addEventListener('submit', saveMovement);
  $('#inventory-movement-cancel')?.addEventListener('click', () => { if ($('#inventory-editor-slot')) $('#inventory-editor-slot').innerHTML = ''; else renderAll(); });
}

async function saveMovement(event) {
  event.preventDefault();
  const partId = $('#inventory-movement-part').value;
  const type = $('#inventory-movement-type').value;
  const quantity = Number($('#inventory-movement-quantity').value) || 0;
  const unitCost = Number($('#inventory-movement-cost').value) || 0;
  const supplierId = $('#inventory-movement-supplier').value || null;
  const note = $('#inventory-movement-note').value.trim() || null;
  if (!partId || quantity <= 0) return showMessage('Selecione a peça e informe uma quantidade válida.', 'error');
  const s = await client();
  const { error } = await s.rpc('record_inventory_movement', { p_part_id:partId, p_movement_type:type, p_quantity:quantity, p_unit_cost:unitCost, p_supplier_id:supplierId, p_service_order_id:null, p_note:note });
  if (error) return showMessage(error.message?.includes('Estoque insuficiente') ? 'Estoque insuficiente para esta saída.' : 'Não foi possível registrar o movimento.', 'error');
  await load();
  state.selectedPartId = partId;
  renderAll();
  showMessage('Movimento registrado.', 'success');
}

function renderMetadataEditor(part) {
  const slot = $('#inventory-editor-slot');
  if (!slot) return;
  slot.innerHTML = `<form id="inventory-meta-form" class="inventory-editor"><div class="inventory-section-head"><h3>Parâmetros de estoque</h3></div><div class="inventory-editor-grid"><div class="field"><label>Estoque mínimo</label><input id="inventory-meta-min" class="input" type="number" min="0" step="0.001" value="${minStock(part)}"></div><div class="field"><label>Localização física</label><input id="inventory-meta-location" class="input" value="${esc(part.storage_location || '')}" placeholder="Caixa, gaveta, prateleira..."></div><div class="field"><label>Fornecedor preferencial</label><select id="inventory-meta-supplier" class="input">${supplierOptions(part.preferred_supplier_id || '')}</select></div><div class="field"><label>Último custo de compra</label><input class="input" value="${money(partUnitCost(part))}" disabled></div></div><div class="inventory-editor-actions"><button class="btn btn-light" type="button" id="inventory-meta-cancel">Cancelar</button><button class="btn btn-primary" type="submit">Salvar parâmetros</button></div></form>`;
  $('#inventory-meta-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const s = await client();
    const payload = { min_stock:Number($('#inventory-meta-min').value) || 0, storage_location:$('#inventory-meta-location').value.trim() || null, preferred_supplier_id:$('#inventory-meta-supplier').value || null, updated_at:new Date().toISOString() };
    const { error } = await s.from('parts_catalog').update(payload).eq('id', part.id);
    if (error) return showMessage('Não foi possível salvar os parâmetros.', 'error');
    await load();
    renderAll();
    showMessage('Parâmetros atualizados.', 'success');
  });
  $('#inventory-meta-cancel')?.addEventListener('click', () => { slot.innerHTML = ''; });
}

function openCatalogPart(part) {
  document.querySelector('[data-admin-tab="catalog"]')?.click();
  setTimeout(() => document.querySelector(`[data-edit-part="${part.id}"]`)?.click(), 30);
}

function renderSuppliers() {
  state.selectedPartId = null;
  renderList();
  const detail = $('#inventory-detail');
  detail.innerHTML = `<div class="inventory-detail-head"><div><span class="kicker">Fornecedores</span><h2>Fornecimento de peças</h2><p>Contatos usados para reposição e comparação de compra.</p></div><button class="btn btn-primary" id="inventory-new-supplier" type="button">+ Novo fornecedor</button></div><div id="inventory-message"></div><div class="supplier-list">${state.suppliers.length ? state.suppliers.map((supplier) => `<div class="supplier-row"><div><b>${esc(supplier.name)}</b><span>${esc(supplier.contact_name || supplier.email || 'Sem contato nomeado')}</span></div><span>${esc(supplier.phone || '—')}</span><button class="mini-button" data-edit-supplier="${supplier.id}" type="button">Editar</button></div>`).join('') : '<div class="inventory-empty">Nenhum fornecedor cadastrado.</div>'}</div><div id="inventory-editor-slot"></div>`;
  $('#inventory-new-supplier')?.addEventListener('click', () => renderSupplierEditor());
  $$('[data-edit-supplier]').forEach((button) => button.addEventListener('click', () => renderSupplierEditor(state.suppliers.find((supplier) => supplier.id === button.dataset.editSupplier))));
}

function renderSupplierEditor(supplier = {}) {
  const slot = $('#inventory-editor-slot');
  if (!slot) return;
  slot.innerHTML = `<form id="inventory-supplier-form" class="inventory-editor"><input id="inventory-supplier-id" type="hidden" value="${esc(supplier.id || '')}"><div class="inventory-section-head"><h3>${supplier.id ? 'Editar fornecedor' : 'Novo fornecedor'}</h3></div><div class="inventory-editor-grid"><div class="field"><label>Fornecedor</label><input id="inventory-supplier-name" class="input" required value="${esc(supplier.name || '')}"></div><div class="field"><label>Contato</label><input id="inventory-supplier-contact" class="input" value="${esc(supplier.contact_name || '')}"></div><div class="field"><label>WhatsApp / telefone</label><input id="inventory-supplier-phone" class="input" value="${esc(supplier.phone || '')}"></div><div class="field"><label>E-mail</label><input id="inventory-supplier-email" class="input" type="email" value="${esc(supplier.email || '')}"></div></div><div class="field"><label>Observações</label><textarea id="inventory-supplier-notes">${esc(supplier.notes || '')}</textarea></div><div class="inventory-editor-actions"><button class="btn btn-light" id="inventory-supplier-cancel" type="button">Cancelar</button><button class="btn btn-primary" type="submit">Salvar fornecedor</button></div></form>`;
  $('#inventory-supplier-form')?.addEventListener('submit', saveSupplier);
  $('#inventory-supplier-cancel')?.addEventListener('click', () => { slot.innerHTML = ''; });
}

async function saveSupplier(event) {
  event.preventDefault();
  const id = $('#inventory-supplier-id').value || null;
  const payload = { name:$('#inventory-supplier-name').value.trim(), contact_name:$('#inventory-supplier-contact').value.trim() || null, phone:$('#inventory-supplier-phone').value.trim() || null, email:$('#inventory-supplier-email').value.trim() || null, notes:$('#inventory-supplier-notes').value.trim() || null, active:true, updated_at:new Date().toISOString() };
  if (!payload.name) return showMessage('Informe o nome do fornecedor.', 'error');
  const s = await client();
  const result = id ? await s.from('suppliers').update(payload).eq('id', id).select().single() : await s.from('suppliers').insert(payload).select().single();
  if (result.error) return showMessage('Não foi possível salvar o fornecedor.', 'error');
  await load();
  renderSuppliers();
  showMessage('Fornecedor salvo.', 'success');
}

function showMessage(text, type = '') {
  const box = $('#inventory-message');
  if (box) box.innerHTML = `<div class="inventory-message ${type}">${esc(text)}</div>`;
  else notify(text, type);
}

function notify(text, type = 'success') {
  const box = $('#central-message');
  if (!box) return;
  box.textContent = text;
  box.className = `notice ${type === 'error' ? 'error' : 'success'}`;
  setTimeout(() => box.classList.add('hidden'), 4200);
}

function injectOrderPartsUi() {
  const form = $('#order-form');
  if (!form || $('#order-parts-section')) return;
  const section = document.createElement('section');
  section.id = 'order-parts-section';
  section.className = 'order-parts-section';
  section.innerHTML = `<div class="order-parts-head"><div><span class="kicker">Estoque</span><h3>Peças utilizadas</h3><p>O consumo reduz estoque e alimenta o custo real da OS.</p></div></div><div id="order-parts-list" class="order-parts-list"></div><div class="order-parts-add"><div class="field"><label>Peça</label><select id="order-part-select" class="input"></select></div><div class="field"><label>Qtd.</label><input id="order-part-quantity" class="input" type="number" min="0.001" step="0.001" value="1"></div><div class="field"><label>Custo unit.</label><input id="order-part-cost" class="input" type="number" min="0" step="0.01"></div><div class="field"><label>Venda unit.</label><input id="order-part-sale" class="input" type="number" min="0" step="0.01"></div><button id="order-part-add" class="btn btn-light" type="button">Adicionar peça</button></div><p class="order-parts-note" id="order-parts-note">Em uma OS nova, as peças ficam preparadas e são baixadas assim que a OS é salva.</p>`;
  const anchor = $('#order-internal-note')?.closest('.field') || form.querySelector('.media-row') || form.querySelector('.form-actions');
  form.insertBefore(section, anchor || null);
  $('#order-part-select')?.addEventListener('change', fillOrderPartDefaults);
  $('#order-part-add')?.addEventListener('click', addOrderPart);
  const partsCost = $('#order-parts-cost');
  if (partsCost) {
    partsCost.readOnly = true;
    const label = partsCost.closest('.field')?.querySelector('label');
    if (label) label.textContent = 'Custo real das peças (calculado pelo estoque)';
  }
  renderOrderParts();
}

function refreshOrderPartOptions() {
  const select = $('#order-part-select');
  if (!select) return;
  const current = select.value;
  select.innerHTML = `<option value="">Selecione</option>${state.parts.map((part) => `<option value="${part.id}">${esc(part.name)} · saldo ${stockQty(part)}</option>`).join('')}`;
  if (state.parts.some((part) => part.id === current)) select.value = current;
  fillOrderPartDefaults();
}

function fillOrderPartDefaults() {
  const part = partById($('#order-part-select')?.value);
  if (!part) return;
  $('#order-part-cost').value = partUnitCost(part) || '';
  $('#order-part-sale').value = Number(part.sale_price || 0) || '';
}

function orderPartName(item) { return partById(item.part_id)?.name || item.name || 'Peça'; }
function orderPartsCostTotal() { return [...state.orderItems, ...state.draftOrderItems].reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_cost || 0), 0); }

function renderOrderParts() {
  const list = $('#order-parts-list');
  if (!list) return;
  const rows = [
    ...state.orderItems.map((item) => ({ ...item, persisted:true })),
    ...state.draftOrderItems.map((item) => ({ ...item, persisted:false }))
  ];
  list.innerHTML = rows.length ? rows.map((item) => `<div class="order-part-row ${item.persisted ? '' : 'order-part-pending'}"><div><b>${esc(orderPartName(item))}</b><span>${item.persisted ? 'Registrada no estoque' : 'Será baixada ao salvar a OS'}</span></div><span>${Number(item.quantity || 0)}</span><span>${money(Number(item.quantity || 0) * Number(item.unit_cost || 0))}</span><button class="mini-button" type="button" ${item.persisted ? `data-remove-order-part="${item.id}"` : `data-remove-draft-part="${item.draft_id}"`}>Remover</button></div>`).join('') : '<div class="inventory-empty">Nenhuma peça utilizada nesta OS.</div>';
  $$('[data-remove-order-part]').forEach((button) => button.addEventListener('click', () => removePersistedOrderPart(button.dataset.removeOrderPart)));
  $$('[data-remove-draft-part]').forEach((button) => button.addEventListener('click', () => { state.draftOrderItems = state.draftOrderItems.filter((item) => item.draft_id !== button.dataset.removeDraftPart); syncOrderPartsCost(); renderOrderParts(); }));
  syncOrderPartsCost();
}

function syncOrderPartsCost() {
  const total = orderPartsCostTotal();
  const input = $('#order-parts-cost');
  if (input) {
    input.value = total ? total.toFixed(2) : '';
    input.dispatchEvent(new Event('input', { bubbles:true }));
  }
}

async function addOrderPart() {
  const part = partById($('#order-part-select')?.value);
  const quantity = Number($('#order-part-quantity')?.value) || 0;
  const unitCost = Number($('#order-part-cost')?.value) || 0;
  const unitSale = Number($('#order-part-sale')?.value) || 0;
  if (!part || quantity <= 0) return notify('Selecione uma peça e uma quantidade válida.', 'error');
  const pendingSamePart = state.draftOrderItems.filter((item) => item.part_id === part.id).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  if (stockQty(part) < quantity + pendingSamePart) return notify('O saldo disponível não cobre essa quantidade.', 'error');
  const orderId = $('#order-id')?.value || state.currentOrderId || null;
  if (!orderId) {
    state.draftOrderItems.push({ draft_id:crypto.randomUUID?.() || String(Date.now()), part_id:part.id, name:part.name, quantity, unit_cost:unitCost, unit_sale_price:unitSale });
    renderOrderParts();
    return notify('Peça preparada. A baixa será feita ao salvar a OS.');
  }
  const ok = await consumePart(orderId, { part_id:part.id, quantity, unit_cost:unitCost, unit_sale_price:unitSale });
  if (ok) {
    await loadOrderItems(orderId);
    await load();
    renderOrderParts();
    notify('Peça registrada na OS e baixada do estoque.');
  }
}

async function consumePart(orderId, item) {
  const s = await client();
  const { error } = await s.rpc('consume_part_for_service', { p_service_order_id:orderId, p_part_id:item.part_id, p_quantity:Number(item.quantity), p_unit_cost:Number(item.unit_cost || 0), p_unit_sale_price:Number(item.unit_sale_price || 0), p_note:item.note || null });
  if (error) {
    notify(error.message?.includes('Estoque insuficiente') ? `Estoque insuficiente para ${orderPartName(item)}.` : `Não foi possível registrar ${orderPartName(item)} na OS.`, 'error');
    return false;
  }
  return true;
}

async function removePersistedOrderPart(itemId) {
  const s = await client();
  const { data, error } = await s.rpc('remove_service_order_part', { p_item_id:itemId });
  if (error || data === false) return notify('Não foi possível estornar a peça da OS.', 'error');
  const orderId = $('#order-id')?.value || state.currentOrderId;
  if (orderId) await loadOrderItems(orderId);
  await load();
  renderOrderParts();
  notify('Peça estornada e devolvida ao estoque.');
}

async function loadOrderItems(orderId) {
  state.currentOrderId = orderId || null;
  state.draftOrderItems = [];
  if (!orderId) {
    state.orderItems = [];
    renderOrderParts();
    return;
  }
  const s = await client();
  const { data, error } = await s.from('service_order_parts').select('*').eq('service_order_id', orderId).order('created_at');
  state.orderItems = error ? [] : data || [];
  renderOrderParts();
}

function resetOrderParts() {
  state.currentOrderId = null;
  state.orderItems = [];
  state.draftOrderItems = [];
  renderOrderParts();
}

async function persistDraftOrderParts() {
  if (!state.draftOrderItems.length) return;
  let orderId = $('#order-id')?.value || null;
  for (let attempt=0; attempt<15 && !orderId; attempt+=1) {
    await new Promise((resolve) => setTimeout(resolve, 220));
    orderId = $('#order-id')?.value || null;
  }
  if (!orderId) return notify('A OS foi salva sem baixar as peças preparadas. Abra a OS e tente novamente.', 'error');
  await new Promise((resolve) => setTimeout(resolve, 650));
  const pending = [...state.draftOrderItems];
  const failed = [];
  for (const item of pending) {
    const ok = await consumePart(orderId, item);
    if (!ok) failed.push(item);
  }
  state.draftOrderItems = failed;
  await loadOrderItems(orderId);
  await load();
  renderOrderParts();
  if (!failed.length) notify('OS salva e peças baixadas do estoque.');
}

function bindOrderIntegration() {
  document.addEventListener('click', (event) => {
    if (event.target.closest('#new-order')) setTimeout(resetOrderParts, 0);
    const edit = event.target.closest('[data-edit-order]');
    if (edit) setTimeout(() => loadOrderItems(edit.dataset.editOrder), 20);
  });
  const form = $('#order-form');
  if (form && !form.dataset.inventoryBound) {
    form.dataset.inventoryBound = '1';
    form.addEventListener('submit', () => { if (state.draftOrderItems.length) persistDraftOrderParts(); });
  }
}

async function boot() {
  if (!(await schemaReady())) return;
  injectStyles();
  injectUi();
  injectOrderPartsUi();
  await load();
  bindOrderIntegration();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
else boot();
