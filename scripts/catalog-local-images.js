const FILE_INPUT_IDS = new Set(['part-gallery-file', 'part-camera-file']);
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_EDGE = 1600;
const OUTPUT_QUALITY = 0.82;

const $ = (selector, root = document) => root.querySelector(selector);

function notify(message, type = 'success') {
  const box = $('#central-message');
  if (!box) return;
  box.textContent = message;
  box.className = `notice ${type}`;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => box.classList.add('hidden'), 4500);
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Falha ao ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Formato de imagem não suportado pelo navegador.'));
    image.src = dataUrl;
  });
}

async function optimizeLocalImage(file) {
  if (!file.type?.startsWith('image/')) {
    throw new Error('Escolha um arquivo de imagem.');
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('A imagem é muito grande. Use um arquivo de até 12 MB.');
  }

  const originalDataUrl = await readAsDataUrl(file);
  const image = await loadImage(originalDataUrl);
  const largestEdge = Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height);
  const scale = largestEdge > MAX_IMAGE_EDGE ? MAX_IMAGE_EDGE / largestEdge : 1;
  const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
  const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return originalDataUrl;

  context.drawImage(image, 0, 0, width, height);
  const optimizedDataUrl = canvas.toDataURL('image/webp', OUTPUT_QUALITY);

  if (!optimizedDataUrl || optimizedDataUrl === 'data:,' || optimizedDataUrl.length >= originalDataUrl.length) {
    return originalDataUrl;
  }
  return optimizedDataUrl;
}

function setImageValue(dataUrl) {
  const imageUrlInput = $('#part-image-url');
  const sourceInput = $('#part-source-url');
  if (!imageUrlInput) return;

  imageUrlInput.value = dataUrl;
  if (sourceInput) sourceInput.value = 'Foto própria Valtec';
  imageUrlInput.dispatchEvent(new Event('input', { bubbles: true }));
}

async function handleLocalFile(file) {
  if (!file) return;
  notify('Preparando a imagem do arquivo…');
  try {
    const dataUrl = await optimizeLocalImage(file);
    setImageValue(dataUrl);
    notify('Imagem do arquivo pronta para salvar.');
  } catch (error) {
    notify(error?.message || 'Não foi possível usar essa imagem.', 'error');
  }
}

function enhanceCatalogImageUi() {
  const galleryInput = $('#part-gallery-file');
  const cameraInput = $('#part-camera-file');
  const tabs = galleryInput?.closest('.image-source-tabs');

  if (galleryInput) galleryInput.title = 'Escolher imagem do computador ou celular';
  if (cameraInput) cameraInput.title = 'Tirar uma foto com a câmera';

  const galleryLabel = galleryInput?.closest('label');
  if (galleryLabel && !galleryLabel.dataset.localImageEnhanced) {
    galleryLabel.dataset.localImageEnhanced = '1';
    const textNode = [...galleryLabel.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
    if (textNode) textNode.textContent = '📁 Arquivo ';
    if (tabs) tabs.prepend(galleryLabel);
  }

  const urlInput = $('#part-image-url');
  if (urlInput) {
    urlInput.placeholder = 'Opcional — use somente se quiser colar um link';
    const label = urlInput.closest('.field')?.querySelector('label');
    if (label) label.textContent = 'Link da imagem (opcional)';
  }

  const form = $('#part-form');
  if (form && !form.querySelector('[data-local-image-help]')) {
    const preview = $('#part-image-preview');
    const help = document.createElement('p');
    help.dataset.localImageHelp = '1';
    help.className = 'muted small';
    help.textContent = 'Você pode escolher uma foto direto do seu computador ou celular. O link é opcional.';
    preview?.before(help);
  }
}

// Intercepta o arquivo antes do listener antigo, que dependia do Storage privado.
document.addEventListener('change', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || !FILE_INPUT_IDS.has(target.id)) return;
  event.stopImmediatePropagation();
  handleLocalFile(target.files?.[0]);
}, true);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', enhanceCatalogImageUi, { once: true });
} else {
  enhanceCatalogImageUi();
}
