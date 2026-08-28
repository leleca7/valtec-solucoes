// A Central Valtec usa texto e hierarquia visual, sem emojis como elementos de interface.
const VISUAL_TOKENS = [
  '🔒', '⌂', '👥', '🧾', '🔧', '📅', '📄', '🧩', '💰', '🛡', '📣', '🔐', '🕘',
  '💾', '🖨', '✓', '◎'
];

const tokenPattern = new RegExp(VISUAL_TOKENS.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gu');

function cleanTextNode(node) {
  if (!node?.nodeValue || !tokenPattern.test(node.nodeValue)) return;
  tokenPattern.lastIndex = 0;
  node.nodeValue = node.nodeValue.replace(tokenPattern, '').replace(/^\s{2,}/, ' ');
}

function cleanTree(root = document.body) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) cleanTextNode(node);

  document.querySelectorAll('.lead-nav-icon, .lead-empty-detail > span').forEach((element) => element.remove());
  document.querySelectorAll('#lead-status-filter option[value="contatado"]').forEach((option) => option.remove());
}

function boot() {
  cleanTree();
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) cleanTextNode(node);
        else if (node.nodeType === Node.ELEMENT_NODE) cleanTree(node);
      });
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
