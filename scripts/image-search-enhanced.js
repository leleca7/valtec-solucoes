const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  "'": '&#039;',
  '"': '&quot;'
}[char]));

const normalizeText = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

const technicalTerms = [
  [/\b(bico|bicos).*\b(injetor|injetores)\b|\binjetor(?:es)?\b/i, 'gas stove injector nozzle'],
  [/\b(queimador|queimadores|boca|bocas)\b/i, 'gas stove burner'],
  [/\b(torneira|registro|registros|valvula|válvula|valvulas|válvulas)\b/i, 'gas stove gas valve'],
  [/\b(termopar|termopares)\b/i, 'gas stove thermocouple'],
  [/\b(vela|velas|ignicao|ignição|acendedor|acendedores)\b/i, 'gas stove spark igniter'],
  [/\b(manipulo|manípulo|manipulos|manípulos|botao|botão|botoes|botões)\b/i, 'stove control knob'],
  [/\b(espalhador|espalhadores|tampa queimador|tampa do queimador)\b/i, 'gas stove burner cap'],
  [/\b(trempe|trempes|grade|grades)\b/i, 'gas stove grate'],
  [/\b(mangueira|mangueiras)\b/i, 'gas stove hose'],
  [/\b(cotovelo|niple|te|tê|adaptador)\b/i, 'gas fitting stove'],
  [/\b(cooktop)\b/i, 'gas cooktop part'],
  [/\b(forno|fornos)\b/i, 'gas oven part']
];

function getTechnicalQuery(rawQuery) {
  const raw = rawQuery.trim();
  const matches = technicalTerms
    .filter(([pattern]) => pattern.test(raw))
    .map(([, term]) => term);

  const generic = /\b(fogao|fogão|cooktop|forno|gas|gás)\b/i.test(raw)
    ? 'stove spare part'
    : 'gas stove spare part';

  return [...new Set([...matches, generic])].join(' ');
}

function resultScore(item, rawQuery) {
  const terms = normalizeText(rawQuery).split(/\s+/).filter((term) => term.length > 2);
  const haystack = normalizeText([
    item.title,
    item.creator,
    ...(item.tags || []).map((tag) => tag?.name || tag)
  ].join(' '));

  let score = 0;
  for (const term of terms) {
    if (haystack.includes(term)) score += 5;
  }
  if (item.category === 'photograph') score += 4;
  if (['flickr', 'stocksnap', 'wordpress'].includes(item.source)) score += 2;
  if (/stove|cooktop|oven|burner|gas|fogao|fogão|queimador|valve|injector|nozzle|thermocouple|igniter|knob/i.test(haystack)) score += 6;
  if (/museum|archive|histor|painting|illustration|drawing|portrait|manuscript|poster|antique|vintage/i.test(haystack)) score -= 10;
  return score;
}

async function fetchOpenverse(query, pageSize = 36) {
  const params = new URLSearchParams({
    q: query,
    page_size: String(pageSize),
    category: 'photograph',
    mature: 'false',
    excluded_source: 'wikimedia'
  });
  const response = await fetch(`https://api.openverse.org/v1/images/?${params.toString()}`);
  if (!response.ok) throw new Error(`Openverse respondeu ${response.status}`);
  const data = await response.json();
  return Array.isArray(data.results) ? data.results : [];
}

function mapOpenverseImage(item, query) {
  return {
    name: item.title || query,
    image_url: item.thumbnail || item.url,
    source_url: item.foreign_landing_url || item.detail_url || item.url,
    source_kind: `Openverse · ${item.provider || item.source || 'fonte aberta'}`,
    license: [item.license, item.license_version].filter(Boolean).join(' ').toUpperCase(),
    raw: item
  };
}

