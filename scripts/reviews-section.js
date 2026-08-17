(() => {
  if (!document.body.classList.contains('lp-home') || document.querySelector('#avaliacoes')) return;

  const reviews = [
    {
      name: 'Marcos Ferreira',
      tag: 'Pontualidade e resultado',
      text: 'Excelente profissional! Muito pontual, educado e resolveu o problema do fogão rapidamente. O serviço ficou impecável e com preço justo. Recomendo sem dúvidas!',
      featured: true
    },
    {
      name: 'Evanildes Barros',
      tag: 'Cliente recorrente',
      text: 'Serviço de qualidade. Com muito compromisso, respeito e competência. Sempre que preciso, solicito, e o atendimento é de imediato. Super recomendo.'
    },
    {
      name: 'Luis Roberto Lima',
      tag: 'Conserto que evitou troca',
      text: 'Excelente profissional. Estava pensando em trocar meu forno a gás da Venax, mas não precisou. Com o conserto e a manutenção ele voltou a funcionar como antes.'
    },
    {
      name: 'Chrystiane Almeida',
      tag: 'Serviço e preço justo',
      text: 'Atendimento maravilhoso! Serviço de primeira e preço justo. Não me arrependi de ter optado pelo serviço dele.'
    },
    {
      name: 'Danilo Camilo',
      tag: 'Confiança',
      text: 'Atendimento de excelência, comprometimento e honestidade! Super indico.'
    },
    {
      name: 'Saulo Lopes',
      tag: 'Rapidez e eficiência',
      text: 'Super indico. Resolveu meu problema com eficiência e rapidez. Nota 1.000!'
    }
  ];

  const section = document.createElement('section');
  section.className = 'lp-reviews';
  section.id = 'avaliacoes';
  section.setAttribute('aria-labelledby', 'avaliacoes-titulo');
  section.innerHTML = `
    <div class="container">
      <div class="lp-reviews-head">
        <div class="lp-reviews-title">
          <span class="lp-kicker">Experiências reais</span>
          <h2 id="avaliacoes-titulo">QUEM CHAMA A VALTEC RECOMENDA.</h2>
          <p>Selecionamos alguns relatos publicados por clientes no Google que mostram diferentes pontos do atendimento: qualidade, rapidez, preço justo, confiança e resultado técnico.</p>
        </div>
        <div class="lp-google-score" aria-label="Nota 4,8 de 5 no Google com 16 avaliações">
          <strong>4,8/5</strong>
          <span class="stars" aria-hidden="true">★★★★★</span>
          <span>16 avaliações no Google</span>
        </div>
      </div>
      <div class="lp-reviews-grid">
        ${reviews.map(r => `
          <article class="lp-review-card${r.featured ? ' featured' : ''}">
            <div class="lp-review-stars" aria-label="5 estrelas">★★★★★</div>
            <blockquote>“${r.text}”</blockquote>
            <div class="lp-review-meta">
              <div class="lp-review-person"><strong>${r.name}</strong><span>Avaliação no Google</span></div>
              <span class="lp-review-tag">${r.tag}</span>
            </div>
          </article>
        `).join('')}
      </div>
      <p class="lp-reviews-note">Avaliações selecionadas entre relatos reais publicados por clientes no perfil da Valtec no Google. Nota e quantidade de avaliações correspondem às informações fornecidas em 17/08/2026.</p>
    </div>`;

  const audiences = document.querySelector('.lp-audiences');
  const finalSection = document.querySelector('.lp-final');
  (audiences || finalSection || document.querySelector('main'))?.insertAdjacentElement(audiences ? 'beforebegin' : finalSection ? 'beforebegin' : 'beforeend', section);

  const nav = document.querySelector('.lp-header .nav');
  if (nav && !nav.querySelector('a[href="#avaliacoes"]')) {
    const link = document.createElement('a');
    link.href = '#avaliacoes';
    link.textContent = 'Avaliações';
    const admin = nav.querySelector('.admin-link');
    nav.insertBefore(link, admin || null);
  }
})();
