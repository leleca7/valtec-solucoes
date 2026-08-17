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

// Compatibilidade da identidade visual: qualquer componente antigo que ainda crie
// uma referência às antigas logos SVG é automaticamente apontado para o PNG oficial.
// Isso também cobre as prévias de orçamento/recibo criadas via JavaScript.
(() => {
  const officialLogo = new URL('assets/valtec-logo-oficial.png', document.baseURI).href;
  const compactLogo = new URL('assets/valtec-simbolo-compacto.png', document.baseURI).href;

  const enforcePng = (root = document) => {
    if (root.nodeType === 1 && root.matches?.('img')) {
      const src = root.getAttribute('src') || '';
      if (/valtec-(logo|mark)\.svg(?:\?|$)/i.test(src)) root.setAttribute('src', officialLogo);
    }
    root.querySelectorAll?.('img').forEach(img => {
      const src = img.getAttribute('src') || '';
      if (/valtec-(logo|mark)\.svg(?:\?|$)/i.test(src)) img.setAttribute('src', officialLogo);
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
