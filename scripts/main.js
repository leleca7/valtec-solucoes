import { getConfig, normalizeText, trackEvent } from './supabase.js';
import './home-social-v3.js';

const primaryAreas = ['boca do rio', 'costa azul', 'imbui', 'stiep', 'pituacu', 'armacao', 'pituba', 'caminho das arvores', 'itaigara', 'piata'];

trackEvent('page_view');

const form = document.querySelector('#area-form');
const input = document.querySelector('#bairro');
const result = document.querySelector('#area-result');

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const raw = input.value;
  const normalized = normalizeText(raw);
  const isPrimary = primaryAreas.includes(normalized);

  result.classList.remove('hidden');
  if (!normalized) {
    result.innerHTML = '<strong>Digite seu bairro para consultar.</strong>';
    return;
  }

  if (isPrimary) {
    result.innerHTML = `<span class="badge green">● Atendemos normalmente</span><p><strong>${raw}</strong> está na nossa área principal de atendimento.</p><a class="btn btn-primary" href="atendimento.html?bairro=${encodeURIComponent(raw)}">Solicitar atendimento</a>`;
  } else {
    result.innerHTML = `<span class="badge orange">● Consulte disponibilidade</span><p>Se você está em Salvador, ainda podemos verificar a rota para <strong>${raw}</strong>.</p><a class="btn btn-light" href="atendimento.html?bairro=${encodeURIComponent(raw)}">Consultar atendimento</a>`;
  }

  await trackEvent('neighborhood_check', { neighborhood: raw, primary: isPrimary });
});

document.querySelectorAll('[data-track]').forEach((element) => {
  element.addEventListener('click', () => trackEvent(element.dataset.track));
});

const phoneLink = document.querySelector('[data-phone-link]');
const { PHONE_NUMBER } = getConfig();
if (phoneLink && PHONE_NUMBER) {
  phoneLink.href = `tel:${PHONE_NUMBER.replace(/[^+\d]/g, '')}`;
  phoneLink.classList.remove('hidden');
}
