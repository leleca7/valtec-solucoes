const WABA_ID = '4370597283251391';
const ONE_TIME_KEY = 'vltc-sub-20260921-x7Q9mK2p';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false });
  if (req.query?.key !== ONE_TIME_KEY) return res.status(401).json({ ok: false });

  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) return res.status(500).json({ ok: false, error: 'missing_token' });

  const response = await fetch(`https://graph.facebook.com/v26.0/${WABA_ID}/subscribed_apps`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });

  const data = await response.json().catch(() => ({}));
  return res.status(response.ok ? 200 : response.status).json({
    ok: response.ok,
    status: response.status,
    data
  });
}
