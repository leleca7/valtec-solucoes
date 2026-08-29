import { getSupabase, isSupabaseConfigured } from './supabase.js';

const $ = (selector, root = document) => root.querySelector(selector);
const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
const toInputDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const FIELDS = [
  'equipment_brand', 'equipment_model', 'assigned_technician', 'service_type', 'priority', 'started_at',
  'parts_cost', 'travel_cost', 'other_variable_cost', 'amount_received', 'payment_received_at',
  'pending_reason', 'return_required', 'return_scheduled_for', 'founder_executed', 'completion_notes'
];

const state = {
  supabase: null,
  schemaReady: null,
  currentOrderId: null,
  current: null
};

async function client() {
  if (state.supabase) return state.supabase;
  if (!isSupabaseConfigured()) return null;
  state.supabase = await getSupabase();
  return state.supabase;
}

function injectStyles() {
  if ($('#valtec-order-operations-css')) return;
  const link = document.createElement('link');
  link.id = 'valtec-order-operations-css';
  link.rel = 'stylesheet';
  link.href = 'orders-operations.css?v=20260828-1';
  document.head.appendChild(link);
}

function injectUi() {
  const form = $('#order-form');
  if (!form || $('#order-ops-section')) return;
  const section = document.createElement('section');
  section.id = 'order-ops-section';
  section.className = 'order-ops-section hidden';
  section.dataset.schemaReady = 'false';
  section.innerHTML = `
    <div class="order-ops-head">
      <div>
        <span class="kicker">Operação</span>
        <h3>Responsabilidade, custo e retorno</h3>
        <p>Dados necessários para delegar o serviço e medir resultado por atendimento.</p>
      </div>
    </div>
    <div class="order-ops-unavailable">A estrutura operacional desta OS ainda não foi liberada no banco deste ambiente.</div>
    <div class="order-ops-fields">
      <div class="order-ops-grid">
        <div class="field"><label>Responsável pela execução</label><input id="order-technician" class="input" list="order-technician-suggestions" placeholder="Nome do técnico"><datalist id="order-technician-suggestions"></datalist></div>
        <div class="field"><label>Prioridade</label><select id="order-ops-priority" class="input"><option value="baixa">Baixa</option><option value="normal">Normal</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select></div>
        <div class="field"><label>Tipo de serviço</label><select id="order-service-type" class="input"><option value="corretiva">Manutenção corretiva</option><option value="preventiva">Manutenção preventiva</option><option value="instalacao">Instalação</option><option value="diagnostico">Diagnóstico</option><option value="garantia">Retorno de garantia</option></select></div>
        <div class="field"><label>Execução física pelo fundador</label><select id="order-founder-executed" class="input"><option value="">Não informado</option><option value="false">Não</option><option value="true">Sim</option></select></div>
        <div class="field"><label>Marca do equipamento</label><input id="order-equipment-brand" class="input"></div>
        <div class="field"><label>Modelo do equipamento</label><input id="order-equipment-model" class="input"></div>
        <div class="field"><label>Custo real das peças</label><input id="order-parts-cost" class="input" type="number" min="0" step="0.01"></div>
        <div class="field"><label>Custo de deslocamento</label><input id="order-travel-cost" class="input" type="number" min="0" step="0.01"></div>
        <div class="field"><label>Outros custos variáveis</label><input id="order-other-cost" class="input" type="number" min="0" step="0.01"></div>
        <div class="field"><label>Valor efetivamente recebido</label><input id="order-amount-received" class="input" type="number" min="0" step="0.01"></div>
      </div>
      <div class="order-ops-summary">
        <div><small>Valor da OS</small><strong id="order-ops-sale">R$ 0,00</strong></div>
        <div><small>Custo variável</small><strong id="order-ops-cost">R$ 0,00</strong></div>
        <div><small>Margem da OS</small><strong id="order-ops-margin">R$ 0,00</strong></div>
      </div>
      <p class="order-ops-note">A margem considera o valor da OS menos custo real de peças, deslocamento e outros custos variáveis. Despesas fixas são analisadas separadamente.</p>
      <label class="order-ops-checkline"><input id="order-return-required" type="checkbox"><span>Este atendimento exige retorno técnico</span></label>
      <div class="field" id="order-return-date-field"><label>Data prevista do retorno</label><input id="order-return-date" class="input" type="datetime-local"></div>
      <div class="field"><label>Pendência / motivo do retorno</label><textarea id="order-pending-reason" placeholder="O que impede o encerramento normal ou precisa ser resolvido no retorno."></textarea></div>
      <div class="field"><label>Observação de conclusão</label><textarea id="order-completion-notes" placeholder="Registro final útil para histórico, garantia e futura execução por outro técnico."></textarea></div>
    </div>`;

  const anchor = $('#order-internal-note')?.closest('.field') || form.querySelector('.media-row') || form.querySelector('.form-actions');
  form.insertBefore(section, anchor || null);

  section.querySelectorAll('input,select,textarea').forEach((element) => element.addEventListener('input', calculate));
  $('#order-return-required')?.addEventListener('change', toggleReturnDate);
  $('#order-parts')?.addEventListener('input', calculate);
  $('#order-labor')?.addEventListener('input', calculate);
}

