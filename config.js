// Este arquivo pode ficar no repositório: a publishable key do Supabase é própria para uso no cliente.
// Nunca coloque service_role ou sb_secret_* aqui.
window.VALTEC_CONFIG = {
  SUPABASE_URL: "https://msgwcwpvjgjtqhktuust.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_AByBURj4aHtdshWOqzIQCg_qpsHqDxz",
  WHATSAPP_NUMBER: "5571981954452",
  PHONE_NUMBER: "",
  // A autorização real dos administradores é validada no banco pelo perfil do usuário.
  // Mantemos vazio para permitir que os e-mails autorizados recebam o link de acesso.
  ADMIN_EMAIL_SHA256: ""
};

(() => {
  // Tipografia oficial definida para o site: Bebas Neue nos títulos e Montserrat nos textos.
  if (!document.querySelector('link[data-valtec-fonts]')) {
    const fonts = document.createElement('link');
    fonts.rel = 'stylesheet';
    fonts.href = 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Montserrat:wght@400;500;600;700;800&display=swap';
    fonts.dataset.valtecFonts = 'true';
    document.head.appendChild(fonts);
  }
  if (!document.querySelector('style[data-valtec-font-rules]')) {
    const fontRules = document.createElement('style');
    fontRules.dataset.valtecFontRules = 'true';
    fontRules.textContent = `
      body,button,input,textarea,select{font-family:'Montserrat',Arial,sans-serif}
      h1,h2,h3,.panel h1,.panel h2,.doc-title b,.doc-title strong,.side-label,.metric strong{font-family:'Bebas Neue',Impact,sans-serif;letter-spacing:.025em}
    `;
    document.head.appendChild(fontRules);
  }

  // Na home usamos uma correção dedicada e com cache-bust para garantir que a logo
  // apareça à esquerda do cabeçalho e do rodapé mesmo se estilos antigos estiverem em cache.
  if (document.body.classList.contains('lp-home')) {
    if (!document.querySelector('link[data-valtec-brand-visible-v4]')) {
      const brandFix = document.createElement('link');
      brandFix.rel = 'stylesheet';
      brandFix.href = new URL('brand-visible-v4.css?v=20260817-1848', document.baseURI).href;
      brandFix.dataset.valtecBrandVisibleV4 = 'true';
      document.head.appendChild(brandFix);
    }
  } else {
    // O layout de correção antigo continua nas telas internas, mas não interfere na nova home.
    const layoutHref = new URL('brand-layout-v2.css?v=20260817-1750', document.baseURI).href;
    if (!document.querySelector('link[data-valtec-layout-v2]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = layoutHref;
      link.dataset.valtecLayoutV2 = 'true';
      document.head.appendChild(link);
    }
  }

  const officialLogo = new URL('assets/valtec-logo-oficial.png?v=20260817-1848', document.baseURI).href;
  const compactLogo = new URL('assets/valtec-simbolo-compacto.png?v=20260817-1800', document.baseURI).href;

  const enforcePng = (root = document) => {
    if (root.nodeType === 1 && root.matches?.('img')) {
      const src = root.getAttribute('src') || '';
      if (/valtec-(logo|mark)\.svg(?:\?|$)/i.test(src)) root.setAttribute('src', officialLogo);
    }

    root.querySelectorAll?.('img').forEach(img => {
      const src = img.getAttribute('src') || '';
      if (/valtec-(logo|mark)\.svg(?:\?|$)/i.test(src)) img.setAttribute('src', officialLogo);
    });

    // Cabeçalho, rodapé e barra administrativa sempre usam a logo completa oficial.
    root.querySelectorAll?.('.site-header .brand-logo img, footer .footer-logo, footer .lp-footer-logo, .admin-brand img, .premium-login .brand-logo img').forEach(img => {
      if (!img.src.includes('valtec-logo-oficial.png')) img.src = officialLogo;
      img.style.display = 'block';
      img.style.opacity = '1';
      img.style.visibility = 'visible';
    });

    root.querySelectorAll?.('link[rel~="icon"]').forEach(link => {
      const href = link.getAttribute('href') || '';
      if (/valtec-(logo|mark)\.svg(?:\?|$)/i.test(href)) {
        link.setAttribute('href', compactLogo);
        link.setAttribute('type', 'image/png');
      }
    });
  };

  // Uma versão anterior da foto do fogão foi salva como texto base64 dentro do arquivo .webp.
  // Se o navegador detectar a imagem quebrada, recuperamos o conteúdo e o transformamos em imagem válida.
  const repairEquipmentPhoto = async () => {
    const img = document.querySelector('.lp-equipment-photo');
    if (!img || (img.complete && img.naturalWidth > 0)) return;
    try {
      const res = await fetch(img.getAttribute('src'), { cache: 'no-store' });
      const encoded = (await res.text()).trim();
      if (/^UklGR/i.test(encoded)) {
        img.src = `data:image/webp;base64,${encoded}`;
      }
    } catch (_) {}
  };

  enforcePng();
  repairEquipmentPhoto();
  window.addEventListener('load', repairEquipmentPhoto, { once: true });

  new MutationObserver(mutations => mutations.forEach(m => m.addedNodes.forEach(node => {
    if (node.nodeType === 1) enforcePng(node);
  }))).observe(document.documentElement, { childList: true, subtree: true });
})();
