// A Central Valtec usa texto, tipografia e hierarquia visual; não usa emojis como elementos de interface.
const visualPattern = /(?:\p{Extended_Pictographic}|[\u2600-\u27BF]|[⌂◎])/gu;

function cleanTextNode(node) {
  if (!node?.nodeValue) return;
  const cleaned = node.nodeValue.replace(visualPattern, '').replace(/[ \t]{2,}/g, ' ');
  if (cleaned !== node.nodeValue) node.nodeValue = cleaned;
}

function cleanTree(root = document.body) {
  if (!root) return;
  if (root.nodeType === Node.TEXT_NODE) cleanTextNode(root);
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
