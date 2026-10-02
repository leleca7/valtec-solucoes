let cachedClient;

export function getConfig() {
  return window.VALTEC_CONFIG || {};
}

export function isSupabaseConfigured() {
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = getConfig();
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}

function hardenAdminAuth(client) {
  if (!client || !/(^|\/)admin\.html$/.test(window.location.pathname)) return client;
  if (client.__valtecAdminAuthClosed) return client;

  const signInWithOtp = client.auth.signInWithOtp.bind(client.auth);
  client.auth.signInWithOtp = (credentials = {}) => {
    const { options = {}, ...identity } = credentials;
    return signInWithOtp({
      ...identity,
      options: {
        ...options,
        shouldCreateUser: false
      }
    });
  };

  Object.defineProperty(client, '__valtecAdminAuthClosed', {
    value: true,
    enumerable: false,
    configurable: false
  });

  return client;
}

export async function getSupabase() {
  if (!isSupabaseConfigured()) return null;
  if (cachedClient) return hardenAdminAuth(cachedClient);

  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.111.0?bundle');
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = getConfig();
  cachedClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  return hardenAdminAuth(cachedClient);
}


const ACQUISITION_STORAGE_KEY = 'valtec_acquisition_v1';

function safeReferrer(value = '') {
  try {
    if (!value) return '';
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return '';
  }
}

function referrerSource(value = '') {
  try {
    if (!value) return null;
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    const currentHost = typeof location !== 'undefined' ? location.hostname.replace(/^www\./, '').toLowerCase() : '';
    if (!host || host === currentHost) return null;
    if (host.includes('google.')) return { source: 'google', medium: 'organic' };
    if (host.includes('bing.com')) return { source: 'bing', medium: 'organic' };
    if (host.includes('duckduckgo.com')) return { source: 'duckduckgo', medium: 'organic' };
    if (host.includes('yahoo.')) return { source: 'yahoo', medium: 'organic' };
    if (host.includes('instagram.com')) return { source: 'instagram', medium: 'referral' };
    if (host.includes('facebook.com') || host.includes('fb.com')) return { source: 'facebook', medium: 'referral' };
    if (host.includes('tiktok.com')) return { source: 'tiktok', medium: 'referral' };
    return { source: host, medium: 'referral' };
  } catch {
    return null;
  }
}

export function getAcquisitionContext() {
  try {
    const storage = typeof sessionStorage !== 'undefined' ? sessionStorage : null;
    const saved = storage?.getItem(ACQUISITION_STORAGE_KEY);
    if (saved) return JSON.parse(saved);

    const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
    const referrer = typeof document !== 'undefined' ? document.referrer : '';
    const ref = referrerSource(referrer);

    let source = params.get('utm_source') || ref?.source || 'direct';
    let medium = params.get('utm_medium') || ref?.medium || 'none';

    const gclid = params.get('gclid') || '';
    const fbclid = params.get('fbclid') || '';
    if (gclid && !params.get('utm_source')) {
      source = 'google';
      medium = params.get('utm_medium') || 'cpc';
    }

    const context = {
      source: source.slice(0, 80),
      medium: medium.slice(0, 80),
      campaign: (params.get('utm_campaign') || '').slice(0, 160),
      term: (params.get('utm_term') || '').slice(0, 160),
      content: (params.get('utm_content') || '').slice(0, 160),
      gclid: gclid.slice(0, 200),
      fbclid: fbclid.slice(0, 200),
      landing_path: typeof location !== 'undefined' ? location.pathname : '',
      referrer: safeReferrer(referrer)
    };

    storage?.setItem(ACQUISITION_STORAGE_KEY, JSON.stringify(context));
    return context;
  } catch {
    return { source: 'direct', medium: 'none', campaign: '', term: '', content: '', gclid: '', fbclid: '', landing_path: '', referrer: '' };
  }
}

export function getLeadSource() {
  const acquisition = getAcquisitionContext();
  return `site:${acquisition.source}/${acquisition.medium}`.slice(0, 180);
}

export async function trackEvent(eventName, metadata = {}) {
  try {
    const supabase = await getSupabase();
    if (!supabase) return;
    const acquisition = getAcquisitionContext();
    const eventMetadata = { ...metadata, acquisition };
    await supabase.from('analytics_events').insert({
      event_name: eventName,
      path: location.pathname,
      neighborhood: metadata.neighborhood || null,
      equipment: metadata.equipment || null,
      problem: metadata.problem || null,
      metadata: eventMetadata
    });
  } catch (error) {
    console.debug('Analytics indisponível:', error?.message || error);
  }
}

export function normalizeText(value = '') {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}
