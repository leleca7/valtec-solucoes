// Este arquivo pode ficar no repositório: a publishable key do Supabase é própria para uso no cliente.
// Nunca coloque service_role ou sb_secret_* aqui.
window.VALTEC_CONFIG = {
  SUPABASE_URL: "https://msgwcwpvjgjtqhktuust.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_AByBURj4aHtdshWOqzIQCg_qpsHqDxz",
  WHATSAPP_NUMBER: "5571981954452",
  PHONE_NUMBER: "",
  ADMIN_EMAIL_SHA256: ""
};

(() => {
  const isLanding = document.body?.classList.contains('lp-home');
  const isAdmin = document.body?.classList.contains('admin-body');

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

  if (!isLanding && !document.querySelector('link[data-valtec-layout-v2]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = new URL('brand-layout-v2.css?v=20260817-1750', document.baseURI).href;
    link.dataset.valtecLayoutV2 = 'true';
    document.head.appendChild(link);
  }

  if (isLanding) {
    if (!document.querySelector('link[data-valtec-brand-visible-v4]')) {
      const brandFix = document.createElement('link');
      brandFix.rel = 'stylesheet';
      brandFix.href = new URL('brand-visible-v4.css?v=20260817-1858', document.baseURI).href;
      brandFix.dataset.valtecBrandVisibleV4 = 'true';
      document.head.appendChild(brandFix);
    }
    if (!document.querySelector('link[data-valtec-reviews]')) {
      const reviewsCss = document.createElement('link');
      reviewsCss.rel = 'stylesheet';
      reviewsCss.href = new URL('reviews-section.css?v=20260817-1904', document.baseURI).href;
      reviewsCss.dataset.valtecReviews = 'true';
      document.head.appendChild(reviewsCss);
    }
    if (!document.querySelector('script[data-valtec-reviews]')) {
      const reviewsScript = document.createElement('script');
      reviewsScript.src = new URL('scripts/reviews-section.js?v=20260817-1904', document.baseURI).href;
      reviewsScript.defer = true;
      reviewsScript.dataset.valtecReviews = 'true';
      document.head.appendChild(reviewsScript);
    }
  }

  if (!document.querySelector('link[data-valtec-brand-final-v6]')) {
    const finalBrand = document.createElement('link');
    finalBrand.rel = 'stylesheet';
    finalBrand.href = new URL('brand-final-v6.css?v=20260817-2235', document.baseURI).href;
    finalBrand.dataset.valtecBrandFinalV6 = 'true';
    document.head.appendChild(finalBrand);
  }

  const officialLogo = new URL('assets/valtec-logo-oficial.png?v=20260817-2235', document.baseURI).href;
  const compactLogo = new URL('assets/valtec-simbolo-compacto.png?v=20260817-1800', document.baseURI).href;
  const equipmentPhoto = new URL('assets/fogao-chama-azul.webp?v=20260817-2235', document.baseURI).href;

  const removePublicAdminAccess = (root = document) => {
    if (isAdmin) return;
    root.querySelectorAll?.('.admin-link,.admin-fab,a[href="admin.html"]').forEach((el) => {
      if (!el.classList.contains('brand-logo')) el.remove();
    });
  };

  const enforceBrand = (root = document) => {
    root.querySelectorAll?.('img').forEach((img) => {
      const src = img.getAttribute('src') || '';
      if (/valtec-(logo|mark)\.svg(?:\?|$)/i.test(src)) img.src = officialLogo;
    });

    root.querySelectorAll?.('.site-header .brand-logo img,.lp-header .brand-logo img,footer .footer-logo,footer .lp-footer-logo,.admin-brand img,.premium-login .brand-logo img,.lp-card-logo').forEach((img) => {
      img.src = officialLogo;
      img.style.setProperty('display', 'block', 'important');
      img.style.setProperty('opacity', '1', 'important');
      img.style.setProperty('visibility', 'visible', 'important');
      img.style.setProperty('position', 'static', 'important');
      img.style.setProperty('transform', 'none', 'important');
      img.style.setProperty('clip-path', 'none', 'important');
    });

    root.querySelectorAll?.('.lp-equipment-photo').forEach((img) => {
      img.src = equipmentPhoto;
      img.style.setProperty('display', 'block', 'important');
      img.style.setProperty('opacity', '1', 'important');
      img.style.setProperty('visibility', 'visible', 'important');
    });

    root.querySelectorAll?.('link[rel~="icon"]').forEach((link) => {
      const href = link.getAttribute('href') || '';
      if (/valtec-(logo|mark)\.svg(?:\?|$)/i.test(href)) {
        link.href = compactLogo;
        link.type = 'image/png';
      }
    });

    removePublicAdminAccess(root);
  };

  enforceBrand();

  if (isAdmin) {
    const form = document.querySelector('#login-form');
    if (form) form.dataset.bound = '1';
    document.querySelector('#demo-button')?.remove();
    if (!document.querySelector('script[data-valtec-admin-access-v2]')) {
      const adminAccess = document.createElement('script');
      adminAccess.type = 'module';
      adminAccess.src = new URL('scripts/admin-access-v2.js?v=20260817-2235', document.baseURI).href;
      adminAccess.dataset.valtecAdminAccessV2 = 'true';
      document.head.appendChild(adminAccess);
    }
  }

  new MutationObserver((mutations) => mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
    if (node.nodeType === 1) enforceBrand(node);
  }))).observe(document.documentElement, { childList: true, subtree: true });
})();
