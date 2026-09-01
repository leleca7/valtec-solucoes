import { createHmac, timingSafeEqual } from 'node:crypto';

function env(name, { required = false, fallback = '' } = {}) {
  const value = String(process.env[name] || fallback).trim();
  if (required && !value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}

function supabaseUrl() {
  return env('SUPABASE_URL', { required: true }).replace(/\/$/, '');
}

function supabaseSecretKey() {
  return env('SUPABASE_SECRET_KEY', { fallback: process.env.SUPABASE_SERVICE_ROLE_KEY || '' }) || env('SUPABASE_SERVICE_ROLE_KEY', { required: true });
}

function supabasePublishableKey() {
  return env('SUPABASE_PUBLISHABLE_KEY', { fallback: process.env.SUPABASE_ANON_KEY || '' }) || env('SUPABASE_ANON_KEY', { required: true });
}

function adminHeaders(extra = {}) {
  const key = supabaseSecretKey();
  const headers = { apikey: key, ...extra };
  if (!key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${key}`;
  return headers;
}

async function parseResponse(response) {
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (!response.ok) {
    const message = data?.message || data?.msg || data?.error?.message || data?.error || text || `HTTP ${response.status}`;
    const error = new Error(String(message));
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return data;
}

async function dbRequest(path, { method = 'GET', body, prefer = '', headers = {} } = {}) {
  const response = await fetch(`${supabaseUrl()}/rest/v1/${path}`, {
    method,
    headers: adminHeaders({
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(prefer ? { Prefer: prefer } : {}),
      ...headers
    }),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return parseResponse(response);
}

async function selectRows(table, query = '') {
  return dbRequest(`${table}?${query}`);
}

async function insertRow(table, row, { onConflict = '', upsert = false } = {}) {
  const suffix = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : '';
  const prefer = `${upsert ? 'resolution=merge-duplicates,' : ''}return=representation`;
  const rows = await dbRequest(`${table}${suffix}`, { method: 'POST', body: row, prefer });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function updateRows(table, query, patch) {
  return dbRequest(`${table}?${query}`, { method: 'PATCH', body: patch, prefer: 'return=representation' });
}

function normalizePhone(value) {
  let phone = String(value || '').replace(/\D/g, '');
  if (phone && !phone.startsWith('55')) phone = `55${phone}`;
  return phone;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const POSITIVE_TERMS = [
  'obrigado', 'obrigada', 'muito obrigado', 'muito obrigada', 'perfeito', 'excelente',
  'recomendo', 'otimo', 'muito bom', 'ficou otimo', 'ficou perfeito', 'maravilhoso',
  'parabens', 'bom trabalho', 'excelente trabalho', 'servico excelente'
];

const HUMAN_SAFETY_TERMS = [
  'posso usar', 'posso continuar usando', 'e seguro', 'é seguro', 'cheiro de gas', 'vazamento',
  'vazando gas', 'explos', 'incend', 'faisca', 'fumaca', 'monoxido', 'risco', 'pegando fogo'
];

const HUMAN_PRICE_TERMS = [
  'quanto custa', 'qual o valor', 'preco da peca', 'valor da peca', 'trocar essa peca', 'trocar a peca'
];

function hasPositiveSignal(text) {
  const normalized = normalizeText(text);
  return Boolean(normalized) && POSITIVE_TERMS.some((term) => normalized.includes(term));
}

function needsTechnicalHuman(text) {
  const normalized = normalizeText(text);
  return Boolean(normalized) && [...HUMAN_SAFETY_TERMS, ...HUMAN_PRICE_TERMS].some((term) => normalized.includes(term));
}

function whatsappConfig() {
  return {
    token: env('WHATSAPP_ACCESS_TOKEN', { required: true }),
    phoneNumberId: env('WHATSAPP_PHONE_NUMBER_ID', { required: true }),
    graphVersion: env('WHATSAPP_GRAPH_VERSION', { required: true }),
    templateLanguage: env('WHATSAPP_TEMPLATE_LANGUAGE', { fallback: 'pt_BR' })
  };
}

async function graphRequest(path, { method = 'GET', body } = {}) {
  const config = whatsappConfig();
  const response = await fetch(`https://graph.facebook.com/${config.graphVersion}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return parseResponse(response);
}

async function sendWhatsAppText(to, body) {
  const config = whatsappConfig();
  const data = await graphRequest(`${config.phoneNumberId}/messages`, {
    method: 'POST',
    body: {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizePhone(to),
      type: 'text',
      text: { preview_url: false, body: String(body || '').trim() }
    }
  });
  return data?.messages?.[0]?.id || null;
}

async function sendWhatsAppTemplate(to, templateName) {
  const config = whatsappConfig();
  if (!templateName) throw new Error('Template do WhatsApp não configurado para esta automação.');
  const data = await graphRequest(`${config.phoneNumberId}/messages`, {
    method: 'POST',
    body: {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizePhone(to),
      type: 'template',
      template: {
        name: templateName,
        language: { code: config.templateLanguage }
      }
    }
  });
  return data?.messages?.[0]?.id || null;
}

function extractMessage(message) {
  const type = message?.type || 'unknown';
  const interactive = message?.interactive || {};
  const body = type === 'text' ? message?.text?.body
    : type === 'interactive' ? (interactive?.button_reply?.title || interactive?.list_reply?.title || interactive?.button_reply?.id || interactive?.list_reply?.id)
    : type === 'button' ? (message?.button?.text || message?.button?.payload)
    : type === 'image' ? message?.image?.caption
    : type === 'video' ? message?.video?.caption
    : type === 'document' ? (message?.document?.caption || message?.document?.filename)
    : '';
  const media = ['image', 'video', 'audio', 'document'].includes(type) ? message?.[type] : null;
  const mappedType = ['text', 'image', 'video', 'audio', 'document', 'location', 'interactive'].includes(type) ? type : 'unknown';
  return {
    type: mappedType,
    body: String(body || '').trim(),
    mediaId: media?.id || null,
    mimeType: media?.mime_type || null
  };
}

function previewForMessage({ type, body }) {
  if (body) return String(body).slice(0, 180);
  const labels = { image: 'Imagem recebida', video: 'Vídeo recebido', audio: 'Áudio recebido', document: 'Documento recebido', location: 'Localização recebida' };
  return labels[type] || 'Nova mensagem';
}

async function createLead({ name, phone }) {
  return insertRow('leads', {
    customer_name: name || 'Cliente WhatsApp',
    phone: normalizePhone(phone),
    equipment: 'A confirmar',
    problems: ['A confirmar'],
    neighborhood: 'A confirmar',
    source: 'whatsapp',
    status: 'novo',
    next_action: 'Concluir triagem iniciada pelo WhatsApp',
    next_action_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
  });
}

async function getOrCreateThread({ phone, name }) {
  const normalized = normalizePhone(phone);
  const rows = await selectRows('whatsapp_threads', `select=*&phone=eq.${encodeURIComponent(normalized)}&limit=1`);
  let thread = rows?.[0] || null;
  let created = false;

  if (thread?.status === 'closed') {
    const lead = await createLead({ name, phone: normalized });
    const updated = await updateRows('whatsapp_threads', `id=eq.${encodeURIComponent(thread.id)}`, {
      display_name: name || thread.display_name,
      lead_id: lead.id,
      client_id: null,
      status: 'bot',
      workflow_step: 'menu',
      human_required: false,
      human_reason: null,
      unread_count: 0,
      positive_signal: false,
      updated_at: new Date().toISOString()
    });
    thread = updated?.[0] || thread;
    created = true;
  }

  if (!thread) {
    const lead = await createLead({ name, phone: normalized });
    try {
      thread = await insertRow('whatsapp_threads', {
        phone: normalized,
        display_name: name || 'Cliente WhatsApp',
        lead_id: lead.id,
        status: 'bot',
        workflow_step: 'menu'
      });
      created = true;
    } catch (error) {
      if (error.status !== 409) throw error;
      const retry = await selectRows('whatsapp_threads', `select=*&phone=eq.${encodeURIComponent(normalized)}&limit=1`);
      thread = retry?.[0] || null;
    }
  } else if (name && name !== thread.display_name) {
    const updated = await updateRows('whatsapp_threads', `id=eq.${encodeURIComponent(thread.id)}`, {
      display_name: name,
      updated_at: new Date().toISOString()
    });
    thread = updated?.[0] || thread;
  }

  if (!thread) throw new Error('Não foi possível criar ou localizar a conversa do WhatsApp.');
  return { thread, created };
}

async function saveInbound({ thread, message, rawPayload }) {
  if (message.id) {
    const existing = await selectRows('whatsapp_messages', `select=id,thread_id&provider_message_id=eq.${encodeURIComponent(message.id)}&limit=1`);
    if (existing?.length) return { duplicate: true, row: existing[0] };
  }
  const extracted = extractMessage(message);
  const positive = hasPositiveSignal(extracted.body);
  const row = await insertRow('whatsapp_messages', {
    thread_id: thread.id,
    provider_message_id: message.id || null,
    direction: 'inbound',
    message_type: extracted.type,
    body: extracted.body || null,
    provider_media_id: extracted.mediaId,
    delivery_status: 'received',
    positive_signal: positive,
    raw_payload: rawPayload || {}
  });
  return { duplicate: false, row, extracted, positive };
}

async function saveOutbound({ threadId, providerMessageId, body, messageType = 'text', rawPayload = {} }) {
  return insertRow('whatsapp_messages', {
    thread_id: threadId,
    provider_message_id: providerMessageId || null,
    direction: 'outbound',
    message_type: messageType,
    body: body || null,
    delivery_status: providerMessageId ? 'sent' : 'queued',
    raw_payload: rawPayload
  });
}

function extensionFromMime(mimeType = '') {
  const clean = String(mimeType).split(';')[0].toLowerCase();
  const map = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
    'video/mp4': 'mp4', 'video/3gpp': '3gp',
    'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/aac': 'aac', 'audio/mp4': 'm4a',
    'application/pdf': 'pdf'
  };
  return map[clean] || 'bin';
}

async function persistWhatsAppMedia({ mediaId, threadId, messageId }) {
  if (!mediaId || !threadId || !messageId) return null;
  const meta = await graphRequest(String(mediaId));
  if (!meta?.url) throw new Error('O WhatsApp não retornou a URL da mídia.');
  const { token } = whatsappConfig();
  const mediaResponse = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } });
  if (!mediaResponse.ok) throw new Error(`Falha ao baixar mídia do WhatsApp: HTTP ${mediaResponse.status}`);
  const mimeType = meta.mime_type || mediaResponse.headers.get('content-type') || 'application/octet-stream';
  const bytes = Buffer.from(await mediaResponse.arrayBuffer());
  const safeMessage = String(messageId).replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `whatsapp/${threadId}/${safeMessage}.${extensionFromMime(mimeType)}`;
  const upload = await fetch(`${supabaseUrl()}/storage/v1/object/lead-media/${path}`, {
    method: 'POST',
    headers: adminHeaders({ 'Content-Type': mimeType, 'x-upsert': 'true' }),
    body: bytes
  });
  await parseResponse(upload);
  return path;
}

