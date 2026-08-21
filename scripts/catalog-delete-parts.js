import { getSupabase } from './supabase.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const RETURN_TAB_KEY = 'valtec-admin-return-tab';

function notify(message, type = 'success') {
  const box = $('#central-message');
  if (!box) return;
  box.textContent = message;
  box.className = `notice ${type}`;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => box.classList.add('hidden'), 4500);
}

function installStyles() {
  if ($('#catalog-delete-parts-style')) return;
  const style = document.createElement('style');
  style.id = 'catalog-delete-parts-style';
  style.textContent = `
    .catalog-delete-button {
      color: #b42318 !important;
      border-color: rgba(180, 35, 24, .28) !important;
      background: #fff !important;
    }
    .catalog-delete-button:hover {
      background: #fff1f0 !important;
      border-color: rgba(180, 35, 24, .55) !important;
    }
    .catalog-delete-button:disabled {
      opacity: .55;
      cursor: wait;
    }
  `;
  document.head.appendChild(style);
}

function partInfoFromCard(card) {
  const editButton = $('[data-edit-part]', card);
  return {
    id: editButton?.dataset.editPart || '',
    name: $('h3', card)?.textContent?.trim() || 'esta peça'
  };
}

async function deletePart(card, button) {
  const { id, name } = partInfoFromCard(card);
  if (!id) return notify('Não foi possível identificar essa peça.', 'error');

  const confirmed = window.confirm(
    `Excluir “${name}” do catálogo?\n\nA peça deixará de aparecer, mas orçamentos antigos continuarão preservados.`
  );
  if (!confirmed) return;

  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = 'Excluindo…';

  try {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('Banco de dados indisponível.');

    // Exclusão lógica: mantém histórico e vínculos antigos, mas remove a peça do catálogo ativo.
    const { data, error } = await supabase
      .from('parts_catalog')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id');

    if (error) throw error;
    if (!data?.length) throw new Error('A peça não pôde ser alterada.');

    card.remove();
    const suggestion = $$('#parts-suggestions option').find((option) => option.value === name);
    suggestion?.remove();
    notify(`Peça “${name}” excluída do catálogo.`);

    // Recarrega os dados para que buscas e orçamentos também parem de sugerir a peça.
    sessionStorage.setItem(RETURN_TAB_KEY, 'catalog');
    setTimeout(() => location.reload(), 450);
  } catch (error) {
    console.error('Falha ao excluir peça do catálogo:', error);
    button.disabled = false;
    button.textContent = originalText;
    notify('Não foi possível excluir a peça. Tente novamente.', 'error');
  }
}

function enhanceCatalogCards(root = document) {
  $$('.catalog-card', root).forEach((card) => {
    const actions = $('.card-actions', card);
    if (!actions || $('.catalog-delete-button', actions)) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mini-button catalog-delete-button';
    button.textContent = 'Excluir';
    button.title = 'Excluir esta peça do catálogo';
    button.addEventListener('click', () => deletePart(card, button));
    actions.appendChild(button);
  });
}

function restoreCatalogTab() {
  if (sessionStorage.getItem(RETURN_TAB_KEY) !== 'catalog') return;
  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    const adminView = $('#admin-view');
    const catalogButton = $('[data-admin-tab="catalog"]');
    if (adminView && !adminView.classList.contains('hidden') && catalogButton) {
      clearInterval(timer);
      sessionStorage.removeItem(RETURN_TAB_KEY);
      catalogButton.click();
      return;
    }
    if (attempts >= 120) {
      clearInterval(timer);
      sessionStorage.removeItem(RETURN_TAB_KEY);
    }
  }, 100);
}

installStyles();
enhanceCatalogCards();
restoreCatalogTab();

new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (!(node instanceof Element)) continue;
      if (node.matches?.('.catalog-card') || node.querySelector?.('.catalog-card')) {
        enhanceCatalogCards(node.matches?.('.catalog-card') ? node.parentElement || node : node);
      }
    }
  }
}).observe(document.documentElement, { childList: true, subtree: true });
