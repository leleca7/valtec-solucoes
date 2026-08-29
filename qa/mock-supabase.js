const now = new Date();
const iso = (offsetMs = 0) => new Date(now.getTime() + offsetMs).toISOString();
const date = (offsetDays = 0) => new Date(now.getTime() + offsetDays * 86400000).toISOString().slice(0, 10);

const fixtures = {
  admin_profiles: [
    { user_id: 'qa-admin', display_name: 'QA Admin', email: 'qa@valtec.local', role: 'marketing_admin', active: true }
  ],
  clients: [
    { id: 'qa-client', name: 'Cliente QA', phone: '71999990000', email: 'cliente@qa.local', neighborhood: 'Pituba', address: 'Salvador', equipment_notes: 'Fogão residencial', notes: 'Registro de teste' }
  ],
  leads: [
    { id: 'qa-lead', customer_name: 'Lead QA', phone: '71999990001', neighborhood: 'Pituba', equipment: 'Fogão', problems: ['Forno não acende'], description: 'Teste de fluxo', source: 'site', status: 'novo', urgency: 'normal', next_action: 'Retornar contato', next_action_at: iso(3600000), created_at: iso(-3600000), updated_at: iso() }
  ],
  quotes: [
    { id: 'qa-quote', client_id: 'qa-client', quote_number: 'ORC-QA-001', status: 'aprovado', parts_amount: 40, labor_amount: 100, total_amount: 140, created_at: iso(-7200000), updated_at: iso(), quote_items: [] }
  ],
  quote_items: [],
  service_orders: [
    { id: 'qa-order', client_id: 'qa-client', order_number: 'OS-QA-001', equipment: 'Fogão residencial', problem: 'Chama baixa', status: 'agendado', scheduled_for: iso(7200000), technician_id: 'qa-tech', assigned_technician: 'Técnico QA', parts_amount: 40, labor_amount: 100, total_amount: 140, parts_cost: 20, consumables_cost: 5, travel_cost: 10, payment_fee: 0, warranty_rework_cost: 0, other_variable_cost: 0, amount_received: 0, technician_minutes: 60, founder_executed: false, payment_status: 'pendente', created_at: iso(-86400000), updated_at: iso() }
  ],
  receipts: [],
  warranties: [],
  parts_catalog: [
    { id: 'qa-part', name: 'Bico injetor QA', category: 'Queimadores', brand: 'QA', code: 'QA-001', purchase_price: 10, sale_price: 25, stock_qty: 5, min_stock: 2, active: true, storage_location: 'A1', preferred_supplier_id: 'qa-supplier', updated_at: iso() }
  ],
  suppliers: [
    { id: 'qa-supplier', name: 'Fornecedor QA', phone: '71999990002', email: 'fornecedor@qa.local', active: true, created_at: iso(), updated_at: iso() }
  ],
  inventory_movements: [],
  service_order_parts: [],
  image_assets: [],
  expenses: [],
  analytics_events: [],
  admin_audit_log: [
    { id: 1, action: 'update', entity_type: 'lead', entity_id: 'qa-lead', actor_user_id: 'qa-admin', created_at: iso(-1800000), changes: { status: { old: 'triagem', new: 'novo' } } }
  ],
  site_settings: [],
  business_accounts: [
    { id: 'qa-business', name: 'Restaurante QA', segment: 'Restaurante', contact_name: 'Contato QA', phone: '71999990003', email: 'empresa@qa.local', neighborhood: 'Pituba', address: 'Salvador', status: 'ativo', contract_status: 'ativo', monthly_value: 500, preventive_frequency_days: 90, next_action: 'Confirmar preventiva', next_action_at: iso(86400000), next_visit_at: iso(7 * 86400000), created_at: iso(-30 * 86400000), updated_at: iso() }
  ],
  business_assets: [
    { id: 'qa-asset', business_id: 'qa-business', equipment_type: 'Fogão industrial', brand: 'QA', model: 'Industrial 6B', quantity: 1, condition: 'Operacional', next_preventive_at: date(7), created_at: iso() }
  ],
  technicians: [
    { id: 'qa-tech', name: 'Técnico QA', phone: '71999990004', email: 'tecnico@qa.local', neighborhood: 'Pituba', status: 'ativo', active: true, career_level: 'tecnico', autonomy_level: 'autonomo', can_work_solo: true, route_ready: true, start_date: date(-60), created_at: iso(), updated_at: iso() }
  ],
  technician_skills: []
};

function compareValue(left, right) {
  if (left == null) return -1;
  if (right == null) return 1;
  return String(left).localeCompare(String(right));
}