function renderResults(items) {
  const results = $('#web-image-results');
  if (!results) return;

  if (!items.length) {
    results.innerHTML = '<div class="empty-state">Nenhuma foto útil encontrada nesta busca. Tente um nome mais específico ou use Pinterest/Google Imagens.</div>';
    return;
  }

  results.innerHTML = items.map((item, index) => `
    <article class="web-image-card">
      <img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.name || 'Imagem de peça')}">
      <div>
        <b>${escapeHtml(item.name || 'Imagem')}</b>
        <small>${escapeHtml(item.source_kind || 'Openverse')}${item.license ? ` · ${escapeHtml(item.license)}` : ''}</small>
        <button type="button" data-enhanced-pick-image="${index}">Usar esta imagem</button>
      </div>
    </article>`).join('');

  $$('[data-enhanced-pick-image]').forEach((button) => {
    button.addEventListener('click', () => {
      const item = items[Number(button.dataset.enhancedPickImage)];
      const imageInput = $('#part-image-url');
      const sourceInput = $('#part-source-url');
      if (!item || !imageInput || !sourceInput) return;

      imageInput.value = item.image_url || '';
      sourceInput.value = item.source_url || '';
      imageInput.dispatchEvent(new Event('input', { bubbles: true }));
      $('#image-picker')?.classList.add('hidden');
      $('#part-form')?.classList.remove('hidden');
    });
  });
}

async function enhancedImageSearch() {
  const queryInput = $('#web-image-query');
  const results = $('#web-image-results');
  const rawQuery = queryInput?.value.trim() || '';
  if (!rawQuery || !results) return;

  results.innerHTML = '<div class="empty-state">Buscando fotos de peças e componentes…</div>';

  try {
    const technicalQuery = getTechnicalQuery(rawQuery);
    const query = `(${rawQuery}) | (${technicalQuery})`;
    let rawItems = await fetchOpenverse(query);

    if (rawItems.length < 8) {
      const fallback = await fetchOpenverse(`${rawQuery} ${technicalQuery}`, 24);
      rawItems = [...rawItems, ...fallback];
    }

    const unique = [];
    const seen = new Set();
    for (const item of rawItems) {
      const key = item.id || item.thumbnail || item.url;
      if (!key || seen.has(key) || (!item.thumbnail && !item.url)) continue;
      seen.add(key);
      unique.push(item);
    }

    const useful = unique
      .sort((a, b) => resultScore(b, rawQuery) - resultScore(a, rawQuery))
      .filter((item) => resultScore(item, rawQuery) > -3)
      .slice(0, 30)
      .map((item) => mapOpenverseImage(item, rawQuery));

    renderResults(useful);
  } catch (error) {
    console.error('Falha na busca de imagens Openverse:', error);
    results.innerHTML = '<div class="empty-state">A busca de fotos não respondeu. Use Pinterest ou Google Imagens e depois cole o link/fonte escolhida.</div>';
  }
}

function openExternalSearch(baseUrl) {
  const query = $('#web-image-query')?.value.trim() || $('#part-name')?.value.trim() || 'peças de fogão';
  window.open(`${baseUrl}${encodeURIComponent(query)}`, '_blank', 'noopener');
}

function enhanceImagePickerUi() {
  const searchButton = $('#search-web-images');
  const googleButton = $('#search-google-images');
  if (searchButton) searchButton.textContent = 'Pesquisar fotos';

  const picker = $('#image-picker');
  const info = picker?.querySelector('.image-search-row + p');
  if (info) {
    info.textContent = 'A busca interna prioriza fotos abertas de peças e componentes e não usa mais o Wikimedia. Pinterest e Google abrem uma pesquisa externa para encontrar modelos muito específicos.';
  }

  if (googleButton && !$('#search-pinterest-images')) {
    const pinterestButton = document.createElement('button');
    pinterestButton.id = 'search-pinterest-images';
    pinterestButton.type = 'button';
    pinterestButton.className = 'btn btn-light';
    pinterestButton.textContent = 'Pinterest ↗';
    pinterestButton.addEventListener('click', () => openExternalSearch('https://www.pinterest.com/search/pins/?q='));
    googleButton.insertAdjacentElement('afterend', pinterestButton);
  }
}

document.addEventListener('click', (event) => {
  if (event.target instanceof Element && event.target.closest('#search-web-images')) {
    event.preventDefault();
    event.stopImmediatePropagation();
    enhancedImageSearch();
  }
}, true);

enhanceImagePickerUi();
