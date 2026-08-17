let cachedClient;

export function getConfig() {
  return window.VALTEC_CONFIG || {};
}

export function isSupabaseConfigured() {
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = getConfig();
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}

export async function getSupabase() {
  if (!isSupabaseConfigured()) return null;
  if (cachedClient) return cachedClient;

  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.111.0?bundle');
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = getConfig();
  cachedClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  return cachedClient;
}

export async function trackEvent(eventName, metadata = {}) {
  try {
    const supabase = await getSupabase();
    if (!supabase) return;
    await supabase.from('analytics_events').insert({
      event_name: eventName,
      path: location.pathname,
      neighborhood: metadata.neighborhood || null,
      equipment: metadata.equipment || null,
      problem: metadata.problem || null,
      metadata
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
