// Interface operacional de baixa complexidade. Nenhum dado é removido ou alterado.
const STORAGE_KEY='valtec_central_modo_v1';
const mainTabs=new Set(['dashboard','orders','clients','finance']);
const labels={dashboard:'Hoje',orders:'Serviços / OS',clients:'Clientes',finance:'Financeiro'};
const $=(q,r=document)=>r.querySelector(q);

function setupSimpleView() {
  const nav=$('.central-nav');
  if(!nav || $('#valtec-mode-toggle'))return;

  const toggle=document.createElement('button');
  toggle.type='button';
  toggle.id='valtec-mode-toggle';
  toggle.setAttribute('aria-label','Alternar entre a Central simples e todas as ferramentas');
  nav.append(toggle);
  let mode='simple';
  try {if(localStorage.getItem(STORAGE_KEY)==='complete') mode='complete';}catch{}
  const guide=$('.central-sidebar .side-help span');
  const originalGuide=guide?.textContent||'';

  const style=document.createElement('style');
  style.textContent=`
    /* Esconde apenas a navegação, preservando todas as abas e registros. */
    body.valtec-simple-mode .central-nav > button:not([data-valtec-simple-main]):not(#valtec-mode-toggle) {
      display:none !important;
    }
    body.valtec-simple-mode .central-nav:not(.show-advanced) > .central-advanced-option[data-valtec-simple-main] {
      display:block;
    }
    .central-nav #valtec-mode-toggle {
      margin-top:12px;
      border-top:1px solid #dce5ed;
      background:transparent;
      font-size:12px;
      opacity:.87;
    }
    body.valtec-simple-mode .central-sidebar .side-help strong {
      font-size:13px;
    }
  `;
  document.head.append(style);

  function update() {
    nav.querySelectorAll(':scope > button').forEach(button=>{
      if(button===toggle)return;
      const basic=mainTabs.has(button.dataset.adminTab)||button.id==='valtec-wa-shortcut';
      if(basic)button.setAttribute('data-valtec-simple-main','');
      else button.removeAttribute('data-valtec-simple-main');
      if(button.dataset.adminTab && labels[button.dataset.adminTab]){
        if(!button.hasAttribute('data-valtec-original-label'))button.dataset.valtecOriginalLabel=button.textContent;
        button.textContent=mode==='simple'?labels[button.dataset.adminTab]:button.dataset.valtecOriginalLabel;
      }
      if(button.id==='valtec-wa-shortcut'){
        if(!button.hasAttribute('data-valtec-original-label'))button.dataset.valtecOriginalLabel=button.textContent;
        button.textContent=mode==='simple'?'WhatsApp':button.dataset.valtecOriginalLabel;
      }
    });
    document.body.classList.toggle('valtec-simple-mode',mode==='simple');
    toggle.textContent=mode==='simple'?'Ver todas as ferramentas':'Voltar ao modo simples';
    toggle.setAttribute('aria-pressed',String(mode==='simple'));
    if(guide) guide.textContent=mode==='simple'
      ?'WhatsApp → registrar serviço → confirmar recebimento.':
      originalGuide;
  }

  toggle.addEventListener('click',()=>{
    mode=mode==='simple'?'complete':'simple';
    try {localStorage.setItem(STORAGE_KEY,mode);}catch{}
    // Ao retornar ao modo simples, volta à tela principal para evitar uma aba escondida.
    if(mode==='simple'){
      const visibleTab=$('[data-tab-panel].active')?.dataset.tabPanel;
      if(visibleTab && !mainTabs.has(visibleTab) && visibleTab!=='leads'){
        $('[data-admin-tab="dashboard"]')?.click();
      }
      nav.classList.remove('show-advanced');
      $('#central-more-toggle')?.setAttribute('aria-expanded','false');
    }
    update();
  });

  // Algumas opções são adicionadas depois por módulos de WhatsApp e relatórios.
  new MutationObserver(()=>update()).observe(nav,{childList:true});
  update();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setupSimpleView,{once:true});
else setupSimpleView();