async function verifyAdminRequest(req) {
  const auth = String(req.headers?.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return null;
  const userResponse = await fetch(`${supabaseUrl()}/auth/v1/user`, {
    headers: {
      apikey: supabasePublishableKey(),
      Authorization: `Bearer ${token}`
    }
  });
  if (!userResponse.ok) return null;
  const user = await userResponse.json();
  if (!user?.id) return null;
  const profiles = await selectRows('admin_profiles', `select=user_id,display_name,active&user_id=eq.${encodeURIComponent(user.id)}&active=eq.true&limit=1`);
  return profiles?.[0] ? { user, profile: profiles[0] } : null;
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

async function readRawBody(req) {
  const chunks = [];
  try {
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  } catch {
    // Fallbacks abaixo cobrem runtimes que já materializaram o corpo.
  }
  if (chunks.length) return Buffer.concat(chunks);
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody;
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body, 'utf8');
  if (req.body && typeof req.body === 'object') return Buffer.from(JSON.stringify(req.body), 'utf8');
  throw new Error('Corpo bruto do webhook indisponível; verifique a configuração da função server-side.');
}

function verifyMetaSignature(rawBody, signatureHeader) {
  const secret = env('WHATSAPP_APP_SECRET', { required: true });
  const received = String(signatureHeader || '');
  if (!received.startsWith('sha256=')) return false;
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function findServiceArea(neighborhood) {
  const value = String(neighborhood || '').trim();
  if (!value) return null;
  const rows = await selectRows('service_areas', `select=neighborhood,priority,active&active=eq.true&neighborhood=ilike.*${encodeURIComponent(value)}*&limit=1`);
  return rows?.[0] || null;
}

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export {
  env,
  dbRequest,
  selectRows,
  insertRow,
  updateRows,
  normalizePhone,
  normalizeText,
  hasPositiveSignal,
  needsTechnicalHuman,
  whatsappConfig,
  sendWhatsAppText,
  sendWhatsAppTemplate,
  extractMessage,
  previewForMessage,
  getOrCreateThread,
  saveInbound,
  saveOutbound,
  persistWhatsAppMedia,
  verifyAdminRequest,
  readBody,
  readRawBody,
  verifyMetaSignature,
  findServiceArea,
  json
};
