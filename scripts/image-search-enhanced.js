const $ = (selector, root = document) => root.querySelector(selector);

function currentImageQuery() {
  return $('#web-image-query')?.value.trim()
    || $('#part-name')?.value.trim()
    || $('#catalog-search')?.value.trim()
    || 'peças de fogão';
}

function technicalQuery(rawQuery) {
  const raw = rawQuery.trim();
  const rules = [
    [/\b(bico|bicos).*\b(injetor|injetores)\b|\binjetor(?:es)?\b/i, 'bico injetor fogão gás peça reposição'],
    [/\b(queimador|queimadores|boca|bocas)\b/i, 'queimador boca fogão peça reposição'],
    [/\b(torneira|registro|registros|valvula|válvula|valvulas|válvulas)\b/i, 'válvula registro gás fogão peça reposição'],
    [/\b(termopar|termopares)\b/i, 'termopar fogão forno gás peça'],
    [/\b(vela|velas|ignicao|ignição|acendedor|acendedores)\b/i, 'vela ignição acendedor fogão peça'],
    [/\b(manipulo|manípulo|manipulos|manípulos|botao|botão|botoes|botões)\b/i, 'botão manípulo fogão peça reposição'],
    [/\b(espalhador|espalhadores|tampa queimador|tampa do queimador)\b/i, 'espalhador tampa queimador fogão peça'],
    [/\b(trempe|trempes|grade|grades)\b/i, 'trempe grade fogão peça reposição'],
    [/\b(mangueira|mangueiras)\b/i, 'mangueira gás fogão peça'],
    [/\b(cotovelo|niple|te|tê|adaptador)\b/i, 'conexão gás fogão peça'],
    [/\b(cooktop)\b/i, 'peça reposição cooktop gás'],
    [/\b(forno|fornos)\b/i, 'peça reposição forno gás']
  ];

  const additions = rules
    .filter(([pattern]) => pattern.test(raw))
    .map(([, value]) => value);

  return [...new Set([raw, ...additions, 'peça fogão reposição'])].join(' ');
}

function searchUrls(rawQuery) {
  const focused = technicalQuery(rawQuery);
  return [
    {
      key: 'google',
      icon: '🔎',
      name: 'Google Imagens',
      description: 'Melhor opção geral para encontrar a peça exata, marca e modelo.',
      url: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(focused)}`
    },
    {
      key: 'pinterest',
      icon: '📌',
      name: 'Pinterest',
      description: 'Bom para comparar formatos e identificar visualmente componentes.',
      url: `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(focused)}`
    },
    {
      key: 'mercadolivre',
      icon: '🧩',
      name: 'Mercado Livre',
      description: 'Útil para fotos de peças de reposição, códigos e compatibilidades.',
      url: `https://lista.mercadolivre.com.br/${encodeURIComponent(focused.replace(/\s+/g, '-'))}`
    },
    {
      key: 'shopee',
      icon: '🛒',
      name: 'Shopee',
      description: 'Outra fonte prática para peças específicas e diferentes ângulos da foto.',
      url: `https://shopee.com.br/search?keyword=${encodeURIComponent(focused)}`
    },
    {
      key: 'bing',
      icon: '🖼️',
      name: 'Bing Imagens',
      description: 'Alternativa quando Google ou Pinterest não encontram o modelo certo.',
      url: `https://www.bing.com/images/search?q=${encodeURIComponent(focused)}`
    }
  ];
}

function openUrl(url) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

function renderSearchSources() {
  const results = $('#web-image-results');
  if (!results) return;

  const rawQuery = currentImageQuery();
  const sources = searchUrls(rawQuery);

  results.innerHTML = `
    <div class="empty-state" style="text-align:left">
      <strong>Buscar fotos de “${rawQuery.replace(/[&<>"']/g, '')}”</strong><br>
      Escolha uma fonte abaixo. Para evitar foto quebrada no catálogo, prefira salvar a imagem e usar <b>Galeria</b>. No campo <b>Fonte da imagem</b>, guarde o link da página onde encontrou a foto.
    </div>
    ${sources.map((source) => `
      <article class="web-image-card">
        <div style="display:grid;place-items:center;min-height:110px;font-size:42px;background:#f7f8fa">${source.icon}</div>
        <div>
          <b>${source.name}</b>
          <small>${source.description}</small>
          <button type="button" data-image-search-source="${source.key}">Abrir busca ↗</button>
        </div>
      </article>
    `).join('')}
  `;

  results.querySelectorAll('[data-image-search-source]').forEach((button) => {
    button.addEventListener('click', () => {
      const source = sources.find((item) => item.key === button.dataset.imageSearchSource);
      if (source) openUrl(source.url);
    });
  });
}

function enhanceImagePickerUi() {
  const searchButton = $('#search-web-images');
  const googleButton = $('#search-google-images');
  const picker = $('#image-picker');
  const info = picker?.querySelector('.image-search-row + p');

  if (searchButton) searchButton.textContent = 'Buscar fotos';

  if (info) {
    info.textContent = 'A busca agora usa fontes próprias para encontrar peças reais: Google Imagens, Pinterest e marketplaces. Escolha a fonte, encontre a foto e salve pela Galeria ou registre o link da fonte.';
  }

  if (googleButton) {
    googleButton.textContent = 'Google Imagens ↗';
    googleButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const source = searchUrls(currentImageQuery()).find((item) => item.key === 'google');
      if (source) openUrl(source.url);
    }, true);
  }

  if (googleButton && !$('#search-pinterest-images')) {
    const pinterestButton = document.createElement('button');
    pinterestButton.id = 'search-pinterest-images';
    pinterestButton.type = 'button';
    pinterestButton.className = 'btn btn-light';
    pinterestButton.textContent = 'Pinterest ↗';
    pinterestButton.addEventListener('click', () => {
      const source = searchUrls(currentImageQuery()).find((item) => item.key === 'pinterest');
      if (source) openUrl(source.url);
    });
    googleButton.insertAdjacentElement('afterend', pinterestButton);
  }
}

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target.closest('#search-web-images') : null;
  if (!target) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  renderSearchSources();
}, true);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && event.target === $('#web-image-query')) {
    event.preventDefault();
    renderSearchSources();
  }
});

enhanceImagePickerUi();