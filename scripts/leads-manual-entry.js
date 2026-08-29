import { getSupabase, isSupabaseConfigured } from './supabase.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '"':'&quot;' }[c]));

let supabase = null;

async function client() {
  if (supabase) return supabase;
  if (!isSupabaseConfigured()) return null;
  supabase = await getSupabase();
  return supabase;
}

function injectStyles() {
  if ($('#valtec-lead-manual-css')) return;
  const link = document.createElement('link');
  link.id = 'valtec-lead-manual-css';
  link.rel = 'stylesheet';
  link.href = 'leads-manual.css?v=20260828-1';
  document.head.appendChild(link);
}

function injectUi() {
  const header = $('.lead-header');
  if (!header || $('#lead-new-manual')) return;
  const actions = header.querySelector('.lead-header-actions') || document.createElement('div');
  if (!actions.classList.contains('lead-header-actions')) {
    actions.className = 'lead-header-actions';
    const refresh = $('#lead-refresh');
    if (refresh) actions.appendChild(refresh);
    header.appendChild(actions);
  }
  const button = document.createElement('button');
  button.id = 'lead-new-manual';
  button.className = 'btn btn-primary';
  button.type = 'button';
  button.textContent = '+ Novo lead';
  actions.prepend(button);
  button.addEventListener('click', openModal);
}

function ensureModal() {
  let modal = $('#lead-manual-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'lead-manual-modal';
  modal.className = 'lead-modal hidden';
  modal.innerHTML = `
    <div class="lead-modal-backdrop" data-close-lead-modal></div>
    <section class="lead-modal-card" role="dialog" aria-modal="true" aria-labelledby="lead-manual-title">
      <div class="lead-modal-head">
        <div><span class="kicker">Entrada manual</span><h2 id="lead-manual-title">Novo lead</h2><p>Use para WhatsApp, ligação, indicação, Google, Instagram ou prospecção.</p></div>
        <button type="button" class="lead-modal-x" data-close-lead-modal>×</button>
      </div>
      <div id="lead-manual-message" class="lead-manual-message hidden"></div>
      <form id="lead-manual-form">
        <div class="choice-grid">
          <div class="field"><label>Nome / empresa</label><input id="lead-manual-name" class="input" required autocomplete="name"></div>
          <div class="field"><label>WhatsApp / telefone</label><input id="lead-manual-phone" class="input" required inputmode="tel" autocomplete="tel"></div>
        </div>
        <div class="choice-grid">
          <div class="field"><label>Bairro</label><input id="lead-manual-neighborhood" class="input" required autocomplete="address-level3"></div>
          <div class="field"><label>Origem</label><select id="lead-manual-source" class="input"><option value="whatsapp">WhatsApp</option><option value="telefone">Ligação</option><option value="indicacao">Indicação</option><option value="google">Google</option><option value="instagram">Instagram</option><option value="b2b">Prospecção B2B</option><option value="outro">Outro</option></select></div>
        </div>
        <div class="choice-grid">
          <div class="field"><label>Equipamento</label><input id="lead-manual-equipment" class="input" required placeholder="Ex.: Fogão residencial"></div>
          <div class="field"><label>Urgência</label><select id="lead-manual-urgency" class="input"><option value="normal">Normal</option><option value="alta">Alta</option><option value="baixa">Baixa</option></select></div>
        </div>
        <div class="field"><label>Problema principal</label><input id="lead-manual-problem" class="input" placeholder="Ex.: forno não acende"></div>
        <div class="field"><label>Descrição</label><textarea id="lead-manual-description" placeholder="Anote o que o cliente explicou e informações úteis para a triagem."></textarea></div>
        <label class="lead-contacted-check"><input id="lead-manual-contacted" type="checkbox"> <span>O cliente já recebeu a primeira resposta</span></label>
        <div class="lead-modal-actions"><button type="button" class="btn btn-light" data-close-lead-modal>Cancelar</button><button type="submit" class="btn btn-primary" id="lead-manual-save">Salvar lead</button></div>
      </form>
    </section>`;
  document.body.appendChild(modal);
  modal.querySelectorAll('[data-close-lead-modal]').forEach((el) => el.addEventListener('click', closeModal));
  $('#lead-manual-form')?.addEventListener('submit', saveManualLead);
  return modal;
}

function openModal() {
  const modal = ensureModal();
  $('#lead-manual-form')?.reset();
  $('#lead-manual-source').value = 'whatsapp';
  $('#lead-manual-urgency').value = 'normal';
  message('', '');
  modal.classList.remove('hidden');
  setTimeout(() => $('#lead-manual-name')?.focus(), 20);
}

function closeModal() { $('#lead-manual-modal')?.classList.add('hidden'); }

function message(text, type='error') {
  const box = $('#lead-manual-message');
  if (!box) return;
  if (!text) { box.className = 'lead-manual-message hidden'; box.textContent = ''; return; }
  box.textContent = text;
  box.className = `lead-manual-message ${type}`;
}

async function saveManualLead(event) {
  event.preventDefault();
  const save = $('#lead-manual-save');
  if (save) { save.disabled = true; save.textContent = 'Salvando...'; }
  try {
    const s = await client();
    if (!s) throw new Error('Supabase não configurado neste ambiente.');
    const name = $('#lead-manual-name').value.trim();
    const phone = $('#lead-manual-phone').value.trim();
    const neighborhood = $('#lead-manual-neighborhood').value.trim();
    const equipment = $('#lead-manual-equipment').value.trim();
    const problem = $('#lead-manual-problem').value.trim();
    const alreadyContacted = $('#lead-manual-contacted').checked;
    if (!name || !phone || !neighborhood || !equipment) throw new Error('Preencha nome, telefone, bairro e equipamento.');

    const { data: duplicates, error: duplicateError } = await s.from('leads')
      .select('id,customer_name,status,created_at')
      .eq('phone', phone)
      .in('status', ['novo','triagem','contatado','contato_realizado','orcamento_preparacao','orcamento_enviado','aguardando_cliente','agendado','em_atendimento'])
      .order('created_at', { ascending:false })
      .limit(1);
    if (duplicateError) throw duplicateError;
    if (duplicates?.length) throw new Error(`Já existe um lead ativo para este telefone (${duplicates[0].customer_name || 'cliente'}). Abra o lead existente antes de criar outro.`);

    const now = new Date().toISOString();
    const payload = {
      customer_name: name,
      phone,
      neighborhood,
      equipment,
      problems: problem ? [problem] : [],
      description: $('#lead-manual-description').value.trim() || null,
      source: $('#lead-manual-source').value,
      urgency: $('#lead-manual-urgency').value,
      status: alreadyContacted ? 'contato_realizado' : 'novo',
      contacted_at: alreadyContacted ? now : null,
      next_action: alreadyContacted ? 'Definir orçamento ou agendamento' : 'Fazer primeira triagem por WhatsApp',
      next_action_at: null
    };
    const { data, error } = await s.from('leads').insert(payload).select('id').single();
    if (error) throw error;
    message('Lead salvo. Abrindo na fila...', 'success');
    setTimeout(() => {
      closeModal();
      $('#lead-status-filter') && ($('#lead-status-filter').value = 'ativos');
      $('#lead-refresh')?.click();
    }, 500);
    return data;
  } catch (error) {
    console.error('Novo lead Valtec:', error);
    message(error?.message || 'Não foi possível salvar o lead.');
  } finally {
    if (save) { save.disabled = false; save.textContent = 'Salvar lead'; }
  }
}

function boot() {
  injectStyles();
  injectUi();
  ensureModal();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
else boot();