async function checkSchema() {
  if (state.schemaReady !== null) return state.schemaReady;
  try {
    const s = await client();
    if (!s) return false;
    const { data: sessionData } = await s.auth.getSession();
    if (!sessionData?.session) return false;
    const { error } = await s.from('service_orders').select(`id,${FIELDS.join(',')}`).limit(1);
    state.schemaReady = !error;
    return state.schemaReady;
  } catch {
    state.schemaReady = false;
    return false;
  }
}

async function prepareUi() {
  injectStyles();
  injectUi();
  const ready = await checkSchema();
  const section = $('#order-ops-section');
  if (!section) return;
  section.dataset.schemaReady = String(ready);
  section.classList.toggle('hidden', !ready);
  if (ready) await loadTechnicianSuggestions();
}

async function loadTechnicianSuggestions() {
  const list = $('#order-technician-suggestions');
  if (!list) return;
  try {
    const s = await client();
    const { data, error } = await s.from('admin_profiles').select('display_name,active').eq('active', true).order('display_name');
    if (error) return;
    list.innerHTML = (data || []).filter((row) => row.display_name).map((row) => `<option value="${String(row.display_name).replace(/"/g, '&quot;')}"></option>`).join('');
  } catch {}
}

function resetFields() {
  state.currentOrderId = null;
  state.current = null;
  $('#order-technician').value = '';
  $('#order-ops-priority').value = 'normal';
  $('#order-service-type').value = 'corretiva';
  $('#order-founder-executed').value = '';
  $('#order-equipment-brand').value = '';
  $('#order-equipment-model').value = '';
  $('#order-parts-cost').value = '';
  $('#order-travel-cost').value = '';
  $('#order-other-cost').value = '';
  $('#order-amount-received').value = '';
  $('#order-return-required').checked = false;
  $('#order-return-date').value = '';
  $('#order-pending-reason').value = '';
  $('#order-completion-notes').value = '';
  toggleReturnDate();
  calculate();
}

async function loadOrderFields(orderId) {
  if (!(await checkSchema()) || !orderId) return;
  try {
    const s = await client();
    const { data, error } = await s.from('service_orders').select(`id,${FIELDS.join(',')}`).eq('id', orderId).maybeSingle();
    if (error || !data) return;
    state.currentOrderId = orderId;
    state.current = data;
    $('#order-technician').value = data.assigned_technician || '';
    $('#order-ops-priority').value = data.priority || 'normal';
    $('#order-service-type').value = data.service_type || 'corretiva';
    $('#order-founder-executed').value = data.founder_executed === null || data.founder_executed === undefined ? '' : String(data.founder_executed);
    $('#order-equipment-brand').value = data.equipment_brand || '';
    $('#order-equipment-model').value = data.equipment_model || '';
    $('#order-parts-cost').value = data.parts_cost || '';
    $('#order-travel-cost').value = data.travel_cost || '';
    $('#order-other-cost').value = data.other_variable_cost || '';
    $('#order-amount-received').value = data.amount_received || '';
    $('#order-return-required').checked = Boolean(data.return_required);
    $('#order-return-date').value = toInputDateTime(data.return_scheduled_for);
    $('#order-pending-reason').value = data.pending_reason || '';
    $('#order-completion-notes').value = data.completion_notes || '';
    toggleReturnDate();
    calculate();
  } catch {}
}

