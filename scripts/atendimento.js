import { getConfig, getSupabase, isSupabaseConfigured, trackEvent } from './supabase.js';

trackEvent('page_view');

const steps = [...document.querySelectorAll('.form-step')];
const progress = [...document.querySelectorAll('.progress span')];
const form = document.querySelector('#service-form');
const previousButton = document.querySelector('#previous-step');
const nextButton = document.querySelector('#next-step');
const submitButton = document.querySelector('#submit-service');
const messageBox = document.querySelector('#form-message');
let currentStep = 0;

const params = new URLSearchParams(location.search);
const bairroParam = params.get('bairro');
if (bairroParam) document.querySelector('#service-bairro').value = bairroParam;

function showStep(index) {
  currentStep = index;
  steps.forEach((step, i) => step.classList.toggle('active', i === index));
  progress.forEach((bar, i) => bar.classList.toggle('active', i <= index));
  previousButton.classList.toggle('hidden', index === 0);
  nextButton.classList.toggle('hidden', index === steps.length - 1);
  submitButton.classList.toggle('hidden', index !== steps.length - 1);
  if (index === steps.length - 1) updateSummary();
}

function checkedValue(name) {
  return form.querySelector(`input[name="${name}"]:checked`)?.value || '';
}
function checkedValues(name) {
  return [...form.querySelectorAll(`input[name="${name}"]:checked`)].map(el => el.value);
}
function value(id) { return document.querySelector(id)?.value.trim() || ''; }

function validateStep() {
  messageBox.className = 'notice hidden';
  if (currentStep === 0 && !checkedValue('equipment')) return showError('Escolha o equipamento para continuar.');
  if (currentStep === 1 && checkedValues('problem').length === 0) return showError('Marque pelo menos um problema.');
  if (currentStep === 2 && (!value('#service-name') || !value('#service-phone') || !value('#service-bairro'))) return showError('Preencha nome, telefone e bairro.');
  return true;
}

function showError(text) {
  messageBox.textContent = text;
  messageBox.className = 'notice error';
  return false;
}

nextButton.addEventListener('click', () => {
  if (!validateStep()) return;
  showStep(Math.min(currentStep + 1, steps.length - 1));
});
previousButton.addEventListener('click', () => showStep(Math.max(currentStep - 1, 0)));

function collectData() {
  return {
    customer_name: value('#service-name'),
    phone: value('#service-phone'),
    equipment: checkedValue('equipment'),
    problems: checkedValues('problem'),
    description: value('#service-description'),
    neighborhood: value('#service-bairro'),
    address: value('#service-address'),
    reference_point: value('#service-reference'),
    media_path: null,
    source: 'site'
  };
}

function updateSummary() {
  const data = collectData();
  const rows = [
    ['Equipamento', data.equipment || '—'],
    ['Problema', data.problems.join(', ') || '—'],
    ['Bairro', data.neighborhood || '—'],
    ['Cliente', data.customer_name || '—'],
    ['Telefone', data.phone || '—']
  ];
  document.querySelector('#service-summary').innerHTML = rows.map(([label, item]) => `<div class="summary-row"><span>${label}</span><strong>${item}</strong></div>`).join('');
}

async function uploadMedia(supabase, phone) {
  const file = document.querySelector('#service-media').files?.[0];
  if (!file) return null;
  const maxBytes = 20 * 1024 * 1024;
  if (file.size > maxBytes) throw new Error('O arquivo ultrapassa 20 MB. Envie a mídia pelo WhatsApp.');
  const safePhone = phone.replace(/\D/g, '').slice(-11) || 'sem-telefone';
  const extension = file.name.split('.').pop()?.toLowerCase() || 'bin';
  const path = `public/${new Date().toISOString().slice(0,10)}/${crypto.randomUUID()}-${safePhone}.${extension}`;
  const { error } = await supabase.storage.from('lead-media').upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  return path;
}

function buildWhatsAppMessage(data) {
  return [
    'Olá, Valtec! Gostaria de solicitar atendimento.',
    '',
    `*Cliente:* ${data.customer_name}`,
    `*Telefone:* ${data.phone}`,
    `*Equipamento:* ${data.equipment}`,
    `*Problema:* ${data.problems.join(', ')}`,
    `*Bairro:* ${data.neighborhood}`,
    data.address ? `*Endereço:* ${data.address}` : null,
    data.reference_point ? `*Referência:* ${data.reference_point}` : null,
    data.description ? `*Descrição:* ${data.description}` : null,
    data.media_path ? '*Foto/vídeo:* enviado pelo site' : '*Foto/vídeo:* não enviado',
    '',
    'Gostaria de saber sobre a disponibilidade de atendimento.'
  ].filter(Boolean).join('\n');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!validateStep()) return;
  submitButton.disabled = true;
  submitButton.textContent = 'Enviando...';
  messageBox.className = 'notice hidden';

  try {
    const data = collectData();
    if (isSupabaseConfigured()) {
      const supabase = await getSupabase();
      data.media_path = await uploadMedia(supabase, data.phone);
      const { error } = await supabase.from('leads').insert(data);
      if (error) throw error;
      await trackEvent('lead_submit', { neighborhood: data.neighborhood, equipment: data.equipment, problem: data.problems[0] });
    }

    const message = buildWhatsAppMessage(data);
    const { WHATSAPP_NUMBER } = getConfig();
    if (WHATSAPP_NUMBER) {
      await trackEvent('whatsapp_click', { neighborhood: data.neighborhood });
      location.href = `https://wa.me/${WHATSAPP_NUMBER.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
    } else {
      await navigator.clipboard.writeText(message).catch(() => {});
      messageBox.innerHTML = `<strong>Solicitação preparada.</strong><br>O número do WhatsApp ainda não foi configurado. A mensagem foi copiada para você.`;
      messageBox.className = 'notice success';
    }
  } catch (error) {
    console.error(error);
    messageBox.textContent = error?.message || 'Não foi possível registrar a solicitação. Tente novamente.';
    messageBox.className = 'notice error';
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Enviar para a Valtec';
  }
});

showStep(0);
