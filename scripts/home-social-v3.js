(() => {
  const instagramUrl = 'https://www.instagram.com/valtec_solucoess/';
  const neighborhoods = ['Boca do Rio','Costa Azul','Imbuí','STIEP','Pituaçu','Armação','Pituba','Caminho das Árvores','Itaigara','Piatã'];

  if (!document.querySelector('link[data-valtec-social-v3]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'social-home-v3.css?v=20260817-1816';
    link.dataset.valtecSocialV3 = 'true';
    document.head.appendChild(link);
  }

  const areaText = document.querySelector('.lp-area-visual > p');
  if (areaText) areaText.textContent = 'Boca do Rio, Costa Azul, Imbuí, STIEP, Pituaçu, Armação, Pituba, Caminho das Árvores, Itaigara, Piatã e outras regiões mediante disponibilidade.';

  const neighborhoodList = document.querySelector('.lp-map-neighborhoods');
  if (neighborhoodList) neighborhoodList.innerHTML = neighborhoods.map(name => `<span>${name}</span>`).join('');

  const nav = document.querySelector('.lp-header .nav');
  if (nav && !nav.querySelector('a[href="#instagram"]')) {
    const link = document.createElement('a');
    link.href = '#instagram';
    link.textContent = 'Instagram';
    const admin = nav.querySelector('.admin-link');
    nav.insertBefore(link, admin || null);
  }

  const finalSection = document.querySelector('.lp-final');
  if (finalSection && !document.querySelector('#instagram')) {
    const section = document.createElement('section');
    section.className = 'lp-instagram';
    section.id = 'instagram';
    section.innerHTML = `
      <div class="container lp-instagram-shell">
        <div class="lp-instagram-copy">
          <span class="lp-kicker">Trabalhos recentes</span>
          <h2>ACOMPANHE A VALTEC <span>NO INSTAGRAM.</span></h2>
          <p>Veja serviços, bastidores, peças, manutenções e dicas publicadas pela Valtec. O quadro ao lado usa o perfil oficial e acompanha as atualizações do Instagram quando a incorporação pública estiver habilitada na conta.</p>
          <a class="btn btn-primary" href="${instagramUrl}" target="_blank" rel="noopener noreferrer">Abrir Instagram</a>
          <span class="lp-instagram-handle">◎ @valtec_solucoess</span>
        </div>
        <div class="lp-instagram-card">
          <blockquote class="instagram-media" data-instgrm-permalink="${instagramUrl}" data-instgrm-version="14" style="width:100%;max-width:660px;min-width:326px;margin:0 auto;">
            <div class="lp-instagram-fallback"><div><strong>Valtec Soluções no Instagram</strong><br><br><a href="${instagramUrl}" target="_blank" rel="noopener noreferrer">Ver publicações recentes →</a></div></div>
          </blockquote>
        </div>
      </div>`;
    finalSection.before(section);
  }

  const processEmbed = () => window.instgrm?.Embeds?.process?.();
  if (!document.querySelector('script[data-valtec-instagram-embed]')) {
    const script = document.createElement('script');
    script.async = true;
    script.defer = true;
    script.src = 'https://www.instagram.com/embed.js';
    script.dataset.valtecInstagramEmbed = 'true';
    script.onload = processEmbed;
    document.body.appendChild(script);
  } else {
    processEmbed();
  }
})();
