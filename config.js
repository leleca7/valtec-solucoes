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
  // Arquivo novo para evitar que o navegador continue usando uma versão antiga em cache.
  const layoutHref = new URL('brand-layout-v2.css?v=20260817-1750', document.baseURI).href;
  if (!document.querySelector('link[data-valtec-layout-v2]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = layoutHref;
    link.dataset.valtecLayoutV2 = 'true';
    document.head.appendChild(link);
  }

  const officialLogo = new URL('assets/valtec-logo-oficial.png?v=20260817-1750', document.baseURI).href;
  const compactLogo = new URL('assets/valtec-simbolo-compacto.png?v=20260817-1750', document.baseURI).href;

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
    root.querySelectorAll?.('.site-header .brand-logo img, footer .footer-logo, .admin-brand img, .premium-login .brand-logo img').forEach(img => {
      if (img.src !== officialLogo) img.src = officialLogo;
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

  enforcePng();
  new MutationObserver(mutations => mutations.forEach(m => m.addedNodes.forEach(node => {
    if (node.nodeType === 1) enforcePng(node);
  }))).observe(document.documentElement, { childList: true, subtree: true });
})();