class Query {
  constructor(table) {
    this.table = table;
    this.rows = structuredClone(fixtures[table] || []);
    this.mode = 'select';
    this.payload = null;
  }

  select() { return this; }
  insert(payload) { this.mode = 'insert'; this.payload = Array.isArray(payload) ? payload : [payload]; return this; }
  upsert(payload) { this.mode = 'insert'; this.payload = Array.isArray(payload) ? payload : [payload]; return this; }
  update(payload) { this.mode = 'update'; this.payload = payload || {}; return this; }
  delete() { this.mode = 'delete'; return this; }

  eq(column, value) { this.rows = this.rows.filter((row) => row?.[column] === value); return this; }
  neq(column, value) { this.rows = this.rows.filter((row) => row?.[column] !== value); return this; }
  gt(column, value) { this.rows = this.rows.filter((row) => row?.[column] > value); return this; }
  gte(column, value) { this.rows = this.rows.filter((row) => row?.[column] >= value); return this; }
  lt(column, value) { this.rows = this.rows.filter((row) => row?.[column] < value); return this; }
  lte(column, value) { this.rows = this.rows.filter((row) => row?.[column] <= value); return this; }
  in(column, values = []) { this.rows = this.rows.filter((row) => values.includes(row?.[column])); return this; }
  is(column, value) { this.rows = this.rows.filter((row) => row?.[column] === value); return this; }
  match(values = {}) { this.rows = this.rows.filter((row) => Object.entries(values).every(([key, value]) => row?.[key] === value)); return this; }
  contains() { return this; }
  not() { return this; }
  or() { return this; }
  ilike(column, pattern = '') {
    const needle = String(pattern).replaceAll('%', '').toLowerCase();
    this.rows = this.rows.filter((row) => String(row?.[column] || '').toLowerCase().includes(needle));
    return this;
  }
  order(column, { ascending = true } = {}) { this.rows.sort((a, b) => compareValue(a?.[column], b?.[column]) * (ascending ? 1 : -1)); return this; }
  limit(value) { this.rows = this.rows.slice(0, Number(value) || this.rows.length); return this; }
  range(from, to) { this.rows = this.rows.slice(from, Number(to) + 1); return this; }

  resultRows() {
    if (this.mode === 'insert') {
      return (this.payload || []).map((row, index) => ({ id: row.id || `qa-${this.table}-${index + 1}`, created_at: row.created_at || iso(), updated_at: row.updated_at || iso(), ...row }));
    }
    if (this.mode === 'update') return this.rows.map((row) => ({ ...row, ...this.payload, updated_at: iso() }));
    if (this.mode === 'delete') return [];
    return this.rows;
  }

  maybeSingle() { return Promise.resolve({ data: this.resultRows()[0] || null, error: null }); }
  single() { return Promise.resolve({ data: this.resultRows()[0] || null, error: null }); }
  then(resolve, reject) { return Promise.resolve({ data: this.resultRows(), error: null, count: this.resultRows().length }).then(resolve, reject); }
}

const mockClient = {
  auth: {
    getSession: async () => ({ data: { session: { access_token: 'qa-token', user: { id: 'qa-admin', email: 'qa@valtec.local' } } }, error: null }),
    getUser: async () => ({ data: { user: { id: 'qa-admin', email: 'qa@valtec.local' } }, error: null }),
    signInWithPassword: async () => ({ data: { user: { id: 'qa-admin' }, session: { access_token: 'qa-token' } }, error: null }),
    signInWithOtp: async () => ({ data: {}, error: null }),
    resetPasswordForEmail: async () => ({ data: {}, error: null }),
    updateUser: async () => ({ data: { user: { id: 'qa-admin' } }, error: null }),
    signOut: async () => ({ error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
  },
  from: (table) => new Query(table),
  rpc: async () => ({ data: { ok: true, stock_qty: 4 }, error: null }),
  storage: {
    from: () => ({
      upload: async () => ({ data: { path: 'qa/mock.png' }, error: null }),
      remove: async () => ({ data: [], error: null }),
      getPublicUrl: () => ({ data: { publicUrl: 'https://example.invalid/qa/mock.png' } })
    })
  }
};

export function getConfig() { return { SUPABASE_URL: 'https://qa.local', SUPABASE_PUBLISHABLE_KEY: 'qa-public-key' }; }
export function isSupabaseConfigured() { return true; }
export async function getSupabase() { return mockClient; }
export async function trackEvent() {}
export function normalizeText(value = '') { return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase(); }