function toggleReturnDate() {
  const required = $('#order-return-required')?.checked;
  const input = $('#order-return-date');
  if (input) input.disabled = !required;
  const field = $('#order-return-date-field');
  if (field) field.style.opacity = required ? '1' : '.55';
}

function numberValue(selector) {
  return Number($(selector)?.value) || 0;
}

function calculate() {
  const sale = numberValue('#order-parts') + numberValue('#order-labor');
  const cost = numberValue('#order-parts-cost') + numberValue('#order-travel-cost') + numberValue('#order-other-cost');
  if ($('#order-ops-sale')) $('#order-ops-sale').textContent = money(sale);
  if ($('#order-ops-cost')) $('#order-ops-cost').textContent = money(cost);
  if ($('#order-ops-margin')) $('#order-ops-margin').textContent = money(sale - cost);
}

function snapshot() {
  const founder = $('#order-founder-executed')?.value || '';
  const returnRequired = Boolean($('#order-return-required')?.checked);
  return {
    assigned_technician: $('#order-technician')?.value.trim() || null,
    priority: $('#order-ops-priority')?.value || 'normal',
    service_type: $('#order-service-type')?.value || 'corretiva',
    founder_executed: founder === '' ? null : founder === 'true',
    equipment_brand: $('#order-equipment-brand')?.value.trim() || null,
    equipment_model: $('#order-equipment-model')?.value.trim() || null,
    parts_cost: numberValue('#order-parts-cost'),
    travel_cost: numberValue('#order-travel-cost'),
    other_variable_cost: numberValue('#order-other-cost'),
    amount_received: numberValue('#order-amount-received'),
    return_required: returnRequired,
    return_scheduled_for: returnRequired && $('#order-return-date')?.value ? new Date($('#order-return-date').value).toISOString() : null,
    pending_reason: $('#order-pending-reason')?.value.trim() || null,
    completion_notes: $('#order-completion-notes')?.value.trim() || null
  };
}

async function persistAfterBaseSave(payload, originalId) {
  if (!(await checkSchema())) return;
  let orderId = originalId;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 180));
    orderId = orderId || $('#order-id')?.value || null;
    const message = $('#central-message')?.textContent || '';
    if (/não foi possível salvar a os/i.test(message)) return;
    if (orderId) break;
  }
  if (!orderId) return;

  const status = $('#order-status')?.value || '';
  const now = new Date().toISOString();
  const update = { ...payload, updated_at: now };
  if (!state.current?.started_at && ['em_andamento', 'em_execucao', 'concluido'].includes(status)) update.started_at = now;
  if (payload.amount_received > 0 && !state.current?.payment_received_at) update.payment_received_at = now;
  if (payload.amount_received <= 0) update.payment_received_at = null;

  try {
    const s = await client();
    const { error } = await s.from('service_orders').update(update).eq('id', orderId);
    if (!error) {
      state.currentOrderId = orderId;
      state.current = { ...(state.current || {}), ...update };
    }
  } catch {}
}

function bind() {
  document.addEventListener('click', (event) => {
    const newOrder = event.target.closest('#new-order');
    if (newOrder) setTimeout(resetFields, 0);
    const edit = event.target.closest('[data-edit-order]');
    if (edit) setTimeout(() => loadOrderFields(edit.dataset.editOrder), 0);
  });

  const form = $('#order-form');
  if (form && !form.dataset.opsBound) {
    form.dataset.opsBound = '1';
    form.addEventListener('submit', () => {
      if (state.schemaReady !== true) return;
      const payload = snapshot();
      const originalId = $('#order-id')?.value || null;
      persistAfterBaseSave(payload, originalId);
    });
  }
}

async function boot() {
  await prepareUi();
  bind();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
